import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Shape, Group, Circle, Rect, Text, Line } from 'react-konva'
import Konva from 'konva'
import type { PlayerFullState, PlayerTokenState, PlayerMeasureState, FogDelta, PlayerMapState, PlayerPointer, PlayerCamera, PlayerOverlay, PlayerInitiativeEntry, WeatherType, GridType, PlayerDrawingState, PlayerWallState } from '@shared/ipc-types'
import { useRotatedImage } from './hooks/useRotatedImage'
import { WeatherCanvas } from './components/canvas/WeatherCanvas'
import { useImageUrl } from './hooks/useImageUrl'
import { applyOpToCtxPair } from './utils/fogUtils'
import { computeVisibilityPolygon, type Segment } from './utils/losEngine'

function factionColor(faction: string): string {
  switch (faction) {
    case 'enemy': return '#ef4444'
    case 'neutral': return '#f59e0b'
    case 'friendly': return '#3b82f6'
    default: return '#22c55e'
  }
}

type Mode = 'idle' | 'map' | 'atmosphere' | 'blackout'

export default function PlayerApp() {
  const [mode, setMode] = useState<Mode>('idle')
  const [mapState, setMapState] = useState<PlayerMapState | null>(null)
  const [atmospherePath, setAtmospherePath] = useState<string | null>(null)
  const [tokens, setTokens] = useState<PlayerTokenState[]>([])
  const [blackout, setBlackout] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [pointer, setPointer] = useState<PlayerPointer | null>(null)
  const [camera, setCamera] = useState<PlayerCamera | null>(null)
  const [handout, setHandout] = useState<{ title: string; imagePath: string | null; textContent: string | null } | null>(null)
  const [overlay, setOverlay] = useState<PlayerOverlay | null>(null)
  const [initiative, setInitiative] = useState<PlayerInitiativeEntry[]>([])
  const [weather, setWeather] = useState<WeatherType>('none')
  const [measure, setMeasure] = useState<PlayerMeasureState | null>(null)
  const [drawingData, setDrawingData] = useState<PlayerDrawingState[]>([])
  const [walls, setWalls] = useState<PlayerWallState[]>([])

  const mapStateRef = useRef<PlayerMapState | null>(null)
  mapStateRef.current = mapState


  // Dual fog canvases at map natural resolution
  const exploredCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const coveredCanvasRef  = useRef<HTMLCanvasElement | null>(null)
  const [fogVersion, setFogVersion] = useState(0)

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.shiftKey) {
          window.playerAPI?.closeSelf?.()
          return
        }
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {})
        } else {
          window.playerAPI?.closeSelf?.()
        }
      } else if ((e.key === 'w' || e.key === 'W') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        window.playerAPI?.closeSelf?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!window.playerAPI) return

    const unsubs = [
      window.playerAPI.onFullSync((state: PlayerFullState) => {
        setBlackout(state.blackout)
        setTokens(state.tokens)
        setDrawingData(state.drawings ?? [])

        if (state.mode === 'blackout') {
          setMode('blackout')
          return
        }
        if (state.mode === 'atmosphere' && state.atmosphereImagePath) {
          setAtmospherePath(state.atmosphereImagePath)
          setMode('atmosphere')
          return
        }
        if (state.map) {
          mapStateRef.current = state.map
          setMapState(state.map)
          setMode('map')
          if (state.fogBitmap || state.exploredBitmap) {
            loadDualFog(
              state.fogBitmap,
              state.exploredBitmap,
              coveredCanvasRef,
              exploredCanvasRef,
              () => setFogVersion((v) => v + 1),
            )
          } else {
            exploredCanvasRef.current = null
            coveredCanvasRef.current = null
            setFogVersion((v) => v + 1)
          }
        }
      }),

      window.playerAPI.onMapUpdate((state: PlayerMapState) => {
        mapStateRef.current = state
        setMapState(state)
        setMode('map')
        setCamera(null)
        setDrawingData([])
        exploredCanvasRef.current = null
        coveredCanvasRef.current = null
        setFogVersion((v) => v + 1)
      }),

      window.playerAPI.onTokenUpdate((t) => setTokens(t)),

      window.playerAPI.onBlackout((active: boolean) => {
        setBlackout(active)
        if (active) {
          setMode('blackout')
        } else {
          const currentMap = mapStateRef.current
          setMode(currentMap ? 'map' : 'idle')
        }
      }),

      window.playerAPI.onAtmosphere((path: string | null) => {
        if (path) {
          setAtmospherePath(path)
          setMode('atmosphere')
        } else {
          const currentMap = mapStateRef.current
          setMode(currentMap ? 'map' : 'idle')
        }
      }),

      window.playerAPI.onPointer((p: PlayerPointer) => {
        setPointer(p)
        setTimeout(() => setPointer((cur) => (cur === p ? null : cur)), 2500)
      }),

      window.playerAPI.onCameraView((cam: PlayerCamera) => {
        setCamera(cam)
      }),

      window.playerAPI.onHandout((h) => {
        setHandout(h)
      }),

      window.playerAPI.onOverlay((o) => {
        setOverlay(o)
      }),

      window.playerAPI.onInitiative((entries: PlayerInitiativeEntry[]) => {
        setInitiative(entries)
      }),

      window.playerAPI.onWeather((type: WeatherType) => {
        setWeather(type)
      }),

      window.playerAPI.onFogDelta((delta: FogDelta) => {
        const explored = exploredCanvasRef.current
        const covered  = coveredCanvasRef.current
        if (!explored || !covered) return
        applyOpToCtxPair(
          explored.getContext('2d')!,
          covered.getContext('2d')!,
          { type: delta.type, shape: delta.shape, points: delta.points },
        )
        setFogVersion((v) => v + 1)
      }),

      window.playerAPI.onFogReset((payload) => {
        loadDualFog(
          payload.fogBitmap,
          payload.exploredBitmap,
          coveredCanvasRef,
          exploredCanvasRef,
          () => setFogVersion((v) => v + 1),
        )
      }),

      window.playerAPI.onMeasure((m: PlayerMeasureState | null) => {
        setMeasure(m)
      }),

      window.playerAPI.onDrawing((d: PlayerDrawingState) => {
        setDrawingData((prev) => [...prev, d])
      }),

      window.playerAPI.onWalls((w: PlayerWallState[]) => {
        setWalls(w)
      }),
    ]

    window.playerAPI.requestFullSync()
    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (blackout || mode === 'blackout') {
    return <div style={{ width: '100vw', height: '100vh', background: '#000' }} />
  }

  // Handout overlay (shown over map/atmosphere/idle)
  if (handout) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40, position: 'relative',
      }}>
        <button
          onClick={() => setHandout(null)}
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 200,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%', width: 36, height: 36, fontSize: 18, color: '#F4F6FA',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Schließen"
        >✕</button>
        <div style={{
          background: '#182130', borderRadius: 12, border: '1px solid #1E2A3E',
          padding: 32, maxWidth: 600, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.8)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#F4F6FA', marginBottom: 16 }}>
            {handout.title}
          </div>
          {handout.imagePath && (
            <PlayerImg path={handout.imagePath} style={{ width: '100%', borderRadius: 8, marginBottom: handout.textContent ? 16 : 0 }} />
          )}
          {handout.textContent && (
            <div style={{ fontSize: 16, color: '#94A0B2', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {handout.textContent}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'atmosphere' && atmospherePath) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlayerImg path={atmospherePath} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        <WeatherCanvas type={weather} width={size.w} height={size.h} />
        <PlayerOverlayWidget overlay={overlay} />
      </div>
    )
  }

  if (mode === 'map' && mapState) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <PlayerMapView
          mapState={mapState}
          tokens={tokens}
          walls={walls}
          exploredCanvasRef={exploredCanvasRef}
          coveredCanvasRef={coveredCanvasRef}
          fogVersion={fogVersion}
          width={size.w}
          height={size.h}
          pointer={pointer}
          camera={camera}
          measure={measure}
          drawingData={drawingData}
          onMapLoaded={(w, h) =>
            initDualFogCanvas(exploredCanvasRef, coveredCanvasRef, w, h, () =>
              setFogVersion((v) => v + 1)
            )
          }
        />
        <WeatherCanvas type={weather} width={size.w} height={size.h} />
        {initiative.length > 0 && <InitiativeOverlay entries={initiative} />}
        <PlayerOverlayWidget overlay={overlay} />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#08091A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#525878', gap: 16 }}>
      <div style={{ fontSize: 72, filter: 'drop-shadow(0 0 20px rgba(245, 168, 0, 0.4))' }}>⚡</div>
      <div style={{ fontSize: 24, fontWeight: 800, background: 'linear-gradient(135deg, #FFD044, #F5A800)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>BoltBerry</div>
      <div style={{ fontSize: 14 }}>Warte auf den Spielleiter…</div>
      <PlayerOverlayWidget overlay={overlay} />
    </div>
  )
}

function PlayerOverlayWidget({ overlay }: { overlay: PlayerOverlay | null }) {
  if (!overlay?.text) return null
  const posStyle: React.CSSProperties =
    overlay.position === 'top'    ? { top: 48 } :
    overlay.position === 'bottom' ? { bottom: 48 } :
    { top: '50%', transform: 'translateY(-50%)' }
  const textStyle: React.CSSProperties =
    overlay.style === 'title'    ? { fontSize: 52, fontWeight: 800, letterSpacing: '0.06em' } :
    overlay.style === 'subtitle' ? { fontSize: 32, fontWeight: 600 } :
    { fontSize: 20, fontWeight: 400 }
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 100, display: 'flex', justifyContent: 'center', padding: '0 64px', ...posStyle }}>
      <div style={{ ...textStyle, color: '#F4F6FA', textAlign: 'center', textShadow: '0 2px 16px rgba(0,0,0,0.95), 0 0 48px rgba(0,0,0,0.8)', maxWidth: '80%' }}>
        {overlay.text}
      </div>
    </div>
  )
}

