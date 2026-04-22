import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '../../stores/uiStore'
import type { ItemIndexEntry, ItemRecord } from '@shared/ipc-types'
import { localized, pickName, titleCase } from './util'
import { EmptyDetail } from './MonstersTab'
import { itemHandout } from './actions'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { showToast } from '../shared/Toast'
import { WikiEntryControls } from './WikiEntryControls'
import { WikiEntryForm } from './WikiEntryForm'
import { WikiListMenu } from './WikiListMenu'

const RARITY_ORDER: Record<string, number> = {
  MUNDANE: -1, COMMON: 0, UNCOMMON: 1, RARE: 2, VERY_RARE: 3, LEGENDARY: 4, ARTIFACT: 5,
}

const RARITY_COLOR: Record<string, string> = {
  MUNDANE: '#6b7280',
  COMMON: '#94a3b8',
  UNCOMMON: '#22c55e',
  RARE: '#3b82f6',
  VERY_RARE: '#a78bfa',
  LEGENDARY: '#f59e0b',
  ARTIFACT: '#ef4444',
}

// Keyed by the `category.en` values actually present in the dataset
// (grep'd from resources/data/items/**/item.json). Keep the synonyms
// (WONDROUS_ITEM etc.) so future data imports using a slightly different
// shape still get a sensible glyph instead of the generic ðŸ“¦ fallback.
const CATEGORY_ICON: Record<string, string> = {
  WEAPON: 'âš”ï¸',
  ARMOR: 'ðŸ›¡ï¸',
  POTIONS_OILS: 'ðŸ§ª',
  POTION: 'ðŸ§ª',
  RING: 'ðŸ’',
  ROD: 'ðŸª„',
  STAFF: 'ðŸª„',
  WAND: 'ðŸª„',
  WONDROUS_ITEMS: 'âœ¨',
  WONDROUS_ITEM: 'âœ¨',
  SCROLL: 'ðŸ“œ',
  ADVENTURING_GEAR: 'ðŸŽ’',
  TOOLS: 'ðŸ”§',
  AMMUNITION: 'ðŸ¹',
  OTHER: 'ðŸ“¦',
}

export function ItemsTab({
  query,
  language,
  initialSlug,
  onConsumeInitial,
}: {
  query: string
  language: AppLanguage
  initialSlug?: string | null
  onConsumeInitial?: () => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState<ItemIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [rarityFilter, setRarityFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<'' | 'srd' | 'user'>('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [menuState, setMenuState] = useState<{ x: number; y: number; entry: ItemIndexEntry } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

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
  }, [refreshTick])

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
        if (sourceFilter === 'user' && !it.userOwned) return false
        if (sourceFilter === 'srd'  &&  it.userOwned) return false
        if (!q) return true
        const name = pickName(it, language).toLowerCase()
        return name.includes(q)
          || it.slug.includes(q)
          || it.category.en.toLowerCase().includes(q)
      })
      // Default alphabetical sort per locale. Rarity remains a filter
      // chip up top but no longer the primary sort axis â€” DMs scan for
      // items by name more often than by rarity tier.
      .sort((a, b) => pickName(a, language).localeCompare(pickName(b, language), language))
  }, [index, query, language, categoryFilter, rarityFilter, sourceFilter])

  useEffect(() => {
    if (!initialSlug || !index) return
    setSelectedSlug(initialSlug)
    onConsumeInitial?.()
  }, [initialSlug, index, onConsumeInitial])

  useEffect(() => {
    if (filtered.length === 0) { setSelectedSlug(null); return }
    if (selectedSlug && filtered.some((it) => it.slug === selectedSlug)) return
    if (selectedSlug && index?.some((it) => it.slug === selectedSlug)) return
    setSelectedSlug(filtered[0].slug)
  }, [filtered, index, selectedSlug])

  const handleSelect = useCallback((slug: string) => setSelectedSlug(slug), [])

  if (error) return <div className="bb-best-error">âš ï¸ {error}</div>
  if (!index) return <div className="bb-best-loading">â€¦</div>

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
          <label className="bb-best-filter">
            <span>{t('bestiary.filterSource')}</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as '' | 'srd' | 'user')}>
              <option value="">{t('bestiary.filterAll')}</option>
              <option value="srd">{t('library.sourceSrd')}</option>
              <option value="user">{t('library.sourceUser')}</option>
            </select>
          </label>
          {(categoryFilter || rarityFilter || sourceFilter) && (
            <button
              type="button"
              className="bb-best-filter-clear"
              onClick={() => { setCategoryFilter(''); setRarityFilter(''); setSourceFilter('') }}
            >
              âœ• {t('bestiary.clearFilters')}
            </button>
          )}
        </div>

        <div className="bb-best-listcount">
          <span>{t('bestiary.countItems', { count: filtered.length })}</span>
          <button
            type="button"
            className="bb-best-list-new"
            onClick={() => setCreatingNew(true)}
            title={t('wikiForm.new_item')}
          >
            + {t('wikiForm.new')}
          </button>
        </div>

        {creatingNew && (
          <WikiEntryForm
            kind="item"
            onClose={() => setCreatingNew(false)}
            onSaved={(slug) => {
              setCreatingNew(false)
              setRefreshTick((n) => n + 1)
              setSelectedSlug(slug)
            }}
          />
        )}

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
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuState({ x: e.clientX, y: e.clientY, entry: it })
                  }}
                  style={{ borderLeftColor: tint }}
                >
                  <span className="bb-best-list-chip" style={{ color: tint }}>
                    {CATEGORY_ICON[it.category.en] ?? 'ðŸ“¦'}
                  </span>
                  <span className="bb-best-list-body">
                    <span className="bb-best-list-name display">
                      {name}
                      {it.userOwned && (
                        <span className="bb-best-user-badge" title={t('library.sourceUser')}>â˜…</span>
                      )}
                    </span>
                    <span className="bb-best-list-meta">
                      {localized(it.category, language)}
                      {' Â· '}
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
          <ItemDetail
            slug={selectedSlug}
            language={language}
            onUserEntryChanged={(next) => {
              setRefreshTick((n) => n + 1)
              if (next) setSelectedSlug(next)
            }}
          />
        ) : (
          <EmptyDetail label={t('bestiary.noSelection')} />
        )}
      </main>

      {menuState && (
        <WikiListMenu
          kind="item"
          language={language}
          anchor={{ x: menuState.x, y: menuState.y }}
          entry={menuState.entry}
          onClose={() => setMenuState(null)}
          onChanged={(nextSlug) => {
            setRefreshTick((n) => n + 1)
            if (nextSlug) setSelectedSlug(nextSlug)
          }}
        />
      )}
    </div>
  )
}

