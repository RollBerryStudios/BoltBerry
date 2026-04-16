import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { TokenRecord } from '@shared/ipc-types'

interface TokenState {
  tokens: TokenRecord[]
  /** Tokens copied via Ctrl+C / context-menu copy — shared across TokenLayer and keyboard shortcuts */
  clipboardTokens: TokenRecord[]

  // Actions
  setTokens: (tokens: TokenRecord[]) => void
  addToken: (token: TokenRecord) => void
  updateToken: (id: number, patch: Partial<TokenRecord>) => void
  removeToken: (id: number) => void
  moveToken: (id: number, x: number, y: number) => void
  setClipboardTokens: (tokens: TokenRecord[]) => void
}

export const useTokenStore = create<TokenState>()(
  immer((set) => ({
    tokens: [],
    clipboardTokens: [],

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
        const t = s.tokens.find((t) => t.id === id)
        if (t) {
          t.x = x
          t.y = y
        }
      }),

    setClipboardTokens: (tokens) =>
      set((s) => {
        s.clipboardTokens = tokens
      }),
  }))
)
