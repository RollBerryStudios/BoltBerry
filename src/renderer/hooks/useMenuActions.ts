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
      const campaignState = useCampaignStore.getState()
      const uiState = useUIStore.getState()
      const hasCampaignContext = Boolean(campaignState.activeCampaignId) && uiState.topView === 'main'
      const hasMapContext = Boolean(campaignState.activeCampaignId && campaignState.activeMapId) && uiState.topView === 'main'
      switch (action) {
        case 'new-campaign':
          onNewCampaign()
          break
        case 'save-now':
          if (!hasCampaignContext) break
          window.electronAPI?.saveNow()
          break
        case 'export-campaign': {
          if (!hasCampaignContext) break
          const id = campaignState.activeCampaignId
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
          if (!hasMapContext) break
          useMapTransformStore.getState().zoomIn()
          break
        case 'zoom-out':
          if (!hasMapContext) break
          useMapTransformStore.getState().zoomOut()
          break
        case 'fit-to-screen':
          if (!hasMapContext) break
          useMapTransformStore.getState().fitToScreen()
          break
        case 'toggle-minimap':
          if (!hasMapContext) break
          useUIStore.getState().toggleMinimap()
          break
        case 'toggle-left-sidebar':
          if (!hasCampaignContext) break
          useUIStore.getState().toggleLeftSidebar()
          break
        case 'toggle-right-sidebar':
          if (!hasCampaignContext) break
          useUIStore.getState().toggleRightSidebar()
          break
        case 'toggle-theme':
          useUIStore.getState().toggleTheme()
          break
        case 'toggle-language':
          useUIStore.getState().toggleLanguage()
          break
        case 'toggle-blackout':
          if (!hasCampaignContext) break
          useUIStore.getState().toggleBlackout()
          break
        case 'start-session':
          if (!hasCampaignContext) break
          useSessionStore.getState().setSessionMode('session')
          if (useSessionStore.getState().workMode === 'prep') {
            useSessionStore.getState().setWorkMode('play')
          }
          break
        case 'end-session':
          if (!hasCampaignContext) break
          useSessionStore.getState().setSessionMode('prep')
          break
        case 'atmosphere-image':
          if (!hasCampaignContext) break
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
        case 'open-settings':
          window.dispatchEvent(new CustomEvent('app:open-global-settings'))
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
