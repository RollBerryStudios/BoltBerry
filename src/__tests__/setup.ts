/**
 * Global test setup — mocks browser APIs that audioStore and other renderer
 * modules reference at module-init time (not just inside React components).
 * Loaded by vitest via setupFiles before any test file runs.
 */

// ─── HTMLAudioElement mock ────────────────────────────────────────────────────

class MockAudio {
  src = ''
  volume = 1
  loop = false
  currentTime = 0
  duration = 0
  paused = true

  ontimeupdate: (() => void) | null = null
  onloadedmetadata: (() => void) | null = null
  onended: (() => void) | null = null
  onerror: (() => void) | null = null

  private _listeners: Record<string, Array<(...args: unknown[]) => unknown>> = {}

  addEventListener(event: string, fn: (...args: unknown[]) => unknown, _opts?: unknown): void {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(fn)
  }

  removeEventListener(event: string, fn: (...args: unknown[]) => unknown): void {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter((f) => f !== fn)
  }

  // Simulate firing an event (used in tests)
  _emit(event: string, ...args: unknown[]): void {
    this._listeners[event]?.forEach((fn) => fn(...args))
  }

  async play(): Promise<void> {
    this.paused = false
  }

  pause(): void {
    this.paused = true
  }

  load(): void {
    // no-op
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).Audio = MockAudio

// ─── requestAnimationFrame / cancelAnimationFrame mocks ──────────────────────
// audioStore's fadeTo() uses rAF; call callbacks synchronously in tests.

let rafId = 0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).requestAnimationFrame = (cb: (time: number) => void): number => {
  cb(performance.now())
  return ++rafId
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).cancelAnimationFrame = (_id: number): void => {
  // no-op — synchronous rAF mock doesn't queue anything
}

// ─── performance.now ─────────────────────────────────────────────────────────
// Node 16+ has globalThis.performance, but guard anyway.
if (typeof performance === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).performance = { now: () => Date.now() }
}
