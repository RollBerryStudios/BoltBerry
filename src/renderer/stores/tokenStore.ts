import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { TokenRecord } from '@shared/ipc-types'
import { useUIStore } from './uiStore'

interface TokenState {
  tokens: TokenRecord[]

  // History for undo (last 20 position snapshots)
  positionHistory: Array<Array<Pick<TokenRecord, 'id' | 'x' | 'y'>>>

  // Actions
  setTokens: (tokens: TokenRecord[]) => void
  addToken: (token: TokenRecord) => void
  updateToken: (id: number, patch: Partial<TokenRecord>) => void
  removeToken: (id: number) => void
  moveToken: (id: number, x: number, y: number) => void
  undoLastMove: () => void
}

export const useTokenStore = create<TokenState>()(
  immer((set) => ({
    tokens: [],
    positionHistory: [],

    setTokens: (tokens) =>
      set((s) => {
        s.tokens = tokens
      }),

    addToken: (token) =>
      set((s) => {
        s.tokens.push(token)
      }),

    updateToken: (id, patch) =>
      set((s) => {
        const t = s.tokens.find((t) => t.id === id)
        if (t) Object.assign(t, patch)
      }),

    removeToken: (id) =>
      set((s) => {
        s.tokens = s.tokens.filter((t) => t.id !== id)
      }),

    moveToken: (id, x, y) =>
      set((s) => {
        // Save snapshot before move
        const snapshot = s.tokens.map((t) => ({ id: t.id, x: t.x, y: t.y }))
        s.positionHistory = [...s.positionHistory.slice(-19), snapshot]

        const t = s.tokens.find((t) => t.id === id)
        if (t) {
          t.x = x
          t.y = y
        }
      }),

    undoLastMove: () => {
      const snapshot = useTokenStore.getState().positionHistory
      if (snapshot.length === 0) return
      const prev = snapshot[snapshot.length - 1]
      set((s) => {
        s.positionHistory = s.positionHistory.slice(0, -1)
        prev.forEach(({ id, x, y }) => {
          const t = s.tokens.find((t) => t.id === id)
          if (t) { t.x = x; t.y = y }
        })
      })
      prev.forEach(({ id, x, y }) => {
        window.electronAPI?.dbRun('UPDATE tokens SET x = ?, y = ? WHERE id = ?', [x, y, id])
      })
      broadcastTokens(useTokenStore.getState().tokens)
    },
  }))
)

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
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}
