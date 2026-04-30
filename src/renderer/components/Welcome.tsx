import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../stores/campaignStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { AboutDialog } from './AboutDialog'
import { formatError } from '../utils/formatError'
import type { Campaign } from '@shared/ipc-types'
import {
  CampaignDataStyles,
  MapThumbnail,
  PartyAvatars,
  useCampaignStats,
  useGlobalStats,
  useRelativeTime,
} from './campaign-data'
import pkg from '../../../package.json'

/* Welcome — the post-setup landing screen when no campaign is active.
   Two panes: an atmospheric brand panel on the left (lightning accent,
   parchment grain, breathing warm light) and a focused campaign chooser
   on the right. No mocked numbers: stats on the left come from SQLite,
   campaign rows come from the campaign store. */

export function Welcome() {
  const { t } = useTranslation()
  const {
    campaigns,
    setActiveCampaign,
    addCampaign,
    removeCampaign,
    updateCampaign,
  } = useCampaignStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // The "+ New campaign" menu item dispatches this; we catch it here.
  useEffect(() => {
    const onMenuNew = () => setCreating(true)
    window.addEventListener('menu:new-campaign', onMenuNew)
    return () => window.removeEventListener('menu:new-campaign', onMenuNew)
  }, [])

  async function handleCreate() {
    if (!newName.trim() || !window.electronAPI) return
    setError(null)
    try {
      const campaign = await window.electronAPI.campaigns.create(newName.trim())
      addCampaign(campaign)
      setActiveCampaign(campaign.id)
      setCreating(false)
      setNewName('')
    } catch (err) {
      setError(t('dashboard.createError', { error: formatError(err) }))
    }
  }

  async function handleImport() {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.importCampaign()
      if (result?.success && result.campaignId) {
        const campaign = await window.electronAPI.campaigns.get(result.campaignId)
        if (campaign) addCampaign(campaign)
      } else if (result && !result.success) {
        setError(t('dashboard.importError', { error: result.error ?? '' }))
      }
    } catch (err) {
      setError(t('dashboard.importError', { error: formatError(err) }))
    }
  }

  async function handleRename(campaign: Campaign, next: string) {
    const name = next.trim()
    if (!name || name === campaign.name || !window.electronAPI) return
    try {
      await window.electronAPI.campaigns.rename(campaign.id, name)
      updateCampaign(campaign.id, { name })
    } catch (err) {
      setError(formatError(err))
    }
  }

  async function handleDelete(campaign: Campaign) {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.confirmDialog(
      t('dashboard.deleteTitle'),
      t('dashboard.deleteMessage', { name: campaign.name }),
    )
    if (!confirmed) return
    try {
      await window.electronAPI.campaigns.delete(campaign.id)
      removeCampaign(campaign.id)
    } catch (err) {
      setError(t('dashboard.deleteError', { error: formatError(err) }))
    }
  }

  async function handleDuplicate(campaign: Campaign) {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.duplicateCampaign(campaign.id)
      if (result?.success && result.campaign) addCampaign(result.campaign)
    } catch (err) {
      setError(formatError(err))
    }
  }

  const stats = useCampaignStats(useMemo(() => campaigns.map((c) => c.id), [campaigns]))
  const global = useGlobalStats([campaigns.length])
  const [aboutOpen, setAboutOpen] = useState(false)

  // The 👤 profile button used to open a separate ProfileModal; profile
  // editing now lives as a section inside GlobalSettingsModal so the
  // store has a single editor surface. We deep-link straight to it.
  function openProfileSettings() {
    window.dispatchEvent(new CustomEvent('app:open-global-settings', {
      detail: { section: 'profile' },
    }))
  }

  async function handleSetCover(campaign: Campaign) {
    if (!window.electronAPI) return
    const asset = await window.electronAPI.importFile('handout', campaign.id)
    if (!asset) return
    await window.electronAPI.campaigns.setCover(campaign.id, asset.path)
    updateCampaign(campaign.id, { coverPath: asset.path })
  }

  async function handleClearCover(campaign: Campaign) {
    if (!window.electronAPI || !campaign.coverPath) return
    await window.electronAPI.campaigns.setCover(campaign.id, null)
    updateCampaign(campaign.id, { coverPath: null })
  }

  return (
    <div className="bb-welcome" data-testid="screen-dashboard">
      <WelcomeStyles />
      <CampaignDataStyles />

      <LeftPane stats={global} onOpenAbout={() => setAboutOpen(true)} />

      <RightPane
        campaigns={campaigns}
        campaignStats={stats}
        onOpen={(id) => setActiveCampaign(id)}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onSetCover={handleSetCover}
        onClearCover={handleClearCover}
        onCreate={() => setCreating(true)}
        onImport={handleImport}
        onOpenProfile={openProfileSettings}
        error={error}
      />

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}

      {creating && (
        <CreateModal
          value={newName}
          onChange={setNewName}
          onConfirm={handleCreate}
          onCancel={() => {
            setCreating(false)
            setNewName('')
          }}
        />
      )}
    </div>
  )
}

