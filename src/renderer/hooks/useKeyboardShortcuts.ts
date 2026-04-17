import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useFogStore } from '../stores/fogStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import { useUndoStore, nextCommandId } from '../stores/undoStore'
import { useAudioStore } from '../stores/audioStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target?.isContentEditable) return

      // ── Ctrl / Cmd shortcuts ──────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        // ── Ctrl+1-9 — panel switching (sidebar tabs + floating utility panels) ─
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
            // Ctrl+B — toggle blackout (Space is reserved for canvas panning)
            e.preventDefault()
            useUIStore.getState().toggleBlackout()
            return
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
            // Paste anchor = current visible map center
            const { canvasW, canvasH, screenToMap } = useMapTransformStore.getState()
            const center = screenToMap(canvasW / 2, canvasH / 2)
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
                  const row = await window.electronAPI!.dbRun(
                    'INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [payload.mapId, payload.name, payload.imagePath, payload.x, payload.y, payload.size,
                     payload.hpCurrent, payload.hpMax, payload.visibleToPlayers ? 1 : 0,
                     0, 0, 0, payload.markerColor, payload.ac, payload.notes,
                     payload.statusEffects ? JSON.stringify(payload.statusEffects) : null,
                     payload.faction, payload.showName ? 1 : 0]
                  )
                  const newToken = {
                    id: row.lastInsertRowid, mapId: activeMapId,
                    name: payload.name, imagePath: payload.imagePath,
                    x: payload.x, y: payload.y, size: payload.size,
                    hpCurrent: payload.hpCurrent, hpMax: payload.hpMax,
                    visibleToPlayers: payload.visibleToPlayers, rotation: 0, locked: false, zIndex: 0,
                    markerColor: payload.markerColor, ac: payload.ac, notes: payload.notes,
                    statusEffects: payload.statusEffects, faction: payload.faction,
                    showName: payload.showName, lightRadius: 0, lightColor: '#ffcc44',
                  }
                  useTokenStore.getState().addToken(newToken)
                  pastedIds.push(row.lastInsertRowid)
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
                  undo: async () => {
                    for (const id of pastedIds) useTokenStore.getState().removeToken(id)
                    await window.electronAPI?.dbRun(
                      `DELETE FROM tokens WHERE id IN (${pastedIds.map(() => '?').join(',')})`,
                      pastedIds
                    )
                    window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                  },
                  redo: async () => {
                    // Re-insert each pasted token using its preserved payload.
                    // We cannot use dbRunBatch because we need the fresh
                    // lastInsertRowid for each INSERT to rebuild the store state.
                    pastedIds.length = 0
                    for (const payload of pastedPayloads) {
                      try {
                        const row = await window.electronAPI!.dbRun(
                          'INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                          [payload.mapId, payload.name, payload.imagePath, payload.x, payload.y, payload.size,
                           payload.hpCurrent, payload.hpMax, payload.visibleToPlayers ? 1 : 0,
                           0, 0, 0, payload.markerColor, payload.ac, payload.notes,
                           payload.statusEffects ? JSON.stringify(payload.statusEffects) : null,
                           payload.faction, payload.showName ? 1 : 0]
                        )
                        const newToken = {
                          id: row.lastInsertRowid, mapId: payload.mapId,
                          name: payload.name, imagePath: payload.imagePath,
                          x: payload.x, y: payload.y, size: payload.size,
                          hpCurrent: payload.hpCurrent, hpMax: payload.hpMax,
                          visibleToPlayers: payload.visibleToPlayers, rotation: 0, locked: false, zIndex: 0,
                          markerColor: payload.markerColor, ac: payload.ac, notes: payload.notes,
                          statusEffects: payload.statusEffects, faction: payload.faction,
                          showName: payload.showName, lightRadius: 0, lightColor: '#ffcc44',
                        }
                        useTokenStore.getState().addToken(newToken)
                        pastedIds.push(row.lastInsertRowid)
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

      // ── Audio panel: SFX board shortcuts (only when floating audio panel is open) ─
      if (useUIStore.getState().floatingPanel === 'audio') {
        const { boards, activeBoardIndex, triggerSfx, setActiveBoardIndex } = useAudioStore.getState()
        const board = boards[activeBoardIndex]

        // 1–9 → slots 0–8,  0 → slot 9
        if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const slotIdx = e.key === '0' ? 9 : parseInt(e.key) - 1
          const slot = board?.slots.find((s) => s.slotNumber === slotIdx)
          if (slot?.audioPath) {
            e.preventDefault()
            triggerSfx(slot.audioPath)
          }
          return
        }

        // ß → cycle to next board
        if ((e.key === 'ß' || e.key === '-') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (boards.length > 1) {
            e.preventDefault()
            setActiveBoardIndex((activeBoardIndex + 1) % boards.length)
          }
          return
        }
      }

      // ── Single-key shortcuts ──────────────────────────────────────────────
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
        case 'g': case 'G':
          useUIStore.getState().setActiveTool('wall-draw')
          break
        case 'j': case 'J':
          useUIStore.getState().setActiveTool('wall-door')
          break
        case 'r': case 'R':
          useUIStore.getState().setActiveTool('room')
          break
        case 'e': case 'E':
          useUIStore.getState().togglePlayerEye()
          break
        case 't':
          useUIStore.getState().setActiveTool('token')
          break
        case 'T':
          useUIStore.getState().setSidebarTab('tokens')
          break
        case 'n': case 'N': {
          useInitiativeStore.getState().nextTurn()
          // Broadcast to player window (same as InitiativePanel.handleNextTurn)
          if (useUIStore.getState().sessionMode !== 'prep') {
            const { entries } = useInitiativeStore.getState()
            window.electronAPI?.sendInitiative(
              entries.map((e) => ({ name: e.combatantName, roll: e.roll, current: e.currentTurn }))
            )
            // Persist effect timer changes after round boundary
            for (const entry of entries) {
              if (entry.effectTimers != null) {
                window.electronAPI?.dbRun('UPDATE initiative SET effect_timers = ? WHERE id = ?', [
                  entry.effectTimers.length > 0 ? JSON.stringify(entry.effectTimers) : null,
                  entry.id,
                ])
              }
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
            window.electronAPI?.deleteTokenConfirm(names).then(async (confirmed) => {
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
                await window.electronAPI?.dbRun(
                  `DELETE FROM tokens WHERE id IN (${ids.map(() => '?').join(',')})`,
                  ids
                )
                await window.electronAPI?.dbRun(
                  `UPDATE initiative SET token_id = NULL WHERE token_id IN (${ids.map(() => '?').join(',')})`,
                  ids
                )
                window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
              } catch (err) {
                console.error('[useKeyboardShortcuts] token delete failed:', err)
              }

              // Push undo command so Delete key is as undoable as context-menu delete
              useUndoStore.getState().pushCommand({
                id: nextCommandId(),
                label: deletedTokens.length === 1 ? `Delete ${deletedTokens[0].name}` : `Delete ${deletedTokens.length} tokens`,
                undo: async () => {
                  for (const token of deletedTokens) {
                    try {
                      await window.electronAPI?.dbRun(
                        'INSERT INTO tokens (id, map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name, light_radius, light_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [token.id, token.mapId, token.name, token.imagePath, token.x, token.y, token.size,
                         token.hpCurrent, token.hpMax, token.visibleToPlayers ? 1 : 0,
                         token.rotation, token.locked ? 1 : 0, token.zIndex, token.markerColor,
                         token.ac, token.notes,
                         token.statusEffects ? JSON.stringify(token.statusEffects) : null,
                         token.faction ?? 'party', token.showName ? 1 : 0,
                         token.lightRadius, token.lightColor]
                      )
                      useTokenStore.getState().addToken(token)
                    } catch (err) {
                      console.error('[useKeyboardShortcuts] undo delete failed:', err)
                    }
                  }
                  window.electronAPI?.sendTokenUpdate?.(useTokenStore.getState().tokens)
                },
                redo: async () => {
                  for (const id of ids) useTokenStore.getState().removeToken(id)
                  try {
                    await window.electronAPI?.dbRun(
                      `DELETE FROM tokens WHERE id IN (${ids.map(() => '?').join(',')})`,
                      ids
                    )
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
