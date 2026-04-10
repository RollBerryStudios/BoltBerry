import { useRef, useState, useEffect, RefObject, useCallback } from 'react'
import { Layer, Rect, Circle, Line, Ellipse } from 'react-konva'
import Konva from 'konva'
import { useFogStore, type FogOperation } from '../../stores/fogStore'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useMapTransformStore, screenToMapPure, mapToScreenPure } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'

interface FogLayerProps {
  mapId: number
  stageRef: RefObject<Konva.Stage>
  canvasSize: { width: number; height: number }
  activeTool: ActiveTool
  gridSize: number
}

export function FogLayer({ mapId, stageRef, canvasSize, activeTool, gridSize }: FogLayerProps) {
  const layerRef = useRef<Konva.Layer>(null)

  const exploredCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const coveredCanvasRef  = useRef<HTMLCanvasElement | null>(null)

  const kImgExploredRef = useRef<Konva.Image | null>(null)
  const kImgCoveredRef  = useRef<Konva.Image | null>(null)

  const isDrawing    = useRef(false)
  const startMapPos  = useRef({ x: 0, y: 0 })
  const rafPending   = useRef(false)
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [brushPos, setBrushPos] = useState<{ x: number; y: number } | null>(null)

  const { pendingPoints, addPendingPoint, clearPendingPoints } = useFogStore()
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const imgW = useMapTransformStore((s) => s.imgW)
  const imgH = useMapTransformStore((s) => s.imgH)
  const { activeMapId } = useCampaignStore()
  const fogBrushRadius = useUIStore((s) => s.fogBrushRadius)
  const gridSizeProp = gridSize

  const isFogActive = activeTool.startsWith('fog-')
  const isReveal = activeTool === 'fog-rect' || activeTool === 'fog-polygon' || activeTool === 'fog-brush'
  const isBrush = activeTool === 'fog-brush' || activeTool === 'fog-brush-cover'

  // ── Initialize canvases when map/dimensions change ────────────────────
  useEffect(() => {
    if (imgW === 0 || imgH === 0) return

    const explored = document.createElement('canvas')
    explored.width = imgW; explored.height = imgH
    exploredCanvasRef.current = explored

    const covered = document.createElement('canvas')
    covered.width = imgW; covered.height = imgH
    coveredCanvasRef.current = covered

    kImgExploredRef.current?.destroy()
    kImgExploredRef.current = null
    kImgCoveredRef.current?.destroy()
    kImgCoveredRef.current = null

    loadFogFromDb(mapId, explored, covered)
      .then(() => refreshDisplay())
      .catch((err) => console.error('[FogLayer] loadFogFromDb failed:', err))

    return () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    }
  }, [mapId, imgW, imgH])

  // ── Create/update Konva.Image nodes ──────────────────────────────────
  const refreshDisplay = useCallback(() => {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    const layer    = layerRef.current
    if (!explored || !covered || !layer) return

    if (!kImgExploredRef.current) {
      const kImg = new Konva.Image({ image: explored, listening: false })
      kImgExploredRef.current = kImg
      layer.add(kImg)
    }
    const kE = kImgExploredRef.current
    kE.image(explored)
    kE.x(offsetX); kE.y(offsetY)
    kE.width(imgW * scale); kE.height(imgH * scale)

    if (!kImgCoveredRef.current) {
      const kImg = new Konva.Image({ image: covered, listening: false })
      kImgCoveredRef.current = kImg
      layer.add(kImg)
    }
    const kC = kImgCoveredRef.current
    kC.image(covered)
    kC.x(offsetX); kC.y(offsetY)
    kC.width(imgW * scale); kC.height(imgH * scale)

    layer.batchDraw()
  }, [offsetX, offsetY, imgW, imgH, scale])

  useEffect(() => { refreshDisplay() }, [refreshDisplay])

  // ── Apply a fog operation ─────────────────────────────────────────
  const applyOp = useCallback((op: FogOperation) => {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    if (!explored || !covered) return
    applyOpToCtxPair(explored.getContext('2d')!, covered.getContext('2d')!, op)
    refreshDisplay()
    saveFogToDb(mapId, explored, covered)
    sendFogDelta(op)
  }, [mapId, refreshDisplay])

  // ── Rebuild from scratch (undo/redo) ───────────────────────────────
  const rebuildFog = useCallback(() => {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    if (!explored || !covered) return

    const ec = explored.getContext('2d')!
    ec.clearRect(0, 0, explored.width, explored.height)

    const cc = covered.getContext('2d')!
    cc.clearRect(0, 0, covered.width, covered.height)

    useFogStore.getState().history.forEach((op) =>
      applyOpToCtxPair(ec, cc, op)
    )

    refreshDisplay()
    saveFogToDb(mapId, explored, covered)
  }, [mapId, refreshDisplay])

  // ── Push fog operation to global undo stack ────────────────────────
  const pushFogCommand = useCallback((op: FogOperation) => {
    const fogStore = useFogStore.getState()
    fogStore.pushOperation(op)
    applyOp(op)
    useUndoStore.getState().pushCommand({
      id: nextCommandId(),
      label: `Fog ${op.type}`,
      undo: () => {
        const fs = useFogStore.getState()
        fs.undo()
        rebuildFog()
      },
      redo: () => {
        const fs = useFogStore.getState()
        fs.redo()
        const lastOp = fs.history[fs.history.length - 1]
        if (lastOp) applyOp(lastOp)
      },
    })
  }, [applyOp, rebuildFog])

  // ── Fog quick actions (reveal all, cover all, reset) ───────────────
  useEffect(() => {
    const el = document.getElementById('root')
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string }
      const explored = exploredCanvasRef.current
      const covered  = coveredCanvasRef.current
      if (!explored || !covered || !activeMapId) return
      const ec = explored.getContext('2d')!
      const cc = covered.getContext('2d')!

      if (detail.type === 'revealAll') {
        const fullOp: FogOperation = { type: 'reveal', shape: 'rect', points: [0, 0, explored.width, explored.height] }
        pushFogCommand(fullOp)
      } else if (detail.type === 'coverAll') {
        const fullOp: FogOperation = { type: 'cover', shape: 'rect', points: [0, 0, covered.width, covered.height] }
        pushFogCommand(fullOp)
      } else if (detail.type === 'resetExplored') {
        ec.clearRect(0, 0, explored.width, explored.height)
        cc.clearRect(0, 0, covered.width, covered.height)
        useFogStore.getState().clearHistory()
        refreshDisplay()
        saveFogToDb(mapId, explored, covered)
        const fullOp: FogOperation = { type: 'reveal', shape: 'rect', points: [0, 0, explored.width, explored.height] }
        sendFogDelta(fullOp)
      } else if (detail.type === 'revealTokens') {
        const tokens = useTokenStore.getState().tokens
        const revealRadius = gridSizeProp * 1.5
        for (const token of tokens) {
          if (!token.visibleToPlayers) continue
          const op: FogOperation = {
            type: 'reveal',
            shape: 'circle',
            points: [token.x + (token.size * gridSizeProp) / 2, token.y + (token.size * gridSizeProp) / 2, revealRadius],
          }
          pushFogCommand(op)
        }
      }
    }
    el?.addEventListener('fog:action', handler)
    return () => el?.removeEventListener('fog:action', handler)
  }, [mapId, activeMapId, pushFogCommand, refreshDisplay])

  // ── Pointer position in MAP coordinates ──────────────────────────
  function getMapPos(): { x: number; y: number } | null {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return screenToMapPure(pos.x, pos.y, scale, offsetX, offsetY)
  }

  // ── Brush stroke with interpolation ────────────────────────────────
  const lastBrushPos = useRef<{ x: number; y: number } | null>(null)

  function brushAt(x: number, y: number) {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    if (!explored || !covered) return
    const r = fogBrushRadius / scale
    const op: FogOperation = {
      type: isReveal ? 'reveal' : 'cover',
      shape: 'circle',
      points: [x, y, r],
    }
    applyOpToCtxPair(explored.getContext('2d')!, covered.getContext('2d')!, op)

    // Interpolate between last pos and current for smooth strokes
    if (lastBrushPos.current) {
      const lx = lastBrushPos.current.x
      const ly = lastBrushPos.current.y
      const dx = x - lx
      const dy = y - ly
      const dist = Math.sqrt(dx * dx + dy * dy)
      const step = Math.max(r * 0.3, 2)
      if (dist > step) {
        const steps = Math.ceil(dist / step)
        for (let i = 1; i < steps; i++) {
          const t = i / steps
          const ix = lx + dx * t
          const iy = ly + dy * t
          const interpOp: FogOperation = {
            type: op.type,
            shape: 'circle',
            points: [ix, iy, r],
          }
          applyOpToCtxPair(explored.getContext('2d')!, covered.getContext('2d')!, interpOp)
        }
      }
    }
    lastBrushPos.current = { x, y }
    if (!rafPending.current) {
      rafPending.current = true
      requestAnimationFrame(() => {
        refreshDisplay()
        rafPending.current = false
      })
    }
  }

  // ── Mouse handlers ────────────────────────────────────────────
  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isFogActive || e.evt.button !== 0 || e.evt.altKey) return
    const pos = getMapPos()
    if (!pos) return

    if (activeTool === 'fog-polygon') {
      addPendingPoint(pos.x, pos.y)
      return
    }
    if (isBrush) {
      isDrawing.current = true
      lastBrushPos.current = null
      brushAt(pos.x, pos.y)
      return
    }
    isDrawing.current = true
    startMapPos.current = pos
    setDragRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    const pos = getMapPos()
    if (!pos) return

    if (isBrush) {
      // Show cursor preview on all moves
      setBrushPos({ x: pos.x, y: pos.y })
    }

    if (!isDrawing.current) return

    if (isBrush) {
      brushAt(pos.x, pos.y)
      return
    }
    if (activeTool !== 'fog-rect' && activeTool !== 'fog-cover') return
    setDragRect(prev => prev ? { ...prev, x2: pos.x, y2: pos.y } : null)
  }

  function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isDrawing.current && !isFogActive) return
    isDrawing.current = false

    if (isBrush) {
      lastBrushPos.current = null
      // Save after brush stroke
      const explored = exploredCanvasRef.current
      const covered  = coveredCanvasRef.current
      if (explored && covered) {
        const r = fogBrushRadius / scale
        const pos = stageRef.current?.getPointerPosition()
        let cx = 0, cy = 0
        if (pos) {
          const mpos = screenToMapPure(pos.x, pos.y, scale, offsetX, offsetY)
          cx = mpos.x; cy = mpos.y
        }
        pushFogCommand({ type: isReveal ? 'reveal' : 'cover', shape: 'circle', points: [cx, cy, r] })
        saveFogToDb(mapId, explored, covered)
      }
      return
    }

    setDragRect(null)
    const pos = getMapPos()
    if (!pos) return

    const op: FogOperation = {
      type: isReveal ? 'reveal' : 'cover',
      shape: 'rect',
      points: [startMapPos.current.x, startMapPos.current.y, pos.x, pos.y],
    }
    pushFogCommand(op)
  }

  function handleDblClick(_e: Konva.KonvaEventObject<MouseEvent>) {
    if (activeTool !== 'fog-polygon' || pendingPoints.length < 4) return
    const op: FogOperation = {
      type: isReveal ? 'reveal' : 'cover',
      shape: 'polygon',
      points: [...pendingPoints],
    }
    pushFogCommand(op)
    clearPendingPoints()
  }

  function handleMouseLeave() {
    setBrushPos(null)
  }

  const previewColor = isReveal ? '#22c55e' : '#ef4444'

  const rectPreview = dragRect && (activeTool === 'fog-rect' || activeTool === 'fog-cover') ? (() => {
    const tl = mapToScreenPure(
      Math.min(dragRect.x1, dragRect.x2),
      Math.min(dragRect.y1, dragRect.y2),
      scale, offsetX, offsetY,
    )
    const br = mapToScreenPure(
      Math.max(dragRect.x1, dragRect.x2),
      Math.max(dragRect.y1, dragRect.y2),
      scale, offsetX, offsetY,
    )
    return (
      <Rect
        x={tl.x}
        y={tl.y}
        width={br.x - tl.x}
        height={br.y - tl.y}
        stroke={previewColor}
        strokeWidth={2}
        dash={[6, 4]}
        listening={false}
      />
    )
  })() : null

  const brushPreview = isBrush && brushPos ? (() => {
    const center = mapToScreenPure(brushPos.x, brushPos.y, scale, offsetX, offsetY)
    const r = fogBrushRadius
    return (
      <Ellipse
        x={center.x}
        y={center.y}
        radiusX={r}
        radiusY={r}
        stroke={previewColor}
        strokeWidth={1.5}
        dash={[4, 3]}
        listening={false}
      />
    )
  })() : null

  // Polygon preview with live edge
  const polygonPreview = activeTool === 'fog-polygon' && pendingPoints.length >= 2
    ? (() => {
        const points = pendingPoints
        const screenPoints: number[] = []
        for (let i = 0; i < points.length; i += 2) {
          const s = mapToScreenPure(points[i], points[i + 1], scale, offsetX, offsetY)
          screenPoints.push(s.x, s.y)
        }
        return (
          <>
            <Line
              points={screenPoints}
              stroke={previewColor}
              strokeWidth={2}
              dash={[6, 4]}
              listening={false}
            />
            {Array.from({ length: points.length / 2 }, (_, i) => {
              const s = mapToScreenPure(points[i * 2], points[i * 2 + 1], scale, offsetX, offsetY)
              return (
                <Circle
                  key={i}
                  x={s.x}
                  y={s.y}
                  radius={i === 0 ? 6 : 4}
                  fill={i === 0 ? previewColor : '#fff'}
                  stroke={previewColor}
                  strokeWidth={1.5}
                  listening={false}
                />
              )
            })}
          </>
        )
      })()
    : null

  return (
    <Layer
      ref={layerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDblClick={handleDblClick}
      onMouseLeave={handleMouseLeave}
      listening={isFogActive}
    >
      {rectPreview}
      {brushPreview}
      {polygonPreview}
    </Layer>
  )
}

