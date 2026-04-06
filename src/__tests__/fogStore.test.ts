import { describe, it, expect, beforeEach } from 'vitest'
import { useFogStore, type FogOperation } from '../renderer/stores/fogStore'

function makeOp(type: 'reveal' | 'cover' = 'reveal'): FogOperation {
  return { type, shape: 'rect', points: [0, 0, 100, 100] }
}

beforeEach(() => {
  useFogStore.setState({ history: [], redoStack: [], pendingPoints: [] })
})

describe('fogStore', () => {
  it('pushOperation adds to history and clears redoStack', () => {
    const op = makeOp()
    useFogStore.setState({ redoStack: [makeOp('cover')] })
    useFogStore.getState().pushOperation(op)
    expect(useFogStore.getState().history).toHaveLength(1)
    expect(useFogStore.getState().redoStack).toHaveLength(0)
  })

  it('pushOperation caps history at 50', () => {
    for (let i = 0; i < 55; i++) {
      useFogStore.getState().pushOperation(makeOp())
    }
    expect(useFogStore.getState().history).toHaveLength(50)
  })

  it('undo removes last history entry and returns it', () => {
    const op1 = { ...makeOp(), points: [0, 0, 10, 10] }
    const op2 = { ...makeOp(), points: [50, 50, 60, 60] }
    useFogStore.getState().pushOperation(op1)
    useFogStore.getState().pushOperation(op2)
    const undone = useFogStore.getState().undo()
    expect(undone).toEqual(op2)
    expect(useFogStore.getState().history).toHaveLength(1)
    expect(useFogStore.getState().redoStack).toHaveLength(1)
  })

  it('undo on empty history returns undefined', () => {
    expect(useFogStore.getState().undo()).toBeUndefined()
  })

  it('redo restores last undone operation', () => {
    const op = makeOp()
    useFogStore.getState().pushOperation(op)
    useFogStore.getState().undo()
    const redone = useFogStore.getState().redo()
    expect(redone).toEqual(op)
    expect(useFogStore.getState().history).toHaveLength(1)
    expect(useFogStore.getState().redoStack).toHaveLength(0)
  })

  it('redo on empty redoStack returns undefined', () => {
    expect(useFogStore.getState().redo()).toBeUndefined()
  })

  it('clearHistory resets both stacks', () => {
    useFogStore.getState().pushOperation(makeOp())
    useFogStore.getState().pushOperation(makeOp())
    useFogStore.getState().undo()
    useFogStore.getState().clearHistory()
    expect(useFogStore.getState().history).toHaveLength(0)
    expect(useFogStore.getState().redoStack).toHaveLength(0)
  })

  it('pendingPoints accumulate and clear', () => {
    useFogStore.getState().addPendingPoint(10, 20)
    useFogStore.getState().addPendingPoint(30, 40)
    expect(useFogStore.getState().pendingPoints).toEqual([10, 20, 30, 40])
    useFogStore.getState().clearPendingPoints()
    expect(useFogStore.getState().pendingPoints).toHaveLength(0)
  })
})
