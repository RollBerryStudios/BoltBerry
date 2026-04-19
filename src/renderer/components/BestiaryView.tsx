import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { MonstersTab } from './bestiary/MonstersTab'
import { ItemsTab } from './bestiary/ItemsTab'
import { SpellsTab } from './bestiary/SpellsTab'
import { BestiaryStyles } from './bestiary/BestiaryStyles'

/* Bestiarium / Compendium data browser.

   Three tabs — Monsters, Items, Spells — backed by the bilingual SRD 5.1
   dataset shipped at resources/data/. Reads happen via the data:list-* /
   data:get-* IPC handlers; the renderer never touches JSON files directly.

   Kept visually aligned with CompendiumView so the two top-level reference
   surfaces feel like siblings in the app. */

type BestiaryTab = 'monsters' | 'items' | 'spells'

export function BestiaryView() {
  const { t } = useTranslation()
  const setTopView = useUIStore((s) => s.setTopView)
  const language = useUIStore((s) => s.language)
  const toggleLanguage = useUIStore((s) => s.toggleLanguage)

  const [tab, setTab] = useState<BestiaryTab>(() => {
    try {
      const v = localStorage.getItem('boltberry-bestiary-tab') as BestiaryTab | null
      return v === 'items' || v === 'spells' || v === 'monsters' ? v : 'monsters'
    } catch {
      return 'monsters'
    }
  })
  const [query, setQuery] = useState('')

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
          <div className="bb-best-lang" role="group" aria-label="Language">
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
        </div>
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
        {tab === 'monsters' && <MonstersTab query={query} language={language} />}
        {tab === 'items' && <ItemsTab query={query} language={language} />}
        {tab === 'spells' && <SpellsTab query={query} language={language} />}
      </div>
    </div>
  )
}
