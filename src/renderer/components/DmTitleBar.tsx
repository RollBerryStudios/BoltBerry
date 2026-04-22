import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useCampaignStore } from '../stores/campaignStore'
import { useUIStore } from '../stores/uiStore'
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
  const language = useUIStore((s) => s.language)
  const toggleLanguage = useUIStore((s) => s.toggleLanguage)
  const playerConnected = useUIStore((s) => s.playerConnected)
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
        <img src={logoSquare} alt="" aria-hidden="true" width={16} height={16} />
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

      <div
        className="dm-title-bar-lang"
        role="group"
        aria-label="Language"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {(['de', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => { if (language !== l) toggleLanguage() }}
            className={language === l ? 'active' : ''}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Reserve space for Windows/Linux native window controls
          (titleBarOverlay renders them on the right). */}
      {!isDarwin && <div className="dm-title-bar-controls-space" />}
    </div>
  )
}
