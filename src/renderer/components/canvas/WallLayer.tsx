import { useRef, useState, useEffect, useMemo, RefObject } from 'react'
import { Layer, Line, Circle, Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { useWallStore } from '../../stores/wallStore'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore, screenToMapPure, mapToScreenPure } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { pushAction } from '../../stores/undoStore'
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
  const { walls, addWall, removeWall, updateWall } = useWallStore()
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

  const isActive = activeTool === 'wall-draw' || activeTool === 'wall-door'
  const wallTypeForNew: WallRecord['wallType'] = activeTool === 'wall-door' ? 'door' : 'wall'

  useEffect(() => {
    setSelectedWallId(null)
    setDrawingStart(null)
    setPreviewEnd(null)
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
      // AP-5: declarative action form — payload is pure JSON, survives
      // serialization and renderer crash replay.
      const segment = {
        mapId: activeMapId,
        x1: drawingStart.x, y1: drawingStart.y,
        x2: mapPos.x,       y2: mapPos.y,
        wallType: wallTypeForNew,
        doorState: 'closed' as const,
      }
      await pushAction({ type: 'wall.create', payload: { segment } })
    }

    setDrawingStart(null)
    setPreviewEnd(null)
  }

  function handleWallClick(wallId: number, e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()
    if (!isActive) return
    // Shift-click toggles multi-selection; plain click resets to a
    // single selection. Mirrors TokenLayer's stableHandleSelect so
    // the wall context menu can show "X Wände gewählt" bulk actions
    // when 2+ walls are picked.
    if (e.evt.shiftKey) {
      useUIStore.getState().toggleWallInSelection(wallId)
    } else {
      useUIStore.getState().setSelectedWalls([wallId])
    }
    setSelectedWallId(wallId)
  }

  // Bridge between the context-menu items (which dispatch
  // `wall:update` / `wall:delete` CustomEvents) and this layer's IPC
  // mutations + LOS / undo wiring.
  useEffect(() => {
    const onUpdate = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { id: number; patch: Partial<WallRecord> }
      const wall = walls.find((w) => w.id === detail.id)
      if (!wall) return
      // Switching to/away from "wall" type also resets door state to a
      // sane default — same logic as the old handleToggleType.
      const patch: Partial<WallRecord> = { ...detail.patch }
      if (patch.wallType && patch.wallType === 'wall') patch.doorState = 'closed' as any
      updateWall(detail.id, patch)
      try {
        await window.electronAPI?.walls.update(detail.id, patch as any)
      } catch (err) {
        console.error('[WallLayer] update failed:', err)
      }
    }
    const onDelete = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { id: number }
      const wallToDelete = walls.find((w) => w.id === detail.id)
      const ok = await window.electronAPI?.confirmDialog(
        'Wand löschen?',
        'Diese Wand wird entfernt. Sichtbarkeit kann sich für Spieler ändern.',
      )
      if (!ok) return
      removeWall(detail.id)
      try {
        await window.electronAPI?.walls.delete(detail.id)
        if (wallToDelete) {
          await pushAction({ type: 'wall.delete', payload: { wall: wallToDelete } })
        }
      } catch (err) {
        console.error('[WallLayer] delete failed:', err)
      }
    }
    const onUpdateMany = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { ids: number[]; patch: Partial<WallRecord> }
      const patch: Partial<WallRecord> = { ...detail.patch }
      if (patch.wallType && patch.wallType === 'wall') patch.doorState = 'closed' as any
      for (const id of detail.ids) {
        updateWall(id, patch)
        try { await window.electronAPI?.walls.update(id, patch as any) }
        catch (err) { console.error('[WallLayer] update-many failed for id', id, err) }
      }
    }
    const onDeleteMany = async (ev: Event) => {
      const { ids } = (ev as CustomEvent).detail as { ids: number[] }
      const ok = await window.electronAPI?.confirmDialog(
        `${ids.length} Wände löschen?`,
        'Die Wände werden entfernt. Sichtbarkeit kann sich für Spieler ändern.',
      )
      if (!ok) return
      for (const id of ids) {
        const target = walls.find((w) => w.id === id)
        removeWall(id)
        try {
          await window.electronAPI?.walls.delete(id)
          if (target) await pushAction({ type: 'wall.delete', payload: { wall: target } })
        } catch (err) {
          console.error('[WallLayer] delete-many failed for id', id, err)
        }
      }
      useUIStore.getState().setSelectedWalls([])
    }
    window.addEventListener('wall:update', onUpdate)
    window.addEventListener('wall:delete', onDelete)
    window.addEventListener('wall:update-many', onUpdateMany)
    window.addEventListener('wall:delete-many', onDeleteMany)
    return () => {
      window.removeEventListener('wall:update', onUpdate)
      window.removeEventListener('wall:delete', onDelete)
      window.removeEventListener('wall:update-many', onUpdateMany)
      window.removeEventListener('wall:delete-many', onDeleteMany)
    }
  }, [walls, updateWall, removeWall, pushAction])

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
            <Group key={wall.id} name="wall-root" id={`wall-${wall.id}`}>
              <Line
                points={[p1.x, p1.y, p2.x, p2.y]}
                stroke={color}
                strokeWidth={WALL_WIDTH * scale > 1 ? WALL_WIDTH : WALL_WIDTH / scale}
                dash={dash.length > 0 ? dash : undefined}
                hitStrokeWidth={12}
                listening={isActive}
                onClick={(e) => handleWallClick(wall.id, e)}
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
    </>
  )
}