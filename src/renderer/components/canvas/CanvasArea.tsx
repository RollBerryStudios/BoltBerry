import { useEffect, useRef, useState, useMemo } from 'react'
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
import { RoomLayer } from './RoomLayer'
import { PlayerEyeOverlay } from './PlayerEyeOverlay'
import { PlayerEyeHUD } from './PlayerEyeHUD'
import { ViewportHUD } from './ViewportHUD'
import { InitiativeTopStrip } from './InitiativeTopStrip'
import { MultiSelectBar } from '../MultiSelectBar'
import { useUIStore } from '../../stores/uiStore'
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
import { EmptyState } from '../EmptyState'
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

// ─── Layer visibility definitions ─────────────────────────────────────────────
const LAYER_DEFS: { key: string; label: string; icon: string; canToggle: boolean }[] = [
  { key: 'map',      label: 'Karte',        icon: '🗺',  canToggle: false },
  { key: 'fog',      label: 'Nebel',        icon: '🌫',  canToggle: true  },
  { key: 'tokens',   label: 'Token',        icon: '🪙',  canToggle: true  },
  { key: 'drawings', label: 'Zeichnungen',  icon: '✏',   canToggle: true  },
  { key: 'gmPins',   label: 'GM-Pins',      icon: '📌',  canToggle: true  },
  { key: 'lighting', label: 'Beleuchtung',  icon: '💡',  canToggle: true  },
  { key: 'walls',    label: 'Wände',        icon: '🧱',  canToggle: true  },
  { key: 'rooms',    label: 'Räume',        icon: '🏠',  canToggle: true  },
]

const DEFAULT_LAYER_VISIBILITY: Record<string, boolean> = {
  map: true, fog: true, tokens: true, drawings: true,
  gmPins: true, lighting: true, walls: true, rooms: true,
}

