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
    set({ saveState: 'saved', lastSaved: new Date() })
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      set({ saveState: 'idle' })
      savedTimer = null
    }, 2500)
  },
  setSaveError: () => set({ saveState: 'error' }),
}))