// ─── Initiative Overlay ───────────────────────────────────────────────────────

function InitiativeOverlay({ entries }: { entries: PlayerInitiativeEntry[] }) {
  return (
    <div style={{
      position: 'absolute', bottom: 24, right: 24, zIndex: 50,
      background: 'rgba(13,16,21,0.88)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(47,107,255,0.4)',
      borderRadius: 8, padding: '8px 0', minWidth: 160, maxWidth: 220,
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#2F6BFF', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px 6px' }}>
        Initiative
      </div>
      {entries.map((e, i) => (
        <div key={`${e.name}-${e.roll}`} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: e.current ? 'rgba(47,107,255,0.20)' : 'transparent',
          borderLeft: e.current ? '3px solid #2F6BFF' : '3px solid transparent',
        }}>
          <span style={{ fontSize: 10, color: '#50607A', minWidth: 18, fontFamily: 'monospace' }}>{e.roll}</span>
          <span style={{
            fontSize: 12, color: e.current ? '#4A86FF' : '#94A0B2',
            fontWeight: e.current ? 700 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {e.current ? '▶ ' : ''}{e.name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Weather Canvas ───────────────────────────────────────────────────────────

// WeatherCanvas was moved to a shared component so the DM map view uses
// the same renderer — see src/renderer/components/canvas/WeatherCanvas.tsx.
// Nothing else lives here; the JSX call site imports WeatherCanvas from
// the top-of-file import.

// ─── Player Map View ──────────────────────────────────────────────────────────

interface PlayerMapViewProps {
  mapState: PlayerMapState
  tokens: PlayerTokenState[]
  walls: PlayerWallState[]
  exploredCanvasRef: React.RefObject<HTMLCanvasElement | null>
  coveredCanvasRef: React.RefObject<HTMLCanvasElement | null>
  fogVersion: number
  width: number
  height: number
  pointer: PlayerPointer | null
  camera: PlayerCamera | null
  measure: PlayerMeasureState | null
  drawingData: PlayerDrawingState[]
  onMapLoaded: (naturalW: number, naturalH: number) => void
}

function PlayerMapView({
  mapState, tokens, walls, exploredCanvasRef, coveredCanvasRef, fogVersion, width, height, pointer, camera, measure, drawingData, onMapLoaded,
}: PlayerMapViewProps) {
  const { img: image, imgW: natW, imgH: natH } = useRotatedImage(`file://${mapState.imagePath}`, mapState.rotation ?? 0)
  const [exploredImg, setExploredImg] = useState<HTMLCanvasElement | null>(null)
  const [coveredImg, setCoveredImg]   = useState<HTMLCanvasElement | null>(null)
  const pointerLayerRef = useRef<Konva.Layer>(null)
  const stageRef = useRef<Konva.Stage>(null)

  // Player-local pan/zoom state (used when no DM camera)
  // Local camera state — stays at defaults (1, 0, 0) in normal play
  // because the player window is strictly read-only. The setters still
  // fire from the camera-sync effect below so the view resets cleanly
  // when the GM toggles camera-follow on.
  const [playerScale, setPlayerScale] = useState(1)
  const [playerOffX, setPlayerOffX] = useState(0)
  const [playerOffY, setPlayerOffY] = useState(0)

  // Notify parent when map image loads → init fog canvases
  useEffect(() => {
    if (!image || natW === 0 || natH === 0) return
    onMapLoaded(natW, natH)
  }, [natW, natH])

  // Pass fog canvases directly to Konva (no dataURL round-trip).
  // Konva accepts HTMLCanvasElement as an image prop.
  useEffect(() => {
    const ec = exploredCanvasRef.current
    const cc = coveredCanvasRef.current

    if (!ec && !cc) { setExploredImg(null); setCoveredImg(null); return }

    setExploredImg(ec ?? null)
    setCoveredImg(cc ?? null)
  }, [fogVersion])

  const [animScale, setAnimScale] = useState(1)
  const [animOffX, setAnimOffX] = useState(0)
  const [animOffY, setAnimOffY] = useState(0)

  useEffect(() => {
    if (!image || natW === 0 || natH === 0 || width === 0 || height === 0) return

    const sx = width / natW
    const sy = height / natH
    const fitScale = Math.min(sx, sy)

    let targetScale: number, targetOffX: number, targetOffY: number
    if (camera) {
      targetScale = fitScale * camera.relZoom
      targetOffX = width / 2 - camera.imageCenterX * targetScale
      targetOffY = height / 2 - camera.imageCenterY * targetScale
    } else {
      targetScale = fitScale * playerScale
      targetOffX = (width - natW * targetScale) / 2 + playerOffX
      targetOffY = (height - natH * targetScale) / 2 + playerOffY
    }

    setAnimScale(targetScale)
    setAnimOffX(targetOffX)
    setAnimOffY(targetOffY)
  }, [camera, playerScale, playerOffX, playerOffY, image, natW, natH, width, height])

  // Compute final display values
  let scale = 1, offX = 0, offY = 0
  if (image && natW > 0 && natH > 0) {
    if (camera) {
      scale = animScale
      offX = animOffX
      offY = animOffY
    } else {
      const fitScale = Math.min(width / natW, height / natH)
      scale = fitScale * playerScale
      offX = (width - natW * scale) / 2 + playerOffX
      offY = (height - natH * scale) / 2 + playerOffY
    }
  }

  // Reset player pan/zoom when camera sync activates
  useEffect(() => {
    if (camera) {
      setPlayerScale(1)
      setPlayerOffX(0)
      setPlayerOffY(0)
    }
  }, [camera])

  // The player window is a passive display surface by design — "players
  // have zero controls". Every input event is swallowed before it can
  // mutate the local camera so the GM stays the sole authority on what
  // is visible. `preventDefault` on wheel blocks native page-zoom /
  // scroll too.
  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Prevent text selection + drag-select but do not pan.
    e.evt.preventDefault()
  }

  function handleMouseMove() { /* intentional no-op */ }
  function handleMouseUp() { /* intentional no-op */ }

  // Pointer pulse (imperative Konva) — track active tweens/nodes so rapid
  // pointer events cannot accumulate orphaned Konva objects on the layer.
  const activeTweensRef = useRef<Konva.Tween[]>([])
  const activeNodesRef = useRef<Konva.Node[]>([])

  useEffect(() => {
    if (!pointer || !pointerLayerRef.current || !image) return
    const layer = pointerLayerRef.current
    const px = pointer.x * scale + offX
    const py = pointer.y * scale + offY

    // Destroy any in-flight tweens from the previous pointer event
    for (const tween of activeTweensRef.current) {
      try { tween.destroy() } catch { /* already gone */ }
    }
    activeTweensRef.current = []
    for (const node of activeNodesRef.current) {
      try { node.destroy() } catch { /* already destroyed */ }
    }
    activeNodesRef.current = []

    const dot = new Konva.Circle({ x: px, y: py, radius: 10, fill: '#f59e0b', opacity: 1, listening: false })
    const ring1 = new Konva.Circle({ x: px, y: py, radius: 16, fill: 'transparent', stroke: '#f59e0b', strokeWidth: 3, opacity: 1, listening: false })
    const ring2 = new Konva.Circle({ x: px, y: py, radius: 16, fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.5, opacity: 0.5, listening: false })
    layer.add(dot); layer.add(ring1); layer.add(ring2)
    activeNodesRef.current.push(dot, ring1, ring2)

    const finishNode = (node: Konva.Node, tween: Konva.Tween) => {
      activeTweensRef.current = activeTweensRef.current.filter((t) => t !== tween)
      activeNodesRef.current = activeNodesRef.current.filter((n) => n !== node)
      try { node.destroy() } catch { /* ignore */ }
    }

    const dotTween = new Konva.Tween({ node: dot, duration: 0.9, opacity: 0, easing: Konva.Easings.EaseOut })
    dotTween.onFinish = () => finishNode(dot, dotTween)
    const ring1Tween = new Konva.Tween({ node: ring1, duration: 1.4, opacity: 0, scaleX: 4, scaleY: 4, easing: Konva.Easings.EaseOut })
    ring1Tween.onFinish = () => finishNode(ring1, ring1Tween)
    const ring2Tween = new Konva.Tween({ node: ring2, duration: 2.0, opacity: 0, scaleX: 7, scaleY: 7, easing: Konva.Easings.EaseOut })
    ring2Tween.onFinish = () => finishNode(ring2, ring2Tween)

    activeTweensRef.current.push(dotTween, ring1Tween, ring2Tween)
    dotTween.play(); ring1Tween.play(); ring2Tween.play()
  }, [pointer])

  // Cleanup on unmount: destroy any in-flight tweens/nodes and clear the layer
  useEffect(() => {
    return () => {
      for (const tween of activeTweensRef.current) {
        try { tween.destroy() } catch { /* ignore */ }
      }
      activeTweensRef.current = []
      for (const node of activeNodesRef.current) {
        try { node.destroy() } catch { /* ignore */ }
      }
      activeNodesRef.current = []
      try { pointerLayerRef.current?.destroyChildren() } catch { /* ignore */ }
    }
  }, [])

  // Grid visibility + styling follow the DM's per-map settings. Fields
  // are optional on PlayerMapState to stay back-compatible with older
  // sync payloads — fall back to the v1 defaults (visible, 1x, the
  // stock rgba white) when the DM build predates v32.
  const gridVisible = mapState.gridVisible ?? true
  const gridThickness = mapState.gridThickness ?? 1
  const gridColor = mapState.gridColor ?? 'rgba(255,255,255,0.34)'
  const showGrid = image && mapState.gridType !== 'none' && gridVisible
  const cellPx = showGrid ? mapState.gridSize * scale : 0

  return (
    <Stage ref={stageRef} width={width} height={height} style={{ background: '#000', display: 'block' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Layer 1: Map image + checkerboard */}
      <Layer>
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
                ctx.rect(offX, offY, w, h)
                ctx.clip()
                // Create a 2-tile pattern once instead of per-cell fillRect
                const patternCanvas = document.createElement('canvas')
                patternCanvas.width = sz * 2
                patternCanvas.height = sz * 2
                const pCtx = patternCanvas.getContext('2d')!
                pCtx.fillStyle = '#2a2a2a'
                pCtx.fillRect(0, 0, sz, sz)
                pCtx.fillRect(sz, sz, sz, sz)
                pCtx.fillStyle = '#1a1a1a'
                pCtx.fillRect(sz, 0, sz, sz)
                pCtx.fillRect(0, sz, sz, sz)
                const pattern = ctx.createPattern(patternCanvas, 'repeat')!
                ctx.fillStyle = pattern
                ctx.fillRect(offX, offY, cols * sz, rows * sz)
                ctx.restore()
              }}
            />
            <KonvaImage
              image={image as HTMLImageElement}
              x={offX} y={offY}
              width={natW * scale}
              height={natH * scale}
              listening={false}
            />
          </>
        )}
      </Layer>

      {/* Layer 2: Grid overlay */}
      {showGrid && cellPx >= 4 && (
        <Layer listening={false}>
          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              const x0 = offX
              const y0 = offY
              const imgW = natW * scale
              const imgH = natH * scale

              ctx.beginPath()

              if (mapState.gridType === 'square') {
                const cols = Math.ceil(imgW / cellPx) + 1
                const rows = Math.ceil(imgH / cellPx) + 1
                for (let c = 0; c <= cols; c++) {
                  const x = x0 + c * cellPx
                  ctx.moveTo(x, y0)
                  ctx.lineTo(x, y0 + imgH)
                }
                for (let r = 0; r <= rows; r++) {
                  const y = y0 + r * cellPx
                  ctx.moveTo(x0, y)
                  ctx.lineTo(x0 + imgW, y)
                }
              } else if (mapState.gridType === 'hex') {
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

              ;(ctx as any)._context.save()
              ;(ctx as any)._context.strokeStyle = gridColor
              // Multiplier semantics match the DM layer: 1 → 0.5 px
              // auto-scaled hairline; the DM's slider tops out at ~3.
              ;(ctx as any)._context.lineWidth = 0.5 * gridThickness
              ;(ctx as any)._context.stroke()
              ;(ctx as any)._context.restore()
            }}
          />
        </Layer>
      )}

      {/* Layer 2: "Never explored" mask */}
      <Layer listening={false}>
        {exploredImg && image && (
          <KonvaImage
            image={exploredImg}
            x={offX} y={offY}
            width={natW * scale}
            height={natH * scale}
            listening={false}
          />
        )}
      </Layer>

      {/* Layer 3: "Explored but covered" dim overlay */}
      <Layer listening={false}>
        {coveredImg && image && (
          <KonvaImage
            image={coveredImg}
            x={offX} y={offY}
            width={natW * scale}
            height={natH * scale}
            listening={false}
          />
        )}
      </Layer>

      {/* Layer 3.5: Player drawings */}
      {drawingData.length > 0 && (
        <Layer listening={false}>
          {drawingData.map((d) => {
            if (d.type === 'freehand' && d.points.length >= 4) {
              const screenPoints = d.points.flatMap((p: number, i: number) => i % 2 === 0 ? p * scale + offX : p * scale + offY)
              return <Line key={`d-${d.id}`} points={screenPoints} stroke={d.color} strokeWidth={d.width * scale} listening={false} />
            }
            if (d.type === 'rect' && d.points.length >= 4) {
              const x1 = d.points[0] * scale + offX
              const y1 = d.points[1] * scale + offY
              const x2 = d.points[2] * scale + offX
              const y2 = d.points[3] * scale + offY
              return <Rect key={`d-${d.id}`} x={Math.min(x1, x2)} y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
                stroke={d.color} strokeWidth={d.width * scale} listening={false} />
            }
            if (d.type === 'circle' && d.points.length >= 4) {
              const cx = d.points[0] * scale + offX
              const cy = d.points[1] * scale + offY
              const dx = d.points[2] - d.points[0]
              const dy = d.points[3] - d.points[1]
              const radius = Math.sqrt(dx * dx + dy * dy) * scale
              return <Circle key={`d-${d.id}`} x={cx} y={cy} radius={radius}
                stroke={d.color} strokeWidth={d.width * scale} listening={false} />
            }
            if (d.type === 'text' && d.points.length >= 2) {
              const tx = d.points[0] * scale + offX
              const ty = d.points[1] * scale + offY
              return <Text key={`d-${d.id}`} x={tx} y={ty} text={d.text ?? ''}
                fontSize={14 * scale} fill={d.color} listening={false} />
            }
            return null
          })}
        </Layer>
      )}

      {/* Layer 4: Tokens */}
      <Layer listening={false}>
        {tokens.map((token) => (
          <PlayerTokenNode
            key={token.id}
            token={token}
            scale={scale}
            offX={offX}
            offY={offY}
            gridSize={mapState.gridSize}
          />
        ))}
      </Layer>

      {/* Layer 4.5: Lighting (LOS-clipped radial gradients) */}
      <PlayerLightingLayer
        tokens={tokens}
        walls={walls}
        scale={scale}
        offX={offX}
        offY={offY}
        gridSize={mapState.gridSize}
        imgW={natW}
        imgH={natH}
      />

      {/* Layer 5: Pointer/Ping overlay */}
      <Layer ref={pointerLayerRef} listening={false} />

      {/* Layer 6: Measurement overlay */}
      {measure && (
        <Layer listening={false}>
          {renderPlayerMeasure(measure, scale, offX, offY, mapState.gridSize)}
        </Layer>
      )}
    </Stage>
  )
}

// ─── Player-side lighting layer (LOS-clipped radial gradients) ───────────────

interface PlayerLightingLayerProps {
  tokens: PlayerTokenState[]
  walls: PlayerWallState[]
  scale: number
  offX: number
  offY: number
  gridSize: number
  imgW: number
  imgH: number
}

function PlayerLightingLayer({ tokens, walls, scale, offX, offY, gridSize, imgW, imgH }: PlayerLightingLayerProps) {
  const segments: Segment[] = useMemo(
    () => walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState })),
    [walls]
  )

  const lights = useMemo(
    () => tokens
      .filter((t) => t.lightRadius > 0)
      .map((t) => {
        const rawColor = t.lightColor || '#ffcc44'
        const lightColor = rawColor.length === 4
          ? '#' + rawColor[1] + rawColor[1] + rawColor[2] + rawColor[2] + rawColor[3] + rawColor[3]
          : rawColor
        const cx = t.x + (t.size * gridSize) / 2
        const cy = t.y + (t.size * gridSize) / 2
        return { id: t.id, cx, cy, rPx: t.lightRadius * gridSize, lightColor }
      }),
    [tokens, gridSize]
  )

  if (lights.length === 0 || imgW === 0 || imgH === 0) return null

  return (
    <Layer listening={false} opacity={0.6} perfectDrawEnabled={false}>
      {lights.map((l) => {
        const poly = computeVisibilityPolygon(l.cx, l.cy, l.rPx, segments, imgW, imgH)
        const screenPoly: number[] = []
        for (let i = 0; i < poly.length; i += 2) {
          screenPoly.push(poly[i] * scale + offX, poly[i + 1] * scale + offY)
        }
        const scx = l.cx * scale + offX
        const scy = l.cy * scale + offY
        const srPx = l.rPx * scale

        return (
          <Shape
            key={`pl-${l.id}`}
            listening={false}
            perfectDrawEnabled={false}
            sceneFunc={(ctx) => {
              const context = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
              context.save()
              if (screenPoly.length >= 6) {
                context.beginPath()
                context.moveTo(screenPoly[0], screenPoly[1])
                for (let i = 2; i < screenPoly.length; i += 2) {
                  context.lineTo(screenPoly[i], screenPoly[i + 1])
                }
                context.closePath()
                context.clip()
              } else {
                context.beginPath()
                context.arc(scx, scy, srPx, 0, Math.PI * 2)
                context.clip()
              }
              const gradient = context.createRadialGradient(scx, scy, 0, scx, scy, srPx)
              gradient.addColorStop(0,   l.lightColor + '44')
              gradient.addColorStop(0.5, l.lightColor + '22')
              gradient.addColorStop(1,   l.lightColor + '00')
              context.fillStyle = gradient
              context.beginPath()
              context.arc(scx, scy, srPx, 0, Math.PI * 2)
              context.fill()
              context.restore()
            }}
          />
        )
      })}
    </Layer>
  )
}

