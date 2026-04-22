import { registerUndoAction } from '../stores/undoStore'
import { useTokenStore } from '../stores/tokenStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useUIStore } from '../stores/uiStore'
import type { TokenRecord } from '@shared/ipc-types'

function broadcastTokens(tokens: TokenRecord[]) {
  if (useUIStore.getState().sessionMode === 'prep') return
  const visible = tokens
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
  window.electronAPI?.sendTokenUpdate(visible)
}

// ── token.place ────────────────────────────────────────────────────────────────
// For actions where a token was already created before the undo entry is
// pushed (drag-drop, asset-browser, bestiary spawn). Forward restores;
// backward deletes by the original id.
// ───────────────────────────────────────────────────────────────────────────────
interface TokenPlacePayload {
  token: TokenRecord
}

registerUndoAction<TokenPlacePayload>('token.place', {
  label: (p) => `Place ${p.token.name}`,
  forward: async (payload) => {
    const restored = await window.electronAPI!.tokens.restore(payload.token)
    if (restored) useTokenStore.getState().addToken(restored)
    broadcastTokens(useTokenStore.getState().tokens)
  },
  backward: async (payload) => {
    await window.electronAPI!.tokens.delete(payload.token.id)
    useTokenStore.getState().removeToken(payload.token.id)
    broadcastTokens(useTokenStore.getState().tokens)
  },
})

// ── token.deleteMany ────────────────────────────────────────────────────────────
interface TokenDeleteManyPayload {
  ids: number[]
  tokens: TokenRecord[]
}

registerUndoAction<TokenDeleteManyPayload>('token.deleteMany', {
  label: (p) => `Delete ${p.tokens.length} token${p.tokens.length > 1 ? 's' : ''}`,
  forward: async (payload) => {
    for (const id of payload.ids) {
      useTokenStore.getState().removeToken(id)
    }
    await window.electronAPI!.tokens.deleteMany(payload.ids)
    // Null out initiative entries that pointed at these tokens
    useInitiativeStore.getState().entries.forEach((entry) => {
      if (entry.tokenId != null && payload.ids.includes(entry.tokenId)) {
        useInitiativeStore.getState().updateEntry(entry.id, { tokenId: null })
      }
    })
    broadcastTokens(useTokenStore.getState().tokens)
  },
  backward: async (payload) => {
    const restored = await window.electronAPI!.tokens.restoreMany(payload.tokens)
    for (const token of restored) {
      useTokenStore.getState().addToken(token)
    }
    broadcastTokens(useTokenStore.getState().tokens)
  },
})

// ── token.updateFields ─────────────────────────────────────────────────────────
interface TokenUpdatePayload {
  id: number
  oldValues: Partial<TokenRecord>
  newValues: Partial<TokenRecord>
}

registerUndoAction<TokenUpdatePayload>('token.updateFields', {
  label: (p) => `Token ${Object.keys(p.newValues).join(', ')}`,
  forward: async (payload) => {
    useTokenStore.getState().updateToken(payload.id, payload.newValues)
    await window.electronAPI!.tokens.update(payload.id, payload.newValues)
    broadcastTokens(useTokenStore.getState().tokens)
  },
  backward: async (payload) => {
    useTokenStore.getState().updateToken(payload.id, payload.oldValues)
    await window.electronAPI!.tokens.update(payload.id, payload.oldValues)
    broadcastTokens(useTokenStore.getState().tokens)
  },
})

// ── token.rename ───────────────────────────────────────────────────────────────
interface TokenRenamePayload {
  id: number
  oldName: string
  newName: string
  linkedEntries: Array<{ id: number; oldName: string; newName: string }>
}

registerUndoAction<TokenRenamePayload>('token.rename', {
  label: 'Rename token',
  forward: async (payload) => {
    useTokenStore.getState().updateToken(payload.id, { name: payload.newName })
    await window.electronAPI!.tokens.update(payload.id, { name: payload.newName })
    for (const e of payload.linkedEntries) {
      useInitiativeStore.getState().updateEntry(e.id, { combatantName: e.newName })
    }
    if (payload.linkedEntries.length > 0) {
      await window.electronAPI!.initiative.updateMany(
        payload.linkedEntries.map((e) => ({ id: e.id, patch: { combatantName: e.newName } })),
      )
    }
    broadcastTokens(useTokenStore.getState().tokens)
  },
  backward: async (payload) => {
    useTokenStore.getState().updateToken(payload.id, { name: payload.oldName })
    await window.electronAPI!.tokens.update(payload.id, { name: payload.oldName })
    for (const e of payload.linkedEntries) {
      useInitiativeStore.getState().updateEntry(e.id, { combatantName: e.oldName })
    }
    if (payload.linkedEntries.length > 0) {
      await window.electronAPI!.initiative.updateMany(
        payload.linkedEntries.map((e) => ({ id: e.id, patch: { combatantName: e.oldName } })),
      )
    }
    broadcastTokens(useTokenStore.getState().tokens)
  },
})
