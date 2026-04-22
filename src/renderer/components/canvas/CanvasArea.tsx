import { useEffect, useRef, useState, useMemo } from 'react'
import { Stage, Layer } from 'react-konva'
import { MapLayer } from './MapLayer'
import { FogLayer } from './FogLayer'
import { TokenLayer } from './TokenLayer'
import { PointerLayer, POINTER_PING_EVENT, type PointerPingDetail } from './PointerLayer'
import { MeasureLayer } from './MeasureLayer'
import { MinimapOverlay } from './MinimapOverlay'
import { DrawingLayer } from './DrawingLayer'
import { GMPinLayer } from './GMPinLayer'
import { PlayerViewportLayer, PlayerViewportGestures } from './PlayerViewportLayer'
import { LightingLayer } from './LightingLayer'
import { WallLayer } from './WallLayer'
import { RoomLayer } from './RoomLayer'
import { PlayerEyeOverlay } from './PlayerEyeOverlay'
import { PlayerEyeHUD } from './PlayerEyeHUD'
import { ViewportHUD } from './ViewportHUD'
import { InitiativeTopStrip } from './InitiativeTopStrip'
import { ActiveToolHUD } from './ActiveToolHUD'
import { LeftToolDock } from './LeftToolDock'
import { SubToolStrip } from './SubToolStrip'
import { AudioStrip } from './AudioStrip'
import { WeatherCanvas } from './WeatherCanvas'
import type { WeatherType } from '@shared/ipc-types'
import { MultiSelectBar } from '../MultiSelectBar'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useFogStore } from '../../stores/fogStore'
import { useWallStore } from '../../stores/wallStore'
import { useEncounterStore } from '../../stores/encounterStore'
import { useRoomStore } from '../../stores/roomStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'
import { useImageUrl } from '../../hooks/useImageUrl'
import { useCanvasContextMenu } from '../../hooks/useCanvasContextMenu'
import { EmptyState } from '../EmptyState'
import { showToast } from '../shared/Toast'
import type Konva from 'konva'
import type { MapRecord, PlayerFullState } from '@shared/ipc-types'