const STATUS_ICON_MAP: Record<string, string> = {
  blinded: '🫣', charmed: '💫', dead: '💀', deafened: '🔇',
  exhausted: '😫', frightened: '😱', grappled: '🤛', incapacitated: '😵',
  invisible: '👻', paralyzed: '⚡', petrified: '🪨', poisoned: '☠️',
  prone: '⬇️', restrained: '⛓️', stunned: '⭐', unconscious: '💤',
}

function PlayerTokenNode({
  token, scale, offX, offY, gridSize,
}: {
  token: PlayerTokenState
  scale: number
  offX: number
  offY: number
  gridSize: number
}) {
  const rotation = token.rotation ?? 0
  const { img: image } = useRotatedImage(token.imagePath ? `file://${token.imagePath}` : null, rotation)
  const x = token.x * scale + offX
  const y = token.y * scale + offY
  const sizePx = gridSize * token.size * scale
  const r = sizePx / 2
  const hpRatio = token.hpMax > 0 ? Math.max(0, Math.min(1, token.hpCurrent / token.hpMax)) : -1
  const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444'

  return (
    <Group x={x} y={y} listening={false}>
      <Group x={r} y={r} rotation={token.rotation ?? 0}>
        {(token.markerColor || factionColor(token.faction)) && (
          <Circle x={0} y={0} radius={r + 5} stroke={token.markerColor || factionColor(token.faction)} strokeWidth={3} fill="transparent" listening={false} />
        )}
        <Circle x={0} y={0} radius={r} fill="#182130" stroke="#1E2A3E" strokeWidth={1.5} listening={false} />
        {image ? (
          <KonvaImage
            image={image as HTMLImageElement}
            x={-r} y={-r}
            width={sizePx} height={sizePx}
            cornerRadius={r}
            listening={false}
          />
        ) : (
          <Text
            x={-r} y={-sizePx * 0.22}
            width={sizePx}
            text={token.name.charAt(0).toUpperCase()}
            align="center"
            fontSize={sizePx * 0.45}
            fontStyle="bold"
            fill="#94A0B2"
            listening={false}
          />
        )}
        {token.statusEffects && token.statusEffects.length > 0 && (() => {
          const effects = token.statusEffects.slice(0, 4)
          const iconSize = Math.max(11, Math.min(14, sizePx * 0.22))
          return effects.map((eff, idx) => (
            <Text
              key={eff}
              x={-r + idx * (iconSize + 2)}
              y={-r - iconSize - 4}
              text={STATUS_ICON_MAP[eff] ?? '❓'}
              fontSize={iconSize}
              listening={false}
            />
          ))
        })()}
        {token.ac != null && (
          <>
            <Rect x={r - 18} y={r - 14} width={16} height={12} fill="#182130"
              cornerRadius={3} stroke="#64748b" strokeWidth={1} listening={false} />
            <Text x={r - 18} y={r - 13} width={16} text={String(token.ac)}
              align="center" fontSize={9} fontStyle="bold" fill="#94A0B2" listening={false} />
          </>
        )}
      </Group>

      {/* HP bar + text */}
      {hpRatio >= 0 && (
        <>
          <Rect x={0} y={sizePx + 3} width={sizePx} height={6}
            fill="#0D1015" cornerRadius={2} listening={false} />
          <Rect x={0} y={sizePx + 3} width={sizePx * hpRatio} height={6}
            fill={hpColor} cornerRadius={2} listening={false} />
          <Text x={0} y={sizePx + 2} width={sizePx} text={`${token.hpCurrent}/${token.hpMax}`}
            align="center" fontSize={8} fontStyle="bold" fill="#F4F6FA"
            listening={false} />
        </>
      )}

      {/* Name label ABOVE token */}
      {token.showName && (
        <Text
          x={-r}
          y={-16}
          width={sizePx * 2}
          text={token.name}
          align="center"
          fontSize={Math.max(10, Math.min(13, sizePx * 0.22))}
          fill="#F4F6FA"
          shadowColor="black" shadowBlur={4} shadowOpacity={0.9}
          listening={false}
        />
      )}
    </Group>
  )
}