function ItemDetail({ slug, language, onUserEntryChanged }: {
  slug: string
  language: AppLanguage
  onUserEntryChanged?: (nextSlug?: string) => void
}) {
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

  if (!record) return <div className="bb-best-loading">â€¦</div>

  const name = pickName(record, language)
  const tint = RARITY_COLOR[record.rarity.en] ?? '#94a3b8'
  const icon = CATEGORY_ICON[record.category.en] ?? 'ðŸ“¦'
  const description = localized(record.description, language)
  // Dataset quirk: `properties` is usually an L10n string ("versatile
  // (1d10)") but could in principle be an L10nArray for future imports.
  // Normalise to a display string here so either shape renders cleanly.
  const propertiesText = propertiesAsText(record.properties, language)
  const damage = (record as unknown as { damage?: string }).damage

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
            <span className="bb-best-hero-dot">Â·</span>
            <span style={{ color: tint }}>{localized(record.rarity, language)}</span>
          </div>
          <div className="bb-best-hero-chips">
            {record.cost != null && <Chip label={t('bestiary.cost')} value={`${record.cost} gp`} />}
            {record.weight != null && <Chip label={t('bestiary.weight')} value={`${record.weight} lb`} />}
            {record.ac && <Chip label="AC" value={localized(record.ac, language)} />}
            {damage && <Chip label={t('bestiary.damage')} value={damage} />}
            {record.damageType && <Chip label={t('bestiary.damageType')} value={localized(record.damageType, language)} />}
          </div>
        </div>
      </header>

      <ItemActions record={record} language={language} />
      <WikiEntryControls kind="item" record={record} onChanged={onUserEntryChanged} />

      {(record.classification || propertiesText || record.stealth) && (
        <section className="bb-best-metagrid">
          {record.classification && (
            <MetaRow label={t('bestiary.classification')} value={localized(record.classification, language)} />
          )}
          {propertiesText && (
            <MetaRow label={t('bestiary.properties')} value={propertiesText} />
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
        <span className="bb-best-footer-dot">Â·</span>
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

function ItemActions({
  record,
  language,
}: {
  record: ItemRecord
  language: AppLanguage
}) {
  const { t } = useTranslation()
  const playerConnected = useSessionStore((s) => s.playerConnected)
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  function handleSend() {
    window.electronAPI?.sendHandout(itemHandout(record, language))
    showToast(t('bestiary.sentToPlayer'), 'success')
  }
  // "An Spieler senden" only exists as a concept once a campaign is
  // loaded â€” without one, the Wiki is pure reference and the button
  // would just sit disabled. Hide it entirely in that mode to match
  // the MonsterDetail behaviour.
  if (!activeCampaignId) return null
  return (
    <div className="bb-best-actions-bar">
      <button
        type="button"
        className="bb-best-action-btn bb-best-action-primary"
        onClick={handleSend}
        disabled={!playerConnected}
        title={playerConnected ? t('bestiary.sendToPlayer') : t('bestiary.sendDisabled')}
      >
        ðŸ“¡ {t('bestiary.sendToPlayer')}
      </button>
    </div>
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

// Normalises `properties` (which the dataset writes as an L10n string but
// could theoretically be an L10nArray) into a single display string. Safely
// handles both shapes so a future data import can't crash the detail view.
function propertiesAsText(
  value: unknown,
  language: AppLanguage,
): string {
  if (!value) return ''
  if (typeof value === 'string') return titleCase(value)
  if (Array.isArray(value)) return (value as string[]).map(titleCase).join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const picked = obj[language] ?? obj.en ?? obj.de
    if (typeof picked === 'string') return titleCase(picked)
    if (Array.isArray(picked)) return (picked as string[]).map(titleCase).join(', ')
  }
  return ''
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
