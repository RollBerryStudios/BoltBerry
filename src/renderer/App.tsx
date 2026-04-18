import { useCallback, useEffect, useState } from 'react'
import { useUIStore } from './stores/uiStore'
import { useCampaignStore } from './stores/campaignStore'
import { useSettingsStore } from './stores/settingsStore'
import { AppLayout } from './components/AppLayout'
import { CampaignView } from './components/CampaignView'
import { Welcome } from './components/Welcome'
import { CompendiumView } from './components/CompendiumView'
import { AboutDialog } from './components/AboutDialog'
import { SetupWizard } from './components/SetupWizard'
import { ShortcutOverlay } from './components/ShortcutOverlay'
import { CommandPalette } from './components/CommandPalette'
import { ToastProvider } from './components/shared/Toast'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAutoSave } from './hooks/useAutoSave'
import { usePlayerSync } from './hooks/usePlayerSync'
import { useAutoAmbient } from './hooks/useAutoAmbient'
import { useMenuActions } from './hooks/useMenuActions'
import { showToast } from './components/shared/Toast'
import { flushFogSave } from './components/canvas/FogLayer'

export default function App() {
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const { theme, blackoutActive, language } = useUIStore()
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  useKeyboardShortcuts()
  useAutoSave()
  usePlayerSync()
  useAutoAmbient()

  // Stable callbacks so useMenuActions doesn't re-register its IPC listener on every render.
  const handleShowShortcuts = useCallback(() => setShowShortcuts((v) => !v), [])
  const handleNewCampaign = useCallback(() => {
    // Welcome listens for this and opens its create form.
    window.dispatchEvent(new CustomEvent('menu:new-campaign'))
  }, [])
  const handleAbout = useCallback(() => setShowAbout(true), [])

  useMenuActions({
    onShowShortcuts: handleShowShortcuts,
    onNewCampaign: handleNewCampaign,
    onAbout: handleAbout,
  })

  // Keep the native menu in the same language as the UI
  useEffect(() => {
    window.electronAPI?.setMenuLanguage?.(language)
  }, [language])

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

  // Open shortcut overlay on ? or F1; open command palette on Ctrl/Cmd+K.
  // Ctrl+K intentionally works even inside inputs — a palette is global by nature.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setShowCommandPalette((v) => !v)
        return
      }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false)
        setShowCommandPalette(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The Welcome / Workspace search fields open the same command palette the rest
  // of the app uses, so there is one discoverable surface for navigation.
  useEffect(() => {
    const onOpen = () => setShowCommandPalette(true)
    window.addEventListener('dashboard:open-palette', onOpen)
    return () => window.removeEventListener('dashboard:open-palette', onOpen)
  }, [])

  // The Bestiarium / Compendium attribution strips dispatch this so a
  // visible short-credit deep-links to the full canonical attribution.
  useEffect(() => {
    const onOpenAbout = () => setShowAbout(true)
    window.addEventListener('app:open-about', onOpenAbout)
    return () => window.removeEventListener('app:open-about', onOpenAbout)
  }, [])

  // Initialize settings first (may switch the DB path), then load campaigns.
  // Sequencing matters: loadCampaigns must query whichever DB is authoritative
  // for this session — which is only known after initializeSettings completes.
  useEffect(() => {
    initializeSettings().then(() => loadCampaigns())
  }, [])

  // Flush any pending debounced saves before the renderer tears down. Today
  // that's only fog (the ~2 s debounced save); if other debounced saves
  // appear they should hook into this same handler.
  useEffect(() => {
    const onBeforeUnload = () => {
      try { flushFogSave() } catch { /* never block unload */ }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Surface unhandled promise rejections from store actions / IPC calls.
  // Without this, an awaited dbRun that rejects (e.g. SQLITE_BUSY, FK
  // violation) silently swallows the failure and the UI drifts from the
  // DB until reload. We log to console for devtools triage and toast the
  // user so they know to retry / report.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
      console.error('[App] Unhandled promise rejection:', e.reason)
      showToast(`Hintergrund-Fehler: ${reason}`, 'error')
    }
    const onError = (e: ErrorEvent) => {
      console.error('[App] Uncaught error:', e.error || e.message)
      showToast(`Unerwarteter Fehler: ${e.message}`, 'error')
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  const { isSetupComplete } = useSettingsStore()
  const topView = useUIStore((s) => s.topView)

  return (
    <>
      {!isSetupComplete ? (
        <SetupWizard onComplete={() => { /* isSetupComplete set inside wizard */ }} />
      ) : topView === 'compendium' ? (
        <CompendiumView />
      ) : !activeCampaignId ? (
        <Welcome />
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
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
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
      id: number; name: string; cover_path: string | null; created_at: string; last_opened: string
    }>('SELECT id, name, cover_path, created_at, last_opened FROM campaigns ORDER BY last_opened DESC')

    useCampaignStore.getState().setCampaigns(
      campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        coverPath: c.cover_path,
        createdAt: c.created_at,
        lastOpened: c.last_opened,
      }))
    )
    // Do not auto-open: always land on the dashboard so the user chooses a campaign
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
