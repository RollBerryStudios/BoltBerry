import { RefObject, useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect, memo } from 'react'
import { Layer, Group, Image as KonvaImage, Rect, Text, Circle, Line } from 'react-konva'
import { Html } from 'react-konva-utils'
import Konva from 'konva'
import { useTokenStore } from '../../stores/tokenStore'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useUndoStore, nextCommandId, registerUndoAction } from '../../stores/undoStore'
import { useWallStore } from '../../stores/wallStore'
import { computeVisibilityPolygon } from '../../utils/losEngine'
import type { MapRecord, TokenRecord } from '@shared/ipc-types'
import { useImage } from '../../hooks/useImage'
import { findMonsterSlugByName } from '../bestiary/actions'
import { showToast } from '../shared/Toast'

function factionColor(faction: string): string {
  switch (faction) {
    case 'enemy': return '#ef4444'
    case 'neutral': return '#f59e0b'
    case 'friendly': return '#3b82f6'
    default: return '#22c55e'
  }
}

const STATUS_EFFECTS = [
  { id: 'blinded',       icon: '🫣', label: 'Blind' },
  { id: 'charmed',       icon: '💫', label: 'Bezaubert' },
  { id: 'dead',          icon: '💀', label: 'Tot' },
  { id: 'deafened',      icon: '🔇', label: 'Taub' },
  { id: 'exhausted',     icon: '😫', label: 'Erschöpft' },
  { id: 'frightened',    icon: '😱', label: 'Verängstigt' },
  { id: 'grappled',      icon: '🤝', label: 'Gepackt' },
  { id: 'incapacitated', icon: '😵', label: 'Kampfunfähig' },
  { id: 'invisible',     icon: '👻', label: 'Unsichtbar' },
  { id: 'paralyzed',     icon: '⚡', label: 'Gelähmt' },
  { id: 'petrified',     icon: '🪨', label: 'Versteinert' },
  { id: 'poisoned',      icon: '●', label: 'Vergiftet' },
  { id: 'prone',         icon: '●', label: 'Liegend' },
  { id: 'restrained',    icon: '●', label: 'Gefesselt' },
  { id: 'stunned',       icon: '●', label: 'Betäubt' },
  { id: 'unconscious',   icon: '💤', label: 'Bewusstlos' },
  { id: 'advantage',     icon: '▲', label: 'Vorteil' },
  { id: 'disadvantage',  icon: '▼', label: 'Nachteil' },
  { id: 'concentrating', icon: '🎭¯', label: 'Konzentration' },
  { id: 'blessed',       icon: '✨', label: 'Gesegnet' },
  { id: 'cursed',        icon: '🔮', label: 'Verflucht' },
  { id: 'hasted',        icon: '⚡', label: 'Verlangsamt' },
]

const STATUS_ICON_MAP: Record<string, string> = Object.fromEntries(STATUS_EFFECTS.map(e => [e.id, e.icon]))

interface TokenLayerProps {
  map: MapRecord
  stageRef: RefObject<Konva.Stage>
}

interface ContextMenu {
  visible: boolean
  x: number
  y: number
  tokenId: number
}

