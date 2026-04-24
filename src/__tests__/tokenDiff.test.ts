import { describe, it, expect } from 'vitest'
import { diffTokens, isNoOpDiff } from '../renderer/utils/tokenDiff'
import type { PlayerTokenState } from '../shared/ipc-types'

function token(id: number, over: Partial<PlayerTokenState> = {}): PlayerTokenState {
  return {
    id,
    name: `Token ${id}`,
    imagePath: null,
    x: 0,
    y: 0,
    size: 1,
    hpCurrent: 10,
    hpMax: 10,
    showName: true,
    rotation: 0,
    markerColor: null,
    statusEffects: null,
    ac: null,
    faction: 'party',
    lightRadius: 0,
    lightColor: '#ffcc44',
    ...over,
  }
}

describe('tokenDiff', () => {
  it('empty → empty yields an empty diff', () => {
    const d = diffTokens([], [])
    expect(d.upsert).toEqual([])
    expect(d.remove).toEqual([])
    expect(isNoOpDiff(d)).toBe(true)
  })

  it('first broadcast puts every current token in upsert', () => {
    const next = [token(1), token(2)]
    const d = diffTokens([], next)
    expect(d.upsert).toEqual(next)
    expect(d.remove).toEqual([])
  })

  it('unchanged snapshots produce no-op diff', () => {
    const prev = [token(1, { x: 5 }), token(2, { hpCurrent: 7 })]
    const next = [token(1, { x: 5 }), token(2, { hpCurrent: 7 })]
    const d = diffTokens(prev, next)
    expect(isNoOpDiff(d)).toBe(true)
  })

  it('a single moved token emits exactly one upsert', () => {
    const prev = [token(1, { x: 0 }), token(2, { x: 10 })]
    const next = [token(1, { x: 20 }), token(2, { x: 10 })]
    const d = diffTokens(prev, next)
    expect(d.upsert).toHaveLength(1)
    expect(d.upsert[0].id).toBe(1)
    expect(d.upsert[0].x).toBe(20)
    expect(d.remove).toEqual([])
  })

  it('deleted tokens land in `remove`', () => {
    const prev = [token(1), token(2), token(3)]
    const next = [token(1), token(3)]
    const d = diffTokens(prev, next)
    expect(d.upsert).toEqual([])
    expect(d.remove).toEqual([2])
  })

  it('new tokens land in `upsert`', () => {
    const prev = [token(1)]
    const next = [token(1), token(2)]
    const d = diffTokens(prev, next)
    expect(d.upsert).toHaveLength(1)
    expect(d.upsert[0].id).toBe(2)
    expect(d.remove).toEqual([])
  })

  it('statusEffects array comparison is element-wise', () => {
    const prev = [token(1, { statusEffects: ['poison'] })]
    const same = [token(1, { statusEffects: ['poison'] })]
    const different = [token(1, { statusEffects: ['stunned'] })]
    expect(isNoOpDiff(diffTokens(prev, same))).toBe(true)
    expect(isNoOpDiff(diffTokens(prev, different))).toBe(false)
  })

  it('mixed add / remove / update in one diff', () => {
    const prev = [token(1, { x: 0 }), token(2)]
    const next = [token(1, { x: 5 }), token(3)]
    const d = diffTokens(prev, next)
    expect(d.upsert.map((t) => t.id).sort()).toEqual([1, 3])
    expect(d.remove).toEqual([2])
  })
})
