import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '../../stores/uiStore'
import type { ItemIndexEntry, ItemRecord } from '@shared/ipc-types'
import { localized, localizedArray, pickName, titleCase } from './util'
import { EmptyDetail } from './MonstersTab'

const RARITY_ORDER: Record<string, number> = {
  COMMON: 0, UNCOMMON: 1, RARE: 2, VERY_RARE: 3, LEGENDARY: 4, ARTIFACT: 5,
}

const RARITY_COLOR: Record<string, string> = {
  COMMON: '#94a3b8',
  UNCOMMON: '#22c55e',
  RARE: '#3b82f6',
  VERY_RARE: '#a78bfa',
  LEGENDARY: '#f59e0b',
  ARTIFACT: '#ef4444',
}

const CATEGORY_ICON: Record<string, string> = {
  WEAPON: '⚔️',
  ARMOR: '🛡️',
  POTION: '🧪',
  RING: '💍',
  ROD: '🪄',
  STAFF: '🪄',
  WAND: '🪄',
  WONDROUS_ITEM: '✨',
  SCROLL: '📜',
  ADVENTURING_GEAR: '🎒',
  TOOLS: '🔧',
  AMMUNITION: '🏹',
}

export function ItemsTab({ query, language }: { query: string; language: AppLanguage }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState<ItemIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [rarityFilter, setRarityFilter] = useState<string>('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await window.electronAPI?.listItems?.() ?? []
        if (!alive) return
        setIndex(rows)
      } catch (err) {
        if (alive) setError(String(err))
      }
    })()
    return () => { alive = false }
  }, [])

  const availableCategories = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const it of index) set.add(it.category.en)
    return Array.from(set).sort()
  }, [index])

  const availableRarities = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const it of index) set.add(it.rarity.en)
    return Array.from(set).sort((a, b) => (RARITY_ORDER[a] ?? 99) - (RARITY_ORDER[b] ?? 99))
  }, [index])

  const filtered = useMemo(() => {
    if (!index) return []
    const q = query.trim().toLowerCase()
    return index
      .filter((it) => {
        if (categoryFilter && it.category.en !== categoryFilter) return false
        if (rarityFilter && it.rarity.en !== rarityFilter) return false
        if (!q) return true
        const name = pickName(it, language).toLowerCase()
        return name.includes(q)
          || it.slug.includes(q)
          || it.category.en.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const r = (RARITY_ORDER[a.rarity.en] ?? 99) - (RARITY_ORDER[b.rarity.en] ?? 99)
        if (r !== 0) return r
        return pickName(a, language).localeCompare(pickName(b, language))
      })
  }, [index, query, language, categoryFilter, rarityFilter])

  useEffect(() => {
    if (filtered.length === 0) { setSelectedSlug(null); return }
    if (selectedSlug && filtered.some((it) => it.slug === selectedSlug)) return
    setSelectedSlug(filtered[0].slug)
  }, [filtered, selectedSlug])

  const handleSelect = useCallback((slug: string) => setSelectedSlug(slug), [])

  if (error) return <div className="bb-best-error">⚠️ {error}</div>
  if (!index) return <div className="bb-best-loading">…</div>

  return (
    <div className="bb-best-layout">
      <aside className="bb-best-listpane">
        <div className="bb-best-filterbar">
          <label className="bb-best-filter">
            <span>{t('bestiary.filterCategory')}</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">{t('bestiary.filterAll')}</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{prettyCategory(c, language, index)}</option>
              ))}
            </select>
          </label>
          <label className="bb-best-filter">
            <span>{t('bestiary.filterRarity')}</span>
            <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
              <option value="">{t('bestiary.filterAll')}</option>
              {availableRarities.map((r) => (
                <option key={r} value={r}>{prettyRarity(r, language, index)}</option>
              ))}
            </select>
          </label>
          {(categoryFilter || rarityFilter) && (
            <button
              type="button"
              className="bb-best-filter-clear"
              onClick={() => { setCategoryFilter(''); setRarityFilter('') }}
            >
              ✕ {t('bestiary.clearFilters')}
            </button>
          )}
        </div>

        <div className="bb-best-listcount">
          {t('bestiary.countItems', { count: filtered.length })}
        </div>

        <ul className="bb-best-list">
          {filtered.map((it) => {
            const name = pickName(it, language)
            const tint = RARITY_COLOR[it.rarity.en] ?? '#94a3b8'
            return (
              <li key={it.slug}>
                <button
                  type="button"
                  className={
                    it.slug === selectedSlug
                      ? 'bb-best-list-item active'
                      : 'bb-best-list-item'
                  }
                  onClick={() => handleSelect(it.slug)}
                  style={{ borderLeftColor: tint }}
                >
                  <span className="bb-best-list-chip" style={{ color: tint }}>
                    {CATEGORY_ICON[it.category.en] ?? '📦'}
                  </span>
                  <span className="bb-best-list-body">
                    <span className="bb-best-list-name display">{name}</span>
                    <span className="bb-best-list-meta">
                      {localized(it.category, language)}
                      {' · '}
                      <span style={{ color: tint }}>{localized(it.rarity, language)}</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="bb-best-list-empty">{t('bestiary.noMatches')}</li>
          )}
        </ul>
      </aside>

      <main className="bb-best-detailpane">
        {selectedSlug ? (
          <ItemDetail slug={selectedSlug} language={language} />
        ) : (
          <EmptyDetail label={t('bestiary.noSelection')} />
        )}
      </main>
    </div>
  )
}

