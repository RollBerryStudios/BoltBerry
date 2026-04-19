import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '../../stores/uiStore'
import type { MonsterIndexEntry } from '@shared/ipc-types'
import { localized, pickName, typeLabel, tokenTint } from './util'
import { MonsterDetail } from './MonsterDetail'

/* Monster list + detail pane. The list loads once from DATA_LIST_MONSTERS;
   the detail is fetched on-demand via DATA_GET_MONSTER and cached so
   flipping between monsters stays instant. */

export function MonstersTab({ query, language }: { query: string; language: AppLanguage }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState<MonsterIndexEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [crFilter, setCrFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await window.electronAPI?.listMonsters?.() ?? []
        if (!alive) return
        setIndex(rows)
      } catch (err) {
        if (alive) setError(String(err))
      }
    })()
    return () => { alive = false }
  }, [])

  // Distinct CR values actually present — keeps the CR filter dropdown
  // honest when the upstream dataset grows or shrinks.
  const availableCRs = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const m of index) set.add(m.challenge)
    return Array.from(set).sort((a, b) => crValue(a) - crValue(b))
  }, [index])

  const availableTypes = useMemo(() => {
    if (!index) return []
    const set = new Set<string>()
    for (const m of index) set.add(m.type.en)
    return Array.from(set).sort()
  }, [index])

  const filtered = useMemo(() => {
    if (!index) return []
    const q = query.trim().toLowerCase()
    return index
      .filter((m) => {
        if (crFilter && m.challenge !== crFilter) return false
        if (typeFilter && m.type.en !== typeFilter) return false
        if (!q) return true
        const name = pickName(m, language).toLowerCase()
        return name.includes(q)
          || m.slug.includes(q)
          || m.type.en.toLowerCase().includes(q)
          || m.type.de.toLowerCase().includes(q)
          || m.challenge.includes(q)
      })
      .sort((a, b) => {
        const cr = crValue(a.challenge) - crValue(b.challenge)
        if (cr !== 0) return cr
        return pickName(a, language).localeCompare(pickName(b, language))
      })
  }, [index, query, language, crFilter, typeFilter])

  // Auto-select the first row whenever the filter changes, so the detail
  // pane never ends up stuck on an entry that's no longer in the list.
  useEffect(() => {
    if (filtered.length === 0) { setSelectedSlug(null); return }
    if (selectedSlug && filtered.some((m) => m.slug === selectedSlug)) return
    setSelectedSlug(filtered[0].slug)
  }, [filtered, selectedSlug])

  const handleSelect = useCallback((slug: string) => setSelectedSlug(slug), [])

  if (error) {
    return <div className="bb-best-error">⚠️ {error}</div>
  }

  if (!index) {
    return <div className="bb-best-loading">…</div>
  }

  return (
    <div className="bb-best-layout">
      <aside className="bb-best-listpane">
        <div className="bb-best-filterbar">
          <FilterPill
            value={crFilter}
            onChange={setCrFilter}
            label={t('bestiary.filterCr')}
            allLabel={t('bestiary.filterAll')}
            options={availableCRs.map((cr) => ({ value: cr, label: `CR ${cr}` }))}
          />
          <FilterPill
            value={typeFilter}
            onChange={setTypeFilter}
            label={t('bestiary.filterType')}
            allLabel={t('bestiary.filterAll')}
            options={availableTypes.map((typeEn) => ({
              value: typeEn,
              label: typeLabel(typeEn, language, index),
            }))}
          />
          {(crFilter || typeFilter) && (
            <button
              type="button"
              className="bb-best-filter-clear"
              onClick={() => { setCrFilter(''); setTypeFilter('') }}
            >
              ✕ {t('bestiary.clearFilters')}
            </button>
          )}
        </div>

        <div className="bb-best-listcount">
          {t('bestiary.countMonsters', { count: filtered.length })}
        </div>

        <ul className="bb-best-list">
          {filtered.map((m) => {
            const displayName = pickName(m, language)
            const typeText = localized(m.type, language)
            const tint = tokenTint(m.type.en)
            return (
              <li key={m.slug}>
                <button
                  type="button"
                  className={
                    m.slug === selectedSlug
                      ? 'bb-best-list-item active'
                      : 'bb-best-list-item'
                  }
                  onClick={() => handleSelect(m.slug)}
                  style={{ borderLeftColor: tint }}
                >
                  <span className="bb-best-list-chip mono">CR {m.challenge}</span>
                  <span className="bb-best-list-body">
                    <span className="bb-best-list-name display">{displayName}</span>
                    <span className="bb-best-list-meta">{typeText}</span>
                  </span>
                  <span className="bb-best-list-count mono" title={t('bestiary.tokenCount')}>
                    🎨 {m.tokenCount}
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
          <MonsterDetail slug={selectedSlug} language={language} />
        ) : (
          <EmptyDetail label={t('bestiary.noSelection')} />
        )}
      </main>
    </div>
  )
}

export function EmptyDetail({ label }: { label: string }) {
  return (
    <div className="bb-best-empty">
      <div className="bb-best-empty-glyph">📖</div>
      <div className="bb-best-empty-text">{label}</div>
    </div>
  )
}

function FilterPill({ value, onChange, label, allLabel, options }: {
  value: string
  onChange: (v: string) => void
  label: string
  allLabel: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="bb-best-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

// Parse "1/8" / "1/4" / "1/2" / "0" / "3" / "13" into a sortable number.
// Preserves the dataset order for unknown values so they cluster at the end.
function crValue(cr: string): number {
  if (!cr) return 9999
  if (cr.includes('/')) {
    const [a, b] = cr.split('/').map((s) => parseInt(s, 10))
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b
    return 9999
  }
  const n = parseFloat(cr)
  return Number.isFinite(n) ? n : 9999
}

