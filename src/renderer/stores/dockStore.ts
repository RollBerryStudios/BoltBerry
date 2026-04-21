import { create } from 'zustand'

/**
 * Dock display preferences — split out of `uiStore` as an AP-3
 * proof-of-pattern per the code audit. The v1 "conservative dock"
 * toggles (labels on/off, auto-hide on/off) are a bounded concern
 * that:
 *   - only 4 renderer components consume
 *   - doesn't cross-couple with any other slice of uiStore
 *   - persists to localStorage under its own key space
 *
 * Keeping it as its own store lets those components subscribe
 * narrowly (no change notification when, say, the active tool
 * changes) and makes the uiStore modestly less crowded.
 */

interface DockState {
  dockLabels: boolean
  dockAutoHide: boolean

  toggleDockLabels: () => void
  toggleDockAutoHide: () => void
}

export const useDockStore = create<DockState>((set) => ({
  dockLabels: (() => {
    try { return localStorage.getItem('boltberry-dock-labels') === 'true' } catch { return false }
  })(),
  dockAutoHide: (() => {
    try { return localStorage.getItem('boltberry-dock-auto-hide') === 'true' } catch { return false }
  })(),

  toggleDockLabels: () =>
    set((s) => {
      const next = !s.dockLabels
      try { localStorage.setItem('boltberry-dock-labels', String(next)) } catch { /* noop */ }
      return { dockLabels: next }
    }),
  toggleDockAutoHide: () =>
    set((s) => {
      const next = !s.dockAutoHide
      try { localStorage.setItem('boltberry-dock-auto-hide', String(next)) } catch { /* noop */ }
      return { dockAutoHide: next }
    }),
}))
