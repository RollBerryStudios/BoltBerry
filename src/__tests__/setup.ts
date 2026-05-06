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
(global as any).Audio = MockAudio

// ─── requestAnimationFrame / cancelAnimationFrame mocks ──────────────────────
// audioStore's fadeTo() uses rAF; call callbacks synchronously in tests.

let rafId = 0
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).requestAnimationFrame = (cb: (time: number) => void): number => {
  // Advance timestamp well past FADE_MS (300 ms) so fadeTo() resolves in a single
  // tick and does not recurse back into requestAnimationFrame.
  cb(performance.now() + 1000)
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
  (global as any).performance = { now: () => Date.now() }
}

// ─── minimal `document.createElement('canvas')` stub ─────────────────────────
// Used by canvasPool tests. Vitest runs under node (no jsdom), so we fake
// only the surface those tests touch: width/height fields plus a
// no-op-but-observable 2D context that supports fillStyle/fillRect/
// clearRect/getImageData. Anything richer belongs in a real browser test.
class MockCanvas {
  width = 0
  height = 0
  private _pixels: Uint8ClampedArray | null = null
  getContext(type: string): unknown {
    if (type !== '2d') return null
    // Arrow functions below preserve `this` from `getContext`, so we can
    // reach instance fields directly without the `self = this` alias
    // that the eslint `@typescript-eslint/no-this-alias` rule rejects.
    const getBuffer = () => {
      const size = Math.max(0, this.width) * Math.max(0, this.height) * 4
      if (!this._pixels || this._pixels.length !== size) {
        this._pixels = new Uint8ClampedArray(size)
      }
      return this._pixels
    }
    let fillStyle = '#000000'
    return {
      get fillStyle() { return fillStyle },
      set fillStyle(v: string) { fillStyle = v },
      globalCompositeOperation: 'source-over',
      clearRect() {
        const buf = getBuffer()
        buf.fill(0)
      },
      fillRect() {
        /* no-op: exact pixel writes aren't needed by the pool tests */
      },
      drawImage() { /* no-op */ },
      getImageData(_x: number, _y: number, w: number, h: number) {
        const full = getBuffer()
        const subset = new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4)
        subset.set(full.subarray(0, subset.length))
        return { data: subset, width: w, height: h }
      },
    }
  }
}

if (typeof document === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') return new MockCanvas()
      throw new Error(`document.createElement stub: '${tag}' not implemented`)
    },
  }
}
