import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { InitiativeEntry, EffectTimer } from '@shared/ipc-types'

function persistCurrentTurns(entries: InitiativeEntry[]) {
  if (typeof window === 'undefined' || !window.electronAPI) return
  entries.forEach((e) => {
    window.electronAPI!.dbRun(
      'UPDATE initiative SET current_turn = ? WHERE id = ?',
      [e.currentTurn ? 1 : 0, e.id]
    )
  })
}

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
  addTimer: (entryId: number, timer: EffectTimer) => void
  removeTimer: (entryId: number, effectId: string) => void
}

export const useInitiativeStore = create<InitiativeState>()(
  immer((set, get) => ({
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

    nextTurn: () => {
      set((s) => {
        if (s.entries.length === 0) return
        const currentIdx = s.entries.findIndex((e) => e.currentTurn)
        s.entries.forEach((e) => { e.currentTurn = false })

        let nextIdx = currentIdx + 1
        if (nextIdx >= s.entries.length) {
          nextIdx = 0
          s.round += 1
          // Decrement effect timers at round boundary
          s.entries.forEach((e) => {
            if (e.effectTimers) {
              e.effectTimers = e.effectTimers
                .map((t) => ({ ...t, roundsLeft: t.roundsLeft - 1 }))
                .filter((t) => t.roundsLeft > 0)
            }
          })
        }
        s.entries[nextIdx].currentTurn = true
      })
      persistCurrentTurns(get().entries)
    },

    resetCombat: () =>
      set((s) => {
        s.entries = []
        s.round = 1
      }),

    sortEntries: () =>
      set((s) => {
        s.entries.sort((a, b) => b.roll - a.roll)
      }),

    addTimer: (entryId, timer) =>
      set((s) => {
        const e = s.entries.find((e) => e.id === entryId)
        if (!e) return
        if (!e.effectTimers) e.effectTimers = []
        const existing = e.effectTimers.findIndex((t) => t.effectId === timer.effectId)
        if (existing >= 0) {
          e.effectTimers[existing] = timer
        } else {
          e.effectTimers.push(timer)
        }
      }),

    removeTimer: (entryId, effectId) =>
      set((s) => {
        const e = s.entries.find((e) => e.id === entryId)
        if (!e || !e.effectTimers) return
        e.effectTimers = e.effectTimers.filter((t) => t.effectId !== effectId)
      }),
  }))
)
