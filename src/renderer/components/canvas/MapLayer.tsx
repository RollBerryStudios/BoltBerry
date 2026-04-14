import { useEffect, useRef, RefObject } from 'react'
import { Layer, Image as KonvaImage, Shape } from 'react-konva'
import Konva from 'konva'
import type { MapRecord } from '@shared/ipc-types'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
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
        await window.electronAPI?.dbRun(
          'UPDATE maps SET camera_x = ?, camera_y = ?, camera_scale = ? WHERE id = ?',
          [newOffX, newOffY, newScale, map.id]
        )
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

  // ── Pan: middle-mouse, Alt+left-drag, or left-drag with select tool on background ─
  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
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
    if (!isPanning.current) return
    const dx = e.evt.clientX - lastPointer.current.x
    const dy = e.evt.clientY - lastPointer.current.y
    lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
    const newOffX = offsetX + dx
    const newOffY = offsetY + dy
    setTransform({ offsetX: clampOffsetX(newOffX), offsetY: clampOffsetY(newOffY) })
  }

  function handleMouseUp(_e: Konva.KonvaEventObject<MouseEvent>) {
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
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    // Trackpad pinch sends ctrlKey=true with deltaY for zoom
    const isPinch = e.evt.ctrlKey
    const zoomFactor = e.evt.deltaY < 0 ? (isPinch ? 1.03 : 1.12) : (isPinch ? 1 / 1.03 : 1 / 1.12)
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
  const showGrid = image && map.gridType !== 'none'
  const cellPx = showGrid ? map.gridSize * scale : 0

  return (
    <Layer
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
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
              for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                  ctx.fillStyle = (r + c) % 2 === 0 ? '#2a2a2a' : '#1a1a1a'
                  ctx.fillRect(offsetX + c * sz, offsetY + r * sz, sz, sz)
                }
              }
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

            // Use Konva context's stroke with inline style
            ;(ctx as any)._context.save()
            ;(ctx as any)._context.strokeStyle = 'rgba(255,255,255,0.14)'
            ;(ctx as any)._context.lineWidth = 0.5
            ;(ctx as any)._context.stroke()
            ;(ctx as any)._context.restore()
          }}
        />
      )}
    </Layer>
  )
}
