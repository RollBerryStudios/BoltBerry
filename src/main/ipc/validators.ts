import path from 'path'

/**
 * Shared IPC input validators. Every renderer-originated handler is an
 * attack surface: a compromised renderer (or a malicious extension) can
 * send arbitrary payloads. These helpers reject malformed input with a
 * structured `IpcValidationError` so callers can return `{ ok: false }`
 * to the renderer and surface the reason in a toast.
 */

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IpcValidationError'
  }
}

export interface IntOptions {
  min?: number
  max?: number
}

export function coerceInt(v: unknown, opts: IntOptions = {}): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new IpcValidationError(`Expected integer, got ${typeof v} (${String(v)})`)
  }
  if (opts.min != null && v < opts.min) {
    throw new IpcValidationError(`Value ${v} below minimum ${opts.min}`)
  }
  if (opts.max != null && v > opts.max) {
    throw new IpcValidationError(`Value ${v} above maximum ${opts.max}`)
  }
  return v
}

export function coerceOptionalInt(v: unknown, opts: IntOptions = {}): number | null {
  if (v == null) return null
  return coerceInt(v, opts)
}

/**
 * Accepts `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` and common CSS rgba()
 * forms. Rejects `javascript:`, `data:`, overlong strings, or anything
 * that could be interpreted as a URL / expression if reflected into an
 * inline style without escaping.
 */
const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGBA_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/

export function coerceColor(v: unknown): string {
  if (typeof v !== 'string') {
    throw new IpcValidationError(`Expected color string, got ${typeof v}`)
  }
  if (v.length > 32) {
    throw new IpcValidationError(`Color string too long (${v.length} chars)`)
  }
  if (!HEX_RE.test(v) && !RGBA_RE.test(v)) {
    throw new IpcValidationError(`Invalid color format: ${v}`)
  }
  return v
}

export function coerceOptionalColor(v: unknown): string | null {
  if (v == null) return null
  return coerceColor(v)
}

/**
 * Ensures `candidate` resolves inside `root`. Protects readFile / unlink
 * handlers from arguments like `"../etc/passwd"` smuggled in from the
 * renderer.
 */
export function assertWithinRoot(candidate: string, root: string): string {
  const resolvedCandidate = path.resolve(candidate)
  const resolvedRoot = path.resolve(root)
  const rel = path.relative(resolvedRoot, resolvedCandidate)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new IpcValidationError(
      `Path escapes allowed root: ${candidate}`,
    )
  }
  return resolvedCandidate
}

/** Maximum accepted size for fog bitmap data URLs (~8 MiB base64). */
export const MAX_FOG_BITMAP_BYTES = 8 * 1024 * 1024

export function assertValidFogDataUrl(v: unknown, label: string): string | null {
  if (v == null) return null
  if (typeof v !== 'string') {
    throw new IpcValidationError(`${label}: expected data URL string`)
  }
  if (v.length > MAX_FOG_BITMAP_BYTES) {
    throw new IpcValidationError(
      `${label}: data URL exceeds ${MAX_FOG_BITMAP_BYTES} bytes (got ${v.length})`,
    )
  }
  if (!v.startsWith('data:image/png;base64,')) {
    throw new IpcValidationError(`${label}: must be a PNG data URL`)
  }
  return v
}
