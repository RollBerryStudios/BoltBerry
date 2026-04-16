import { create } from 'zustand'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface AppState {
  saveState: SaveState
  lastSaved: Date | null
  setSaving: () => void
  setSaved: () => void
  setSaveError: () => void
}

let savedTimer: ReturnType<typeof setTimeout> | null = null

export const useAppStore = create<AppState>((set) => ({
  saveState: 'idle',
  lastSaved: null,

  setSaving: () => {
    if (savedTimer) { clearTimeout(savedTimer); savedTimer = null }
    set({ saveState: 'saving' })
  },
  setSaved: () => {
    // Stay in 'saved' state permanently — no revert to 'idle'.
    // The StatusBar shows a persistent "Alle Änderungen gespeichert" indicator.
    if (savedTimer) { clearTimeout(savedTimer); savedTimer = null }
    set({ saveState: 'saved', lastSaved: new Date() })
  },
  setSaveError: () => set({ saveState: 'error' }),
}))
