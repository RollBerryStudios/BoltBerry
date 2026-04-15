import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useFogStore } from '../stores/fogStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import { useUndoStore } from '../stores/undoStore'
import { useAudioStore } from '../stores/audioStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // ── Ctrl / Cmd shortcuts ──────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        // ── Ctrl+1-9 — sidebar tab switching ─────────────────────────────
        if (!e.shiftKey && !e.altKey) {
          const SIDEBAR_TABS: import('../stores/uiStore').SidebarTab[] = [
            'tokens', 'initiative', 'encounters', 'rooms', 'notes', 'handouts', 'overlay', 'audio', 'dice',
          ]
          const idx = parseInt(e.key) - 1
          if (idx >= 0 && idx < SIDEBAR_TABS.length) {
            e.preventDefault()
            useUIStore.getState().setSidebarTab(SIDEBAR_TABS[idx])
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
        }
        return
      }

      // ── Audio tab: SFX board shortcuts ───────────────────────────────────
      if (useUIStore.getState().sidebarTab === 'audio') {
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
        case ' ':
          e.preventDefault()
          useUIStore.getState().toggleBlackout()
          break

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
            const names = ids.map((id) => tokens.find((t) => t.id === id)?.name ?? 'Token').join(', ')
            window.electronAPI?.deleteTokenConfirm(names).then(async (confirmed) => {
              if (!confirmed) return
              for (const id of ids) {
                useTokenStore.getState().removeToken(id)
              }
              // Null out initiative references to deleted tokens (matches TokenLayer behaviour)
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
              } catch (err) {
                console.error('[useKeyboardShortcuts] token delete failed:', err)
              }
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
