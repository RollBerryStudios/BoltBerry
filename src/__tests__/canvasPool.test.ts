/**
 * canvasPool.test.ts
 *
 * Verifies the off-screen-canvas pool used by `FogLayer` across map
 * switches. The pool must:
 *
 *  - Hand out a cleared bitmap on every acquire.
 *  - Reuse the same canvas instance when `release` + `acquire` match
 *    on `${w}x${h}`.
 *  - Evict in FIFO order when capped, so a long-running session can't
 *    accumulate canvases for every map size the DM has ever opened.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  acquireCanvas,
  releaseCanvas,
  clearCanvasPool,
  __poolSizeForTest,
} from '../renderer/utils/canvasPool'

beforeEach(() => {
  clearCanvasPool()
})

describe('canvasPool', () => {
  it('acquire on an empty pool creates a fresh canvas', () => {
    const c = acquireCanvas(256, 128)
    expect(c.width).toBe(256)
    expect(c.height).toBe(128)
    expect(__poolSizeForTest()).toBe(0)
  })

  it('release pushes the canvas into the pool', () => {
    const c = acquireCanvas(100, 100)
    releaseCanvas(c)
    expect(__poolSizeForTest()).toBe(1)
  })

  it('acquire returns the previously released canvas when sizes match', () => {
    const a = acquireCanvas(128, 256)
    releaseCanvas(a)
    const b = acquireCanvas(128, 256)
    expect(b).toBe(a)
    expect(__poolSizeForTest()).toBe(0)
  })

  it('size mismatch allocates fresh without disturbing the pool entry', () => {
    const a = acquireCanvas(128, 256)
    releaseCanvas(a)
    const b = acquireCanvas(64, 64)
    expect(b).not.toBe(a)
    expect(__poolSizeForTest()).toBe(1)
  })

  it('handed-out canvas is cleared before the caller sees it', () => {
    const c = acquireCanvas(4, 4)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 4, 4)
    releaseCanvas(c)
    const reused = acquireCanvas(4, 4)
    expect(reused).toBe(c)
    const data = reused.getContext('2d')!.getImageData(0, 0, 4, 4).data
    // First pixel's alpha channel should be 0 again.
    expect(data[3]).toBe(0)
  })

  it('caps pool size at 8 and evicts FIFO', () => {
    const canvases: HTMLCanvasElement[] = []
    for (let i = 0; i < 10; i++) {
      const c = acquireCanvas(10 + i, 10 + i)
      canvases.push(c)
      releaseCanvas(c)
    }
    // Pool caps at 8; the two oldest are evicted.
    expect(__poolSizeForTest()).toBe(8)
  })

  it('null / undefined release is a no-op', () => {
    releaseCanvas(null)
    releaseCanvas(undefined)
    expect(__poolSizeForTest()).toBe(0)
  })
})
