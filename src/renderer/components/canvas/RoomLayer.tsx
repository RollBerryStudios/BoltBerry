import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Layer, Line, Group, Rect, Text, Circle } from 'react-konva'
import { useRoomStore } from '../../stores/roomStore'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { pushAction } from '../../stores/undoStore'

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

  const isRoomTool = activeTool === 'room'
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const canvasW = useMapTransformStore((s) => s.canvasW)
  const canvasH = useMapTransformStore((s) => s.canvasH)

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
      const createPatch = {
        mapId,
        name: 'Neuer Raum',
        polygon,
        visibility: 'hidden' as const,
        color: '#3b82f6',
      }
      await pushAction({ type: 'room.create', payload: { patch: createPatch } })
      const created = useRoomStore.getState().rooms[useRoomStore.getState().rooms.length - 1]
      if (created) setSelectedRoomId(created.id)
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
    if (e.key === 'Escape' && drawingPoints.length > 0) {
      // Capture-phase + stopImmediate so the global Escape handler
      // doesn't also fire and flip the tool to 'select' — which would
      // drop the user out of the Room tool mid-polygon.
      e.stopImmediatePropagation()
      e.preventDefault()
      setDrawingPoints([])
      setPreviewPoint(null)
    } else if (e.key === 'Enter' && drawingPoints.length >= 3) {
      finishRoom()
    }
  }, [isRoomTool, drawingPoints.length, finishRoom])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
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

  return (
    <Layer
      // Only listen while the Room tool is active. Previously the
      // layer also listened whenever *any* room existed so the user
      // could click an existing polygon to re-select it — but with
      // listening on, the filled polygon (fill alpha ≈ 8%) was a Konva
      // hit target sitting over the token layer, so token drag inside
      // a room silently failed: mousedown landed on the room shape and
      // the token's drag never armed. Selecting a room now requires
      // entering the Room tool (matching how Wall / Door / Drawing
      // selection works), which is the same pattern the toolbar already
      // uses for the other geometry layers.
      listening={isRoomTool}
      onClick={isRoomTool ? handleStageClick : undefined}
      onMouseMove={isRoomTool ? handleStageMouseMove : undefined}
      onDblClick={isRoomTool ? handleDoubleClick : undefined}
    >
      {/* Full-canvas transparent hit target so empty-space clicks reach
          handleStageClick — required to drop the first polygon vertex
          before any room exists. */}
      {isRoomTool && (
        <Rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(0,0,0,0.001)" listening />
      )}
      {parsedRooms.map((room) => {
        const pts = room.parsedPoints
        if (pts.length < 3) return null
        const flatPoints = pts.flatMap((p) => [p.x, p.y])
        const colors = VISIBILITY_COLORS[room.visibility] ?? VISIBILITY_COLORS.hidden
        const isSelected = room.id === selectedRoomId
        const overrideFill = room.color ? `${room.color}14` : colors.fill
        const overrideStroke = room.color ? `${room.color}99` : colors.stroke

        const screenPoints = pts.flatMap((p) => [p.x * scale + offsetX, p.y * scale + offsetY])
        const labelX = (pts.reduce((s, p) => s + p.x, 0) / pts.length) * scale + offsetX
        const labelY = (pts.reduce((s, p) => s + p.y, 0) / pts.length) * scale + offsetY

        return (
          <Group key={room.id} onClick={() => handleRoomClick(room.id)}>
            <Line
              points={screenPoints}
              closed
              fill={overrideFill}
              stroke={isSelected ? '#ffffff' : overrideStroke}
              strokeWidth={isSelected ? 2 : 1.5}
              dash={isSelected ? undefined : [6, 4]}
            />
            <Text
              text={room.name}
              x={labelX}
              y={labelY}
              fontSize={14}
              fill={room.color || '#94a3b8'}
              fontStyle="bold"
              offsetY={7}
              align="center"
            />
          </Group>
        )
      })}

      {drawingPoints.length > 0 && (
        <Line
          points={[
            ...drawingPoints.flatMap((p) => [p.x * scale + offsetX, p.y * scale + offsetY]),
            ...(previewPoint ? [previewPoint.x * scale + offsetX, previewPoint.y * scale + offsetY] : []),
            drawingPoints[0].x * scale + offsetX, drawingPoints[0].y * scale + offsetY,
          ]}
          closed={false}
          stroke="#f59e0b"
          strokeWidth={2}
          dash={[4, 4]}
        />
      )}

      {drawingPoints.map((p, i) => (
        <Circle
          key={`dp-${i}`}
          x={p.x * scale + offsetX}
          y={p.y * scale + offsetY}
          radius={4}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={1}
        />
      ))}
    </Layer>
  )
}
