import { useEffect } from 'react'
import { Layer, Group, Rect, Line, Circle, Text } from 'react-konva'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import type { MapRecord } from '@shared/ipc-types'

/**
 * Renders the Player Control Mode overlay on top of the DM canvas — a
 * dashed accent-blue rectangle framing exactly what the player window
 * is currently showing. Positioned in map-image coordinates so the
 * rect stays anchored when the DM pans / zooms their own view.
 *
 * The rectangle itself is axis-aligned in map space; `rotation` only
 * rotates the content the player sees inside it. We visualise that
 * rotation with a small "up" tick extending from the top edge so the
 * DM can tell at a glance which way is "up" for the players.
 */
export function PlayerViewportLayer({
  map, scale, offsetX, offsetY,
}: {
  map: MapRecord
  scale: number
  offsetX: number
  offsetY: number
}) {
  const active = useUIStore((s) => s.playerViewportMode)
  const rect = useUIStore((s) => s.playerViewport)
  if (!active || !rect) return null

  // Convert map-image pixel coords to canvas pixel coords. The
  // CanvasArea already owns the image→canvas transform; we reuse its
  // scale/offset so the overlay lines up perfectly with the underlying
  // artwork.
  const screenCx = rect.cx * scale + offsetX
  const screenCy = rect.cy * scale + offsetY
  const screenW = rect.w * scale
  const screenH = rect.h * scale

  // Tick length in canvas px, clamped so it stays visible whatever the
  // zoom — long enough to read at 50% zoom, not ridiculous at 200%.
  const tickLen = Math.max(14, Math.min(32, screenH * 0.12))
  // Reuse the accent-blue token from globals.css so the overlay picks
  // up the light/dark-theme variant automatically.
  const strokeColor = '#4A86FF'

  // Pre-rotate the "up" indicator around the rect centre so the DM sees
  // which direction the player has as "up". Konva handles this via a
  // Group with rotation + offsetX/offsetY (pivot = rect centre).
  return (
    <Layer listening={false}>
      <Group
        x={screenCx}
        y={screenCy}
        rotation={rect.rotation}
      >
        {/* The rect itself — dashed, semi-transparent fill so the DM can
            still read the artwork underneath. */}
        <Rect
          x={-screenW / 2}
          y={-screenH / 2}
          width={screenW}
          height={screenH}
          stroke={strokeColor}
          strokeWidth={2}
          dash={[10, 6]}
          fill={'rgba(74, 134, 255, 0.08)'}
          shadowForStrokeEnabled={false}
        />

        {/* Up-indicator — a small "T" extending from the top edge. */}
        <Line
          points={[0, -screenH / 2, 0, -screenH / 2 - tickLen]}
          stroke={strokeColor}
          strokeWidth={2}
          dash={[4, 3]}
        />
        <Circle
          x={0}
          y={-screenH / 2 - tickLen}
          radius={4}
          fill={strokeColor}
        />

        {/* Corner handles — purely visual, but anchor the eye on the
            frame bounds. Not draggable yet; manipulation uses Ctrl+
            mouse/keyboard gestures on the parent canvas. */}
        {[
          [-1, -1], [1, -1], [-1, 1], [1, 1],
        ].map(([sx, sy], i) => (
          <Rect
            key={i}
            x={sx * (screenW / 2) - 4}
            y={sy * (screenH / 2) - 4}
            width={8}
            height={8}
            stroke={strokeColor}
            strokeWidth={1.5}
            fill="#0D1015"
          />
        ))}

        {/* Hotkey hint — only useful at higher zooms. `listening={false}`
            keeps pointer events pass-through to whatever tool is
            active. */}
        {screenH > 120 && (
          <Text
            x={-screenW / 2 + 6}
            y={-screenH / 2 + 6}
            text={`Spieler · ${Math.round(rect.rotation)}°`}
            fill={strokeColor}
            fontFamily="Inter, sans-serif"
            fontSize={11}
            fontStyle="bold"
            listening={false}
          />
        )}
      </Group>
    </Layer>
  )
}

// Silence TS in legacy files that import map-prop expectations.
export type PlayerViewportLayerProps = Parameters<typeof PlayerViewportLayer>[0]

/**
 * Binds window-level Ctrl+drag and Ctrl+wheel gestures for Player
 * Control Mode while the mode is active. Uses capture-phase listeners
 * so the viewport frame wins over whatever tool layer (fog, drawing,
 * walls, …) happens to be catching pointer events — without those
 * layers having to know Player Control Mode exists. Previously the
 * gestures were declared only in `MapLayer`, whose listening-shapes
 * are all `listening={false}`, so the handlers almost never fired in
 * practice and the user saw "shortcuts don't work".
 *
 * Renders nothing — it's mounted alongside `PlayerViewportLayer` in
 * CanvasArea so the hooks run whether or not a map is loaded.
 */
export function PlayerViewportGestures() {
  const active = useUIStore((s) => s.playerViewportMode)

  useEffect(() => {
    if (!active) return
    let dragging = false
    let lastX = 0
    let lastY = 0

    function insideCanvas(target: EventTarget | null): boolean {
      return target instanceof HTMLElement && !!target.closest('.canvas-area')
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (!(e.ctrlKey || e.metaKey)) return
      if (!useUIStore.getState().playerViewport) return
      if (!insideCanvas(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging) return
      e.preventDefault()
      const cur = useUIStore.getState().playerViewport
      if (!cur) { dragging = false; return }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const s = useMapTransformStore.getState().scale || 1
      useUIStore.getState().patchPlayerViewport({
        cx: cur.cx + dx / s,
        cy: cur.cy + dy / s,
      })
    }

    function onMouseUp() { dragging = false }

    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      if (!insideCanvas(e.target)) return
      const cur = useUIStore.getState().playerViewport
      if (!cur) return
      e.preventDefault()
      e.stopPropagation()
      const step = e.deltaY < 0 ? 1.08 : 1 / 1.08
      const MIN = 50
      // Patch w only; aspect lock in the store derives h. Keeps the
      // rect glued to the player window's true aspect ratio.
      useUIStore.getState().patchPlayerViewport({
        w: Math.max(MIN, cur.w * step),
      })
    }

    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mousemove', onMouseMove, true)
      window.removeEventListener('mouseup', onMouseUp, true)
      window.removeEventListener('wheel', onWheel, true)
    }
  }, [active])

  return null
}
