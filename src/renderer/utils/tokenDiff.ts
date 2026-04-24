import type { PlayerTokenState } from '@shared/ipc-types'

/**
 * Pure token-diff helper for the future per-token delta IPC protocol
 * (audit #54 / #55). Takes the previous and current snapshots of
 * player-visible tokens (keyed by id) and returns the minimum set of
 * `upsert` / `remove` operations needed to reconcile the two on the
 * player side.
 *
 * Kept pure + framework-free so it can be unit-tested without mocking
 * Zustand or Konva, and so the IPC layer (main process) can import it
 * symmetrically once the delta protocol lands.
 */
export interface TokenDiff {
  upsert: PlayerTokenState[]
  remove: number[]
}

/**
 * Shallow-compares every enumerable field of two `PlayerTokenState`
 * snapshots for the same token id. Arrays are compared element-wise;
 * objects are JSON-compared (status effects are the only nested object
 * shape, and they're always small).
 */
function tokensEqual(a: PlayerTokenState, b: PlayerTokenState): boolean {
  const ar = a as unknown as Record<string, unknown>
  const br = b as unknown as Record<string, unknown>
  const keys = new Set([...Object.keys(ar), ...Object.keys(br)])
  for (const k of keys) {
    const av = ar[k]
    const bv = br[k]
    if (av === bv) continue
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false
      continue
    }
    // Fallback for nested objects or mixed types.
    if (JSON.stringify(av) === JSON.stringify(bv)) continue
    return false
  }
  return true
}

/**
 * Build the delta between `prev` and `next`. `prev` may be empty for
 * the very first broadcast, in which case every current token appears
 * in `upsert` and `remove` stays empty.
 */
export function diffTokens(
  prev: readonly PlayerTokenState[],
  next: readonly PlayerTokenState[],
): TokenDiff {
  const prevMap = new Map<number, PlayerTokenState>()
  for (const t of prev) prevMap.set(t.id, t)

  const upsert: PlayerTokenState[] = []
  const seen = new Set<number>()
  for (const t of next) {
    seen.add(t.id)
    const previous = prevMap.get(t.id)
    if (!previous || !tokensEqual(previous, t)) {
      upsert.push(t)
    }
  }

  const remove: number[] = []
  for (const t of prev) {
    if (!seen.has(t.id)) remove.push(t.id)
  }

  return { upsert, remove }
}

/**
 * Convenience: are both sides already in sync? Use to skip IPC entirely
 * when nothing has changed (e.g. a UI-only re-render).
 */
export function isNoOpDiff(diff: TokenDiff): boolean {
  return diff.upsert.length === 0 && diff.remove.length === 0
}
