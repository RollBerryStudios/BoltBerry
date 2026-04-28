import { useState, useEffect, useMemo, useRef, RefObject } from 'react'
import { Layer, Line, Rect, Circle, Text as KonvaText } from 'react-konva'
import { Html } from 'react-konva-utils'
import Konva from 'konva'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'
import type { DrawingType } from '@shared/ipc-types'

export type { DrawingType }

interface Drawing {
  id: number
  mapId: number
  type: DrawingType
  points: number[]
  color: string
  width: number
  text: string | null
  synced: boolean
}

interface DrawingLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

const DRAWING_TOOLS = new Set<string>(['draw-freehand', 'draw-rect', 'draw-circle', 'draw-text'])
const ERASE_TOOL = 'draw-erase'

export function DrawingLayer({ stageRef, mapId, gridSize }: DrawingLayerProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const drawColor = useUIStore((s) => s.drawColor)
  const drawWidth = useUIStore((s) => s.drawWidth)
  const drawingClearTick = useUIStore((s) => s.drawingClearTick)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const canvasW = useMapTransformStore((s) => s.canvasW)
  const canvasH = useMapTransformStore((s) => s.canvasH)
  const screenToMap = useMapTransformStore((s) => s.screenToMap)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [currentPath, setCurrentPath] = useState<number[]>([])
  const [loadedMapId, setLoadedMapId] = useState<number | null>(null)
  const [pendingText, setPendingText] = useState<{ screenX: number; screenY: number; mapX: number; mapY: number } | null>(null)
  const [pendingTextValue, setPendingTextValue] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)
  const focusTimerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending focus timer on unmount
  useEffect(() => {
    return () => {
      if (focusTimerIdRef.current != null) {
        clearTimeout(focusTimerIdRef.current)
        focusTimerIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadDrawings(mapId)
      .then((result) => { if (!cancelled) setDrawings(result) })
      .catch((err) => { if (!cancelled) console.error('[DrawingLayer] loadDrawings failed:', err) })
    setLoadedMapId(mapId)
    return () => { cancelled = true }
  }, [mapId])

  // Clear local drawings when the GM triggers a full clear from OverlayPanel
  useEffect(() => {
    if (drawingClearTick > 0) setDrawings([])
  }, [drawingClearTick])

  // Bridge for the shared context menu (Phase 8 §E.Drawing). The
  // layer itself is non-listening outside drawing/erase mode (so
  // token drag etc. work over drawings); the engine reaches drawings
  // via the `drawing:lookup` CustomEvent below — this layer answers
  // synchronously from its local state with a JS hit-test against
  // each drawing's geometry.
  useEffect(() => {
    const onUpdate = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { id: number; patch: Record<string, unknown> }
      // Drawings have no IPC update yet; we mutate local state for
      // synced toggle and let the next save handle persistence.
      setDrawings((prev) => prev.map((d) => (d.id === detail.id ? { ...d, ...(detail.patch as object) } as typeof d : d)))
    }
    const onDelete = (ev: Event) => {
      const { id } = (ev as CustomEvent).detail as { id: number }
      void eraseDrawing(id)
    }
    const onEditText = (ev: Event) => {
      const { id } = (ev as CustomEvent).detail as { id: number }
      const target = drawings.find((d) => d.id === id)
      if (!target || target.type !== 'text') return
      // Prompt for new text — keeps the diff small; a full inline
      // editor lives in Phase 5.
      const next = window.prompt('Text bearbeiten', target.text ?? '')
      if (next == null) return
      setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, text: next } : d)))
    }
    const onLookup = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        pos: { x: number; y: number }
        toleranceMap: number
        resolve: (d: Drawing | null) => void
      }
      // Walk newest-first so the topmost drawing wins (matches z-order
      // — drawings are pushed in chronological order, last added paints
      // on top of earlier ones).
      for (let i = drawings.length - 1; i >= 0; i--) {
        if (hitTestDrawing(drawings[i], detail.pos, detail.toleranceMap)) {
          detail.resolve(drawings[i])
          return
        }
      }
      detail.resolve(null)
    }
    window.addEventListener('drawing:update', onUpdate)
    window.addEventListener('drawing:delete', onDelete)
    window.addEventListener('drawing:edit-text', onEditText)
    window.addEventListener('drawing:lookup', onLookup)
    return () => {
      window.removeEventListener('drawing:update', onUpdate)
      window.removeEventListener('drawing:delete', onDelete)
      window.removeEventListener('drawing:edit-text', onEditText)
      window.removeEventListener('drawing:lookup', onLookup)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings])

  const isDrawingActive = DRAWING_TOOLS.has(activeTool)
  // The eraser also needs the Layer to listen so per-shape onClick
  // handlers reach Konva — otherwise selecting the eraser silently
  // dropped every click because `listening={isDrawingActive}` on the
  // Layer overrides the `listening={eraseMode}` on each shape.
  const isEraseActive = activeTool === ERASE_TOOL
  const isLayerListening = isDrawingActive || isEraseActive

  function getMapPos() {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return screenToMap(pos.x, pos.y)
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isDrawingActive || e.evt.button !== 0) return
    const pos = getMapPos()
    if (!pos) return

    if (activeTool === 'draw-freehand') {
      setCurrentPath([pos.x, pos.y])
    } else if (activeTool === 'draw-text') {
      const stage = stageRef.current
      const containerRect = stage?.container().getBoundingClientRect()
      const screenPos = stage?.getPointerPosition()
      if (containerRect && screenPos) {
        setPendingText({ screenX: screenPos.x, screenY: screenPos.y, mapX: pos.x, mapY: pos.y })
        setPendingTextValue('')
        if (focusTimerIdRef.current != null) clearTimeout(focusTimerIdRef.current)
        focusTimerIdRef.current = setTimeout(() => {
          textInputRef.current?.focus()
          focusTimerIdRef.current = null
        }, 20)
      }
    } else if (activeTool === 'draw-rect' || activeTool === 'draw-circle') {
      setCurrentPath([pos.x, pos.y, pos.x, pos.y])
    }
  }

  function handleMouseMove() {
    if (!isDrawingActive || currentPath.length === 0) return
    const pos = getMapPos()
    if (!pos) return

    if (activeTool === 'draw-freehand') {
      setCurrentPath([...currentPath, pos.x, pos.y])
    } else if (activeTool === 'draw-rect' || activeTool === 'draw-circle') {
      setCurrentPath([currentPath[0], currentPath[1], pos.x, pos.y])
    }
  }

  function handleMouseUp() {
    if (!isDrawingActive || currentPath.length < 4) { setCurrentPath([]); return }
    // For freehand: need ≥4 values (2 distinct points = actual stroke)
    // For rect/circle: need exactly 4 values (start + end corner), already satisfied by check above

    const type: DrawingType =
      activeTool === 'draw-freehand' ? 'freehand' :
      activeTool === 'draw-rect' ? 'rect' :
      activeTool === 'draw-circle' ? 'circle' : 'freehand'

    addDrawing({ type, points: currentPath, color: drawColor, width: drawWidth })
    setCurrentPath([])
  }

  async function eraseDrawing(id: number) {
    if (!window.electronAPI) return
    const target = drawings.find((d) => d.id === id)
    if (!target) return
    try {
      await window.electronAPI.drawings.delete(id)
      setDrawings((prev) => prev.filter((d) => d.id !== id))
      // No per-drawing delete IPC to the player; trigger a full
      // re-broadcast so the player view drops the erased stroke.
      useUIStore.getState().incrementDrawingClearTick()

      // Push undo so the user can recover the stroke.
      const original = { ...target }
      let restoredId: number = original.id
      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Zeichnung löschen`,
        action: { type: 'drawing.delete', payload: { id: original.id } },
        undo: async () => {
          const recreated = await window.electronAPI?.drawings.create({
            mapId,
            type: original.type,
            points: original.points,
            color: original.color,
            width: original.width,
            text: original.text ?? null,
          })
          if (!recreated) return
          restoredId = recreated.id
          setDrawings((prev) => [...prev, {
            id: recreated.id, mapId: recreated.mapId, type: recreated.type, points: recreated.points,
            color: recreated.color, width: recreated.width, text: recreated.text, synced: recreated.synced,
          }])
          window.electronAPI?.sendDrawing({ id: restoredId, type: original.type, points: original.points, color: original.color, width: original.width, text: original.text })
        },
        redo: async () => {
          await window.electronAPI?.drawings.delete(restoredId)
          setDrawings((prev) => prev.filter((d) => d.id !== restoredId))
          useUIStore.getState().incrementDrawingClearTick()
        },
      })
    } catch (err) {
      console.error('[DrawingLayer] eraseDrawing failed:', err)
    }
  }

  async function addDrawing(d: { type: DrawingType; points: number[]; color: string; width: number; text?: string }) {
    if (!window.electronAPI) return
    try {
      const createPatch = {
        mapId,
        type: d.type,
        points: d.points,
        color: d.color,
        width: d.width,
        text: d.text ?? null,
      }
      const created = await window.electronAPI.drawings.create(createPatch)
      // `currentId` tracks the row through undo→redo cycles: each
      // redo writes a fresh row (SQLite autoincrements), so the next
      // undo must delete whichever row is "current".
      let currentId: number = created.id
      const toLocal = (row: typeof created): Drawing => ({
        id: row.id,
        mapId: row.mapId,
        type: row.type,
        points: row.points,
        color: row.color,
        width: row.width,
        text: row.text,
        synced: row.synced,
      })
      const newDrawing = toLocal(created)
      setDrawings(prev => [...prev, newDrawing])
      window.electronAPI?.sendDrawing(newDrawing)

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Zeichnung (${d.type})`,
        action: { type: 'drawing.create', payload: { id: currentId, patch: createPatch } },
        undo: async () => {
          await window.electronAPI?.drawings.delete(currentId)
          setDrawings(prev => prev.filter((x) => x.id !== currentId))
          // Re-broadcast the full drawing set so the player window
          // drops the undone stroke. There's no per-drawing delete
          // channel; the clear-tick triggers a usePlayerSync rebuild
          // that re-pushes the remaining drawings in a full-sync.
          useUIStore.getState().incrementDrawingClearTick()
        },
        redo: async () => {
          const r = await window.electronAPI?.drawings.create(createPatch)
          if (!r) return
          currentId = r.id
          const restored = toLocal(r)
          setDrawings(prev => [...prev, restored])
          window.electronAPI?.sendDrawing(restored)
        },
      })
    } catch (err) {
      console.error('[DrawingLayer] addDrawing failed:', err)
    }
  }

  // Memoized rendered nodes: only recompute when drawings, transform,
  // or active-tool toggle (erase vs anything else) changes. The erase
  // tool flips `listening` on so per-shape clicks can dispatch deletes;
  // all other tools render shapes as decorative overlays so pointer
  // events fall through to the underlying tool layers.
  const eraseMode = activeTool === ERASE_TOOL
  const onErase = (id: number) => (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    void eraseDrawing(id)
  }
  const renderedDrawings = useMemo(() => drawings.map((d) => {
    const cursor = eraseMode ? 'pointer' : 'default'
    if (d.type === 'freehand' && d.points.length >= 4) {
      const screenPoints = d.points.flatMap((p, i) => i % 2 === 0 ? p * scale + offsetX : p * scale + offsetY)
      // Wider hit-test stroke in erase mode so thin pen strokes are
      // clickable; visual stroke stays at the original width.
      return <Line key={d.id} points={screenPoints} stroke={d.color}
        strokeWidth={d.width * scale} listening={eraseMode}
        hitStrokeWidth={eraseMode ? Math.max(12, d.width * scale + 8) : undefined}
        onClick={eraseMode ? onErase(d.id) : undefined}
        onMouseEnter={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = cursor } : undefined}
        onMouseLeave={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = '' } : undefined}
      />
    }
    if (d.type === 'rect' && d.points.length >= 4) {
      const x1 = d.points[0] * scale + offsetX
      const y1 = d.points[1] * scale + offsetY
      const x2 = d.points[2] * scale + offsetX
      const y2 = d.points[3] * scale + offsetY
      return <Rect key={d.id} x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        stroke={d.color} strokeWidth={d.width * scale} listening={eraseMode}
        onClick={eraseMode ? onErase(d.id) : undefined}
        onMouseEnter={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = cursor } : undefined}
        onMouseLeave={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = '' } : undefined}
      />
    }
    if (d.type === 'circle' && d.points.length >= 4) {
      const cx = d.points[0] * scale + offsetX
      const cy = d.points[1] * scale + offsetY
      const dx = d.points[2] - d.points[0]
      const dy = d.points[3] - d.points[1]
      const radius = Math.sqrt(dx * dx + dy * dy) * scale
      return <Circle key={d.id} x={cx} y={cy} radius={radius}
        stroke={d.color} strokeWidth={d.width * scale} listening={eraseMode}
        onClick={eraseMode ? onErase(d.id) : undefined}
        onMouseEnter={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = cursor } : undefined}
        onMouseLeave={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = '' } : undefined}
      />
    }
    if (d.type === 'text' && d.points.length >= 2) {
      const tx = d.points[0] * scale + offsetX
      const ty = d.points[1] * scale + offsetY
      return <KonvaText key={d.id} x={tx} y={ty} text={d.text ?? ''}
        fontSize={14 * scale} fill={d.color} listening={eraseMode}
        onClick={eraseMode ? onErase(d.id) : undefined}
        onMouseEnter={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = cursor } : undefined}
        onMouseLeave={eraseMode ? (e) => { const s = e.target.getStage(); if (s) s.container().style.cursor = '' } : undefined}
      />
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [drawings, scale, offsetX, offsetY, eraseMode])

  function renderCurrentPath() {
    if (currentPath.length < 2) return null
    if (activeTool === 'draw-freehand') {
      const screenPoints = currentPath.flatMap((p, i) => i % 2 === 0 ? p * scale + offsetX : p * scale + offsetY)
      return <Line points={screenPoints} stroke={drawColor} strokeWidth={drawWidth * scale} listening={false} />
    }
    if (activeTool === 'draw-rect') {
      const x1 = currentPath[0] * scale + offsetX
      const y1 = currentPath[1] * scale + offsetY
      const x2 = currentPath[2] * scale + offsetX
      const y2 = currentPath[3] * scale + offsetY
      return <Rect x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        stroke={drawColor} strokeWidth={drawWidth * scale} dash={[4, 3]} listening={false} />
    }
    if (activeTool === 'draw-circle') {
      const cx = currentPath[0] * scale + offsetX
      const cy = currentPath[1] * scale + offsetY
      const dx = currentPath[2] - currentPath[0]
      const dy = currentPath[3] - currentPath[1]
      const radius = Math.sqrt(dx * dx + dy * dy) * scale
      return <Circle x={cx} y={cy} radius={radius}
        stroke={drawColor} strokeWidth={drawWidth * scale} dash={[4, 3]} listening={false} />
    }
    return null
  }

  function commitPendingText() {
    if (!pendingText || !pendingTextValue.trim()) { setPendingText(null); return }
    addDrawing({ type: 'text', points: [pendingText.mapX, pendingText.mapY], color: drawColor, width: drawWidth, text: pendingTextValue.trim() })
    setPendingText(null)
    setPendingTextValue('')
  }

  return (
    <Layer
      listening={isLayerListening}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Full-canvas transparent hit target. Without this, empty-space
          clicks on the map never bubble to the Layer's onMouseDown since
          every rendered drawing uses listening:false. */}
      {isDrawingActive && (
        <Rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(0,0,0,0.001)" listening />
      )}
      {renderedDrawings}
      {isDrawingActive && renderCurrentPath()}

      {pendingText && (
        <Html divProps={{ style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } }}>
          <div style={{ position: 'fixed', left: pendingText.screenX, top: pendingText.screenY, zIndex: 9999, pointerEvents: 'all' }}>
            <input
              ref={textInputRef}
              value={pendingTextValue}
              onChange={(e) => setPendingTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitPendingText() }
                if (e.key === 'Escape') { setPendingText(null) }
              }}
              onBlur={commitPendingText}
              placeholder="Text eingeben…"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent-blue)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
                padding: '3px 8px',
                outline: 'none',
                minWidth: 140,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </Html>
      )}
    </Layer>
  )
}