function renderPlayerMeasure(m: PlayerMeasureState, scale: number, offX: number, offY: number, gridSize: number) {
  const sx = m.startX * scale + offX
  const sy = m.startY * scale + offY
  const ex = m.endX * scale + offX
  const ey = m.endY * scale + offY
  const dx = m.endX - m.startX
  const dy = m.endY - m.startY
  const distPx = Math.sqrt(dx * dx + dy * dy)
  const radiusScreen = distPx * scale

  if (m.type === 'line') {
    return (
      <>
        <Line points={[sx, sy, ex, ey]} stroke="#f59e0b" strokeWidth={2} dash={[6, 3]} listening={false} />
        <Circle x={sx} y={sy} radius={5} fill="#f59e0b" listening={false} />
        <Circle x={ex} y={ey} radius={5} fill="#f59e0b" listening={false} />
        <Text x={(sx + ex) / 2 + 6} y={(sy + ey) / 2 - 8} text={`${m.distance} ft`}
          fontSize={14} fontStyle="bold" fill="#f59e0b" shadowColor="black" shadowBlur={4} shadowOpacity={0.9} listening={false} />
      </>
    )
  }
  if (m.type === 'circle') {
    return (
      <>
        <Circle x={sx} y={sy} radius={radiusScreen} stroke="#22c55e" strokeWidth={2}
          fill="rgba(34,197,94,0.08)" dash={[6, 3]} listening={false} />
        <Circle x={sx} y={sy} radius={5} fill="#22c55e" listening={false} />
        <Text x={sx + 8} y={sy - 20} text={`r = ${m.distance} ft`}
          fontSize={14} fontStyle="bold" fill="#22c55e" shadowColor="black" shadowBlur={4} shadowOpacity={0.9} listening={false} />
      </>
    )
  }
  if (m.type === 'cone') {
    const angle = Math.atan2(ey - sy, ex - sx)
    const halfAngle = Math.PI / 6
    const len = distPx * scale
    const p1x = sx + len * Math.cos(angle - halfAngle)
    const p1y = sy + len * Math.sin(angle - halfAngle)
    const p2x = sx + len * Math.cos(angle + halfAngle)
    const p2y = sy + len * Math.sin(angle + halfAngle)
    return (
      <>
        <Line points={[sx, sy, p1x, p1y, p2x, p2y, sx, sy]} stroke="#a855f7" strokeWidth={2}
          fill="rgba(168,85,247,0.12)" closed dash={[6, 3]} listening={false} />
        <Text x={(sx + ex) / 2 + 6} y={(sy + ey) / 2 - 8} text={`${m.distance} ft`}
          fontSize={14} fontStyle="bold" fill="#a855f7" shadowColor="black" shadowBlur={4} shadowOpacity={0.9} listening={false} />
      </>
    )
  }
  return null
}

