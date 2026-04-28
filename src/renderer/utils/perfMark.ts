/**
 * Lightweight perf instrumentation. Wraps `performance.mark` /
 * `performance.measure` so hot-path code can be timed without paying a
 * cost in production builds.
 *
 * Enabled when `import.meta.env.DEV` is true *or* the user toggles the
 * `boltberry:perf` flag (set via DevTools: `localStorage.setItem(
 * 'boltberry:perf', '1')`). Disabled paths reduce to a single property
 * read so the call sites are safe to leave in place.
 *
 * Usage:
 *   const stop = perfStart('los.compute')
 *   ... heavy work ...
 *   stop({ tokenId, lightRadius })
 *
 * Or for a synchronous scope:
 *   perfRun('fog.toBlob', () => canvas.toBlob(...))
 *
 * Each measure is logged to the Performance timeline (visible in
 * Chrome DevTools → Performance → User Timing) and, when `boltberry:
 * perf-log` is set, also `console.debug`-ed for quick inspection.
 *
 * BB-Phase 5: F-03, F-05, F-06, F-09 require these timings. Keep the
 * helper minimal so adding a measurement is one line at the call site.
 */

const ENABLED = (() => {
  try {
    if (typeof window === 'undefined') return false
    if (
      typeof import.meta !== 'undefined' &&
      typeof (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env !== 'undefined' &&
      (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
    ) {
      return true
    }
    return window.localStorage?.getItem('boltberry:perf') === '1'
  } catch {
    return false
  }
})()

const LOG_TO_CONSOLE = (() => {
  try {
    return ENABLED && window.localStorage?.getItem('boltberry:perf-log') === '1'
  } catch {
    return false
  }
})()

let counter = 0

// Shared no-op stop fn so the disabled path doesn't allocate per call —
// `computeVisibilityPolygon` runs ~120k times/sec on heavy maps, so even
// a single closure allocation matters here.
const NOOP_STOP = (): null => null

/**
 * Begin a measurement. Returns a function that stops it; the returned
 * `Measure` carries the elapsed milliseconds. When perf is disabled the
 * stop fn is a shared no-op returning `null` (zero allocation).
 */
export function perfStart(
  name: string,
): (detail?: Record<string, unknown>) => { name: string; durationMs: number } | null {
  if (!ENABLED || typeof performance === 'undefined') {
    return NOOP_STOP
  }
  const id = `${name}#${++counter}`
  const startMark = `${id}:start`
  performance.mark(startMark)
  return (detail) => {
    const endMark = `${id}:end`
    performance.mark(endMark)
    try {
      const measure = performance.measure(name, startMark, endMark)
      const durationMs = measure.duration
      if (LOG_TO_CONSOLE) {
        console.debug(`[perf] ${name} ${durationMs.toFixed(2)}ms`, detail ?? '')
      }
      // Free up the marks so we don't leak a quadratic number in long
      // sessions. The measure stays on the timeline.
      performance.clearMarks(startMark)
      performance.clearMarks(endMark)
      return { name, durationMs }
    } catch {
      return null
    }
  }
}

/** Run `fn` inside a perfStart/stop wrapper. Convenience for one-shots. */
export function perfRun<T>(name: string, fn: () => T, detail?: Record<string, unknown>): T {
  const stop = perfStart(name)
  try {
    return fn()
  } finally {
    stop(detail)
  }
}

/** Async variant. */
export async function perfRunAsync<T>(
  name: string,
  fn: () => Promise<T>,
  detail?: Record<string, unknown>,
): Promise<T> {
  const stop = perfStart(name)
  try {
    return await fn()
  } finally {
    stop(detail)
  }
}

export const perfEnabled = ENABLED
