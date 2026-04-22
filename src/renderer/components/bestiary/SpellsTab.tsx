import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '../../stores/uiStore'
import type { SpellIndexEntry, SpellRecord } from '@shared/ipc-types'
import { localized, localizedArray, pickName, titleCase } from './util'
import { EmptyDetail } from './MonstersTab'
import { spellHandout } from './actions'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { showToast } from '../shared/Toast'
import { WikiEntryControls } from './WikiEntryControls'
import { WikiEntryForm } from './WikiEntryForm'
import { WikiListMenu } from './WikiListMenu'

const LEVEL_ORDER: Record<string, number> = {
  cantrip: 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9,
}

const SCHOOL_COLOR: Record<string, string> = {
  abjuration: '#3b82f6',
  conjuration: '#22c55e',
  divination: '#f59e0b',
  enchantment: '#ec4899',
  evocation: '#ef4444',
  illusion: '#a78bfa',
  necromancy: '#6b7280',
  transmutation: '#06b6d4',
}

const SCHOOL_ICON: Record<string, string> = {
  abjuration: 'ðŸ›¡ï¸',
  conjuration: 'ðŸŒ€',
  divination: 'ðŸ”®',
  enchantment: 'ðŸ’«',
  evocation: 'ðŸ’¥',
  illusion: 'ðŸŽ­',
  necromancy: 'ðŸ’€',
  transmutation: 'ðŸ”„',
}

