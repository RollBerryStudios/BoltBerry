import { useEffect, useRef, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import { MapLayer } from './MapLayer'
import { FogLayer } from './FogLayer'
import { TokenLayer } from './TokenLayer'
import { PointerLayer } from './PointerLayer'
import { MeasureLayer } from './MeasureLayer'
import { useUIStore } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useImageUrl } from '../../hooks/useImageUrl'
import type Konva from 'konva'
import type { MapRecord } from '@shared/ipc-types'

export function CanvasArea() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const { activeTool, blackoutActive, appMode, atmosphereImagePath } = useUIStore()
  const { activeMapId, activeMaps } = useCampaignStore()
  const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null
  const atmosphereUrl = useImageUrl(atmosphereImagePath)

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

  return (
    <div
      ref={containerRef}
      className="canvas-area"
      style={{ cursor: getCursor(activeTool) }}
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
          onContextMenu={(e) => e.evt.preventDefault()}
        >
          {/* Layer 1: Map image + grid */}
          <MapLayer
            map={activeMap}
            stageRef={stageRef}
            canvasSize={size}
          />

          {/* Layer 2: Fog of War */}
          <FogLayer
            mapId={activeMap.id}
            stageRef={stageRef}
            canvasSize={size}
            activeTool={activeTool}
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
        </Stage>
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
    </div>
  )
}

function getCursor(tool: string): string {
  switch (tool) {
    case 'fog-rect':      return 'crosshair'
    case 'fog-polygon':   return 'crosshair'
    case 'fog-cover':     return 'crosshair'
    case 'token':         return 'copy'
    case 'pointer':       return 'cell'
    case 'measure-line':  return 'crosshair'
    case 'measure-circle': return 'crosshair'
    case 'measure-cone':  return 'crosshair'
    default:              return 'default'
  }
}

async function loadMapData(mapId: number, map: MapRecord) {
  if (!window.electronAPI) return

  try {
    // Load tokens
    const tokenRows = await window.electronAPI.dbQuery<{
      id: number; map_id: number; name: string; image_path: string | null
      x: number; y: number; size: number; hp_current: number; hp_max: number
      visible_to_players: number; rotation: number; locked: number; z_index: number
      marker_color: string | null; ac: number | null; notes: string | null
      status_effects: string | null
    }>('SELECT id, map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects FROM tokens WHERE map_id = ?', [mapId])

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
    })))

    // Load initiative
    const initRows = await window.electronAPI.dbQuery<{
      id: number; map_id: number; combatant_name: string; roll: number; current_turn: number
    }>('SELECT id, map_id, combatant_name, roll, current_turn FROM initiative WHERE map_id = ? ORDER BY roll DESC', [mapId])

    useInitiativeStore.getState().setEntries(initRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      combatantName: r.combatant_name,
      roll: r.roll,
      currentTurn: Boolean(r.current_turn),
    })))

    // Sync player: send full state
    window.electronAPI.sendFullSync({
      mode: 'map',
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
          showName: true,
        })),
      fogBitmap: null,
      exploredBitmap: null,
      atmosphereImagePath: null,
      blackout: useUIStore.getState().blackoutActive,
    })

    useUIStore.getState().setPlayerConnected(true)
  } catch (err) {
    console.error('[CanvasArea] loadMapData failed:', err)
  }
}
