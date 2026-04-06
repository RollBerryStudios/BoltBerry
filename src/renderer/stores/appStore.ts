import { create } from 'zustand'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface AppState {
  saveState: SaveState
  lastSaved: Date | null
  setSaving: () => void
  setSaved: () => void
  setSaveError: () => void
}

export const useAppStore = create<AppState>((set) => ({
  saveState: 'idle',
  lastSaved: null,

  setSaving: () => set({ saveState: 'saving' }),
  setSaved: () => set({ saveState: 'saved', lastSaved: new Date() }),
  setSaveError: () => set({ saveState: 'error' }),
}))
