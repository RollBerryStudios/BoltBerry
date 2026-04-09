import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Layer, Line, Group, Text, Circle } from 'react-konva'
import { useRoomStore } from '../../stores/roomStore'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

interface Point {
  x: number
  y: number
}

interface RoomLayerProps {
  mapId: number
  stageRef: React.RefObject<any>
  gridSize: number
}

const VISIBILITY_COLORS: Record<string, { fill: string; stroke: string }> = {
  hidden: { fill: 'rgba(59, 130, 246, 0.08)', stroke: 'rgba(59, 130, 246, 0.6)' },
  revealed: { fill: 'rgba(34, 197, 94, 0.08)', stroke: 'rgba(34, 197, 94, 0.6)' },
  dimmed: { fill: 'rgba(245, 158, 0, 0.08)', stroke: 'rgba(245, 158, 0, 0.6)' },
}

export function RoomLayer({ mapId, stageRef, gridSize }: RoomLayerProps) {
  const rooms = useRoomStore((s) => s.rooms.filter((r) => r.mapId === mapId))
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId)
  const { updateRoom, setSelectedRoomId, addRoom, removeRoom } = useRoomStore()
  const activeTool = useUIStore((s) => s.activeTool)
  const scale = useMapTransformStore((s) => s.scale)

  const [drawingPoints, setDrawingPoints] = useState<Point[]>([])
  const [previewPoint, setPreviewPoint] = useState<Point | null>(null)
  const [contextMenu, setContextMenu] = useState<{ roomId: number; x: number; y: number } | null>(null)

  const isRoomTool = activeTool === 'room'

  const parsedRooms = useMemo(() => {
    return rooms.map((room) => {
      let points: Point[] = []
      try {
        points = JSON.parse(room.polygon)
        if (!Array.isArray(points)) points = []
      } catch {
        points = []
      }
      return { ...room, parsedPoints: points }
    })
  }, [rooms])

  const handleStageClick = useCallback((e: any) => {
    if (!isRoomTool) return
    const stage = stageRef.current
    if (!stage) return

    const pos = stage.getPointerPosition()
    if (!pos) return
    const mapPos = useMapTransformStore.getState().screenToMap(pos.x, pos.y)

    if (e.evt.button === 2) return

    setDrawingPoints((prev) => [...prev, { x: Math.round(mapPos.x), y: Math.round(mapPos.y) }])
  }, [isRoomTool, stageRef])

  const handleStageMouseMove = useCallback((e: any) => {
    if (drawingPoints.length === 0 || !isRoomTool) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const mapPos = useMapTransformStore.getState().screenToMap(pos.x, pos.y)
    setPreviewPoint({ x: Math.round(mapPos.x), y: Math.round(mapPos.y) })
  }, [drawingPoints.length, isRoomTool, stageRef])

  const finishRoom = useCallback(async () => {
    if (drawingPoints.length < 3) {
      setDrawingPoints([])
      setPreviewPoint(null)
      return
    }
    const polygon = JSON.stringify(drawingPoints)
    try {
      const result = await window.electronAPI?.dbRun(
        'INSERT INTO rooms (map_id, name, polygon, visibility, color) VALUES (?, ?, ?, ?, ?)',
        [mapId, 'Neuer Raum', polygon, 'hidden', '#3b82f6'],
      )
      if (result) {
        addRoom({
          id: result.lastInsertRowid,
          mapId,
          name: 'Neuer Raum',
          description: '',
          polygon,
          visibility: 'hidden',
          encounterId: null,
          atmosphereHint: null,
          notes: null,
          color: '#3b82f6',
          createdAt: new Date().toISOString(),
        })
        setSelectedRoomId(result.lastInsertRowid)
      }
    } catch (err) {
      console.error('[RoomLayer] create room failed:', err)
    }
    setDrawingPoints([])
    setPreviewPoint(null)
  }, [drawingPoints, mapId, addRoom, setSelectedRoomId])

  const handleDoubleClick = useCallback(() => {
    if (drawingPoints.length >= 3) finishRoom()
  }, [drawingPoints.length, finishRoom])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRoomTool) return
    if (e.key === 'Escape') {
      setDrawingPoints([])
      setPreviewPoint(null)
    } else if (e.key === 'Enter' && drawingPoints.length >= 3) {
      finishRoom()
    }
  }, [isRoomTool, drawingPoints.length, finishRoom])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (!isRoomTool) {
      setDrawingPoints([])
      setPreviewPoint(null)
    }
  }, [isRoomTool])

  const handleRoomClick = useCallback((roomId: number) => {
    setSelectedRoomId(roomId)
  }, [setSelectedRoomId])

  const handleRoomRightClick = useCallback((e: any, roomId: number) => {
    e.evt.preventDefault()
    const pos = e.evt
    setContextMenu({ roomId, x: pos.offsetX ?? pos.clientX, y: pos.offsetY ?? pos.clientY })
  }, [])

  return (
    <Layer
      listening={isRoomTool || selectedRoomId !== null}
      onClick={isRoomTool ? handleStageClick : undefined}
      onMouseMove={isRoomTool ? handleStageMouseMove : undefined}
      onDblClick={isRoomTool ? handleDoubleClick : undefined}
    >
      {parsedRooms.map((room) => {
        const pts = room.parsedPoints
        if (pts.length < 3) return null
        const flatPoints = pts.flatMap((p) => [p.x, p.y])
        const colors = VISIBILITY_COLORS[room.visibility] ?? VISIBILITY_COLORS.hidden
        const isSelected = room.id === selectedRoomId
        const overrideFill = room.color ? `${room.color}14` : colors.fill
        const overrideStroke = room.color ? `${room.color}99` : colors.stroke

        return (
          <Group key={room.id} onClick={() => handleRoomClick(room.id)} onContextMenu={(e) => handleRoomRightClick(e, room.id)}>
            <Line
              points={flatPoints}
              closed
              fill={overrideFill}
              stroke={isSelected ? '#ffffff' : overrideStroke}
              strokeWidth={isSelected ? 2 / scale : 1.5 / scale}
              dash={isSelected ? undefined : [6 / scale, 4 / scale]}
            />
            <Text
              text={room.name}
              x={pts.reduce((s, p) => s + p.x, 0) / pts.length}
              y={pts.reduce((s, p) => s + p.y, 0) / pts.length}
              fontSize={14 / scale}
              fill={room.color || '#94a3b8'}
              fontStyle="bold"
              offsetY={7 / scale}
              align="center"
            />
          </Group>
        )
      })}

      {drawingPoints.length > 0 && (
        <Line
          points={[
            ...drawingPoints.flatMap((p) => [p.x, p.y]),
            ...(previewPoint ? [previewPoint.x, previewPoint.y] : []),
            drawingPoints[0].x, drawingPoints[0].y,
          ]}
          closed={false}
          stroke="#f59e0b"
          strokeWidth={2 / scale}
          dash={[4 / scale, 4 / scale]}
        />
      )}

      {drawingPoints.map((p, i) => (
        <Circle
          key={`dp-${i}`}
          x={p.x}
          y={p.y}
          radius={4 / scale}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={1 / scale}
        />
      ))}
    </Layer>
  )
}