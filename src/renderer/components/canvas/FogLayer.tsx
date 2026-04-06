import { useRef, useEffect, RefObject, useCallback } from 'react'
import { Layer } from 'react-konva'
import Konva from 'konva'
import { useFogStore, type FogOperation } from '../../stores/fogStore'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'

interface FogLayerProps {
  mapId: number
  stageRef: RefObject<Konva.Stage>
  canvasSize: { width: number; height: number }
  activeTool: ActiveTool
}

export function FogLayer({ mapId, stageRef, canvasSize, activeTool }: FogLayerProps) {
  const layerRef = useRef<Konva.Layer>(null)

  // Two off-screen canvases at map natural resolution:
  // exploredCanvas — black where never explored, transparent where explored (permanent)
  // coveredCanvas  — transparent where visible, rgba(0,0,0,0.45) where explored-but-covered
  const exploredCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const coveredCanvasRef  = useRef<HTMLCanvasElement | null>(null)

  // Konva Image nodes for each canvas
  const kImgExploredRef = useRef<Konva.Image | null>(null)
  const kImgCoveredRef  = useRef<Konva.Image | null>(null)

  const isDrawing    = useRef(false)
  const startMapPos  = useRef({ x: 0, y: 0 })

  const { pushOperation, pendingPoints, addPendingPoint, clearPendingPoints, undo, redo } = useFogStore()
  const { screenToMap } = useMapTransformStore()
  const { scale, offsetX, offsetY, imgW, imgH } = useMapTransformStore()
  const { activeMapId } = useCampaignStore()

  const isFogActive = activeTool === 'fog-rect' || activeTool === 'fog-polygon' || activeTool === 'fog-cover'
  const isReveal    = activeTool !== 'fog-cover'

  // ── Initialize canvases when map/dimensions change ────────────────────────
  useEffect(() => {
    if (imgW === 0 || imgH === 0) return

    const explored = document.createElement('canvas')
    explored.width = imgW; explored.height = imgH
    const exploredCtx = explored.getContext('2d')!
    exploredCtx.fillStyle = 'rgba(0,0,0,1)'  // fully black = nothing explored
    exploredCtx.fillRect(0, 0, imgW, imgH)
    exploredCanvasRef.current = explored

    const covered = document.createElement('canvas')
    covered.width = imgW; covered.height = imgH
    // starts fully transparent — nothing covered yet
    coveredCanvasRef.current = covered

    // Destroy old Konva nodes so they get recreated in refreshDisplay
    kImgExploredRef.current?.destroy()
    kImgExploredRef.current = null
    kImgCoveredRef.current?.destroy()
    kImgCoveredRef.current = null

    loadFogFromDb(mapId, explored, covered).then(() => refreshDisplay())
  }, [mapId, imgW, imgH])

  // ── Create/update Konva.Image nodes ───────────────────────────────────────
  const refreshDisplay = useCallback(() => {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    const layer    = layerRef.current
    if (!explored || !covered || !layer) return

    // Explored layer (z-lower — black mask for never-explored areas)
    if (!kImgExploredRef.current) {
      const kImg = new Konva.Image({ image: explored, listening: false })
      kImgExploredRef.current = kImg
      layer.add(kImg)
    }
    const kE = kImgExploredRef.current
    kE.image(explored)
    kE.x(offsetX); kE.y(offsetY)
    kE.width(imgW * scale); kE.height(imgH * scale)

    // Covered layer (z-higher — dim overlay for explored-but-covered areas)
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

  // ── Apply a fog operation ─────────────────────────────────────────────────
  const applyOp = useCallback((op: FogOperation) => {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    if (!explored || !covered) return
    applyOpToCtxPair(explored.getContext('2d')!, covered.getContext('2d')!, op)
    refreshDisplay()
    saveFogToDb(mapId, explored, covered)
    sendFogDelta(op)
  }, [mapId, refreshDisplay])

  // ── Rebuild from scratch (undo/redo) ─────────────────────────────────────
  const rebuildFog = useCallback(() => {
    const explored = exploredCanvasRef.current
    const covered  = coveredCanvasRef.current
    if (!explored || !covered) return

    const ec = explored.getContext('2d')!
    ec.clearRect(0, 0, explored.width, explored.height)
    ec.fillStyle = 'rgba(0,0,0,1)'
    ec.fillRect(0, 0, explored.width, explored.height)

    const cc = covered.getContext('2d')!
    cc.clearRect(0, 0, covered.width, covered.height)

    useFogStore.getState().history.forEach((op) =>
      applyOpToCtxPair(ec, cc, op)
    )

    refreshDisplay()
    saveFogToDb(mapId, explored, covered)
  }, [mapId, refreshDisplay])

  // Expose rebuildFog for keyboard shortcut undo/redo
  useEffect(() => {
    const el = document.getElementById('root')
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: 'undo' | 'redo' }
      if (detail.type === 'undo') {
        undo()
        rebuildFog()
      } else {
        redo()
        applyOp(useFogStore.getState().history.at(-1)!)
      }
    }
    el?.addEventListener('fog:undo-redo', handler)
    return () => el?.removeEventListener('fog:undo-redo', handler)
  }, [undo, redo, rebuildFog, applyOp])

  // ── Pointer position in MAP coordinates ──────────────────────────────────
  function getMapPos(): { x: number; y: number } | null {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return screenToMap(pos.x, pos.y)
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isFogActive || e.evt.button !== 0 || e.evt.altKey) return
    const pos = getMapPos()
    if (!pos) return

    if (activeTool === 'fog-polygon') {
      addPendingPoint(pos.x, pos.y)
      return
    }
    isDrawing.current = true
    startMapPos.current = pos
  }

  function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isDrawing.current || !isFogActive) return
    isDrawing.current = false
    const pos = getMapPos()
    if (!pos) return

    const op: FogOperation = {
      type: isReveal ? 'reveal' : 'cover',
      shape: 'rect',
      points: [startMapPos.current.x, startMapPos.current.y, pos.x, pos.y],
    }
    applyOp(op)
    pushOperation(op)
  }

  function handleDblClick(_e: Konva.KonvaEventObject<MouseEvent>) {
    if (activeTool !== 'fog-polygon' || pendingPoints.length < 4) return
    const op: FogOperation = {
      type: isReveal ? 'reveal' : 'cover',
      shape: 'polygon',
      points: [...pendingPoints],
    }
    applyOp(op)
    pushOperation(op)
    clearPendingPoints()
  }

  return (
    <Layer
      ref={layerRef}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDblClick={handleDblClick}
      listening={isFogActive}
    />
  )
}

