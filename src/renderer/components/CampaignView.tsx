import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../stores/campaignStore'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { NotesPanel } from './sidebar/panels/NotesPanel'
import { CharacterSheetPanel } from './sidebar/panels/CharacterSheetPanel'
import { HandoutsPanel } from './sidebar/panels/HandoutsPanel'
import { AudioPanel } from './sidebar/panels/AudioPanel'
import { MusicLibraryPanel } from './sidebar/panels/MusicLibraryPanel'
import { TokenLibraryPanel } from './sidebar/panels/TokenLibraryPanel'
import { showToast } from './shared/Toast'
import {
  CampaignDataStyles,
  MapThumbnail,
  useCampaignStats,
  useRelativeTime,
} from './campaign-data'
import type { MapRecord } from '@shared/ipc-types'
import type { WorkspaceTab } from '../stores/uiStore'

/* Campaign workspace — shown when a campaign is open but no map is
   active. Uses the dashboard aesthetic (Fraunces titles, dark cards,
   Bolt-yellow CTA) so that the whole "between sessions" experience —
   Welcome → Workspace → Map view — shares one visual language. */

type Tab = WorkspaceTab

const TABS: { id: Tab; icon: string; i18nKey: string }[] = [
  { id: 'maps',       icon: '🗺️', i18nKey: 'workspace.tabMaps'       },
  { id: 'characters', icon: '●', i18nKey: 'workspace.tabCharacters' },
  { id: 'npcs',       icon: '🧑', i18nKey: 'workspace.tabNpcs'       },
  { id: 'audio',      icon: '🎵', i18nKey: 'workspace.tabAudio'      },
  { id: 'sfx',        icon: '🔊', i18nKey: 'workspace.tabSfx'        },
  { id: 'handouts',   icon: '📄', i18nKey: 'workspace.tabHandouts'   },
  { id: 'notes',      icon: '●', i18nKey: 'workspace.tabNotes'      },
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
  const { language, toggleLanguage } = useUIStore()
  const { playerConnected } = useSessionStore()
  // Tab lives in uiStore so the workspace can unmount when a map is
  // open (PB-5) without losing the DM's current tab selection.
  const tab = useUIStore((s) => s.workspaceTab)
  const setTab = useUIStore((s) => s.setWorkspaceTab)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [importing, setImporting] = useState(false)

  const campaign = campaigns.find((c) => c.id === activeCampaignId)
  const campaignIds = useMemo(
    () => (activeCampaignId ? [activeCampaignId] : []),
    [activeCampaignId],
  )
  const stats = useCampaignStats(campaignIds)
  const selfStats = activeCampaignId ? stats[activeCampaignId] : undefined

  const loadMaps = useCallback(async (campaignId: number) => {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.maps.list(campaignId)
      setActiveMaps(rows)
    } catch (err) {
      console.error('[CampaignView] loadMaps failed:', err)
    } finally {
      setMapsLoaded(true)
    }
  }, [setActiveMaps])

  // Populate activeMaps so the "Spielansicht" button knows which
  // map to open. loadMaps is now a stable useCallback so exhaustive-
  // deps can include it without re-running every render (audit CQ-6).
  useEffect(() => {
    if (!activeCampaignId) return
    setMapsLoaded(false)
    loadMaps(activeCampaignId)
  }, [activeCampaignId, loadMaps])

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

  async function handleImportFirstMap() {
    if (!activeCampaignId || !window.electronAPI || importing) return
    setImporting(true)
    try {
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      // importFile returns null on user-cancel; treat that as silent.
      // Any other falsy value means the copy/read failed — toast the
      // failure so the user doesn't think they mis-clicked.
      if (asset === null) return
      if (!asset || !asset.path) {
        showToast('Karte konnte nicht importiert werden — Datei konnte nicht kopiert werden', 'error', 6000)
        return
      }

      const fileName = asset.path.split(/[\\/]/).pop() || ''
      const finalMapName = fileName.replace(/\.[^/.]+$/, '') || 'Neue Karte'

      const newMap = await window.electronAPI.maps.create({
        campaignId: activeCampaignId,
        name: finalMapName,
        imagePath: asset.path,
      })
      addMap(newMap)
      setActiveMap(newMap.id)
    } catch (err) {
      console.error('[CampaignView] importFirstMap failed:', err)
      showToast('Karten-Import fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)), 'error', 7000)
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

      {/* ”€”€ Top bar ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
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

      {/* ”€”€ Main scroll area ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
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
              {typeof selfStats?.sessionCount === 'number' && selfStats.sessionCount > 0 && (
                <>
                  <span className="bb-ws-meta-sep">·</span>
                  {t('welcome.sessionCount', { count: selfStats.sessionCount })}
                </>
              )}
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
            {tab === 'maps' && (
              <>
                <PanelHeader title={t('workspace.tabMaps')} hint={t('workspace.hintMaps')} />
                <div className="bb-ws-panel-inner bb-ws-panel-maps">
                  <MapsPanel
                    onImport={handleImportFirstMap}
                    importing={importing}
                    onOpen={setActiveMap}
                  />
                </div>
              </>
            )}
            {tab === 'characters' && (
              <>
                <PanelHeader title={t('workspace.tabCharacters')} hint={t('workspace.hintCharacters')} />
                <div className="bb-ws-panel-inner bb-ws-panel-characters">
                  <CharacterSheetPanel />
                </div>
              </>
            )}
            {tab === 'npcs' && (
              <>
                <PanelHeader title={t('workspace.tabNpcs')} hint={t('workspace.hintNpcs')} />
                <div className="bb-ws-panel-inner bb-ws-panel-library">
                  <TokenLibraryPanel lockedCategory="npc" />
                </div>
              </>
            )}
            {tab === 'audio' && (
              <>
                <PanelHeader title={t('workspace.tabAudio')} hint={t('workspace.hintAudio')} />
                <div className="bb-ws-panel-inner bb-ws-panel-audio">
                  <MusicLibraryPanel />
                </div>
              </>
            )}
            {tab === 'sfx' && (
              <>
                <PanelHeader title={t('workspace.tabSfx')} hint={t('workspace.hintSfx')} />
                <div className="bb-ws-panel-inner bb-ws-panel-audio">
                  <AudioPanel layout="wide-sfx" />
                </div>
              </>
            )}
            {tab === 'handouts' && (
              <>
                <PanelHeader title={t('workspace.tabHandouts')} hint={t('workspace.hintHandouts')} />
                <div className="bb-ws-panel-inner bb-ws-panel-handouts">
                  <HandoutsPanel />
                </div>
              </>
            )}
            {tab === 'notes' && (
              <div className="bb-ws-panel-inner bb-ws-panel-notes">
                <NotesPanel />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ”€”€”€ Hero (most-recent map card) ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€

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

// ”€”€”€ Play button (loading / play / import-first) ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€

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

// ”€”€”€ Scoped styles ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€

// ”€”€”€ Panel header ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
// Dashboard-style framing for panels that lack their own sub-navigation
// (Characters, Handouts, Audio). Notes + Library skip it — they already
// have category/tab strips at the top, so adding another header on top
// would be visual noise.

// ”€”€”€ Karten-Tab ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
// Dedicated CampaignView tab for full multi-map management (list + add +
// open + rename + reorder + delete). The game-view LeftSidebar still has
// its own compact map list for in-session context; this panel is the
// content-management home for DMs between sessions.

function MapsPanel({ onImport, importing, onOpen }: {
  onImport: () => void
  importing: boolean
  onOpen: (id: number) => void
}) {
  const { t } = useTranslation()
  const activeMaps = useCampaignStore((s) => s.activeMaps)
  const setActiveMaps = useCampaignStore((s) => s.setActiveMaps)

  async function handleRename(id: number, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await window.electronAPI?.maps.rename(id, trimmed)
      setActiveMaps(activeMaps.map((m) => m.id === id ? { ...m, name: trimmed } : m))
    } catch (err) {
      showToast(t('workspace.mapRenameFailed'), 'error')
      console.error('[MapsPanel] rename failed:', err)
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(t('workspace.mapDeleteConfirm', { name }))) return
    try {
      // Child tables (tokens, drawings, fog, walls, rooms, initiative)
      // cascade via ON DELETE CASCADE in the schema.
      await window.electronAPI?.maps.delete(id)
      setActiveMaps(activeMaps.filter((m) => m.id !== id))
      showToast(t('workspace.mapDeleteSuccess'), 'success')
    } catch (err) {
      showToast(t('workspace.mapDeleteFailed'), 'error')
      console.error('[MapsPanel] delete failed:', err)
    }
  }

  async function handleReorder(id: number, dir: 'up' | 'down') {
    const idx = activeMaps.findIndex((m) => m.id === id)
    if (idx < 0) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= activeMaps.length) return
    try {
      const a = activeMaps[idx]
      const b = activeMaps[swapIdx]
      const next = [...activeMaps]
      next[idx] = { ...b, orderIndex: idx }
      next[swapIdx] = { ...a, orderIndex: swapIdx }
      setActiveMaps(next)
      await window.electronAPI?.maps.swapOrder(a.id, b.id)
    } catch (err) {
      showToast(t('workspace.mapReorderFailed'), 'error')
      console.error('[MapsPanel] reorder failed:', err)
    }
  }

  if (activeMaps.length === 0) {
    return (
      <div className="bb-ws-maps-empty">
        <div className="bb-ws-maps-empty-glyph">🗺</div>
        <div className="bb-ws-maps-empty-title">{t('workspace.noMapsTitle')}</div>
        <div className="bb-ws-maps-empty-sub">{t('workspace.noMapsSub')}</div>
        <button
          type="button"
          className="bb-ws-maps-empty-cta"
          onClick={onImport}
          disabled={importing}
        >
          {importing ? '…' : t('workspace.importFirstMap')}
        </button>
      </div>
    )
  }

  return (
    <div className="bb-ws-maps-grid">
      {activeMaps.map((map, idx) => (
        <MapCard
          key={map.id}
          map={map}
          index={idx}
          total={activeMaps.length}
          onOpen={() => onOpen(map.id)}
          onRename={(name) => handleRename(map.id, name)}
          onDelete={() => handleDelete(map.id, map.name)}
          onReorder={(dir) => handleReorder(map.id, dir)}
        />
      ))}
      <button
        type="button"
        className="bb-ws-maps-add"
        onClick={onImport}
        disabled={importing}
        title={t('workspace.importFirstMap')}
      >
        <div className="bb-ws-maps-add-icon">➕</div>
        <div className="bb-ws-maps-add-label">{importing ? '…' : t('workspace.addMap')}</div>
      </button>
    </div>
  )
}

function MapCard({ map, index, total, onOpen, onRename, onDelete, onReorder }: {
  map: MapRecord
  index: number
  total: number
  onOpen: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onReorder: (dir: 'up' | 'down') => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(map.name)
  // Sync the draft when the map is renamed elsewhere (sidebar, command
  // palette, …) and we aren't currently editing — without this, the
  // local draft shadows the canonical name on the next edit attempt.
  useEffect(() => {
    if (!editing) setDraft(map.name)
  }, [map.name, editing])

  function commitRename() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== map.name) onRename(draft.trim())
    else setDraft(map.name)
  }

  return (
    <div className="bb-ws-map-card">
      <button
        type="button"
        className="bb-ws-map-card-thumb"
        onClick={onOpen}
        title={t('workspace.openGameView')}
      >
        <MapThumbnail path={map.imagePath} campaignName={map.name} />
      </button>
      <div className="bb-ws-map-card-body">
        {editing ? (
          <input
            className="bb-ws-map-card-name-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditing(false); setDraft(map.name) }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="bb-ws-map-card-name"
            onClick={() => setEditing(true)}
            title={t('workspace.mapRename')}
          >
            {map.name}
          </button>
        )}
        <div className="bb-ws-map-card-meta mono">
          {map.gridType === 'none'
            ? t('canvas.hud.noGrid')
            : `${map.gridSize}px · ${map.ftPerUnit}ft`}
        </div>
        <div className="bb-ws-map-card-actions">
          <button
            type="button"
            className="bb-ws-map-card-btn"
            onClick={() => onReorder('up')}
            disabled={index === 0}
            title={t('workspace.mapMoveUp')}
          >↑</button>
          <button
            type="button"
            className="bb-ws-map-card-btn"
            onClick={() => onReorder('down')}
            disabled={index >= total - 1}
            title={t('workspace.mapMoveDown')}
          >↓</button>
          <button
            type="button"
            className="bb-ws-map-card-btn bb-ws-map-card-btn-danger"
            onClick={onDelete}
            title={t('workspace.mapDelete')}
          >🗑</button>
        </div>
      </div>
    </div>
  )
}

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

      /* ”€”€ Top bar ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */
      .bb-ws-topbar {
        display: flex; align-items: center; gap: var(--sp-4);
        height: 56px;
        /* Reserve the right-hand gutter for Electron's titleBarOverlay
           so the Spielansicht / language-toggle cluster never slides
           under the native min / max / close buttons on Windows. Uses
           the same --titlebar-controls-w variable as DmTitleBar / Wiki
           / Compendium top bars so every reserved gutter scales in
           lockstep on high-DPI displays. On macOS the traffic lights
           sit on the left — the extra padding there is harmless. */
        padding-top: 0;
        padding-bottom: 0;
        padding-left: var(--sp-6);
        padding-right: calc(var(--titlebar-controls-w) + 12px);
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

      /* ”€”€ Main scroll area ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */
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
        display: flex;
        flex-direction: column;
        min-height: min(720px, calc(100vh - 260px));
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
      .bb-ws-panel-inner {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .bb-ws-panel-notes {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }
      .bb-ws-panel-notes > * {
        flex: 1;
        min-height: 0;
      }
      .bb-ws-panel-characters,
      .bb-ws-panel-library,
      .bb-ws-panel-handouts,
      .bb-ws-panel-audio {
        display: flex;
        flex-direction: column;
      }
      .bb-ws-panel-characters > *,
      .bb-ws-panel-library > *,
      .bb-ws-panel-handouts > *,
      .bb-ws-panel-audio > * { flex: 1; min-height: 0; }

      /* ”€”€ Karten-Tab grid ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */
      .bb-ws-panel-maps {
        display: flex;
        flex-direction: column;
      }
      .bb-ws-maps-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: var(--sp-4);
        padding: var(--sp-4);
        overflow-y: auto;
      }
      .bb-ws-map-card {
        display: flex;
        flex-direction: column;
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius);
        overflow: hidden;
        transition: border-color var(--transition);
      }
      .bb-ws-map-card:hover { border-color: var(--border); }
      .bb-ws-map-card-thumb {
        position: relative;
        aspect-ratio: 16 / 10;
        padding: 0;
        border: none;
        background: var(--bg-base);
        cursor: pointer;
        overflow: hidden;
      }
      .bb-ws-map-card-thumb:hover { filter: brightness(1.08); }
      .bb-ws-map-card-body {
        padding: var(--sp-3);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .bb-ws-map-card-name {
        padding: 0;
        background: none;
        border: none;
        text-align: left;
        font-size: var(--text-sm);
        font-weight: 600;
        color: var(--text-primary);
        cursor: text;
        font-family: inherit;
      }
      .bb-ws-map-card-name:hover { color: var(--accent-blue-light); }
      .bb-ws-map-card-name-input {
        padding: 4px 6px;
        background: var(--bg-base);
        border: 1px solid var(--accent-blue);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: 600;
        font-family: inherit;
      }
      .bb-ws-map-card-meta {
        font-size: 10px;
        color: var(--text-muted);
      }
      .bb-ws-map-card-actions {
        display: flex;
        gap: 4px;
        margin-top: 4px;
      }
      .bb-ws-map-card-btn {
        flex: 1;
        padding: 4px 6px;
        background: var(--bg-base);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        cursor: pointer;
        font-size: var(--text-xs);
        font-family: inherit;
      }
      .bb-ws-map-card-btn:hover:not(:disabled) { border-color: var(--accent-blue); color: var(--accent-blue-light); }
      .bb-ws-map-card-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .bb-ws-map-card-btn-danger:hover:not(:disabled) {
        border-color: var(--danger);
        color: var(--danger);
        background: rgba(239, 68, 68, 0.08);
      }
      .bb-ws-maps-add {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 220px;
        background: transparent;
        border: 2px dashed var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        cursor: pointer;
        font-family: inherit;
        transition: border-color var(--transition), color var(--transition);
      }
      .bb-ws-maps-add:hover:not(:disabled) {
        border-color: var(--accent-blue);
        color: var(--accent-blue-light);
      }
      .bb-ws-maps-add:disabled { opacity: 0.5; cursor: not-allowed; }
      .bb-ws-maps-add-icon { font-size: 36px; line-height: 1; }
      .bb-ws-maps-add-label { font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
      .bb-ws-maps-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        gap: 12px;
        text-align: center;
      }
      .bb-ws-maps-empty-glyph { font-size: 56px; opacity: 0.6; }
      .bb-ws-maps-empty-title { font-size: 18px; font-weight: 700; color: var(--text-primary); }
      .bb-ws-maps-empty-sub { font-size: var(--text-sm); color: var(--text-muted); max-width: 400px; }
      .bb-ws-maps-empty-cta {
        margin-top: 16px;
        padding: 10px 24px;
        background: var(--accent);
        color: var(--text-inverse, #0D1015);
        border: none;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: var(--text-sm);
        font-weight: 700;
        font-family: inherit;
      }
      .bb-ws-maps-empty-cta:hover:not(:disabled) { background: var(--accent-hover); }
      .bb-ws-maps-empty-cta:disabled { opacity: 0.5; cursor: not-allowed; }
    `}</style>
  )
}
