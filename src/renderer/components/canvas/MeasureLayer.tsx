import { useRef, useState, useEffect, RefObject } from 'react'
import { Layer, Line, Circle, Text } from 'react-konva'
import Konva from 'konva'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

interface MeasureLayerProps {
  stageRef: RefObject<Konva.Stage>
  gridSize: number
  ftPerUnit: number
}

interface MeasureState {
  startX: number
  startY: number
  endX: number
  endY: number
  active: boolean
}

const MEASURE_TOOLS = new Set(['measure-line', 'measure-circle', 'measure-cone'])

export function MeasureLayer({ stageRef, gridSize, ftPerUnit }: MeasureLayerProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const screenToMap = useMapTransformStore((s) => s.screenToMap)
  const [measure, setMeasure] = useState<MeasureState | null>(null)

  // Clear measure when switching away from measure tools (in useEffect, not render)
  useEffect(() => {
    if (!MEASURE_TOOLS.has(activeTool) && measure) {
      setMeasure(null)
      window.electronAPI?.sendMeasure(null)
    }
  }, [activeTool])

  function getMapPos() {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return screenToMap(pos.x, pos.y)
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button !== 0) return
    const pos = getMapPos()
    if (!pos) return
    setMeasure({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y, active: true })
  }

  function handleMouseMove() {
    if (!measure?.active) return
    const pos = getMapPos()
    if (!pos) return
    setMeasure((m) => m ? { ...m, endX: pos.x, endY: pos.y } : null)
  }

  function handleMouseUp() {
    if (measure) {
      const finalMeasure = { ...measure, active: false }
      setMeasure(finalMeasure)
      sendMeasureToPlayer(finalMeasure)
    }
  }

  useEffect(() => {
    if (measure?.active) sendMeasureToPlayer(measure)
  }, [measure?.endX, measure?.endY])

  function sendMeasureToPlayer(m: MeasureState | null) {
    if (!m || !window.electronAPI) return
    const dx = m.endX - m.startX
    const dy = m.endY - m.startY
    const distMapPx = Math.sqrt(dx * dx + dy * dy)
    const distGridUnits = gridSize > 0 ? distMapPx / gridSize : 0
    const dist = Math.round(distGridUnits * ftPerUnit)
    const type: 'line' | 'circle' | 'cone' =
      activeTool === 'measure-line' ? 'line' :
      activeTool === 'measure-circle' ? 'circle' : 'cone'
    window.electronAPI!.sendMeasure({
      type,
      startX: m.startX,
      startY: m.startY,
      endX: m.endX,
      endY: m.endY,
      distance: dist,
    })
  }

  if (!MEASURE_TOOLS.has(activeTool) || !measure) {
    return null
  }

  const { startX, startY, endX, endY } = measure
  const sx = startX * scale + offsetX
  const sy = startY * scale + offsetY
  const ex = endX * scale + offsetX
  const ey = endY * scale + offsetY

  const dx = endX - startX
  const dy = endY - startY
  const distMapPx = Math.sqrt(dx * dx + dy * dy)
  const distGridUnits = gridSize > 0 ? distMapPx / gridSize : 0
  const dist = Math.round(distGridUnits * ftPerUnit)

  return (
    <Layer
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {activeTool === 'measure-line' && (
        <>
          <Line points={[sx, sy, ex, ey]} stroke="#f59e0b" strokeWidth={2}
            dash={[6, 3]} listening={false} />
          <Circle x={sx} y={sy} radius={5} fill="#f59e0b" listening={false} />
          <Circle x={ex} y={ey} radius={5} fill="#f59e0b" listening={false} />
          <Text
            x={(sx + ex) / 2 + 6} y={(sy + ey) / 2 - 8}
            text={`${dist} ft`}
            fontSize={14} fontStyle="bold" fill="#f59e0b"
            shadowColor="black" shadowBlur={4} shadowOpacity={0.9}
            listening={false}
          />
        </>
      )}

      {activeTool === 'measure-circle' && (
        <>
          <Circle x={sx} y={sy} radius={distMapPx * scale}
            stroke="#22c55e" strokeWidth={2}
            fill="rgba(34,197,94,0.08)" dash={[6, 3]} listening={false} />
          <Circle x={sx} y={sy} radius={5} fill="#22c55e" listening={false} />
          <Text x={sx + 8} y={sy - 20} text={`r = ${dist} ft`}
            fontSize={14} fontStyle="bold" fill="#22c55e"
            shadowColor="black" shadowBlur={4} shadowOpacity={0.9}
            listening={false}
          />
        </>
      )}

      {activeTool === 'measure-cone' && (
        (() => {
          const angle = Math.atan2(ey - sy, ex - sx)
          const halfAngle = Math.PI / 6
          const len = distMapPx * scale
          const p1x = sx + len * Math.cos(angle - halfAngle)
          const p1y = sy + len * Math.sin(angle - halfAngle)
          const p2x = sx + len * Math.cos(angle + halfAngle)
          const p2y = sy + len * Math.sin(angle + halfAngle)
          return (
            <>
              <Line points={[sx, sy, p1x, p1y, p2x, p2y, sx, sy]}
                stroke="#a855f7" strokeWidth={2}
                fill="rgba(168,85,247,0.12)" closed
                dash={[6, 3]} listening={false}
              />
              <Text x={(sx + ex) / 2 + 6} y={(sy + ey) / 2 - 8}
                text={`${dist} ft`}
                fontSize={14} fontStyle="bold" fill="#a855f7"
                shadowColor="black" shadowBlur={4} shadowOpacity={0.9}
                listening={false}
              />
            </>
          )
        })()
      )}
    </Layer>
  )
}
