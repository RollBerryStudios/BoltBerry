import { useEffect, useRef, RefObject } from 'react'
import { Layer, Image as KonvaImage, Shape } from 'react-konva'
import Konva from 'konva'
import type { MapRecord } from '@shared/ipc-types'
import { DEFAULT_GRID_COLOR } from '@shared/defaults'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useUIStore } from '../../stores/uiStore'
import { useRotatedImage } from '../../hooks/useRotatedImage'

interface MapLayerProps {
  map: MapRecord
  stageRef: RefObject<Konva.Stage>
  canvasSize: { width: number; height: number }
  gridOffsetX: number
  gridOffsetY: number
}

const MIN_SCALE = 0.05
const MAX_SCALE = 12

// Checker-pattern tiles are expensive to allocate — creating a fresh
// canvas + 2D context on every paint caused significant renderer GC
// pressure during pan/zoom. One canvas per tile size is enough.
const checkerCache = new Map<number, HTMLCanvasElement>()
function getCheckerCanvas(sz: number): HTMLCanvasElement {
  let c = checkerCache.get(sz)
  if (c) return c
  c = document.createElement('canvas')
  c.width = sz * 2
  c.height = sz * 2
  const pCtx = c.getContext('2d')!
  pCtx.fillStyle = '#2a2a2a'
  pCtx.fillRect(0, 0, sz, sz)
  pCtx.fillRect(sz, sz, sz, sz)
  pCtx.fillStyle = '#1a1a1a'
  pCtx.fillRect(sz, 0, sz, sz)
  pCtx.fillRect(0, sz, sz, sz)
  checkerCache.set(sz, c)
  return c
}