// ─── Left pane: brand + real local stats ──────────────────────────────

function LeftPane({
  stats,
  onOpenAbout,
}: {
  stats: { campaignCount: number; mapCount: number; characterCount: number }
  onOpenAbout: () => void
}) {
  const { t } = useTranslation()
  const displayName = useSettingsStore((s) => s.displayName)
  return (
    <aside className="bb-welcome-left grain">
      <Atmosphere />

      <div className="bb-welcome-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="var(--accent)" />
        </svg>
        <span className="bb-welcome-wordmark">
          BOLT<span style={{ color: 'var(--accent-blue-light)' }}>BERRY</span>
        </span>
        <span className="bb-welcome-studio">STUDIO</span>
      </div>

      <div className="bb-welcome-hero">
        <div className="bb-welcome-tag">
          {displayName
            ? t('welcome.tagGreeted', { name: displayName })
            : t('welcome.tag')}
        </div>
        <h1 className="bb-welcome-h1 display">
          <span className="bb-welcome-h1-dim">{t('welcome.h1a')}</span>{' '}
          <span className="bb-welcome-h1-dim">{t('welcome.h1b')}</span>
          <br />
          <span className="bb-welcome-h1-accent">{t('welcome.h1c')}</span>
        </h1>
        <p className="bb-welcome-sub">{t('welcome.sub')}</p>

        {stats.campaignCount === 0 ? (
          <div className="bb-welcome-firsttime">
            <div className="bb-welcome-firsttime-kicker">
              <span className="bb-welcome-status-dot" aria-hidden="true" />
              {t('welcome.firstTimeKicker')}
            </div>
            <div className="bb-welcome-firsttime-body">
              {t('welcome.firstTimeBody')}
            </div>
          </div>
        ) : (
          <div className="bb-welcome-stats">
            <Stat n={stats.campaignCount} l={t('welcome.statCampaigns')} first />
            <Stat n={stats.mapCount} l={t('welcome.statMaps')} />
            <Stat n={stats.characterCount} l={t('welcome.statCharacters')} />
          </div>
        )}
      </div>

      <div className="bb-welcome-footer">
        <span className="bb-welcome-status">
          <span className="bb-welcome-status-dot" aria-hidden="true" />
          {t('welcome.footerStatus')}
        </span>
        <span className="bb-welcome-version-group mono">
          <span className="bb-welcome-version">
            {t('welcome.footerVersion', { version: pkg.version })}
          </span>
          <SettingsIconButton />
          <button
            type="button"
            className="bb-welcome-info-btn"
            onClick={onOpenAbout}
            title={t('about.title')}
            aria-label={t('about.title')}
          >
            ℹ
          </button>
        </span>
      </div>
    </aside>
  )
}

