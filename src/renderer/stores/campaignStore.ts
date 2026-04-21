import { create } from 'zustand'
import type { Campaign, MapRecord } from '@shared/ipc-types'

interface CampaignState {
  campaigns: Campaign[]
  activeCampaignId: number | null
  activeMaps: MapRecord[]
  activeMapId: number | null

  // Actions
  setCampaigns: (campaigns: Campaign[]) => void
  setActiveCampaign: (id: number | null) => void
  setActiveMaps: (maps: MapRecord[]) => void
  setActiveMap: (id: number | null) => void
  updateCampaign: (id: number, patch: Partial<Campaign>) => void
  addCampaign: (campaign: Campaign) => void
  removeCampaign: (id: number) => void
  addMap: (map: MapRecord) => void
  removeMap: (id: number) => void
  refreshCampaigns: () => Promise<void>
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  activeCampaignId: null,
  activeMaps: [],
  activeMapId: null,

  setCampaigns: (campaigns) => set({ campaigns }),
  setActiveCampaign: (id) => set((s) => {
    if (id === null) {
      return { activeCampaignId: null, activeMaps: [], activeMapId: null }
    }
    // Switching campaigns must also drop any open map reference — the
    // old map belongs to the previous campaign and its id has no meaning
    // against the new set of `activeMaps`.
    if (s.activeCampaignId !== id) {
      return { activeCampaignId: id, activeMapId: null }
    }
    return { activeCampaignId: id }
  }),
  setActiveMaps: (maps) => set({ activeMaps: maps }),
  setActiveMap: (id) => set({ activeMapId: id }),

  updateCampaign: (id, patch) =>
    set((s) => ({
      campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  addCampaign: (campaign) =>
    set((s) => ({ campaigns: [...s.campaigns, campaign] })),

  removeCampaign: (id) =>
    set((s) => ({
      campaigns: s.campaigns.filter((c) => c.id !== id),
      activeCampaignId: s.activeCampaignId === id ? null : s.activeCampaignId,
    })),

  addMap: (map) =>
    set((s) => ({ activeMaps: [...s.activeMaps, map] })),

  removeMap: (id) =>
    set((s) => ({
      activeMaps: s.activeMaps.filter((m) => m.id !== id),
      activeMapId: s.activeMapId === id ? null : s.activeMapId,
    })),

  refreshCampaigns: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.error('[CampaignStore] electronAPI not available')
      return
    }

    try {
      // Reload campaigns
      const campaigns = await window.electronAPI.campaigns.list()

      const currentId = useCampaignStore.getState().activeCampaignId
      const activeCampaignId = currentId && campaigns.some(c => c.id === currentId)
        ? currentId
        : campaigns[0]?.id || null

      // Reload maps for active campaign in the same tick
      let activeMaps: MapRecord[] = []
      if (activeCampaignId) {
        activeMaps = await window.electronAPI.maps.list(activeCampaignId)
      }

      // Single atomic state update. If refreshCampaigns ended up
      // selecting a different campaign (e.g. the previous one was
      // deleted, or none was selected yet), drop any stale activeMapId
      // that belonged to the old campaign.
      const prevId = useCampaignStore.getState().activeCampaignId
      const patch: Partial<CampaignState> = {
        campaigns,
        activeCampaignId,
        activeMaps,
      }
      if (prevId !== activeCampaignId) patch.activeMapId = null
      set(patch)
    } catch (err) {
      console.error('[CampaignStore] Failed to refresh campaigns:', err)
    }
  }
}))
