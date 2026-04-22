import { create } from 'zustand'
import { showToast } from '../components/shared/Toast'

/**
 * Undo commands come in two shapes.
 *
 *  1. `Command` — closure-based: the callsite captures store state in
 *     `undo` / `redo` closures. This is what most existing code uses.
 *     It's flexible but the functions can't be serialized, so the stack
 *     cannot survive a renderer crash or be written to disk.
 *
 *  2. `Action` — declarative: `{ type, forward, backward }` with pure
 *     JSON payloads. A registry (`registerUndoAction`) maps each
 *     action type to its apply/revert functions. The stack can be
 *     serialized to JSON and replayed on startup — enabling eventual
 *     crash recovery per audit AP-5 without any renderer-side magic.
 *
 * Both shapes coexist: `pushCommand` accepts either, and actions are
 * wrapped into a Command internally so the undo/redo loop stays
 * simple. New callsites should prefer Action — it's the forward-
 * compatible shape.
 */
export interface Command {
  id: string
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
  /** Filled only for Action-based commands. Serializable form. */
  readonly action?: Action
}

export interface Action<P = unknown> {
  /** Dot-scoped identifier, e.g. `'token.move'`, `'fog.reveal'`. */
  type: string
  /** Payload must be plain JSON (serializable). */
  payload: P
}

interface ActionHandler<P = unknown> {
  /** Apply the action forward (redo path). */
  forward: (payload: P) => Promise<void> | void
  /** Revert the action (undo path). */
  backward: (payload: P) => Promise<void> | void
  /** Short label for the undo toast, optionally derived from payload. */
  label: string | ((payload: P) => string)
}

const actionRegistry = new Map<string, ActionHandler<unknown>>()

/**
 * Register an action type with its forward / backward handlers. Call
 * once at module init; multiple registrations for the same type will
 * overwrite (latest wins). The registry lives in the module scope so
 * actions pushed before the registering module has loaded will fail
 * at dispatch time — register early, before the first push.
 */
export function registerUndoAction<P>(type: string, handler: ActionHandler<P>): void {
  actionRegistry.set(type, handler as ActionHandler<unknown>)
}

function actionToCommand(action: Action): Command {
  const handler = actionRegistry.get(action.type)
  if (!handler) {
    throw new Error(`[undoStore] No handler registered for action type: ${action.type}`)
  }
  const label = typeof handler.label === 'function' ? handler.label(action.payload) : handler.label
  return {
    id: nextCommandId(),
    label,
    action,
    undo: () => handler.backward(action.payload),
    redo: () => handler.forward(action.payload),
  }
}

/**
 * Convenience for the new Action-based call sites. Equivalent to
 * `pushCommand(actionToCommand(action))` but also runs the forward
 * handler so the caller doesn't have to apply the action manually
 * before pushing the undo entry.
 */
export async function pushAction(action: Action): Promise<void> {
  const cmd = actionToCommand(action)
  await cmd.redo()
  useUndoStore.getState().pushCommand(cmd)
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

  pushCommand: (cmd) => {
    const wasFull = get().undoStack.length >= 50
    set((s) => ({
      undoStack: [...s.undoStack.slice(-49), cmd],
      redoStack: [],
    }))
let warnedFull = false

    if (wasFull && !warnedFull) {
      warnedFull = true
      showToast('Rückgängig-Stapel voll — älteste Aktionen wurden überschrieben', 'warning')
      setTimeout(() => { warnedFull = false }, 5000)
    }
  },

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