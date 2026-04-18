import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../stores/campaignStore'
import { useUIStore } from '../stores/uiStore'
import { NotesPanel } from './sidebar/panels/NotesPanel'
import { CharacterSheetPanel } from './sidebar/panels/CharacterSheetPanel'
import { HandoutsPanel } from './sidebar/panels/HandoutsPanel'
import { AudioPanel } from './sidebar/panels/AudioPanel'
import { TokenLibraryPanel } from './sidebar/panels/TokenLibraryPanel'
import {
  CampaignDataStyles,
  MapThumbnail,
  useCampaignStats,
  useRelativeTime,
} from './campaign-data'
import type { MapRecord } from '@shared/ipc-types'

/* Campaign workspace — shown when a campaign is open but no map is
   active. Uses the dashboard aesthetic (Fraunces titles, dark cards,
   Bolt-yellow CTA) so that the whole "between sessions" experience —
   Welcome → Workspace → Map view — shares one visual language. */

type Tab = 'notes' | 'characters' | 'library' | 'handouts' | 'audio'

const TABS: { id: Tab; icon: string; i18nKey: string }[] = [
  { id: 'notes',      icon: '📝', i18nKey: 'workspace.tabNotes' },
  { id: 'characters', icon: '👤', i18nKey: 'workspace.tabCharacters' },
  { id: 'library',    icon: '📚', i18nKey: 'workspace.tabLibrary' },
  { id: 'handouts',   icon: '📄', i18nKey: 'workspace.tabHandouts' },
  { id: 'audio',      icon: '🎵', i18nKey: 'workspace.tabAudio' },
]

