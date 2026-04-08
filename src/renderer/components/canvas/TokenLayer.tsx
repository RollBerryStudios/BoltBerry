import { RefObject, useState, useRef, memo } from 'react'
import { Layer, Group, Image as KonvaImage, Rect, Text, Circle, Line } from 'react-konva'
import { Html } from 'react-konva-utils'
import Konva from 'konva'
import { useTokenStore } from '../../stores/tokenStore'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import type { MapRecord, TokenRecord } from '@shared/ipc-types'
import { useImage } from '../../hooks/useImage'

const STATUS_ICON_MAP: Record<string, string> = {
  blinded: '🫣', charmed: '💫', dead: '💀', deafened: '🔇',
  exhausted: '😫', frightened: '😱', grappled: '🤛', incapacitated: '😵',
  invisible: '👻', paralyzed: '⚡', petrified: '🪨', poisoned: '☠️',
  prone: '⬇️', restrained: '⛓️', stunned: '⭐', unconscious: '💤',
}

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
  const { tokens, moveToken, updateToken, removeToken } = useTokenStore()
  const { activeTool, selectedTokenId, selectedTokenIds, setSelectedToken, toggleTokenInSelection, setSelectedTokens, clearTokenSelection, gridSnap } = useUIStore()
  const { scale, offsetX, offsetY } = useMapTransformStore()
  const [contextMenu, setContextMenu] = useState<ContextMenu>({ visible: false, x: 0, y: 0, tokenId: -1 })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editingHpId, setEditingHpId] = useState<number | null>(null)
  const [editHpCurrent, setEditHpCurrent] = useState('')
  const [editHpMax, setEditHpMax] = useState('')
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  const isDraggable = activeTool === 'select'
  const sortedTokens = [...tokens].sort((a, b) => a.zIndex - b.zIndex)

  async function handleDragEnd(token: TokenRecord, e: Konva.KonvaEventObject<DragEvent>) {
    const sx = e.target.x()
    const sy = e.target.y()
    const dx = sx - (token.x * scale + offsetX)
    const dy = sy - (token.y * scale + offsetY)
    const dmx = dx / scale
    const dmy = dy / scale

    const shouldSnap = gridSnap && map.gridType !== 'none'

    const idsToMove = selectedTokenIds.includes(token.id) ? selectedTokenIds : [token.id]

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
      try {
        await window.electronAPI?.dbRun('UPDATE tokens SET x = ?, y = ? WHERE id = ?', [newX, newY, id])
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
  }

  function handleContextMenu(token: TokenRecord, e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.container().getBoundingClientRect()
    if (!selectedTokenIds.includes(token.id)) {
      setSelectedToken(token.id)
    }
    setContextMenu({
      visible: true,
      x: e.evt.clientX - pos.left,
      y: e.evt.clientY - pos.top,
      tokenId: token.id,
    })
  }

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
    }
    setRubberBand(null)
  }

  function closeContextMenu() {
    setContextMenu((m) => ({ ...m, visible: false }))
  }

  function startEdit(token: TokenRecord) {
    setEditingId(token.id)
    setEditName(token.name)
    closeContextMenu()
  }

  function startEditHp(token: TokenRecord) {
    setEditingHpId(token.id)
    setEditHpCurrent(String(token.hpCurrent))
    setEditHpMax(String(token.hpMax))
    closeContextMenu()
  }

  async function commitEditHp(id: number) {
    const hpCurrent = parseInt(editHpCurrent) || 0
    const hpMax = parseInt(editHpMax) || 0
    updateToken(id, { hpCurrent, hpMax })
    try {
      await window.electronAPI?.dbRun('UPDATE tokens SET hp_current = ?, hp_max = ? WHERE id = ?', [hpCurrent, hpMax, id])
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] commitEditHp failed:', err)
    }
    setEditingHpId(null)
  }

  async function commitEdit(id: number) {
    const name = editName.trim() || 'Token'
    updateToken(id, { name })
    try {
      await window.electronAPI?.dbRun('UPDATE tokens SET name = ? WHERE id = ?', [name, id])
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] commitEdit failed:', err)
    }
    setEditingId(null)
  }

  async function handleDelete(id: number) {
    closeContextMenu()
    const idsToDelete = selectedTokenIds.includes(id) ? selectedTokenIds : [id]
    for (const did of idsToDelete) {
      removeToken(did)
    }
    clearTokenSelection()
    try {
      await window.electronAPI?.dbRun(
        `DELETE FROM tokens WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
        idsToDelete
      )
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] handleDelete failed:', err)
    }
  }

  async function handleDuplicate(token: TokenRecord) {
    closeContextMenu()
    if (!window.electronAPI) return
    const newX = token.x + map.gridSize
    const newY = token.y + map.gridSize
    try {
      const row = await window.electronAPI.dbRun(
        'INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [token.mapId, token.name, token.imagePath, newX, newY, token.size, token.hpCurrent, token.hpMax, token.visibleToPlayers ? 1 : 0,
         token.rotation, token.locked ? 1 : 0, token.zIndex, token.markerColor, token.ac, token.notes,
         token.statusEffects ? JSON.stringify(token.statusEffects) : null]
      )
      useTokenStore.getState().addToken({
        id: row.lastInsertRowid,
        mapId: token.mapId,
        name: token.name,
        imagePath: token.imagePath,
        x: newX,
        y: newY,
        size: token.size,
        hpCurrent: token.hpCurrent,
        hpMax: token.hpMax,
        visibleToPlayers: token.visibleToPlayers,
        rotation: token.rotation,
        locked: token.locked,
        zIndex: token.zIndex,
        markerColor: token.markerColor,
        ac: token.ac,
        notes: token.notes,
        statusEffects: token.statusEffects,
      })
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] handleDuplicate failed:', err)
    }
  }

  async function handleToggleVisibility(token: TokenRecord) {
    closeContextMenu()
    const v = !token.visibleToPlayers
    updateToken(token.id, { visibleToPlayers: v })
    try {
      await window.electronAPI?.dbRun('UPDATE tokens SET visible_to_players = ? WHERE id = ?', [v ? 1 : 0, token.id])
      broadcastTokens(useTokenStore.getState().tokens)
    } catch (err) {
      console.error('[TokenLayer] handleToggleVisibility failed:', err)
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
              editName={editName}
              isEditingHp={editingHpId === token.id}
              editHpCurrent={editHpCurrent}
              editHpMax={editHpMax}
              onEditNameChange={setEditName}
              onEditCommit={() => commitEdit(token.id)}
              onEditHpCurrentChange={setEditHpCurrent}
              onEditHpMaxChange={setEditHpMax}
              onEditHpCommit={() => commitEditHp(token.id)}
              onSelect={(e?: Konva.KonvaEventObject<MouseEvent>) => {
                if (e?.evt?.shiftKey) {
                  toggleTokenInSelection(token.id)
                } else if (!selectedTokenIds.includes(token.id)) {
                  setSelectedToken(token.id)
                }
              }}
              onDblClick={() => startEdit(token)}
              onDragEnd={(e) => handleDragEnd(token, e)}
              onContextMenu={(e) => handleContextMenu(token, e)}
            />
          )
        })}

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
                style={{
                  position: 'fixed',
                  left: contextMenu.x,
                  top: contextMenu.y,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '4px 0',
                  minWidth: 160,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  zIndex: 9999,
                  pointerEvents: 'all',
                }}
                onMouseLeave={closeContextMenu}
              >
                {[
                  { label: '✏️ Umbenennen', action: () => startEdit(token) },
                  { label: '❤️ HP bearbeiten', action: () => startEditHp(token) },
                  { label: token.visibleToPlayers ? '🙈 Verstecken' : '👁 Sichtbar machen', action: () => handleToggleVisibility(token) },
                  { label: '📋 Duplizieren', action: () => handleDuplicate(token) },
                  null,
                  { label: '❌ Löschen', action: () => handleDelete(token.id), danger: true },
                ].map((item, i) =>
                  item === null ? (
                    <div key={i} style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                  ) : (
                    <button
                      key={i}
                      onClick={item.action}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        fontSize: 'var(--text-sm)',
                        color: (item as any).danger ? 'var(--danger)' : 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            </Html>
          )
        })()}
      </Layer>
    </>
  )
}

// ─── Individual Token Node ────────────────────────────────────────────────────

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
  onEditNameChange: (v: string) => void
  onEditCommit: () => void
  onEditHpCurrentChange: (v: string) => void
  onEditHpMaxChange: (v: string) => void
  onEditHpCommit: () => void
  onSelect: (e?: Konva.KonvaEventObject<MouseEvent>) => void
  onDblClick: () => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>) => void
}

const TokenNode = memo(function TokenNode({
  token, x, y, sizePx, isDraggable, isSelected,
  isEditing, editName, isEditingHp, editHpCurrent, editHpMax,
  onEditNameChange, onEditCommit,
  onEditHpCurrentChange, onEditHpMaxChange, onEditHpCommit,
  onSelect, onDblClick, onDragEnd, onContextMenu,
}: TokenNodeProps) {
  const image = useImage(token.imagePath ? `file://${token.imagePath}` : null)
  const r = sizePx / 2
  const hpRatio = token.hpMax > 0 ? Math.max(0, Math.min(1, token.hpCurrent / token.hpMax)) : -1
  const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444'

  return (
    // Outer group: positioned at top-left, handles drag + events
    <Group
      x={x} y={y}
      draggable={isDraggable}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDblClick={onDblClick}
      onContextMenu={onContextMenu}
    >
      {/* Inner group: rotates around token center (r, r) */}
      <Group x={r} y={r} rotation={token.rotation}>
        {/* Marker color ring */}
        {token.markerColor && (
          <Circle
            x={0} y={0} radius={r + 5}
            stroke={token.markerColor} strokeWidth={3}
            fill="transparent" listening={false}
          />
        )}

        {/* Selection ring */}
        {isSelected && (
          <Circle
            x={0} y={0} radius={r + (token.markerColor ? 10 : 3)}
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
          <Text x={r - 14} y={-r - 2} text="🙈" fontSize={12} listening={false} />
        )}
        {token.locked && (
          <Text x={-r} y={-r - 2} text="🔒" fontSize={10} listening={false} />
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

      {/* HP bar (not rotated) */}
      {hpRatio >= 0 && (
        <>
          <Rect x={0} y={sizePx + 3} width={sizePx} height={4}
            fill="#0D1015" cornerRadius={2} listening={false} />
          <Rect x={0} y={sizePx + 3} width={sizePx * hpRatio} height={4}
            fill={hpColor} cornerRadius={2} listening={false} />
        </>
      )}

      {/* Name label (not rotated) */}
      {isEditing ? (
        <Html divProps={{ style: { position: 'absolute', top: 0, left: 0 } }}>
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditCommit()
              if (e.key === 'Escape') onEditCommit()
            }}
            onBlur={onEditCommit}
            style={{
              position: 'absolute',
              left: x - 40,
              top: y + sizePx + (hpRatio >= 0 ? 12 : 5),
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
              top: y + sizePx + 10,
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
                if (e.key === 'Enter') onEditHpCommit()
                if (e.key === 'Escape') onEditHpCommit()
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
                if (e.key === 'Enter') onEditHpCommit()
                if (e.key === 'Escape') onEditHpCommit()
              }}
              onBlur={onEditHpCommit}
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
      ) : (
        <Text
          x={-r}
          y={sizePx + (hpRatio >= 0 ? 11 : 4)}
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
})

function broadcastTokens(tokens: TokenRecord[]) {
  if (useUIStore.getState().sessionMode === 'prep') return
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
      showName: true,
      rotation: t.rotation,
      markerColor: t.markerColor,
      statusEffects: t.statusEffects,
      ac: t.ac,
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}
