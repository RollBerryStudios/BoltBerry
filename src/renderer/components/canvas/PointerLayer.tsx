import { useRef, useEffect } from 'react'
import { Layer } from 'react-konva'
import Konva from 'konva'
import type { RefObject } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

interface PointerLayerProps {
  stageRef: RefObject<Konva.Stage>
}

export function PointerLayer({ stageRef }: PointerLayerProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const screenToMap = useMapTransformStore((s) => s.screenToMap)
  const layerRef = useRef<Konva.Layer>(null)

  // Destroy all imperatively-created Konva nodes when component unmounts
  // (prevents orphaned nodes if unmount happens during a tween)
  useEffect(() => {
    return () => {
      layerRef.current?.destroyChildren()
    }
  }, [])

  function handleClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (activeTool !== 'pointer') return
    if (e.evt.button !== 0) return
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    const mapPos = screenToMap(pos.x, pos.y)
    window.electronAPI?.sendPointer({ x: mapPos.x, y: mapPos.y })

    // Animated pulse on DM canvas (imperative Konva)
    const layer = layerRef.current
    if (!layer) return

    const dot = new Konva.Circle({
      x: pos.x, y: pos.y, radius: 7,
      fill: '#f59e0b', opacity: 0.95, listening: false,
    })
    const ring1 = new Konva.Circle({
      x: pos.x, y: pos.y, radius: 12,
      fill: 'transparent', stroke: '#f59e0b', strokeWidth: 2.5,
      opacity: 1, listening: false,
    })
    const ring2 = new Konva.Circle({
      x: pos.x, y: pos.y, radius: 12,
      fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.5,
      opacity: 0.6, listening: false,
    })
    layer.add(dot)
    layer.add(ring1)
    layer.add(ring2)

    new Konva.Tween({ node: dot,  duration: 0.8, opacity: 0, easing: Konva.Easings.EaseOut, onFinish: () => dot.destroy() }).play()
    new Konva.Tween({ node: ring1, duration: 1.2, opacity: 0, scaleX: 3.5, scaleY: 3.5, easing: Konva.Easings.EaseOut, onFinish: () => ring1.destroy() }).play()
    new Konva.Tween({ node: ring2, duration: 1.8, opacity: 0, scaleX: 6, scaleY: 6, easing: Konva.Easings.EaseOut, onFinish: () => ring2.destroy() }).play()
  }

  if (activeTool !== 'pointer') return null

  return <Layer ref={layerRef} onClick={handleClick} />
}
