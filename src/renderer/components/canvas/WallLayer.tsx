import { useRef, useState, useEffect, useMemo, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Layer, Line, Circle, Group, Rect, Text } from 'react-konva'
import { Html } from 'react-konva-utils'
import Konva from 'konva'
import { useWallStore } from '../../stores/wallStore'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore, screenToMapPure, mapToScreenPure } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'
import type { WallRecord } from '@shared/ipc-types'

interface WallLayerProps {
  mapId: number
  stageRef: RefObject<Konva.Stage>
  gridSize: number
}

const WALL_COLOR = '#e2e8f0'
const DOOR_COLOR_CLOSED = '#f59e0b'
const DOOR_COLOR_OPEN = '#22c55e'
const WINDOW_COLOR = '#3b82f6'
const WALL_WIDTH = 4
const SELECTED_COLOR = '#2F6BFF'

export function WallLayer({ mapId, stageRef, gridSize }: WallLayerProps) {
  const { t } = useTranslation()
  const { walls, addWall, removeWall, updateWall, toggleDoor } = useWallStore()
  const activeTool = useUIStore((s) => s.activeTool)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const canvasW = useMapTransformStore((s) => s.canvasW)
  const canvasH = useMapTransformStore((s) => s.canvasH)
  const activeMapId = useCampaignStore((s) => s.activeMapId)

  const [selectedWallId, setSelectedWallId] = useState<number | null>(null)
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null)
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; wallId: number } | null>(null)

  const isActive = activeTool === 'wall-draw' || activeTool === 'wall-door'
  const wallTypeForNew: WallRecord['wallType'] = activeTool === 'wall-door' ? 'door' : 'wall'

  useEffect(() => {
    setSelectedWallId(null)
    setDrawingStart(null)
    setPreviewEnd(null)
    setContextMenu(null)
  }, [activeTool])

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isActive) return
    if (e.evt.button !== 0) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const mapPos = screenToMapPure(pos.x, pos.y, scale, offsetX, offsetY)
    setDrawingStart(mapPos)
    setPreviewEnd(mapPos)
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!drawingStart || !isActive) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    setPreviewEnd(screenToMapPure(pos.x, pos.y, scale, offsetX, offsetY))
  }

  async function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!drawingStart || !isActive) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const mapPos = screenToMapPure(pos.x, pos.y, scale, offsetX, offsetY)

    const dx = Math.abs(mapPos.x - drawingStart.x)
    const dy = Math.abs(mapPos.y - drawingStart.y)
    const minLen = 2

    if (dx > minLen || dy > minLen) {
      if (!window.electronAPI || !activeMapId) { setDrawingStart(null); setPreviewEnd(null); return }
      // Freeze the segment + map id in closure-locals so the undo
      // command survives later state changes.
      const segment = {
        mapId: activeMapId,
        x1: drawingStart.x, y1: drawingStart.y,
        x2: mapPos.x,       y2: mapPos.y,
        wallType: wallTypeForNew,
        doorState: 'closed' as const,
      }
      const created = await window.electronAPI.walls.create(segment)
      let currentId: number = created.id
      addWall(created)

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: wallTypeForNew === 'door' ? 'Tür' : 'Wand',
        undo: async () => {
          await window.electronAPI?.walls.delete(currentId)
          useWallStore.getState().removeWall(currentId)
        },
        redo: async () => {
          const r = await window.electronAPI?.walls.create(segment)
          if (!r) return
          currentId = r.id
          useWallStore.getState().addWall(r)
        },
      })
    }

    setDrawingStart(null)
    setPreviewEnd(null)
  }

  function handleWallClick(wallId: number, e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()
    if (!isActive) return
    setSelectedWallId(wallId)

    if (e.evt.button === 2) {
      const stage = stageRef.current
      if (!stage) return
      const containerPos = stage.container().getBoundingClientRect()
      setContextMenu({
        x: e.evt.clientX - containerPos.left,
        y: e.evt.clientY - containerPos.top,
        wallId,
      })
    }
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  async function handleDelete() {
    if (selectedWallId == null) return
    closeContextMenu()
    // Wall deletion is cheap to click (right-click → Löschen) but hard to
    // recover from — walls are what drive LOS, so a mistaken delete can
    // silently reveal hidden rooms to the players. Confirm before acting.
    const ok = await window.electronAPI?.confirmDialog(
      'Wand löschen?',
      'Diese Wand wird entfernt. Sichtbarkeit kann sich für Spieler ändern.',
    )
    if (!ok) { setSelectedWallId(null); return }
    const wallToDelete = walls.find((w) => w.id === selectedWallId)
    removeWall(selectedWallId)
    try {
      await window.electronAPI?.walls.delete(selectedWallId)
      if (wallToDelete) {
        const deleted = wallToDelete
        useUndoStore.getState().pushCommand({
          id: nextCommandId(),
          label: 'Delete wall',
          undo: async () => {
            // Restore with the original id so any outside reference
            // (e.g. a cached LOS segment list that keyed on it) keeps
            // pointing at the same row.
            const restored = await window.electronAPI?.walls.restore(deleted)
            if (restored) useWallStore.getState().addWall(restored)
          },
          redo: async () => {
            removeWall(deleted.id)
            await window.electronAPI?.walls.delete(deleted.id)
          },
        })
      }
    } catch (err) {
      console.error('[WallLayer] delete failed:', err)
    }
    setSelectedWallId(null)
  }

  async function handleToggleType(type: WallRecord['wallType']) {
    if (selectedWallId == null) return
    const wall = walls.find((w) => w.id === selectedWallId)
    if (!wall) return
    closeContextMenu()
    const newState: string = type === 'wall' ? 'closed' : (wall.doorState ?? 'closed')
    updateWall(selectedWallId, { wallType: type, doorState: newState as any })
    try {
      await window.electronAPI?.walls.update(selectedWallId, {
        wallType: type,
        doorState: newState as any,
      })
    } catch (err) {
      console.error('[WallLayer] update failed:', err)
    }
  }

  async function handleToggleDoorState() {
    if (selectedWallId == null) return
    const wall = walls.find((w) => w.id === selectedWallId)
    if (!wall) return
    closeContextMenu()
    toggleDoor(selectedWallId)
    const newState = wall.doorState === 'open' ? 'closed' : 'open'
    try {
      await window.electronAPI?.walls.update(selectedWallId, { doorState: newState })
    } catch (err) {
      console.error('[WallLayer] toggle door failed:', err)
    }
  }

  function getWallColor(wall: WallRecord): string {
    if (wall.id === selectedWallId) return SELECTED_COLOR
    if (wall.wallType === 'door') return wall.doorState === 'open' ? DOOR_COLOR_OPEN : DOOR_COLOR_CLOSED
    if (wall.wallType === 'window') return WINDOW_COLOR
    return WALL_COLOR
  }

  function getWallDash(wall: WallRecord): number[] {
    if (wall.wallType === 'window') return [8, 4]
    if (wall.wallType === 'door' && wall.doorState === 'open') return [6, 6]
    return []
  }

  const displayWalls = useMemo(
    () => walls.filter((w) => w.mapId === activeMapId),
    [walls, activeMapId]
  )

  return (
    <>
      <Layer
        onMouseDown={isActive ? handleMouseDown : undefined}
        onMouseMove={isActive ? handleMouseMove : undefined}
        onMouseUp={isActive ? handleMouseUp : undefined}
        listening={isActive}
      >
        {/* Full-canvas transparent hit target so empty-space clicks bubble
            up to handleMouseDown even before any wall exists. */}
        {isActive && (
          <Rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(0,0,0,0.001)" listening />
        )}
        {displayWalls.map((wall) => {
          const p1 = mapToScreenPure(wall.x1, wall.y1, scale, offsetX, offsetY)
          const p2 = mapToScreenPure(wall.x2, wall.y2, scale, offsetX, offsetY)
          const color = getWallColor(wall)
          const dash = getWallDash(wall)
          const midX = (p1.x + p2.x) / 2
          const midY = (p1.y + p2.y) / 2

          return (
            <Group key={wall.id}>
              <Line
                points={[p1.x, p1.y, p2.x, p2.y]}
                stroke={color}
                strokeWidth={WALL_WIDTH * scale > 1 ? WALL_WIDTH : WALL_WIDTH / scale}
                dash={dash.length > 0 ? dash : undefined}
                hitStrokeWidth={12}
                listening={isActive}
                onClick={(e) => handleWallClick(wall.id, e)}
                onContextMenu={(e) => handleWallClick(wall.id, e)}
                onTap={(e) => handleWallClick(wall.id, e as any)}
              />
              {(wall.wallType === 'door' || wall.wallType === 'window') && (
                <Text
                  x={midX - 5}
                  y={midY - 7}
                  text={wall.wallType === 'door' ? (wall.doorState === 'open' ? '🚪' : '🔒') : '🪟'}
                  fontSize={14}
                  listening={false}
                />
              )}
              {/* Endpoint handles for selected wall */}
              {wall.id === selectedWallId && (
                <>
                  <Circle x={p1.x} y={p1.y} radius={5} fill={SELECTED_COLOR} listening={false} />
                  <Circle x={p2.x} y={p2.y} radius={5} fill={SELECTED_COLOR} listening={false} />
                </>
              )}
            </Group>
          )
        })}

        {/* Wall being drawn preview */}
        {drawingStart && previewEnd && (
          <Line
            points={[
              mapToScreenPure(drawingStart.x, drawingStart.y, scale, offsetX, offsetY).x,
              mapToScreenPure(drawingStart.x, drawingStart.y, scale, offsetX, offsetY).y,
              mapToScreenPure(previewEnd.x, previewEnd.y, scale, offsetX, offsetY).x,
              mapToScreenPure(previewEnd.x, previewEnd.y, scale, offsetX, offsetY).y,
            ]}
            stroke={wallTypeForNew === 'door' ? DOOR_COLOR_CLOSED : WALL_COLOR}
            strokeWidth={WALL_WIDTH}
            dash={[6, 3]}
            listening={false}
          />
        )}
      </Layer>

      {/* Context menu for walls */}
      {contextMenu && isActive && (() => {
        const wall = walls.find((w) => w.id === contextMenu.wallId)
        if (!wall) return null
        return (
          <Html divProps={{ style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } }}>
            <div
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '4px 0',
                minWidth: 140,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                zIndex: 9999,
                pointerEvents: 'all',
              }}
              onMouseLeave={closeContextMenu}
            >
              {(wall.wallType === 'door' || wall.wallType === 'window') && (
                <button
                  style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
                  onClick={handleToggleDoorState}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  {wall.doorState === 'open' ? t('wallMenu.closeDoor') : t('wallMenu.openDoor')}
                </button>
              )}
              <button
                style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
                onClick={() => handleToggleType('door')}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {t('wallMenu.asDoor')}
              </button>
              <button
                style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
                onClick={() => handleToggleType('window')}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {t('wallMenu.asWindow')}
              </button>
              <button
                style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
                onClick={() => handleToggleType('wall')}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {t('wallMenu.asWall')}
              </button>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
              <button
                style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 'var(--text-sm)', color: 'var(--danger)', cursor: 'pointer' }}
                onClick={handleDelete}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {t('wallMenu.delete')}
              </button>
            </div>
          </Html>
        )
      })()}
    </>
  )
}