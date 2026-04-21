import { useRef, useEffect } from 'react'
import { Layer, Rect } from 'react-konva'
import Konva from 'konva'
import type { RefObject } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore, mapToScreenPure } from '../../stores/mapTransformStore'

interface PointerLayerProps {
  stageRef: RefObject<Konva.Stage>
}

/**
 * Custom window event other components can dispatch to fire a ping at a
 * given map coordinate without having to switch to the pointer tool
 * first. Used by the canvas context menu's "📡 Hier pingen" entry.
 */
export const POINTER_PING_EVENT = 'pointer:ping'
export interface PointerPingDetail { x: number; y: number }

function pulseAt(layer: Konva.Layer, screenX: number, screenY: number) {
  const dot = new Konva.Circle({
    x: screenX, y: screenY, radius: 7,
    fill: '#f59e0b', opacity: 0.95, listening: false,
  })
  const ring1 = new Konva.Circle({
    x: screenX, y: screenY, radius: 12,
    fill: 'transparent', stroke: '#f59e0b', strokeWidth: 2.5,
    opacity: 1, listening: false,
  })
  const ring2 = new Konva.Circle({
    x: screenX, y: screenY, radius: 12,
    fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.5,
    opacity: 0.6, listening: false,
  })
  layer.add(dot)
  layer.add(ring1)
  layer.add(ring2)
  new Konva.Tween({ node: dot,   duration: 0.8, opacity: 0, easing: Konva.Easings.EaseOut, onFinish: () => dot.destroy() }).play()
  new Konva.Tween({ node: ring1, duration: 1.2, opacity: 0, scaleX: 3.5, scaleY: 3.5, easing: Konva.Easings.EaseOut, onFinish: () => ring1.destroy() }).play()
  new Konva.Tween({ node: ring2, duration: 1.8, opacity: 0, scaleX: 6, scaleY: 6, easing: Konva.Easings.EaseOut, onFinish: () => ring2.destroy() }).play()
}

export function PointerLayer({ stageRef }: PointerLayerProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const screenToMap = useMapTransformStore((s) => s.screenToMap)
  const canvasW = useMapTransformStore((s) => s.canvasW)
  const canvasH = useMapTransformStore((s) => s.canvasH)
  const layerRef = useRef<Konva.Layer>(null)

  useEffect(() => {
    return () => {
      layerRef.current?.destroyChildren()
    }
  }, [])

  // Listen for programmatic pings dispatched by other components. The
  // coords arrive in map-image space; convert them to canvas/screen
  // coords via the current map transform so the pulse lines up with
  // whatever the DM has zoomed/panned to.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PointerPingDetail>).detail
      if (!detail) return
      window.electronAPI?.sendPointer({ x: detail.x, y: detail.y })
      const layer = layerRef.current
      if (!layer) return
      const { scale, offsetX, offsetY } = useMapTransformStore.getState()
      const s = mapToScreenPure(detail.x, detail.y, scale, offsetX, offsetY)
      pulseAt(layer, s.x, s.y)
    }
    window.addEventListener(POINTER_PING_EVENT, handler)
    return () => window.removeEventListener(POINTER_PING_EVENT, handler)
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

    const layer = layerRef.current
    if (!layer) return
    pulseAt(layer, pos.x, pos.y)
  }

  // The Layer is always mounted so the ping-event listener has a valid
  // target for its pulse animation regardless of the active tool.
  // Click handling is still gated on the pointer tool — see handleClick.
  // When the pointer tool is active, a transparent full-canvas hit
  // rect gives Konva a listening shape to dispatch clicks onto. Without
  // it, empty-canvas clicks never reach `handleClick` because all
  // MapLayer shapes are `listening={false}`.
  const pointerActive = activeTool === 'pointer'
  return (
    <Layer
      ref={layerRef}
      listening={pointerActive}
      onClick={handleClick}
    >
      {pointerActive && (
        <Rect
          x={0}
          y={0}
          width={canvasW}
          height={canvasH}
          fill="rgba(0,0,0,0.001)"
          listening
        />
      )}
    </Layer>
  )
}
