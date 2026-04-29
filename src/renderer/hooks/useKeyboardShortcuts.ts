import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useFogStore } from '../stores/fogStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore, getLastCursorMap } from '../stores/mapTransformStore'
import { showToast } from '../components/shared/Toast'
import { useUndoStore, nextCommandId } from '../stores/undoStore'

// ”€”€ Grid chord state ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
// `G` on its own toggles the grid. `G` followed (within CHORD_WINDOW ms) by
// `+` / `=` grows the grid by 5 px; `-` / `_` shrinks it by 5 px. Any other
// key cancels the chord. Keeping this at module scope rather than inside
// the hook so the window survives across React re-renders.
const CHORD_WINDOW_MS = 900
const GRID_STEP_PX = 5
let gridChordDeadline = 0

async function persistMapGridPatch(patch: Partial<{ gridVisible: boolean; gridSize: number }>) {
  const { activeMapId, activeMaps, setActiveMaps } = useCampaignStore.getState()
  if (!activeMapId) return
  const map = activeMaps.find((m) => m.id === activeMapId)
  if (!map) return
  const next = { ...map, ...patch }
  setActiveMaps(activeMaps.map((m) => (m.id === activeMapId ? next : m)))
  try {
    await window.electronAPI?.maps.patchGridDisplay(activeMapId, patch)
  } catch (err) {
    console.error('[useKeyboardShortcuts] grid patch persist failed:', err)
  }
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target?.isContentEditable) return

      // ”€”€ Player Control Mode — runs first so Ctrl+Arrow never leaks
      // into other handlers when the DM is rotating the player view.
      // Escape exits the mode cleanly. Active only when the toggle is
      // on and we're in the DM workspace, so nothing fights the
      // bestiary / compendium overlays.
      const ui = useUIStore.getState()
      if (ui.playerViewportMode) {
        if (e.key === 'Escape') {
          e.preventDefault()
          ui.setPlayerViewportMode(false)
          return
        }
        if ((e.ctrlKey || e.metaKey) && ui.playerViewport
            && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'
                || e.key === 'ArrowUp'   || e.key === 'ArrowDown')) {
          e.preventDefault()
          const stepDeg = e.shiftKey ? 15 : 5
          const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1
          const next = (ui.playerViewport.rotation + dir * stepDeg + 360) % 360
          ui.patchPlayerViewport({ rotation: next })
          return
        }
      }

      // ── Grid chord: `Shift+G` then `+` / `-` ───────────────────────
      // Runs first so the second keystroke wins over any matching single-key
      // action (e.g. the standalone `-` zoom-out binding below). A bare
      // modifier keydown (Shift on the way to typing Shift+=) is skipped so
      // the chord doesn't self-cancel before the digit/symbol arrives.
      if (performance.now() <= gridChordDeadline && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Meta') {
          gridChordDeadline = 0
          if (e.key === '+' || e.key === '=') {
            e.preventDefault()
            const { activeMapId, activeMaps } = useCampaignStore.getState()
            const map = activeMaps.find((m) => m.id === activeMapId)
            if (map) void persistMapGridPatch({ gridSize: Math.min(400, map.gridSize + GRID_STEP_PX) })
            return
          }
          if (e.key === '-' || e.key === '_') {
            e.preventDefault()
            const { activeMapId, activeMaps } = useCampaignStore.getState()
            const map = activeMaps.find((m) => m.id === activeMapId)
            if (map) void persistMapGridPatch({ gridSize: Math.max(10, map.gridSize - GRID_STEP_PX) })
            return
          }
          // Any other non-modifier key cancels the chord and falls through.
        }
      }

      // ”€”€ Ctrl / Cmd shortcuts ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
      if (e.ctrlKey || e.metaKey) {
        // ”€”€ Ctrl+1-9 — panel switching (sidebar tabs + floating utility panels) ”€
        if (!e.shiftKey && !e.altKey) {
          type PanelTarget =
            | { kind: 'sidebar'; tab: import('../stores/uiStore').SidebarTab }
            | { kind: 'floating'; panel: import('../stores/uiStore').FloatingPanel }
          const PANELS: PanelTarget[] = [
            { kind: 'sidebar',  tab: 'tokens' },
            { kind: 'sidebar',  tab: 'initiative' },
            { kind: 'sidebar',  tab: 'encounters' },
            { kind: 'sidebar',  tab: 'rooms' },
            { kind: 'sidebar',  tab: 'notes' },
            { kind: 'sidebar',  tab: 'handouts' },
            { kind: 'floating', panel: 'overlay' },
            { kind: 'floating', panel: 'audio' },
            { kind: 'floating', panel: 'dice' },
          ]
          const idx = parseInt(e.key) - 1
          if (idx >= 0 && idx < PANELS.length) {
            e.preventDefault()
            const target = PANELS[idx]
            if (target.kind === 'sidebar') {
              useUIStore.getState().setSidebarTab(target.tab)
            } else {
              useUIStore.getState().setFloatingPanel(target.panel)
            }
            return
          }
        }

        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) {
              useUndoStore.getState().redo()
            } else {
              useUndoStore.getState().undo()
            }
            return
          case 'y':
            // Ctrl+Y — redo (Windows convention, alongside Ctrl+Shift+Z)
            e.preventDefault()
            useUndoStore.getState().redo()
            return
          case 's':
            e.preventDefault()
            window.electronAPI?.saveNow()
            return
          case 'p':
            e.preventDefault()
            window.electronAPI?.openPlayerWindow()
            return
          case 'b':
            // Ctrl+B           → toggle left sidebar (matches VS Code).
            // Ctrl+Shift+B     → toggle blackout (relocated from Ctrl+B
            // in Phase 11 M-22 because the VS Code muscle-memory clash
            // had users hiding the room every time they tried to hide
            // the sidebar). The existing Ctrl+\ keeps working as an
            // alias from the native menu.
            e.preventDefault()
            if (e.shiftKey) {
              useUIStore.getState().toggleBlackout()
            } else {
              useUIStore.getState().toggleLeftSidebar()
            }
            return
          case 'd': {
            // Ctrl+D — duplicate selected tokens (Phase 11 m-36).
            // TokenLayer listens for this event; the same code path
            // powers the right-click "Als Gruppe duplizieren" item.
            if (useUIStore.getState().selectedTokenIds.length === 0) return
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('tokens:duplicate-selection'))
            return
          }
          case 'c': {
            // Ctrl+C — copy selected tokens to clipboard
            const { selectedTokenIds } = useUIStore.getState()
            if (selectedTokenIds.length === 0) return
            e.preventDefault()
            const tokens = useTokenStore.getState().tokens
            const selectedTokens = tokens.filter((t) => selectedTokenIds.includes(t.id))
            if (selectedTokens.length === 0) return
            const firstX = Math.min(...selectedTokens.map((t) => t.x))
            const firstY = Math.min(...selectedTokens.map((t) => t.y))
            useUIStore.getState().setClipboardTokens(selectedTokens.map((t) => ({
              name: t.name, imagePath: t.imagePath, size: t.size,
              hpCurrent: t.hpCurrent, hpMax: t.hpMax, faction: t.faction ?? 'party',
              ac: t.ac, notes: t.notes, statusEffects: t.statusEffects,
              visibleToPlayers: t.visibleToPlayers, markerColor: t.markerColor,
              showName: t.showName,
              offsetX: t.x - firstX, offsetY: t.y - firstY,
            })))
            return
          }
          case 'v': {
            // Ctrl+V — paste tokens at visible map center
            const clipboardTokens = useUIStore.getState().clipboardTokens
            if (clipboardTokens.length === 0) return
            const activeMapId = useCampaignStore.getState().activeMapId
            if (!activeMapId || !window.electronAPI) return
            e.preventDefault()
            const activeMap = useCampaignStore.getState().activeMaps.find((m) => m.id === activeMapId)
            const gridSize = activeMap?.gridSize ?? 50
            // Paste anchor = cursor in map space, falling back to
            // visible map centre if the cursor hasn't entered the canvas
            // yet (e.g. paste fired from the command palette). Phase 11
            // M-34: Roll20 / Foundry both anchor at cursor.
            const cursor = getLastCursorMap()
            const { canvasW, canvasH, screenToMap } = useMapTransformStore.getState()
            const center = cursor ?? screenToMap(canvasW / 2, canvasH / 2)
            // Track the currently active DB ids for each paste slot so undo/redo
            // can operate on the most recent set (ids change each redo cycle).
            const pastedIds: number[] = []
            // Preserve the full INSERT payloads so redo can re-create identical rows
            // with fresh DB ids after an undo-delete.
            const pastedPayloads: Array<{
              mapId: number
              name: string
              imagePath: string | null
              x: number
              y: number
              size: number
              hpCurrent: number
              hpMax: number
              visibleToPlayers: boolean
              markerColor: string | null
              ac: number | null
              notes: string | null
              statusEffects: any
              faction: 'party' | 'enemy' | 'neutral'
              showName: boolean
            }> = []
            ;(async () => {
              for (const ct of clipboardTokens) {
                const newX = Math.round((center.x + ct.offsetX) / gridSize) * gridSize
                const newY = Math.round((center.y + ct.offsetY) / gridSize) * gridSize
                const payload = {
                  mapId: activeMapId,
                  name: ct.name,
                  imagePath: ct.imagePath,
                  x: newX,
                  y: newY,
                  size: ct.size,
                  hpCurrent: ct.hpCurrent,
                  hpMax: ct.hpMax,
                  visibleToPlayers: ct.visibleToPlayers,
                  markerColor: ct.markerColor,
                  ac: ct.ac,
                  notes: ct.notes,
                  statusEffects: ct.statusEffects,
                  faction: ct.faction as 'party' | 'enemy' | 'neutral',
                  showName: ct.showName,
                }
                try {
                  const newToken = await window.electronAPI!.tokens.create(payload)
                  useTokenStore.getState().addToken(newToken)
                  pastedIds.push(newToken.id)
                  pastedPayloads.push(payload)
                } catch (err) {
                  console.error('[useKeyboardShortcuts] paste token failed:', err)
                }
              }
              if (pastedIds.length > 0) {
                window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                useUndoStore.getState().pushCommand({
                  id: nextCommandId(),
                  label: `Paste ${pastedIds.length} token${pastedIds.length > 1 ? 's' : ''}`,
                  action: {
                    type: 'token.paste',
                    payload: { ids: pastedIds.slice(), payloads: pastedPayloads },
                  },
                  undo: async () => {
                    for (const id of pastedIds) useTokenStore.getState().removeToken(id)
                    await window.electronAPI?.tokens.deleteMany(pastedIds)
                    window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                  },
                  redo: async () => {
                    // Re-insert each pasted token. Fresh ids come back
                    // from the handler — tracked so the next undo can
                    // delete them again.
                    pastedIds.length = 0
                    for (const payload of pastedPayloads) {
                      try {
                        const newToken = await window.electronAPI!.tokens.create(payload)
                        useTokenStore.getState().addToken(newToken)
                        pastedIds.push(newToken.id)
                      } catch (err) {
                        console.error('[useKeyboardShortcuts] redo paste failed:', err)
                      }
                    }
                    window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                  },
                })
              }
            })()
            return
          }
        }
        return
      }

      // ── Audio: digit/board shortcuts are owned by `useSfxHotkeys` so
      // there is one authoritative handler for SFX. The previous in-line
      // duplicate here contradicted useSfxHotkeys's "leave digits alone
      // when popover is open" comment; deleting this branch resolves the
      // contradiction. `useSfxHotkeys` now fires when the audio panel is
      // open (see hook gating).

      // ── Single-key shortcuts ───────────────────────────────────────
      switch (e.key) {
        // Space is intentionally NOT handled here — it is used by MapLayer for canvas panning.
        // Blackout is now Ctrl+B.

        case 'v': case 'V':
          useUIStore.getState().setActiveTool('select')
          break
        case 'w': case 'W':
          useUIStore.getState().setActiveTool('pointer')
          break
        case 'f': case 'F':
          useUIStore.getState().setActiveTool('fog-rect')
          break
        case 'p': case 'P':
          useUIStore.getState().setActiveTool('fog-polygon')
          break
        case 'c': case 'C':
          useUIStore.getState().setActiveTool('fog-cover')
          break
        case 'b': case 'B':
          useUIStore.getState().setActiveTool('fog-brush')
          break
        case 'x': case 'X':
          useUIStore.getState().setActiveTool('fog-brush-cover')
          break
        case 'd': case 'D':
          useUIStore.getState().setActiveTool('draw-freehand')
          break
        case 'm': case 'M': {
          // Repeat-M cycles measure-line → measure-circle → measure-cone
          // → measure-line, mirroring Foundry's "press M to cycle ruler
          // shape" idiom. First press from any other tool jumps to line.
          const cur = useUIStore.getState().activeTool
          const next =
            cur === 'measure-line'   ? 'measure-circle' :
            cur === 'measure-circle' ? 'measure-cone'   :
            cur === 'measure-cone'   ? 'measure-line'   : 'measure-line'
          useUIStore.getState().setActiveTool(next)
          break
        }
        case 'g': case 'G':
          if (e.shiftKey) {
            // Shift+G toggles grid visibility on the active map *and* arms
            // the chord window: press + / - within CHORD_WINDOW_MS to
            // resize the grid instead of toggling it. The toast advertises
            // the chord so the feature is discoverable on first use
            // (Phase 11 M-11 / M-41).
            const { activeMapId, activeMaps } = useCampaignStore.getState()
            const map = activeMaps.find((m) => m.id === activeMapId)
            if (map) void persistMapGridPatch({ gridVisible: !(map.gridVisible ?? true) })
            gridChordDeadline = performance.now() + CHORD_WINDOW_MS
            showToast('Grid: press + / − to resize', 'info', 1200)
          } else {
            // Plain G activates wall-draw (matches dock + overlay + every
            // VTT convention). Grid toggle moved to Shift+G.
            useUIStore.getState().setActiveTool('wall-draw')
          }
          break
        case 'j': case 'J':
          useUIStore.getState().setActiveTool('wall-door')
          break
        case 'r': case 'R':
          useUIStore.getState().setActiveTool('room')
          break
        case 'e': case 'E':
          if (e.shiftKey) {
            // Shift+E = eraser tool (matches Photoshop / Figma / OBR).
            useUIStore.getState().setActiveTool('draw-erase')
          } else {
            useUIStore.getState().togglePlayerEye()
          }
          break
        case 't': case 'T':
          // T = token-place tool. The Tokens sidebar tab is on Ctrl+1
          // (panel switching) — splitting plain-T vs Shift-T was a hidden
          // overload that produced two different outcomes from the same
          // visible key.
          useUIStore.getState().setActiveTool('token')
          break
        case 'n': case 'N': {
          // Only fire when there is an active combat to advance — a stray
          // `N` keystroke during prep or with no combatants would silently
          // jump the round otherwise. Aligns with Foundry's gating on the
          // active control selection.
          const initEntries = useInitiativeStore.getState().entries
          if (initEntries.length === 0) break
          useInitiativeStore.getState().nextTurn()
          // Broadcast to player window (same as InitiativePanel.handleNextTurn)
          if (useSessionStore.getState().sessionMode !== 'prep') {
            const { entries } = useInitiativeStore.getState()
            window.electronAPI?.sendInitiative(
              entries.map((e) => ({ name: e.combatantName, roll: e.roll, current: e.currentTurn }))
            )
            // Persist effect timer changes after round boundary in one txn
            const timerUpdates = entries
              .filter((e) => e.effectTimers != null)
              .map((e) => ({ id: e.id, patch: { effectTimers: e.effectTimers } }))
            if (timerUpdates.length > 0) {
              window.electronAPI?.initiative.updateMany(timerUpdates)
            }
          }
          break
        }

        case 'Escape':
          useFogStore.getState().clearPendingPoints()
          useUIStore.getState().clearTokenSelection()
          useUIStore.getState().setActiveTool('select')
          break

        case 'Delete': case 'Backspace': {
          const { selectedTokenIds } = useUIStore.getState()
          if (selectedTokenIds.length > 0) {
            const ids = [...selectedTokenIds]
            const tokens = useTokenStore.getState().tokens
            // Capture full token records BEFORE deletion so undo can re-insert
            const deletedTokens = ids.map((id) => tokens.find((t) => t.id === id)).filter(Boolean) as typeof tokens
            const names = deletedTokens.map((t) => t.name).join(', ')
            // Phase 11 m-15: confirm only when batch-deleting (≥3 tokens).
            // Roll20 / Foundry both delete silently and rely on undo as
            // the safety net; we have undo, the confirm is friction.
            const needsConfirm = ids.length >= 3
            const confirmedPromise = needsConfirm
              ? window.electronAPI!.deleteTokenConfirm(names)
              : Promise.resolve(true)
            confirmedPromise.then(async (confirmed) => {
              if (!confirmed) return
              for (const id of ids) {
                useTokenStore.getState().removeToken(id)
              }
              // Null out initiative references to deleted tokens
              useInitiativeStore.getState().entries.forEach((entry) => {
                if (entry.tokenId != null && ids.includes(entry.tokenId)) {
                  useInitiativeStore.getState().updateEntry(entry.id, { tokenId: null })
                }
              })
              useUIStore.getState().clearTokenSelection()
              try {
                // deleteMany nulls out initiative.token_id atomically.
                await window.electronAPI?.tokens.deleteMany(ids)
                window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
              } catch (err) {
                console.error('[useKeyboardShortcuts] token delete failed:', err)
              }

              // Push undo command so Delete key is as undoable as context-menu delete
              useUndoStore.getState().pushCommand({
                id: nextCommandId(),
                label: deletedTokens.length === 1 ? `Delete ${deletedTokens[0].name}` : `Delete ${deletedTokens.length} tokens`,
                action: {
                  type: 'token.deleteMany',
                  payload: { ids, tokens: deletedTokens },
                },
                undo: async () => {
                  try {
                    await window.electronAPI?.tokens.restoreMany(deletedTokens)
                    for (const token of deletedTokens) {
                      useTokenStore.getState().addToken(token)
                    }
                  } catch (err) {
                    console.error('[useKeyboardShortcuts] undo delete failed:', err)
                  }
                  window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                },
                redo: async () => {
                  for (const id of ids) useTokenStore.getState().removeToken(id)
                  try {
                    await window.electronAPI?.tokens.deleteMany(ids)
                    window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                  } catch (err) {
                    console.error('[useKeyboardShortcuts] redo delete failed:', err)
                  }
                },
              })
            })
          }
          break
        }

        case '=': case '+':
          useMapTransformStore.getState().zoomIn()
          break
        case '-':
          useMapTransformStore.getState().zoomOut()
          break
        case '0':
          useMapTransformStore.getState().fitToScreen()
          break

        case '1': case '2': case '3': case '4': case '5': {
          // Only switch maps when already inside the game view — pressing 1–5
          // in CampaignView would accidentally navigate away from prep work.
          if (!useCampaignStore.getState().activeMapId) break
          const idx = parseInt(e.key) - 1
          const maps = useCampaignStore.getState().activeMaps
          if (maps[idx]) {
            useCampaignStore.getState().setActiveMap(maps[idx].id)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
