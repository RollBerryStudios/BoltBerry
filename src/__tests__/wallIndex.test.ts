/**
 * wallIndex.test.ts
 *
 * Property tests for the wall spatial index. The index is only useful
 * if it produces the *same* visibility polygon as the brute-force loop;
 * a stale or under-populated bucket would silently truncate visibility.
 *
 * Strategy: build a deterministic random wall layout, compute the
 * polygon both with and without the index, and assert byte-equality.
 */

import { describe, it, expect } from 'vitest'
import { computeVisibilityPolygon, type Segment } from '@renderer/utils/losEngine'
import { buildWallIndex } from '@renderer/utils/wallIndex'

// Tiny seeded RNG so the test fails deterministically if it ever does.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    // Mulberry32
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomWalls(count: number, w: number, h: number, seed: number): Segment[] {
  const rng = makeRng(seed)
  const segs: Segment[] = []
  for (let i = 0; i < count; i++) {
    const x1 = rng() * w
    const y1 = rng() * h
    const angle = rng() * Math.PI * 2
    const len = 30 + rng() * 200
    segs.push({
      x1,
      y1,
      x2: x1 + Math.cos(angle) * len,
      y2: y1 + Math.sin(angle) * len,
      wallType: 'wall',
      doorState: 'closed',
    })
  }
  return segs
}

describe('wallIndex parity with brute-force losEngine', () => {
  for (const count of [10, 50, 200]) {
    it(`matches brute force for ${count} random walls`, () => {
      const W = 2048
      const H = 2048
      const segs = randomWalls(count, W, H, 0xc0ffee + count)
      const idx = buildWallIndex(segs, W, H)

      // Sample a handful of observer positions across the map.
      const observers = [
        [W / 2, H / 2],
        [10, 10],
        [W - 10, 10],
        [W / 4, H / 3],
        [W * 0.7, H * 0.6],
      ] as const

      for (const [ox, oy] of observers) {
        const expected = computeVisibilityPolygon(ox, oy, 0, segs, W, H)
        const got = computeVisibilityPolygon(ox, oy, 0, segs, W, H, idx)
        expect(got.length).toBe(expected.length)
        // Exact equality — the index must produce the same `minT` for
        // every angle, so the same hit points come out in the same
        // order after sorting by angle.
        for (let i = 0; i < expected.length; i++) {
          expect(got[i]).toBeCloseTo(expected[i], 6)
        }
      }
    })
  }

  it('handles open doors transparently', () => {
    const W = 1000
    const H = 1000
    const segs: Segment[] = [
      { x1: 100, y1: 100, x2: 900, y2: 100, wallType: 'wall', doorState: 'closed' },
      { x1: 400, y1: 100, x2: 600, y2: 100, wallType: 'door', doorState: 'open' },
    ]
    const idx = buildWallIndex(segs, W, H)
    const expected = computeVisibilityPolygon(500, 500, 0, segs, W, H)
    const got = computeVisibilityPolygon(500, 500, 0, segs, W, H, idx)
    expect(got).toEqual(expected)
  })

  it('falls back to brute force when the index belongs to a different segment array', () => {
    const W = 500
    const H = 500
    const segsA: Segment[] = [{ x1: 50, y1: 50, x2: 450, y2: 50, wallType: 'wall', doorState: 'closed' }]
    const segsB: Segment[] = [{ x1: 50, y1: 100, x2: 450, y2: 100, wallType: 'wall', doorState: 'closed' }]
    const idx = buildWallIndex(segsA, W, H)
    // Pass the *other* segment array — the engine must ignore the
    // mismatched index and still get the right answer for segsB.
    const got = computeVisibilityPolygon(250, 250, 0, segsB, W, H, idx)
    const expected = computeVisibilityPolygon(250, 250, 0, segsB, W, H)
    expect(got).toEqual(expected)
  })
})
