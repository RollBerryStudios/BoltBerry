import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useAppStore } from '../stores/appStore'
import { useCampaignStore } from '../stores/campaignStore'

export function StatusBar() {
  const { playerConnected, blackoutActive, sessionMode } = useUIStore()
  const { entries, round } = useInitiativeStore()
  const { saveState, lastSaved } = useAppStore()
  const { activeCampaignId } = useCampaignStore()
  const current = entries.find((e) => e.currentTurn)

  // Export/Import handlers accessible from statusbar
  async function handleExport() {
    if (!activeCampaignId || !window.electronAPI) return
    useAppStore.getState().setSaving()
    const result = await window.electronAPI.exportCampaign(activeCampaignId) as { success: boolean; error?: string; canceled?: boolean }
    if (result.success) {
      useAppStore.getState().setSaved()
    } else if (!result.canceled) {
      useAppStore.getState().setSaveError()
    } else {
      useAppStore.getState().setSaved()
    }
  }

  async function handleQuickBackup() {
    if (!activeCampaignId || !window.electronAPI) return
    useAppStore.getState().setSaving()
    const result = await window.electronAPI.quickBackup(activeCampaignId) as {
      success: boolean; filePath?: string; error?: string
    }
    if (result.success) {
      useAppStore.getState().setSaved()
    } else {
      useAppStore.getState().setSaveError()
    }
  }

  async function handleImport() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.importCampaign() as { success: boolean; campaignId?: number; error?: string; canceled?: boolean }
    if (result.success && result.campaignId) {
      // Reload campaign list
      const campaigns = await window.electronAPI.dbQuery<{
        id: number; name: string; created_at: string; last_opened: string
      }>('SELECT * FROM campaigns ORDER BY last_opened DESC')
      const { setCampaigns, setActiveCampaign } = useCampaignStore.getState()
      setCampaigns(campaigns.map((c) => ({
        id: c.id, name: c.name, createdAt: c.created_at, lastOpened: c.last_opened,
      })))
      setActiveCampaign(result.campaignId)
    }
  }

  const saveLabel = (() => {
    switch (saveState) {
      case 'saving': return { text: '💾 Speichert…', color: 'var(--warning)' }
      case 'saved':  return { text: '✓ Gespeichert', color: 'var(--success)' }
      case 'error':  return { text: '⚠ Fehler', color: 'var(--danger)' }
      default:
        return lastSaved
          ? { text: `Zuletzt: ${lastSaved.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`, color: 'var(--text-muted)' }
          : { text: 'Autosave aktiv', color: 'var(--text-muted)' }
    }
  })()

  return (
    <div className="statusbar">
      {/* Player monitor status */}
      <div className="statusbar-item">
        <div className={`statusbar-dot ${playerConnected ? 'connected' : 'disconnected'}`} />
        <span>{playerConnected ? 'Spieler-Monitor verbunden' : 'Kein Spieler-Monitor'}</span>
      </div>

      {/* Prep mode indicator */}
      {sessionMode === 'prep' && (
        <div className="statusbar-item">
          <span style={{ color: 'var(--warning)' }}>✎ Vorbereitungsmodus – Spieler-Sync gesperrt</span>
        </div>
      )}

      {/* Blackout indicator */}
      {blackoutActive && (
        <div className="statusbar-item">
          <span style={{ color: 'var(--warning)' }}>⬛ Schwarzbild</span>
        </div>
      )}

      {/* Current initiative fighter */}
      {current && (
        <div className="statusbar-item">
          <span style={{ color: 'var(--accent-light)' }}>
            ⚔️ Runde {round} · {current.combatantName}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Export / Import */}
      {activeCampaignId && (
        <>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', height: 20 }}
            onClick={handleImport}
            title="Kampagne importieren (ZIP)"
          >
            ↓ Import
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', height: 20 }}
            onClick={handleExport}
            title="Kampagne exportieren (ZIP)"
          >
            ↑ Export
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', height: 20, color: 'var(--accent-light)' }}
            onClick={handleQuickBackup}
            title="Schnell-Backup → ~/Documents/BoltBerry-Backups/"
          >
            ⬡ Backup
          </button>
        </>
      )}

      {/* Save state */}
      <div className="statusbar-item" style={{ color: saveLabel.color }}>
        {saveLabel.text}
      </div>

      <div className="statusbar-item" style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 'var(--sp-4)' }}>
        BoltBerry v0.1.0
      </div>
    </div>
  )
}
