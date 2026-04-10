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

  refreshCampaigns: async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      console.error('[CampaignStore] electronAPI not available')
      return
    }

    try {
      // Reload campaigns
      const campaigns = await window.electronAPI.dbQuery<{
        id: number; name: string; created_at: string; last_opened: string
      }>('SELECT * FROM campaigns ORDER BY last_opened DESC')

      const currentId = useCampaignStore.getState().activeCampaignId
      const activeCampaignId = currentId && campaigns.some(c => c.id === currentId)
        ? currentId
        : campaigns[0]?.id || null

      // Reload maps for active campaign in the same tick
      let activeMaps: MapRecord[] = []
      if (activeCampaignId) {
        const rows = await window.electronAPI.dbQuery<{
          id: number; campaign_id: number; name: string; image_path: string
          grid_type: string; grid_size: number; ft_per_unit: number; order_index: number
          camera_x: number | null; camera_y: number | null; camera_scale: number | null
          rotation: number | null; grid_offset_x: number; grid_offset_y: number; ambient_brightness: number
        }>('SELECT * FROM maps WHERE campaign_id = ? ORDER BY order_index', [activeCampaignId])

        activeMaps = rows.map(r => ({
          id: r.id,
          campaignId: r.campaign_id,
          name: r.name,
          imagePath: r.image_path,
          gridType: r.grid_type as 'square' | 'hex' | 'none',
          gridSize: r.grid_size,
          ftPerUnit: r.ft_per_unit,
          orderIndex: r.order_index,
          rotation: r.rotation ?? 0,
          gridOffsetX: r.grid_offset_x ?? 0,
          gridOffsetY: r.grid_offset_y ?? 0,
          ambientBrightness: r.ambient_brightness ?? 100,
          cameraX: r.camera_x,
          cameraY: r.camera_y,
          cameraScale: r.camera_scale,
        }))
      }

      // Single atomic state update
      set({
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.created_at,
          lastOpened: c.last_opened,
        })),
        activeCampaignId,
        activeMaps,
      })
    } catch (err) {
      console.error('[CampaignStore] Failed to refresh campaigns:', err)
    }
  }
}))
