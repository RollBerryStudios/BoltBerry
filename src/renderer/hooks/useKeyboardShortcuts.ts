import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useFogStore } from '../stores/fogStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore } from '../stores/mapTransformStore'

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // ── Ctrl / Cmd shortcuts ──────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) {
              // Redo fog
              document.getElementById('root')?.dispatchEvent(
                new CustomEvent('fog:undo-redo', { detail: { type: 'redo' } })
              )
            } else {
              // Undo fog + token moves
              document.getElementById('root')?.dispatchEvent(
                new CustomEvent('fog:undo-redo', { detail: { type: 'undo' } })
              )
              useTokenStore.getState().undoLastMove()
            }
            return
          case 's':
            e.preventDefault()
            window.electronAPI?.saveNow()
            return
        }
        return
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
        case 'f': case 'F':
          useUIStore.getState().setActiveTool('fog-rect')
          break
        case 'p': case 'P':
          useUIStore.getState().setActiveTool('fog-polygon')
          break
        case 'c': case 'C':
          useUIStore.getState().setActiveTool('fog-cover')
          break
        case 't': case 'T':
          useUIStore.getState().setActiveTool('select') // token mode via sidebar
          useUIStore.getState().setSidebarTab('tokens')
          break
        case 'n': case 'N':
          useInitiativeStore.getState().nextTurn()
          break

        case 'Escape':
          useFogStore.getState().clearPendingPoints()
          useUIStore.getState().setSelectedToken(null)
          useUIStore.getState().setActiveTool('select')
          break

        case 'Delete': case 'Backspace': {
          const { selectedTokenId } = useUIStore.getState()
          if (selectedTokenId !== null) {
            useTokenStore.getState().removeToken(selectedTokenId)
            window.electronAPI?.dbRun('DELETE FROM tokens WHERE id = ?', [selectedTokenId])
            useUIStore.getState().setSelectedToken(null)
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
