import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { TokenRecord } from '@shared/ipc-types'

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

    undoLastMove: () =>
      set((s) => {
        const prev = s.positionHistory[s.positionHistory.length - 1]
        if (!prev) return
        s.positionHistory = s.positionHistory.slice(0, -1)
        prev.forEach(({ id, x, y }) => {
          const t = s.tokens.find((t) => t.id === id)
          if (t) { t.x = x; t.y = y }
        })
      }),
  }))
)
