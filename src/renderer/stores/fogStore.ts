import { create } from 'zustand'

export type FogShape = 'rect' | 'polygon' | 'circle'
export type FogOperation = { type: 'reveal' | 'cover'; shape: FogShape; points: number[] }

interface FogState {
  // The fog is rendered on a Konva canvas – we store operations as an undo stack.
  // The actual pixel bitmap lives in the Konva layer (ref-based, not in store).
  // This store tracks the operation history for undo/redo.
  history: FogOperation[]   // applied operations (index 0 = oldest)
  redoStack: FogOperation[]  // operations undone, available for redo

  // Active drawing state
  isDrawing: boolean
  activeShape: FogShape
  activeOp: 'reveal' | 'cover'
  pendingPoints: number[] // in-progress polygon points

  // Actions
  pushOperation: (op: FogOperation) => void
  undo: () => FogOperation | undefined
  redo: () => FogOperation | undefined
  clearHistory: () => void
  setDrawing: (drawing: boolean) => void
  setActiveShape: (shape: FogShape) => void
  setActiveOp: (op: 'reveal' | 'cover') => void
  addPendingPoint: (x: number, y: number) => void
  clearPendingPoints: () => void
}

export const useFogStore = create<FogState>((set, get) => ({
  history: [],
  redoStack: [],
  isDrawing: false,
  activeShape: 'rect',
  activeOp: 'reveal',
  pendingPoints: [],

  pushOperation: (op) =>
    set((s) => ({
      history: [...s.history.slice(-49), op], // max 50
      redoStack: [], // clear redo on new action
    })),

  undo: () => {
    const { history } = get()
    if (history.length === 0) return undefined
    const last = history[history.length - 1]
    set((s) => ({
      history: s.history.slice(0, -1),
      redoStack: [last, ...s.redoStack.slice(0, 49)],
    }))
    return last
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return undefined
    const next = redoStack[0]
    set((s) => ({
      redoStack: s.redoStack.slice(1),
      history: [...s.history, next],
    }))
    return next
  },

  clearHistory: () => set({ history: [], redoStack: [] }),

  setDrawing: (isDrawing) => set({ isDrawing }),
  setActiveShape: (activeShape) => set({ activeShape }),
  setActiveOp: (activeOp) => set({ activeOp }),
  addPendingPoint: (x, y) => set((s) => ({ pendingPoints: [...s.pendingPoints, x, y] })),
  clearPendingPoints: () => set({ pendingPoints: [] }),
}))