// ── Fog persistence helpers ───────────────────────────────────────────────────

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
  // If explored_bitmap is NULL (migrated from v1), keep explored canvas fully black
  // (conservative: treat all existing fog as unexplored)
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
    img.onerror = resolve
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

// ── Pure canvas draw helpers — exported for PlayerApp ────────────────────────

/**
 * Apply a fog operation to a PAIR of canvases (dual-canvas system).
 *
 * exploredCtx  — black=never explored / transparent=explored  (only erased on reveal)
 * coveredCtx   — transparent=visible  / rgba dim=covered       (erased on reveal, filled on cover)
 *
 * Visual result:
 *   never explored      → exploredCtx black (fully opaque)    → map invisible ✓
 *   explored + covered  → exploredCtx transparent, coveredCtx dim → map dimly visible ✓
 *   currently visible   → both transparent                    → map fully visible ✓
 */
export function applyOpToCtxPair(
  exploredCtx: CanvasRenderingContext2D,
  coveredCtx: CanvasRenderingContext2D,
  op: FogOperation,
) {
  if (op.type === 'reveal') {
    // Erase from both canvases
    exploredCtx.globalCompositeOperation = 'destination-out'
    exploredCtx.fillStyle = '#fff'
    applyShape(exploredCtx, op)
    exploredCtx.globalCompositeOperation = 'source-over'

    coveredCtx.globalCompositeOperation = 'destination-out'
    coveredCtx.fillStyle = '#fff'
    applyShape(coveredCtx, op)
    coveredCtx.globalCompositeOperation = 'source-over'
  } else {
    // Cover: fill dim on coveredCtx only — exploredCtx stays as-is
    coveredCtx.globalCompositeOperation = 'source-over'
    coveredCtx.fillStyle = 'rgba(0,0,0,0.45)'
    applyShape(coveredCtx, op)
  }
}

function applyShape(ctx: CanvasRenderingContext2D, op: FogOperation) {
  if (op.shape === 'rect' && op.points.length === 4) {
    const [x1, y1, x2, y2] = op.points
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
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