function Stat({ n, l, first }: { n: number; l: string; first?: boolean }) {
  return (
    <div className={first ? 'bb-welcome-stat bb-welcome-stat-first' : 'bb-welcome-stat'}>
      <div className="bb-welcome-stat-n mono">{n.toLocaleString()}</div>
      <div className="bb-welcome-stat-l">{l}</div>
    </div>
  )
}

// ─── Right pane: campaign picker ───────────────────────────────────────

function RightPane({
  campaigns,
  campaignStats,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onSetCover,
  onClearCover,
  onCreate,
  onImport,
  onOpenProfile,
  error,
}: {
  campaigns: Campaign[]
  campaignStats: Record<number, import('./campaign-data').CampaignStats>
  onOpen: (id: number) => void
  onRename: (c: Campaign, name: string) => void
  onDuplicate: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  onSetCover: (c: Campaign) => void
  onClearCover: (c: Campaign) => void
  onCreate: () => void
  onImport: () => void
  onOpenProfile: () => void
  error: string | null
}) {
  const { t } = useTranslation()
  const empty = campaigns.length === 0

  return (
    <section className="bb-welcome-right" data-testid="dashboard-campaigns">
      <div className="bb-welcome-right-top">
        <div className="bb-welcome-topbar-row">
          <button
            data-testid="button-open-profile"
            type="button"
            className="bb-welcome-compendium-btn"
            onClick={onOpenProfile}
            title={t('welcome.editProfile')}
          >
            👤 {t('welcome.profile')}
          </button>
          <button
            data-testid="nav-bestiary"
            type="button"
            className="bb-welcome-compendium-btn"
            onClick={() => useUIStore.getState().setTopView('bestiary')}
            title={t('welcome.openBestiary')}
          >
            👹 {t('welcome.openBestiary')}
          </button>
          <button
            data-testid="nav-compendium"
            type="button"
            className="bb-welcome-compendium-btn"
            onClick={() => useUIStore.getState().setTopView('compendium')}
          >
            📚 {t('welcome.openCompendium')}
          </button>
        </div>
      </div>

      <div className="bb-welcome-right-body">
        <h2 className="bb-welcome-pick-title display">
          {empty ? t('welcome.noneTitle') : t('welcome.pickTitle')}
        </h2>
        <p className="bb-welcome-pick-sub">
          {empty ? t('welcome.noneSub') : t('welcome.pickSub')}
        </p>

        {!window.electronAPI && (
          <div className="bb-welcome-warn" role="alert">
            ⚠️ {t('dashboard.preloadMissing')}
          </div>
        )}

        {campaigns.length > 0 && (
          <div className="bb-welcome-list" data-testid="campaign-list">
            {campaigns.map((c) => (
              <CampaignRow
                key={c.id}
                campaign={c}
                stats={campaignStats[c.id]}
                onOpen={() => onOpen(c.id)}
                onRename={(name) => onRename(c, name)}
                onDuplicate={() => onDuplicate(c)}
                onDelete={() => onDelete(c)}
                onSetCover={() => onSetCover(c)}
                onClearCover={() => onClearCover(c)}
              />
            ))}
          </div>
        )}

        {error && <div className="bb-welcome-error">⚠️ {error}</div>}
      </div>

      <div className="bb-welcome-right-footer">
        <button data-testid="button-create-campaign" className="bb-welcome-cta" type="button" onClick={onCreate}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="currentColor" />
          </svg>
          {t('welcome.newCampaign')}
        </button>
        <button data-testid="button-import-campaign" className="bb-welcome-cta bb-welcome-cta-ghost" type="button" onClick={onImport}>
          📥 {t('welcome.importCampaign')}
        </button>
      </div>
    </section>
  )
}

