import { describe, it, expect, beforeEach } from 'vitest'
import { useTokenStore } from '../renderer/stores/tokenStore'
import type { TokenRecord } from '../shared/ipc-types'

function makeToken(id: number, x = 0, y = 0): TokenRecord {
  return {
    id, mapId: 1, name: `Token ${id}`, imagePath: null,
    x, y, size: 1, hpCurrent: 10, hpMax: 10, visibleToPlayers: true,
    rotation: 0, locked: false, zIndex: 0, markerColor: null, ac: null,
    notes: null, statusEffects: null, faction: 'party', showName: true,
  }
}

beforeEach(() => {
  useTokenStore.setState({ tokens: [], positionHistory: [] })
})

describe('tokenStore', () => {
  it('setTokens replaces list', () => {
    useTokenStore.getState().setTokens([makeToken(1), makeToken(2)])
    expect(useTokenStore.getState().tokens).toHaveLength(2)
  })

  it('addToken appends', () => {
    useTokenStore.getState().addToken(makeToken(1))
    useTokenStore.getState().addToken(makeToken(2))
    expect(useTokenStore.getState().tokens).toHaveLength(2)
  })

  it('removeToken removes by id', () => {
    useTokenStore.getState().setTokens([makeToken(1), makeToken(2)])
    useTokenStore.getState().removeToken(1)
    expect(useTokenStore.getState().tokens).toHaveLength(1)
    expect(useTokenStore.getState().tokens[0].id).toBe(2)
  })

  it('updateToken patches fields', () => {
    useTokenStore.getState().setTokens([makeToken(1, 10, 20)])
    useTokenStore.getState().updateToken(1, { x: 50, hpCurrent: 5 })
    const t = useTokenStore.getState().tokens[0]
    expect(t.x).toBe(50)
    expect(t.hpCurrent).toBe(5)
    expect(t.y).toBe(20) // unchanged
  })

  it('moveToken saves snapshot and updates position', () => {
    useTokenStore.getState().setTokens([makeToken(1, 10, 20), makeToken(2, 30, 40)])
    useTokenStore.getState().moveToken(1, 100, 200)
    const state = useTokenStore.getState()
    expect(state.tokens.find((t) => t.id === 1)?.x).toBe(100)
    expect(state.positionHistory).toHaveLength(1)
    expect(state.positionHistory[0].find((p) => p.id === 1)).toMatchObject({ x: 10, y: 20 })
  })

  it('undoLastMove restores previous positions', () => {
    useTokenStore.getState().setTokens([makeToken(1, 10, 20)])
    useTokenStore.getState().moveToken(1, 100, 200)
    useTokenStore.getState().undoLastMove()
    const t = useTokenStore.getState().tokens[0]
    expect(t.x).toBe(10)
    expect(t.y).toBe(20)
    expect(useTokenStore.getState().positionHistory).toHaveLength(0)
  })

  it('undoLastMove is a no-op with empty history', () => {
    useTokenStore.getState().setTokens([makeToken(1, 5, 5)])
    useTokenStore.getState().undoLastMove()
    expect(useTokenStore.getState().tokens[0].x).toBe(5)
  })

  it('positionHistory is capped at 20 entries', () => {
    useTokenStore.getState().setTokens([makeToken(1)])
    for (let i = 0; i < 25; i++) {
      useTokenStore.getState().moveToken(1, i, i)
    }
    expect(useTokenStore.getState().positionHistory).toHaveLength(20)
  })
})
