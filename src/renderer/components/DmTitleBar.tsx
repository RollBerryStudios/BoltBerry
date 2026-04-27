import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useCampaignStore } from '../stores/campaignStore'
import { useSessionStore } from '../stores/sessionStore'
import logoSquare from '../assets/boltberry-logo.png'

/* Frameless-window title bar for the DM view.

   The DM BrowserWindow is opened without a native frame (see
   src/main/windows.ts). This component paints the entire window-top
   chrome: a 36-px drag region with a brand mark, campaign/map
   breadcrumb, broadcast-status pill, and a DE/EN language toggle.
   Buttons opt out of the drag region via WebkitAppRegion: 'no-drag'.

   Platform offsets:
   - macOS keeps its native traffic lights (hiddenInset); we leave 72px
     of left-side space so the logo doesn't overlap them.
   - Windows/Linux render native window controls on the right via
     Electron's titleBarOverlay; we reserve ~140px on the right. */

export function DmTitleBar() {
  const { t } = useTranslation()
  const { activeCampaignId, campaigns, activeMapId, activeMaps } = useCampaignStore()
  const playerConnected = useSessionStore((s) => s.playerConnected)
  const sessionMode = useSessionStore((s) => s.sessionMode)

  const campaignName = campaigns.find((c) => c.id === activeCampaignId)?.name ?? ''
  const mapName = activeMaps.find((m) => m.id === activeMapId)?.name ?? ''

  const broadcastStatus: 'live' | 'prep' | 'offline' =
    !playerConnected ? 'offline' : sessionMode === 'session' ? 'live' : 'prep'
  const broadcastLabel =
    broadcastStatus === 'live' ? t('toolbar.broadcastLive')
    : broadcastStatus === 'prep' ? t('toolbar.broadcastPrep')
    : t('toolbar.broadcastOffline')
  const broadcastHint =
    broadcastStatus === 'live' ? t('toolbar.broadcastLiveHint')
    : broadcastStatus === 'prep' ? t('toolbar.broadcastPrepHint')
    : t('toolbar.broadcastOfflineHint')

  const isDarwin = typeof navigator !== 'undefined' &&
    navigator.userAgent.toUpperCase().includes('MAC')

  return (
    <div
      className="dm-title-bar"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Reserve space for macOS native traffic lights. */}
      {isDarwin && <div className="dm-title-bar-traffic-space" />}

      <div className="dm-title-bar-brand">
        <img
          src={logoSquare}
          alt=""
          aria-hidden="true"
          width={18}
          height={18}
          style={{ filter: 'drop-shadow(0 0 6px rgba(245, 168, 0, 0.3))' }}
        />
        <span className="dm-title-bar-wordmark">
          BOLT<span style={{ color: 'var(--accent-blue-light)' }}>BERRY</span>
        </span>
      </div>

      {activeCampaignId && (
        <div className="dm-title-bar-breadcrumb" title={campaignName + (mapName ? ' / ' + mapName : '')}>
          <span className="dm-title-bar-breadcrumb-campaign">{campaignName}</span>
          {mapName && (
            <>
              <span className="dm-title-bar-breadcrumb-sep">/</span>
              <span className="dm-title-bar-breadcrumb-map">{mapName}</span>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {activeCampaignId && (
        <div
          className={clsx('toolbar-broadcast-pill', `toolbar-broadcast-${broadcastStatus}`, 'dm-title-bar-pill')}
          title={broadcastHint}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="toolbar-broadcast-dot" />
          <span className="toolbar-broadcast-label">{broadcastLabel}</span>
        </div>
      )}

      <button
        type="button"
        className="dm-title-bar-settings"
        onClick={() => window.dispatchEvent(new CustomEvent('app:open-global-settings'))}
        title={`${t('globalSettings.open')} (Ctrl/Cmd+,)`}
        aria-label={t('globalSettings.open')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Reserve space for Windows/Linux native window controls
          (titleBarOverlay renders them on the right). */}
      {!isDarwin && <div className="dm-title-bar-controls-space" />}
    </div>
  )
}
