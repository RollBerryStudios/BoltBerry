import { describe, it, expect, beforeEach } from 'vitest'
import { useInitiativeStore } from '../renderer/stores/initiativeStore'
import type { InitiativeEntry } from '../shared/ipc-types'

function makeEntry(id: number, roll: number, currentTurn = false): InitiativeEntry {
  return { id, mapId: 1, combatantName: `Combatant ${id}`, roll, currentTurn, tokenId: null, effectTimers: null }
}

beforeEach(() => {
  useInitiativeStore.setState({ entries: [], round: 1 })
})

describe('initiativeStore', () => {
  it('sorts entries by roll descending on add', () => {
    useInitiativeStore.getState().addEntry(makeEntry(1, 10))
    useInitiativeStore.getState().addEntry(makeEntry(2, 20))
    useInitiativeStore.getState().addEntry(makeEntry(3, 5))
    const rolls = useInitiativeStore.getState().entries.map((e) => e.roll)
    expect(rolls).toEqual([20, 10, 5])
  })

  it('setEntries sorts by roll descending', () => {
    useInitiativeStore.getState().setEntries([
      makeEntry(1, 3),
      makeEntry(2, 15),
      makeEntry(3, 8),
    ])
    const rolls = useInitiativeStore.getState().entries.map((e) => e.roll)
    expect(rolls).toEqual([15, 8, 3])
  })

  it('removeEntry removes by id', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10), makeEntry(2, 5)])
    useInitiativeStore.getState().removeEntry(1)
    expect(useInitiativeStore.getState().entries).toHaveLength(1)
    expect(useInitiativeStore.getState().entries[0].id).toBe(2)
  })

  it('nextTurn advances to next entry', () => {
    useInitiativeStore.getState().setEntries([
      makeEntry(1, 20, true),
      makeEntry(2, 10),
      makeEntry(3, 5),
    ])
    useInitiativeStore.getState().nextTurn()
    const state = useInitiativeStore.getState()
    expect(state.entries.find((e) => e.currentTurn)?.id).toBe(2)
    expect(state.round).toBe(1)
  })

  it('nextTurn wraps around and increments round', () => {
    useInitiativeStore.getState().setEntries([
      makeEntry(1, 20),
      makeEntry(2, 10, true),
    ])
    useInitiativeStore.getState().nextTurn()
    const state = useInitiativeStore.getState()
    expect(state.entries.find((e) => e.currentTurn)?.id).toBe(1)
    expect(state.round).toBe(2)
  })

  it('resetCombat clears entries and resets round', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10)])
    useInitiativeStore.setState({ round: 5 })
    useInitiativeStore.getState().resetCombat()
    const state = useInitiativeStore.getState()
    expect(state.entries).toHaveLength(0)
    expect(state.round).toBe(1)
  })

  it('updateEntry patches a field and re-sorts by roll', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10), makeEntry(2, 5)])
    // Raise entry 2 above entry 1
    useInitiativeStore.getState().updateEntry(2, { roll: 20 })
    const rolls = useInitiativeStore.getState().entries.map((e) => e.roll)
    expect(rolls).toEqual([20, 10])
  })

  it('updateEntry on unknown id does nothing', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10)])
    useInitiativeStore.getState().updateEntry(99, { roll: 999 })
    expect(useInitiativeStore.getState().entries).toHaveLength(1)
  })

  it('sortEntries re-sorts by roll descending', () => {
    // Use reorderEntries to scramble, then sortEntries restores roll order
    useInitiativeStore.getState().setEntries([makeEntry(1, 20), makeEntry(2, 10), makeEntry(3, 5)])
    useInitiativeStore.getState().reorderEntries(0, 2) // move 20 to last
    const before = useInitiativeStore.getState().entries.map((e) => e.roll)
    expect(before).toEqual([10, 5, 20])
    useInitiativeStore.getState().sortEntries()
    const after = useInitiativeStore.getState().entries.map((e) => e.roll)
    expect(after).toEqual([20, 10, 5])
  })

  it('reorderEntries moves entry from one index to another', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 30), makeEntry(2, 20), makeEntry(3, 10)])
    // Move index 0 (roll=30) to index 2
    useInitiativeStore.getState().reorderEntries(0, 2)
    const ids = useInitiativeStore.getState().entries.map((e) => e.id)
    expect(ids).toEqual([2, 3, 1])
  })

  it('reorderEntries is a no-op when fromIndex equals toIndex', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 20), makeEntry(2, 10)])
    useInitiativeStore.getState().reorderEntries(1, 1)
    const ids = useInitiativeStore.getState().entries.map((e) => e.id)
    expect(ids).toEqual([1, 2])
  })

  it('reorderEntries does not re-sort by roll', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 20), makeEntry(2, 10)])
    // Move the high-roll entry to the bottom
    useInitiativeStore.getState().reorderEntries(0, 1)
    const rolls = useInitiativeStore.getState().entries.map((e) => e.roll)
    // Manual order preserved — not auto-sorted back
    expect(rolls).toEqual([10, 20])
  })

  it('addTimer attaches a new effect timer to an entry', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10)])
    useInitiativeStore.getState().addTimer(1, { effectId: 'blessed', roundsLeft: 3 })
    const timers = useInitiativeStore.getState().entries[0].effectTimers
    expect(timers).toHaveLength(1)
    expect(timers![0]).toEqual({ effectId: 'blessed', roundsLeft: 3 })
  })

  it('addTimer replaces existing timer with same effectId', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10)])
    useInitiativeStore.getState().addTimer(1, { effectId: 'blessed', roundsLeft: 5 })
    useInitiativeStore.getState().addTimer(1, { effectId: 'blessed', roundsLeft: 2 })
    const timers = useInitiativeStore.getState().entries[0].effectTimers
    expect(timers).toHaveLength(1)
    expect(timers![0].roundsLeft).toBe(2)
  })

  it('removeTimer removes an effect timer by effectId', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 10)])
    useInitiativeStore.getState().addTimer(1, { effectId: 'blessed', roundsLeft: 3 })
    useInitiativeStore.getState().addTimer(1, { effectId: 'cursed', roundsLeft: 2 })
    useInitiativeStore.getState().removeTimer(1, 'blessed')
    const timers = useInitiativeStore.getState().entries[0].effectTimers
    expect(timers).toHaveLength(1)
    expect(timers![0].effectId).toBe('cursed')
  })

  it('nextTurn decrements effect timers at round boundary', () => {
    useInitiativeStore.getState().setEntries([
      makeEntry(1, 20, true),
      makeEntry(2, 10),
    ])
    useInitiativeStore.getState().addTimer(1, { effectId: 'blessed', roundsLeft: 2 })
    // nextTurn at last entry wraps → round boundary → decrement timers
    useInitiativeStore.getState().nextTurn() // advance to entry 2
    useInitiativeStore.getState().nextTurn() // wrap back to entry 1 → round boundary
    const timers = useInitiativeStore.getState().entries.find((e) => e.id === 1)?.effectTimers
    expect(timers![0].roundsLeft).toBe(1)
  })

  it('nextTurn removes expired timers at round boundary', () => {
    useInitiativeStore.getState().setEntries([makeEntry(1, 20, true), makeEntry(2, 10)])
    useInitiativeStore.getState().addTimer(1, { effectId: 'blessed', roundsLeft: 1 })
    useInitiativeStore.getState().nextTurn() // → entry 2
    useInitiativeStore.getState().nextTurn() // wrap → timer expires (1-1=0 → removed)
    const timers = useInitiativeStore.getState().entries.find((e) => e.id === 1)?.effectTimers
    expect(timers).toHaveLength(0)
  })
})
