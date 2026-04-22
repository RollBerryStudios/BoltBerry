import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import { useUndoStore } from '../stores/undoStore'
import { useCampaignStore } from '../stores/campaignStore'

interface UseMenuActionsOptions {
  onShowShortcuts: () => void
  onNewCampaign: () => void
  onAbout: () => void
}

export function useMenuActions({ onShowShortcuts, onNewCampaign, onAbout }: UseMenuActionsOptions) {
  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return

    const unsub: () => unknown = window.electronAPI.onMenuAction((action: string) => {
      switch (action) {
        case 'new-campaign':
          onNewCampaign()
          break
        case 'save-now':
          window.electronAPI?.saveNow()
          break
        case 'export-campaign': {
          const id = useCampaignStore.getState().activeCampaignId
          if (id) window.electronAPI?.exportCampaign(id)
          break
        }
        case 'import-campaign':
          window.electronAPI?.importCampaign()
          break
        case 'undo':
          useUndoStore.getState().undo()
          break
        case 'redo':
          useUndoStore.getState().redo()
          break
        case 'zoom-in':
          useMapTransformStore.getState().zoomIn()
          break
        case 'zoom-out':
          useMapTransformStore.getState().zoomOut()
          break
        case 'fit-to-screen':
          useMapTransformStore.getState().fitToScreen()
          break
        case 'toggle-minimap':
          useUIStore.getState().toggleMinimap()
          break
        case 'toggle-left-sidebar':
          useUIStore.getState().toggleLeftSidebar()
          break
        case 'toggle-right-sidebar':
          useUIStore.getState().toggleRightSidebar()
          break
        case 'toggle-theme':
          useUIStore.getState().toggleTheme()
          break
        case 'toggle-language':
          useUIStore.getState().toggleLanguage()
          break
        case 'toggle-blackout':
          useUIStore.getState().toggleBlackout()
          break
        case 'start-session':
          useSessionStore.getState().setSessionMode('session')
          if (useSessionStore.getState().workMode === 'prep') {
            useSessionStore.getState().setWorkMode('play')
          }
          break
        case 'end-session':
          useSessionStore.getState().setSessionMode('prep')
          break
        case 'atmosphere-image':
          window.electronAPI?.importFile?.('atmosphere').then((result) => {
            if (result) {
              useUIStore.getState().setAtmosphereImage(result.path)
              window.electronAPI?.sendAtmosphere(result.path)
            }
          })
          break
        case 'show-shortcuts':
          onShowShortcuts()
          break
        case 'about':
          onAbout()
          break
      }
    })
    // Wrap so the cleanup matches React's void-returning contract — the
    // underlying preload binding hands back the IpcRenderer reference.
    return () => { unsub() }
  }, [onShowShortcuts, onNewCampaign, onAbout])
}
