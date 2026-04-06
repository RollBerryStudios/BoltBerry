import { useEffect, useState } from 'react'
import { useUIStore } from './stores/uiStore'
import { useCampaignStore } from './stores/campaignStore'
import { AppLayout } from './components/AppLayout'
import { StartScreen } from './components/StartScreen'
import { ShortcutOverlay } from './components/ShortcutOverlay'
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

  return (
    <>
      {activeCampaignId ? <AppLayout /> : <StartScreen />}
      {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
    </>
  )
}

async function loadCampaigns() {
  if (!window.electronAPI) return
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
}
