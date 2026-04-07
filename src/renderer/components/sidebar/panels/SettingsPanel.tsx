import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../../stores/settingsStore'

export function SettingsPanel() {
  const { t } = useTranslation()
  const { userDataFolder } = useSettingsStore()

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
    // TODO: Implement rescan functionality
    alert('Rescan-Funktion wird noch implementiert')
  }

  return (
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
  )
}