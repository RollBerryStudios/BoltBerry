import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useInitiativeStore } from '../stores/initiativeStore'
import { useTokenStore } from '../stores/tokenStore'
import { useAppStore } from '../stores/appStore'
import { APP_VERSION } from '@shared/version'

export function StatusBar() {
  const { t, i18n } = useTranslation()
  const playerConnected = useSessionStore((s) => s.playerConnected)
  const blackoutActive = useUIStore((s) => s.blackoutActive)
  const sessionMode = useSessionStore((s) => s.sessionMode)
  const overlayActive = useUIStore((s) => s.overlayActive)
  const activeWeather = useUIStore((s) => s.activeWeather)
  const setFloatingPanel = useUIStore((s) => s.setFloatingPanel)
  const setOverlayActive = useUIStore((s) => s.setOverlayActive)
  const entries = useInitiativeStore((s) => s.entries)
  const round = useInitiativeStore((s) => s.round)
  const tokenCount = useTokenStore((s) => s.tokens.length)
  const { saveState, lastSaved } = useAppStore()
  const current = entries.find((e) => e.currentTurn)

  const saveLabel = (() => {
    switch (saveState) {
      case 'saving': return { text: t('statusBar.saving'), color: 'var(--warning)' }
      case 'saved':
        // Persistent indicator — show time of last save so DM always sees the current state
        return lastSaved
          ? {
              text: t('statusBar.savedAt', {
                time: lastSaved.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
              }),
              color: 'var(--success)',
            }
          : { text: t('statusBar.saved'), color: 'var(--success)' }
      case 'error':  return { text: t('statusBar.saveError'), color: 'var(--danger)' }
      default:
        // idle — no save has completed yet this session
        return { text: t('statusBar.autosave'), color: 'var(--text-muted)' }
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

      {overlayActive && (
        <div className="statusbar-item statusbar-clickable" onClick={() => setFloatingPanel('overlay')} title={t('statusBar.overlayHint')}>
          <span style={{ color: '#a855f7' }}>{t('statusBar.overlayActive')}</span>
        </div>
      )}

      {activeWeather !== 'none' && (
        <div className="statusbar-item statusbar-clickable" onClick={() => setFloatingPanel('overlay')} title={t('statusBar.weatherHint')}>
          <span style={{ color: '#3b82f6' }}>
            {activeWeather === 'rain'  ? t('statusBar.weatherRain')
             : activeWeather === 'snow' ? t('statusBar.weatherSnow')
             : activeWeather === 'fog'  ? t('statusBar.weatherFog')
             : activeWeather === 'wind' ? t('statusBar.weatherWind')
             : `🌤 ${activeWeather}`}
          </span>
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

      {tokenCount > 0 && (
        <div
          className="statusbar-item"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}
          title={t('statusBar.tokenCount', { count: tokenCount })}
        >
          â¬¤ {tokenCount}
        </div>
      )}

      <div className="statusbar-item" style={{ color: saveLabel.color }}>
        {saveLabel.text}
      </div>

      <div className="statusbar-item" style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 'var(--sp-4)' }}>
        {t('app.version', { version: APP_VERSION })}
      </div>
    </div>
  )
}
