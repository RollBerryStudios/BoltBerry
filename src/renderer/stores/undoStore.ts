import { create } from 'zustand'

export interface Command {
  id: string
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

interface UndoState {
  undoStack: Command[]
  redoStack: Command[]
  activeMapId: number | null

  pushCommand: (cmd: Command) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: () => boolean
  canRedo: () => boolean
  setActiveMapId: (id: number | null) => void
}

let cmdCounter = 0

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  activeMapId: null,

  pushCommand: (cmd) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-49), cmd],
      redoStack: [],
    })),

  undo: async () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return
    const cmd = undoStack[undoStack.length - 1]
    await cmd.undo()
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [cmd, ...s.redoStack.slice(0, 49)],
    }))
  },

  redo: async () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return
    const cmd = redoStack[0]
    await cmd.redo()
    set((s) => ({
      redoStack: s.redoStack.slice(1),
      undoStack: [...s.undoStack, cmd],
    }))
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  setActiveMapId: (id) => {
    if (id === get().activeMapId) return
    set({ activeMapId: id, undoStack: [], redoStack: [] })
  },
}))

export function nextCommandId(): string {
  return `cmd_${Date.now()}_${++cmdCounter}`
}