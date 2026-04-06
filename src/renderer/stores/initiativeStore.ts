import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { InitiativeEntry } from '@shared/ipc-types'

interface InitiativeState {
  entries: InitiativeEntry[]
  round: number

  // Actions
  setEntries: (entries: InitiativeEntry[]) => void
  addEntry: (entry: InitiativeEntry) => void
  removeEntry: (id: number) => void
  updateEntry: (id: number, patch: Partial<InitiativeEntry>) => void
  nextTurn: () => void
  resetCombat: () => void
  sortEntries: () => void
}

export const useInitiativeStore = create<InitiativeState>()(
  immer((set) => ({
    entries: [],
    round: 1,

    setEntries: (entries) =>
      set((s) => {
        s.entries = [...entries].sort((a, b) => b.roll - a.roll)
      }),

    addEntry: (entry) =>
      set((s) => {
        s.entries.push(entry)
        s.entries.sort((a, b) => b.roll - a.roll)
      }),

    removeEntry: (id) =>
      set((s) => {
        s.entries = s.entries.filter((e) => e.id !== id)
      }),

    updateEntry: (id, patch) =>
      set((s) => {
        const e = s.entries.find((e) => e.id === id)
        if (e) Object.assign(e, patch)
        s.entries.sort((a, b) => b.roll - a.roll)
      }),

    nextTurn: () =>
      set((s) => {
        if (s.entries.length === 0) return
        const currentIdx = s.entries.findIndex((e) => e.currentTurn)
        s.entries.forEach((e) => { e.currentTurn = false })

        let nextIdx = currentIdx + 1
        if (nextIdx >= s.entries.length) {
          nextIdx = 0
          s.round += 1
        }
        s.entries[nextIdx].currentTurn = true
      }),

    resetCombat: () =>
      set((s) => {
        s.entries = []
        s.round = 1
      }),

    sortEntries: () =>
      set((s) => {
        s.entries.sort((a, b) => b.roll - a.roll)
      }),
  }))
)