export function MapLayer({ map, stageRef, canvasSize, gridOffsetX, gridOffsetY }: MapLayerProps) {
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const setTransform = useMapTransformStore((s) => s.setTransform)
  const reset = useMapTransformStore((s) => s.reset)
  const resolvedImagePath = map.imagePath
  const { img: image, imgW: natW, imgH: natH } = useRotatedImage(resolvedImagePath, map.rotation ?? 0)
  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const spaceHeld = useRef(false)
  const cameraInitializedRef = useRef(false)
  const lastMapIdRef = useRef(map.id)

  // Reset camera init flag when map changes
  useEffect(() => {
    if (map.id !== lastMapIdRef.current) {
      cameraInitializedRef.current = false
      lastMapIdRef.current = map.id
    }
  }, [map.id])
  const cameraSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track spacebar for alternate pan
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return
        spaceHeld.current = true
        const el = document.getElementById('root')
        if (el) el.style.cursor = 'grab'
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false
        if (!isPanning.current) {
          const el = document.getElementById('root')
          if (el) el.style.cursor = ''
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  // Clear pending camera-save timer on unmount to prevent stale writes
  useEffect(() => {
    return () => {
      if (cameraSaveTimerRef.current) clearTimeout(cameraSaveTimerRef.current)
    }
  }, [])

  // Fit map to canvas when image loads or canvas resizes
  useEffect(() => {
    if (!image || natW === 0 || natH === 0) return
    const sx = canvasSize.width / natW
    const sy = canvasSize.height / natH
    const fitScale = Math.min(sx, sy) * 0.95
    const fitOffX = (canvasSize.width - natW * fitScale) / 2
    const fitOffY = (canvasSize.height - natH * fitScale) / 2

    // Restore saved camera only on initial load for this map
    if (!cameraInitializedRef.current && map.cameraScale != null && map.cameraX != null && map.cameraY != null) {
      cameraInitializedRef.current = true
      setTransform({
        scale: map.cameraScale,
        offsetX: map.cameraX,
        offsetY: map.cameraY,
        imgW: natW,
        imgH: natH,
        fitScale,
        canvasW: canvasSize.width,
        canvasH: canvasSize.height,
      })
    } else {
      if (!cameraInitializedRef.current) cameraInitializedRef.current = true
      setTransform({
        scale: fitScale,
        offsetX: fitOffX,
        offsetY: fitOffY,
        imgW: natW,
        imgH: natH,
        fitScale,
        canvasW: canvasSize.width,
        canvasH: canvasSize.height,
      })
    }
  }, [image, natW, natH, canvasSize.width, canvasSize.height])

  function scheduleCameraSave(newScale: number, newOffX: number, newOffY: number) {
    if (cameraSaveTimerRef.current) clearTimeout(cameraSaveTimerRef.current)
    cameraSaveTimerRef.current = setTimeout(async () => {
      try {
        await window.electronAPI?.maps.setCamera(map.id, {
          cameraX: newOffX,
          cameraY: newOffY,
          cameraScale: newScale,
        })
        useCampaignStore.getState().setActiveMaps(
          useCampaignStore.getState().activeMaps.map((m) =>
            m.id === map.id ? { ...m, cameraX: newOffX, cameraY: newOffY, cameraScale: newScale } : m
          )
        )
      } catch (err) {
        console.error('[MapLayer] camera save failed:', err)
      }
    }, 600)
  }

  // ── Player Control Mode — Ctrl-gated gestures move / resize the
  // dashed viewport rectangle on top of the DM canvas, independent of
  // the DM's own pan / zoom. Guarded by `playerViewportMode` so the
  // existing Ctrl+wheel trackpad-pinch semantics survive when the
  // mode is off.
  const isDraggingViewport = useRef(false)

  // ── Pan: middle-mouse, Alt+left-drag, Space+left-drag, or right-click drag ─
  //
  // Right-click drag pan (Phase 10): right-mousedown arms a potential
  // pan. We wait for the mouse to move past PAN_THRESHOLD pixels before
  // committing so that a right-click without drag still opens the
  // context menu unchanged. If the user dragged, mouseup installs a
  // one-shot capture-phase contextmenu suppressor so the menu doesn't
  // open on top of the just-completed pan.
  const rightPanState = useRef<{ active: boolean; startX: number; startY: number } | null>(null)
  const PAN_THRESHOLD = 5

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const ui = useUIStore.getState()
    // Viewport drag has priority over the DM's own pan when Player
    // Control Mode is active and the user is holding Ctrl / Cmd.
    if (ui.playerViewportMode && e.evt.button === 0 && (e.evt.ctrlKey || e.evt.metaKey) && ui.playerViewport) {
      e.evt.preventDefault()
      isDraggingViewport.current = true
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      stageRef.current?.container().style.setProperty('cursor', 'grabbing')
      return
    }
    if (e.evt.button === 2) {
      // Right-click: arm potential pan. Don't preventDefault yet — a
      // click without drag still needs to open the context menu.
      rightPanState.current = { active: false, startX: e.evt.clientX, startY: e.evt.clientY }
      return
    }
    const isMiddle = e.evt.button === 1
    const isAltLeft = e.evt.button === 0 && e.evt.altKey
    const isSpacePan = e.evt.button === 0 && spaceHeld.current
    if (!isMiddle && !isAltLeft && !isSpacePan) return
    e.evt.preventDefault()
    isPanning.current = true
    lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    stageRef.current?.container().style.setProperty('cursor', 'grabbing')
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (isDraggingViewport.current) {
      const ui = useUIStore.getState()
      if (!ui.playerViewport) { isDraggingViewport.current = false; return }
      const dx = e.evt.clientX - lastPointer.current.x
      const dy = e.evt.clientY - lastPointer.current.y
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      // Translate screen delta into map-image delta via the DM's own
      // scale, so drag feels 1:1 with the cursor regardless of zoom.
      const mapDx = dx / scale
      const mapDy = dy / scale
      ui.patchPlayerViewport({
        cx: ui.playerViewport.cx + mapDx,
        cy: ui.playerViewport.cy + mapDy,
      })
      return
    }
    // Right-click drag: commit to pan once we've moved past the
    // threshold. Latches `active=true` so the contextmenu suppressor
    // fires on mouseup and so further mousemoves take the normal pan
    // path below.
    if (rightPanState.current && !rightPanState.current.active) {
      const dx = Math.abs(e.evt.clientX - rightPanState.current.startX)
      const dy = Math.abs(e.evt.clientY - rightPanState.current.startY)
      if (dx + dy > PAN_THRESHOLD) {
        rightPanState.current.active = true
        isPanning.current = true
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        stageRef.current?.container().style.setProperty('cursor', 'grabbing')
      }
    }
    if (!isPanning.current) return
    const dx = e.evt.clientX - lastPointer.current.x
    const dy = e.evt.clientY - lastPointer.current.y
    lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    const newOffX = offsetX + dx
    const newOffY = offsetY + dy
    setTransform({ offsetX: clampOffsetX(newOffX), offsetY: clampOffsetY(newOffY) })
  }

  function handleMouseUp(_e: Konva.KonvaEventObject<MouseEvent>) {
    if (isDraggingViewport.current) {
      isDraggingViewport.current = false
      stageRef.current?.container().style.removeProperty('cursor')
      return
    }
    // Right-click released — if we panned, swallow the next contextmenu
    // event so the menu doesn't pop up on top of the drag end. Capture-
    // phase listener on window runs before any container-level handler
    // (Konva-bound onContextMenu, our engine dispatcher, browser
    // default), so one well-placed preventDefault wins.
    if (rightPanState.current?.active) {
      const block = (ev: MouseEvent) => {
        ev.preventDefault()
        ev.stopPropagation()
        window.removeEventListener('contextmenu', block, { capture: true })
      }
      window.addEventListener('contextmenu', block, { capture: true })
    }
    rightPanState.current = null
    if (isPanning.current) {
      isPanning.current = false
      const cursor = spaceHeld.current ? 'grab' : undefined
      if (cursor) {
        stageRef.current?.container().style.setProperty('cursor', cursor)
      } else {
        stageRef.current?.container().style.removeProperty('cursor')
      }
      scheduleCameraSave(scale, offsetX, offsetY)
    }
  }

  // ── Zoom: scroll wheel or trackpad pinch ────────────────────────────────────
  // Bound at the Stage-container DOM level (see effect below) instead
  // of on the Konva <Layer>. Konva layer-level onWheel only fires when
  // the cursor is over a shape *in that layer* — wheeling over a token,
  // fog rect, or drawing would otherwise be eaten by those layers and
  // zoom wouldn't trigger. The DOM listener catches every wheel event
  // inside the canvas regardless of which layer is hit.
  function handleWheelNative(evt: WheelEvent) {
    const ui = useUIStore.getState()

    // Player Control Mode: Ctrl+wheel resizes the dashed viewport rect.
    // Only intercepts when the mode is on so trackpad pinch-zoom keeps
    // working everywhere else (trackpad pinch also arrives with
    // ctrlKey=true — we accept that by checking the mode flag first).
    if (ui.playerViewportMode && ui.playerViewport && (evt.ctrlKey || evt.metaKey)) {
      evt.preventDefault()
      const step = evt.deltaY < 0 ? 1.08 : 1 / 1.08
      const v = ui.playerViewport
      const MIN = 50
      // Patch only `w`; the store derives `h` from the player-window
      // aspect lock so resize stays proportional and the rect always
      // matches what the players actually see.
      const nextW = Math.max(MIN, v.w * step)
      ui.patchPlayerViewport({ w: nextW })
      return
    }

    evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    // Trackpad pinch sends ctrlKey=true with deltaY for zoom
    const isPinch = evt.ctrlKey
    const zoomFactor = evt.deltaY < 0 ? (isPinch ? 1.03 : 1.12) : (isPinch ? 1 / 1.03 : 1 / 1.12)
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * zoomFactor))

    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const newOffX = pointer.x - (pointer.x - offsetX) * (newScale / scale)
    const newOffY = pointer.y - (pointer.y - offsetY) * (newScale / scale)
    const clampedOffX = clampOffsetX(newOffX)
    const clampedOffY = clampOffsetY(newOffY)

    setTransform({ scale: newScale, offsetX: clampedOffX, offsetY: clampedOffY })
    scheduleCameraSave(newScale, clampedOffX, clampedOffY)
  }

  // Attach the wheel listener to the Stage's container element so it
  // catches wheel events over *any* canvas layer (tokens, fog, drawings,
  // walls, …) — not just shapes in MapLayer. `passive: false` is
  // required so we can call `preventDefault` and stop the host page from
  // also scrolling.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const container = stage.container()
    if (!container) return
    container.addEventListener('wheel', handleWheelNative, { passive: false })
    return () => container.removeEventListener('wheel', handleWheelNative)
    // handleWheelNative closes over scale / offsets / image dims, so we
    // re-bind whenever those change. Cheap (one DOM listener swap) and
    // keeps the closure values fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, offsetX, offsetY, natW, natH, canvasSize.width, canvasSize.height, image])

  // ── Clamp offset so viewport doesn't drift too far from the map ─────────────────
  // Allow up to 1 viewport-width/height of empty space beyond the map edge
  function clampOffsetX(x: number): number {
    if (!image || natW === 0) return x
    const mapRight = natW * scale
    const min = canvasSize.width - mapRight - canvasSize.width * 0.5
    const max = canvasSize.width * 0.5
    return Math.max(min, Math.min(max, x))
  }

  function clampOffsetY(y: number): number {
    if (!image || natH === 0) return y
    const mapBottom = natH * scale
    const min = canvasSize.height - mapBottom - canvasSize.height * 0.5
    const max = canvasSize.height * 0.5
    return Math.max(min, Math.min(max, y))
  }

  // ── Grid: single Shape with native canvas draw (much cheaper than <Line> array) ──
  // Grid visibility is now two-gated: gridType !== 'none' *and* the
  // per-map gridVisible flag (so the DM can hide the grid visually
  // without losing snap/geometry). Both default to on for existing
  // maps via the schema v32 migration.
  const showGrid = !!image && map.gridType !== 'none' && map.gridVisible !== false
  const cellPx = showGrid ? map.gridSize * scale : 0

  return (
    <Layer
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {image && (
        <>
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              const w = natW * scale
              const h = natH * scale
              const sz = 16
              const cols = Math.ceil(w / sz)
              const rows = Math.ceil(h / sz)
              ctx.save()
              ctx.beginPath()
              ctx.rect(offsetX, offsetY, w, h)
              ctx.clip()
              const pattern = ctx.createPattern(getCheckerCanvas(sz), 'repeat')!
              ctx.fillStyle = pattern
              ctx.fillRect(offsetX, offsetY, cols * sz, rows * sz)
              ctx.restore()
            }}
          />
          <KonvaImage
            image={image as HTMLImageElement}
            x={offsetX}
            y={offsetY}
            width={natW * scale}
            height={natH * scale}
            listening={false}
          />
        </>
      )}

      {showGrid && cellPx >= 4 && (
        <Shape
          listening={false}
          sceneFunc={(ctx) => {
            const x0 = offsetX
            const y0 = offsetY
            const imgW = natW * scale
            const imgH = natH * scale

            ctx.beginPath()

            if (map.gridType === 'square') {
              const cols = Math.ceil(imgW / cellPx) + 1
              const rows = Math.ceil(imgH / cellPx) + 1
              for (let c = 0; c <= cols; c++) {
                const x = gridOffsetX * scale + c * cellPx + offsetX
                ctx.moveTo(x, y0)
                ctx.lineTo(x, y0 + imgH)
              }
              for (let r = 0; r <= rows; r++) {
                const y = gridOffsetY * scale + r * cellPx + offsetY
                ctx.moveTo(x0, y)
                ctx.lineTo(x0 + imgW, y)
              }
            } else if (map.gridType === 'hex') {
              const R = cellPx / 2
              const cols = Math.ceil(imgW / (R * 1.5)) + 2
              const rows = Math.ceil(imgH / (R * Math.sqrt(3))) + 2
              for (let col = 0; col < cols; col++) {
                for (let row = 0; row < rows; row++) {
                  const cx = x0 + col * R * 1.5
                  const cy = y0 + row * R * Math.sqrt(3) + (col % 2) * R * (Math.sqrt(3) / 2)
                  ctx.moveTo(cx + R, cy)
                  for (let i = 1; i < 6; i++) {
                    const a = (Math.PI / 180) * (60 * i)
                    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a))
                  }
                  ctx.closePath()
                }
              }
            }

            // Grid stroke. Previous defaults (0.14 alpha / 0.5 px) were
            // invisible at typical zoom levels. Scale line width with the
            // map scale so it stays crisp zoomed in and readable zoomed
            // out — capped so it doesn't turn into thick bars. The per-map
            // thickness multiplier + colour (schema v32) override the old
            // hardcoded white/0.34 stroke.
            const raw = ctx as any
            const thickness = map.gridThickness ?? 1
            const scaledLineWidth = Math.max(0.8, Math.min(1.6, 1 / scale)) * thickness
            raw._context.save()
            raw._context.strokeStyle = map.gridColor ?? DEFAULT_GRID_COLOR
            raw._context.lineWidth = scaledLineWidth
            raw._context.stroke()
            raw._context.restore()
          }}
        />
      )}
    </Layer>
  )
}