// ─── Fog helpers ──────────────────────────────────────────────────────────────

function initDualFogCanvas(
  exploredRef: React.MutableRefObject<HTMLCanvasElement | null>,
  coveredRef: React.MutableRefObject<HTMLCanvasElement | null>,
  w: number,
  h: number,
  onDone: () => void,
) {
  if (
    exploredRef.current?.width === w &&
    exploredRef.current?.height === h
  ) return

  const explored = document.createElement('canvas')
  explored.width = w; explored.height = h
  // starts fully transparent — everything visible by default
  exploredRef.current = explored

  const covered = document.createElement('canvas')
  covered.width = w; covered.height = h
  coveredRef.current = covered

  onDone()
}

function loadDualFog(
  coveredDataUrl: string | null,
  exploredDataUrl: string | null,
  coveredRef: React.MutableRefObject<HTMLCanvasElement | null>,
  exploredRef: React.MutableRefObject<HTMLCanvasElement | null>,
  onDone: () => void,
) {
  let pending = 0
  const tryDone = () => { if (--pending === 0) onDone() }

  if (coveredDataUrl) { pending++; loadBitmapToRef(coveredDataUrl, coveredRef, tryDone) }
  if (exploredDataUrl) { pending++; loadBitmapToRef(exploredDataUrl, exploredRef, tryDone) }
  if (pending === 0) onDone()
}

function loadBitmapToRef(
  dataUrl: string,
  ref: React.MutableRefObject<HTMLCanvasElement | null>,
  onDone: () => void,
) {
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    ref.current = canvas
    onDone()
  }
  img.src = dataUrl
}

function PlayerImg({ path, style }: { path: string; style?: React.CSSProperties }) {
  const url = useImageUrl(path)
  if (!url) return null
  return <img src={url} style={style} />
}
