/**
 * Canvas pool keyed on `${width}x${height}`. Callers `acquire` a
 * cleared canvas of the requested dimensions; `release` returns it to
 * the pool for the next caller.
 *
 * Motivation (audit #71): FogLayer recreates four canvases on every
 * map change — explored, covered, playerPreview, tintedCovered — at
 * up to 2048×2048 each (16 MiB of pixel storage per canvas). Rapid
 * map-hopping during prep produced noticeable GC pressure and
 * blob-URL churn. The pool keeps a bounded set of off-screen canvases
 * alive so the common "flip back to the last map" path reuses an
 * existing bitmap instead of allocating a fresh one.
 *
 * Intentionally coarse:
 *  - Pool size is capped so we don't accumulate canvases for every
 *    map visited in a session.
 *  - Size is keyed on the canvas dimensions, not the content — the
 *    caller is responsible for repainting the canvas after acquire.
 *    We do wipe the bitmap via `clearRect` before handing it out so
 *    stale pixels from a previous map can't bleed into the new one.
 *  - Non-pooled (already-live) canvases handed to `release` without a
 *    matching `acquire` are fine — we simply add them to the pool.
 */

const MAX_POOL_ENTRIES = 8

const pool: HTMLCanvasElement[] = []

export function acquireCanvas(width: number, height: number): HTMLCanvasElement {
  const match = pool.findIndex((c) => c.width === width && c.height === height)
  let canvas: HTMLCanvasElement
  if (match >= 0) {
    canvas = pool.splice(match, 1)[0]
  } else {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
  }
  // Always hand out a blank bitmap regardless of pool hit / miss.
  const ctx = canvas.getContext('2d')
  ctx?.clearRect(0, 0, canvas.width, canvas.height)
  return canvas
}

export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return
  // Evict the oldest entry if the pool is full — it keeps us bounded
  // regardless of how many distinct map sizes the DM has visited.
  if (pool.length >= MAX_POOL_ENTRIES) {
    const evicted = pool.shift()
    if (evicted) {
      evicted.width = 0
      evicted.height = 0
    }
  }
  pool.push(canvas)
}

/** Test / shutdown hook: drops every pooled canvas. */
export function clearCanvasPool(): void {
  while (pool.length > 0) {
    const c = pool.pop()
    if (c) {
      c.width = 0
      c.height = 0
    }
  }
}

/** Introspection for tests. Not part of the production API. */
export function __poolSizeForTest(): number {
  return pool.length
}
