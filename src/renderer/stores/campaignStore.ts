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
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  activeCampaignId: null,
  activeMaps: [],
  activeMapId: null,

  setCampaigns: (campaigns) => set({ campaigns }),
  setActiveCampaign: (id) => set({ activeCampaignId: id }),
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
}))