/**
 * Per-shape hit-testing for the context-menu engine. Map-space
 * coordinates throughout (caller converts the click). `tolerance` is
 * the half-width of the hit band, also in map units, so the same
 * value works regardless of zoom — the caller scales it from a
 * screen-space target tolerance (e.g. 8px) by the current map scale.
 *
 * Drawings are stroke-only in BoltBerry (no fill), so for rect /
 * circle the hit means "within tolerance of the perimeter". Freehand
 * uses point-to-segment distance; text uses a bounding-box check
 * around the anchor point.
 */
function hitTestDrawing(d: Drawing, p: { x: number; y: number }, tolerance: number): boolean {
  const tol = tolerance + d.width / 2
  if (d.type === 'freehand') {
    const pts = d.points
    if (pts.length < 4) return false
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (distancePointToSegment(p.x, p.y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= tol) return true
    }
    return false
  }
  if (d.type === 'rect' && d.points.length >= 4) {
    const [x1, y1, x2, y2] = d.points
    const left = Math.min(x1, x2), right = Math.max(x1, x2)
    const top = Math.min(y1, y2), bottom = Math.max(y1, y2)
    // Stroke-only: hit if within tol of any of the 4 sides.
    return (
      Math.abs(p.x - left) <= tol && p.y >= top - tol && p.y <= bottom + tol ||
      Math.abs(p.x - right) <= tol && p.y >= top - tol && p.y <= bottom + tol ||
      Math.abs(p.y - top) <= tol && p.x >= left - tol && p.x <= right + tol ||
      Math.abs(p.y - bottom) <= tol && p.x >= left - tol && p.x <= right + tol
    )
  }
  if (d.type === 'circle' && d.points.length >= 4) {
    const cx = d.points[0], cy = d.points[1]
    const dx = d.points[2] - cx, dy = d.points[3] - cy
    const radius = Math.sqrt(dx * dx + dy * dy)
    const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
    return Math.abs(dist - radius) <= tol
  }
  if (d.type === 'text' && d.points.length >= 2) {
    // Text drawings use a font size of 14px in screen space — bbox is
    // approximate; the caller's tolerance covers the slop.
    const tx = d.points[0], ty = d.points[1]
    const text = d.text ?? ''
    const widthEst = text.length * 8 + tol * 2
    const heightEst = 18 + tol * 2
    return p.x >= tx - tol && p.x <= tx + widthEst && p.y >= ty - tol && p.y <= ty + heightEst
  }
  return false
}

function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
}

async function loadDrawings(mapId: number): Promise<Drawing[]> {
  if (!window.electronAPI) return []
  try {
    // The handler parses both modern array-shaped and legacy
    // `{x,y,text}` object-shaped `points` columns into the canonical
    // numeric-array form — no more renderer-side JSON parsing.
    const rows = await window.electronAPI.drawings.listByMap(mapId)
    return rows.map((r) => ({
      id: r.id,
      mapId: r.mapId,
      type: r.type,
      points: r.points,
      color: r.color,
      width: r.width,
      text: r.text,
      synced: r.synced,
    }))
  } catch (err) {
    console.error('[DrawingLayer] loadDrawings failed:', err)
    return []
  }
}