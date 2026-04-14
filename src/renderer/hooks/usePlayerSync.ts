import { useEffect } from 'react'
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

  // When DM switches to prep mode the player window stops receiving updates,
  // so the "connected" indicator should reflect that.
  useEffect(() => {
    if (sessionMode === 'prep') setPlayerConnected(false)
  }, [sessionMode, setPlayerConnected])

  useEffect(() => {
    if (!window.electronAPI) return

    const unsub = window.electronAPI.onRequestFullSync(async () => {
      const { appMode, blackoutActive, atmosphereImagePath, sessionMode, cameraFollowDM } = useUIStore.getState()
      if (sessionMode === 'prep') return
      const { activeMapId, activeMaps } = useCampaignStore.getState()
      const { tokens } = useTokenStore.getState()

      const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null

      let fogBitmap: string | null = null
      let exploredBitmap: string | null = null
      if (activeMapId) {
        const rows = await window.electronAPI.dbQuery<{
          fog_bitmap: string | null
          explored_bitmap: string | null
        }>(
          'SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?', [activeMapId]
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
      if (activeMapId) {
        try {
          const drawingRows = await window.electronAPI.dbQuery<{
            id: number; type: string; points: string; color: string; width: number
          }>('SELECT id, type, points, color, width FROM drawings WHERE map_id = ? AND synced = 1', [activeMapId])
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
              rotation: activeMap.rotation ?? 0,
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

      setPlayerConnected(true)
    })

    return () => { unsub() }
  }, [])

  // Broadcast wall data whenever the active map or wall list changes
  useEffect(() => {
    if (sessionMode === 'prep' || !window.electronAPI?.sendWalls) return
    const mapWalls: PlayerWallState[] = walls
      .filter((w) => w.mapId === activeMapId)
      .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState }))
    window.electronAPI.sendWalls(mapWalls)
  }, [activeMapId, walls, sessionMode])
}