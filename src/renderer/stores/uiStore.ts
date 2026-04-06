import { create } from 'zustand'

export type ActiveTool = 'select' | 'fog-rect' | 'fog-polygon' | 'fog-cover' | 'token' | 'atmosphere' | 'pointer' | 'measure-line' | 'measure-circle' | 'measure-cone'
export type SidebarTab = 'tokens' | 'initiative' | 'notes' | 'handouts' | 'overlay' | 'audio' | 'dice'
export type AppMode = 'map' | 'atmosphere' | 'blackout'
export type SessionMode = 'session' | 'prep'

interface UIState {
  activeTool: ActiveTool
  sidebarTab: SidebarTab
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  playerConnected: boolean
  blackoutActive: boolean
  appMode: AppMode
  sessionMode: SessionMode
  theme: 'dark' | 'light'
  atmosphereImagePath: string | null
  selectedTokenId: number | null

  // Actions
  setActiveTool: (tool: ActiveTool) => void
  setSidebarTab: (tab: SidebarTab) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setPlayerConnected: (connected: boolean) => void
  toggleBlackout: () => void
  setAppMode: (mode: AppMode) => void
  setSessionMode: (mode: SessionMode) => void
  toggleTheme: () => void
  setAtmosphereImage: (path: string | null) => void
  setSelectedToken: (id: number | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarTab: 'tokens',
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  playerConnected: false,
  blackoutActive: false,
  appMode: 'map',
  sessionMode: 'session',
  theme: 'dark',
  atmosphereImagePath: null,
  selectedTokenId: null,

  setActiveTool: (activeTool) => set({ activeTool }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  setPlayerConnected: (playerConnected) => set({ playerConnected }),
  toggleBlackout: () =>
    set((s) => {
      const blackoutActive = !s.blackoutActive
      window.electronAPI?.sendBlackout(blackoutActive)
      return { blackoutActive }
    }),
  setAppMode: (appMode) => set({ appMode }),
  setSessionMode: (sessionMode) => set({ sessionMode }),
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', theme)
      return { theme }
    }),
  setAtmosphereImage: (atmosphereImagePath) =>
    set({ atmosphereImagePath, appMode: atmosphereImagePath ? 'atmosphere' : 'map' }),
  setSelectedToken: (selectedTokenId) => set({ selectedTokenId }),
}))
