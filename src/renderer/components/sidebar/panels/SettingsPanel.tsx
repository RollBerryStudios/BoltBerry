import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useAppStore } from '../../../stores/appStore'
import { showToast } from '../../shared/Toast'

/**
 * Per-campaign actions panel.
 *
 * Strictly scoped to the *active* campaign: rescan/export/quick-backup.
 * Anything app-wide (data folder, theme, language, dock prefs, DM
 * profile, asset cleanup, importing *another* campaign) lives in the
 * GlobalSettingsModal — opened via the ⚙ gear in the title bar,
 * Ctrl/Cmd+,, the native menu, or the command palette.
 */
export function SettingsPanel() {
  const { t } = useTranslation()
  const { activeCampaignId } = useCampaignStore()

  async function handleRescanContent() {
    if (!window.electronAPI || !activeCampaignId) return
    showToast(t('campaignSettings.rescanRunning'), 'info')
    try {
      const result = await window.electronAPI.rescanContentFolder(activeCampaignId)
      await useCampaignStore.getState().refreshCampaigns()
      showToast(result.message ?? t('campaignSettings.rescanDone'), 'success', 6000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(t('campaignSettings.rescanFailed', { error: message }), 'error', 7000)
    }
  }

  async function handleExport() {
    if (!activeCampaignId || !window.electronAPI) return
    useAppStore.getState().setSaving()
    showToast(t('campaignSettings.exportRunning'), 'info')
    try {
      const result = await window.electronAPI.exportCampaign(activeCampaignId) as {
        success: boolean; filePath?: string; error?: string; canceled?: boolean
      }
      if (result.success) {
        useAppStore.getState().setSaved()
        const path = result.filePath ? ` → ${result.filePath}` : ''
        showToast(t('campaignSettings.exportDone') + path, 'success', 8000)
      } else if (result.canceled) {
        useAppStore.getState().setSaved()
        showToast(t('campaignSettings.exportCanceled'), 'info')
      } else {
        useAppStore.getState().setSaveError()
        showToast(t('campaignSettings.exportFailed', { error: result.error ?? '' }), 'error', 7000)
      }
    } catch (err) {
      useAppStore.getState().setSaveError()
      const message = err instanceof Error ? err.message : String(err)
      showToast(t('campaignSettings.exportFailed', { error: message }), 'error', 7000)
    }
  }

  async function handleQuickBackup() {
    if (!activeCampaignId || !window.electronAPI) return
    useAppStore.getState().setSaving()
    showToast(t('campaignSettings.backupRunning'), 'info')
    try {
      const result = await window.electronAPI.quickBackup(activeCampaignId) as {
        success: boolean; filePath?: string; error?: string
      }
      if (result.success) {
        useAppStore.getState().setSaved()
        const path = result.filePath ? ` → ${result.filePath}` : ''
        showToast(t('campaignSettings.backupDone') + path, 'success', 8000)
      } else {
        useAppStore.getState().setSaveError()
        showToast(t('campaignSettings.backupFailed', { error: result.error ?? '' }), 'error', 7000)
      }
    } catch (err) {
      useAppStore.getState().setSaveError()
      const message = err instanceof Error ? err.message : String(err)
      showToast(t('campaignSettings.backupFailed', { error: message }), 'error', 7000)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', overflowY: 'auto', padding: 'var(--sp-3)' }}>

      {/* Hint pointing to the global settings modal — global preferences
          (theme/language/data folder/dock prefs/file import) live there. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('app:open-global-settings'))}
        style={{
          padding: 'var(--sp-2) var(--sp-3)',
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        title={t('campaignSettings.globalHint')}
      >
        ⚙ {t('campaignSettings.globalHint')}
      </button>

      {/* ── Aktive Kampagne ───────────────────────────────────────────── */}
      {activeCampaignId && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">{t('campaignSettings.title')}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <button
              className="btn btn-ghost"
              onClick={handleRescanContent}
              title={t('campaignSettings.rescanHint')}
              style={{ justifyContent: 'flex-start', gap: 8 }}
            >
              <span>🔁</span> {t('campaignSettings.rescan')}
            </button>

            <button
              className="btn btn-ghost"
              onClick={handleExport}
              title={t('campaignSettings.exportHint')}
              style={{ justifyContent: 'flex-start', gap: 8 }}
            >
              <span>📤</span> {t('campaignSettings.export')}
            </button>

            <button
              className="btn btn-ghost"
              onClick={handleQuickBackup}
              title={t('campaignSettings.backupHint')}
              style={{ justifyContent: 'flex-start', gap: 8, color: 'var(--accent-light)' }}
            >
              <span>💾</span> {t('campaignSettings.backup')}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
