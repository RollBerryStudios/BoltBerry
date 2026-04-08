import { useState, useEffect, RefObject } from 'react'
import { Layer, Line, Rect, Circle, Text as KonvaText, Shape } from 'react-konva'
import Konva from 'konva'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

export type DrawingType = 'freehand' | 'rect' | 'circle' | 'text'

interface Drawing {
  id: number
  type: DrawingType
  points: number[]
  color: string
  width: number
}

interface DrawingLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

const DRAWING_TOOLS = new Set<string>(['draw-freehand', 'draw-rect', 'draw-circle', 'draw-text'])

export function DrawingLayer({ stageRef, mapId, gridSize }: DrawingLayerProps) {
  const { activeTool } = useUIStore()
  const { scale, offsetX, offsetY, screenToMap } = useMapTransformStore()
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [currentPath, setCurrentPath] = useState<number[]>([])
  const [drawingColor, setDrawingColor] = useState('#ff6b6b')
  const [drawingWidth, setDrawingWidth] = useState(3)
  const [loadedMapId, setLoadedMapId] = useState<number | null>(null)

  useEffect(() => {
    loadDrawings(mapId).then(setDrawings)
    setLoadedMapId(mapId)
  }, [mapId])

  const isDrawingActive = DRAWING_TOOLS.has(activeTool)

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
      const label = prompt('Text:')
      if (label) {
        addDrawing({ type: 'text', points: [pos.x, pos.y], color: drawingColor, width: drawingWidth, text: label })
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
    if (!isDrawingActive || currentPath.length < 2) { setCurrentPath([]); return }

    const type: DrawingType =
      activeTool === 'draw-freehand' ? 'freehand' :
      activeTool === 'draw-rect' ? 'rect' :
      activeTool === 'draw-circle' ? 'circle' : 'freehand'

    addDrawing({ type, points: currentPath, color: drawingColor, width: drawingWidth })
    setCurrentPath([])
  }

  async function addDrawing(d: { type: DrawingType; points: number[]; color: string; width: number; text?: string }) {
    if (!window.electronAPI) return
    try {
      const pointsStr = d.type === 'text' ? JSON.stringify({ x: d.points[0], y: d.points[1], text: d.text }) : JSON.stringify(d.points)
      const result = await window.electronAPI.dbRun(
        'INSERT INTO drawings (map_id, type, points, color, width, synced) VALUES (?, ?, ?, ?, ?, 1)',
        [mapId, d.type, pointsStr, d.color, d.width]
      )
      const newDrawing: Drawing = { id: result.lastInsertRowid, type: d.type, points: d.points, color: d.color, width: d.width }
      setDrawings([...drawings, newDrawing])
      window.electronAPI?.sendDrawing(newDrawing)
    } catch (err) {
      console.error('[DrawingLayer] addDrawing failed:', err)
    }
  }

  function renderDrawing(d: Drawing) {
    if (d.type === 'freehand' && d.points.length >= 4) {
      const screenPoints = d.points.flatMap((p, i) => i % 2 === 0 ? p * scale + offsetX : p * scale + offsetY)
      return <Line key={d.id} points={screenPoints} stroke={d.color} strokeWidth={d.width * scale} listening={false} />
    }
    if (d.type === 'rect' && d.points.length >= 4) {
      const x1 = d.points[0] * scale + offsetX
      const y1 = d.points[1] * scale + offsetY
      const x2 = d.points[2] * scale + offsetX
      const y2 = d.points[3] * scale + offsetY
      return <Rect key={d.id} x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        stroke={d.color} strokeWidth={d.width * scale} listening={false} />
    }
    if (d.type === 'circle' && d.points.length >= 4) {
      const cx = d.points[0] * scale + offsetX
      const cy = d.points[1] * scale + offsetY
      const dx = d.points[2] - d.points[0]
      const dy = d.points[3] - d.points[1]
      const radius = Math.sqrt(dx * dx + dy * dy) * scale
      return <Circle key={d.id} x={cx} y={cy} radius={radius}
        stroke={d.color} strokeWidth={d.width * scale} listening={false} />
    }
    return null
  }

  function renderCurrentPath() {
    if (currentPath.length < 2) return null
    if (activeTool === 'draw-freehand') {
      const screenPoints = currentPath.flatMap((p, i) => i % 2 === 0 ? p * scale + offsetX : p * scale + offsetY)
      return <Line points={screenPoints} stroke={drawingColor} strokeWidth={drawingWidth * scale} listening={false} />
    }
    if (activeTool === 'draw-rect') {
      const x1 = currentPath[0] * scale + offsetX
      const y1 = currentPath[1] * scale + offsetY
      const x2 = currentPath[2] * scale + offsetX
      const y2 = currentPath[3] * scale + offsetY
      return <Rect x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        stroke={drawingColor} strokeWidth={drawingWidth * scale} dash={[4, 3]} listening={false} />
    }
    if (activeTool === 'draw-circle') {
      const cx = currentPath[0] * scale + offsetX
      const cy = currentPath[1] * scale + offsetY
      const dx = currentPath[2] - currentPath[0]
      const dy = currentPath[3] - currentPath[1]
      const radius = Math.sqrt(dx * dx + dy * dy) * scale
      return <Circle x={cx} y={cy} radius={radius}
        stroke={drawingColor} strokeWidth={drawingWidth * scale} dash={[4, 3]} listening={false} />
    }
    return null
  }

  return (
    <Layer
      listening={isDrawingActive}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {drawings.map(renderDrawing)}
      {isDrawingActive && renderCurrentPath()}
    </Layer>
  )
}

async function loadDrawings(mapId: number): Promise<Drawing[]> {
  if (!window.electronAPI) return []
  try {
    const rows = await window.electronAPI.dbQuery<{
      id: number; type: string; points: string; color: string; width: number
    }>('SELECT id, type, points, color, width FROM drawings WHERE map_id = ?', [mapId])
    return rows.map((r) => ({ id: r.id, type: r.type as DrawingType, points: JSON.parse(r.points), color: r.color, width: r.width }))
  } catch (err) {
    console.error('[DrawingLayer] loadDrawings failed:', err)
    return []
  }
}