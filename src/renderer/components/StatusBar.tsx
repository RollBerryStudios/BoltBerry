import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useAppStore } from '../stores/appStore'
import { APP_VERSION } from '@shared/version'

export function StatusBar() {
  const { t, i18n } = useTranslation()
  const playerConnected = useUIStore((s) => s.playerConnected)
  const blackoutActive = useUIStore((s) => s.blackoutActive)
  const sessionMode = useUIStore((s) => s.sessionMode)
  const entries = useInitiativeStore((s) => s.entries)
  const round = useInitiativeStore((s) => s.round)
  const { saveState, lastSaved } = useAppStore()
  const current = entries.find((e) => e.currentTurn)

  const saveLabel = (() => {
    switch (saveState) {
      case 'saving': return { text: t('statusBar.saving'), color: 'var(--warning)' }
      case 'saved':  return { text: t('statusBar.saved'),  color: 'var(--success)' }
      case 'error':  return { text: t('statusBar.saveError'), color: 'var(--danger)' }
      default:
        return lastSaved
          ? {
              text: t('statusBar.lastSaved', {
                time: lastSaved.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
              }),
              color: 'var(--text-muted)',
            }
          : { text: t('statusBar.autosave'), color: 'var(--text-muted)' }
    }
  })()

  return (
    <div className="statusbar">
      <div className="statusbar-item">
        <div className={`statusbar-dot ${playerConnected ? 'connected' : 'disconnected'}`} />
        <span>{playerConnected ? t('statusBar.playerConnected') : t('statusBar.playerDisconnected')}</span>
      </div>

      {sessionMode === 'prep' && (
        <div className="statusbar-item">
          <span style={{ color: 'var(--warning)' }}>{t('statusBar.prepMode')}</span>
        </div>
      )}

      {blackoutActive && (
        <div className="statusbar-item">
          <span style={{ color: 'var(--warning)' }}>{t('statusBar.blackout')}</span>
        </div>
      )}

      {current && (
        <div className="statusbar-item">
          <span style={{ color: 'var(--accent-light)' }}>
            {t('statusBar.round', { round, name: current.combatantName })}
          </span>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div className="statusbar-item" style={{ color: saveLabel.color }}>
        {saveLabel.text}
      </div>

      <div className="statusbar-item" style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 'var(--sp-4)' }}>
        {t('app.version', { version: APP_VERSION })}
      </div>
    </div>
  )
}
