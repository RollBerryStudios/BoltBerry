import { useEffect, useRef, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import { MapLayer } from './MapLayer'
import { FogLayer } from './FogLayer'
import { TokenLayer } from './TokenLayer'
import { PointerLayer } from './PointerLayer'
import { MeasureLayer } from './MeasureLayer'
import { MinimapOverlay } from './MinimapOverlay'
import { DrawingLayer } from './DrawingLayer'
import { DrawingToolbar } from './DrawingToolbar'
import { GMPinLayer, GM_PIN_ADD_EVENT } from './GMPinLayer'
import { LightingLayer } from './LightingLayer'
import { WallLayer } from './WallLayer'
import { useUIStore } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useFogStore } from '../../stores/fogStore'
import { useWallStore } from '../../stores/wallStore'
import { useImageUrl } from '../../hooks/useImageUrl'
import type Konva from 'konva'
import type { MapRecord, PlayerFullState } from '@shared/ipc-types'

function broadcastTokensFromCanvas() {
  if (useUIStore.getState().sessionMode === 'prep') return
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
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}

export function CanvasArea() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [dropHighlight, setDropHighlight] = useState(false)

  const { activeTool, blackoutActive, appMode, atmosphereImagePath, showMinimap } = useUIStore()
  const { activeMapId, activeMaps } = useCampaignStore()
  const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null
  const atmosphereUrl = useImageUrl(atmosphereImagePath)

  // Continuous camera sync to player when follow mode is on
  useEffect(() => {
    const unsub = useMapTransformStore.subscribe((state, prevState) => {
      if (!useUIStore.getState().cameraFollowDM) return
      if (state.scale !== prevState.scale || state.offsetX !== prevState.offsetX || state.offsetY !== prevState.offsetY) {
        const { scale, offsetX, offsetY, fitScale, canvasW, canvasH, imgW, imgH } = state
        if (!fitScale || !canvasW || !canvasH || !imgW || !imgH) return
        const imageCenterX = (canvasW / 2 - offsetX) / scale
        const imageCenterY = (canvasH / 2 - offsetY) / scale
        const relZoom = scale / fitScale
        window.electronAPI?.sendCameraView({ imageCenterX, imageCenterY, relZoom })
      }
    })
    return () => unsub()
  }, [])

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

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
      if (!file.type.startsWith('image/')) return
      const arrayBuf = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)))
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = `data:${mimeType};base64,${base64}`

      // If no active map, create one from the dropped image
      if (!activeMapId) {
        const assetResult = await window.electronAPI.saveAssetImage({
          dataUrl,
          originalName: file.name,
          type: 'map',
          campaignId: useCampaignStore.getState().activeCampaignId ?? 0,
        })
        if (!assetResult) return
        const mapName = file.name.replace(/\.[^.]+$/, '') || 'Neue Karte'
        const dbResult = await window.electronAPI.dbRun(
          `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation) VALUES (?, ?, ?, ?, 0)`,
          [useCampaignStore.getState().activeCampaignId, mapName, assetResult.path, useCampaignStore.getState().activeMaps.length]
        )
        useCampaignStore.getState().addMap({
          id: dbResult.lastInsertRowid,
          campaignId: useCampaignStore.getState().activeCampaignId ?? 0,
          name: mapName,
          imagePath: assetResult.path,
          gridType: 'square',
          gridSize: 50,
          ftPerUnit: 5,
          orderIndex: useCampaignStore.getState().activeMaps.length,
          rotation: 0,
          gridOffsetX: 0,
          gridOffsetY: 0,
          ambientBrightness: 100,
          cameraX: null,
          cameraY: null,
          cameraScale: null,
        })
        useCampaignStore.getState().setActiveMap(dbResult.lastInsertRowid)
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

      const dbResult = await window.electronAPI.dbRun(
        `INSERT INTO tokens (map_id, name, image_path, x, y, faction, show_name) VALUES (?, ?, ?, ?, ?, 'party', 1)`,
        [activeMapId, file.name.replace(/\.[^.]+$/, ''), result.path, x, y]
      )

      useTokenStore.getState().addToken({
        id: dbResult.lastInsertRowid,
        mapId: activeMapId,
        name: file.name.replace(/\.[^.]+$/, ''),
        imagePath: result.path,
        x, y,
        size: 1,
        hpCurrent: 0,
        hpMax: 0,
        visibleToPlayers: true,
        rotation: 0,
        locked: false,
        zIndex: 0,
        markerColor: null,
        ac: null,
        notes: null,
        statusEffects: null,
        faction: 'party',
        showName: true,
      })
      broadcastTokensFromCanvas()
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

      const dbResult = await window.electronAPI.dbRun(
        `INSERT INTO tokens (map_id, name, image_path, x, y, faction, show_name) VALUES (?, ?, ?, ?, ?, 'party', 1)`,
        [activeMapId, storedPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Token', storedPath, x, y]
      )

      useTokenStore.getState().addToken({
        id: dbResult.lastInsertRowid,
        mapId: activeMapId,
        name: storedPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Token',
        imagePath: storedPath,
        x, y,
        size: 1, hpCurrent: 0, hpMax: 0, visibleToPlayers: true, rotation: 0,
        locked: false, zIndex: 0, markerColor: null, ac: null, notes: null, statusEffects: null,
        faction: 'party', showName: true,
      })
      broadcastTokensFromCanvas()
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
      className="canvas-area"
      style={{ cursor: getCursor(activeTool), position: 'relative' }}
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
        <div className="empty-state">
          <div className="empty-state-icon">🗺️</div>
          <div className="empty-state-title">Keine Karte geladen</div>
          <div className="empty-state-desc">
            Wähle eine Karte aus der linken Sidebar oder füge eine neue hinzu
          </div>
        </div>
      ) : (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          style={{ display: 'block' }}
          onContextMenu={async (e) => {
            e.evt.preventDefault()
            if (!window.electronAPI) return
            const action = await window.electronAPI.showContextMenu([
              { label: 'Kamera zentrieren', action: 'center-camera' },
              { label: 'GM-Pin setzen', action: 'add-gm-pin' },
            ])
            if (action === 'center-camera') {
              useMapTransformStore.getState().fitToScreen()
            } else if (action === 'add-gm-pin') {
              useUIStore.getState().setActiveTool('select')
              const pos = e.target.getStage()?.getPointerPosition()
              if (pos) {
                const mapPos = useMapTransformStore.getState().screenToMap(pos.x, pos.y)
                window.dispatchEvent(new CustomEvent(GM_PIN_ADD_EVENT, { detail: { x: mapPos.x, y: mapPos.y } }))
              }
            }
          }}
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
          <FogLayer
            mapId={activeMap.id}
            stageRef={stageRef}
            canvasSize={size}
            activeTool={activeTool}
            gridSize={activeMap.gridSize}
          />

          {/* Layer 3: Tokens */}
          <TokenLayer
            map={activeMap}
            stageRef={stageRef}
          />

          {/* Layer 4: Pointer/Ping overlay */}
          <PointerLayer stageRef={stageRef} />

          {/* Layer 5: Measurement overlay */}
          <MeasureLayer
            stageRef={stageRef}
            gridSize={activeMap.gridSize}
            ftPerUnit={activeMap.ftPerUnit}
          />

          {/* Layer 6: Drawing overlay */}
          <DrawingLayer
            stageRef={stageRef}
            mapId={activeMap.id}
            gridSize={activeMap.gridSize}
          />

          {/* Layer 7: GM pins (DM only) */}
          <GMPinLayer
            stageRef={stageRef}
            mapId={activeMap.id}
            gridSize={activeMap.gridSize}
          />

          {/* Layer 8: Lighting overlay */}
          <LightingLayer
            stageRef={stageRef}
            mapId={activeMap.id}
            gridSize={activeMap.gridSize}
          />

          {/* Layer 9: Walls & doors */}
          <WallLayer
            mapId={activeMap.id}
            stageRef={stageRef}
            gridSize={activeMap.gridSize}
          />
        </Stage>
      )}

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

      {/* Drawing toolbar */}
      <DrawingToolbar />
    </div>
  )
}

