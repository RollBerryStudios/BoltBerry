import { useEffect, useCallback } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useWallStore } from '../stores/wallStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import type { PlayerFullState, PlayerTokenState, PlayerWallState } from '@shared/ipc-types'

export function usePlayerSync() {
  const setPlayerConnected = useUIStore((s) => s.setPlayerConnected)
  const sessionMode = useUIStore((s) => s.sessionMode)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const walls = useWallStore((s) => s.walls)

  // ── Helper: build and push full state to the player window ─────────────────
  // All store reads use getState() so this function never goes stale.
  const buildAndSendFullSync = useCallback(async () => {
    if (!window.electronAPI) return
    const { appMode, blackoutActive, atmosphereImagePath, cameraFollowDM } = useUIStore.getState()
    const { activeMapId: mapId, activeMaps } = useCampaignStore.getState()
    const { tokens } = useTokenStore.getState()

    const activeMap = activeMaps.find((m) => m.id === mapId) ?? null

    let fogBitmap: string | null = null
    let exploredBitmap: string | null = null
    if (mapId) {
      const rows = await window.electronAPI.dbQuery<{
        fog_bitmap: string | null
        explored_bitmap: string | null
      }>(
        'SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?', [mapId]
      )
      fogBitmap      = rows[0]?.fog_bitmap      ?? null
      exploredBitmap = rows[0]?.explored_bitmap ?? null
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
        const drawingRows = await window.electronAPI.dbQuery<{
          id: number; type: string; points: string; color: string; width: number
        }>('SELECT id, type, points, color, width FROM drawings WHERE map_id = ? AND synced = 1', [mapId])
        playerDrawings = drawingRows.map((r) => {
          const parsed = JSON.parse(r.points)
          const points = Array.isArray(parsed) ? parsed : (parsed.x != null ? [parsed.x, parsed.y] : [])
          return { id: r.id, type: r.type, points, color: r.color, width: r.width }
        })
      } catch (err) {
        console.error('[usePlayerSync] drawings load failed:', err)
      }
    }

    const state: PlayerFullState = {
      mode,
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
    }

    window.electronAPI?.sendFullSync(state)

    if (cameraFollowDM && state.mode === 'map' && state.map) {
      const { scale, offsetX, offsetY, fitScale, canvasW, canvasH } = useMapTransformStore.getState()
      if (fitScale && canvasW && canvasH) {
        const imageCenterX = (canvasW / 2 - offsetX) / scale
        const imageCenterY = (canvasH / 2 - offsetY) / scale
        const relZoom = scale / fitScale
        window.electronAPI?.sendCameraView({ imageCenterX, imageCenterY, relZoom })
      }
    }
  }, [])

  // ── Clear playerConnected when the player window actually closes ────────────
  // (CanvasArea also has this, but it's only mounted in game view.
  //  This hook is always active, ensuring the indicator stays accurate.)
  useEffect(() => {
    if (!window.electronAPI) return
    const unsub = window.electronAPI.onPlayerWindowClosed(() => setPlayerConnected(false))
    return () => { unsub() }
  }, [setPlayerConnected])

  // ── Respond to player's full-sync requests ──────────────────────────────────
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

  // ── Proactively push full state when DM starts a session ────────────────────
  // The player may have connected in prep mode (received nothing so far).
  // When sessionMode transitions to non-prep, push the current state immediately.
  useEffect(() => {
    if (sessionMode === 'prep' || !window.electronAPI) return
    if (useUIStore.getState().playerConnected) {
      buildAndSendFullSync()
    }
  }, [sessionMode, buildAndSendFullSync])

  // ── Broadcast wall data whenever the active map or wall list changes ────────
  useEffect(() => {
    if (sessionMode === 'prep' || !window.electronAPI?.sendWalls) return
    const mapWalls: PlayerWallState[] = walls
      .filter((w) => w.mapId === activeMapId)
      .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState }))
    window.electronAPI.sendWalls(mapWalls)
  }, [activeMapId, walls, sessionMode])

  // ── Re-broadcast full state when drawings are cleared ────────────────────────
  const drawingClearTick = useUIStore((s) => s.drawingClearTick)
  useEffect(() => {
    if (drawingClearTick === 0 || sessionMode === 'prep' || !window.electronAPI) return
    if (useUIStore.getState().playerConnected) buildAndSendFullSync()
  }, [drawingClearTick, sessionMode, buildAndSendFullSync])
}