export function TokenLayer({ map, stageRef }: TokenLayerProps) {
  const tokens = useTokenStore((s) => s.tokens)
  const moveToken = useTokenStore((s) => s.moveToken)
  const updateToken = useTokenStore((s) => s.updateToken)
  const removeToken = useTokenStore((s) => s.removeToken)
  const activeTool = useUIStore((s) => s.activeTool)
  const selectedTokenId = useUIStore((s) => s.selectedTokenId)
  const selectedTokenIds = useUIStore((s) => s.selectedTokenIds)
  const setSelectedToken = useUIStore((s) => s.setSelectedToken)
  const toggleTokenInSelection = useUIStore((s) => s.toggleTokenInSelection)
  const setSelectedTokens = useUIStore((s) => s.setSelectedTokens)
  const clearTokenSelection = useUIStore((s) => s.clearTokenSelection)
  const gridSnap = useUIStore((s) => s.gridSnap)
  const clipboardTokens = useUIStore((s) => s.clipboardTokens)
  const setClipboardTokens = useUIStore((s) => s.setClipboardTokens)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ visible: false, x: 0, y: 0, tokenId: -1 })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editingHpId, setEditingHpId] = useState<number | null>(null)
  const [editHpCurrent, setEditHpCurrent] = useState('')
  const [editHpMax, setEditHpMax] = useState('')
  const [editingAcId, setEditingAcId] = useState<number | null>(null)
  const [editAc, setEditAc] = useState('')
  const [markerSubmenuId, setMarkerSubmenuId] = useState<number | null>(null)
  const [submenuType, setSubmenuType] = useState<string | null>(null)
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [notesEditState, setNotesEditState] = useState<{ tokenId: number; screenX: number; screenY: number; value: string } | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; sizePx: number } | null>(null)

  // Ref for values read by stable callbacks (avoids recreating closures on every render)
  const latestRef = useRef({ tokens, selectedTokenIds, scale, offsetX, offsetY, gridSnap, map, editName, editHpCurrent, editHpMax, editAc })
  latestRef.current = { tokens, selectedTokenIds, scale, offsetX, offsetY, gridSnap, map, editName, editHpCurrent, editHpMax, editAc }

  // Ref to setGhostPos so stable callbacks can update it without recreating
  const setGhostPosRef = useRef(setGhostPos)
  setGhostPosRef.current = setGhostPos

  // Guard against rapid double-paste from context menu
  const pasteInProgressRef = useRef(false)

  // Ref-based context menu visibility for the wheel handler (avoids re-registering on every open/close)
  const contextMenuVisibleRef = useRef(false)
  contextMenuVisibleRef.current = contextMenu.visible

  // ”€”€ Viewport clamping for the context menu ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
  // The menu is position:fixed at the click's raw (x, y). When the click
  // happens near the right / bottom edge, the menu can spill off-screen.
  // We measure it after mount and shift it back into view, with an 8 px
  // safety margin so the rounded corners don't touch the viewport edge.
  // While the measurement hasn't happened yet we hide the menu via
  // `visibility:hidden` to avoid a single-frame flash at the raw coords.
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuClamp, setMenuClamp] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (!contextMenu.visible) { setMenuClamp(null); return }
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const PAD = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = contextMenu.x
    let y = contextMenu.y
    if (x + rect.width  > vw - PAD) x = Math.max(PAD, vw - rect.width  - PAD)
    if (y + rect.height > vh - PAD) y = Math.max(PAD, vh - rect.height - PAD)
    setMenuClamp({ x, y })
  }, [contextMenu.visible, contextMenu.x, contextMenu.y, contextMenu.tokenId, markerSubmenuId, submenuType])

  // Defined early so the wheel useEffect below can safely list it as a dependency.
  const closeContextMenu = useCallback(() => {
    setContextMenu((m) => ({ ...m, visible: false }))
    setMarkerSubmenuId(null)
    setSubmenuType(null)
  }, [])

  // Close the context menu when the user scrolls (pans) the canvas
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const container = stage.container()
    const onWheel = () => { if (contextMenuVisibleRef.current) closeContextMenu() }
    container.addEventListener('wheel', onWheel, { passive: true })
    return () => container.removeEventListener('wheel', onWheel)
  }, [closeContextMenu])

  // Cancel any pending drag-broadcast rAF on unmount so the callback
  // doesn't fire against a destroyed component.
  useEffect(() => () => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    dragPendingRef.current = null
  }, [])

  // Close the context menu on Escape or any click outside the menu
  useEffect(() => {
    if (!contextMenu.visible) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    const onMouseDown = (e: MouseEvent) => {
      const menuEl = document.querySelector('[data-token-context-menu]')
      if (menuEl && !menuEl.contains(e.target as Node)) closeContextMenu()
    }
    window.addEventListener('keydown', onKeyDown)
    // Use capture so this fires before the Konva/React event tree
    window.addEventListener('mousedown', onMouseDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown, { capture: true })
    }
  }, [contextMenu.visible, closeContextMenu])

  const isDraggable = activeTool === 'select'
  const sortedTokens = useMemo(() => [...tokens].sort((a, b) => a.zIndex - b.zIndex), [tokens])

  // Coalesces drag broadcasts to once per animation frame instead of the
  // old 100 ms (10 Hz) wall-clock throttle. rAF aligns the IPC with
  // actual repaints, so the player window advances at the same cadence
  // the DM sees locally — addresses audit #54.
  const dragRafRef = useRef<number | null>(null)
  const dragPendingRef = useRef<{ tokens: TokenRecord[] } | null>(null)

  // Throttled live-position broadcast during drag (100 ms interval)
  const stableHandleDragMove = useCallback((token: TokenRecord, e: Konva.KonvaEventObject<DragEvent>) => {
    const { tokens, selectedTokenIds, scale, offsetX, offsetY, gridSnap, map } = latestRef.current
    const sx = e.target.x()
    const sy = e.target.y()

    // Ghost snap preview: update snapped position indicator
    if (gridSnap && map.gridType !== 'none') {
      const mapX = (sx - offsetX) / scale
      const mapY = (sy - offsetY) / scale
      const snappedX = Math.round(mapX / map.gridSize) * map.gridSize
      const snappedY = Math.round(mapY / map.gridSize) * map.gridSize
      const sizePx = map.gridSize * token.size * scale
      setGhostPosRef.current({ x: snappedX * scale + offsetX, y: snappedY * scale + offsetY, sizePx })
    } else {
      setGhostPosRef.current(null)
    }

    // Compute the latest live snapshot and queue it for the next animation
    // frame. If another drag-move lands before the rAF fires we simply
    // overwrite the pending payload — the renderer only needs the newest
    // frame, not a backlog.
    const liveX = (sx - offsetX) / scale
    const liveY = (sy - offsetY) / scale
    const idsToMove = selectedTokenIds.includes(token.id) ? selectedTokenIds : [token.id]
    const dx = liveX - token.x
    const dy = liveY - token.y
    const liveTokens = tokens.map((t) =>
      idsToMove.includes(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t
    )
    dragPendingRef.current = { tokens: liveTokens }
    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null
        const payload = dragPendingRef.current
        dragPendingRef.current = null
        if (payload) broadcastTokens(payload.tokens)
      })
    }
  }, [])

  const stableHandleDragEnd = useCallback(async (token: TokenRecord, e: Konva.KonvaEventObject<DragEvent>) => {
    // Clear ghost preview
    setGhostPosRef.current(null)

    const { tokens, selectedTokenIds, scale, offsetX, offsetY, gridSnap, map } = latestRef.current
    const sx = e.target.x()
    const sy = e.target.y()
    const dx = sx - (token.x * scale + offsetX)
    const dy = sy - (token.y * scale + offsetY)
    const dmx = dx / scale
    const dmy = dy / scale

    if (Math.abs(dmx) < 0.5 && Math.abs(dmy) < 0.5) return

    const shouldSnap = gridSnap && map.gridType !== 'none'
    const idsToMove = selectedTokenIds.includes(token.id) ? selectedTokenIds : [token.id]

    const oldPositions = idsToMove.map((id) => {
      const t = tokens.find((tok) => tok.id === id)
      return t ? { id, x: t.x, y: t.y } : null
    }).filter(Boolean) as Array<{ id: number; x: number; y: number }>

    const newPositions: Array<{ id: number; x: number; y: number }> = []

    for (const id of idsToMove) {
      const t = tokens.find((tok) => tok.id === id)
      if (!t) continue
      let newX = t.x + dmx
      let newY = t.y + dmy
      if (shouldSnap) {
        newX = Math.round(newX / map.gridSize) * map.gridSize
        newY = Math.round(newY / map.gridSize) * map.gridSize
      }
      moveToken(id, newX, newY)
      newPositions.push({ id, x: newX, y: newY })
      try {
        await window.electronAPI?.tokens.update(id, { x: newX, y: newY })
      } catch (err) {
        console.error('[TokenLayer] handleDragEnd failed:', err)
      }
    }

    if (shouldSnap && idsToMove.length === 1) {
      const snappedX = Math.round(((sx - offsetX) / scale) / map.gridSize) * map.gridSize
      const snappedY = Math.round(((sy - offsetY) / scale) / map.gridSize) * map.gridSize
      e.target.position({ x: snappedX * scale + offsetX, y: snappedY * scale + offsetY })
    }

    broadcastTokens(useTokenStore.getState().tokens)

    // ”€”€ LOS fog reveal for light-emitting tokens ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    {
      const { imgW, imgH } = useMapTransformStore.getState()
      const walls = useWallStore.getState().walls
      const updatedTokens = useTokenStore.getState().tokens
      for (const pos of newPositions) {
        const t = updatedTokens.find((tok) => tok.id === pos.id)
        if (!t || t.lightRadius <= 0) continue
        const halfSize = (t.size * latestRef.current.map.gridSize) / 2
        const cx = pos.x + halfSize
        const cy = pos.y + halfSize
        const radiusPx = t.lightRadius * latestRef.current.map.gridSize
        const poly = computeVisibilityPolygon(cx, cy, radiusPx, walls, imgW, imgH)
        if (poly.length >= 6) {
          document.getElementById('root')?.dispatchEvent(
            new CustomEvent('fog:los-reveal', { detail: { poly } })
          )
        }
      }
    }

    // Declarative Action form (AP-5). The forward/backward handlers
    // are registered once at module scope (`registerUndoAction`) and
    // the payload is pure JSON — the stack can be serialized and
    // replayed after a crash, not just for this action but whenever
    // more callsites migrate.
    const payload: TokenMovePayload = {
      positions: idsToMove.map((id, i) => ({
        id,
        from: { x: oldPositions[i].x, y: oldPositions[i].y },
        to:   { x: newPositions[i].x, y: newPositions[i].y },
      })),
    }
    // The forward (move-to-new) already ran during the drag — the store
    // and DB are already at the target position. Skip the forward
    // replay by pushing the Command directly via the registry-derived
    // wrapper in `actionToCommand`; `pushAction` would redo the move.
    useUndoStore.getState().pushCommand({
      id: nextCommandId(),
      label: payload.positions.length === 1 ? 'Move token' : `Move ${payload.positions.length} tokens`,
      action: { type: 'token.move', payload },
      undo: async () => {
        for (const entry of payload.positions) {
          useTokenStore.getState().moveToken(entry.id, entry.from.x, entry.from.y)
        }
        await window.electronAPI?.tokens.updateMany(
          payload.positions.map((e) => ({ id: e.id, patch: { x: e.from.x, y: e.from.y } })),
        )
        broadcastTokens(useTokenStore.getState().tokens)
      },
      redo: async () => {
        for (const entry of payload.positions) {
          useTokenStore.getState().moveToken(entry.id, entry.to.x, entry.to.y)
        }
        await window.electronAPI?.tokens.updateMany(
          payload.positions.map((e) => ({ id: e.id, patch: { x: e.to.x, y: e.to.y } })),
        )
        broadcastTokens(useTokenStore.getState().tokens)
      },
    })
  }, [moveToken])

  const stableHandleContextMenu = useCallback((token: TokenRecord, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.container().getBoundingClientRect()
    if (!latestRef.current.selectedTokenIds.includes(token.id)) {
      setSelectedToken(token.id)
    }
    setContextMenu({
      visible: true,
      x: e.evt.clientX - pos.left,
      y: e.evt.clientY - pos.top,
      tokenId: token.id,
    })
  }, [setSelectedToken])

  function handleLayerMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (activeTool !== 'select') return
    if (e.target !== e.target.getStage()) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setRubberBand({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
  }

  function handleLayerMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!rubberBand) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setRubberBand((rb) => rb ? { ...rb, x2: pos.x, y2: pos.y } : null)
  }

  function handleLayerMouseUp() {
    if (!rubberBand) return
    const { x1, y1, x2, y2 } = rubberBand
    const left = Math.min(x1, x2)
    const top = Math.min(y1, y2)
    const right = Math.max(x1, x2)
    const bottom = Math.max(y1, y2)

    if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
      const hitIds: number[] = []
      for (const token of tokens) {
        const sx = token.x * scale + offsetX
        const sy = token.y * scale + offsetY
        const sz = map.gridSize * token.size * scale
        const cx = sx + sz / 2
        const cy = sy + sz / 2
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
          hitIds.push(token.id)
        }
      }
      if (hitIds.length > 0) {
        setSelectedTokens(hitIds)
      } else {
        clearTokenSelection()
      }
    } else {
      clearTokenSelection()
    }
    setRubberBand(null)
  }

  const stableStartEdit = useCallback((token: TokenRecord) => {
    setEditingId(token.id)
    setEditName(token.name)
    closeContextMenu()
  }, [closeContextMenu])

  function startEditHp(token: TokenRecord) {
    setEditingHpId(token.id)
    setEditHpCurrent(String(token.hpCurrent))
    setEditHpMax(String(token.hpMax))
    closeContextMenu()
  }

  function startEditAc(token: TokenRecord) {
    setEditingAcId(token.id)
    setEditAc(token.ac != null ? String(token.ac) : '')
    closeContextMenu()
  }

  const handleUpdate = useCallback((id: number, updates: Record<string, any>) => {
    // Capture the prior values for each updated key so the action is
    // reversible. Without this, quick-damage in the context menu during
    // combat (the DM's most-used destructive action) was one-way — a
    // mis-click couldn't be undone. Every write that routes through
    // handleUpdate now contributes an undo entry.
    const token = useTokenStore.getState().tokens.find((t) => t.id === id)
    if (!token) return
    const oldValues: Record<string, any> = {}
    for (const key of Object.keys(updates)) {
      oldValues[key] = (token as any)[key]
    }

    const applyForward = async () => {
      updateToken(id, updates)
      try {
        await window.electronAPI?.tokens.update(id, updates)
        broadcastTokens(useTokenStore.getState().tokens)
      } catch (err) {
        console.error('[TokenLayer] handleUpdate failed:', err)
      }
    }

    const applyBackward = async () => {
      updateToken(id, oldValues)
      try {
        await window.electronAPI?.tokens.update(id, oldValues)
        broadcastTokens(useTokenStore.getState().tokens)
      } catch (err) {
        console.error('[TokenLayer] handleUpdate undo failed:', err)
      }
    }

    applyForward()
    useUndoStore.getState().pushCommand({
      id: nextCommandId(),
      label: `Token ${Object.keys(updates).join(', ')}`,
      action: { type: 'token.updateFields', payload: { id, oldValues, newValues: updates } },
      undo: applyBackward,
      redo: applyForward,
    })
  }, [updateToken])

  const stableCommitEditHp = useCallback(async (id: number) => {
    const hpCurrent = parseInt(latestRef.current.editHpCurrent) || 0
    const hpMax = parseInt(latestRef.current.editHpMax) || 0
    const prev = useTokenStore.getState().tokens.find((t) => t.id === id)
    setEditingHpId(null)
    if (!prev || (prev.hpCurrent === hpCurrent && prev.hpMax === hpMax)) return
    // Route through handleUpdate so the inline HP edit goes through the
    // same undo path as quick-damage/heal — a single predictable stack
    // across every HP mutation.
    handleUpdate(id, { hpCurrent, hpMax })
  }, [handleUpdate])

  const stableCommitEditAc = useCallback(async (id: number) => {
    const { editAc } = latestRef.current
    const acVal = editAc.trim() === '' ? null : parseInt(editAc) || 0
    handleUpdate(id, { ac: acVal as any })
    setEditingAcId(null)
  }, [handleUpdate])

  const stableCommitEdit = useCallback(async (id: number) => {
    const name = latestRef.current.editName.trim() || 'Token'
    const prev = useTokenStore.getState().tokens.find((t) => t.id === id)
    setEditingId(null)
    if (!prev || prev.name === name) return
    const oldName = prev.name
    // Initiative entries mirror the token name — capture their old values
    // so undo restores both sides in one step.
    const linkedEntries = useInitiativeStore.getState().entries
      .filter((e) => e.tokenId === id)
      .map((e) => ({ id: e.id, oldName: e.combatantName }))

    const applyName = async (newName: string, entryNames: Array<{ id: number; name: string }>) => {
      updateToken(id, { name: newName })
      try {
        await window.electronAPI?.tokens.update(id, { name: newName })
        broadcastTokens(useTokenStore.getState().tokens)
      } catch (err) {
        console.error('[TokenLayer] commitEdit failed:', err)
      }
      const { updateEntry } = useInitiativeStore.getState()
      for (const e of entryNames) {
        updateEntry(e.id, { combatantName: e.name })
      }
      if (entryNames.length > 0) {
        await window.electronAPI?.initiative
          .updateMany(entryNames.map((e) => ({ id: e.id, patch: { combatantName: e.name } })))
          .catch((err: unknown) => console.error('[TokenLayer] initiative name sync failed:', err))
      }
    }

    await applyName(name, linkedEntries.map((e) => ({ id: e.id, name })))

    useUndoStore.getState().pushCommand({
      id: nextCommandId(),
      label: `Rename token`,
      action: {
        type: 'token.rename',
        payload: {
          id,
          oldName,
          newName: name,
          linkedEntries: linkedEntries.map((e) => ({
            id: e.id,
            oldName: e.oldName,
            newName: name,
          })),
        },
      },
      undo: () => applyName(oldName, linkedEntries.map((e) => ({ id: e.id, name: e.oldName }))),
      redo: () => applyName(name, linkedEntries.map((e) => ({ id: e.id, name }))),
    })
  }, [updateToken])

  const stableHandleSelect = useCallback((tokenId: number, e?: Konva.KonvaEventObject<MouseEvent>) => {
    if (e?.evt?.shiftKey) {
      toggleTokenInSelection(tokenId)
    } else if (!latestRef.current.selectedTokenIds.includes(tokenId)) {
      setSelectedToken(tokenId)
    }
  }, [toggleTokenInSelection, setSelectedToken])

  async function handleDelete(id: number) {
    closeContextMenu()
    const idsToDelete = selectedTokenIds.includes(id) ? selectedTokenIds : [id]
    const names = idsToDelete.map((did) => tokens.find((t) => t.id === did)?.name ?? 'Token').join(', ')
    const confirmed = await window.electronAPI?.deleteTokenConfirm(names)
    if (!confirmed) return

    // Capture full token data before deletion so undo can re-insert
    const deletedTokens = idsToDelete
      .map((did) => tokens.find((t) => t.id === did))
      .filter(Boolean) as typeof tokens

    for (const did of idsToDelete) {
      removeToken(did)
    }
    useInitiativeStore.getState().entries.forEach((entry) => {
      if (entry.tokenId != null && idsToDelete.includes(entry.tokenId)) {
        useInitiativeStore.getState().updateEntry(entry.id, { tokenId: null })
      }
    })
    clearTokenSelection()
    try {
      // deleteMany handles the initiative.token_id NULL-ing atomically.
      await window.electronAPI?.tokens.deleteMany(idsToDelete)
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] handleDelete failed:', err)
    }

    useUndoStore.getState().pushCommand({
      id: nextCommandId(),
      label: deletedTokens.length === 1
        ? `Delete ${deletedTokens[0].name}`
        : `Delete ${deletedTokens.length} tokens`,
      action: {
        type: 'token.deleteMany',
        payload: { ids: idsToDelete, tokens: deletedTokens },
      },
      undo: async () => {
        try {
          await window.electronAPI?.tokens.restoreMany(deletedTokens)
          for (const token of deletedTokens) {
            useTokenStore.getState().addToken(token)
          }
        } catch (err) {
          console.error('[TokenLayer] undo delete failed:', err)
        }
        broadcastTokens(useTokenStore.getState().tokens)
      },
      redo: async () => {
        for (const did of idsToDelete) {
          useTokenStore.getState().removeToken(did)
        }
        try {
          await window.electronAPI?.tokens.deleteMany(idsToDelete)
        } catch (err) {
          console.error('[TokenLayer] redo delete failed:', err)
        }
        broadcastTokens(useTokenStore.getState().tokens)
      },
    })
  }

  async function handleDuplicate(token: TokenRecord) {
    closeContextMenu()
    if (!window.electronAPI) return
    const newX = token.x + map.gridSize
    const newY = token.y + map.gridSize
    try {
      const { id: _omit, ...rest } = token
      const created = await window.electronAPI.tokens.create({
        ...rest,
        x: newX,
        y: newY,
      })
      useTokenStore.getState().addToken(created)
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] handleDuplicate failed:', err)
    }
  }

  async function handleDuplicateGroup() {
    closeContextMenu()
    if (!window.electronAPI) return
    const selectedTokens = tokens.filter((t) => selectedTokenIds.includes(t.id))
    if (selectedTokens.length === 0) return
    const gridSize = map.gridSize
    for (const token of selectedTokens) {
      const newX = token.x + gridSize
      const newY = token.y + gridSize
      try {
        const { id: _omit, ...rest } = token
        const created = await window.electronAPI.tokens.create({
          ...rest,
          x: newX,
          y: newY,
        })
        useTokenStore.getState().addToken(created)
      } catch (err) {
        console.error('[TokenLayer] handleDuplicateGroup failed:', err)
      }
    }
    broadcastTokens(useTokenStore.getState().tokens)
  }

  function handleFocusToken(token: TokenRecord) {
    closeContextMenu()
    const { scale, fitScale, canvasW, canvasH } = useMapTransformStore.getState()
    const tokenCenterX = token.x + (map.gridSize * token.size) / 2
    const tokenCenterY = token.y + (map.gridSize * token.size) / 2
    const targetScale = Math.max(scale, fitScale * 1.5)
    useMapTransformStore.getState().setTransform({
      scale: targetScale,
      offsetX: canvasW / 2 - tokenCenterX * targetScale,
      offsetY: canvasH / 2 - tokenCenterY * targetScale,
    })
  }

  async function handleOpenInBestiarium(token: TokenRecord) {
    closeContextMenu()
    const slug = await findMonsterSlugByName(token.name)
    if (!slug) {
      // Failed match — usually a heavily renamed token. Surface the
      // miss so the DM doesn't think the menu just did nothing.
      showToast(`Kein Bestiarium-Eintrag für ž${token.name}" gefunden`, 'info')
      return
    }
    useUIStore.getState().openBestiary({ tab: 'monsters', slug })
  }

  function handleToggleLight(token: TokenRecord) {
    closeContextMenu()
    const notes = token.notes ?? ''
    const lightMatch = notes.match(/light:(\d+)(?::(#[0-9a-fA-F]{3,8}))?/)
    if (lightMatch) {
      const newNotes = notes.replace(/\s*light:(\d+)(?::(#[0-9a-fA-F]{3,8}))?/g, '').trim()
      handleUpdate(token.id, { notes: newNotes || null })
    } else {
      const newNotes = notes ? `${notes} light:30` : 'light:30'
      handleUpdate(token.id, { notes: newNotes })
    }
  }

  function handleEditNotes(token: TokenRecord) {
    closeContextMenu()
    const sx = token.x * scale + offsetX
    const sy = token.y * scale + offsetY
    setNotesEditState({ tokenId: token.id, screenX: sx, screenY: sy, value: token.notes ?? '' })
  }

  function commitNotesEdit() {
    if (!notesEditState) return
    handleUpdate(notesEditState.tokenId, { notes: notesEditState.value.trim() || null })
    setNotesEditState(null)
  }

  function handleCopyTokens() {
    closeContextMenu()
    const selectedTokens = tokens.filter((t) => selectedTokenIds.includes(t.id))
    if (selectedTokens.length === 0) {
      const token = tokens.find((t) => t.id === contextMenu.tokenId)
      if (!token) return
      setClipboardTokens([{
        name: token.name, imagePath: token.imagePath, size: token.size,
        hpCurrent: token.hpCurrent, hpMax: token.hpMax, faction: token.faction ?? 'party',
        ac: token.ac, notes: token.notes, statusEffects: token.statusEffects,
        visibleToPlayers: token.visibleToPlayers, markerColor: token.markerColor,
        showName: token.showName, offsetX: 0, offsetY: 0,
      }])
    } else {
      const firstX = Math.min(...selectedTokens.map((t) => t.x))
      const firstY = Math.min(...selectedTokens.map((t) => t.y))
      setClipboardTokens(selectedTokens.map((t) => ({
        name: t.name, imagePath: t.imagePath, size: t.size,
        hpCurrent: t.hpCurrent, hpMax: t.hpMax, faction: t.faction ?? 'party',
        ac: t.ac, notes: t.notes, statusEffects: t.statusEffects,
        visibleToPlayers: t.visibleToPlayers, markerColor: t.markerColor,
        showName: t.showName,
        offsetX: t.x - firstX, offsetY: t.y - firstY,
      })))
    }
  }

  async function handlePasteTokens() {
    if (pasteInProgressRef.current) return
    pasteInProgressRef.current = true
    closeContextMenu()
    if (!window.electronAPI) { pasteInProgressRef.current = false; return }
    if (clipboardTokens.length === 0) { pasteInProgressRef.current = false; return }
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const mapPos = useMapTransformStore.getState().screenToMap(pos.x, pos.y)
    for (const ct of clipboardTokens) {
      const newX = Math.round((mapPos.x + ct.offsetX) / map.gridSize) * map.gridSize
      const newY = Math.round((mapPos.y + ct.offsetY) / map.gridSize) * map.gridSize
      try {
        const created = await window.electronAPI.tokens.create({
          mapId: map.id,
          name: ct.name,
          imagePath: ct.imagePath,
          x: newX,
          y: newY,
          size: ct.size,
          hpCurrent: ct.hpCurrent,
          hpMax: ct.hpMax,
          visibleToPlayers: ct.visibleToPlayers,
          markerColor: ct.markerColor,
          ac: ct.ac,
          notes: ct.notes,
          statusEffects: ct.statusEffects,
          faction: ct.faction,
          showName: ct.showName,
        })
        useTokenStore.getState().addToken(created)
      } catch (err) {
        console.error('[TokenLayer] handlePasteTokens failed:', err)
      }
    }
    broadcastTokens(useTokenStore.getState().tokens)
    pasteInProgressRef.current = false
  }

  async function handleToggleVisibility(token: TokenRecord) {
    closeContextMenu()
    const v = !token.visibleToPlayers
    updateToken(token.id, { visibleToPlayers: v })
    try {
      await window.electronAPI?.tokens.update(token.id, { visibleToPlayers: v })
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] handleToggleVisibility failed:', err)
    }
  }

  function handleToggleLock(token: TokenRecord) {
    handleUpdate(token.id, { locked: !token.locked })
    closeContextMenu()
  }

  function handleSetMarker(tokenId: number, color: string | null) {
    handleUpdate(tokenId, { markerColor: color })
    setMarkerSubmenuId(null)
    closeContextMenu()
  }

  async function addToInitiative(token: TokenRecord) {
    closeContextMenu()
    const { addEntry } = useInitiativeStore.getState()
    const activeMapId = useCampaignStore.getState().activeMapId
    if (!activeMapId || !window.electronAPI) return
    try {
      const { entries } = useInitiativeStore.getState()
      const created = await window.electronAPI.initiative.create({
        mapId: activeMapId,
        combatantName: token.name,
        roll: 0,
        currentTurn: entries.length === 0,
        tokenId: token.id,
        sortOrder: entries.length,
      })
      addEntry(created)
    } catch (err) {
      console.error('[TokenLayer] addToInitiative failed:', err)
    }
  }

  function toggleAdvantage(token: TokenRecord, isAdvantage: boolean) {
    closeContextMenu()
    const effects = token.statusEffects ? [...token.statusEffects] : []
    const addEffect = isAdvantage ? 'advantage' : 'disadvantage'
    const removeEffect = isAdvantage ? 'disadvantage' : 'advantage'
    if (effects.includes(addEffect)) {
      handleUpdate(token.id, { statusEffects: effects.filter(e => e !== addEffect) })
    } else {
      const newEffects = effects.filter(e => e !== removeEffect)
      newEffects.push(addEffect)
      handleUpdate(token.id, { statusEffects: newEffects })
    }
  }

  function toggleStatusInMenu(token: TokenRecord, statusId: string) {
    closeContextMenu()
    const effects = token.statusEffects ? [...token.statusEffects] : []
    if (effects.includes(statusId)) {
      handleUpdate(token.id, { statusEffects: effects.filter(e => e !== statusId) })
    } else {
      effects.push(statusId)
      handleUpdate(token.id, { statusEffects: effects })
    }
  }

  return (
    <>
      <Layer
        onClick={closeContextMenu}
        onMouseDown={handleLayerMouseDown}
        onMouseMove={handleLayerMouseMove}
        onMouseUp={handleLayerMouseUp}
      >
        {sortedTokens.map((token) => {
          const sx = token.x * scale + offsetX
          const sy = token.y * scale + offsetY
          const sizePx = map.gridSize * token.size * scale

          return (
            <TokenNode
              key={token.id}
              token={token}
              x={sx}
              y={sy}
              sizePx={sizePx}
              isDraggable={isDraggable && !token.locked}
              isSelected={selectedTokenIds.includes(token.id)}
              isEditing={editingId === token.id}
              editName={editingId === token.id ? editName : ''}
              isEditingHp={editingHpId === token.id}
              editHpCurrent={editingHpId === token.id ? editHpCurrent : ''}
              editHpMax={editingHpId === token.id ? editHpMax : ''}
              isEditingAc={editingAcId === token.id}
              editAc={editingAcId === token.id ? editAc : ''}
              onEditNameChange={setEditName}
              onEditCommit={stableCommitEdit}
              onEditHpCurrentChange={setEditHpCurrent}
              onEditHpMaxChange={setEditHpMax}
              onEditHpCommit={stableCommitEditHp}
              onEditAcChange={setEditAc}
              onEditAcCommit={stableCommitEditAc}
              onSelect={stableHandleSelect}
              onDblClick={stableStartEdit}
              onDragMove={stableHandleDragMove}
              onDragEnd={stableHandleDragEnd}
              onContextMenu={stableHandleContextMenu}
            />
          )
        })}

        {/* Ghost snap preview — shown during token drag when grid snap is active */}
        {ghostPos && (
          <Rect
            x={ghostPos.x}
            y={ghostPos.y}
            width={ghostPos.sizePx}
            height={ghostPos.sizePx}
            fill="rgba(47, 107, 255, 0.1)"
            stroke="rgba(47, 107, 255, 0.45)"
            strokeWidth={2}
            dash={[6, 4]}
            cornerRadius={ghostPos.sizePx / 2}
            listening={false}
          />
        )}

        {/* Rubber-band selection rectangle */}
        {rubberBand && (
          <Rect
            x={Math.min(rubberBand.x1, rubberBand.x2)}
            y={Math.min(rubberBand.y1, rubberBand.y2)}
            width={Math.abs(rubberBand.x2 - rubberBand.x1)}
            height={Math.abs(rubberBand.y2 - rubberBand.y1)}
            fill="rgba(47,107,255,0.08)"
            stroke="rgba(47,107,255,0.5)"
            strokeWidth={1}
            dash={[4, 3]}
            listening={false}
          />
        )}

        {/* Context Menu as HTML overlay */}
        {contextMenu.visible && (() => {
          const token = tokens.find((t) => t.id === contextMenu.tokenId)
          if (!token) return null
          return (
            <Html
              divProps={{ style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } }}
            >
              <div
                ref={menuRef}
                data-token-context-menu
                style={{
                  position: 'fixed',
                  left: menuClamp ? menuClamp.x : contextMenu.x,
                  top: menuClamp ? menuClamp.y : contextMenu.y,
                  visibility: menuClamp ? 'visible' : 'hidden',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '4px 0',
                  minWidth: 200,
                  maxHeight: 'calc(100vh - 16px)',
                  overflowY: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  zIndex: 9999,
                  pointerEvents: 'all',
                }}
              >
                {(() => {
                  const MARKER_COLORS = [
                    { label: 'Keine', color: null },
                    { label: 'Rot', color: '#ef4444' },
                    { label: 'Amber', color: '#f59e0b' },
                    { label: 'Grün', color: '#22c55e' },
                    { label: 'Blau', color: '#3b82f6' },
                    { label: 'Lila', color: '#a855f7' },
                    { label: 'Pink', color: '#ec4899' },
                  ]
                  const isBatch = selectedTokenIds.length > 1 && selectedTokenIds.includes(token.id)
                  const hasLight = (token.notes ?? '').includes('light:')
                  const menuItems: any[] = isBatch ? [
                    { label: `👁 Alle sichtbar machen (${selectedTokenIds.length})`, action: () => {
                      for (const id of selectedTokenIds) handleUpdate(id, { visibleToPlayers: true })
                      closeContextMenu()
                    }},
                    { label: `ðŸ™ˆ Alle verstecken (${selectedTokenIds.length})`, action: () => {
                      for (const id of selectedTokenIds) handleUpdate(id, { visibleToPlayers: false })
                      closeContextMenu()
                    }},
                    { label: `ðŸ”’ Sperren (${selectedTokenIds.length})`, action: () => {
                      for (const id of selectedTokenIds) handleUpdate(id, { locked: true })
                      closeContextMenu()
                    }},
                    { label: `ðŸ”“ Entsperren (${selectedTokenIds.length})`, action: () => {
                      for (const id of selectedTokenIds) handleUpdate(id, { locked: false })
                      closeContextMenu()
                    }},
                    { label: 'ðŸ· Fraktion setzen', action: null, submenu: true, submenuType: 'faction' },
                    null,
                    { label: 'ðŸ“‹ Als Gruppe duplizieren', action: () => handleDuplicateGroup() },
                    { label: 'ðŸ“‹ Kopieren', action: () => handleCopyTokens() },
                    { label: clipboardTokens.length > 0 ? `ðŸ“‹ Einfügen (${clipboardTokens.length})` : 'ðŸ“‹ Einfügen', action: () => handlePasteTokens(), disabled: clipboardTokens.length === 0 },
                    null,
                    { label: `❌ Alle löschen (${selectedTokenIds.length})`, action: () => handleDelete(token.id), danger: true },
                  ] : [
                    { label: '✏️ Umbenennen', action: () => stableStartEdit(token) },
                    { label: '❤️ HP bearbeiten', action: () => startEditHp(token) },
                    { label: 'ðŸ›¡ AC bearbeiten', action: () => startEditAc(token) },
                    { label: 'ðŸ“ Notiz', action: () => handleEditNotes(token) },
                    null,
                    // Inline HP chip row — replaces four full-width rows with
                    // one compact strip. Keeps all four quick-adjust actions
                    // discoverable without pushing the menu off-screen.
                    { kind: 'hp-chips' },
                    null,
                    { label: '⚔️ Zustände', action: null, submenu: true, submenuType: 'status' },
                    { label: '➕ Vorteil', action: () => toggleAdvantage(token, true) },
                    { label: '➖ Nachteil', action: () => toggleAdvantage(token, false) },
                    { label: '🎭¯ Konzentration', action: () => toggleStatusInMenu(token, 'concentrating') },
                    null,
                    { label: '⚔️ Zum Kampf hinzufügen', action: () => addToInitiative(token) },
                    { label: 'ðŸ“– Im Bestiarium öffnen', action: () => { void handleOpenInBestiarium(token) } },
                    { label: '🎭¯ Fokus setzen', action: () => handleFocusToken(token) },
                    { label: hasLight ? 'ðŸ’¡ Lichtquelle deaktivieren' : 'ðŸ’¡ Lichtquelle aktivieren', action: () => handleToggleLight(token) },
                    null,
                    { label: token.visibleToPlayers ? 'ðŸ™ˆ Verstecken' : '👁 Sichtbar machen', action: () => handleToggleVisibility(token) },
                    { label: 'ðŸ“‹ Kopieren', action: () => handleCopyTokens() },
                    { label: clipboardTokens.length > 0 ? `ðŸ“‹ Einfügen (${clipboardTokens.length})` : 'ðŸ“‹ Einfügen', action: () => handlePasteTokens(), disabled: clipboardTokens.length === 0 },
                    { label: token.locked ? 'ðŸ”“ Entsperren' : 'ðŸ”’ Sperren', action: () => handleToggleLock(token) },
                    { label: 'ðŸ· Markierung', action: null, submenu: true, submenuType: 'marker' },
                    { label: '⬆️ nach vorne', action: () => { handleUpdate(token.id, { zIndex: token.zIndex + 1 }); closeContextMenu() } },
                    { label: '⬇ï¸ nach hinten', action: () => { handleUpdate(token.id, { zIndex: Math.max(0, token.zIndex - 1) }); closeContextMenu() } },
                    { label: '⏫ ganz nach vorne', action: () => { const maxZ = Math.max(...tokens.map(t => t.zIndex), 0); handleUpdate(token.id, { zIndex: maxZ + 1 }); closeContextMenu() } },
                    null,
                    { label: '❌ Löschen', action: () => handleDelete(token.id), danger: true },
                  ]
                  return menuItems.map((item, i) => {
                    if (item === null) {
                      return <div key={i} style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                    }
                    if (item.kind === 'hp-chips') {
                      const adjustHp = (delta: number) => {
                        const max = (token.hpMax || 0) || 999
                        const next = delta > 0
                          ? Math.min(max, (token.hpCurrent || 0) + delta)
                          : Math.max(0,   (token.hpCurrent || 0) + delta)
                        handleUpdate(token.id, { hpCurrent: next })
                        closeContextMenu()
                      }
                      const chipStyle = (heal: boolean): React.CSSProperties => ({
                        flex: 1,
                        padding: '4px 0',
                        background: 'var(--bg-base)',
                        border: `1px solid ${heal ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
                        borderRadius: 4,
                        color: heal ? '#22c55e' : '#ef4444',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      })
                      return (
                        <div key={i} style={{ padding: '2px 8px' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>HP</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={chipStyle(false)} title="−5 HP" onClick={() => adjustHp(-5)}>−5</button>
                            <button style={chipStyle(false)} title="−1 HP" onClick={() => adjustHp(-1)}>−1</button>
                            <button style={chipStyle(true)}  title="+1 HP" onClick={() => adjustHp(1)}>+1</button>
                            <button style={chipStyle(true)}  title="+5 HP" onClick={() => adjustHp(5)}>+5</button>
                          </div>
                        </div>
                      )
                    }
                    if (item.submenu) {
                      const isSubOpen = markerSubmenuId === token.id && submenuType === item.submenuType
                      const isFaction = item.submenuType === 'faction'
                      const isStatus = item.submenuType === 'status'
                      const FACTION_OPTIONS = [
                        { value: 'party', label: '🎭® Spieler', color: '#22c55e' },
                        { value: 'enemy', label: '⚔️ Gegner', color: '#ef4444' },
                        { value: 'neutral', label: '⚖️ Neutral', color: '#f59e0b' },
                        { value: 'friendly', label: 'ðŸ¤ Freundlich', color: '#3b82f6' },
                      ]
                      return (
                        <div key={i}>
                          <button
                            onClick={() => {
                              if (isSubOpen) {
                                setMarkerSubmenuId(null)
                                setSubmenuType(null)
                              } else {
                                setMarkerSubmenuId(token.id)
                                setSubmenuType(item.submenuType)
                              }
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '6px 12px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              fontSize: 'var(--text-sm)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            {isFaction ? 'ðŸ· Fraktion' : isStatus ? '⚔️ Zustände' : 'ðŸ· Markierung'} {isSubOpen ? '▲' : '–¶'}
                          </button>
                          {isSubOpen && isFaction && (
                            <div style={{ background: 'var(--bg-elevated)', padding: '2px 0' }}>
                              {FACTION_OPTIONS.map((f) => (
                                <button
                                  key={f.value}
                                  onClick={() => {
                                    const ids = isBatch ? selectedTokenIds : [token.id]
                                    for (const id of ids) handleUpdate(id, { faction: f.value })
                                    closeContextMenu()
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                    padding: '4px 12px 4px 24px',
                                    background: token.faction === f.value ? 'var(--bg-overlay)' : 'none',
                                    border: 'none',
                                    textAlign: 'left',
                                    fontSize: 'var(--text-sm)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = token.faction === f.value ? 'var(--bg-overlay)' : 'none')}
                                >
                                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: f.color }} />
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {isSubOpen && isStatus && (
                            <div style={{ background: 'var(--bg-elevated)', padding: '2px 0', maxHeight: 200, overflowY: 'auto' }}>
                              {STATUS_EFFECTS.map((eff) => {
                                const isActive = token.statusEffects?.includes(eff.id) ?? false
                                return (
                                  <button
                                    key={eff.id}
                                    onClick={() => toggleStatusInMenu(token, eff.id)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      width: '100%',
                                      padding: '4px 12px 4px 24px',
                                      background: isActive ? 'var(--accent-blue-dim)' : 'none',
                                      border: isActive ? '1px solid var(--accent-blue)' : 'none',
                                      textAlign: 'left',
                                      fontSize: 'var(--text-sm)',
                                      color: 'var(--text-primary)',
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay)' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--accent-blue-dim)' : 'none' }}
                                  >
                                    <span style={{ fontSize: 14 }}>{eff.icon}</span>
                                    {eff.label}
                                    {isActive && <span style={{ color: 'var(--accent-blue)', marginLeft: 'auto', fontSize: 10 }}>✓</span>}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {isSubOpen && !isFaction && !isStatus && (
                            <div style={{ background: 'var(--bg-elevated)', padding: '2px 0' }}>
                              {MARKER_COLORS.map((mc) => (
                                <button
                                  key={mc.color ?? 'none'}
                                  onClick={() => handleSetMarker(token.id, mc.color)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                    padding: '4px 12px 4px 24px',
                                    background: token.markerColor === mc.color ? 'var(--bg-overlay)' : 'none',
                                    border: 'none',
                                    textAlign: 'left',
                                    fontSize: 'var(--text-sm)',
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = token.markerColor === mc.color ? 'var(--bg-overlay)' : 'none')}
                                >
                                  {mc.color ? <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: mc.color }} /> : <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '1px solid var(--border)' }} />}
                                  {mc.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    }
                    return (
                      <button
                        key={i}
                        onClick={item.disabled ? undefined : item.action}
                        disabled={item.disabled}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 12px',
                          background: 'none',
                          border: 'none',
                          textAlign: 'left',
                          fontSize: 'var(--text-sm)',
                          color: item.disabled ? 'var(--text-muted)' : item.danger ? 'var(--danger)' : 'var(--text-primary)',
                          cursor: item.disabled ? 'default' : 'pointer',
                          opacity: item.disabled ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'var(--bg-overlay)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                      >
                        {item.label}
                      </button>
                    )
                  })
                })()}
              </div>
            </Html>
          )
        })()}

        {/* Inline notes editor overlay */}
        {notesEditState && (
          <Html divProps={{ style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } }}>
            <div style={{ position: 'fixed', left: notesEditState.screenX, top: notesEditState.screenY, zIndex: 9999, pointerEvents: 'all', minWidth: 220 }}>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-blue)', borderRadius: 6, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Notizen</div>
                <textarea
                  autoFocus
                  value={notesEditState.value}
                  onChange={(e) => setNotesEditState((s) => s ? { ...s, value: e.target.value } : null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitNotesEdit() }
                    if (e.key === 'Escape') setNotesEditState(null)
                  }}
                  rows={3}
                  style={{ width: '100%', fontSize: 12, padding: '4px 6px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button style={{ fontSize: 11, padding: '2px 8px', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 3, color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setNotesEditState(null)}>Abbruch</button>
                  <button style={{ fontSize: 11, padding: '2px 8px', background: 'var(--accent-blue-dim)', border: '1px solid var(--accent-blue)', borderRadius: 3, color: 'var(--text-primary)', cursor: 'pointer' }} onClick={commitNotesEdit}>OK</button>
                </div>
              </div>
            </div>
          </Html>
        )}
      </Layer>
    </>
  )
}

// ”€”€”€ Individual Token Node ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€

interface TokenNodeProps {
  token: TokenRecord
  x: number
  y: number
  sizePx: number
  isDraggable: boolean
  isSelected: boolean
  isEditing: boolean
  editName: string
  isEditingHp: boolean
  editHpCurrent: string
  editHpMax: string
  isEditingAc: boolean
  editAc: string
  onEditNameChange: (v: string) => void
  onEditCommit: (id: number) => void
  onEditHpCurrentChange: (v: string) => void
  onEditHpMaxChange: (v: string) => void
  onEditHpCommit: (id: number) => void
  onEditAcChange: (v: string) => void
  onEditAcCommit: (id: number) => void
  onSelect: (tokenId: number, e?: Konva.KonvaEventObject<MouseEvent>) => void
  onDblClick: (token: TokenRecord) => void
  onDragMove: (token: TokenRecord, e: Konva.KonvaEventObject<DragEvent>) => void
  onDragEnd: (token: TokenRecord, e: Konva.KonvaEventObject<DragEvent>) => void
  onContextMenu: (token: TokenRecord, e: Konva.KonvaEventObject<MouseEvent>) => void
}

const TokenNode = memo(function TokenNode({
  token, x, y, sizePx, isDraggable, isSelected,
  isEditing, editName, isEditingHp, editHpCurrent, editHpMax, isEditingAc, editAc,
  onEditNameChange, onEditCommit,
  onEditHpCurrentChange, onEditHpMaxChange, onEditHpCommit,
  onEditAcChange, onEditAcCommit,
  onSelect, onDblClick, onDragMove, onDragEnd, onContextMenu,
}: TokenNodeProps) {
  const image = useImage(token.imagePath ? `file://${token.imagePath}` : null)
  const r = sizePx / 2
  const hpRatio = token.hpMax > 0 ? Math.max(0, Math.min(1, token.hpCurrent / token.hpMax)) : -1
  const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444'

  // Internal handlers that bind token data to stable parent callbacks
  const handleClick = useCallback((e?: Konva.KonvaEventObject<MouseEvent>) => onSelect(token.id, e), [onSelect, token.id])
  const handleDblClick = useCallback(() => onDblClick(token), [onDblClick, token])
  const handleDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragMove(token, e), [onDragMove, token])
  const handleDrag = useCallback((e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(token, e), [onDragEnd, token])
  const handleCtxMenu = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => onContextMenu(token, e), [onContextMenu, token])
  const handleEditDone = useCallback(() => onEditCommit(token.id), [onEditCommit, token.id])
  const handleHpDone = useCallback(() => onEditHpCommit(token.id), [onEditHpCommit, token.id])
  const handleAcDone = useCallback(() => onEditAcCommit(token.id), [onEditAcCommit, token.id])

  return (
    // Outer group: positioned at top-left, handles drag + events
    <Group
      x={x} y={y}
      draggable={isDraggable}
      onDragMove={handleDragMove}
      onDragEnd={handleDrag}
      onClick={handleClick}
      onDblClick={handleDblClick}
      onContextMenu={handleCtxMenu}
    >
      {/* Inner group: rotates around token center (r, r) */}
      <Group x={r} y={r} rotation={token.rotation}>
        {/* Marker color ring */}
        {(token.markerColor ?? factionColor(token.faction)) && (
          <Circle
            x={0} y={0} radius={r + 5}
            stroke={token.markerColor || factionColor(token.faction)} strokeWidth={3}
            fill="transparent" listening={false}
          />
        )}

        {/* Selection ring */}
        {isSelected && (
          <Circle
            x={0} y={0} radius={r + (token.markerColor || factionColor(token.faction) ? 10 : 3)}
            stroke="#4A86FF" strokeWidth={2}
            dash={[4, 3]} fill="transparent" listening={false}
          />
        )}

        {/* Token body circle */}
        <Circle
          x={0} y={0} radius={r}
          fill="#182130"
          stroke={isSelected ? '#2F6BFF' : token.visibleToPlayers ? '#1E2A3E' : '#ef4444'}
          strokeWidth={isSelected ? 2.5 : 1.5}
        />

        {/* Token image */}
        {image ? (
          <KonvaImage
            image={image}
            x={-r} y={-r}
            width={sizePx} height={sizePx}
            cornerRadius={r}
            listening={false}
          />
        ) : (
          <Text
            x={-r} y={-sizePx * 0.22}
            width={sizePx}
            text={token.name.charAt(0).toUpperCase()}
            align="center"
            fontSize={sizePx * 0.45}
            fontStyle="bold"
            fill="#94A0B2"
            listening={false}
          />
        )}

        {/* Status badges (rotate with token) */}
        {!token.visibleToPlayers && (
          <Text x={r - 14} y={-r - 2} text="ðŸ™ˆ" fontSize={12} listening={false} />
        )}
        {token.locked && (
          <Text x={-r} y={-r - 2} text="ðŸ”’" fontSize={10} listening={false} />
        )}
        {token.ac != null && (
          <>
            <Rect x={r - 18} y={r - 14} width={16} height={12} fill="#182130"
              cornerRadius={3} stroke="#64748b" strokeWidth={1} listening={false} />
            <Text x={r - 18} y={r - 13} width={16} text={String(token.ac)}
              align="center" fontSize={9} fontStyle="bold" fill="#94A0B2" listening={false} />
          </>
        )}

        {/* Status effect badges (up to 4 icons above token) */}
        {token.statusEffects && token.statusEffects.length > 0 && (() => {
          const icons = STATUS_ICON_MAP
          const effects = token.statusEffects.slice(0, 4)
          const iconSize = Math.max(11, Math.min(14, sizePx * 0.22))
          return effects.map((eff, idx) => (
            <Text
              key={eff}
              x={-r + idx * (iconSize + 2)}
              y={-r - iconSize - 4}
              text={icons[eff] ?? '❓'}
              fontSize={iconSize}
              listening={false}
            />
          ))
        })()}
      </Group>

      {/* HP bar + text (not rotated) */}
      {hpRatio >= 0 && (
        <>
          <Rect x={0} y={sizePx + 3} width={sizePx} height={6}
            fill="#0D1015" cornerRadius={2} listening={false} />
          <Rect x={0} y={sizePx + 3} width={sizePx * hpRatio} height={6}
            fill={hpColor} cornerRadius={2} listening={false} />
          <Text x={0} y={sizePx + 2} width={sizePx} text={`${token.hpCurrent}/${token.hpMax}`}
            align="center" fontSize={8} fontStyle="bold" fill="#F4F6FA"
            listening={false} />
        </>
      )}

      {/* Name label ABOVE token (not rotated) */}
      {isEditing ? (
        <Html divProps={{ style: { position: 'absolute', top: 0, left: 0 } }}>
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditDone()
              if (e.key === 'Escape') handleEditDone()
            }}
            onBlur={handleEditDone}
            style={{
              position: 'absolute',
              left: x - 40,
              top: y - 20,
              width: sizePx + 80,
              background: '#0D1015',
              border: '1px solid #2F6BFF',
              borderRadius: 4,
              color: '#F4F6FA',
              fontSize: 12,
              padding: '2px 6px',
              outline: 'none',
              textAlign: 'center',
            }}
          />
        </Html>
      ) : isEditingHp ? (
        <Html divProps={{ style: { position: 'absolute', top: 0, left: 0 } }}>
          <div
            style={{
              position: 'absolute',
              left: x - 50,
              top: y - 40,
              display: 'flex',
              gap: 4,
              background: '#0D1015',
              border: '1px solid #22c55e',
              borderRadius: 4,
              padding: '4px 6px',
              zIndex: 100,
            }}
          >
            <input
              autoFocus
              type="number"
              value={editHpCurrent}
              onChange={(e) => onEditHpCurrentChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleHpDone()
                if (e.key === 'Escape') handleHpDone()
              }}
              style={{
                width: 36,
                background: '#182130',
                border: '1px solid #334155',
                borderRadius: 3,
                color: '#F4F6FA',
                fontSize: 11,
                padding: '1px 4px',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <span style={{ color: '#64748b', fontSize: 11, lineHeight: '20px' }}>/</span>
            <input
              type="number"
              value={editHpMax}
              onChange={(e) => onEditHpMaxChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleHpDone()
                if (e.key === 'Escape') handleHpDone()
              }}
              onBlur={handleHpDone}
              style={{
                width: 36,
                background: '#182130',
                border: '1px solid #334155',
                borderRadius: 3,
                color: '#F4F6FA',
                fontSize: 11,
                padding: '1px 4px',
                outline: 'none',
                textAlign: 'center',
              }}
            />
          </div>
        </Html>
      ) : isEditingAc ? (
        <Html divProps={{ style: { position: 'absolute', top: 0, left: 0 } }}>
          <input
            autoFocus
            type="number"
            value={editAc}
            onChange={(e) => onEditAcChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAcDone()
              if (e.key === 'Escape') handleAcDone()
            }}
            onBlur={handleAcDone}
            placeholder="AC"
            style={{
              position: 'absolute',
              left: x - 20,
              top: y - 30,
              width: 40 + sizePx,
              background: '#0D1015',
              border: '1px solid #64748b',
              borderRadius: 4,
              color: '#F4F6FA',
              fontSize: 12,
              padding: '2px 6px',
              outline: 'none',
              textAlign: 'center',
            }}
          />
        </Html>
      ) : (
        <Text
          x={-r}
          y={-16}
          width={sizePx * 2}
          text={token.name}
          align="center"
          fontSize={Math.max(10, Math.min(13, sizePx * 0.22))}
          fill="#F4F6FA"
          shadowColor="black" shadowBlur={4} shadowOpacity={0.9}
          listening={false}
        />
      )}
    </Group>
  )
}, (prev, next) => (
  // Return true = equal = skip re-render
  prev.token === next.token &&
  prev.x === next.x &&
  prev.y === next.y &&
  prev.sizePx === next.sizePx &&
  prev.isDraggable === next.isDraggable &&
  prev.isSelected === next.isSelected &&
  prev.isEditing === next.isEditing &&
  prev.isEditingHp === next.isEditingHp &&
  prev.isEditingAc === next.isEditingAc &&
  // Only compare edit inputs for the token that is actively being edited
  (!next.isEditing  || prev.editName === next.editName) &&
  (!next.isEditingHp || (prev.editHpCurrent === next.editHpCurrent && prev.editHpMax === next.editHpMax)) &&
  (!next.isEditingAc || prev.editAc === next.editAc) &&
  // Stable callback refs (all defined with useCallback in parent)
  prev.onSelect === next.onSelect &&
  prev.onDblClick === next.onDblClick &&
  prev.onDragMove === next.onDragMove &&
  prev.onDragEnd === next.onDragEnd &&
  prev.onContextMenu === next.onContextMenu
))

/**
 * Token move as a serializable undo action (AP-5). The payload
 * captures the id + from/to position for every moved token. Forward
 * and backward are symmetric pure updates — no closures over React
 * or store state — so this action survives serialization to disk
 * and replay after a crash.
 *
 * This is the concrete first example of the `registerUndoAction` /
 * `pushAction` pattern from `undoStore.ts`. Other undo flows (wall
 * draw, pin delete, paste-tokens) still use the closure API and can
 * migrate incrementally as their payloads firm up.
 */
interface TokenMovePayload {
  positions: Array<{ id: number; from: { x: number; y: number }; to: { x: number; y: number } }>
}

registerUndoAction<TokenMovePayload>('token.move', {
  label: (p) => `Move ${p.positions.length === 1 ? 'token' : 'tokens'}`,
  forward: async (p) => {
    for (const entry of p.positions) {
      useTokenStore.getState().moveToken(entry.id, entry.to.x, entry.to.y)
    }
    await window.electronAPI?.tokens.updateMany(
      p.positions.map((e) => ({ id: e.id, patch: { x: e.to.x, y: e.to.y } })),
    )
    broadcastTokens(useTokenStore.getState().tokens)
  },
  backward: async (p) => {
    for (const entry of p.positions) {
      useTokenStore.getState().moveToken(entry.id, entry.from.x, entry.from.y)
    }
    await window.electronAPI?.tokens.updateMany(
      p.positions.map((e) => ({ id: e.id, patch: { x: e.from.x, y: e.from.y } })),
    )
    broadcastTokens(useTokenStore.getState().tokens)
  },
})

function broadcastTokens(tokens: TokenRecord[]) {
  if (useSessionStore.getState().sessionMode === 'prep') return
  const visible = tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) => ({
      id: t.id,
      name: t.name,
      imagePath: t.imagePath,
      x: t.x,
      y: t.y,
      size: t.size,
      hpCurrent: t.hpCurrent,
      hpMax: t.hpMax,
      showName: t.showName,
      rotation: t.rotation,
      markerColor: t.markerColor,
      statusEffects: t.statusEffects,
      ac: t.ac,
      faction: t.faction,
      lightRadius: t.lightRadius,
      lightColor: t.lightColor,
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}
