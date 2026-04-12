import { create } from 'zustand'
import i18n from '../i18n'

export type ActiveTool = 'select' | 'fog-rect' | 'fog-polygon' | 'fog-cover' | 'fog-brush' | 'fog-brush-cover' | 'token' | 'atmosphere' | 'pointer' | 'measure-line' | 'measure-circle' | 'measure-cone' | 'draw-freehand' | 'draw-rect' | 'draw-circle' | 'draw-text' | 'wall-draw' | 'wall-door' | 'room'
export type SidebarTab = 'tokens' | 'initiative' | 'notes' | 'handouts' | 'overlay' | 'audio' | 'dice' | 'encounters' | 'rooms'
export type AppMode = 'map' | 'atmosphere' | 'blackout'
export type SessionMode = 'session' | 'prep'
export type WorkMode = 'prep' | 'play' | 'combat' | 'player-preview' | 'fog-edit'
export type AppLanguage = 'de' | 'en'

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
  language: AppLanguage
  atmosphereImagePath: string | null
  selectedTokenId: number | null
  selectedTokenIds: number[]
  cameraFollowDM: boolean
  gridSnap: boolean
  showMinimap: boolean
  drawColor: string
  drawWidth: number
  fogBrushRadius: number
  workMode: WorkMode
  showPlayerEye: boolean
  overlayActive: boolean
  activeWeather: string
  clipboardTokens: Array<{
    name: string
    imagePath: string | null
    size: number
    hpCurrent: number
    hpMax: number
    faction: string
    ac: number | null
    notes: string | null
    statusEffects: string[] | null
    visibleToPlayers: boolean
    markerColor: string | null
    showName: boolean
    offsetX: number
    offsetY: number
  }>

  setActiveTool: (tool: ActiveTool) => void
  setWorkMode: (mode: WorkMode) => void
  setSidebarTab: (tab: SidebarTab) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setPlayerConnected: (connected: boolean) => void
  toggleBlackout: () => void
  setAppMode: (mode: AppMode) => void
  setSessionMode: (mode: SessionMode) => void
  toggleTheme: () => void
  toggleLanguage: () => void
  setAtmosphereImage: (path: string | null) => void
  setSelectedToken: (id: number | null) => void
  toggleTokenInSelection: (id: number) => void
  setSelectedTokens: (ids: number[]) => void
  clearTokenSelection: () => void
  toggleCameraFollow: () => void
  toggleGridSnap: () => void
  toggleMinimap: () => void
  setDrawColor: (color: string) => void
  setDrawWidth: (width: number) => void
  setFogBrushRadius: (radius: number) => void
  togglePlayerEye: () => void
  setOverlayActive: (active: boolean) => void
  setActiveWeather: (weather: string) => void
  setClipboardTokens: (tokens: Array<{
    name: string
    imagePath: string | null
    size: number
    hpCurrent: number
    hpMax: number
    faction: string
    ac: number | null
    notes: string | null
    statusEffects: string[] | null
    visibleToPlayers: boolean
    markerColor: string | null
    showName: boolean
    offsetX: number
    offsetY: number
  }>) => void
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
  language: (localStorage.getItem('boltberry-lang') as AppLanguage | null) ?? 'de',
  atmosphereImagePath: null,
  selectedTokenId: null,
  selectedTokenIds: [],
  cameraFollowDM: false,
  gridSnap: true,
  showMinimap: false,
  drawColor: '#ff6b6b',
  drawWidth: 3,
  fogBrushRadius: 30,
  workMode: 'prep' as WorkMode,
  showPlayerEye: false,
  overlayActive: false,
  activeWeather: 'none',
  clipboardTokens: [],

  setActiveTool: (activeTool) => set({ activeTool }),
  setWorkMode: (workMode: WorkMode) =>
    set((s) => {
      const updates: Partial<UIState> = { workMode }
      switch (workMode) {
        case 'prep':
          updates.activeTool = 'select'
          updates.sidebarTab = 'tokens'
          break
        case 'play':
          updates.activeTool = 'select'
          updates.sidebarTab = 'initiative'
          break
        case 'combat':
          updates.activeTool = 'select'
          updates.sidebarTab = 'initiative'
          break
        case 'player-preview':
          updates.activeTool = 'pointer'
          break
        case 'fog-edit':
          updates.activeTool = 'fog-brush'
          updates.sidebarTab = 'tokens'
          break
      }
      return updates
    }),
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
  toggleLanguage: () =>
    set((s) => {
      const language: AppLanguage = s.language === 'de' ? 'en' : 'de'
      i18n.changeLanguage(language)
      localStorage.setItem('boltberry-lang', language)
      return { language }
    }),
  setAtmosphereImage: (atmosphereImagePath) =>
    set({ atmosphereImagePath, appMode: atmosphereImagePath ? 'atmosphere' : 'map' }),
  setSelectedToken: (selectedTokenId) => set({ selectedTokenId, selectedTokenIds: selectedTokenId ? [selectedTokenId] : [] }),
  toggleTokenInSelection: (id) =>
    set((s) => {
      const ids = s.selectedTokenIds.includes(id)
        ? s.selectedTokenIds.filter((i) => i !== id)
        : [...s.selectedTokenIds, id]
      return { selectedTokenIds: ids, selectedTokenId: ids.length === 1 ? ids[0] : ids.length > 1 ? ids[0] : null }
    }),
  setSelectedTokens: (ids) => set({ selectedTokenIds: ids, selectedTokenId: ids[0] ?? null }),
  clearTokenSelection: () => set({ selectedTokenIds: [], selectedTokenId: null }),
  toggleCameraFollow: () => set((s) => ({ cameraFollowDM: !s.cameraFollowDM })),
  toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  setDrawColor: (drawColor) => set({ drawColor }),
  setDrawWidth: (drawWidth) => set({ drawWidth }),
  setFogBrushRadius: (fogBrushRadius: number) => set({ fogBrushRadius }),
  togglePlayerEye: () => set((s) => ({ showPlayerEye: !s.showPlayerEye })),
  setOverlayActive: (overlayActive) => set({ overlayActive }),
  setActiveWeather: (activeWeather) => set({ activeWeather }),
  setClipboardTokens: (tokens: Array<{
    name: string
    imagePath: string | null
    size: number
    hpCurrent: number
    hpMax: number
    faction: string
    ac: number | null
    notes: string | null
    statusEffects: string[] | null
    visibleToPlayers: boolean
    markerColor: string | null
    showName: boolean
    offsetX: number
    offsetY: number
  }>) => set({ clipboardTokens: tokens }),
}))