import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import type { PlayerFullState, PlayerTokenState } from '@shared/ipc-types'

export function usePlayerSync() {
  const setPlayerConnected = useUIStore((s) => s.setPlayerConnected)

  useEffect(() => {
    if (!window.electronAPI) return

    // Main process forwards 'player:request-sync' from the player window
    // as 'dm:request-full-sync' to this DM renderer.
    const unsub = window.electronAPI.onRequestFullSync(async () => {
      const { appMode, blackoutActive, atmosphereImagePath, sessionMode } = useUIStore.getState()
      // In prep mode, don't sync — player sees whatever was last sent
      if (sessionMode === 'prep') return
      const { activeMapId, activeMaps } = useCampaignStore.getState()
      const { tokens } = useTokenStore.getState()

      const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null

      // Read fog bitmaps from DB (FogLayer saves them on a 2s debounce)
      let fogBitmap: string | null = null
      let exploredBitmap: string | null = null
      if (activeMapId) {
        const rows = await window.electronAPI.dbQuery<{
          fog_bitmap: string | null
          explored_bitmap: string | null
        }>(
          'SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?',
          [activeMapId]
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
        }))

      const mode: PlayerFullState['mode'] = blackoutActive
        ? 'blackout'
        : appMode === 'atmosphere'
          ? 'atmosphere'
          : 'map'

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
      }

      window.electronAPI?.sendFullSync(state)
      setPlayerConnected(true)
    })

    return () => unsub()
  }, [])
}
