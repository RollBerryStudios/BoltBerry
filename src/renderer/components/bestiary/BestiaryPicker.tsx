import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/uiStore'
import { localized, pickName } from './util'
import type {
  ItemIndexEntry,
  MonsterIndexEntry,
  SpellIndexEntry,
} from '@shared/ipc-types'

/* Modal that lets the caller pick a single entry from the bestiary index.

   Used by:
   - Encounter builder (kind='monster')
   - Character sheet equipment editor (kind='item')
   - Character sheet spells editor (kind='spell')

   Lazy-loads the matching index on mount and caches it for the modal's
   lifetime. Filtering + sorting is identical to the public Bestiarium tab
   so the DM doesn't have to re-learn the surface. */

export type PickerKind = 'monster' | 'item' | 'spell'

export interface PickedEntry {
  kind: PickerKind
  slug: string
  name: string
  /** Localised label for the picked entry (already in the active UI language). */
  label: string
  /** Bilingual EN name — useful for callers that want a stable identifier
   *  (CharacterSheet stores spells/items in EN today). */
  nameEn: string
  /** Bilingual DE name when the dataset has one. */
  nameDe?: string
}

interface BestiaryPickerProps {
  kind: PickerKind
  initialQuery?: string
  onPick: (entry: PickedEntry) => void
  onClose: () => void
}

type AnyEntry = MonsterIndexEntry | ItemIndexEntry | SpellIndexEntry

export function BestiaryPicker({ kind, initialQuery, onPick, onClose }: BestiaryPickerProps) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const [index, setIndex] = useState<AnyEntry[] | null>(null)
  const [query, setQuery] = useState(initialQuery ?? '')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const api = window.electronAPI
      if (!api) return
      const rows = kind === 'monster'
        ? await api.listMonsters()
        : kind === 'item'
          ? await api.listItems()
          : await api.listSpells()
      if (!alive) return
      setIndex(rows as AnyEntry[])
    })()
    return () => { alive = false }
  }, [kind])

  // Autofocus the search field so the DM can start typing immediately.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(id)
  }, [])

  // ESC to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    if (!index) return []
    const q = query.trim().toLowerCase()
    const matched = index.filter((entry) => {
      if (!q) return true
      const en = entry.name.toLowerCase()
      const de = entry.nameDe?.toLowerCase() ?? ''
      return en.includes(q) || de.includes(q) || entry.slug.includes(q)
    })
    return matched.slice(0, 200) // keep the modal snappy even with 313 spells
  }, [index, query])

  // Reset highlight when filtered list changes shape.
  useEffect(() => {
    setActiveIndex(0)
  }, [query, kind])

  function commit(entry: AnyEntry) {
    onPick({
      kind,
      slug: entry.slug,
      name: pickName(entry, language),
      label: pickName(entry, language),
      nameEn: entry.name,
      nameDe: entry.nameDe,
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(filtered[activeIndex] ?? filtered[0])
    }
  }

  const titleKey = kind === 'monster'
    ? 'bestiaryPicker.titleMonster'
    : kind === 'item'
      ? 'bestiaryPicker.titleItem'
      : 'bestiaryPicker.titleSpell'

  return (
    <div className="bb-picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bb-picker"
        role="dialog"
        aria-modal="true"
        aria-label={t(titleKey)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bb-picker-header">
          <h3 className="bb-picker-title">{t(titleKey)}</h3>
          <button
            type="button"
            className="bb-picker-close"
            aria-label={t('bestiaryPicker.close')}
            onClick={onClose}
          >×</button>
        </div>

        <div className="bb-picker-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ color: 'var(--text-muted)' }}>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('bestiaryPicker.searchPlaceholder')}
          />
        </div>

        <ul className="bb-picker-list">
          {!index && (
            <li className="bb-picker-loading">…</li>
          )}
          {index && filtered.length === 0 && (
            <li className="bb-picker-empty">{t('bestiary.noMatches')}</li>
          )}
          {filtered.map((entry, i) => {
            const subtitle = subtitleFor(entry, kind, language)
            return (
              <li key={entry.slug}>
                <button
                  type="button"
                  className={i === activeIndex ? 'bb-picker-row active' : 'bb-picker-row'}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(entry)}
                >
                  <span className="bb-picker-row-name">{pickName(entry, language)}</span>
                  {subtitle && <span className="bb-picker-row-meta">{subtitle}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="bb-picker-footer">
          <span className="mono">↑↓</span> {t('bestiaryPicker.hintNavigate')}
          <span className="bb-picker-footer-sep">·</span>
          <span className="mono">↵</span> {t('bestiaryPicker.hintSelect')}
          <span className="bb-picker-footer-sep">·</span>
          <span className="mono">esc</span> {t('bestiaryPicker.hintClose')}
        </div>

        <PickerStyles />
      </div>
    </div>
  )
}

function subtitleFor(
  entry: AnyEntry,
  kind: PickerKind,
  language: 'de' | 'en',
): string {
  if (kind === 'monster') {
    const m = entry as MonsterIndexEntry
    return `CR ${m.challenge} · ${localized(m.type, language)}`
  }
  if (kind === 'item') {
    const it = entry as ItemIndexEntry
    return `${localized(it.category, language)} · ${localized(it.rarity, language)}`
  }
  const sp = entry as SpellIndexEntry
  return `${localized(sp.level, language)} · ${localized(sp.school, language)}`
}

function PickerStyles() {
  return (
    <style>{`
      .bb-picker-backdrop {
        position: fixed; inset: 0; z-index: 9990;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(2px);
        display: flex; align-items: flex-start; justify-content: center;
        padding-top: 12vh;
      }
      .bb-picker {
        width: min(560px, 92vw);
        max-height: 70vh;
        display: flex; flex-direction: column;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
        overflow: hidden;
      }
      .bb-picker .mono { font-family: var(--font-mono); }
      .bb-picker-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .bb-picker-title {
        margin: 0; font-size: 14px; font-weight: 700;
        color: var(--text-primary); letter-spacing: 0.02em;
      }
      .bb-picker-close {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted); font-size: 18px; line-height: 1;
        padding: 0 4px;
      }
      .bb-picker-search {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 14px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .bb-picker-search input {
        flex: 1; min-width: 0;
        padding: 6px 4px;
        background: transparent;
        border: none; outline: none;
        color: var(--text-primary);
        font-family: inherit;
        font-size: 13px;
      }
      .bb-picker-list {
        list-style: none; margin: 0; padding: 4px 0;
        overflow-y: auto;
        flex: 1;
      }
      .bb-picker-row {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 12px;
        width: 100%;
        padding: 7px 16px;
        background: transparent;
        border: none;
        color: var(--text-primary);
        text-align: left;
        font-family: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      .bb-picker-row:hover,
      .bb-picker-row.active {
        background: var(--accent-blue-dim);
        color: var(--accent-blue-light);
      }
      .bb-picker-row-name {
        font-weight: 500;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bb-picker-row-meta {
        font-size: 10px; letter-spacing: 0.04em;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .bb-picker-empty,
      .bb-picker-loading {
        padding: 20px 16px;
        text-align: center;
        color: var(--text-muted);
        font-size: 13px;
        font-style: italic;
      }
      .bb-picker-footer {
        display: flex; gap: 6px; align-items: center;
        padding: 8px 14px;
        border-top: 1px solid var(--border-subtle);
        font-size: 10px;
        color: var(--text-muted);
        background: var(--bg-elevated);
      }
      .bb-picker-footer-sep { opacity: 0.5; }
    `}</style>
  )
}
