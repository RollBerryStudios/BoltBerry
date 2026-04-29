import { create } from 'zustand'
import i18n from '../i18n'
import type { WeatherType } from '@shared/ipc-types'
// AP-3 split — these will become the canonical stores. Re-exported below
// so consumer files can migrate incrementally without 250+ file churn.
import { useToolStore } from './toolStore'
import { useSessionStore } from './sessionStore'

// Fire a sessions row insert / close based on the mode flip. Reads the
// active campaign from the store lazily via a dynamic import to avoid a
// circular dep (campaignStore may import uiStore-adjacent things).
async function logSessionTransition(next: 'session' | 'prep'): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI) return
  const { useCampaignStore } = await import('./campaignStore')
  const campaignId = useCampaignStore.getState().activeCampaignId
  if (!campaignId) return
  if (next === 'session') {
    await window.electronAPI.sessions.start(campaignId)
  } else {
    // Close whichever open row exists for this campaign. No-op when none
    // exists (e.g. DB was in prep across a restart).
    await window.electronAPI.sessions.endOpen(campaignId)
  }
}

export type ActiveTool = 'select' | 'fog-rect' | 'fog-polygon' | 'fog-cover' | 'fog-brush' | 'fog-brush-cover' | 'token' | 'pointer' | 'measure-line' | 'measure-circle' | 'measure-cone' | 'draw-freehand' | 'draw-rect' | 'draw-circle' | 'draw-text' | 'draw-erase' | 'wall-draw' | 'wall-door' | 'room'
export type SidebarTab = 'tokens' | 'initiative' | 'notes' | 'handouts' | 'encounters' | 'rooms' | 'characters'
export type WorkspaceTab = 'maps' | 'characters' | 'npcs' | 'audio' | 'sfx' | 'handouts' | 'notes'
export type SidebarDock = 'scene' | 'content'
/** Utility panels live in a floating dock outside the right sidebar. */
export type FloatingPanel = 'audio' | 'overlay' | 'dice'
// Blackout is tracked independently via `blackoutActive: boolean`;
// `AppMode` itself only covers the two normal DM canvas modes.
export type AppMode = 'map' | 'atmosphere'
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

/** Player Control Mode rectangle — a frame drawn in map-image
 *  coordinates that defines exactly what the player window renders.
 *  See `PlayerViewport` in ipc-types for the wire format; the two
 *  shapes are intentionally identical. */
