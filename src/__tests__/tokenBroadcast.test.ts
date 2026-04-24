/**
 * tokenBroadcast.test.ts
 *
 * Verifies the DM-side broadcast helper that sits on top of `tokenDiff`:
 *
 *  - No-op broadcasts (unchanged snapshot) skip the IPC call entirely.
 *  - A single HP / position change serialises just the changed token.
 *  - `prep` session mode never ships anything.
 *  - `resetTokenBroadcastSnapshot` makes the next broadcast ship a
 *    fresh baseline (equivalent to a first-time upsert).
 *
 * The helper relies on `window.electronAPI.sendTokenDelta`; the test
 * stubs that plus the session store's `sessionMode` getter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TokenRecord } from '../shared/ipc-types'
import {
  broadcastTokens,
  resetTokenBroadcastSnapshot,
} from '../renderer/utils/tokenBroadcast'
import { useSessionStore } from '../renderer/stores/sessionStore'

function tok(id: number, over: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id,
    mapId: 1,
    name: `Token ${id}`,
    imagePath: null,
    x: 0,
    y: 0,
    size: 1,
    hpCurrent: 10,
    hpMax: 10,
    visibleToPlayers: true,
    rotation: 0,
    locked: false,
    zIndex: 0,
    markerColor: null,
    ac: null,
    notes: null,
    statusEffects: null,
    faction: 'party',
    showName: true,
    lightRadius: 0,
    lightColor: '#ffcc44',
    ...over,
  }
}

describe('broadcastTokens', () => {
  const sendTokenDelta = vi.fn()
  const sendTokenUpdate = vi.fn()

  beforeEach(() => {
    sendTokenDelta.mockReset()
    sendTokenUpdate.mockReset()
    ;(globalThis as any).window = {
      electronAPI: { sendTokenDelta, sendTokenUpdate },
    }
    useSessionStore.setState({ sessionMode: 'session' })
    resetTokenBroadcastSnapshot()
  })

  it('first broadcast ships every visible token as an upsert', () => {
    broadcastTokens([tok(1), tok(2)])
    expect(sendTokenDelta).toHaveBeenCalledTimes(1)
    const delta = sendTokenDelta.mock.calls[0][0]
    expect(delta.upsert).toHaveLength(2)
    expect(delta.remove).toEqual([])
  })

  it('repeated broadcast with no changes is a no-op', () => {
    broadcastTokens([tok(1), tok(2)])
    sendTokenDelta.mockReset()
    broadcastTokens([tok(1), tok(2)])
    expect(sendTokenDelta).not.toHaveBeenCalled()
  })

  it('a single position change ships just the moved token', () => {
    broadcastTokens([tok(1, { x: 0 }), tok(2, { x: 10 })])
    sendTokenDelta.mockReset()
    broadcastTokens([tok(1, { x: 5 }), tok(2, { x: 10 })])
    expect(sendTokenDelta).toHaveBeenCalledTimes(1)
    const delta = sendTokenDelta.mock.calls[0][0]
    expect(delta.upsert).toHaveLength(1)
    expect(delta.upsert[0].id).toBe(1)
    expect(delta.upsert[0].x).toBe(5)
    expect(delta.remove).toEqual([])
  })

  it('removing a visibleToPlayers token emits a remove', () => {
    broadcastTokens([tok(1), tok(2)])
    sendTokenDelta.mockReset()
    broadcastTokens([tok(1)])
    expect(sendTokenDelta).toHaveBeenCalledTimes(1)
    const delta = sendTokenDelta.mock.calls[0][0]
    expect(delta.upsert).toEqual([])
    expect(delta.remove).toEqual([2])
  })

  it('flipping visibleToPlayers off emits a remove', () => {
    broadcastTokens([tok(1), tok(2)])
    sendTokenDelta.mockReset()
    broadcastTokens([tok(1), tok(2, { visibleToPlayers: false })])
    const delta = sendTokenDelta.mock.calls[0][0]
    expect(delta.remove).toEqual([2])
    expect(delta.upsert).toEqual([])
  })

  it('prep mode skips the IPC entirely', () => {
    useSessionStore.setState({ sessionMode: 'prep' })
    broadcastTokens([tok(1)])
    expect(sendTokenDelta).not.toHaveBeenCalled()
  })

  it('resetTokenBroadcastSnapshot forces the next broadcast to be a full upsert', () => {
    broadcastTokens([tok(1), tok(2)])
    sendTokenDelta.mockReset()
    resetTokenBroadcastSnapshot()
    broadcastTokens([tok(1), tok(2)])
    const delta = sendTokenDelta.mock.calls[0][0]
    expect(delta.upsert).toHaveLength(2)
  })

  it('prep→session transition rebaselines on the next broadcast', () => {
    broadcastTokens([tok(1), tok(2)])
    sendTokenDelta.mockReset()
    useSessionStore.setState({ sessionMode: 'prep' })
    broadcastTokens([tok(1, { x: 99 })]) // skipped
    useSessionStore.setState({ sessionMode: 'session' })
    broadcastTokens([tok(1, { x: 99 })])
    const delta = sendTokenDelta.mock.calls[0][0]
    // Snapshot was wiped when we entered prep, so this looks like a
    // first broadcast — token 1 shows as an upsert.
    expect(delta.upsert.map((t: any) => t.id)).toEqual([1])
    expect(delta.remove).toEqual([])
  })
})
