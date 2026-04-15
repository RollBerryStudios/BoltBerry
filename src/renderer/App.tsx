import { useEffect, useState } from 'react'
import { useUIStore } from './stores/uiStore'
import { useCampaignStore } from './stores/campaignStore'
import { useSettingsStore } from './stores/settingsStore'
import { AppLayout } from './components/AppLayout'
import { CampaignView } from './components/CampaignView'
import { StartScreen } from './components/StartScreen'
import { SetupWizard } from './components/SetupWizard'
import { ShortcutOverlay } from './components/ShortcutOverlay'
import { ToastProvider } from './components/shared/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAutoSave } from './hooks/useAutoSave'
import { usePlayerSync } from './hooks/usePlayerSync'
import { useAutoAmbient } from './hooks/useAutoAmbient'

export default function App() {
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const { theme, blackoutActive } = useUIStore()
  const [showShortcuts, setShowShortcuts] = useState(false)

  useKeyboardShortcuts()
  useAutoSave()
  usePlayerSync()
  useAutoAmbient()

  // Persist theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Sync blackout state to player window.
  // Kept here (not inside the Zustand setter) so IPC is a proper React side effect.
  useEffect(() => {
    window.electronAPI?.sendBlackout(blackoutActive)
  }, [blackoutActive])

  // Open shortcut overlay on ? or F1
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      }
      if (e.key === 'Escape') setShowShortcuts(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Initialize settings first (may switch the DB path), then load campaigns.
  // Sequencing matters: loadCampaigns must query whichever DB is authoritative
  // for this session — which is only known after initializeSettings completes.
  useEffect(() => {
    initializeSettings().then(() => loadCampaigns())
  }, [])

  const { isSetupComplete } = useSettingsStore()

  return (
    <>
      {!isSetupComplete ? (
        <SetupWizard onComplete={() => { /* isSetupComplete set inside wizard */ }} />
      ) : !activeCampaignId ? (
        <StartScreen />
      ) : (
        <>
          {/* CampaignView stays mounted while a campaign is open so tab state is preserved.
              Hidden (not unmounted) when a map is active. */}
          <div style={{ display: activeMapId ? 'none' : 'flex', flexDirection: 'column', height: '100%' }}>
            <CampaignView />
          </div>
          {/* AppLayout is only mounted when a map is open — the canvas is heavy. */}
          {activeMapId && <AppLayout />}
        </>
      )}
      {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
      <ToastProvider />
    </>
  )
}

async function loadCampaigns() {
  if (!window.electronAPI) {
    console.error('[App] electronAPI not available — preload may have failed')
    return
  }
  try {
    const campaigns = await window.electronAPI.dbQuery<{
      id: number; name: string; created_at: string; last_opened: string
    }>('SELECT * FROM campaigns ORDER BY last_opened DESC')

    useCampaignStore.getState().setCampaigns(
      campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        lastOpened: c.last_opened,
      }))
    )
    // Do not auto-open: always land on StartScreen so the user chooses a campaign
  } catch (err) {
    console.error('[App] Failed to load campaigns:', err)
  }
}

async function initializeSettings() {
  if (!window.electronAPI) {
    console.error('[App] electronAPI not available — preload may have failed')
    return
  }
  const { userDataFolder, isSetupComplete } = useSettingsStore.getState()
  if (isSetupComplete && userDataFolder) {
    // Already configured in a previous session — tell main process the path
    try {
      const result = await window.electronAPI.setUserDataFolder(userDataFolder)
      if (!result?.success) {
        console.error('[App] Failed to restore data folder path:', result?.error)
      }
    } catch (err) {
      console.error('[App] Failed to restore data folder path:', err)
    }
  }
  // If not set up yet, the SetupWizard handles everything
}