export function SpellsTab({
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
  const [index, setIndex] = useState<SpellIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<string>('')
  const [schoolFilter, setSchoolFilter] = useState<string>('')
  const [classFilter, setClassFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<'' | 'srd' | 'user'>('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [menuState, setMenuState] = useState<{ x: number; y: number; entry: SpellIndexEntry } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await window.electronAPI?.listSpells?.() ?? []
        if (!alive) return
        setIndex(rows)
      } catch (err) {
        if (alive) setError(String(err))
      }
    })()
    return () => { alive = false }
  }, [refreshTick])

  const availableLevels = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const sp of index) set.add(sp.level.en)
    return Array.from(set).sort((a, b) => (LEVEL_ORDER[a] ?? 99) - (LEVEL_ORDER[b] ?? 99))
  }, [index])

  const availableSchools = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const sp of index) set.add(sp.school.en.toLowerCase())
    return Array.from(set).sort()
  }, [index])

  const availableClasses = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const sp of index) {
      for (const c of sp.classes?.en ?? []) set.add(c.toLowerCase())
    }
    return Array.from(set).sort()
  }, [index])

  const filtered = useMemo(() => {
    if (!index) return []
    const q = query.trim().toLowerCase()
    return index
      .filter((sp) => {
        if (levelFilter && sp.level.en !== levelFilter) return false
        if (schoolFilter && sp.school.en.toLowerCase() !== schoolFilter) return false
        if (classFilter) {
          const has = (sp.classes?.en ?? []).some((c) => c.toLowerCase() === classFilter)
          if (!has) return false
        }
        if (sourceFilter === 'user' && !sp.userOwned) return false
        if (sourceFilter === 'srd'  &&  sp.userOwned) return false
        if (!q) return true
        const name = pickName(sp, language).toLowerCase()
        return name.includes(q)
          || sp.slug.includes(q)
          || sp.school.en.toLowerCase().includes(q)
          || sp.school.de.toLowerCase().includes(q)
      })
      // Default alphabetical sort per locale. Level still works as a
      // filter chip but the base list is name-ordered so a DM typing
      // "fireball" finds it in one visual pass rather than scrolling
      // past every cantrip first.
      .sort((a, b) => pickName(a, language).localeCompare(pickName(b, language), language))
  }, [index, query, language, levelFilter, schoolFilter, classFilter, sourceFilter])

  useEffect(() => {
    if (!initialSlug || !index) return
    setSelectedSlug(initialSlug)
    onConsumeInitial?.()
  }, [initialSlug, index, onConsumeInitial])

  useEffect(() => {
    if (filtered.length === 0) { setSelectedSlug(null); return }
    if (selectedSlug && filtered.some((sp) => sp.slug === selectedSlug)) return
    if (selectedSlug && index?.some((sp) => sp.slug === selectedSlug)) return
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
            <span>{t('bestiary.filterLevel')}</span>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="">{t('bestiary.filterAll')}</option>
              {availableLevels.map((lv) => (
                <option key={lv} value={lv}>{prettyLevel(lv, language, index)}</option>
              ))}
            </select>
          </label>
          <label className="bb-best-filter">
            <span>{t('bestiary.filterSchool')}</span>
            <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
              <option value="">{t('bestiary.filterAll')}</option>
              {availableSchools.map((s) => (
                <option key={s} value={s}>{prettySchool(s, language, index)}</option>
              ))}
            </select>
          </label>
          <label className="bb-best-filter">
            <span>{t('bestiary.filterClass')}</span>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">{t('bestiary.filterAll')}</option>
              {availableClasses.map((c) => (
                <option key={c} value={c}>{prettyClass(c, language, index)}</option>
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
          {(levelFilter || schoolFilter || classFilter || sourceFilter) && (
            <button
              type="button"
              className="bb-best-filter-clear"
              onClick={() => { setLevelFilter(''); setSchoolFilter(''); setClassFilter(''); setSourceFilter('') }}
            >
              âœ• {t('bestiary.clearFilters')}
            </button>
          )}
        </div>

        <div className="bb-best-listcount">
          <span>{t('bestiary.countSpells', { count: filtered.length })}</span>
          <button
            type="button"
            className="bb-best-list-new"
            onClick={() => setCreatingNew(true)}
            title={t('wikiForm.new_spell')}
          >
            + {t('wikiForm.new')}
          </button>
        </div>

        {creatingNew && (
          <WikiEntryForm
            kind="spell"
            onClose={() => setCreatingNew(false)}
            onSaved={(slug) => {
              setCreatingNew(false)
              setRefreshTick((n) => n + 1)
              setSelectedSlug(slug)
            }}
          />
        )}

        <ul className="bb-best-list">
          {filtered.map((sp) => {
            const name = pickName(sp, language)
            const schoolKey = sp.school.en.toLowerCase()
            const tint = SCHOOL_COLOR[schoolKey] ?? '#94a3b8'
            const icon = SCHOOL_ICON[schoolKey] ?? 'âœ¨'
            return (
              <li key={sp.slug}>
                <button
                  type="button"
                  className={
                    sp.slug === selectedSlug
                      ? 'bb-best-list-item active'
                      : 'bb-best-list-item'
                  }
                  onClick={() => handleSelect(sp.slug)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuState({ x: e.clientX, y: e.clientY, entry: sp })
                  }}
                  style={{ borderLeftColor: tint }}
                >
                  <span className="bb-best-list-chip" style={{ color: tint }}>{icon}</span>
                  <span className="bb-best-list-body">
                    <span className="bb-best-list-name display">
                      {name}
                      {sp.userOwned && (
                        <span className="bb-best-user-badge" title={t('library.sourceUser')}>â˜…</span>
                      )}
                    </span>
                    <span className="bb-best-list-meta">
                      {localized(sp.level, language)}
                      {' Â· '}
                      <span style={{ color: tint }}>{titleCase(localized(sp.school, language))}</span>
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
          <SpellDetail
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
          kind="spell"
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

function SpellDetail({ slug, language, onUserEntryChanged }: {
  slug: string
  language: AppLanguage
  onUserEntryChanged?: (nextSlug?: string) => void
}) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<SpellRecord | null>(null)

  useEffect(() => {
    let alive = true
    setRecord(null)
    ;(async () => {
      const row = await window.electronAPI?.getSpell?.(slug) ?? null
      if (alive) setRecord(row)
    })()
    return () => { alive = false }
  }, [slug])

  if (!record) return <div className="bb-best-loading">â€¦</div>

  const name = pickName(record, language)
  const schoolKey = record.school.en.toLowerCase()
  const tint = SCHOOL_COLOR[schoolKey] ?? '#94a3b8'
  const icon = SCHOOL_ICON[schoolKey] ?? 'âœ¨'
  const description = localized(record.description, language)
  const higherLevels = localized(record.higherLevels, language)
  // Alphabetically sorted per locale â€” raw SRD order (source-file order)
  // felt arbitrary to players scanning for "does Cleric get this?".
  const classes = localizedArray(record.classes, language)
    .map(titleCase)
    .sort((a, b) => a.localeCompare(b, language))
    .join(', ')

  return (
    <article className="bb-best-detail" style={{ borderLeftColor: tint }}>
      <header className="bb-best-hero">
        <div className="bb-best-hero-portrait" style={{ borderColor: tint }}>
          <span className="bb-best-hero-glyph" aria-hidden="true">{icon}</span>
        </div>
        <div className="bb-best-hero-text">
          <h2 className="bb-best-hero-name display">{name}</h2>
          <div className="bb-best-hero-sub">
            <span>{localized(record.level, language)}</span>
            <span className="bb-best-hero-dot">Â·</span>
            <span style={{ color: tint }}>{titleCase(localized(record.school, language))}</span>
            {record.ritual && (
              <>
                <span className="bb-best-hero-dot">Â·</span>
                <span>{t('bestiary.ritual')}</span>
              </>
            )}
          </div>
          <div className="bb-best-hero-chips">
            {record.castingTime && <Chip label={t('bestiary.castingTime')} value={localized(record.castingTime, language)} />}
            {record.range && <Chip label={t('bestiary.range')} value={localized(record.range, language)} />}
            {record.duration && <Chip label={t('bestiary.duration')} value={localized(record.duration, language)} />}
            {record.components?.raw && (
              <Chip label={t('bestiary.components')} value={localized(record.components.raw, language)} />
            )}
          </div>
        </div>
      </header>

      <SpellActions record={record} language={language} />
      <WikiEntryControls kind="spell" record={record} onChanged={onUserEntryChanged} />

      {classes && (
        <section className="bb-best-metagrid">
          <MetaRow label={t('bestiary.classes')} value={classes} />
        </section>
      )}

      {description && (
        <section className="bb-best-section">
          <h3>{t('bestiary.description')}</h3>
          <p className="bb-best-prose">{description}</p>
        </section>
      )}

      {higherLevels && (
        <section className="bb-best-section">
          <h3>{t('bestiary.higherLevels')}</h3>
          <p className="bb-best-prose">{higherLevels}</p>
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

function SpellActions({
  record,
  language,
}: {
  record: SpellRecord
  language: AppLanguage
}) {
  const { t } = useTranslation()
  const playerConnected = useSessionStore((s) => s.playerConnected)
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  function handleSend() {
    window.electronAPI?.sendHandout(spellHandout(record, language))
    showToast(t('bestiary.sentToPlayer'), 'success')
  }
  // Same reasoning as ItemActions: without a campaign the Wiki is
  // pure reference; nothing to send to a player window.
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

function prettyLevel(lv: string, lang: AppLanguage, index: SpellIndexEntry[]): string {
  const sample = index.find((sp) => sp.level.en === lv)
  if (!sample) return lv
  return localized(sample.level, lang)
}

function prettySchool(schoolKey: string, lang: AppLanguage, index: SpellIndexEntry[]): string {
  const sample = index.find((sp) => sp.school.en.toLowerCase() === schoolKey)
  if (!sample) return titleCase(schoolKey)
  return titleCase(localized(sample.school, lang))
}

function prettyClass(classKey: string, lang: AppLanguage, index: SpellIndexEntry[]): string {
  // Pick any spell that has this class to recover the localised label.
  for (const sp of index) {
    const arr = sp.classes?.en ?? []
    const i = arr.findIndex((c) => c.toLowerCase() === classKey)
    if (i === -1) continue
    const loc = lang === 'de' ? sp.classes?.de ?? [] : arr
    if (loc[i]) return titleCase(loc[i])
  }
  return titleCase(classKey)
}
