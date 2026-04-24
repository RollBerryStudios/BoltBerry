import type { PlayerTokenState, TokenRecord } from '@shared/ipc-types'
import { diffTokens, isNoOpDiff } from './tokenDiff'
import { useSessionStore } from '../stores/sessionStore'

/**
 * Broadcast helper that diffs against the last snapshot and pushes
 * only the changed / removed tokens to the player window.
 *
 * Replaces the pair of duplicated `broadcastTokens` functions in
 * `TokenLayer.tsx` and `actions/tokenActions.ts`. Each call site used
 * to filter + map the entire visible-to-players list and ship the
 * whole roster; with this helper a single HP change serialises exactly
 * one token instead of all of them (audit #54 / #55).
 *
 * The helper keeps one module-local snapshot cache. Callers that know
 * the snapshot is stale (initial sync, map switch, player window
 * (re)connect) should call {@link resetTokenBroadcastSnapshot} before
 * the next broadcast so the delta computation starts from an empty
 * baseline.
 *
 * During prep mode nothing is sent — matching the previous behaviour.
 */

let lastSnapshot: PlayerTokenState[] = []

export function resetTokenBroadcastSnapshot(): void {
  lastSnapshot = []
}

export function toPlayerTokenStates(tokens: readonly TokenRecord[]): PlayerTokenState[] {
  return tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) => ({
      id: t.id,
      name: t.name,
      imagePath: t.imagePath,
      x: t.x,
      y: t.y,
      size: t.size,
      hpCurrent: t.hpCurrent,
      hpMax: t.hpMax,
      showName: t.showName,
      rotation: t.rotation,
      markerColor: t.markerColor,
      statusEffects: t.statusEffects,
      ac: t.ac,
      faction: t.faction,
      lightRadius: t.lightRadius,
      lightColor: t.lightColor,
    }))
}

/**
 * Compute the diff against the last broadcast and send it as a
 * `PLAYER_TOKEN_DELTA`. A no-op diff skips the IPC call entirely so
 * unrelated mutations don't trigger a main-process round-trip.
 */
export function broadcastTokens(tokens: readonly TokenRecord[]): void {
  if (useSessionStore.getState().sessionMode === 'prep') {
    // Stale snapshot — the next time we enter session mode we'll ship
    // every visible token as a fresh baseline via
    // `broadcastTokensSnapshot`.
    lastSnapshot = []
    return
  }

  const next = toPlayerTokenStates(tokens)
  const diff = diffTokens(lastSnapshot, next)
  lastSnapshot = next

  if (isNoOpDiff(diff)) return
  window.electronAPI?.sendTokenDelta(diff)
}

/**
 * Force a full snapshot broadcast. Used for full-sync / resync paths
 * where the player needs an authoritative list (e.g. first open of
 * the player window, map switch). Also resets the snapshot cache so
 * subsequent delta broadcasts diff against the snapshot we just sent.
 */
export function broadcastTokensSnapshot(tokens: readonly TokenRecord[]): void {
  if (useSessionStore.getState().sessionMode === 'prep') {
    lastSnapshot = []
    return
  }
  const next = toPlayerTokenStates(tokens)
  lastSnapshot = next
  window.electronAPI?.sendTokenUpdate(next)
}
