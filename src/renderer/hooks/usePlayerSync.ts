import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import type { PlayerFullState, PlayerTokenState } from '@shared/ipc-types'

export function usePlayerSync() {
  const setPlayerConnected = useUIStore((s) => s.setPlayerConnected)

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
          showName: true,
          rotation: t.rotation,
          markerColor: t.markerColor,
          statusEffects: t.statusEffects,
          ac: t.ac,
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
}