import { create } from 'zustand'
import i18n from '../i18n'

// Fire a sessions row insert / close based on the mode flip. Reads the
// active campaign from the store lazily via a dynamic import to avoid a
// circular dep (campaignStore may import uiStore-adjacent things).
async function logSessionTransition(next: 'session' | 'prep'): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI) return
  const { useCampaignStore } = await import('./campaignStore')
  const campaignId = useCampaignStore.getState().activeCampaignId
  if (!campaignId) return
  if (next === 'session') {
    // New session row — started_at defaults to datetime('now').
    await window.electronAPI.dbRun(
      `INSERT INTO sessions (campaign_id) VALUES (?)`,
      [campaignId],
    )
  } else {
    // Close whichever open row exists for this campaign. UPDATE is a no-op
    // if there isn't one (e.g. the DB was at prep across a restart).
    await window.electronAPI.dbRun(
      `UPDATE sessions SET ended_at = datetime('now')
       WHERE campaign_id = ? AND ended_at IS NULL`,
      [campaignId],
    )
  }
}

export type ActiveTool = 'select' | 'fog-rect' | 'fog-polygon' | 'fog-cover' | 'fog-brush' | 'fog-brush-cover' | 'token' | 'atmosphere' | 'pointer' | 'measure-line' | 'measure-circle' | 'measure-cone' | 'draw-freehand' | 'draw-rect' | 'draw-circle' | 'draw-text' | 'wall-draw' | 'wall-door' | 'room'
export type SidebarTab = 'tokens' | 'initiative' | 'notes' | 'handouts' | 'encounters' | 'rooms' | 'characters'
export type SidebarDock = 'scene' | 'content'
/** Utility panels live in a floating dock outside the right sidebar. */
export type FloatingPanel = 'audio' | 'overlay' | 'dice'
export type AppMode = 'map' | 'atmosphere' | 'blackout'
export type SessionMode = 'session' | 'prep'
export type WorkMode = 'prep' | 'play' | 'combat' | 'player-preview' | 'fog-edit'
export type AppLanguage = 'de' | 'en'
/** Top-level screen override. When set to a non-'main' value, the named
 *  overlay view (e.g. compendium, bestiary) takes over the whole window;
 *  'main' falls through to the regular Welcome / Workspace / Map routing. */
export type TopView = 'main' | 'compendium' | 'bestiary'

export type BestiaryTab = 'monsters' | 'items' | 'spells'

/** Deep-link target for the Bestiarium view. When set, BestiaryView opens
 *  the requested tab and pre-selects the matching slug. Consumed once by
 *  the view, then cleared via `clearBestiaryTarget()` so re-opening the
 *  view from the nav doesn't re-target the same entry. */
export interface BestiaryTarget {
  tab: BestiaryTab
  slug: string
}

const FLOATING_PANELS: ReadonlySet<string> = new Set(['audio', 'overlay', 'dice'])
export function isFloatingPanel(id: string): id is FloatingPanel {
  return FLOATING_PANELS.has(id)
}

// Maps each sidebar tab to the dock it belongs to.
// When setSidebarTab is called, sidebarDock follows automatically.
export const SIDEBAR_TAB_TO_DOCK: Record<SidebarTab, SidebarDock> = {
  tokens: 'scene',
  initiative: 'scene',
  rooms: 'scene',
  notes: 'content',
  handouts: 'content',
  characters: 'content',
  encounters: 'content',
}

// Min/max widths in px for the resizable sidebars.
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 520

interface UIState {
  activeTool: ActiveTool
  sidebarTab: SidebarTab
  sidebarDock: SidebarDock
  /** Currently-open floating utility panel (audio/overlay/dice). null = none. */
  floatingPanel: FloatingPanel | null
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
  leftSidebarWidth: number
  rightSidebarWidth: number
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
  drawingClearTick: number
  topView: TopView
  /** Pending deep-link the next time topView flips to 'bestiary'. */
  bestiaryTarget: BestiaryTarget | null
  /** v1 Conservative dock prefs — persisted to localStorage. */
  dockLabels: boolean
  dockAutoHide: boolean

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
  setSidebarDock: (dock: SidebarDock) => void
  setFloatingPanel: (panel: FloatingPanel | null) => void
  toggleFloatingPanel: (panel: FloatingPanel) => void
  toggleLeftSidebar: () => void
  toggleRightSidebar: () => void
  setLeftSidebarWidth: (px: number) => void
  setRightSidebarWidth: (px: number) => void
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
  incrementDrawingClearTick: () => void
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