// ── Fog persistence helpers ────────────────────────────────────────────

async function loadFogFromDb(
  mapId: number,
  exploredCanvas: HTMLCanvasElement,
  coveredCanvas: HTMLCanvasElement,
) {
  if (!window.electronAPI) return
  const rows = await window.electronAPI.dbQuery<{
    fog_bitmap: string | null
    explored_bitmap: string | null
  }>(
    'SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?',
    [mapId]
  )
  if (!rows[0]) return

  const promises: Promise<void>[] = []
  if (rows[0].fog_bitmap) {
    promises.push(loadBitmapToCanvas(rows[0].fog_bitmap, coveredCanvas))
  }
  if (rows[0].explored_bitmap) {
    promises.push(loadBitmapToCanvas(rows[0].explored_bitmap, exploredCanvas))
  }
  await Promise.all(promises)
}

function loadBitmapToCanvas(dataUrl: string, canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = dataUrl
  })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function saveFogToDb(
  mapId: number,
  exploredCanvas: HTMLCanvasElement,
  coveredCanvas: HTMLCanvasElement,
) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const fogBitmap      = coveredCanvas.toDataURL('image/png')
      const exploredBitmap = exploredCanvas.toDataURL('image/png')
      await window.electronAPI?.dbRun(
        `INSERT INTO fog_state (map_id, fog_bitmap, explored_bitmap) VALUES (?, ?, ?)
         ON CONFLICT(map_id) DO UPDATE SET
           fog_bitmap      = excluded.fog_bitmap,
           explored_bitmap = excluded.explored_bitmap`,
        [mapId, fogBitmap, exploredBitmap]
      )
    } catch (err) {
      console.error('[FogLayer] saveFogToDb failed:', err)
    }
  }, 2000)
}

