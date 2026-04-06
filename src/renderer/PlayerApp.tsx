import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import type { PlayerFullState, PlayerTokenState, FogDelta, PlayerMapState, PlayerPointer, PlayerCamera, PlayerOverlay, PlayerInitiativeEntry, WeatherType } from '@shared/ipc-types'
import { useRotatedImage } from './hooks/useRotatedImage'
import { applyOpToCtxPair } from './components/canvas/FogLayer'

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
    if (!window.playerAPI) return

    const unsubs = [
      window.playerAPI.onFullSync((state: PlayerFullState) => {
        setBlackout(state.blackout)
        setTokens(state.tokens)

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
        setMapState(state)
        setMode('map')
        exploredCanvasRef.current = null
        coveredCanvasRef.current = null
        setFogVersion((v) => v + 1)
      }),

      window.playerAPI.onTokenUpdate((t) => setTokens(t)),

      window.playerAPI.onBlackout((active: boolean) => {
        setBlackout(active)
        setMode(active ? 'blackout' : (mapState ? 'map' : 'idle'))
      }),

      window.playerAPI.onAtmosphere((path: string | null) => {
        if (path) {
          setAtmospherePath(path)
          setMode('atmosphere')
        } else {
          setMode(mapState ? 'map' : 'idle')
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
        padding: 40,
      }}>
        <div style={{
          background: '#182130', borderRadius: 12, border: '1px solid #1E2A3E',
          padding: 32, maxWidth: 600, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,0.8)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#F4F6FA', marginBottom: 16 }}>
            {handout.title}
          </div>
          {handout.imagePath && (
            <img
              src={`file://${handout.imagePath}`}
              style={{ width: '100%', borderRadius: 8, marginBottom: handout.textContent ? 16 : 0 }}
            />
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
        <img src={`file://${atmospherePath}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
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
          exploredCanvasRef={exploredCanvasRef}
          coveredCanvasRef={coveredCanvasRef}
          fogVersion={fogVersion}
          width={size.w}
          height={size.h}
          pointer={pointer}
          camera={camera}
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

interface Particle { x: number; y: number; vx: number; vy: number; size: number; alpha: number }

function WeatherCanvas({ type, width, height }: { type: WeatherType; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (type === 'none' || type === 'fog') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const count = type === 'wind' ? 60 : 140
    const particles: Particle[] = Array.from({ length: count }, () => makeParticle(type, width, height, true))

    let rafId: number
    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.y > height + 20 || p.x < -20 || p.x > width + 20) {
          Object.assign(p, makeParticle(type, width, height, false))
        }
        ctx.globalAlpha = p.alpha
        if (type === 'rain') {
          ctx.strokeStyle = 'rgba(140,180,255,0.8)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2)
          ctx.stroke()
        } else if (type === 'snow') {
          ctx.fillStyle = 'rgba(230,240,255,0.9)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        } else if (type === 'wind') {
          ctx.strokeStyle = 'rgba(200,220,255,0.4)'
          ctx.lineWidth = 0.5 + p.size * 0.3
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 8, p.y - p.vy * 8)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [type, width, height])

  if (type === 'none') return null

  if (type === 'fog') {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 80%, rgba(180,200,240,0.22) 0%, rgba(180,200,240,0.08) 100%)',
        backdropFilter: 'blur(2px)',
        pointerEvents: 'none', zIndex: 10,
      }} />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
    />
  )
}

function makeParticle(type: WeatherType, width: number, height: number, randomY: boolean): Particle {
  if (type === 'rain') {
    return {
      x: Math.random() * (width + 100) - 50,
      y: randomY ? Math.random() * height : -10,
      vx: -2 - Math.random() * 2,
      vy: 14 + Math.random() * 8,
      size: 1,
      alpha: 0.5 + Math.random() * 0.5,
    }
  }
  if (type === 'snow') {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : -10,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.8 + Math.random() * 1.2,
      size: 1 + Math.random() * 2.5,
      alpha: 0.6 + Math.random() * 0.4,
    }
  }
  // wind
  return {
    x: -40,
    y: Math.random() * height,
    vx: 8 + Math.random() * 10,
    vy: (Math.random() - 0.5) * 1.5,
    size: 1 + Math.random() * 3,
    alpha: 0.3 + Math.random() * 0.4,
  }
}

// ─── Player Map View ──────────────────────────────────────────────────────────

interface PlayerMapViewProps {
  mapState: PlayerMapState
  tokens: PlayerTokenState[]
  exploredCanvasRef: React.RefObject<HTMLCanvasElement | null>
  coveredCanvasRef: React.RefObject<HTMLCanvasElement | null>
  fogVersion: number
  width: number
  height: number
  pointer: PlayerPointer | null
  camera: PlayerCamera | null
  onMapLoaded: (naturalW: number, naturalH: number) => void
}

function PlayerMapView({
  mapState, tokens, exploredCanvasRef, coveredCanvasRef, fogVersion, width, height, pointer, camera, onMapLoaded,
}: PlayerMapViewProps) {
  const { img: image, imgW: natW, imgH: natH } = useRotatedImage(`file://${mapState.imagePath}`, mapState.rotation ?? 0)
  const [exploredImg, setExploredImg] = useState<HTMLImageElement | null>(null)
  const [coveredImg, setCoveredImg]   = useState<HTMLImageElement | null>(null)
  const pointerLayerRef = useRef<Konva.Layer>(null)

  // Notify parent when map image loads → init fog canvases
  useEffect(() => {
    if (!image || natW === 0 || natH === 0) return
    onMapLoaded(natW, natH)
  }, [natW, natH])

  // Convert fog canvases → HTMLImageElement for Konva on each fog change.
  useEffect(() => {
    const ec = exploredCanvasRef.current
    const cc = coveredCanvasRef.current

    if (!ec && !cc) { setExploredImg(null); setCoveredImg(null); return }

    let rafId: number
    rafId = requestAnimationFrame(() => {
      let eImg: HTMLImageElement | null = null
      let cImg: HTMLImageElement | null = null
      let loaded = 0
      const target = (ec ? 1 : 0) + (cc ? 1 : 0)
      const trySetBoth = () => {
        if (++loaded === target) { setExploredImg(eImg); setCoveredImg(cImg) }
      }

      if (ec) {
        const img = new Image()
        img.onload = () => { eImg = img; trySetBoth() }
        img.src = ec.toDataURL()
      }
      if (cc) {
        const img = new Image()
        img.onload = () => { cImg = img; trySetBoth() }
        img.src = cc.toDataURL()
      }
    })

    return () => cancelAnimationFrame(rafId)
  }, [fogVersion])

  // Fit-to-screen transform (base)
  let scale = 1, offX = 0, offY = 0
  if (image && natW > 0 && natH > 0) {
    const sx = width / natW
    const sy = height / natH
    const fitScale = Math.min(sx, sy)
    if (camera) {
      scale = fitScale * camera.relZoom
      offX = width / 2 - camera.imageCenterX * scale
      offY = height / 2 - camera.imageCenterY * scale
    } else {
      scale = fitScale
      offX = (width - natW * scale) / 2
      offY = (height - natH * scale) / 2
    }
  }

  // Pointer pulse (imperative Konva)
  useEffect(() => {
    if (!pointer || !pointerLayerRef.current || !image) return
    const layer = pointerLayerRef.current
    const px = pointer.x * scale + offX
    const py = pointer.y * scale + offY

    const dot = new Konva.Circle({ x: px, y: py, radius: 10, fill: '#f59e0b', opacity: 1, listening: false })
    const ring1 = new Konva.Circle({ x: px, y: py, radius: 16, fill: 'transparent', stroke: '#f59e0b', strokeWidth: 3, opacity: 1, listening: false })
    const ring2 = new Konva.Circle({ x: px, y: py, radius: 16, fill: 'transparent', stroke: '#f59e0b', strokeWidth: 1.5, opacity: 0.5, listening: false })
    layer.add(dot); layer.add(ring1); layer.add(ring2)

    new Konva.Tween({ node: dot,   duration: 0.9, opacity: 0,   easing: Konva.Easings.EaseOut, onFinish: () => dot.destroy() }).play()
    new Konva.Tween({ node: ring1, duration: 1.4, opacity: 0, scaleX: 4, scaleY: 4, easing: Konva.Easings.EaseOut, onFinish: () => ring1.destroy() }).play()
    new Konva.Tween({ node: ring2, duration: 2.0, opacity: 0, scaleX: 7, scaleY: 7, easing: Konva.Easings.EaseOut, onFinish: () => ring2.destroy() }).play()
  }, [pointer])

  return (
    <Stage width={width} height={height} style={{ background: '#000', display: 'block' }}>
      {/* Layer 1: Map image */}
      <Layer>
        {image && (
          <KonvaImage
            image={image as HTMLImageElement}
            x={offX} y={offY}
            width={natW * scale}
            height={natH * scale}
            listening={false}
          />
        )}
      </Layer>

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

      {/* Layer 5: Pointer/Ping overlay */}
      <Layer ref={pointerLayerRef} listening={false} />
    </Stage>
  )
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
  const { img: image } = useRotatedImage(token.imagePath ? `file://${token.imagePath}` : null, 0)
  const x = token.x * scale + offX
  const y = token.y * scale + offY
  const sizePx = gridSize * token.size * scale

  if (!image) return null
  return (
    <KonvaImage
      image={image as HTMLImageElement}
      x={x} y={y}
      width={sizePx} height={sizePx}
      cornerRadius={sizePx / 2}
      listening={false}
    />
  )
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
  explored.getContext('2d')!.fillStyle = 'rgba(0,0,0,1)'
  explored.getContext('2d')!.fillRect(0, 0, w, h)
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