function ItemDetail({ slug, language }: { slug: string; language: AppLanguage }) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<ItemRecord | null>(null)

  useEffect(() => {
    let alive = true
    setRecord(null)
    ;(async () => {
      const row = await window.electronAPI?.getItem?.(slug) ?? null
      if (alive) setRecord(row)
    })()
    return () => { alive = false }
  }, [slug])

  if (!record) return <div className="bb-best-loading">…</div>

  const name = pickName(record, language)
  const tint = RARITY_COLOR[record.rarity.en] ?? '#94a3b8'
  const icon = CATEGORY_ICON[record.category.en] ?? '📦'
  const description = localized(record.description, language)
  const properties = localizedArray(record.properties, language)

  return (
    <article className="bb-best-detail" style={{ borderLeftColor: tint }}>
      <header className="bb-best-hero">
        <div className="bb-best-hero-portrait" style={{ borderColor: tint }}>
          <span className="bb-best-hero-glyph" aria-hidden="true">{icon}</span>
        </div>
        <div className="bb-best-hero-text">
          <h2 className="bb-best-hero-name display">{name}</h2>
          <div className="bb-best-hero-sub">
            <span>{localized(record.category, language)}</span>
            <span className="bb-best-hero-dot">·</span>
            <span style={{ color: tint }}>{localized(record.rarity, language)}</span>
          </div>
          <div className="bb-best-hero-chips">
            {record.cost != null && <Chip label={t('bestiary.cost')} value={`${record.cost} gp`} />}
            {record.weight != null && <Chip label={t('bestiary.weight')} value={`${record.weight} lb`} />}
            {record.ac && <Chip label="AC" value={record.ac} />}
            {record.damageType && <Chip label={t('bestiary.damage')} value={localized(record.damageType, language)} />}
          </div>
        </div>
      </header>

      {(record.classification || properties.length > 0 || record.stealth) && (
        <section className="bb-best-metagrid">
          {record.classification && (
            <MetaRow label={t('bestiary.classification')} value={localized(record.classification, language)} />
          )}
          {properties.length > 0 && (
            <MetaRow label={t('bestiary.properties')} value={properties.map(titleCase).join(', ')} />
          )}
          {record.stealth && (
            <MetaRow label={t('bestiary.stealth')} value={record.stealth} />
          )}
        </section>
      )}

      {description && (
        <section className="bb-best-section">
          <h3>{t('bestiary.description')}</h3>
          <p className="bb-best-prose">{description}</p>
        </section>
      )}

      <footer className="bb-best-footer">
        <span className="mono">{record.slug}</span>
        <span className="bb-best-footer-dot">·</span>
        <span>{record.licenseSource}</span>
      </footer>
    </article>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="bb-best-chip">
      <span className="bb-best-chip-label">{label}</span>
      <span className="bb-best-chip-value mono">{value}</span>
    </span>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) return null
  return (
    <div className="bb-best-metarow">
      <div className="bb-best-metarow-label">{label}</div>
      <div className="bb-best-metarow-value">{value}</div>
    </div>
  )
}

function prettyCategory(
  cat: string,
  lang: AppLanguage,
  index: ItemIndexEntry[],
): string {
  const sample = index.find((it) => it.category.en === cat)
  if (!sample) return cat
  return localized(sample.category, lang)
}

function prettyRarity(
  rarity: string,
  lang: AppLanguage,
  index: ItemIndexEntry[],
): string {
  const sample = index.find((it) => it.rarity.en === rarity)
  if (!sample) return rarity
  return localized(sample.rarity, lang)
}
