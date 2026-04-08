import { describe, it, expect, beforeEach } from 'vitest'
import { useInitiativeStore } from '../renderer/stores/initiativeStore'
import type { InitiativeEntry } from '../shared/ipc-types'

function makeEntry(id: number, roll: number, currentTurn = false): InitiativeEntry {
  return { id, mapId: 1, combatantName: `Combatant ${id}`, roll, currentTurn, tokenId: null }
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
})