  setTopView: (view: TopView) => void
  /** Sets a deep-link and flips topView='bestiary' in one shot. */
  openBestiary: (target?: BestiaryTarget) => void
  /** Called by BestiaryView once it has applied the target. */
  clearBestiaryTarget: () => void
  toggleDockLabels: () => void
  toggleDockAutoHide: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarTab: (() => { try { const v = localStorage.getItem('boltberry-sidebar-tab') as SidebarTab | null; return v && v in SIDEBAR_TAB_TO_DOCK ? v : 'tokens' } catch { return 'tokens' } })(),
  sidebarDock: (() => { try { const v = localStorage.getItem('boltberry-sidebar-tab') as SidebarTab | null; return v && v in SIDEBAR_TAB_TO_DOCK ? SIDEBAR_TAB_TO_DOCK[v] : 'scene' } catch { return 'scene' } })(),
  floatingPanel: null,
  leftSidebarOpen: (() => { try { const v = localStorage.getItem('boltberry-left-sidebar'); return v === null ? true : v !== 'false' } catch { return true } })(),
  rightSidebarOpen: (() => { try { const v = localStorage.getItem('boltberry-right-sidebar'); return v === null ? true : v !== 'false' } catch { return true } })(),
  leftSidebarWidth: (() => { try { const v = parseInt(localStorage.getItem('boltberry-left-sidebar-width') || '', 10); return Number.isFinite(v) && v >= SIDEBAR_MIN_WIDTH && v <= SIDEBAR_MAX_WIDTH ? v : 240 } catch { return 240 } })(),
  rightSidebarWidth: (() => { try { const v = parseInt(localStorage.getItem('boltberry-right-sidebar-width') || '', 10); return Number.isFinite(v) && v >= SIDEBAR_MIN_WIDTH && v <= SIDEBAR_MAX_WIDTH ? v : 300 } catch { return 300 } })(),
  playerConnected: false,
  blackoutActive: false,
  appMode: 'map',
  sessionMode: 'prep',
  theme: 'dark',
  language: (() => { try { return (localStorage.getItem('boltberry-lang') as AppLanguage | null) ?? 'de' } catch { return 'de' as AppLanguage } })(),
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
  drawingClearTick: 0,
  clipboardTokens: [],
  topView: 'main',
  bestiaryTarget: null,
  dockLabels: (() => { try { return localStorage.getItem('boltberry-dock-labels') === 'true' } catch { return false } })(),
  dockAutoHide: (() => { try { return localStorage.getItem('boltberry-dock-auto-hide') === 'true' } catch { return false } })(),

  setActiveTool: (activeTool) => set({ activeTool }),
  setWorkMode: (workMode: WorkMode) =>
    set((s) => {
      const updates: Partial<UIState> = { workMode }
      const setTab = (tab: SidebarTab) => {
        updates.sidebarTab = tab
        updates.sidebarDock = SIDEBAR_TAB_TO_DOCK[tab]
        try { localStorage.setItem('boltberry-sidebar-tab', tab) } catch { /* noop */ }
      }
      switch (workMode) {
        case 'prep':
          updates.activeTool = 'select'
          setTab('tokens')
          break
        case 'play':
          updates.activeTool = 'select'
          setTab('initiative')
          break
        case 'combat':
          updates.activeTool = 'select'
          setTab('initiative')
          break
        case 'player-preview':
          updates.activeTool = 'pointer'
          break
        case 'fog-edit':
          updates.activeTool = 'fog-brush'
          setTab('tokens')
          break
      }
      return updates
    }),
  setSidebarTab: (sidebarTab) => {
    try { localStorage.setItem('boltberry-sidebar-tab', sidebarTab) } catch { /* noop */ }
    set({ sidebarTab, sidebarDock: SIDEBAR_TAB_TO_DOCK[sidebarTab] })
  },
  setSidebarDock: (sidebarDock) => set({ sidebarDock }),
  setFloatingPanel: (floatingPanel) => set({ floatingPanel }),
  toggleFloatingPanel: (panel) =>
    set((s) => ({ floatingPanel: s.floatingPanel === panel ? null : panel })),
  toggleLeftSidebar: () => set((s) => {
    const v = !s.leftSidebarOpen
    try { localStorage.setItem('boltberry-left-sidebar', String(v)) } catch { /* noop */ }
    return { leftSidebarOpen: v }
  }),
  toggleRightSidebar: () => set((s) => {
    const v = !s.rightSidebarOpen
    try { localStorage.setItem('boltberry-right-sidebar', String(v)) } catch { /* noop */ }
    return { rightSidebarOpen: v }
  }),
  setLeftSidebarWidth: (px) => {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(px)))
    try { localStorage.setItem('boltberry-left-sidebar-width', String(clamped)) } catch { /* noop */ }
    set({ leftSidebarWidth: clamped })
  },
  setRightSidebarWidth: (px) => {
    const clamped = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(px)))
    try { localStorage.setItem('boltberry-right-sidebar-width', String(clamped)) } catch { /* noop */ }
    set({ rightSidebarWidth: clamped })
  },
  setPlayerConnected: (playerConnected) => set({ playerConnected }),
  toggleBlackout: () =>
    set((s) => ({ blackoutActive: !s.blackoutActive })),
  setAppMode: (appMode) => set({ appMode }),
  setSessionMode: (sessionMode) => set((s) => {
    const updates: Partial<UIState> = { sessionMode }
    // Prevent unreachable state: sessionMode=prep + workMode=combat
    if (sessionMode === 'prep' && s.workMode === 'combat') {
      updates.workMode = 'prep'
    }
    // Log the transition to the sessions table so Welcome / Workspace can
    // surface a session count + last-played stat. Fire-and-forget — we
    // don't block the UI on a DB round-trip and any failure is cosmetic.
    if (sessionMode !== s.sessionMode) void logSessionTransition(sessionMode).catch(() => {})
    return updates
  }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
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
  incrementDrawingClearTick: () => set((s) => ({ drawingClearTick: s.drawingClearTick + 1 })),
  setTopView: (topView) => set({ topView }),
  openBestiary: (target) =>
    set({ topView: 'bestiary', bestiaryTarget: target ?? null }),
  clearBestiaryTarget: () => set({ bestiaryTarget: null }),
  toggleDockLabels: () =>
    set((s) => {
      const next = !s.dockLabels
      try { localStorage.setItem('boltberry-dock-labels', String(next)) } catch { /* noop */ }
      return { dockLabels: next }
    }),
  toggleDockAutoHide: () =>
    set((s) => {
      const next = !s.dockAutoHide
      try { localStorage.setItem('boltberry-dock-auto-hide', String(next)) } catch { /* noop */ }
      return { dockAutoHide: next }
    }),
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