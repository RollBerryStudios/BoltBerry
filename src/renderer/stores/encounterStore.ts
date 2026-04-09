import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { EncounterRecord } from '@shared/ipc-types'

interface EncounterState {
  encounters: EncounterRecord[]

  setEncounters: (encounters: EncounterRecord[]) => void
  addEncounter: (encounter: EncounterRecord) => void
  removeEncounter: (id: number) => void
  updateEncounter: (id: number, patch: Partial<EncounterRecord>) => void
}

export const useEncounterStore = create<EncounterState>()(
  immer((set) => ({
    encounters: [],

    setEncounters: (encounters) =>
      set((s) => { s.encounters = encounters }),

    addEncounter: (encounter) =>
      set((s) => { s.encounters.push(encounter) }),

    removeEncounter: (id) =>
      set((s) => { s.encounters = s.encounters.filter((e) => e.id !== id) }),

    updateEncounter: (id, patch) =>
      set((s) => {
        const e = s.encounters.find((e) => e.id === id)
        if (e) Object.assign(e, patch)
      }),
  }))
)