function sendFogDelta(op: FogOperation) {
  if (useUIStore.getState().sessionMode === 'prep') return
  window.electronAPI?.sendFogDelta({
    type: op.type,
    shape: op.shape,
    points: op.points,
  })
}

// ── Pure canvas draw helpers — exported for PlayerApp ──────────────────────

export function applyOpToCtxPair(
  exploredCtx: CanvasRenderingContext2D,
  coveredCtx: CanvasRenderingContext2D,
  op: FogOperation,
) {
  if (op.type === 'reveal') {
    exploredCtx.globalCompositeOperation = 'destination-out'
    exploredCtx.fillStyle = '#fff'
    applyShape(exploredCtx, op)
    exploredCtx.globalCompositeOperation = 'source-over'

    coveredCtx.globalCompositeOperation = 'destination-out'
    coveredCtx.fillStyle = '#fff'
    applyShape(coveredCtx, op)
    coveredCtx.globalCompositeOperation = 'source-over'
  } else {
    coveredCtx.globalCompositeOperation = 'source-over'
    coveredCtx.fillStyle = 'rgba(0,0,0,0.45)'
    applyShape(coveredCtx, op)
  }
}

function applyShape(ctx: CanvasRenderingContext2D, op: FogOperation) {
  if (op.shape === 'rect' && op.points.length === 4) {
    const [x1, y1, x2, y2] = op.points
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
  } else if (op.shape === 'circle' && op.points.length === 3) {
    const [cx, cy, r] = op.points
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  } else if (op.shape === 'polygon' && op.points.length >= 6) {
    ctx.beginPath()
    for (let i = 0; i < op.points.length; i += 2) {
      if (i === 0) ctx.moveTo(op.points[i], op.points[i + 1])
      else         ctx.lineTo(op.points[i], op.points[i + 1])
    }
    ctx.closePath()
    ctx.fill()
  }
}
