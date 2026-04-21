import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { CharacterSheet } from '@shared/ipc-types'

// The row → domain mapping used to live here and ship raw SQLite rows
// through the renderer. After the character-sheets IPC migration the
// handler returns canonical CharacterSheet shapes, so the renderer
// never sees DbRow-shaped objects.

// ─── Store ────────────────────────────────────────────────────────────────────

interface CharacterState {
  sheets: CharacterSheet[]
  activeSheetId: number | null

  setSheets: (sheets: CharacterSheet[]) => void
  addSheet: (sheet: CharacterSheet) => void
  updateSheet: (id: number, patch: Partial<CharacterSheet>) => void
  removeSheet: (id: number) => void
  setActiveSheetId: (id: number | null) => void
}

export const useCharacterStore = create<CharacterState>()(
  immer((set) => ({
    sheets: [],
    activeSheetId: null,

    setSheets: (sheets) =>
      set((s) => { s.sheets = sheets }),

    addSheet: (sheet) =>
      set((s) => { s.sheets.push(sheet) }),

    updateSheet: (id, patch) =>
      set((s) => {
        const sheet = s.sheets.find((c) => c.id === id)
        if (sheet) Object.assign(sheet, patch)
      }),

    removeSheet: (id) =>
      set((s) => {
        s.sheets = s.sheets.filter((c) => c.id !== id)
        if (s.activeSheetId === id) s.activeSheetId = null
      }),

    setActiveSheetId: (id) =>
      set((s) => { s.activeSheetId = id }),
  }))
)