export function CampaignView() {
  const { t } = useTranslation()
  const {
    activeCampaignId,
    campaigns,
    activeMaps,
    setActiveMaps,
    setActiveMap,
    addMap,
    setActiveCampaign,
  } = useCampaignStore()
  const { playerConnected, language, toggleLanguage } = useUIStore()

  const [tab, setTab] = useState<Tab>('notes')
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [importing, setImporting] = useState(false)

  const campaign = campaigns.find((c) => c.id === activeCampaignId)
  const campaignIds = useMemo(
    () => (activeCampaignId ? [activeCampaignId] : []),
    [activeCampaignId],
  )
  const stats = useCampaignStats(campaignIds)
  const selfStats = activeCampaignId ? stats[activeCampaignId] : undefined

  // Populate activeMaps so the "Spielansicht" button knows which map to open.
  useEffect(() => {
    if (!activeCampaignId) return
    setMapsLoaded(false)
    loadMaps(activeCampaignId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaignId])

  // Command-palette → workspace tab deep-link. Lets a DM open the Bestiarium
  // via Ctrl+K from anywhere in the campaign.
  useEffect(() => {
    function onOpenTab(e: Event) {
      const detail = (e as CustomEvent<Tab>).detail
      if (TABS.some((tb) => tb.id === detail)) setTab(detail)
    }
    window.addEventListener('workspace:open-tab', onOpenTab)
    return () => window.removeEventListener('workspace:open-tab', onOpenTab)
  }, [])

  async function loadMaps(campaignId: number) {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number; campaign_id: number; name: string; image_path: string
        grid_type: string; grid_size: number; ft_per_unit: number; order_index: number
        camera_x: number | null; camera_y: number | null; camera_scale: number | null
        rotation: number | null; grid_offset_x: number; grid_offset_y: number
        ambient_brightness: number; ambient_track_path: string | null
        track1_volume: number; track2_volume: number; combat_volume: number
        rotation_player: number
      }>(
        'SELECT id, campaign_id, name, image_path, grid_type, grid_size, ft_per_unit, order_index, camera_x, camera_y, camera_scale, rotation, rotation_player, grid_offset_x, grid_offset_y, ambient_brightness, ambient_track_path, track1_volume, track2_volume, combat_volume FROM maps WHERE campaign_id = ? ORDER BY order_index',
        [campaignId],
      )
      setActiveMaps(rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        name: r.name,
        imagePath: r.image_path,
        gridType: r.grid_type as MapRecord['gridType'],
        gridSize: r.grid_size,
        ftPerUnit: r.ft_per_unit ?? 5,
        orderIndex: r.order_index,
        rotation: r.rotation ?? 0,
        rotationPlayer: r.rotation_player ?? 0,
        gridOffsetX: r.grid_offset_x ?? 0,
        gridOffsetY: r.grid_offset_y ?? 0,
        ambientBrightness: r.ambient_brightness ?? 100,
        cameraX: r.camera_x ?? null,
        cameraY: r.camera_y ?? null,
        cameraScale: r.camera_scale ?? null,
        ambientTrackPath: r.ambient_track_path ?? null,
        track1Volume: r.track1_volume ?? 1,
        track2Volume: r.track2_volume ?? 1,
        combatVolume: r.combat_volume ?? 1,
      })))
    } catch (err) {
      console.error('[CampaignView] loadMaps failed:', err)
    } finally {
      setMapsLoaded(true)
    }
  }

  async function handleImportFirstMap() {
    if (!activeCampaignId || !window.electronAPI || importing) return
    setImporting(true)
    try {
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      if (!asset) return

      const fileName = asset.path.split(/[\\/]/).pop() || ''
      const finalMapName = fileName.replace(/\.[^/.]+$/, '') || 'Neue Karte'

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, rotation_player, grid_offset_x, grid_offset_y, ambient_brightness) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 100)`,
        [activeCampaignId, finalMapName, asset.path, activeMaps.length],
      )
      const newMap: MapRecord = {
        id: result.lastInsertRowid,
        campaignId: activeCampaignId,
        name: finalMapName,
        imagePath: asset.path,
        gridType: 'square',
        gridSize: 50,
        ftPerUnit: 5,
        orderIndex: activeMaps.length,
        rotation: 0,
        rotationPlayer: 0,
        gridOffsetX: 0,
        gridOffsetY: 0,
        ambientBrightness: 100,
        cameraX: null,
        cameraY: null,
        cameraScale: null,
        ambientTrackPath: null,
        track1Volume: 1,
        track2Volume: 1,
        combatVolume: 1,
      }
      addMap(newMap)
      setActiveMap(newMap.id)
    } catch (err) {
      console.error('[CampaignView] importFirstMap failed:', err)
    } finally {
      setImporting(false)
    }
  }

  const loading = !mapsLoaded || importing
  const hasMaps = mapsLoaded && activeMaps.length > 0
  const heroMap = hasMaps ? activeMaps[0] : null

  return (
    <div className="bb-ws">
      <WorkspaceStyles />
      <CampaignDataStyles />

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <header className="bb-ws-topbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <button
          type="button"
          className="bb-ws-back"
          onClick={() => setActiveCampaign(null)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ◁ {t('workspace.backToCampaigns')}
        </button>

        <div className="bb-ws-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="var(--accent)" />
          </svg>
          <span className="bb-ws-wordmark">
            BOLT<span style={{ color: 'var(--accent-blue-light)' }}>BERRY</span>
          </span>
          <span className="bb-ws-breadcrumb-sep">/</span>
          <span className="bb-ws-breadcrumb-name">{campaign?.name ?? ''}</span>
        </div>

        <div className="bb-ws-topbar-actions" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {playerConnected && (
            <div className="bb-ws-player-pill" title={t('workspace.playerWindowOpen')}>
              <span className="bb-ws-player-dot" aria-hidden="true" />
              {t('workspace.playerWindow')}
              <button
                type="button"
                className="bb-ws-player-close"
                onClick={() => window.electronAPI?.closePlayerWindow()}
                title={t('workspace.closePlayerWindow')}
              >
                ✕
              </button>
            </div>
          )}

          <PlayButton
            loading={loading}
            hasMaps={hasMaps}
            onStart={() => hasMaps && setActiveMap(activeMaps[0].id)}
            onImportFirst={handleImportFirstMap}
            labelStart={t('workspace.openGameView')}
            labelImport={t('workspace.importFirstMap')}
            labelLoading={t('workspace.loading')}
          />

          <button
            type="button"
            className="bb-ws-compendium"
            title={t('compendium.title')}
            onClick={() => useUIStore.getState().setTopView('compendium')}
          >
            📚
          </button>

          <div className="bb-ws-lang" role="group" aria-label="Language">
            {(['de', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  if (language !== l) toggleLanguage()
                }}
                className={language === l ? 'active' : ''}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main scroll area ──────────────────────────────────────── */}
      <main className="bb-ws-main">
        <div className="bb-ws-inner">
          {/* Greeting */}
          <div className="bb-ws-greeting">
            <div className="bb-ws-greeting-kicker">{t('workspace.campaignKicker')}</div>
            <h1 className="bb-ws-greeting-title display">{campaign?.name ?? ''}</h1>
            <div className="bb-ws-greeting-meta mono">
              {selfStats?.mapCount ?? 0} {t('dashboard.maps').toLowerCase()}
              <span className="bb-ws-meta-sep">·</span>
              {selfStats?.party.length ?? 0} {t('dashboard.characters').toLowerCase()}
              <span className="bb-ws-meta-sep">·</span>
              {selfStats?.handoutCount ?? 0} {t('dashboard.handouts').toLowerCase()}
            </div>
          </div>

          {/* Hero: most recent map (or import CTA) */}
          {heroMap ? (
            <HeroMap
              map={heroMap}
              campaignName={campaign?.name ?? ''}
              coverPath={campaign?.coverPath ?? null}
              onOpen={() => setActiveMap(heroMap.id)}
              label={t('workspace.openGameView')}
              kicker={t('workspace.continueAtMap')}
            />
          ) : mapsLoaded ? (
            <HeroEmpty
              onImport={handleImportFirstMap}
              title={t('workspace.noMapsTitle')}
              sub={t('workspace.noMapsSub')}
              cta={t('workspace.importFirstMap')}
              importing={importing}
            />
          ) : null}

          {/* Tab strip (dashboard-style pills) */}
          <div className="bb-ws-tabs">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                className={tb.id === tab ? 'bb-ws-tab active' : 'bb-ws-tab'}
                onClick={() => setTab(tb.id)}
              >
                <span className="bb-ws-tab-icon">{tb.icon}</span>
                {t(tb.i18nKey)}
              </button>
            ))}
          </div>

          {/* Tab panel — fade-in on switch binds all panels visually. */}
          <div className="bb-ws-panel" key={tab}>
            {tab === 'notes' && (
              <div className="bb-ws-panel-inner bb-ws-panel-notes">
                <NotesPanel />
              </div>
            )}
            {tab === 'characters' && (
              <>
                <PanelHeader title={t('workspace.tabCharacters')} hint={t('workspace.hintCharacters')} />
                <div className="bb-ws-panel-inner bb-ws-panel-characters">
                  <CharacterSheetPanel />
                </div>
              </>
            )}
            {tab === 'library' && (
              <div className="bb-ws-panel-inner bb-ws-panel-library">
                <TokenLibraryPanel />
              </div>
            )}
            {tab === 'handouts' && (
              <>
                <PanelHeader title={t('workspace.tabHandouts')} hint={t('workspace.hintHandouts')} />
                <div className="bb-ws-panel-inner bb-ws-panel-handouts">
                  <HandoutsPanel />
                </div>
              </>
            )}
            {tab === 'audio' && (
              <>
                <PanelHeader title={t('workspace.tabAudio')} hint={t('workspace.hintAudio')} />
                <div className="bb-ws-panel-inner bb-ws-panel-audio">
                  <AudioPanel layout="wide" />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Hero (most-recent map card) ──────────────────────────────────────

function HeroMap({
  map,
  campaignName,
  coverPath,
  onOpen,
  label,
  kicker,
}: {
  map: MapRecord
  campaignName: string
  coverPath: string | null
  onOpen: () => void
  label: string
  kicker: string
}) {
  return (
    <section
      className="bb-ws-hero"
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
      <div className="bb-ws-hero-cover">
        <MapThumbnail path={coverPath ?? map.imagePath} campaignName={campaignName} />
        <div className="bb-ws-hero-cover-fade" aria-hidden="true" />
      </div>
      <div className="bb-ws-hero-body">
        <div className="bb-ws-hero-kicker">
          <span className="bb-ws-hero-dot" aria-hidden="true" />
          {kicker}
        </div>
        <h2 className="bb-ws-hero-title display">{map.name}</h2>
        <button
          type="button"
          className="bb-ws-cta bb-ws-cta-lg"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          {label}
        </button>
      </div>
    </section>
  )
}

function HeroEmpty({
  onImport,
  title,
  sub,
  cta,
  importing,
}: {
  onImport: () => void
  title: string
  sub: string
  cta: string
  importing: boolean
}) {
  return (
    <section className="bb-ws-hero-empty">
      <div className="bb-ws-hero-empty-icon">🗺️</div>
      <h2 className="bb-ws-hero-empty-title display">{title}</h2>
      <p className="bb-ws-hero-empty-sub">{sub}</p>
      <button type="button" className="bb-ws-cta bb-ws-cta-lg" onClick={onImport} disabled={importing}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {cta}
      </button>
    </section>
  )
}

// ─── Play button (loading / play / import-first) ─────────────────────

function PlayButton({
  loading,
  hasMaps,
  onStart,
  onImportFirst,
  labelStart,
  labelImport,
  labelLoading,
}: {
  loading: boolean
  hasMaps: boolean
  onStart: () => void
  onImportFirst: () => void
  labelStart: string
  labelImport: string
  labelLoading: string
}) {
  if (loading) {
    return (
      <button type="button" className="bb-ws-cta" disabled>
        <span>…</span>
        {labelLoading}
      </button>
    )
  }
  if (!hasMaps) {
    return (
      <button type="button" className="bb-ws-cta bb-ws-cta-ghost" onClick={onImportFirst}>
        <span>+</span>
        {labelImport}
      </button>
    )
  }
  return (
    <button type="button" className="bb-ws-cta" onClick={onStart}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
      {labelStart}
    </button>
  )
}

// ─── Scoped styles ────────────────────────────────────────────────────

// ─── Panel header ────────────────────────────────────────────────────
// Dashboard-style framing for panels that lack their own sub-navigation
// (Characters, Handouts, Audio). Notes + Library skip it — they already
// have category/tab strips at the top, so adding another header on top
// would be visual noise.

function PanelHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="bb-ws-panel-header">
      <div className="bb-ws-panel-header-title display">{title}</div>
      <div className="bb-ws-panel-header-hint">{hint}</div>
    </div>
  )
}

function WorkspaceStyles() {
  return (
    <style>{`
      .bb-ws {
        display: flex; flex-direction: column;
        height: 100%;
        background: var(--bg-base);
        color: var(--text-primary);
      }
      .bb-ws .display {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-weight: 500; letter-spacing: -0.01em;
      }
      .bb-ws .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

      /* ── Top bar ──────────────────────────────────────────── */
      .bb-ws-topbar {
        display: flex; align-items: center; gap: var(--sp-4);
        padding: 0 var(--sp-6); height: 56px;
        background: rgba(13, 16, 21, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
        user-select: none;
      }
      .bb-ws-back {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 12px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-secondary);
        font-size: 12px; font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: border-color var(--transition), color var(--transition);
        flex-shrink: 0;
      }
      .bb-ws-back:hover {
        border-color: var(--accent);
        color: var(--accent-light);
      }
      .bb-ws-brand {
        display: flex; align-items: center; gap: 8px;
        min-width: 0;
        flex: 1;
      }
      .bb-ws-wordmark {
        font-size: 12px; letter-spacing: 0.14em; font-weight: 700;
        color: var(--text-primary);
      }
      .bb-ws-breadcrumb-sep { color: var(--text-muted); }
      .bb-ws-breadcrumb-name {
        font-size: 13px; font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        min-width: 0;
      }
      .bb-ws-topbar-actions {
        display: flex; align-items: center; gap: var(--sp-2);
        flex-shrink: 0;
      }

      .bb-ws-player-pill {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        background: rgba(34, 197, 94, 0.08);
        border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: var(--radius);
        font-size: 11px; font-weight: 600;
        color: var(--success);
      }
      .bb-ws-player-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--success);
        box-shadow: 0 0 6px var(--success);
      }
      .bb-ws-player-close {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted);
        font-size: 12px; padding: 0 0 0 4px; line-height: 1;
      }
      .bb-ws-player-close:hover { color: var(--danger); }

      .bb-ws-cta {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 7px 14px;
        background: var(--accent);
        color: var(--text-inverse);
        border: none; border-radius: var(--radius);
        font-size: 13px; font-weight: 700; letter-spacing: 0.01em;
        cursor: pointer;
        font-family: inherit;
        transition: background var(--transition), transform var(--transition);
        box-shadow: 0 0 0 1px rgba(255, 198, 46, 0.28), 0 4px 10px rgba(255, 198, 46, 0.15);
      }
      .bb-ws-cta:hover { background: var(--accent-hover); }
      .bb-ws-cta:active { transform: translateY(1px); }
      .bb-ws-cta:disabled {
        opacity: 0.5; cursor: not-allowed;
        background: var(--bg-overlay);
        color: var(--text-muted);
        box-shadow: none;
      }
      .bb-ws-cta-lg { padding: 12px 20px; font-size: 14px; }
      .bb-ws-cta-ghost {
        background: transparent;
        color: var(--accent-light);
        border: 1px solid var(--accent);
        box-shadow: none;
      }
      .bb-ws-cta-ghost:hover { background: rgba(255, 198, 46, 0.08); color: var(--accent-light); }

      .bb-ws-compendium {
        width: 32px; height: 32px;
        display: inline-flex; align-items: center; justify-content: center;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-secondary);
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: border-color var(--transition), color var(--transition);
      }
      .bb-ws-compendium:hover {
        border-color: var(--accent-blue);
        color: var(--accent-blue-light);
      }
      .bb-ws-lang {
        display: flex;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .bb-ws-lang button {
        padding: 4px 10px;
        font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
        background: transparent;
        color: var(--text-muted);
        border: none; cursor: pointer;
        font-family: inherit;
      }
      .bb-ws-lang button.active {
        background: var(--accent-dim);
        color: var(--accent);
      }

      /* ── Main scroll area ─────────────────────────────────── */
      .bb-ws-main {
        flex: 1; min-height: 0;
        overflow-y: auto;
      }
      .bb-ws-inner {
        max-width: 1200px;
        margin: 0 auto;
        padding: var(--sp-8) var(--sp-8) 64px;
      }

      /* Greeting */
      .bb-ws-greeting { margin-bottom: var(--sp-6); }
      .bb-ws-greeting-kicker {
        font-size: 11px; letter-spacing: 0.14em; font-weight: 700;
        color: var(--accent);
        text-transform: uppercase;
        margin-bottom: var(--sp-2);
      }
      .bb-ws-greeting-title {
        font-size: 32px; line-height: 1.1;
        color: var(--text-primary);
        margin: 0 0 var(--sp-2) 0;
      }
      .bb-ws-greeting-meta {
        font-size: 12px; color: var(--text-muted);
        display: flex; align-items: center; gap: 8px;
      }
      .bb-ws-meta-sep { opacity: 0.5; }

      /* Hero */
      .bb-ws-hero {
        display: grid;
        grid-template-columns: minmax(240px, 1fr) 1.2fr;
        min-height: 220px;
        margin-bottom: var(--sp-6);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        cursor: pointer;
        transition: border-color var(--transition), transform var(--transition), box-shadow var(--transition);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
      }
      .bb-ws-hero:hover {
        border-color: var(--text-muted);
        transform: translateY(-2px);
      }
      .bb-ws-hero:focus-visible {
        outline: 2px solid var(--accent-blue);
        outline-offset: 2px;
      }
      .bb-ws-hero-cover {
        position: relative;
        min-height: 220px;
        background: var(--bg-elevated);
      }
      .bb-ws-hero-cover-fade {
        position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent 30%, var(--bg-surface) 100%);
        pointer-events: none;
      }
      .bb-ws-hero-body {
        padding: 28px 32px;
        display: flex; flex-direction: column; justify-content: center;
        gap: var(--sp-3);
      }
      .bb-ws-hero-kicker {
        display: flex; align-items: center; gap: 6px;
        font-size: 10px; letter-spacing: 0.16em; font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
      }
      .bb-ws-hero-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent);
      }
      .bb-ws-hero-title {
        font-size: 28px; line-height: 1.1;
        color: var(--text-primary);
        margin: 0;
      }
      .bb-ws-hero .bb-ws-cta { align-self: flex-start; }

      /* Hero empty */
      .bb-ws-hero-empty {
        display: flex; flex-direction: column; align-items: center;
        text-align: center;
        padding: 48px var(--sp-6);
        margin-bottom: var(--sp-6);
        background: var(--bg-surface);
        border: 1px dashed var(--border);
        border-radius: var(--radius-lg);
      }
      .bb-ws-hero-empty-icon { font-size: 44px; opacity: 0.6; margin-bottom: var(--sp-3); }
      .bb-ws-hero-empty-title {
        font-size: 22px; margin: 0 0 var(--sp-1);
        color: var(--text-primary);
      }
      .bb-ws-hero-empty-sub {
        color: var(--text-secondary);
        font-size: 13px; max-width: 420px;
        margin: 0 0 var(--sp-5);
      }

      /* Tab strip — dashboard-style pills */
      .bb-ws-tabs {
        display: flex; gap: 2px;
        padding: 4px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: var(--sp-4);
        overflow-x: auto;
      }
      .bb-ws-tab {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 14px;
        background: transparent;
        border: none; border-radius: var(--radius-sm);
        color: var(--text-muted);
        font-size: 13px; font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: background var(--transition), color var(--transition);
        white-space: nowrap;
      }
      .bb-ws-tab:hover { background: var(--bg-overlay); color: var(--text-secondary); }
      .bb-ws-tab.active {
        background: var(--accent-dim);
        color: var(--accent-light);
      }
      .bb-ws-tab-icon { font-size: 14px; line-height: 1; }

      /* Panel container */
      .bb-ws-panel {
        position: relative;
        min-height: 400px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        animation: bb-panel-fade 200ms ease-out;
      }
      @keyframes bb-panel-fade {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .bb-ws-panel-header {
        display: flex; align-items: baseline; gap: var(--sp-3);
        padding: var(--sp-4) var(--sp-5);
        border-bottom: 1px solid var(--border-subtle);
        background: linear-gradient(180deg, var(--bg-elevated), transparent);
      }
      .bb-ws-panel-header-title {
        font-size: 18px; line-height: 1.2;
        color: var(--text-primary);
        margin: 0;
      }
      .bb-ws-panel-header-hint {
        font-size: 11px;
        color: var(--text-muted);
        letter-spacing: 0.02em;
      }
      .bb-ws-panel-inner { position: relative; min-height: 400px; }
      .bb-ws-panel-notes {
        padding: var(--sp-5);
        display: flex; justify-content: center;
      }
      .bb-ws-panel-notes > * { width: 100%; max-width: 860px; }
      .bb-ws-panel-characters,
      .bb-ws-panel-library,
      .bb-ws-panel-handouts,
      .bb-ws-panel-audio {
        min-height: 500px;
        display: flex;
        flex-direction: column;
      }
      .bb-ws-panel-characters > *,
      .bb-ws-panel-library > *,
      .bb-ws-panel-handouts > *,
      .bb-ws-panel-audio > * { flex: 1; min-height: 0; }
    `}</style>
  )
}
