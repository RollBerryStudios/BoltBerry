import { useRef, useState, useEffect, RefObject, useCallback } from 'react'
import { Layer, Rect, Circle, Line, Ellipse } from 'react-konva'
import Konva from 'konva'
import { useFogStore } from '../../stores/fogStore'
import { applyOpToCtxPair, type FogOperation } from '../../utils/fogUtils'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useMapTransformStore, screenToMapPure, mapToScreenPure } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'
import { showToast } from '../shared/Toast'

interface FogLayerProps {
  mapId: number
  stageRef: RefObject<Konva.Stage>
  canvasSize: { width: number; height: number }
  activeTool: ActiveTool
  gridSize: number
  playerPreview?: boolean
}

export function FogLayer({ mapId, stageRef, canvasSize, activeTool, gridSize, playerPreview = false }: FogLayerProps) {
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
      .catch((err) => {
        console.error('[FogLayer] loadFogFromDb failed:', err)
        // Surface the failure to the DM so they don't unknowingly start a
        // session on an empty fog canvas — previously the error was
        // console-only and the player would see whatever (likely nothing)
        // ended up painted.
        showToast(
          'Nebel der Karte konnte nicht geladen werden — Zustand setzt auf leer.',
          'error',
          7000,
        )
      })

    return () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      // Destroy imperatively-added Konva.Image nodes so they don't leak
      // if the component unmounts before another map loads.
      kImgExploredRef.current?.destroy()
      kImgExploredRef.current = null
      kImgCoveredRef.current?.destroy()
      kImgCoveredRef.current = null
    }
  }, [mapId, imgW, imgH])

  const playerPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // Reusable scratch canvas for the DM's red-tinted view of the covered
  // mask. We never mutate `coveredCanvasRef` directly — it must stay in
  // its on-disk format (45% black) so the existing fog-delta IPC keeps
  // working on the player side. The tint is purely a render-time
  // transform: copy → composite-in → fill red.
  const tintedCoveredCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

    // The on-disk fog bitmap is always painted as 45% black so the
    // existing delta IPC stays format-stable. We retint it at render
    // time with one of two looks:
    //
    //   • Player Preview (DM toggles "show me what they see"): full-
    //     opacity black, matching what PlayerApp renders.
    //   • DM normal: translucent red, so the DM can still read the
    //     map underneath but instantly sees which areas are hidden.
    //
    // Both paths use a scratch canvas so `coveredCanvasRef` keeps its
    // canonical 45%-black format for IPC + DB persistence.
    let coveredSource: HTMLCanvasElement = covered
    if (playerPreview) {
      if (!playerPreviewCanvasRef.current) {
        playerPreviewCanvasRef.current = document.createElement('canvas')
      }
      const pp = playerPreviewCanvasRef.current
      if (pp.width !== covered.width || pp.height !== covered.height) {
        pp.width = covered.width
        pp.height = covered.height
      }
      const ppCtx = pp.getContext('2d')!
      ppCtx.clearRect(0, 0, pp.width, pp.height)
      ppCtx.drawImage(covered, 0, 0)
      // Normalize: any pixel with non-zero alpha → full opacity black
      // Use compositing instead of pixel-by-pixel ImageData scan
      ppCtx.globalCompositeOperation = 'source-in'
      ppCtx.fillStyle = '#000000'
      ppCtx.fillRect(0, 0, pp.width, pp.height)
      ppCtx.globalCompositeOperation = 'source-over'
      coveredSource = pp
    } else {
      if (!tintedCoveredCanvasRef.current) {
        tintedCoveredCanvasRef.current = document.createElement('canvas')
      }
      const tc = tintedCoveredCanvasRef.current
      if (tc.width !== covered.width || tc.height !== covered.height) {
        tc.width = covered.width
        tc.height = covered.height
      }
      const tcCtx = tc.getContext('2d')!
      tcCtx.clearRect(0, 0, tc.width, tc.height)
      tcCtx.drawImage(covered, 0, 0)
      // Tint every painted pixel red, ~55 % alpha. source-in keeps the
      // mask shape intact and overwrites only the colour channels.
      tcCtx.globalCompositeOperation = 'source-in'
      tcCtx.fillStyle = 'rgba(220, 38, 38, 0.55)'
      tcCtx.fillRect(0, 0, tc.width, tc.height)
      tcCtx.globalCompositeOperation = 'source-over'
      coveredSource = tc
    }

    if (!kImgCoveredRef.current) {
      const kImg = new Konva.Image({ image: coveredSource, listening: false })
      kImgCoveredRef.current = kImg
      layer.add(kImg)
    }
    const kC = kImgCoveredRef.current
    kC.image(coveredSource)
    kC.x(offsetX); kC.y(offsetY)
    kC.width(imgW * scale); kC.height(imgH * scale)

    layer.batchDraw()
  }, [offsetX, offsetY, imgW, imgH, scale, playerPreview])

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

    // Broadcast rebuilt fog to player so their view stays in sync after undo/redo
    if (useUIStore.getState().sessionMode !== 'prep') {
      // PNG keeps the canvas alpha channel intact. JPEG has no alpha,
      // so cleared fog (transparent everywhere) would encode as solid
      // black — the player window would then render a fully opaque
      // black overlay over the map even after the DM cleared fog.
      window.electronAPI?.sendFogReset(
        covered.toDataURL('image/png'),
        explored.toDataURL('image/png'),
      )
    }
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
        // Snapshot both bitmaps as PNG data URLs before the wipe so
        // the undo closure can restore the pre-reset state pixel-
        // perfect. PNG preserves alpha — JPEG would flatten cleared
        // regions to opaque black on restore (the exact bug that
        // made fog render black for the player earlier).
        const prevExplored = explored.toDataURL('image/png')
        const prevCovered  = covered.toDataURL('image/png')
        const prevHistory  = useFogStore.getState().history.slice()

        ec.clearRect(0, 0, explored.width, explored.height)
        cc.clearRect(0, 0, covered.width, covered.height)
        useFogStore.getState().clearHistory()
        refreshDisplay()
        saveFogToDb(mapId, explored, covered)
        const fullOp: FogOperation = { type: 'reveal', shape: 'rect', points: [0, 0, explored.width, explored.height] }
        sendFogDelta(fullOp)

        useUndoStore.getState().pushCommand({
          id: nextCommandId(),
          label: 'Nebel zurücksetzen',
          undo: async () => {
            // Load the PNG snapshot back into both canvases. Re-use
            // the existing loadBitmapToCanvas-style pattern via a
            // fresh Image() to keep this commit minimal.
            await Promise.all([
              loadBitmapToCanvas(prevExplored, explored),
              loadBitmapToCanvas(prevCovered,  covered),
            ])
            useFogStore.setState({ history: prevHistory, redoStack: [] })
            refreshDisplay()
            saveFogToDb(mapId, explored, covered)
            if (useUIStore.getState().sessionMode !== 'prep') {
              window.electronAPI?.sendFogReset(
                covered.toDataURL('image/png'),
                explored.toDataURL('image/png'),
              )
            }
          },
          redo: async () => {
            ec.clearRect(0, 0, explored.width, explored.height)
            cc.clearRect(0, 0, covered.width, covered.height)
            useFogStore.getState().clearHistory()
            refreshDisplay()
            saveFogToDb(mapId, explored, covered)
            sendFogDelta({ type: 'reveal', shape: 'rect', points: [0, 0, explored.width, explored.height] })
          },
        })
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
    window.addEventListener('fog:action', handler)
    return () => window.removeEventListener('fog:action', handler)
  }, [mapId, activeMapId, pushFogCommand, refreshDisplay])

  // ── LOS fog reveal (fired by TokenLayer on drag end) ─────────────
  useEffect(() => {
    const el = document.getElementById('root')
    const handler = (e: Event) => {
      const { poly } = (e as CustomEvent<{ poly: number[] }>).detail
      if (!poly || poly.length < 6) return
      if (!exploredCanvasRef.current || !coveredCanvasRef.current || !activeMapId) return
      pushFogCommand({ type: 'reveal', shape: 'polygon', points: poly })
    }
    el?.addEventListener('fog:los-reveal', handler)
    return () => el?.removeEventListener('fog:los-reveal', handler)
  }, [activeMapId, pushFogCommand])

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
      {/* Full-canvas transparent hit target — without this, empty clicks on
          unfogged areas (the common case when you first start painting
          fog on a new map) never bubble up to handleMouseDown. Konva only
          dispatches layer mouse events on clicks that hit a listening
          shape; the covered/explored images are listening:false so they
          can't serve that role. */}
      {isFogActive && (
        <Rect
          x={0}
          y={0}
          width={canvasSize.width}
          height={canvasSize.height}
          fill="rgba(0,0,0,0.001)"
          listening
        />
      )}
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
// We stash the inputs needed to commit the save so that if the renderer is
// tearing down (beforeunload) we can flush synchronously instead of losing
// the pending 2 s-debounced write. The actual encode+dbRun still needs to
// run; we just short-circuit the timer.
let pendingSave: {
  mapId: number
  exploredCanvas: HTMLCanvasElement
  coveredCanvas: HTMLCanvasElement
} | null = null

