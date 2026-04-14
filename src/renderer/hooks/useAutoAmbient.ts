/**
 * useAutoAmbient — watches the active map and automatically:
 *  1. Restores per-map channel volumes (track1, track2, combat)
 *  2. Loads track2 (ambient) from map.ambientTrackPath if set
 *  3. Auto-plays track2 when a new ambientTrackPath is detected
 *
 * This hook runs in the DM app root so it is always active.
 */

import { useEffect, useRef } from 'react'
import { useCampaignStore } from '../stores/campaignStore'
import { useAudioStore, audioCH } from '../stores/audioStore'

export function useAutoAmbient() {
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const activeMaps  = useCampaignStore((s) => s.activeMaps)

  // Track previous map so we don't re-trigger on unrelated re-renders
  const prevMapIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeMapId === prevMapIdRef.current) return
    prevMapIdRef.current = activeMapId

    if (activeMapId == null) return

    const map = activeMaps.find((m) => m.id === activeMapId)
    if (!map) return

    const {
      loadChannel,
      playChannel,
      setChannelVolume,
    } = useAudioStore.getState()

    // ── Restore per-map volumes ──────────────────────────────────────────────
    if (map.track1Volume != null)  setChannelVolume('track1', map.track1Volume)
    if (map.track2Volume != null)  setChannelVolume('track2', map.track2Volume)
    if (map.combatVolume != null)  setChannelVolume('combat', map.combatVolume)

    // ── Auto-load and play ambient track (track2) ────────────────────────────
    if (map.ambientTrackPath) {
      const currentSrc = audioCH.track2.src
      const newUrl = `local-asset://${map.ambientTrackPath.startsWith('/') ? map.ambientTrackPath.substring(1) : map.ambientTrackPath}`

      if (currentSrc !== newUrl) {
        loadChannel('track2', map.ambientTrackPath)
        // Small delay to let the element load before playing
        setTimeout(() => playChannel('track2'), 50)
      }
    }
  }, [activeMapId, activeMaps])
}
