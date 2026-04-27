import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { MonstersTab } from './bestiary/MonstersTab'
import { ItemsTab } from './bestiary/ItemsTab'
import { SpellsTab } from './bestiary/SpellsTab'
import { BestiaryStyles } from './bestiary/BestiaryStyles'
import type { BestiaryTab } from '../stores/uiStore'

/* Bestiarium / Compendium data browser.

   Three tabs — Monsters, Items, Spells — backed by the bilingual SRD 5.1
   dataset shipped at resources/data/. Reads happen via the data:list-* /
   data:get-* IPC handlers; the renderer never touches JSON files directly.

   Kept visually aligned with CompendiumView so the two top-level reference
   surfaces feel like siblings in the app. */

export function BestiaryView() {
  const { t } = useTranslation()
  const setTopView = useUIStore((s) => s.setTopView)
  const language = useUIStore((s) => s.language)
  const target = useUIStore((s) => s.bestiaryTarget)
  const clearTarget = useUIStore((s) => s.clearBestiaryTarget)
  // Match the DmTitleBar convention: macOS reserves 72px on the LEFT
  // for the traffic lights; Windows/Linux reserve 140px on the RIGHT
  // for the min/max/close caption buttons. Without this, those native
  // controls overlap the search field + language pill.
  const isDarwin = typeof navigator !== 'undefined' &&
    navigator.userAgent.toUpperCase().includes('MAC')

  const [tab, setTab] = useState<BestiaryTab>(() => {
    try {
      const v = localStorage.getItem('boltberry-bestiary-tab') as BestiaryTab | null
      return v === 'items' || v === 'spells' || v === 'monsters' ? v : 'monsters'
    } catch {
      return 'monsters'
    }
  })
  const [query, setQuery] = useState('')
  // Pending deep-link: stored as { tab, slug } so a stale slug from a
  // monster deep-link can't bleed into the items / spells tab if the user
  // manually switches tabs before the tab consumes it.
  const [pending, setPending] = useState<{ tab: BestiaryTab; slug: string } | null>(null)
  useEffect(() => {
    if (!target) return
    setTab(target.tab)
    setPending({ tab: target.tab, slug: target.slug })
    setQuery('')
    clearTarget()
  }, [target, clearTarget])

  const slugForTab = (current: BestiaryTab): string | null =>
    pending && pending.tab === current ? pending.slug : null

  useEffect(() => {
    try { localStorage.setItem('boltberry-bestiary-tab', tab) } catch { /* noop */ }
  }, [tab])

  const tabs: Array<{ id: BestiaryTab; icon: string; label: string }> = useMemo(() => [
    { id: 'monsters', icon: '👹', label: t('bestiary.tabMonsters') },
    { id: 'items',    icon: '🗡️', label: t('bestiary.tabItems') },
    { id: 'spells',   icon: '✨', label: t('bestiary.tabSpells') },
  ], [t])

  return (
    <div className="bb-best">
      <BestiaryStyles />

      {/* Top bar */}
      <header className="bb-best-topbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {isDarwin && <div className="bb-best-traffic-space" aria-hidden="true" />}
        <button
          type="button"
          className="bb-best-back"
          onClick={() => setTopView('main')}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={t('bestiary.back')}
        >
          ◁ {t('bestiary.back')}
        </button>

        <div className="bb-best-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="var(--accent)" />
          </svg>
          <span className="bb-best-wordmark">
            BOLT<span style={{ color: 'var(--accent-blue-light)' }}>BERRY</span>
          </span>
          <span className="bb-best-breadcrumb-sep">/</span>
          <span className="bb-best-breadcrumb-name">{t('bestiary.title')}</span>
        </div>

        <div className="bb-best-actions" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="bb-best-search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('bestiary.searchPlaceholder')}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} title={t('bestiary.clearSearch')}>✕</button>
            )}
          </div>
          <button
            type="button"
            className="bb-best-back"
            onClick={() => window.dispatchEvent(new CustomEvent('app:open-global-settings'))}
            title={`${t('globalSettings.open')} (Ctrl/Cmd+,)`}
            aria-label={t('globalSettings.open')}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ⚙
          </button>
        </div>
        {!isDarwin && <div className="bb-best-controls-space" aria-hidden="true" />}
      </header>

      {/* Attribution strip — SRD 5.1 CC-BY-4.0 is required visible near the
          derived content. Click opens the About dialog with full notice. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('app:open-about'))}
        className="bb-best-attribution"
      >
        {t('bestiary.attributionPrefix')} · CC-BY-4.0{' · '}
        <span className="bb-best-attribution-link">{t('bestiary.attributionSuffix')}</span>
      </button>

      {/* Tab strip */}
      <nav className="bb-best-tabs" role="tablist">
        {tabs.map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            role="tab"
            aria-selected={tab === tabDef.id}
            onClick={() => setTab(tabDef.id)}
            className={tab === tabDef.id ? 'bb-best-tab active' : 'bb-best-tab'}
          >
            <span className="bb-best-tab-icon" aria-hidden="true">{tabDef.icon}</span>
            <span>{tabDef.label}</span>
          </button>
        ))}
      </nav>

      {/* Active tab */}
      <div className="bb-best-body">
        {tab === 'monsters' && (
          <MonstersTab
            query={query}
            language={language}
            initialSlug={slugForTab('monsters')}
            onConsumeInitial={() => setPending(null)}
          />
        )}
        {tab === 'items' && (
          <ItemsTab
            query={query}
            language={language}
            initialSlug={slugForTab('items')}
            onConsumeInitial={() => setPending(null)}
          />
        )}
        {tab === 'spells' && (
          <SpellsTab
            query={query}
            language={language}
            initialSlug={slugForTab('spells')}
            onConsumeInitial={() => setPending(null)}
          />
        )}
      </div>
    </div>
  )
}
