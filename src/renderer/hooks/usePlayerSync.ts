import { useEffect, useCallback } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useWallStore } from '../stores/wallStore'
import type { PlayerFullState, PlayerTokenState, PlayerWallState } from '@shared/ipc-types'

export function usePlayerSync() {
  const setPlayerConnected = useUIStore((s) => s.setPlayerConnected)
  const sessionMode = useSessionStore((s) => s.sessionMode)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const walls = useWallStore((s) => s.walls)

  // â”€â”€ Helper: build and push full state to the player window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // All store reads use getState() so this function never goes stale.
  const buildAndSendFullSync = useCallback(async () => {
    if (!window.electronAPI) return
    const { appMode, blackoutActive, atmosphereImagePath } = useUIStore.getState()
    const { activeMapId: mapId, activeMaps } = useCampaignStore.getState()
    const { tokens } = useTokenStore.getState()

    const activeMap = activeMaps.find((m) => m.id === mapId) ?? null

    let fogBitmap: string | null = null
    let exploredBitmap: string | null = null
    if (mapId) {
      const fog = await window.electronAPI.fog.get(mapId)
      fogBitmap      = fog.fogBitmap
      exploredBitmap = fog.exploredBitmap
    }

    const playerTokens: PlayerTokenState[] = tokens
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
      }))

    const mode: PlayerFullState['mode'] = blackoutActive
      ? 'blackout'
      : appMode === 'atmosphere'
        ? 'atmosphere'
        : 'map'

    let playerDrawings: Array<{ id: number; type: string; points: number[]; color: string; width: number }> = []
    if (mapId) {
      try {
        const rows = await window.electronAPI.drawings.listSyncedByMap(mapId)
        playerDrawings = rows.map((r) => ({
          id: r.id, type: r.type, points: r.points, color: r.color, width: r.width,
        }))
      } catch (err) {
        console.error('[usePlayerSync] drawings load failed:', err)
      }
    }

    const ui = useUIStore.getState()
    const viewport = ui.playerViewportMode && ui.playerViewport ? ui.playerViewport : null

    // Bundle walls with the full-sync payload so a player reconnecting
    // mid-session has LOS geometry available before the next
    // PLAYER_WALLS broadcast fires. Scoped to the active map; empty
    // when no map is active so the previous map's walls don't leak
    // into an atmosphere-only / idle sync.
    const activeWalls = useWallStore.getState().walls
      .filter((w) => w.mapId === mapId)
      .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState }))

    const state: PlayerFullState = {
      mode,
      viewport,
      map: activeMap
        ? {
            imagePath: activeMap.imagePath,
            gridType: activeMap.gridType,
            gridSize: activeMap.gridSize,
            rotation: activeMap.rotationPlayer ?? activeMap.rotation ?? 0,
            gridVisible: activeMap.gridVisible,
            gridThickness: activeMap.gridThickness,
            gridColor: activeMap.gridColor,
          }
        : null,
      tokens: playerTokens,
      fogBitmap,
      exploredBitmap,
      atmosphereImagePath,
      blackout: blackoutActive,
      drawings: playerDrawings,
      walls: activeWalls,
    }

    window.electronAPI?.sendFullSync(state)
  }, [])

  // â”€â”€ Clear playerConnected when the player window actually closes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // (CanvasArea also has this, but it's only mounted in game view.
  //  This hook is always active, ensuring the indicator stays accurate.)
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.onPlayerWindowClosed(() => setPlayerConnected(false))
    return () => { unsub() }
  }, [setPlayerConnected])

  // â”€â”€ Respond to player's full-sync requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!window.electronAPI) return

    const unsub = window.electronAPI.onRequestFullSync(async () => {
      // Always mark the player as connected when they ping us.
      // This must happen BEFORE the prep guard so the close button appears.
      setPlayerConnected(true)

      const { sessionMode: mode } = useUIStore.getState()
      if (mode === 'prep') return  // In prep, acknowledge but don't push map data yet

      await buildAndSendFullSync()
    })

    return () => { unsub() }
  }, [buildAndSendFullSync, setPlayerConnected])

  // â”€â”€ Session start: push the current state to the player immediately â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The player may have connected during prep (received nothing so far);
  // when sessionMode flips to non-prep we push the current map / fog /
  // tokens right away so the player doesn't have to request a full sync.
  useEffect(() => {
    if (sessionMode === 'prep' || !window.electronAPI) return
    if (useUIStore.getState().playerConnected) {
      buildAndSendFullSync()
    }
  }, [sessionMode, buildAndSendFullSync])

  // â”€â”€ Session end: kick the player back to the idle splash â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Going from live â†’ prep mid-session must hide whatever was on screen
  // immediately. We push a minimal full-sync with `mode: 'idle'` which
  // PlayerApp interprets as "wipe everything and show the BoltBerry
  // waiting screen". The playerConnected guard means the very first
  // mount (sessionMode='prep' before any window opens) is a no-op.
  useEffect(() => {
    if (sessionMode !== 'prep' || !window.electronAPI) return
    if (!useUIStore.getState().playerConnected) return
    window.electronAPI.sendFullSync({
      mode: 'idle',
      viewport: null,
      map: null,
      tokens: [],
      fogBitmap: null,
      exploredBitmap: null,
      atmosphereImagePath: null,
      blackout: false,
      drawings: [],
      walls: [],
    })
  }, [sessionMode])

  // â”€â”€ Broadcast wall data whenever the active map or wall list changes â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (sessionMode === 'prep' || !window.electronAPI?.sendWalls) return
    const mapWalls: PlayerWallState[] = walls
      .filter((w) => w.mapId === activeMapId)
      .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState }))
    window.electronAPI.sendWalls(mapWalls)
  }, [activeMapId, walls, sessionMode])

  // â”€â”€ Re-broadcast full state when drawings are cleared â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const drawingClearTick = useUIStore((s) => s.drawingClearTick)
  useEffect(() => {
    if (drawingClearTick === 0 || sessionMode === 'prep' || !window.electronAPI) return
    if (useUIStore.getState().playerConnected) buildAndSendFullSync()
  }, [drawingClearTick, sessionMode, buildAndSendFullSync])

  // â”€â”€ Player Control Mode â€” viewport broadcast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Subscribes to the whole `playerViewport` object plus its mode flag so
  // every drag / wheel / arrow update reaches the player window. rAF-
  // throttles the send during rapid mutations (drag at 60 Hz would
  // otherwise flood the IPC channel). Fires an explicit null when the
  // mode turns off so the player window can fall back to camera / fit
  // cleanly instead of sticking on the last rect.
  const playerViewportMode = useUIStore((s) => s.playerViewportMode)
  const playerViewport = useUIStore((s) => s.playerViewport)
  useEffect(() => {
    if (!window.electronAPI) return
    let frame = 0
    const payload = playerViewportMode ? playerViewport : null
    // Schedule inside a single rAF so bursty updates (mouse drag) coalesce
    // into at most one send per frame. Cleanup cancels the pending send
    // on unmount / fast updates so payloads don't pile up.
    frame = requestAnimationFrame(() => {
      window.electronAPI?.sendPlayerViewport(payload)
    })
    return () => cancelAnimationFrame(frame)
  }, [playerViewportMode, playerViewport])

  // â”€â”€ Map switch â€” drop any stale Player Control Mode rect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The rect lives in map-image coords; switching maps makes those
  // coords meaningless. Clearing the rect forces the next toolbar
  // activation to seed a fresh default on the new map.
  useEffect(() => {
    useUIStore.getState().setPlayerViewport(null)
  }, [activeMapId])
}
