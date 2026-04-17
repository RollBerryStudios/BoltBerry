import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useCampaignStore } from '../stores/campaignStore'
import { useUIStore } from '../stores/uiStore'
import { formatError } from '../utils/formatError'
import { useImageUrl } from '../hooks/useImageUrl'
import type { Campaign } from '@shared/ipc-types'

/* ─── Types for the dashboard-only DB aggregates ──────────────────── */

interface CampaignStats {
  mapCount: number
  handoutCount: number
  thumbnailPath: string | null
  party: Array<{ name: string; className: string; level: number }>
}

type StatsMap = Record<number, CampaignStats>

interface RecentMap {
  id: number
  name: string
  imagePath: string
  campaignId: number
  campaignName: string
}

/* Landing screen shown when no campaign is active.
   Replaces the minimal StartScreen with a dashboard-style layout that surfaces
   campaign metadata (map counts, handout counts, party size) pulled directly
   from SQLite — no mock data. */

export function CampaignDashboard() {
  const { t } = useTranslation()
  const {
    campaigns,
    setActiveCampaign,
    addCampaign,
    removeCampaign,
    updateCampaign,
  } = useCampaignStore()
  const { language, toggleLanguage } = useUIStore()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<StatsMap>({})
  const [recentMaps, setRecentMaps] = useState<RecentMap[]>([])

  // Pull per-campaign aggregates in one shot when the campaign list changes.
  // Three small indexed queries beat N round-trips per card.
  useEffect(() => {
    if (!window.electronAPI || campaigns.length === 0) {
      setStats({})
      setRecentMaps([])
      return
    }
    let cancelled = false
    const ids = campaigns.map((c) => c.id)
    void loadStats(ids).then((result) => {
      if (!cancelled) setStats(result)
    })
    void loadRecentMaps(ids).then((rows) => {
      if (!cancelled) setRecentMaps(rows)
    })
    return () => {
      cancelled = true
    }
  }, [campaigns])

  // The "+ New campaign" menu item dispatches this; we catch it here instead
  // of in StartScreen.
  useEffect(() => {
    const onMenuNew = () => setCreating(true)
    window.addEventListener('menu:new-campaign', onMenuNew)
    return () => window.removeEventListener('menu:new-campaign', onMenuNew)
  }, [])

  async function handleCreate() {
    if (!newName.trim() || !window.electronAPI) return
    setError(null)
    try {
      const result = await window.electronAPI.dbRun(
        `INSERT INTO campaigns (name) VALUES (?)`,
        [newName.trim()],
      )
      const campaign: Campaign = {
        id: result.lastInsertRowid,
        name: newName.trim(),
        createdAt: new Date().toISOString(),
        lastOpened: new Date().toISOString(),
      }
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
        const rows = await window.electronAPI.dbQuery<Campaign>(
          'SELECT id, name, created_at as createdAt, last_opened as lastOpened FROM campaigns WHERE id = ?',
          [result.campaignId],
        )
        if (rows[0]) addCampaign(rows[0])
      } else if (result && !result.success) {
        setError(t('dashboard.importError', { error: result.error ?? '' }))
      }
    } catch (err) {
      setError(t('dashboard.importError', { error: formatError(err) }))
    }
  }

  // Row actions: rename, duplicate, delete, export.
  async function handleRename(campaign: Campaign, next: string) {
    const name = next.trim()
    if (!name || name === campaign.name || !window.electronAPI) return
    try {
      await window.electronAPI.dbRun('UPDATE campaigns SET name = ? WHERE id = ?', [
        name,
        campaign.id,
      ])
      updateCampaign(campaign.id, { name })
    } catch (err) {
      setError(formatError(err))
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

  async function handleDelete(campaign: Campaign) {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.confirmDialog(
      t('dashboard.deleteTitle'),
      t('dashboard.deleteMessage', { name: campaign.name }),
    )
    if (!confirmed) return
    try {
      await window.electronAPI.dbRun('DELETE FROM campaigns WHERE id = ?', [campaign.id])
      removeCampaign(campaign.id)
    } catch (err) {
      setError(t('dashboard.deleteError', { error: formatError(err) }))
    }
  }

  function handleExport(campaign: Campaign) {
    window.electronAPI?.exportCampaign(campaign.id)
  }

  const greeting = pickGreeting(t)
  const mostRecent = campaigns[0] ?? null
  const others = campaigns.slice(1)

  return (
    <div className="bb-dash">
      <DashboardStyles />

      <TopBar
        language={language}
        onToggleLang={toggleLanguage}
        onNewCampaign={() => setCreating(true)}
        searchPlaceholder={t('dashboard.searchPlaceholder')}
        newCampaignLabel={t('startScreen.newCampaign')}
      />

      <main className="bb-dash-main">
        <header className="bb-dash-greeting">
          <div className="bb-dash-greeting-kicker">{greeting}</div>
          <h1 className="bb-dash-greeting-title">
            {mostRecent ? (
              <Trans
                i18nKey="dashboard.taglineWithCampaign"
                values={{ name: mostRecent.name }}
                components={{ accent: <span className="bb-dash-accent-italic" /> }}
              />
            ) : (
              t('dashboard.taglineEmpty')
            )}
          </h1>
        </header>

        {!window.electronAPI && (
          <div className="bb-dash-warn" role="alert">
            ⚠️ {t('dashboard.preloadMissing')}
          </div>
        )}

        {campaigns.length === 0 ? (
          <EmptySlate
            onCreate={() => setCreating(true)}
            onImport={handleImport}
            createLabel={t('startScreen.newCampaign')}
            importLabel={t('startScreen.importCampaign')}
            title={t('startScreen.noCampaigns')}
            description={t('startScreen.noCampaignsDesc')}
          />
        ) : (
          <>
            {mostRecent && (
              <HeroCard
                campaign={mostRecent}
                stats={stats[mostRecent.id]}
                onOpen={() => setActiveCampaign(mostRecent.id)}
              />
            )}

            {others.length > 0 && (
              <section className="bb-dash-section">
                <h2 className="bb-dash-section-title display">{t('dashboard.yourCampaigns')}</h2>
                <div className="bb-dash-grid">
                  {others.map((c) => (
                    <CampaignCard
                      key={c.id}
                      campaign={c}
                      stats={stats[c.id]}
                      onOpen={() => setActiveCampaign(c.id)}
                      onRename={(name) => handleRename(c, name)}
                      onDuplicate={() => handleDuplicate(c)}
                      onDelete={() => handleDelete(c)}
                      onExport={() => handleExport(c)}
                    />
                  ))}
                </div>
              </section>
            )}

            {recentMaps.length > 0 && (
              <section className="bb-dash-section">
                <h2 className="bb-dash-section-title display">{t('dashboard.recentMaps')}</h2>
                <RecentMapsStrip
                  maps={recentMaps}
                  onOpen={(m) => setActiveCampaign(m.campaignId)}
                />
              </section>
            )}

            <section className="bb-dash-section">
              <h2 className="bb-dash-section-title display">{t('dashboard.quickActions')}</h2>
              <QuickActions
                onNewCampaign={() => setCreating(true)}
                onImportCampaign={handleImport}
                onOpenFolder={() => window.electronAPI?.openContentFolder()}
                newCampaignLabel={t('dashboard.qaNewCampaign')}
                newCampaignDesc={t('dashboard.qaNewCampaignDesc')}
                importCampaignLabel={t('dashboard.qaImportCampaign')}
                importCampaignDesc={t('dashboard.qaImportCampaignDesc')}
                openFolderLabel={t('dashboard.qaOpenFolder')}
                openFolderDesc={t('dashboard.qaOpenFolderDesc')}
              />
            </section>
          </>
        )}

        {error && <div className="bb-dash-error">⚠️ {error}</div>}
      </main>

      {creating && (
        <CreateCampaignModal
          value={newName}
          onChange={setNewName}
          onConfirm={handleCreate}
          onCancel={() => {
            setCreating(false)
            setNewName('')
          }}
          placeholder={t('startScreen.campaignNamePlaceholder')}
          confirmLabel={t('startScreen.create')}
          cancelLabel={t('dashboard.cancel')}
          title={t('startScreen.newCampaign')}
        />
      )}
    </div>
  )
}

// ─── Top bar ───────────────────────────────────────────────────────────

function TopBar({
  language,
  onToggleLang,
  onNewCampaign,
  searchPlaceholder,
  newCampaignLabel,
}: {
  language: 'de' | 'en'
  onToggleLang: () => void
  onNewCampaign: () => void
  searchPlaceholder: string
  newCampaignLabel: string
}) {
  // The search field is a trigger, not a real input — clicking it opens the
  // existing command palette via the same mechanism App.tsx already listens
  // for (Ctrl/Cmd + K). Keeps the palette as single source of truth.
  function openPalette() {
    window.dispatchEvent(new CustomEvent('dashboard:open-palette'))
  }

  return (
    <header className="bb-dash-topbar">
      <div className="bb-dash-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="var(--accent)" />
        </svg>
        <span className="bb-dash-wordmark">
          BOLT<span style={{ color: 'var(--accent-blue-light)' }}>BERRY</span>
        </span>
      </div>

      <button className="bb-dash-search" onClick={openPalette} type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span>{searchPlaceholder}</span>
        <kbd className="bb-dash-kbd">⌘K</kbd>
      </button>

      <div className="bb-dash-topbar-actions">
        <button className="bb-dash-cta" onClick={onNewCampaign} type="button">
          {newCampaignLabel}
        </button>
        <div className="bb-dash-lang" role="group" aria-label="Language">
          {(['de', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                if (language !== l) onToggleLang()
              }}
              className={language === l ? 'active' : ''}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

// ─── Empty state (zero campaigns) ─────────────────────────────────────

function EmptySlate({
  onCreate,
  onImport,
  createLabel,
  importLabel,
  title,
  description,
}: {
  onCreate: () => void
  onImport: () => void
  createLabel: string
  importLabel: string
  title: string
  description: string
}) {
  return (
    <div className="bb-dash-empty">
      <div className="bb-dash-empty-icon">📜</div>
      <h2 className="bb-dash-empty-title">{title}</h2>
      <p className="bb-dash-empty-desc">{description}</p>
      <div className="bb-dash-empty-actions">
        <button className="bb-dash-cta bb-dash-cta-lg" onClick={onCreate} type="button">
          {createLabel}
        </button>
        <button className="bb-dash-cta bb-dash-cta-ghost" onClick={onImport} type="button">
          📥 {importLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Create campaign modal ───────────────────────────────────────────

function CreateCampaignModal({
  value,
  onChange,
  onConfirm,
  onCancel,
  placeholder,
  confirmLabel,
  cancelLabel,
  title,
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  placeholder: string
  confirmLabel: string
  cancelLabel: string
  title: string
}) {
  return (
    <div className="bb-dash-modal-backdrop" onClick={onCancel}>
      <div className="bb-dash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bb-dash-modal-title">{title}</div>
        <input
          className="input"
          autoFocus
          placeholder={placeholder}
          maxLength={60}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="bb-dash-modal-actions">
          <button className="bb-dash-cta bb-dash-cta-ghost" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="bb-dash-cta" onClick={onConfirm} type="button" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Hero card ─────────────────────────────────────────────────────────

function HeroCard({
  campaign,
  stats,
  onOpen,
}: {
  campaign: Campaign
  stats: CampaignStats | undefined
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const lastEditedLabel = useRelativeTime(campaign.lastOpened)

  return (
    <section
      className="bb-dash-hero"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="bb-dash-hero-cover">
        <MapThumbnail path={stats?.thumbnailPath ?? null} campaignName={campaign.name} />
        <div className="bb-dash-hero-cover-fade" aria-hidden="true" />
      </div>

      <div className="bb-dash-hero-body">
        <div className="bb-dash-hero-kicker">
          <span className="bb-dash-dot" aria-hidden="true" />
          {t('dashboard.lastEdited')} · {lastEditedLabel}
        </div>

        <h2 className="bb-dash-hero-title display">{campaign.name}</h2>

        <div className="bb-dash-hero-metrics">
          <Metric label={t('dashboard.characters')} value={stats?.party.length ?? 0}>
            {stats && stats.party.length > 0 ? <PartyAvatars party={stats.party} /> : null}
          </Metric>
          <div className="bb-dash-hero-sep" aria-hidden="true" />
          <Metric label={t('dashboard.maps')} value={stats?.mapCount ?? 0} />
          <div className="bb-dash-hero-sep" aria-hidden="true" />
          <Metric label={t('dashboard.handouts')} value={stats?.handoutCount ?? 0} />
        </div>

        <div className="bb-dash-hero-cta">
          <button
            className="bb-dash-cta bb-dash-cta-lg"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" />
            </svg>
            {t('dashboard.resume')}
          </button>
        </div>
      </div>
    </section>
  )
}

// ─── Compact campaign card (grid) ─────────────────────────────────────

function CampaignCard({
  campaign,
  stats,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
}: {
  campaign: Campaign
  stats: CampaignStats | undefined
  onOpen: () => void
  onRename: (name: string) => void
  onDuplicate: () => void
  onDelete: () => void
  onExport: () => void
}) {
  const { t } = useTranslation()
  const lastEditedLabel = useRelativeTime(campaign.lastOpened)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(campaign.name)

  function commitRename() {
    onRename(renameValue)
    setRenaming(false)
  }

  return (
    <article
      className="bb-dash-card"
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
      role="button"
      tabIndex={0}
    >
      <div className="bb-dash-card-cover">
        <MapThumbnail path={stats?.thumbnailPath ?? null} campaignName={campaign.name} />
        <div className="bb-dash-card-cover-fade" aria-hidden="true" />
      </div>

      <div className="bb-dash-card-body">
        {renaming ? (
          <input
            className="input bb-dash-card-rename"
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
          <h3 className="bb-dash-card-title display">{campaign.name}</h3>
        )}

        <div className="bb-dash-card-meta mono">
          {lastEditedLabel}
          <span className="bb-dash-card-meta-sep">·</span>
          {stats?.mapCount ?? 0} {t('dashboard.maps').toLowerCase()}
          {typeof stats?.handoutCount === 'number' && stats.handoutCount > 0 && (
            <>
              <span className="bb-dash-card-meta-sep">·</span>
              {stats.handoutCount} {t('dashboard.handouts').toLowerCase()}
            </>
          )}
        </div>

        {stats && stats.party.length > 0 && (
          <div className="bb-dash-card-party">
            <PartyAvatars party={stats.party} max={4} size={22} />
          </div>
        )}

        <CardActions
          renaming={renaming}
          onStartRename={() => {
            setRenameValue(campaign.name)
            setRenaming(true)
          }}
          onCancelRename={() => setRenaming(false)}
          onCommitRename={commitRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
          renameLabel={t('dashboard.rename')}
          duplicateLabel={t('dashboard.duplicate')}
          deleteLabel={t('dashboard.delete')}
          exportLabel={t('dashboard.export')}
        />
      </div>
    </article>
  )
}

function CardActions({
  renaming,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onDuplicate,
  onDelete,
  onExport,
  renameLabel,
  duplicateLabel,
  deleteLabel,
  exportLabel,
}: {
  renaming: boolean
  onStartRename: () => void
  onCancelRename: () => void
  onCommitRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onExport: () => void
  renameLabel: string
  duplicateLabel: string
  deleteLabel: string
  exportLabel: string
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }
  if (renaming) {
    return (
      <div className="bb-dash-card-actions">
        <button className="bb-dash-card-action" type="button" onClick={stop(onCommitRename)}>
          ✓
        </button>
        <button className="bb-dash-card-action" type="button" onClick={stop(onCancelRename)}>
          ✕
        </button>
      </div>
    )
  }
  return (
    <div className="bb-dash-card-actions">
      <button className="bb-dash-card-action" type="button" title={renameLabel} onClick={stop(onStartRename)}>
        ✏️
      </button>
      <button className="bb-dash-card-action" type="button" title={duplicateLabel} onClick={stop(onDuplicate)}>
        📋
      </button>
      <button className="bb-dash-card-action" type="button" title={exportLabel} onClick={stop(onExport)}>
        ⇪
      </button>
      <button
        className="bb-dash-card-action bb-dash-card-action-danger"
        type="button"
        title={deleteLabel}
        onClick={stop(onDelete)}
      >
        🗑
      </button>
    </div>
  )
}

function Metric({
  label,
  value,
  children,
}: {
  label: string
  value: number
  children?: React.ReactNode
}) {
  return (
    <div className="bb-dash-metric">
      <div className="bb-dash-metric-label">{label}</div>
      {children ?? <div className="bb-dash-metric-value mono">{value}</div>}
    </div>
  )
}

function MapThumbnail({ path, campaignName }: { path: string | null; campaignName: string }) {
  const url = useImageUrl(path)
  if (!path || !url) {
    // Fallback: first letter of the campaign name on a soft tinted block.
    const initial = campaignName.trim().charAt(0).toUpperCase() || '?'
    const hue = hashHue(campaignName)
    return (
      <div
        className="bb-dash-thumb-fallback display"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 40% 24%), hsl(${hue} 30% 14%))`,
        }}
      >
        {initial}
      </div>
    )
  }
  return <img className="bb-dash-thumb-img" src={url} alt="" draggable={false} />
}

function PartyAvatars({
  party,
  max = 4,
  size = 26,
}: {
  party: CampaignStats['party']
  max?: number
  size?: number
}) {
  const shown = party.slice(0, max)
  const extra = party.length - shown.length
  return (
    <div className="bb-dash-party">
      {shown.map((p, i) => {
        const initial = (p.name.trim().charAt(0) || '?').toUpperCase()
        const hue = hashHue(p.name + p.className)
        return (
          <div
            key={`${p.name}-${i}`}
            className="bb-dash-party-avatar"
            title={`${p.name} · ${p.className}${p.level ? ' · Lv ' + p.level : ''}`}
            style={{
              width: size,
              height: size,
              marginLeft: i === 0 ? 0 : -8,
              background: `hsl(${hue} 55% 55%)`,
              zIndex: max - i,
              fontSize: size * 0.42,
            }}
          >
            {initial}
          </div>
        )
      })}
      {extra > 0 && (
        <div
          className="bb-dash-party-avatar bb-dash-party-extra"
          style={{ width: size, height: size, marginLeft: -8, fontSize: size * 0.4 }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}

// ─── Recent maps strip ─────────────────────────────────────────────────

function RecentMapsStrip({
  maps,
  onOpen,
}: {
  maps: RecentMap[]
  onOpen: (m: RecentMap) => void
}) {
  return (
    <div className="bb-dash-maps-strip">
      {maps.map((m) => (
        <button
          key={m.id}
          type="button"
          className="bb-dash-map-tile"
          onClick={() => onOpen(m)}
          title={`${m.name} · ${m.campaignName}`}
        >
          <div className="bb-dash-map-cover">
            <MapThumbnail path={m.imagePath} campaignName={m.name} />
            <div className="bb-dash-card-cover-fade" aria-hidden="true" />
          </div>
          <div className="bb-dash-map-body">
            <div className="bb-dash-map-name">{m.name}</div>
            <div className="bb-dash-map-sub">{m.campaignName}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Quick actions ─────────────────────────────────────────────────────

function QuickActions({
  onNewCampaign,
  onImportCampaign,
  onOpenFolder,
  newCampaignLabel,
  newCampaignDesc,
  importCampaignLabel,
  importCampaignDesc,
  openFolderLabel,
  openFolderDesc,
}: {
  onNewCampaign: () => void
  onImportCampaign: () => void
  onOpenFolder: () => void
  newCampaignLabel: string
  newCampaignDesc: string
  importCampaignLabel: string
  importCampaignDesc: string
  openFolderLabel: string
  openFolderDesc: string
}) {
  return (
    <div className="bb-dash-qa-grid">
      <QuickActionTile
        onClick={onNewCampaign}
        color="var(--accent)"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        }
        label={newCampaignLabel}
        desc={newCampaignDesc}
      />
      <QuickActionTile
        onClick={onImportCampaign}
        color="var(--accent-blue-light)"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        }
        label={importCampaignLabel}
        desc={importCampaignDesc}
      />
      <QuickActionTile
        onClick={onOpenFolder}
        color="#a78bfa"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          </svg>
        }
        label={openFolderLabel}
        desc={openFolderDesc}
      />
    </div>
  )
}

function QuickActionTile({
  onClick,
  color,
  icon,
  label,
  desc,
}: {
  onClick: () => void
  color: string
  icon: React.ReactNode
  label: string
  desc: string
}) {
  return (
    <button type="button" className="bb-dash-qa-tile" onClick={onClick}>
      <div className="bb-dash-qa-icon" style={{ color, borderColor: `${color}40` }}>
        {icon}
      </div>
      <div className="bb-dash-qa-text">
        <div className="bb-dash-qa-label">{label}</div>
        <div className="bb-dash-qa-desc">{desc}</div>
      </div>
    </button>
  )
}

// ─── Data loader ───────────────────────────────────────────────────────

async function loadStats(campaignIds: number[]): Promise<StatsMap> {
  if (!window.electronAPI || campaignIds.length === 0) return {}

  const placeholders = campaignIds.map(() => '?').join(',')

  const [maps, handouts, chars] = await Promise.all([
    window.electronAPI.dbQuery<{ campaign_id: number; image_path: string; order_index: number }>(
      `SELECT campaign_id, image_path, order_index
       FROM maps WHERE campaign_id IN (${placeholders}) ORDER BY order_index ASC`,
      campaignIds,
    ),
    window.electronAPI.dbQuery<{ campaign_id: number; n: number }>(
      `SELECT campaign_id, COUNT(*) as n FROM handouts
       WHERE campaign_id IN (${placeholders}) GROUP BY campaign_id`,
      campaignIds,
    ),
    window.electronAPI.dbQuery<{ campaign_id: number; name: string; class_name: string; level: number }>(
      `SELECT campaign_id, name, class_name, level
       FROM character_sheets WHERE campaign_id IN (${placeholders})
       ORDER BY level DESC, id ASC`,
      campaignIds,
    ),
  ])

  const out: StatsMap = {}
  for (const id of campaignIds) {
    out[id] = { mapCount: 0, handoutCount: 0, thumbnailPath: null, party: [] }
  }
  for (const row of maps) {
    const entry = out[row.campaign_id]
    if (!entry) continue
    entry.mapCount += 1
    if (entry.thumbnailPath === null) entry.thumbnailPath = row.image_path
  }
  for (const row of handouts) {
    const entry = out[row.campaign_id]
    if (entry) entry.handoutCount = row.n
  }
  for (const row of chars) {
    const entry = out[row.campaign_id]
    if (entry) {
      entry.party.push({ name: row.name, className: row.class_name, level: row.level })
    }
  }
  return out
}

async function loadRecentMaps(campaignIds: number[]): Promise<RecentMap[]> {
  if (!window.electronAPI || campaignIds.length === 0) return []
  const placeholders = campaignIds.map(() => '?').join(',')
  // maps has no updated_at / created_at — we use the autoincrement id as a
  // proxy for recency. Newer maps have larger ids, so DESC surfaces
  // recently-imported ones first.
  const rows = await window.electronAPI.dbQuery<{
    id: number
    name: string
    image_path: string
    campaign_id: number
    campaign_name: string
  }>(
    `SELECT m.id, m.name, m.image_path, m.campaign_id, c.name as campaign_name
     FROM maps m
     JOIN campaigns c ON c.id = m.campaign_id
     WHERE m.campaign_id IN (${placeholders})
     ORDER BY m.id DESC
     LIMIT 6`,
    campaignIds,
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    imagePath: r.image_path,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
  }))
}

// ─── Utilities ────────────────────────────────────────────────────────

function pickGreeting(t: (key: string) => string): string {
  const h = new Date().getHours()
  if (h < 5) return t('dashboard.greetingNight')
  if (h < 12) return t('dashboard.greetingMorning')
  if (h < 18) return t('dashboard.greetingDay')
  return t('dashboard.greetingEvening')
}

// Returns a localized relative-time string for an ISO timestamp.
// Memoised on the timestamp — not a live clock; relative times only need to
// be correct when the dashboard is re-opened.
function useRelativeTime(iso: string): string {
  const { t } = useTranslation()
  return useMemo(() => {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diffMs = Date.now() - then
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 60) return t('dashboard.justNow')
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('dashboard.hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days === 1) return t('dashboard.daysAgoOne')
    return t('dashboard.daysAgo', { count: days })
  }, [iso, t])
}

// Deterministic hue from a string — used for card covers and party avatars
// so the same campaign / character always renders the same color.
function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

// ─── Scoped styles ────────────────────────────────────────────────────

function DashboardStyles() {
  return (
    <style>{`
      .bb-dash {
        height: 100%;
        overflow-y: auto;
        background: var(--bg-base);
        color: var(--text-primary);
        user-select: none;
      }
      .bb-dash kbd, .bb-dash .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
      .bb-dash .display {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-weight: 500;
        letter-spacing: -0.01em;
      }

      /* Top bar */
      .bb-dash-topbar {
        position: sticky; top: 0; z-index: 30;
        display: flex; align-items: center; gap: var(--sp-6);
        padding: 0 var(--sp-8); height: 60px;
        background: rgba(13, 16, 21, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--border);
      }
      .bb-dash-brand { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
      .bb-dash-wordmark {
        font-size: 12px; letter-spacing: 0.14em; font-weight: 700;
        color: var(--text-primary);
      }
      .bb-dash-search {
        flex: 1; max-width: 520px; margin: 0 auto;
        display: flex; align-items: center; gap: var(--sp-2);
        padding: var(--sp-2) var(--sp-3);
        background: rgba(13, 16, 21, 0.55);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: var(--text-sm);
        cursor: pointer;
        transition: border-color var(--transition), color var(--transition);
      }
      .bb-dash-search:hover { border-color: var(--border); color: var(--text-secondary); }
      .bb-dash-search > span { flex: 1; text-align: left; }
      .bb-dash-kbd {
        font-size: 10px; color: var(--text-muted);
        border: 1px solid var(--border); border-radius: 3px;
        padding: 1px 5px; line-height: 1;
      }
      .bb-dash-topbar-actions { display: flex; align-items: center; gap: var(--sp-3); flex-shrink: 0; }
      .bb-dash-cta {
        padding: var(--sp-2) var(--sp-4);
        background: var(--accent);
        color: var(--text-inverse);
        border: none; border-radius: var(--radius);
        font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.02em;
        cursor: pointer;
        box-shadow: 0 0 0 1px rgba(255, 198, 46, 0.3), 0 4px 10px rgba(255, 198, 46, 0.18);
        transition: background var(--transition), transform var(--transition);
        font-family: inherit;
      }
      .bb-dash-cta:hover { background: var(--accent-hover); }
      .bb-dash-cta:active { transform: translateY(1px); }
      .bb-dash-cta:disabled { opacity: 0.4; cursor: not-allowed; }
      .bb-dash-cta-lg { padding: var(--sp-3) var(--sp-5); font-size: var(--text-sm); }
      .bb-dash-cta-ghost {
        background: transparent;
        color: var(--text-primary);
        border: 1px solid var(--border);
        box-shadow: none;
      }
      .bb-dash-cta-ghost:hover { background: var(--bg-overlay); }

      .bb-dash-lang {
        display: flex;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .bb-dash-lang button {
        padding: 4px 10px;
        font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
        background: transparent;
        color: var(--text-muted);
        border: none; cursor: pointer;
        font-family: inherit;
      }
      .bb-dash-lang button.active {
        background: var(--accent-dim);
        color: var(--accent);
      }

      /* Main */
      .bb-dash-main {
        max-width: 1200px;
        margin: 0 auto;
        padding: var(--sp-8) var(--sp-8) 64px;
      }

      /* Greeting */
      .bb-dash-greeting { margin-bottom: var(--sp-8); }
      .bb-dash-greeting-kicker {
        font-size: 11px; letter-spacing: 0.14em; font-weight: 700;
        color: var(--accent);
        text-transform: uppercase;
        margin-bottom: var(--sp-2);
      }
      .bb-dash-greeting-title {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-size: 32px; line-height: 1.15; font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        margin: 0; max-width: 720px;
      }
      .bb-dash-accent-italic {
        color: var(--accent);
        font-style: italic;
      }

      /* Warn + error */
      .bb-dash-warn {
        padding: var(--sp-3) var(--sp-4);
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius);
        color: var(--danger);
        font-size: var(--text-sm);
        margin-bottom: var(--sp-6);
      }
      .bb-dash-error {
        margin-top: var(--sp-4);
        padding: var(--sp-3) var(--sp-4);
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius);
        color: var(--danger);
        font-size: var(--text-sm);
      }

      /* Empty state */
      .bb-dash-empty {
        display: flex; flex-direction: column; align-items: center;
        text-align: center;
        padding: 64px var(--sp-6);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
      }
      .bb-dash-empty-icon { font-size: 48px; opacity: 0.6; margin-bottom: var(--sp-4); }
      .bb-dash-empty-title {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-size: 24px; font-weight: 500; margin: 0 0 var(--sp-2);
        color: var(--text-primary);
      }
      .bb-dash-empty-desc {
        color: var(--text-secondary);
        font-size: var(--text-sm);
        max-width: 360px; margin: 0 0 var(--sp-5);
      }
      .bb-dash-empty-actions { display: flex; gap: var(--sp-3); }

      /* Hero card */
      .bb-dash-hero {
        display: grid;
        grid-template-columns: minmax(260px, 1.1fr) 1fr;
        min-height: 280px;
        margin-bottom: var(--sp-8);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        cursor: pointer;
        transition: border-color var(--transition), transform var(--transition), box-shadow var(--transition);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35), 0 4px 8px rgba(0, 0, 0, 0.25);
      }
      .bb-dash-hero:hover {
        border-color: var(--text-muted);
        transform: translateY(-2px);
        box-shadow: 0 22px 54px rgba(0, 0, 0, 0.4), 0 6px 12px rgba(0, 0, 0, 0.3);
      }
      .bb-dash-hero:focus-visible {
        outline: 2px solid var(--accent-blue);
        outline-offset: 2px;
      }

      .bb-dash-hero-cover {
        position: relative;
        min-height: 260px;
        background: var(--bg-elevated);
      }
      .bb-dash-hero-cover-fade {
        position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent 30%, var(--bg-surface) 100%);
        pointer-events: none;
      }

      .bb-dash-hero-body {
        padding: 28px 32px 24px;
        display: flex; flex-direction: column;
      }
      .bb-dash-hero-kicker {
        display: flex; align-items: center; gap: var(--sp-2);
        font-size: 10px; letter-spacing: 0.16em; font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        margin-bottom: var(--sp-2);
      }
      .bb-dash-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent);
      }
      .bb-dash-hero-title {
        font-size: 32px; line-height: 1.08; font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--text-primary);
        margin: 0 0 var(--sp-4) 0;
      }

      .bb-dash-hero-metrics {
        display: flex; gap: var(--sp-6);
        margin-bottom: var(--sp-5);
      }
      .bb-dash-hero-sep { width: 1px; background: var(--border-subtle); }
      .bb-dash-metric { display: flex; flex-direction: column; gap: var(--sp-1); }
      .bb-dash-metric-label {
        font-size: 10px; letter-spacing: 0.1em; font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .bb-dash-metric-value {
        font-size: 22px; font-weight: 500;
        color: var(--text-primary);
        letter-spacing: -0.01em;
        line-height: 1;
      }

      .bb-dash-hero-cta { margin-top: auto; display: flex; gap: var(--sp-2); }

      /* Thumbnail (map image or fallback tile) */
      .bb-dash-thumb-img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
      }
      .bb-dash-thumb-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        font-size: 72px;
        color: rgba(255, 255, 255, 0.55);
      }

      /* Party avatars */
      .bb-dash-party { display: flex; }
      .bb-dash-party-avatar {
        border-radius: 50%;
        color: var(--text-inverse);
        font-family: var(--font-mono);
        font-weight: 700;
        border: 2px solid var(--bg-surface);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .bb-dash-party-extra {
        background: var(--bg-elevated);
        color: var(--text-secondary);
        font-weight: 600;
      }

      @media (max-width: 720px) {
        .bb-dash-hero { grid-template-columns: 1fr; }
        .bb-dash-hero-cover { min-height: 180px; }
        .bb-dash-hero-cover-fade {
          background: linear-gradient(180deg, transparent 50%, var(--bg-surface) 100%);
        }
      }

      /* Section heading (shared) */
      .bb-dash-section { margin-bottom: var(--sp-8); }
      .bb-dash-section-title {
        font-size: 20px; margin: 0 0 var(--sp-4);
        color: var(--text-primary);
      }

      /* Campaign grid */
      .bb-dash-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--sp-4);
      }

      .bb-dash-card {
        display: flex; flex-direction: column;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        overflow: hidden;
        cursor: pointer;
        transition: border-color var(--transition), transform var(--transition), box-shadow var(--transition);
      }
      .bb-dash-card:hover {
        border-color: var(--text-muted);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }
      .bb-dash-card:focus-visible {
        outline: 2px solid var(--accent-blue);
        outline-offset: 2px;
      }

      .bb-dash-card-cover {
        position: relative; height: 120px;
        background: var(--bg-elevated);
      }
      .bb-dash-card-cover-fade {
        position: absolute; inset: 0;
        background: linear-gradient(180deg, transparent 50%, rgba(13, 16, 21, 0.9) 100%);
      }

      .bb-dash-card-body {
        padding: var(--sp-4);
        display: flex; flex-direction: column;
        gap: var(--sp-2);
      }
      .bb-dash-card-title {
        font-size: 18px; line-height: 1.2; font-weight: 500;
        margin: 0;
        letterSpacing: -0.005em;
        color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bb-dash-card-rename { font-size: var(--text-sm); padding: 4px 8px; height: 28px; }
      .bb-dash-card-meta {
        font-size: 11px;
        color: var(--text-muted);
        display: flex; align-items: center; gap: 6px;
        flex-wrap: wrap;
      }
      .bb-dash-card-meta-sep { color: var(--text-muted); opacity: 0.6; }
      .bb-dash-card-party { margin-top: 2px; }

      .bb-dash-card-actions {
        display: flex; gap: 4px;
        margin-top: auto;
        padding-top: var(--sp-2);
        border-top: 1px solid var(--border-subtle);
      }
      .bb-dash-card-action {
        flex-shrink: 0;
        padding: 4px 8px;
        background: transparent;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        color: var(--text-muted);
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .bb-dash-card-action:hover {
        background: var(--bg-overlay);
        color: var(--text-primary);
        border-color: var(--border);
      }
      .bb-dash-card-action-danger { border-color: rgba(239, 68, 68, 0.3); color: var(--danger); }
      .bb-dash-card-action-danger:hover {
        background: rgba(239, 68, 68, 0.12);
        border-color: var(--danger);
      }

      /* Recent maps strip */
      .bb-dash-maps-strip {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: var(--sp-3);
      }
      .bb-dash-map-tile {
        display: flex; flex-direction: column;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
        cursor: pointer;
        padding: 0;
        font-family: inherit;
        color: inherit;
        text-align: left;
        transition: border-color var(--transition), transform var(--transition);
      }
      .bb-dash-map-tile:hover {
        border-color: var(--text-muted);
        transform: translateY(-2px);
      }
      .bb-dash-map-cover { position: relative; height: 72px; background: var(--bg-elevated); }
      .bb-dash-map-body { padding: var(--sp-2) var(--sp-3) var(--sp-3); }
      .bb-dash-map-name {
        font-size: 12px; font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .bb-dash-map-sub {
        font-size: 10px;
        color: var(--text-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        margin-top: 2px;
      }

      /* Quick actions */
      .bb-dash-qa-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--sp-3);
      }
      .bb-dash-qa-tile {
        display: flex; align-items: center; gap: var(--sp-3);
        padding: var(--sp-4);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-primary);
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        transition: border-color var(--transition), transform var(--transition);
      }
      .bb-dash-qa-tile:hover {
        border-color: var(--text-muted);
        transform: translateY(-2px);
      }
      .bb-dash-qa-icon {
        width: 36px; height: 36px;
        display: flex; align-items: center; justify-content: center;
        border-radius: var(--radius-sm);
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid;
        flex-shrink: 0;
      }
      .bb-dash-qa-text { display: flex; flex-direction: column; gap: 2px; }
      .bb-dash-qa-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
      .bb-dash-qa-desc { font-size: 11px; color: var(--text-muted); }

      /* Modal */
      .bb-dash-modal-backdrop {
        position: fixed; inset: 0; z-index: 9900;
        background: rgba(0, 0, 0, 0.65);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(2px);
      }
      .bb-dash-modal {
        width: min(440px, 90vw);
        padding: var(--sp-5);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
        display: flex; flex-direction: column; gap: var(--sp-4);
      }
      .bb-dash-modal-title {
        font-size: var(--text-md); font-weight: 700;
        color: var(--text-primary);
      }
      .bb-dash-modal-actions {
        display: flex; justify-content: flex-end; gap: var(--sp-2);
      }
    `}</style>
  )
}
