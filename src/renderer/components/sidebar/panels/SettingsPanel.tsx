import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useAppStore } from '../../../stores/appStore'

export function SettingsPanel() {
  const { t } = useTranslation()
  const { userDataFolder } = useSettingsStore()
  const { activeCampaignId, addCampaign, setActiveCampaign } = useCampaignStore()

  async function handleOpenContentFolder() {
    if (window.electronAPI) {
      try {
        await window.electronAPI.openContentFolder()
      } catch (err) {
        console.error('[SettingsPanel] Failed to open content folder:', err)
        alert('Ordner konnte nicht geöffnet werden')
      }
    }
  }

  async function handleRescanContent() {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.rescanContentFolder()
        await useCampaignStore.getState().refreshCampaigns()
        alert(result.message)
      } catch (err) {
        console.error('[SettingsPanel] Failed to rescan content folder:', err)
        alert('Fehler beim Scannen des Inhaltsordners: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }

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
    const result = await window.electronAPI.quickBackup(activeCampaignId) as { success: boolean; filePath?: string; error?: string }
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
      const campaigns = await window.electronAPI.dbQuery<{
        id: number; name: string; created_at: string; last_opened: string
      }>('SELECT * FROM campaigns ORDER BY last_opened DESC')
      useCampaignStore.getState().setCampaigns(campaigns.map((c) => ({
        id: c.id, name: c.name, createdAt: c.created_at, lastOpened: c.last_opened,
      })))
      setActiveCampaign(result.campaignId)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', overflowY: 'auto', padding: 'var(--sp-3)' }}>

      {/* ── Datenspeicherung ──────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">{t('settings.title')}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              marginBottom: 'var(--sp-1)'
            }}>
              Datenordner
            </label>
            <div style={{
              padding: 'var(--sp-2)',
              background: 'var(--bg-overlay)',
              borderRadius: 'var(--radius)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'monospace',
              wordBreak: 'break-all'
            }}>
              {userDataFolder}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button
              className="btn btn-ghost"
              onClick={handleOpenContentFolder}
              style={{ flex: 1 }}
            >
              Ordner öffnen
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleRescanContent}
              style={{ flex: 1 }}
            >
              Rescan
            </button>
          </div>
        </div>
      </div>

      {/* ── Kampagnen-Import/Export ───────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Kampagne sichern & importieren</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <button
            className="btn btn-ghost"
            onClick={handleImport}
            title="Kampagne aus BoltBerry-Archiv importieren"
            style={{ justifyContent: 'flex-start', gap: 8 }}
          >
            <span>📥</span> Kampagne importieren
          </button>

          {activeCampaignId && (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleExport}
                title="Aktive Kampagne als Archiv exportieren"
                style={{ justifyContent: 'flex-start', gap: 8 }}
              >
                <span>📤</span> Kampagne exportieren
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleQuickBackup}
                title="Schnell-Backup der aktiven Kampagne erstellen"
                style={{ justifyContent: 'flex-start', gap: 8, color: 'var(--accent-light)' }}
              >
                <span>💾</span> Schnell-Backup
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
