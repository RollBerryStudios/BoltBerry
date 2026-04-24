import { create } from 'zustand'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface AppState {
  saveState: SaveState
  lastSaved: Date | null
  /** Tracks whether any mutation has occurred since the last successful save. */
  dirty: boolean
  setSaving: () => void
  setSaved: () => void
  setSaveError: () => void
  markDirty: () => void
}

export const useAppStore = create<AppState>((set) => ({
  saveState: 'idle',
  lastSaved: null,
  dirty: false,

  setSaving: () => set({ saveState: 'saving' }),
  setSaved: () =>
    set({ saveState: 'saved', lastSaved: new Date(), dirty: false }),
  setSaveError: () => set({ saveState: 'error' }),
  markDirty: () => set({ dirty: true }),
}))