export interface PlayerViewportRect {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
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
  /** Which tab the campaign workspace shows. Lifted into the store so
   *  the workspace can unmount while a map is open (avoiding stale
   *  Zustand subscriptions + effect churn) without losing the DM's
   *  selected tab on return. */
  workspaceTab: WorkspaceTab
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
  /** Multi-selection for walls. Shift-click in WallLayer toggles
   *  membership; the wall context menu adds bulk actions when this
   *  has 2+ ids (Phase 8 §E.Wall multi). */
  selectedWallIds: number[]
  /** Multi-selection for GM pins. Same shape as walls. */
  selectedPinIds: number[]
  /** Pending bestiary-token placement. When non-null the canvas is in
   *  "click to place" mode: the next left-click anywhere on the map
   *  spawns the chosen monster at that position via spawnMonsterOnMap.
   *  Cleared by the click itself, by Escape, or by switching tools. */
  pendingTokenSpawn: { slug: string } | null
  /** Player Control Mode — when true, the GM canvas renders the
   *  dashed viewport rectangle and Ctrl-based gestures manipulate it
   *  instead of the DM's own camera. This mode supersedes the legacy
   *  Camera Sync feature (📡 follow + 📺 one-shot send) which has
   *  been removed entirely. */
  playerViewportMode: boolean
  /** The viewport rectangle itself. Null when the mode has never been
   *  engaged on the active map (the toolbar toggle seeds a default on
   *  first entry). Resets to null on map switch. */
  playerViewport: PlayerViewportRect | null
  /** Inner size of the player window, reported by the player renderer
   *  on connect and on resize. Used to lock Player Control Mode's rect
   *  to the player's actual aspect ratio so the DM frames *exactly*
   *  what the players see (no letterbox / pillarbox). Null when no
   *  player window has reported yet — callers fall back to 16:9. */
  playerWindowSize: { w: number; h: number } | null
  gridSnap: boolean
  showMinimap: boolean
  drawColor: string
  drawWidth: number
  fogBrushRadius: number
  workMode: WorkMode
  showPlayerEye: boolean
  overlayActive: boolean
  activeWeather: WeatherType
  drawingClearTick: number
  topView: TopView
  /** Pending deep-link the next time topView flips to 'bestiary'. */
  bestiaryTarget: BestiaryTarget | null

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
  setWorkspaceTab: (tab: WorkspaceTab) => void
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
  setPendingTokenSpawn: (s: { slug: string } | null) => void
  toggleWallInSelection: (id: number) => void
  setSelectedWalls: (ids: number[]) => void
  togglePinInSelection: (id: number) => void
  setSelectedPins: (ids: number[]) => void
  clearTokenSelection: () => void
  setPlayerViewportMode: (on: boolean) => void
  setPlayerViewport: (rect: PlayerViewportRect | null) => void
  patchPlayerViewport: (patch: Partial<PlayerViewportRect>) => void
  setPlayerWindowSize: (size: { w: number; h: number } | null) => void
  toggleGridSnap: () => void
  toggleMinimap: () => void
  setDrawColor: (color: string) => void
  setDrawWidth: (width: number) => void
  setFogBrushRadius: (radius: number) => void
  togglePlayerEye: () => void
  setOverlayActive: (active: boolean) => void
  setActiveWeather: (weather: WeatherType) => void
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
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarTab: (() => { try { const v = localStorage.getItem('boltberry-sidebar-tab') as SidebarTab | null; return v && v in SIDEBAR_TAB_TO_DOCK ? v : 'tokens' } catch { return 'tokens' } })(),
  sidebarDock: (() => { try { const v = localStorage.getItem('boltberry-sidebar-tab') as SidebarTab | null; return v && v in SIDEBAR_TAB_TO_DOCK ? SIDEBAR_TAB_TO_DOCK[v] : 'scene' } catch { return 'scene' } })(),
  workspaceTab: 'maps',
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
  selectedWallIds: [],
  selectedPinIds: [],
  pendingTokenSpawn: null,
  playerViewportMode: false,
  playerViewport: null,
  playerWindowSize: null,
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
          // Stay on `select` so drag still works and a normal click
          // doesn't fire a player ping. The DM can still activate the
          // pointer tool manually (`W`) when they want shift-free
          // ping-on-click. Previously this auto-set 'pointer', which
          // meant entering player-preview broke drag (drag is gated on
          // activeTool==='select') and made every click broadcast a
          // ping to the player window.
          updates.activeTool = 'select'
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
  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
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
  toggleWallInSelection: (id) =>
    set((s) => ({
      selectedWallIds: s.selectedWallIds.includes(id)
        ? s.selectedWallIds.filter((i) => i !== id)
        : [...s.selectedWallIds, id],
    })),
  setSelectedWalls: (selectedWallIds) => set({ selectedWallIds }),
  togglePinInSelection: (id) =>
    set((s) => ({
      selectedPinIds: s.selectedPinIds.includes(id)
        ? s.selectedPinIds.filter((i) => i !== id)
        : [...s.selectedPinIds, id],
    })),
  setSelectedPins: (selectedPinIds) => set({ selectedPinIds }),
  setPendingTokenSpawn: (pendingTokenSpawn) => set({ pendingTokenSpawn }),
  clearTokenSelection: () => set({ selectedTokenIds: [], selectedTokenId: null }),
  setPlayerViewportMode: (on) => set((s) => ({
    playerViewportMode: on,
    // Leaving the mode retires the rect so the next activation seeds a
    // fresh default rather than resuming a stale one (the rect may
    // reference a map the DM has since switched away from).
    playerViewport: on ? s.playerViewport : null,
  })),
  setPlayerViewport: (rect) => set({ playerViewport: rect }),
  patchPlayerViewport: (patch) =>
    set((s) => {
      if (!s.playerViewport) return {}
      const next = { ...s.playerViewport, ...patch }
      // Aspect-lock: if the player has reported its window size, force
      // the rect's aspect to match the player's. We honour whichever
      // axis the caller explicitly passed and drive the *other* axis
      // from it. When both w and h are patched (e.g. from a Ctrl+wheel
      // zoom), we use w as the primary so the user's gesture maps to
      // proportional scaling.
      const ws = s.playerWindowSize
      if (ws && ws.w > 0 && ws.h > 0) {
        const aspect = ws.w / ws.h
        const wPatched = patch.w !== undefined
        const hPatched = patch.h !== undefined
        if (wPatched && !hPatched) {
          next.h = next.w / aspect
        } else if (hPatched && !wPatched) {
          next.w = next.h * aspect
        } else if (wPatched && hPatched) {
          // Both passed — drive h from w to keep the lock canonical.
          next.h = next.w / aspect
        }
      }
      return { playerViewport: next }
    }),
  setPlayerWindowSize: (size) =>
    set((s) => {
      // Re-aspect the existing rect (if any) so a player-window resize
      // mid-session updates the indicator immediately.
      if (!size || size.w <= 0 || size.h <= 0) return { playerWindowSize: size }
      if (!s.playerViewport) return { playerWindowSize: size }
      const aspect = size.w / size.h
      const cur = s.playerViewport
      // Preserve the rect's diagonal magnitude so the on-screen size
      // doesn't jump between aspect-squat and aspect-stretch on resize.
      const diag = Math.hypot(cur.w, cur.h)
      const h = diag / Math.hypot(aspect, 1)
      const w = h * aspect
      return { playerWindowSize: size, playerViewport: { ...cur, w, h } }
    }),
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

/* ── AP-3 backward-compat bridge ─────────────────────────────────────────────────
 * sessionMode, workMode, playerConnected and their setters live here but
 * **delegate to useSessionStore at runtime**.  Consumers should migrate
 * to `useSessionStore` directly; these aliases remain so files that still
 * import `useUIStore` compile while migration is in progress.
 * ─────────────────────────────────────────────────────────────────────────────*/

// Tool state (useToolStore)
/** @deprecated Use `useToolStore` directly. Kept for backward compat. */
export { useToolStore }

// Session state (useSessionStore)
/** @deprecated Use `useSessionStore` directly. Kept for backward compat. */
export { useSessionStore }