function commitFogSave(
  mapId: number,
  exploredCanvas: HTMLCanvasElement,
  coveredCanvas: HTMLCanvasElement,
) {
  try {
    // PNG preserves the canvas alpha channel. We used to use JPEG for
    // the ~4× size win, but JPEG has no alpha: a cleared fog canvas
    // (transparent everywhere) encoded to solid black, so the player
    // window loaded a fully-opaque black overlay over the map even
    // after the DM cleared fog. Size-wise PNG is fine here: fog
    // bitmaps are almost entirely uniform regions (solid-alpha covered
    // blocks + alpha-0 cleared blocks) which PNG's DEFLATE compresses
    // aggressively.
    const fogBitmap      = coveredCanvas.toDataURL('image/png')
    const exploredBitmap = exploredCanvas.toDataURL('image/png')
    // Fire-and-forget: the caller may be synchronous (beforeunload) and
    // can't await. dbRun is an ipcRenderer.invoke — the IPC send itself is
    // synchronous enough to survive the renderer shutting down.
    void window.electronAPI?.dbRun(
      `INSERT INTO fog_state (map_id, fog_bitmap, explored_bitmap) VALUES (?, ?, ?)
       ON CONFLICT(map_id) DO UPDATE SET
         fog_bitmap      = excluded.fog_bitmap,
         explored_bitmap = excluded.explored_bitmap`,
      [mapId, fogBitmap, exploredBitmap]
    )
  } catch (err) {
    console.error('[FogLayer] commitFogSave failed:', err)
  }
}

function saveFogToDb(
  mapId: number,
  exploredCanvas: HTMLCanvasElement,
  coveredCanvas: HTMLCanvasElement,
) {
  if (saveTimer) clearTimeout(saveTimer)
  pendingSave = { mapId, exploredCanvas, coveredCanvas }
  saveTimer = setTimeout(() => {
    const p = pendingSave
    saveTimer = null
    pendingSave = null
    if (!p) return
    commitFogSave(p.mapId, p.exploredCanvas, p.coveredCanvas)
  }, 2000)
}

/**
 * Flush any pending debounced fog save immediately. Intended for
 * `beforeunload` so we don't lose the last ~2 s of fog edits when the user
 * quits the app or closes the window.
 */
export function flushFogSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!pendingSave) return
  const { mapId, exploredCanvas, coveredCanvas } = pendingSave
  pendingSave = null
  commitFogSave(mapId, exploredCanvas, coveredCanvas)
}

function sendFogDelta(op: FogOperation) {
  if (useUIStore.getState().sessionMode === 'prep') return
  window.electronAPI?.sendFogDelta({
    type: op.type,
    shape: op.shape,
    points: op.points,
  })
}

