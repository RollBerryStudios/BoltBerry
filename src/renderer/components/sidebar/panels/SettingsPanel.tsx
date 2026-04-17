import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useAppStore } from '../../../stores/appStore'
import { showToast } from '../../shared/Toast'

export function SettingsPanel() {
  const { t } = useTranslation()
  const { userDataFolder } = useSettingsStore()
  const { activeCampaignId, setActiveCampaign } = useCampaignStore()

  async function handleOpenContentFolder() {
    if (window.electronAPI) {
      try {
        await window.electronAPI.openContentFolder()
      } catch (err) {
        console.error('[SettingsPanel] Failed to open content folder:', err)
        showToast('Ordner konnte nicht geöffnet werden', 'error')
      }
    }
  }

  async function handleRescanContent() {
    if (!window.electronAPI) return
    showToast('Inhaltsordner wird gescannt…', 'info')
    try {
      const result = await window.electronAPI.rescanContentFolder(activeCampaignId ?? 0)
      await useCampaignStore.getState().refreshCampaigns()
      showToast(result.message ?? 'Scan abgeschlossen', 'success', 6000)
    } catch (err) {
      console.error('[SettingsPanel] Failed to rescan content folder:', err)
      showToast('Fehler beim Scannen: ' + (err instanceof Error ? err.message : String(err)), 'error', 7000)
    }
  }

  async function handleExport() {
    if (!activeCampaignId || !window.electronAPI) return
    useAppStore.getState().setSaving()
    showToast('Kampagne wird exportiert…', 'info')
    try {
      const result = await window.electronAPI.exportCampaign(activeCampaignId) as { success: boolean; filePath?: string; error?: string; canceled?: boolean }
      if (result.success) {
        useAppStore.getState().setSaved()
        const path = result.filePath ? ` → ${result.filePath}` : ''
        showToast(`Kampagne exportiert${path}`, 'success', 8000)
      } else if (result.canceled) {
        useAppStore.getState().setSaved()
        showToast('Export abgebrochen', 'info')
      } else {
        useAppStore.getState().setSaveError()
        showToast('Export fehlgeschlagen: ' + (result.error ?? 'Unbekannter Fehler'), 'error', 7000)
      }
    } catch (err) {
      useAppStore.getState().setSaveError()
      showToast('Export fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)), 'error', 7000)
    }
  }

  async function handleQuickBackup() {
    if (!activeCampaignId || !window.electronAPI) return
    useAppStore.getState().setSaving()
    showToast('Schnell-Backup wird erstellt…', 'info')
    try {
      const result = await window.electronAPI.quickBackup(activeCampaignId) as { success: boolean; filePath?: string; error?: string }
      if (result.success) {
        useAppStore.getState().setSaved()
        const path = result.filePath ? ` → ${result.filePath}` : ''
        showToast(`Schnell-Backup gespeichert${path}`, 'success', 8000)
      } else {
        useAppStore.getState().setSaveError()
        showToast('Backup fehlgeschlagen: ' + (result.error ?? 'Unbekannter Fehler'), 'error', 7000)
      }
    } catch (err) {
      useAppStore.getState().setSaveError()
      showToast('Backup fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)), 'error', 7000)
    }
  }

  async function handleImport() {
    if (!window.electronAPI) return
    showToast('Kampagne wird importiert…', 'info')
    try {
      const result = await window.electronAPI.importCampaign() as { success: boolean; campaignId?: number; error?: string; canceled?: boolean }
      if (result.success && result.campaignId) {
        const campaigns = await window.electronAPI.dbQuery<{
          id: number; name: string; created_at: string; last_opened: string
        }>('SELECT * FROM campaigns ORDER BY last_opened DESC')
        useCampaignStore.getState().setCampaigns(campaigns.map((c) => ({
          id: c.id, name: c.name, createdAt: c.created_at, lastOpened: c.last_opened,
        })))
        setActiveCampaign(result.campaignId)
        showToast('Kampagne importiert', 'success', 6000)
      } else if (result.canceled) {
        showToast('Import abgebrochen', 'info')
      } else if (!result.success) {
        showToast('Import fehlgeschlagen: ' + (result.error ?? 'Unbekannter Fehler'), 'error', 7000)
      }
    } catch (err) {
      showToast('Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)), 'error', 7000)
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