function getCursor(tool: string): string {
  switch (tool) {
    case 'select':       return 'default'
    case 'fog-rect':      return 'crosshair'
    case 'fog-polygon':   return 'crosshair'
    case 'fog-cover':     return 'crosshair'
    case 'fog-brush':     return 'crosshair'
    case 'fog-brush-cover': return 'crosshair'
    case 'token':         return 'copy'
    case 'pointer':       return 'cell'
    case 'measure-line':  return 'crosshair'
    case 'measure-circle': return 'crosshair'
    case 'measure-cone':  return 'crosshair'
    case 'draw-freehand': return 'crosshair'
    case 'draw-rect':    return 'crosshair'
    case 'draw-circle':  return 'crosshair'
    case 'draw-text':    return 'text'
    default:              return 'default'
  }
}

async function loadMapData(mapId: number, map: MapRecord) {
  if (!window.electronAPI) return

  useFogStore.getState().clearHistory()

  try {
    // Load tokens
    const tokenRows = await window.electronAPI.dbQuery<{
      id: number; map_id: number; name: string; image_path: string | null
      x: number; y: number; size: number; hp_current: number; hp_max: number
      visible_to_players: number; rotation: number; locked: number; z_index: number
      marker_color: string | null; ac: number | null; notes: string | null
      status_effects: string | null; faction: string; show_name: number
    }>('SELECT id, map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name FROM tokens WHERE map_id = ?', [mapId])

    useTokenStore.getState().setTokens(tokenRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      name: r.name,
      imagePath: r.image_path,
      x: r.x,
      y: r.y,
      size: r.size,
      hpCurrent: r.hp_current,
      hpMax: r.hp_max,
      visibleToPlayers: Boolean(r.visible_to_players),
      rotation: r.rotation ?? 0,
      locked: Boolean(r.locked),
      zIndex: r.z_index ?? 0,
      markerColor: r.marker_color ?? null,
      ac: r.ac ?? null,
      notes: r.notes ?? null,
      statusEffects: r.status_effects ? JSON.parse(r.status_effects) : null,
      faction: r.faction ?? 'party',
      showName: Boolean(r.show_name ?? 1),
    })))

    // Load initiative
    const initRows = await window.electronAPI.dbQuery<{
      id: number; map_id: number; combatant_name: string; roll: number; current_turn: number; token_id: number | null; effect_timers: string | null
    }>('SELECT id, map_id, combatant_name, roll, current_turn, token_id, effect_timers FROM initiative WHERE map_id = ? ORDER BY roll DESC', [mapId])

    useInitiativeStore.getState().setEntries(initRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      combatantName: r.combatant_name,
      roll: r.roll,
      currentTurn: Boolean(r.current_turn),
      tokenId: r.token_id ?? null,
      effectTimers: r.effect_timers ? JSON.parse(r.effect_timers) : null,
    })))

    // Load walls
    const wallRows = await window.electronAPI.dbQuery<{
      id: number; map_id: number; x1: number; y1: number; x2: number; y2: number; wall_type: string; door_state: string
    }>('SELECT id, map_id, x1, y1, x2, y2, wall_type, door_state FROM walls WHERE map_id = ?', [mapId])

    useWallStore.getState().setWalls(wallRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
      wallType: r.wall_type as any,
      doorState: r.door_state as any,
    })))

    // Sync player: send full state
    let fogBitmap: string | null = null
    let exploredBitmap: string | null = null
    try {
      const fogRows = await window.electronAPI.dbQuery<{
        fog_bitmap: string | null
        explored_bitmap: string | null
      }>('SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?', [mapId])
      fogBitmap = fogRows[0]?.fog_bitmap ?? null
      exploredBitmap = fogRows[0]?.explored_bitmap ?? null
    } catch (err) {
      console.error('[CanvasArea] fog load failed:', err)
    }

    let playerDrawings: Array<{ id: number; type: string; points: number[]; color: string; width: number }> = []
    try {
      const drawingRows = await window.electronAPI.dbQuery<{
        id: number; type: string; points: string; color: string; width: number
      }>('SELECT id, type, points, color, width FROM drawings WHERE map_id = ? AND synced = 1', [mapId])
      playerDrawings = drawingRows.map((r) => {
        const parsed = JSON.parse(r.points)
        const points = Array.isArray(parsed) ? parsed : (parsed.x != null ? [parsed.x, parsed.y] : [])
        return { id: r.id, type: r.type, points, color: r.color, width: r.width }
      })
    } catch (err) {
      console.error('[CanvasArea] drawings load failed:', err)
    }

    const { blackoutActive, appMode, atmosphereImagePath } = useUIStore.getState()
    const syncMode: PlayerFullState['mode'] = blackoutActive
      ? 'blackout'
      : appMode === 'atmosphere'
        ? 'atmosphere'
        : 'map'

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
        })),
      fogBitmap,
      exploredBitmap,
      atmosphereImagePath: appMode === 'atmosphere' ? atmosphereImagePath : null,
      blackout: blackoutActive,
      drawings: playerDrawings,
    })

    if (useUIStore.getState().sessionMode !== 'prep') {
      useUIStore.getState().setPlayerConnected(true)
    }
  } catch (err) {
    console.error('[CanvasArea] loadMapData failed:', err)
  }
}