function CampaignRow({
  campaign,
  stats,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onSetCover,
  onClearCover,
}: {
  campaign: Campaign
  stats: import('./campaign-data').CampaignStats | undefined
  onOpen: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onSetCover: () => void
  onClearCover: () => void
}) {
  const { t } = useTranslation()
  const relative = useRelativeTime(campaign.lastOpened)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(campaign.name)

  function commitRename() {
    onRename(renameValue)
    setRenaming(false)
  }

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <div
      className="bb-welcome-row"
      data-testid="list-item-campaign"
      role="button"
      tabIndex={0}
      onClick={renaming ? undefined : onOpen}
      onKeyDown={(e) => {
        if (renaming) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
        if (e.key === 'F2') {
          e.preventDefault()
          setRenameValue(campaign.name)
          setRenaming(true)
        }
      }}
    >
      <div className="bb-welcome-row-cover">
        <MapThumbnail path={campaign.coverPath ?? stats?.thumbnailPath ?? null} campaignName={campaign.name} />
      </div>

      <div className="bb-welcome-row-body">
        {renaming ? (
          <input
            data-testid="input-campaign-rename"
            className="input bb-welcome-row-rename"
            autoFocus
            value={renameValue}
            maxLength={60}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setRenameValue(campaign.name)
                setRenaming(false)
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <div className="bb-welcome-row-title display">{campaign.name}</div>
        )}

        <div className="bb-welcome-row-meta mono">
          {t('welcome.lastPlayed')} · {relative}
          {typeof stats?.sessionCount === 'number' && stats.sessionCount > 0 && (
            <>
              <span className="bb-welcome-row-sep">·</span>
              {t('welcome.sessionCount', { count: stats.sessionCount })}
            </>
          )}
          {typeof stats?.mapCount === 'number' && stats.mapCount > 0 && (
            <>
              <span className="bb-welcome-row-sep">·</span>
              {stats.mapCount} {t('dashboard.maps').toLowerCase()}
            </>
          )}
          {typeof stats?.handoutCount === 'number' && stats.handoutCount > 0 && (
            <>
              <span className="bb-welcome-row-sep">·</span>
              {stats.handoutCount} {t('dashboard.handouts').toLowerCase()}
            </>
          )}
        </div>

        {stats && stats.party.length > 0 && (
          <div className="bb-welcome-row-party">
            <PartyAvatars party={stats.party} max={5} size={22} border="var(--bg-surface)" />
          </div>
        )}
      </div>

      <div className="bb-welcome-row-actions" onClick={(e) => e.stopPropagation()}>
        {renaming ? (
          <>
            <button data-testid="button-confirm-campaign-rename" type="button" className="bb-welcome-row-action" onClick={stop(commitRename)} title="✓">
              ✓
            </button>
            <button
              type="button"
              data-testid="button-cancel-campaign-rename"
              className="bb-welcome-row-action"
              onClick={stop(() => {
                setRenameValue(campaign.name)
                setRenaming(false)
              })}
              title="✕"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="button-rename-campaign"
              className="bb-welcome-row-action"
              title={t('dashboard.rename')}
              onClick={stop(() => {
                setRenameValue(campaign.name)
                setRenaming(true)
              })}
            >
              ✏️
            </button>
            <button
              type="button"
              data-testid="button-campaign-cover"
              className="bb-welcome-row-action"
              title={campaign.coverPath ? t('welcome.clearCover') : t('welcome.setCover')}
              onClick={stop(campaign.coverPath ? onClearCover : onSetCover)}
            >
              {campaign.coverPath ? '🖼️' : '📷'}
            </button>
            <button
              type="button"
              data-testid="button-duplicate-campaign"
              className="bb-welcome-row-action"
              title={t('dashboard.duplicate')}
              onClick={stop(onDuplicate)}
            >
              📋
            </button>
            <button
              type="button"
              data-testid="button-delete-campaign"
              className="bb-welcome-row-action bb-welcome-row-action-danger"
              title={t('dashboard.delete')}
              onClick={stop(onDelete)}
            >
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Create campaign modal ────────────────────────────────────────────

// ─── Settings icon button (gear icon with dropdown) ────────────────────

function SettingsIconButton() {
  const { t } = useTranslation()
  return (
    <button
      data-testid="button-open-settings"
      type="button"
      className="bb-welcome-info-btn"
      onClick={() => window.dispatchEvent(new CustomEvent('app:open-global-settings'))}
      title={`${t('globalSettings.open')} (Ctrl/Cmd+,)`}
      aria-label={t('globalSettings.open')}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  )
}

// ─── Profile modal ───────────────────────────────────────────────────

function CreateModal({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="bb-welcome-modal-backdrop" data-testid="dialog-create-campaign" onClick={onCancel}>
      <div className="bb-welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bb-welcome-modal-title display">{t('welcome.newCampaign')}</div>
        <input
          data-testid="input-campaign-name"
          className="input"
          autoFocus
          placeholder={t('startScreen.campaignNamePlaceholder')}
          maxLength={60}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="bb-welcome-modal-actions">
          <button data-testid="button-cancel-create-campaign" className="bb-welcome-cta bb-welcome-cta-ghost" type="button" onClick={onCancel}>
            {t('dashboard.cancel')}
          </button>
          <button
            data-testid="button-confirm-create-campaign"
            className="bb-welcome-cta"
            type="button"
            onClick={onConfirm}
            disabled={!value.trim()}
          >
            {t('startScreen.create')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Atmosphere (warm light, cool counterlight, drifting dust) ────────

function Atmosphere() {
  // 20 dust particles is enough to feel alive without hurting FPS on
  // integrated GPUs. Values are frozen once so React doesn't re-roll on
  // re-render and cause the particles to jump.
  const visualMode = typeof window !== 'undefined' && localStorage.getItem('boltberry-e2e-visual') === '1'
  const particles = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        left: visualMode ? (i * 17) % 100 : Math.random() * 100,
        delay: visualMode ? i * 0.25 : Math.random() * 30,
        duration: visualMode ? 32 : 25 + Math.random() * 25,
        size: visualMode ? 1 + (i % 3) * 0.5 : 1 + Math.random() * 2,
      })),
    [visualMode],
  )
  return (
    <div className="bb-welcome-atmosphere" aria-hidden="true">
      <div className="bb-welcome-warm-pool" />
      <div className="bb-welcome-cool-pool" />
      <div className="bb-welcome-floor" />
      {particles.map((d, i) => (
        <div
          key={i}
          className="bb-welcome-dust"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            animation: `bb-dust ${d.duration}s linear ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Scoped styles ────────────────────────────────────────────────────

function WelcomeStyles() {
  return (
    <style>{`
      .bb-welcome {
        position: relative;
        display: flex; height: 100%;
        min-width: 960px;
        background: var(--bg-base);
        color: var(--text-primary);
      }
      .bb-welcome .display {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-weight: 500; letter-spacing: -0.01em;
      }
      .bb-welcome .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

      /* ── Left pane (brand + atmosphere) ────────────────────────── */
      .bb-welcome-left {
        position: relative;
        flex: 1; min-width: 520px;
        padding: 22px 56px 20px;
        background: linear-gradient(155deg, #0D1015 0%, #121722 60%, #0d141f 100%);
        border-right: 1px solid var(--border);
        overflow: hidden;
        display: flex; flex-direction: column;
      }
      .grain::before {
        content: ""; position: absolute; inset: 0; pointer-events: none;
        background-image: radial-gradient(rgba(255, 198, 46, 0.04) 1px, transparent 1px);
        background-size: 3px 3px; opacity: 0.4; mix-blend-mode: overlay;
      }
      .bb-welcome-atmosphere { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
      .bb-welcome-warm-pool {
        position: absolute; left: 25%; top: 55%;
        width: 680px; height: 680px; border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 198, 46, 0.18) 0%, rgba(255, 198, 46, 0.06) 30%, transparent 60%);
        transform: translate(-50%, -50%);
        animation: bb-breathe 6s ease-in-out infinite;
        filter: blur(8px);
      }
      .bb-welcome-cool-pool {
        position: absolute; left: 75%; top: 15%;
        width: 520px; height: 520px; border-radius: 50%;
        background: radial-gradient(circle, rgba(47, 107, 255, 0.14) 0%, rgba(47, 107, 255, 0.04) 40%, transparent 70%);
        transform: translate(-50%, -50%);
        filter: blur(12px);
      }
      .bb-welcome-floor {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse 80% 50% at 50% 100%, rgba(0, 0, 0, 0.6), transparent 70%);
      }
      .bb-welcome-dust {
        position: absolute; bottom: -10px;
        border-radius: 50%;
        background: rgba(255, 198, 46, 0.4);
      }
      @keyframes bb-breathe {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 0.85; }
      }
      @keyframes bb-dust {
        0% { transform: translateY(0) translateX(0); opacity: 0; }
        10% { opacity: 0.6; }
        100% { transform: translateY(-120vh) translateX(30px); opacity: 0; }
      }
      @keyframes bb-flicker {
        0%, 97%, 100% { opacity: 1; }
        98% { opacity: 0.75; }
        99% { opacity: 1; }
      }
      @keyframes bb-slide-up {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .bb-welcome-brand {
        position: relative; z-index: 2;
        display: flex; align-items: center; gap: 10px;
        margin-bottom: auto;
      }
      .bb-welcome-wordmark {
        font-size: 14px; letter-spacing: 0.14em; font-weight: 700;
        color: var(--text-primary);
      }
      .bb-welcome-studio {
        margin-left: 6px; padding: 2px 7px;
        font-size: 9px; letter-spacing: 0.14em; font-weight: 600;
        color: var(--accent);
        border: 1px solid rgba(255, 198, 46, 0.35);
        border-radius: 3px;
        animation: bb-flicker 7s infinite;
      }

      .bb-welcome-hero {
        position: relative; z-index: 2;
        padding: 60px 0;
        max-width: 680px;
      }
      .bb-welcome-tag {
        font-size: 11px; letter-spacing: 0.22em; font-weight: 600;
        color: var(--accent);
        margin-bottom: 22px;
        text-transform: uppercase;
        animation: bb-slide-up 600ms 100ms both ease-out;
      }
      .bb-welcome-h1 {
        font-size: clamp(56px, 8vw, 92px);
        line-height: 0.95; font-weight: 500;
        margin: 0 0 28px 0;
        letter-spacing: -0.02em;
        animation: bb-slide-up 700ms 200ms both ease-out;
      }
      .bb-welcome-h1-dim { color: var(--text-secondary); font-weight: 400; font-style: italic; }
      .bb-welcome-h1-accent {
        color: var(--accent);
        font-style: italic;
        font-weight: 600;
        text-shadow: 0 0 40px rgba(255, 198, 46, 0.25);
      }
      .bb-welcome-sub {
        font-size: 15px; line-height: 1.55;
        color: var(--text-secondary);
        max-width: 480px; margin: 0 0 36px 0;
        animation: bb-slide-up 700ms 320ms both ease-out;
      }

      .bb-welcome-stats {
        display: flex;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        animation: bb-slide-up 700ms 440ms both ease-out;
      }
      .bb-welcome-firsttime {
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        padding: 18px 4px;
        animation: bb-slide-up 700ms 440ms both ease-out;
      }
      .bb-welcome-firsttime-kicker {
        display: flex; align-items: center; gap: 8px;
        font-size: 10px; letter-spacing: 0.16em; font-weight: 700;
        color: var(--accent);
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .bb-welcome-firsttime-body {
        font-size: 14px; line-height: 1.55;
        color: var(--text-primary);
        max-width: 480px;
      }
      .bb-welcome-stat {
        flex: 1; padding: 18px 14px;
        border-left: 1px solid var(--border);
      }
      .bb-welcome-stat-first { border-left: none; }
      .bb-welcome-stat-n {
        font-size: 22px; font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 4px; letter-spacing: -0.01em;
      }
      .bb-welcome-stat-l {
        font-size: 10px; letter-spacing: 0.08em;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .bb-welcome-footer {
        position: relative; z-index: 2;
        display: flex; align-items: center; gap: 14px;
        font-size: 11px; color: var(--text-muted);
      }
      .bb-welcome-status { display: flex; align-items: center; gap: 6px; }
      .bb-welcome-status-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--success);
        box-shadow: 0 0 6px var(--success);
      }
      .bb-welcome-version-group {
        margin-left: auto;
        display: inline-flex; align-items: center; gap: 8px;
      }
      .bb-welcome-info-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px;
        padding: 0;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 50%;
        color: var(--text-muted);
        font-size: 11px; font-family: inherit;
        cursor: pointer; line-height: 1;
        transition: border-color var(--transition), color var(--transition);
      }
      .bb-welcome-info-btn:hover {
        border-color: var(--accent-blue);
        color: var(--accent-blue-light);
      }

      /* ── Right pane (campaign picker) ──────────────────────────── */
      .bb-welcome-right {
        position: relative;
        width: 480px; min-width: 440px;
        display: flex; flex-direction: column;
        background: var(--bg-surface);
      }
      .bb-welcome-right-top {
        display: flex; justify-content: flex-end;
        align-items: center;
        /* Reserve room on the right for Electron's titleBarOverlay so
           buttons do not slide under the native min / max / close
           buttons. Shares the same --titlebar-controls-w variable as
           DmTitleBar / Wiki / Compendium top bars so they all scale
           together on high-DPI Windows. */
        padding-top: 22px;
        padding-right: calc(var(--titlebar-controls-w) + 12px);
        padding-bottom: 22px;
        padding-left: 36px;
        -webkit-app-region: drag;
      }
      .bb-welcome-right-top > * {
        -webkit-app-region: no-drag;
      }
      .bb-welcome-topbar-row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        /* flex-wrap keeps all four buttons on one row when there's
           room; falls back to a second row only on very narrow
           (high-DPI) windows. */
        flex-wrap: wrap;
        row-gap: 6px;
        justify-content: flex-end;
      }
      .bb-welcome-compendium-btn {
        display: inline-flex; align-items: center; gap: 6px;
        flex-shrink: 0;
        padding: 5px 10px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
        cursor: pointer;
        font-family: inherit;
        transition: border-color var(--transition), color var(--transition);
      }
      .bb-welcome-compendium-btn:hover {
        border-color: var(--accent-blue);
        color: var(--accent-blue-light);
      }
      .bb-welcome-right-body {
        flex: 1; overflow-y: auto;
        padding: 8px 40px 16px;
        animation: bb-slide-up 700ms 100ms both ease-out;
      }
      .bb-welcome-pick-title {
        font-size: 28px; line-height: 1.12;
        margin: 0 0 10px;
        color: var(--text-primary);
      }
      .bb-welcome-pick-sub {
        font-size: 13px; color: var(--text-secondary);
        margin: 0 0 26px;
      }

      .bb-welcome-warn, .bb-welcome-error {
        padding: var(--sp-3) var(--sp-4);
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius);
        color: var(--danger);
        font-size: var(--text-sm);
        margin-bottom: var(--sp-4);
      }
      .bb-welcome-error { margin-top: var(--sp-3); }

      .bb-welcome-list {
        display: flex; flex-direction: column;
        gap: 8px;
      }
      .bb-welcome-row {
        display: flex; gap: 14px;
        padding: 10px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius);
        cursor: pointer;
        transition: border-color var(--transition), transform var(--transition);
      }
      .bb-welcome-row:hover {
        border-color: var(--border);
        transform: translateY(-1px);
      }
      .bb-welcome-row:focus-visible {
        outline: 2px solid var(--accent-blue);
        outline-offset: 2px;
      }
      .bb-welcome-row-cover {
        flex-shrink: 0;
        width: 56px; height: 56px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--bg-base);
      }
      .bb-welcome-row-cover .bb-thumb-fallback { font-size: 32px; }
      .bb-welcome-row-body {
        flex: 1; min-width: 0;
        display: flex; flex-direction: column;
        gap: 2px;
      }
      .bb-welcome-row-title {
        font-size: 16px; font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bb-welcome-row-rename { font-size: 13px; padding: 3px 6px; height: 24px; }
      .bb-welcome-row-meta {
        font-size: 11px; color: var(--text-muted);
        display: flex; align-items: center; gap: 6px;
        flex-wrap: wrap;
      }
      .bb-welcome-row-sep { opacity: 0.6; }
      .bb-welcome-row-party { margin-top: 2px; }

      .bb-welcome-row-actions {
        display: flex; gap: 4px;
        align-items: center;
      }
      .bb-welcome-row-action {
        padding: 4px 7px;
        background: transparent;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        opacity: 0;
        transition: background var(--transition), color var(--transition), border-color var(--transition), opacity var(--transition);
      }
      .bb-welcome-row:hover .bb-welcome-row-action,
      .bb-welcome-row:focus-within .bb-welcome-row-action {
        opacity: 1;
      }
      .bb-welcome-row-action:hover {
        background: var(--bg-overlay);
        color: var(--text-primary);
        border-color: var(--border);
      }
      .bb-welcome-row-action-danger { border-color: rgba(239, 68, 68, 0.3); color: var(--danger); }
      .bb-welcome-row-action-danger:hover {
        background: rgba(239, 68, 68, 0.12);
        border-color: var(--danger);
      }

      .bb-welcome-right-footer {
        display: flex; gap: 10px;
        padding: 16px 40px 22px;
        border-top: 1px solid var(--border-subtle);
      }
      .bb-welcome-cta {
        flex: 1;
        padding: 10px 16px;
        background: var(--accent);
        color: var(--text-inverse);
        border: none; border-radius: var(--radius);
        font-size: 13px; font-weight: 700; letter-spacing: 0.02em;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        box-shadow: 0 0 0 1px rgba(255, 198, 46, 0.28), 0 4px 10px rgba(255, 198, 46, 0.18);
        font-family: inherit;
        transition: background var(--transition), transform var(--transition);
      }
      .bb-welcome-cta:hover { background: var(--accent-hover); }
      .bb-welcome-cta:active { transform: translateY(1px); }
      .bb-welcome-cta:disabled { opacity: 0.4; cursor: not-allowed; }
      .bb-welcome-cta-ghost {
        background: transparent;
        color: var(--text-primary);
        border: 1px solid var(--border);
        box-shadow: none;
      }
      .bb-welcome-cta-ghost:hover { background: var(--bg-overlay); }

      /* Modal */
      .bb-welcome-modal-backdrop {
        position: fixed; inset: 0; z-index: 9900;
        background: rgba(0, 0, 0, 0.65);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(2px);
      }
      .bb-welcome-modal {
        width: min(440px, 90vw);
        padding: var(--sp-5);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
        display: flex; flex-direction: column; gap: var(--sp-4);
      }
      .bb-welcome-modal-title {
        font-size: 22px;
        color: var(--text-primary);
      }
      .bb-welcome-modal-actions {
        display: flex; justify-content: flex-end; gap: var(--sp-2);
      }

      @media (max-width: 960px) {
        .bb-welcome { flex-direction: column; min-width: 0; }
        .bb-welcome-left { min-width: 0; padding: 16px 20px; }
        .bb-welcome-right { width: 100%; min-width: 0; }
      }
    `}</style>
  )
}
