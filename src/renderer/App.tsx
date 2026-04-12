import { useEffect, useState } from 'react'
import { useUIStore } from './stores/uiStore'
import { useCampaignStore } from './stores/campaignStore'
import { useSettingsStore } from './stores/settingsStore'
import { AppLayout } from './components/AppLayout'
import { StartScreen } from './components/StartScreen'
import { SetupWizard } from './components/SetupWizard'
import { ShortcutOverlay } from './components/ShortcutOverlay'
import { ToastProvider } from './components/shared/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAutoSave } from './hooks/useAutoSave'
import { usePlayerSync } from './hooks/usePlayerSync'

export default function App() {
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const { theme } = useUIStore()
  const [showShortcuts, setShowShortcuts] = useState(false)

  useKeyboardShortcuts()
  useAutoSave()
  usePlayerSync()

  // Persist theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

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

  // Load campaigns on mount
  useEffect(() => {
    loadCampaigns()
  }, [])

  // Initialize settings
  useEffect(() => {
    initializeSettings()
  }, [])

  const { isSetupComplete } = useSettingsStore()

  return (
    <>
      {!isSetupComplete ? (
        <SetupWizard onComplete={() => useSettingsStore.getState().setIsSetupComplete(true)} />
      ) : activeCampaignId ? (
        <AppLayout />
      ) : (
        <StartScreen />
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

    if (campaigns.length > 0) {
      useCampaignStore.getState().setActiveCampaign(campaigns[0].id)
    }
  } catch (err) {
    console.error('[App] Failed to load campaigns:', err)
  }
}

async function initializeSettings() {
  if (!window.electronAPI) {
    console.error('[App] electronAPI not available — preload may have failed')
    return
  }
  try {
    const defaultFolder = await window.electronAPI.getDefaultUserDataFolder()
    useSettingsStore.getState().setUserDataFolder(defaultFolder)
    useSettingsStore.getState().setIsSetupComplete(true)
  } catch (err) {
    console.error('[App] Failed to initialize settings:', err)
  }
}