function broadcastTokensFromCanvas() {
  if (useSessionStore.getState().sessionMode === 'prep') return
  const tokens = useTokenStore.getState().tokens
  const visible = tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) => ({
      id: t.id, name: t.name, imagePath: t.imagePath,
      x: t.x, y: t.y, size: t.size,
      hpCurrent: t.hpCurrent, hpMax: t.hpMax, showName: t.showName,
      rotation: t.rotation, markerColor: t.markerColor,
      statusEffects: t.statusEffects, ac: t.ac,
      faction: t.faction,
      lightRadius: t.lightRadius, lightColor: t.lightColor,
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Layer visibility definitions Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const LAYER_DEFS: { key: string; label: string; icon: string; canToggle: boolean }[] = [
  { key: 'map',      label: 'Karte',        icon: 'Ã°Å¸â€”Âº',  canToggle: false },
  { key: 'fog',      label: 'Nebel',        icon: 'Ã°Å¸Å’Â«',  canToggle: true  },
  { key: 'tokens',   label: 'Token',        icon: 'Ã°Å¸Âªâ„¢',  canToggle: true  },
  { key: 'drawings', label: 'Zeichnungen',  icon: 'Ã¢Å“Â',   canToggle: true  },
  { key: 'gmPins',   label: 'GM-Pins',      icon: 'Ã°Å¸â€œÅ’',  canToggle: true  },
  { key: 'lighting', label: 'Beleuchtung',  icon: 'Ã°Å¸â€™Â¡',  canToggle: true  },
  { key: 'walls',    label: 'WÃƒÂ¤nde',        icon: 'Ã°Å¸Â§Â±',  canToggle: true  },
  { key: 'rooms',    label: 'RÃƒÂ¤ume',        icon: 'Ã°Å¸ÂÂ ',  canToggle: true  },
]

const DEFAULT_LAYER_VISIBILITY: Record<string, boolean> = {
  map: true, fog: true, tokens: true, drawings: true,
  gmPins: true, lighting: true, walls: true, rooms: true,
}

/**
 * Delay before ambient canvas HUDs (viewport chip, minimap, layer toggle) fade
 * down. 2.5s felt noisy in testing; 3.5s matches Owlbear Rodeo. Combat HUD and
 * the multi-select bar ignore this Ã¢â‚¬â€ they carry action-critical state.
 */
const HUD_IDLE_DELAY_MS = 3500

export function CanvasArea() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [dropHighlight, setDropHighlight] = useState(false)
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(DEFAULT_LAYER_VISIBILITY)
  const layerPanelRef = useRef<HTMLDivElement>(null)
  const [hudIdle, setHudIdle] = useState(false)
  // Subscribe to the DM transform so the Player Control Mode overlay
  // re-paints as the DM pans / zooms the canvas itself.
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)

  // Close layer panel when clicking outside
  useEffect(() => {
    if (!layerPanelOpen) return
    function handleOutside(e: MouseEvent) {
      if (layerPanelRef.current && !layerPanelRef.current.contains(e.target as Node)) {
        setLayerPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [layerPanelOpen])

  // Keyboard shortcut: `L` toggles the layer-visibility panel (QW-9).
  // Gated the same way the other canvas shortcuts are Ã¢â‚¬â€ ignored while
  // the user is typing in a text field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'l' && e.key !== 'L') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      setLayerPanelOpen((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Fade ambient HUDs (viewport chip, minimap, layer toggle) when the cursor
  // is idle over the canvas. Pointer movement, click, wheel, or focus all
  // re-wake the HUDs. We bind on the container so sidebar interactions don't
  // count as activity.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const wake = () => {
      setHudIdle(false)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setHudIdle(true), HUD_IDLE_DELAY_MS)
    }
    const sleep = () => {
      if (timer) clearTimeout(timer)
      setHudIdle(true)
    }
    wake()
    el.addEventListener('pointermove', wake, { passive: true })
    el.addEventListener('pointerdown', wake)
    el.addEventListener('wheel', wake, { passive: true })
    el.addEventListener('pointerleave', sleep)
    return () => {
      if (timer) clearTimeout(timer)
      el.removeEventListener('pointermove', wake)
      el.removeEventListener('pointerdown', wake)
      el.removeEventListener('wheel', wake)
      el.removeEventListener('pointerleave', sleep)
    }
  }, [])

  function toggleLayer(key: string) {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const activeTool = useUIStore((s) => s.activeTool)
  const blackoutActive = useUIStore((s) => s.blackoutActive)
  const appMode = useUIStore((s) => s.appMode)
  const atmosphereImagePath = useUIStore((s) => s.atmosphereImagePath)
  const showMinimap = useUIStore((s) => s.showMinimap)
  const showPlayerEye = useUIStore((s) => s.showPlayerEye)
  const activeWeather = useUIStore((s) => s.activeWeather)
  const workMode = useSessionStore((s) => s.workMode)
  const handleContextMenu = useCanvasContextMenu()
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const activeMaps = useCampaignStore((s) => s.activeMaps)
  const activeMap = useMemo(() => activeMaps.find((m) => m.id === activeMapId) ?? null, [activeMaps, activeMapId])
  const atmosphereUrl = useImageUrl(atmosphereImagePath)

  // Set playerConnected=false when the player window is closed
  useEffect(() => {
    const unsub = window.electronAPI?.onPlayerWindowClosed(() => {
      useSessionStore.getState().setPlayerConnected(false)
    })
    return () => unsub?.()
  }, [])

  // Continuous camera sync was removed in favour of Player Control Mode
  // (the dashed blue rectangle on the GM canvas). The DM's own pan / zoom
  // no longer reaches the player window Ã¢â‚¬â€ only the explicit framed view
  // does. See `usePlayerSync` for the replacement broadcast path.

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize((prev) => {
        if (prev.width === w && prev.height === h) return prev
        return { width: w, height: h }
      })
    })
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Clear undo/redo stacks when switching maps to prevent cross-map undos
  useEffect(() => {
    useUndoStore.getState().setActiveMapId(activeMapId ?? null)
  }, [activeMapId])

  // Load tokens + initiative when map changes, then sync player
  useEffect(() => {
    if (!activeMapId || !activeMap) return
    loadMapData(activeMapId, activeMap)
  }, [activeMapId])

  // Drag-and-drop: import image files directly onto the canvas
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropHighlight(false)
    if (!window.electronAPI) return

    // Handle OS file drops
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (!file.type.startsWith('image/')) {
        // Dropping a PDF / audio / random file used to silently no-op Ã¢â‚¬â€
        // surface the rejection so users don't think the drop target is
        // broken (QW-11).
        showToast('Nur Bilddateien kÃƒÂ¶nnen hier abgelegt werden', 'info', 4000)
        return
      }
      const arrayBuf = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuf)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize))
      }
      const base64 = btoa(binary)
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = `data:${mimeType};base64,${base64}`

      // If no active map, create one from the dropped image
      if (!activeMapId) {
        const campaignId = useCampaignStore.getState().activeCampaignId
        if (!campaignId) return
        const assetResult = await window.electronAPI.saveAssetImage({
          dataUrl,
          originalName: file.name,
          type: 'map',
          campaignId,
        })
        if (!assetResult) return
        const mapName = file.name.replace(/\.[^.]+$/, '') || 'Neue Karte'
        const newMap = await window.electronAPI.maps.create({
          campaignId,
          name: mapName,
          imagePath: assetResult.path,
        })
        useCampaignStore.getState().addMap(newMap)
        useCampaignStore.getState().setActiveMap(newMap.id)
        return
      }

      // If active map, create a token at drop position

      const result = await window.electronAPI.saveAssetImage({
        dataUrl,
        originalName: file.name,
        type: 'token',
        campaignId: useCampaignStore.getState().activeCampaignId ?? 0,
      })
      if (!result) return

      // Get drop position in map coordinates
      const stage = stageRef.current
      const container = containerRef.current
      if (!stage || !container) return
      const rect = container.getBoundingClientRect()
      const pointerX = e.clientX - rect.left
      const pointerY = e.clientY - rect.top
      const mapPos = useMapTransformStore.getState().screenToMap(pointerX, pointerY)
      const gridSize = activeMap?.gridSize ?? 50
      const shouldSnap = useUIStore.getState().gridSnap && activeMap?.gridType !== 'none'
      const x = shouldSnap ? Math.round(mapPos.x / gridSize) * gridSize : mapPos.x
      const y = shouldSnap ? Math.round(mapPos.y / gridSize) * gridSize : mapPos.y

      const droppedToken = await window.electronAPI.tokens.create({
        mapId: activeMapId,
        name: file.name.replace(/\.[^.]+$/, ''),
        imagePath: result.path,
        x,
        y,
        faction: 'party',
        showName: true,
      })
      useTokenStore.getState().addToken(droppedToken)
      broadcastTokensFromCanvas()

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Place ${droppedToken.name}`,
        action: { type: 'token.place', payload: { token: droppedToken } },
        undo: async () => {
          useTokenStore.getState().removeToken(droppedToken.id)
          await window.electronAPI?.tokens.delete(droppedToken.id)
          broadcastTokensFromCanvas()
        },
        redo: async () => {
          await window.electronAPI?.tokens.restore(droppedToken)
          useTokenStore.getState().addToken(droppedToken)
          broadcastTokensFromCanvas()
        },
      })
      return
    }

    // Handle asset-path drops from AssetBrowser (storedPath in dataTransfer)
    const storedPath = e.dataTransfer.getData('application/boltberry-asset-path')
    const assetType = e.dataTransfer.getData('application/boltberry-asset-type')
    if (storedPath && assetType === 'token' && activeMapId) {
      const stage = stageRef.current
      const container = containerRef.current
      if (!stage || !container) return
      const rect = container.getBoundingClientRect()
      const pointerX = e.clientX - rect.left
      const pointerY = e.clientY - rect.top
      const mapPos = useMapTransformStore.getState().screenToMap(pointerX, pointerY)
      const gridSize = activeMap?.gridSize ?? 50
      const shouldSnap = useUIStore.getState().gridSnap && activeMap?.gridType !== 'none'
      const x = shouldSnap ? Math.round(mapPos.x / gridSize) * gridSize : mapPos.x
      const y = shouldSnap ? Math.round(mapPos.y / gridSize) * gridSize : mapPos.y

      const assetName = storedPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Token'
      const assetToken = await window.electronAPI.tokens.create({
        mapId: activeMapId,
        name: assetName,
        imagePath: storedPath,
        x,
        y,
        faction: 'party',
        showName: true,
      })
      useTokenStore.getState().addToken(assetToken)
      broadcastTokensFromCanvas()

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Place ${assetToken.name}`,
        action: { type: 'token.place', payload: { token: assetToken } },
        undo: async () => {
          useTokenStore.getState().removeToken(assetToken.id)
          await window.electronAPI?.tokens.delete(assetToken.id)
          broadcastTokensFromCanvas()
        },
        redo: async () => {
          await window.electronAPI?.tokens.restore(assetToken)
          useTokenStore.getState().addToken(assetToken)
          broadcastTokensFromCanvas()
        },
      })
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/boltberry-asset-path')) {
      setDropHighlight(true)
    }
  }

  function handleDragLeave() {
    setDropHighlight(false)
  }

  return (
    <div
      ref={containerRef}
      className={`canvas-area${hudIdle ? ' hud-idle' : ''}`}
      data-tool={activeTool}
      style={{ position: 'relative' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Atmosphere mode: show image fullscreen */}
      {appMode === 'atmosphere' && atmosphereImagePath ? (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000',
        }}>
          <img
            src={atmosphereUrl ?? ''}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      ) : !activeMap ? (
        <EmptyState
          icon="Ã°Å¸â€”ÂºÃ¯Â¸Â"
          title="Keine Karte geladen"
          description={
            <ol style={{ textAlign: 'left', paddingLeft: 20, margin: '8px 0 0', lineHeight: 2, maxWidth: 320 }}>
              <li>Ãƒâ€“ffne die <strong>linke Sidebar</strong> (Ã¢â€”Â§ oben links)</li>
              <li>Klicke auf <strong>Ã°Å¸â€“Â¼ Karte hinzufÃƒÂ¼gen</strong> und wÃƒÂ¤hle ein Bild</li>
              <li>Passe Raster &amp; Felder in den Karteneinstellungen an</li>
              <li>Wechsle in den <strong>Ã¢â€“Â¶ Spiel-Modus</strong> und starte die Session</li>
            </ol>
          }
        />
      ) : (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          style={{ display: 'block' }}
          onContextMenu={handleContextMenu}
        >
          {/* Layer 1: Map image + grid */}
          <MapLayer
            map={activeMap}
            stageRef={stageRef}
            canvasSize={size}
            gridOffsetX={activeMap.gridOffsetX ?? 0}
            gridOffsetY={activeMap.gridOffsetY ?? 0}
          />

          {/* Layer 2: Fog of War */}
          {layerVisibility['fog'] && (
            <FogLayer
              mapId={activeMap.id}
              stageRef={stageRef}
              canvasSize={size}
              activeTool={activeTool}
              gridSize={activeMap.gridSize}
              playerPreview={workMode === 'player-preview'}
            />
          )}

          {/* Layer 3: Tokens */}
          {layerVisibility['tokens'] && (
            <TokenLayer
              map={activeMap}
              stageRef={stageRef}
            />
          )}

          {/* Layer 4: Pointer/Ping overlay */}
          <PointerLayer stageRef={stageRef} />

          {/* Layer 5: Measurement overlay */}
          <MeasureLayer
            stageRef={stageRef}
            gridSize={activeMap.gridSize}
            ftPerUnit={activeMap.ftPerUnit}
            canvasSize={size}
          />

          {/* Layer 6: Drawing overlay */}
          {layerVisibility['drawings'] && (
            <DrawingLayer
              stageRef={stageRef}
              mapId={activeMap.id}
              gridSize={activeMap.gridSize}
            />
          )}

          {/* Layer 7: GM pins (DM only) */}
          {layerVisibility['gmPins'] && (
            <GMPinLayer
              stageRef={stageRef}
              mapId={activeMap.id}
              gridSize={activeMap.gridSize}
            />
          )}

          {/* Layer 8: Lighting overlay */}
          {layerVisibility['lighting'] && (
            <LightingLayer
              stageRef={stageRef}
              mapId={activeMap.id}
              gridSize={activeMap.gridSize}
            />
          )}

          {/* Layer 9: Walls & doors */}
          {layerVisibility['walls'] && (
            <WallLayer
              mapId={activeMap.id}
              stageRef={stageRef}
              gridSize={activeMap.gridSize}
            />
          )}

          {/* Layer 10: Rooms */}
          {layerVisibility['rooms'] && (
            <RoomLayer
              mapId={activeMap.id}
              stageRef={stageRef}
              gridSize={activeMap.gridSize}
            />
          )}

          {/* Layer 11: Player Eye overlay (hidden tokens + stats) */}
          {(showPlayerEye || workMode === 'player-preview') && activeMap && (
            <PlayerEyeOverlay
              map={activeMap}
              stageRef={stageRef}
              canvasSize={size}
            />
          )}

          {/* Layer 12: Player Control Mode Ã¢â‚¬â€ dashed rectangle that frames
              what the player window renders. Drawn on top of every
              other layer so it's always visible no matter what tool
              the DM has active. Listens to nothing (interactions live
              in MapLayer's handlers + keyboard shortcuts). */}
          {activeMap && (
            <PlayerViewportLayer
              map={activeMap}
              scale={scale}
              offsetX={offsetX}
              offsetY={offsetY}
            />
          )}
        </Stage>
      )}

      {/* Player Control Mode Ã¢â‚¬â€ Ctrl+drag / Ctrl+wheel gestures. Mounted
          outside the Stage so the window-level listeners keep working
          even when no map is loaded (the PlayerViewportLayer above is
          only rendered when a map exists). */}
      <PlayerViewportGestures />

      {/* Player Eye HUD */}
      <PlayerEyeHUD />

      {/* Viewport info chip (bottom-left) */}
      <ViewportHUD />

      {/* Active tool chip (bottom-left, above viewport HUD) */}
      <ActiveToolHUD />

      {/* Floating tool rail (v1 Conservative left rail, 60px, glass) */}
      <LeftToolDock />

      {/* Contextual sub-tool strip (appears right of the rail when the
          active tool has configurable presets). */}
      <SubToolStrip />

      {/* Compact audio strip (bottom-left); only visible when a channel
          is loaded. Click the Ã¢â€¹Â¯ handle to open the full AudioPanel. */}
      <AudioStrip />

      {/* Weather overlay Ã¢â‚¬â€ preview for the DM of what the players see.
          `activeWeather` is kept in uiStore so it persists across view
          toggles; the actual broadcast to the player window happens in
          OverlayPanel. */}
      {activeWeather && activeWeather !== 'none' && (
        <WeatherCanvas
          type={activeWeather as WeatherType}
          width={size.width}
          height={size.height}
        />
      )}

      {/* Initiative top-strip (top-center, combat mode only) */}
      <InitiativeTopStrip />

      {/* Multi-select bar (bottom-center, when 2+ tokens selected) */}
      <MultiSelectBar />

      {/* Drop highlight overlay */}
      {dropHighlight && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          border: '3px dashed #2F6BFF', borderRadius: 8,
          background: 'rgba(47,107,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 18, fontWeight: 700, color: '#2F6BFF',
            background: 'rgba(13,16,21,0.85)', padding: '12px 24px',
            borderRadius: 8,
          }}>Token hier ablegen</div>
        </div>
      )}

      {/* Player preview mode banner */}
      {workMode === 'player-preview' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200,
          background: '#22c55e', color: '#fff', textAlign: 'center',
          fontSize: 13, fontWeight: 700, padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          Ã°Å¸â€˜Â Spieler-Vorschau Ã¢â‚¬â€ Du siehst, was die Spieler sehen
          <button
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#fff', padding: '2px 10px', cursor: 'pointer', fontSize: 12, marginLeft: 12 }}
            onClick={() => useSessionStore.getState().setWorkMode('play')}
          >ZurÃƒÂ¼ck zum Spiel</button>
        </div>
      )}

      {/* Player Eye mode border */}
      {showPlayerEye && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 130,
          border: '3px solid rgba(34, 197, 94, 0.6)',
          borderRadius: 4,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 30px rgba(34, 197, 94, 0.15)',
        }} />
      )}

      {/* Blackout overlay */}
      {blackoutActive && (
        <div
          className="blackout-overlay"
          style={{ opacity: 1 }}
          onClick={() => useUIStore.getState().toggleBlackout()}
          title="Klicken zum Aufheben"
        />
      )}

      {/* Minimap overlay */}
      {showMinimap && activeMap && (
        <MinimapOverlay stageRef={stageRef} canvasSize={size} />
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Layer visibility panel Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {activeMap && (
        <div
          ref={layerPanelRef}
          className="canvas-hud-fade"
          style={{
            position: 'absolute',
            // Clear the FloatingUtilityDock (dice/audio/overlay rail, which
            // sits at bottom:calc(statusbar-h + sp-3) = ~38 px, ~44 px tall
            // so it extends to ~82 px). Give a pinch extra so the hover
            // shadows don't overlap. Minimap pushes us further up.
            bottom: showMinimap ? 220 : 96,
            right: 12,
            zIndex: 300,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          {/* Panel itself */}
          {layerPanelOpen && (
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 0',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              minWidth: 170,
            }}>
              <div style={{
                padding: '2px 12px 6px',
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: 4,
              }}>
                Ebenen
              </div>
              {LAYER_DEFS.map((def) => (
                <button
                  key={def.key}
                  onClick={() => def.canToggle && toggleLayer(def.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '5px 12px',
                    background: 'none',
                    border: 'none',
                    cursor: def.canToggle ? 'pointer' : 'default',
                    color: layerVisibility[def.key] ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 'var(--text-xs)',
                    textAlign: 'left',
                    opacity: def.canToggle ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => { if (def.canToggle) e.currentTarget.style.background = 'var(--bg-overlay)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                  title={def.canToggle ? (layerVisibility[def.key] ? 'Ebene ausblenden' : 'Ebene einblenden') : 'Immer sichtbar'}
                >
                  {/* Visibility dot */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: layerVisibility[def.key] ? 'var(--success, #22c55e)' : 'var(--border)',
                    border: `1px solid ${layerVisibility[def.key] ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                  }} />
                  <span style={{ fontSize: 13, minWidth: 18 }}>{def.icon}</span>
                  <span style={{ flex: 1 }}>{def.label}</span>
                  {!def.canToggle && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>immer</span>
                  )}
                </button>
              ))}
              {/* Reset all */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 4, padding: '4px 12px 0' }}>
                <button
                  onClick={() => setLayerVisibility(DEFAULT_LAYER_VISIBILITY)}
                  style={{
                    background: 'none', border: 'none', padding: '3px 0',
                    color: 'var(--text-muted)', fontSize: 'var(--text-xs)',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                  }}
                >
                  Ã¢â€ Âº Alle einblenden
                </button>
              </div>
            </div>
          )}

          {/* Toggle button */}
          <button
            onClick={() => setLayerPanelOpen((v) => !v)}
            title="Ebenen ein-/ausblenden"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              background: layerPanelOpen ? 'var(--bg-elevated)' : 'rgba(13,16,21,0.75)',
              border: `1px solid ${layerPanelOpen ? 'var(--border)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <span>Ã¢â€”Â«</span>
            <span>Ebenen</span>
            {/* Dot indicator if any layer is hidden */}
            {Object.entries(layerVisibility).some(([k, v]) => {
              const def = LAYER_DEFS.find((d) => d.key === k)
              return def?.canToggle && !v
            }) && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning, #f59e00)' }} />
            )}
          </button>
        </div>
      )}
    </div>
  )
}

async function loadMapData(mapId: number, map: MapRecord) {
  if (!window.electronAPI) return

  useFogStore.getState().clearHistory()

  try {
    const campaignId = useCampaignStore.getState().activeCampaignId

    // Fire all independent DB queries in parallel for faster map load
    const [tokens, initiative, walls, encounters, rooms, fog, drawingRows] = await Promise.all([
      window.electronAPI.tokens.listByMap(mapId),

      window.electronAPI.initiative.listByMap(mapId),

      window.electronAPI.walls.listByMap(mapId),

      campaignId
        ? window.electronAPI.encounters.listByCampaign(campaignId)
        : Promise.resolve([] as any[]),

      window.electronAPI.rooms.listByMap(mapId),

      window.electronAPI.fog.get(mapId).catch((err) => {
        console.error('[CanvasArea] fog load failed:', err)
        return { fogBitmap: null, exploredBitmap: null }
      }),

      window.electronAPI.drawings.listSyncedByMap(mapId).catch((err) => {
        console.error('[CanvasArea] drawings load failed:', err)
        return [] as any[]
      }),
    ])

    // Apply results to stores
    useTokenStore.getState().setTokens(tokens)

    useInitiativeStore.getState().setEntries(initiative)

    useWallStore.getState().setWalls(walls)

    if (campaignId && encounters.length > 0) {
      useEncounterStore.getState().setEncounters(encounters)
    }

    useRoomStore.getState().setRooms(rooms)

    const fogBitmap: string | null = fog.fogBitmap
    const exploredBitmap: string | null = fog.exploredBitmap

    const playerDrawings: Array<{ id: number; type: string; points: number[]; color: string; width: number }> =
      drawingRows.map((r) => ({
        id: r.id, type: r.type, points: r.points, color: r.color, width: r.width,
      }))

    const { blackoutActive, appMode, atmosphereImagePath } = useUIStore.getState()
    const syncMode: PlayerFullState['mode'] = blackoutActive
      ? 'blackout'
      : appMode === 'atmosphere'
        ? 'atmosphere'
        : 'map'

    // Walls + viewport must ride along in every full-sync so a
    // reconnecting player doesn't compute LOS against an empty wall
    // set or keep a stale Player Control Mode frame from the
    // previous map. Previously both were omitted here and the
    // separate PLAYER_WALLS broadcast was racing the first fog /
    // token delta.
    const { playerViewportMode, playerViewport } = useUIStore.getState()
    const wallsForPlayer = useWallStore.getState().walls
      .filter((w) => w.mapId === mapId)
      .map((w) => ({
        id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
        wallType: w.wallType, doorState: w.doorState,
      }))
    const viewportForPlayer = playerViewportMode && playerViewport
      ? {
          cx: playerViewport.cx, cy: playerViewport.cy,
          w: playerViewport.w,  h: playerViewport.h,
          rotation: playerViewport.rotation,
        }
      : null

    window.electronAPI?.sendFullSync({
      mode: syncMode,
      map: {
        imagePath: map.imagePath,
        gridType: map.gridType,
        gridSize: map.gridSize,
        rotation: map.rotation ?? 0,
      },
      tokens: useTokenStore.getState().tokens
        .filter((t) => t.visibleToPlayers)
        .map((t) => ({
          id: t.id,
          name: t.name,
          imagePath: t.imagePath,
          x: t.x,
          y: t.y,
          size: t.size,
          hpCurrent: t.hpCurrent,
          hpMax: t.hpMax,
          showName: t.showName,
          rotation: t.rotation,
          markerColor: t.markerColor,
          statusEffects: t.statusEffects,
          ac: t.ac,
          faction: t.faction,
          lightRadius: t.lightRadius,
          lightColor: t.lightColor,
        })),
      walls: wallsForPlayer,
      viewport: viewportForPlayer,
      fogBitmap,
      exploredBitmap,
      atmosphereImagePath: appMode === 'atmosphere' ? atmosphereImagePath : null,
      blackout: blackoutActive,
      drawings: playerDrawings,
    })

    if (useSessionStore.getState().sessionMode !== 'prep') {
      useSessionStore.getState().setPlayerConnected(true)
    }
  } catch (err) {
    console.error('[CanvasArea] loadMapData failed:', err)
  }
}
