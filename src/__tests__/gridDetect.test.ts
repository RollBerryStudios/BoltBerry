/**
 * Unit tests for the pure helpers introduced in the grid-detection
 * rewrite (audit-pass #2). The full `detectGrid()` pipeline needs a
 * DOM + canvas, which the node-env vitest setup doesn't provide, so we
 * cover the two new pure functions that carry the improved logic:
 *
 *   - findTopPeaks: picks local maxima respecting a minimum separation
 *     (the "top-3 candidate" step that replaced the naive single argmax)
 *   - harmonicBonus: rewards candidate lags whose 2× / 3× multiples
 *     also show autocorrelation peaks — the whole point of distinguishing
 *     real grid periodicity from single-shot artefacts.
 */

import { describe, it, expect } from 'vitest'
import { findTopPeaks, harmonicBonus } from '../renderer/utils/gridDetect'

describe('gridDetect.findTopPeaks', () => {
  it('returns peaks sorted by descending value', () => {
    // Three distinct peaks at lags 10, 20, 30 with values 3, 9, 5.
    const signal = new Float64Array(40)
    signal[10] = 3
    signal[20] = 9
    signal[30] = 5
    const peaks = findTopPeaks(signal, 5, 40, 3, 2)
    expect(peaks.map((p) => p.lag)).toEqual([20, 30, 10])
    expect(peaks[0].value).toBe(9)
  })

  it('enforces the separation constraint', () => {
    // Two adjacent peaks at lag 10 and lag 11 — with separation 3 only
    // the taller one should be picked.
    const signal = new Float64Array(30)
    signal[10] = 4
    signal[11] = 5
    signal[20] = 3
    const peaks = findTopPeaks(signal, 5, 30, 3, 3)
    expect(peaks.map((p) => p.lag)).toEqual([11, 20])
  })

  it('respects minLag / maxLag bounds', () => {
    const signal = new Float64Array(50)
    signal[3] = 100   // below minLag — should be ignored
    signal[15] = 7
    signal[45] = 100  // above maxLag — should be ignored
    const peaks = findTopPeaks(signal, 6, 30, 3, 2)
    expect(peaks.length).toBe(1)
    expect(peaks[0].lag).toBe(15)
  })

  it('skips non-peaks (plateau values)', () => {
    // A plateau at 11..13 all equal to 5 — none of them are strict
    // local maxima so nothing is picked.
    const signal = new Float64Array(20)
    signal[11] = 5
    signal[12] = 5
    signal[13] = 5
    const peaks = findTopPeaks(signal, 5, 20, 3, 2)
    expect(peaks.length).toBe(0)
  })

  it('caps the result at maxPeaks', () => {
    const signal = new Float64Array(60)
    for (let i = 10; i < 50; i += 5) signal[i] = i
    const peaks = findTopPeaks(signal, 5, 60, 2, 4)
    expect(peaks.length).toBe(2)
  })

  it('returns empty array when signal is shorter than minLag (BB-033)', () => {
    // signal.length = 5, minLag = 10 — no valid peak window exists.
    const signal = new Float64Array(5)
    signal[2] = 9
    const peaks = findTopPeaks(signal, 10, 30, 3, 2)
    expect(peaks).toEqual([])
  })

  it('does not throw when signal.length is 0 (BB-033)', () => {
    const signal = new Float64Array(0)
    expect(() => findTopPeaks(signal, 5, 20, 3, 2)).not.toThrow()
    expect(findTopPeaks(signal, 5, 20, 3, 2)).toEqual([])
  })
})

describe('gridDetect.harmonicBonus', () => {
  it('returns high bonus when 2× and 3× lags both have strong peaks', () => {
    // Candidate at lag 10, harmonics at 20 and 30 with full-strength
    // matches → bonus close to 1.
    const signal = new Float64Array(100)
    signal[10] = 50
    signal[20] = 40
    signal[30] = 45
    const bonus = harmonicBonus(signal, 10, 50)
    expect(bonus).toBeGreaterThan(0.8)
  })

  it('returns low bonus when harmonics are weak', () => {
    // Strong base, silent harmonics → low bonus.
    const signal = new Float64Array(100)
    signal[10] = 50
    // 20 and 30 left at 0
    const bonus = harmonicBonus(signal, 10, 50)
    expect(bonus).toBeLessThan(0.1)
  })

  it('picks up harmonics even if they drift by a pixel', () => {
    // Real-world: harmonics land at 19 (instead of exact 20) because of
    // fractional grid-size downsampling rounding. The ±2 sample window
    // should still find them.
    const signal = new Float64Array(100)
    signal[10] = 50
    signal[19] = 40      // 2× lag off by one
    signal[31] = 45      // 3× lag off by one
    const bonus = harmonicBonus(signal, 10, 50)
    expect(bonus).toBeGreaterThan(0.7)
  })

  it('returns 0 when baseValue is 0', () => {
    const signal = new Float64Array(40)
    signal[10] = 0
    signal[20] = 5
    expect(harmonicBonus(signal, 10, 0)).toBe(0)
  })

  it('clamps individual harmonic contributions at 1', () => {
    // Harmonic stronger than the base shouldn't inflate the bonus
    // above the sane cap — averaged 2-of-2 maxes at 1.
    const signal = new Float64Array(100)
    signal[10] = 10
    signal[20] = 100    // much stronger than base
    signal[30] = 100    // ditto
    const bonus = harmonicBonus(signal, 10, 10)
    expect(bonus).toBe(1)
  })

  it('does not throw when 2x lag lands at the very last index (BB-033)', () => {
    // 2x lag = 20 = signal.length - 1; the ±2 window would otherwise
    // read signal[20], signal[21], signal[22] — only the first is valid.
    const signal = new Float64Array(21)
    signal[10] = 5
    signal[20] = 4
    expect(() => harmonicBonus(signal, 10, 5)).not.toThrow()
  })

  it('returns 0 on non-positive lag (BB-033)', () => {
    const signal = new Float64Array(40)
    signal[20] = 5
    expect(harmonicBonus(signal, 0, 5)).toBe(0)
    expect(harmonicBonus(signal, -1, 5)).toBe(0)
    expect(harmonicBonus(signal, NaN, 5)).toBe(0)
  })
})
