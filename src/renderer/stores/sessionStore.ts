import { create } from 'zustand'
import i18n from '../i18n'

export type SessionMode = 'session' | 'prep'
export type WorkMode = 'prep' | 'play' | 'combat' | 'player-preview' | 'fog-edit'

export type SidebarTab = 'tokens' | 'initiative' | 'notes' | 'handouts' | 'encounters' | 'rooms' | 'characters'
export type SidebarDock = 'scene' | 'content'

export const SIDEBAR_TAB_TO_DOCK: Record<SidebarTab, SidebarDock> = {
  tokens: 'scene',
  initiative: 'scene',
  rooms: 'scene',
  notes: 'content',
  handouts: 'content',
  characters: 'content',
  encounters: 'content',
}

/**
 * Fire a sessions row insert / close based on the mode flip. Reads the
 * active campaign from the store lazily via a dynamic import to avoid a
 * circular dep (campaignStore may import sessionStore-adjacent things).
 */
async function logSessionTransition(next: 'session' | 'prep'): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI) return
  const { useCampaignStore } = await import('./campaignStore')
  const campaignId = useCampaignStore.getState().activeCampaignId
  if (!campaignId) return
  if (next === 'session') {
    await window.electronAPI.sessions.start(campaignId)
  } else {
    await window.electronAPI.sessions.endOpen(campaignId)
  }
}

interface SessionState {
  sessionMode: SessionMode
  workMode: WorkMode
  playerConnected: boolean
  blackoutActive: boolean

  setSessionMode: (mode: SessionMode) => void
  setWorkMode: (mode: WorkMode) => void
  setPlayerConnected: (connected: boolean) => void
  toggleBlackout: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionMode: 'prep',
  workMode: 'prep',
  playerConnected: false,
  blackoutActive: false,

  setSessionMode: (sessionMode) =>
    set((s) => {
      const updates: Partial<SessionState> = { sessionMode }
      // Prevent unreachable state: sessionMode=prep + workMode=combat
      if (sessionMode === 'prep' && s.workMode === 'combat') {
        updates.workMode = 'prep'
      }
      // Log the transition to the sessions table
      if (sessionMode !== s.sessionMode) void logSessionTransition(sessionMode).catch(() => {})
      return updates
    }),

  setWorkMode: (workMode: WorkMode) =>
    set({ workMode }),

  setPlayerConnected: (playerConnected) => set({ playerConnected }),
  toggleBlackout: () => set((s) => ({ blackoutActive: !s.blackoutActive })),
}))