/**
 * Delay before ambient canvas HUDs (viewport chip, minimap, layer toggle) fade
 * down. 2.5s felt noisy in testing; 3.5s matches Owlbear Rodeo. Combat HUD and
 * the multi-select bar ignore this — they carry action-critical state.
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
  const workMode = useUIStore((s) => s.workMode)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const activeMaps = useCampaignStore((s) => s.activeMaps)
  const activeMap = useMemo(() => activeMaps.find((m) => m.id === activeMapId) ?? null, [activeMaps, activeMapId])
  const atmosphereUrl = useImageUrl(atmosphereImagePath)

  // Set playerConnected=false when the player window is closed
  useEffect(() => {
    const unsub = window.electronAPI?.onPlayerWindowClosed(() => {
      useUIStore.getState().setPlayerConnected(false)
    })
    return () => unsub?.()
  }, [])

  // Continuous camera sync to player when follow mode is on (rAF-coalesced)
  useEffect(() => {
    let rafId: number | null = null
    const unsub = useMapTransformStore.subscribe((state, prevState) => {
      if (!useUIStore.getState().cameraFollowDM) return
      if (state.scale !== prevState.scale || state.offsetX !== prevState.offsetX || state.offsetY !== prevState.offsetY) {
        if (rafId !== null) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          rafId = null
          const { scale, offsetX, offsetY, fitScale, canvasW, canvasH, imgW, imgH } = useMapTransformStore.getState()
          if (!fitScale || !canvasW || !canvasH || !imgW || !imgH) return
          const imageCenterX = (canvasW / 2 - offsetX) / scale
          const imageCenterY = (canvasH / 2 - offsetY) / scale
          const relZoom = scale / fitScale
          window.electronAPI?.sendCameraView({ imageCenterX, imageCenterY, relZoom })
        })
      }
    })
    return () => { unsub(); if (rafId !== null) cancelAnimationFrame(rafId) }
  }, [])

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
      if (!file.type.startsWith('image/')) return
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
        const assetResult = await window.electronAPI.saveAssetImage({
          dataUrl,
          originalName: file.name,
          type: 'map',
          campaignId: useCampaignStore.getState().activeCampaignId ?? 0,
        })
        if (!assetResult) return
        const mapName = file.name.replace(/\.[^.]+$/, '') || 'Neue Karte'
        const dbResult = await window.electronAPI.dbRun(
          `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, rotation_player) VALUES (?, ?, ?, ?, 0, 0)`,
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
          rotationPlayer: 0,
          gridOffsetX: 0,
          gridOffsetY: 0,
          ambientBrightness: 100,
          cameraX: null,
          cameraY: null,
          cameraScale: null,
          ambientTrackPath: null,
          track1Volume: 1,
          track2Volume: 1,
          combatVolume: 1,
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

      const droppedToken = {
        id: dbResult.lastInsertRowid,
        mapId: activeMapId,
        name: file.name.replace(/\.[^.]+$/, ''),
        imagePath: result.path,
        x, y,
        size: 1, hpCurrent: 0, hpMax: 0, visibleToPlayers: true,
        rotation: 0, locked: false, zIndex: 0, markerColor: null,
        ac: null, notes: null, statusEffects: null,
        faction: 'party' as const, showName: true, lightRadius: 0, lightColor: '#ffcc44',
      }
      useTokenStore.getState().addToken(droppedToken)
      broadcastTokensFromCanvas()

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Place ${droppedToken.name}`,
        undo: async () => {
          useTokenStore.getState().removeToken(droppedToken.id)
          await window.electronAPI?.dbRun('DELETE FROM tokens WHERE id = ?', [droppedToken.id])
          broadcastTokensFromCanvas()
        },
        redo: async () => {
          await window.electronAPI?.dbRun(
            'INSERT INTO tokens (id, map_id, name, image_path, x, y, faction, show_name) VALUES (?, ?, ?, ?, ?, ?, \'party\', 1)',
            [droppedToken.id, activeMapId, droppedToken.name, droppedToken.imagePath, droppedToken.x, droppedToken.y]
          )
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
      const dbResult = await window.electronAPI.dbRun(
        `INSERT INTO tokens (map_id, name, image_path, x, y, faction, show_name) VALUES (?, ?, ?, ?, ?, 'party', 1)`,
        [activeMapId, assetName, storedPath, x, y]
      )

      const assetToken = {
        id: dbResult.lastInsertRowid,
        mapId: activeMapId,
        name: assetName,
        imagePath: storedPath,
        x, y,
        size: 1, hpCurrent: 0, hpMax: 0, visibleToPlayers: true, rotation: 0,
        locked: false, zIndex: 0, markerColor: null, ac: null, notes: null, statusEffects: null,
        faction: 'party' as const, showName: true, lightRadius: 0, lightColor: '#ffcc44',
      }
      useTokenStore.getState().addToken(assetToken)
      broadcastTokensFromCanvas()

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Place ${assetToken.name}`,
        undo: async () => {
          useTokenStore.getState().removeToken(assetToken.id)
          await window.electronAPI?.dbRun('DELETE FROM tokens WHERE id = ?', [assetToken.id])
          broadcastTokensFromCanvas()
        },
        redo: async () => {
          await window.electronAPI?.dbRun(
            'INSERT INTO tokens (id, map_id, name, image_path, x, y, faction, show_name) VALUES (?, ?, ?, ?, ?, ?, \'party\', 1)',
            [assetToken.id, activeMapId, assetToken.name, assetToken.imagePath, assetToken.x, assetToken.y]
          )
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
          icon="🗺️"
          title="Keine Karte geladen"
          description={
            <ol style={{ textAlign: 'left', paddingLeft: 20, margin: '8px 0 0', lineHeight: 2, maxWidth: 320 }}>
              <li>Öffne die <strong>linke Sidebar</strong> (◧ oben links)</li>
              <li>Klicke auf <strong>🖼 Karte hinzufügen</strong> und wähle ein Bild</li>
              <li>Passe Raster &amp; Felder in den Karteneinstellungen an</li>
              <li>Wechsle in den <strong>▶ Spiel-Modus</strong> und starte die Session</li>
            </ol>
          }
        />
      ) : (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          style={{ display: 'block' }}
          onContextMenu={async (e) => {
            e.evt.preventDefault()
            if (!window.electronAPI) return

            const { activeTool, workMode, sessionMode } = useUIStore.getState()
            const { activeMapId: mapId, activeMaps: maps } = useCampaignStore.getState()
            const map = maps.find((m) => m.id === mapId)
            const curRot = (map?.rotation ?? 0) as 0 | 90 | 180 | 270
            const rotLabel = (r: number) => ({ 0: '↑ 0°', 90: '→ 90°', 180: '↓ 180°', 270: '← 270°' }[r] ?? `${r}°`)

            const items: Array<{ label: string; action: string } | { separator: true }> = []

            // ── Ansicht ────────────────────────────────────────────
            items.push({ label: '⊡  Karte einpassen', action: 'center-camera' })

            // ── Karte drehen ───────────────────────────────────────
            if (map) {
              items.push({ separator: true })
              const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270]
              rotations.forEach((r) => {
                items.push({
                  label: `${rotLabel(r)}${r === curRot ? '  ✓' : ''}`,
                  action: `rotate-${r}`,
                })
              })
            }

            // ── Nebel ──────────────────────────────────────────────
            items.push({ separator: true })
            items.push({ label: '👁  Alles aufdecken',              action: 'fog-reveal-all'     })
            items.push({ label: '🌑  Alles verdecken',              action: 'fog-cover-all'      })
            items.push({ label: '⬤  Token-Bereiche aufdecken',     action: 'fog-reveal-tokens'  })
            items.push({ label: '↺  Erkundetes zurücksetzen',       action: 'fog-reset-explored' })

            // ── Werkzeuge ──────────────────────────────────────────
            items.push({ separator: true })
            items.push({ label: `📏  Messen${activeTool === 'measure-line' ? '  ✓' : ''}`,         action: 'tool-measure'   })
            items.push({ label: `✏️  Zeichnen${activeTool === 'draw-freehand' ? '  ✓' : ''}`,      action: 'tool-draw'      })
            items.push({ label: `🖌  Nebel-Pinsel${activeTool === 'fog-brush' ? '  ✓' : ''}`,       action: 'tool-fog-brush' })
            items.push({ label: `▭  Nebel-Rechteck${activeTool === 'fog-rect' ? '  ✓' : ''}`,      action: 'tool-fog-rect'  })

            // ── Karte / Zeichnungen ────────────────────────────────
            items.push({ separator: true })
            items.push({ label: '📌  GM-Pin hier setzen',           action: 'add-gm-pin'         })
            items.push({ label: '✕  Zeichnungen löschen',           action: 'clear-drawings'     })

            const action = await window.electronAPI.showContextMenu(items)
            if (!action) return

            // ── Ansicht ────────────────────────────────────────────
            if (action === 'center-camera') {
              useMapTransformStore.getState().fitToScreen()

            // ── Rotation ───────────────────────────────────────────
            } else if (action.startsWith('rotate-')) {
              const rot = parseInt(action.split('-')[1]) as 0 | 90 | 180 | 270
              if (!mapId || !map) return
              try {
                await window.electronAPI.dbRun('UPDATE maps SET rotation = ? WHERE id = ?', [rot, mapId])
                const updated = maps.map((m) => m.id === mapId ? { ...m, rotation: rot } : m)
                useCampaignStore.getState().setActiveMaps(updated)
                if (sessionMode !== 'prep') {
                  const m = updated.find((m) => m.id === mapId)!
                  window.electronAPI.sendMapUpdate({ imagePath: m.imagePath, gridType: m.gridType, gridSize: m.gridSize, rotation: rot })
                }
              } catch (err) {
                console.error('[CanvasArea] rotation change failed:', err)
              }

            // ── Nebel ──────────────────────────────────────────────
            } else if (action === 'fog-reveal-all') {
              window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealAll' } }))
            } else if (action === 'fog-cover-all') {
              window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))
            } else if (action === 'fog-reveal-tokens') {
              window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealTokens' } }))
            } else if (action === 'fog-reset-explored') {
              window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'resetExplored' } }))

            // ── Werkzeuge ──────────────────────────────────────────
            } else if (action === 'tool-measure') {
              useUIStore.getState().setActiveTool('measure-line')
            } else if (action === 'tool-draw') {
              useUIStore.getState().setActiveTool('draw-freehand')
            } else if (action === 'tool-fog-brush') {
              useUIStore.getState().setActiveTool('fog-brush')
            } else if (action === 'tool-fog-rect') {
              useUIStore.getState().setActiveTool('fog-rect')

            // ── GM-Pin ─────────────────────────────────────────────
            } else if (action === 'add-gm-pin') {
              useUIStore.getState().setActiveTool('select')
              const pos = e.target.getStage()?.getPointerPosition()
              if (pos) {
                const mapPos = useMapTransformStore.getState().screenToMap(pos.x, pos.y)
                window.dispatchEvent(new CustomEvent(GM_PIN_ADD_EVENT, { detail: { x: mapPos.x, y: mapPos.y } }))
              }

            // ── Zeichnungen ────────────────────────────────────────
            } else if (action === 'clear-drawings') {
              if (!mapId) return
              try {
                await window.electronAPI.dbRun('DELETE FROM drawings WHERE map_id = ?', [mapId])
                useUIStore.getState().incrementDrawingClearTick()
              } catch (err) {
                console.error('[CanvasArea] clear drawings failed:', err)
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
        </Stage>
      )}

      {/* Player Eye HUD */}
      <PlayerEyeHUD />

      {/* Viewport info chip (bottom-left) */}
      <ViewportHUD />

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
          👁 Spieler-Vorschau — Du siehst, was die Spieler sehen
          <button
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 4, color: '#fff', padding: '2px 10px', cursor: 'pointer', fontSize: 12, marginLeft: 12 }}
            onClick={() => useUIStore.getState().setWorkMode('play')}
          >Zurück zum Spiel</button>
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

      {/* Drawing toolbar */}
      <DrawingToolbar />

      {/* ── Layer visibility panel ─────────────────────────────────────── */}
      {activeMap && (
        <div
          ref={layerPanelRef}
          className="canvas-hud-fade"
          style={{
            position: 'absolute',
            bottom: showMinimap ? 172 : 12,
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
                  ↺ Alle einblenden
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
            <span>◫</span>
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
    const campaignId = useCampaignStore.getState().activeCampaignId

    // Fire all independent DB queries in parallel for faster map load
    const [tokenRows, initRows, wallRows, encRows, roomRows, fogRows, drawingRows] = await Promise.all([
      window.electronAPI.dbQuery<{
        id: number; map_id: number; name: string; image_path: string | null
        x: number; y: number; size: number; hp_current: number; hp_max: number
        visible_to_players: number; rotation: number; locked: number; z_index: number
        marker_color: string | null; ac: number | null; notes: string | null
        status_effects: string | null; faction: string; show_name: number
        light_radius: number; light_color: string
      }>('SELECT id, map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name, light_radius, light_color FROM tokens WHERE map_id = ?', [mapId]),

      window.electronAPI.dbQuery<{
        id: number; map_id: number; combatant_name: string; roll: number; current_turn: number; token_id: number | null; effect_timers: string | null; sort_order: number
      }>('SELECT id, map_id, combatant_name, roll, current_turn, token_id, effect_timers, sort_order FROM initiative WHERE map_id = ? ORDER BY sort_order ASC, roll DESC', [mapId]),

      window.electronAPI.dbQuery<{
        id: number; map_id: number; x1: number; y1: number; x2: number; y2: number; wall_type: string; door_state: string
      }>('SELECT id, map_id, x1, y1, x2, y2, wall_type, door_state FROM walls WHERE map_id = ?', [mapId]),

      campaignId
        ? window.electronAPI.dbQuery<{
            id: number; campaign_id: number; name: string; template_data: string; notes: string | null; created_at: string
          }>('SELECT id, campaign_id, name, template_data, notes, created_at FROM encounters WHERE campaign_id = ? ORDER BY created_at DESC', [campaignId])
        : Promise.resolve([] as any[]),

      window.electronAPI.dbQuery<{
        id: number; map_id: number; name: string; description: string; polygon: string; visibility: string; encounter_id: number | null; atmosphere_hint: string | null; notes: string | null; color: string; created_at: string
      }>('SELECT id, map_id, name, description, polygon, visibility, encounter_id, atmosphere_hint, notes, color, created_at FROM rooms WHERE map_id = ?', [mapId]),

      window.electronAPI.dbQuery<{
        fog_bitmap: string | null; explored_bitmap: string | null
      }>('SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?', [mapId]).catch((err) => {
        console.error('[CanvasArea] fog load failed:', err)
        return [] as any[]
      }),

      window.electronAPI.dbQuery<{
        id: number; type: string; points: string; color: string; width: number
      }>('SELECT id, type, points, color, width FROM drawings WHERE map_id = ? AND synced = 1', [mapId]).catch((err) => {
        console.error('[CanvasArea] drawings load failed:', err)
        return [] as any[]
      }),
    ])

    // Apply results to stores
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
      lightRadius: r.light_radius ?? 0,
      lightColor: r.light_color ?? '#ffcc44',
    })))

    useInitiativeStore.getState().setEntries(initRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      combatantName: r.combatant_name,
      roll: r.roll,
      currentTurn: Boolean(r.current_turn),
      tokenId: r.token_id ?? null,
      effectTimers: r.effect_timers ? JSON.parse(r.effect_timers) : null,
    })))

    useWallStore.getState().setWalls(wallRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
      wallType: r.wall_type as any,
      doorState: r.door_state as any,
    })))

    if (campaignId && encRows.length > 0) {
      useEncounterStore.getState().setEncounters(encRows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        name: r.name,
        templateData: r.template_data,
        notes: r.notes,
        createdAt: r.created_at,
      })))
    }

    useRoomStore.getState().setRooms(roomRows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      name: r.name,
      description: r.description,
      polygon: r.polygon,
      visibility: r.visibility as any,
      encounterId: r.encounter_id,
      atmosphereHint: r.atmosphere_hint,
      notes: r.notes,
      color: r.color,
      createdAt: r.created_at,
    })))

    const fogBitmap: string | null = fogRows[0]?.fog_bitmap ?? null
    const exploredBitmap: string | null = fogRows[0]?.explored_bitmap ?? null

    const playerDrawings: Array<{ id: number; type: string; points: number[]; color: string; width: number }> =
      drawingRows.map((r) => {
        const parsed = JSON.parse(r.points)
        const points = Array.isArray(parsed) ? parsed : (parsed.x != null ? [parsed.x, parsed.y] : [])
        return { id: r.id, type: r.type, points, color: r.color, width: r.width }
      })

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
