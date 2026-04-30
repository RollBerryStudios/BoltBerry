import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  MonsterIndexEntry, ItemIndexEntry, SpellIndexEntry,
  MonsterRecord, ItemRecord, SpellRecord,
} from '@shared/ipc-types'
import { showToast } from '../shared/Toast'
import { WikiEntryForm } from './WikiEntryForm'
import { NpcCloneWizard } from './NpcCloneWizard'
import type { AppLanguage } from '../../stores/uiStore'
import { buildWikiFile, suggestedWikiFilename } from '../../utils/wikiTransfer'

/**
 * Right-click context menu for Wiki list items.
 *
 * Renders a floating menu at the cursor with the actions that apply to
 * the entry under the pointer:
 *
 *   • Duplizieren        — always available (primary path to an
 *                          editable copy in "Eigene")
 *   • Zu NSC klonen      — monsters only (opens the NPC wizard)
 *   • Bearbeiten         — user-owned entries only
 *   • Löschen            — user-owned entries only
 *
 * The menu fetches the full record on demand (the index entry only
 * carries the slug + name) before dispatching to a modal. Closes on
 * outside click, Escape, and scroll.
 */
export type WikiKind = 'monster' | 'item' | 'spell'
export type AnyIndexEntry = MonsterIndexEntry | ItemIndexEntry | SpellIndexEntry

export interface WikiListMenuProps {
  kind: WikiKind
  language: AppLanguage
  anchor: { x: number; y: number }
  entry: AnyIndexEntry
  onClose: () => void
  /** Called after a successful clone / edit / delete. If a new slug
   *  was created we pass it so the tab can navigate its detail pane. */
  onChanged: (nextSlug?: string) => void
}

export function WikiListMenu({ kind, language, anchor, entry, onClose, onChanged }: WikiListMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  // Clamped to the viewport — mirrors the token-context-menu pattern so
  // right-clicking near the edge of a tall Wiki list doesn't cut the
  // menu off.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  // Full record loaded lazily when an action needs it (clone / edit).
  const [editing, setEditing] = useState<MonsterRecord | ItemRecord | SpellRecord | null>(null)
  const [npcFor, setNpcFor] = useState<MonsterRecord | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const PAD = 8
    let x = anchor.x
    let y = anchor.y
    if (x + rect.width > window.innerWidth - PAD)   x = Math.max(PAD, window.innerWidth - rect.width - PAD)
    if (y + rect.height > window.innerHeight - PAD) y = Math.max(PAD, window.innerHeight - rect.height - PAD)
    setPos({ x, y })
  }, [anchor.x, anchor.y])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    function onScroll() { onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const isUser = !!entry.userOwned
  const modalMounted = editing || npcFor

  useEffect(() => {
    if (modalMounted || !pos) return
    setActiveIndex(0)
    requestAnimationFrame(() => itemRefs.current[0]?.focus())
  }, [modalMounted, pos])

  useEffect(() => {
    if (modalMounted) return
    itemRefs.current[activeIndex]?.focus()
  }, [activeIndex, modalMounted])

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(items.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  async function loadFullRecord(): Promise<MonsterRecord | ItemRecord | SpellRecord | null> {
    if (!window.electronAPI) return null
    if (kind === 'monster') return window.electronAPI.getMonster(entry.slug) as Promise<MonsterRecord | null>
    if (kind === 'item')    return window.electronAPI.getItem(entry.slug)    as Promise<ItemRecord | null>
    return window.electronAPI.getSpell(entry.slug) as Promise<SpellRecord | null>
  }

  async function handleDuplicate() {
    if (busy) return
    setBusy(true)
    try {
      const rec = await loadFullRecord()
      if (!rec) throw new Error('load-failed')
      const newSlug = `${rec.slug}-copy-${cryptoSuffix()}`
      const clone = structuredClone(rec) as typeof rec
      clone.slug = newSlug
      clone.userOwned = true
      clone.name = `${rec.name} (Kopie)`
      if ('nameDe' in clone && typeof clone.nameDe === 'string') {
        clone.nameDe = `${clone.nameDe} (Kopie)`
      }
      const res = await window.electronAPI?.upsertWikiEntry(kind, newSlug, clone)
      if (!res?.success) throw new Error(res?.error || 'unknown')
      showToast(t('bestiary.cloneSuccess', { name: clone.name }), 'success')
      onChanged(newSlug)
      onClose()
    } catch (err) {
      console.error('[WikiListMenu] duplicate failed:', err)
      showToast(t('bestiary.cloneFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenNpcWizard() {
    if (busy || kind !== 'monster') return
    setBusy(true)
    try {
      const rec = await loadFullRecord() as MonsterRecord | null
      if (!rec) throw new Error('load-failed')
      setNpcFor(rec)
    } catch (err) {
      console.error('[WikiListMenu] load monster for NPC wizard failed:', err)
      showToast(t('bestiary.cloneFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleEdit() {
    if (busy || !isUser) return
    setBusy(true)
    try {
      const rec = await loadFullRecord()
      if (!rec) throw new Error('load-failed')
      setEditing(rec)
    } catch (err) {
      console.error('[WikiListMenu] load for edit failed:', err)
      showToast(t('bestiary.cloneFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    if (busy || !window.electronAPI) return
    setBusy(true)
    try {
      const rec = await loadFullRecord()
      if (!rec) throw new Error('load-failed')
      const file = buildWikiFile(kind, rec)
      const result = await window.electronAPI.exportToFile({
        suggestedName: suggestedWikiFilename(kind, rec.name),
        content: JSON.stringify(file, null, 2),
        encoding: 'utf8',
        filters: [{ name: 'BoltBerry-Wiki (JSON)', extensions: ['json'] }],
        dialogTitle: t('bestiary.exportDialogTitle'),
      })
      if (result.success) {
        showToast(t('bestiary.exportSuccess', { name: rec.name }), 'success')
        onClose()
      } else if (!result.canceled) {
        showToast(t('bestiary.exportFailed', { error: result.error ?? '' }), 'error', 7000)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(t('bestiary.exportFailed', { error: msg }), 'error', 7000)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy || !isUser) return
    const confirmed = window.confirm(t('bestiary.deleteConfirm', { name: entry.name }))
    if (!confirmed) return
    setBusy(true)
    try {
      const res = await window.electronAPI?.deleteWikiEntry(kind, entry.slug)
      if (!res?.success) throw new Error(res?.error || 'unknown')
      showToast(t('bestiary.deleteSuccess'), 'success')
      onChanged()
      onClose()
    } catch (err) {
      console.error('[WikiListMenu] delete failed:', err)
      showToast(t('bestiary.deleteFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!modalMounted && (
        <div
          ref={menuRef}
          className="wiki-list-menu"
          role="menu"
          style={{
            position: 'fixed',
            top: pos?.y ?? anchor.y,
            left: pos?.x ?? anchor.x,
            visibility: pos ? 'visible' : 'hidden',
          }}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            ref={(el) => { itemRefs.current[0] = el }}
            type="button"
            className="wiki-list-menu-item"
            role="menuitem"
            tabIndex={activeIndex === 0 ? 0 : -1}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={handleDuplicate}
            disabled={busy}
          >
            📋 {t('bestiary.clone')}
          </button>
          {kind === 'monster' && (
            <button
              ref={(el) => { itemRefs.current[1] = el }}
              type="button"
              className="wiki-list-menu-item"
              role="menuitem"
              tabIndex={activeIndex === 1 ? 0 : -1}
              onMouseEnter={() => setActiveIndex(1)}
              onClick={handleOpenNpcWizard}
              disabled={busy}
            >
              🧑 {t('npcWizard.openButton')}
            </button>
          )}
          <button
            ref={(el) => { itemRefs.current[kind === 'monster' ? 2 : 1] = el }}
            type="button"
            className="wiki-list-menu-item"
            role="menuitem"
            tabIndex={activeIndex === (kind === 'monster' ? 2 : 1) ? 0 : -1}
            onMouseEnter={() => setActiveIndex(kind === 'monster' ? 2 : 1)}
            onClick={handleExport}
            disabled={busy}
          >
            📤 {t('bestiary.export')}
          </button>
          {isUser && (
            <>
              <div className="wiki-list-menu-sep" />
              <button
                ref={(el) => { itemRefs.current[kind === 'monster' ? 3 : 2] = el }}
                type="button"
                className="wiki-list-menu-item"
                role="menuitem"
                tabIndex={activeIndex === (kind === 'monster' ? 3 : 2) ? 0 : -1}
                onMouseEnter={() => setActiveIndex(kind === 'monster' ? 3 : 2)}
                onClick={handleEdit}
                disabled={busy}
              >
                📝 {t('bestiary.edit')}
              </button>
              <button
                ref={(el) => { itemRefs.current[kind === 'monster' ? 4 : 3] = el }}
                type="button"
                className="wiki-list-menu-item wiki-list-menu-danger"
                role="menuitem"
                tabIndex={activeIndex === (kind === 'monster' ? 4 : 3) ? 0 : -1}
                onMouseEnter={() => setActiveIndex(kind === 'monster' ? 4 : 3)}
                onClick={handleDelete}
                disabled={busy}
              >
                🗑 {t('bestiary.delete')}
              </button>
            </>
          )}
        </div>
      )}

      {editing && (
        <WikiEntryForm
          kind={kind}
          initialRecord={editing}
          onClose={() => { setEditing(null); onClose() }}
          onSaved={(slug) => { setEditing(null); onChanged(slug); onClose() }}
        />
      )}

      {npcFor && (
        <NpcCloneWizard
          monster={npcFor}
          language={language}
          defaultImageUrl={null}
          defaultTokenFile={null}
          onClose={() => { setNpcFor(null); onClose() }}
          onSaved={() => { setNpcFor(null); onClose() }}
        />
      )}
    </>
  )
}

/**
 * Short crypto-random suffix for cloned slugs — avoids collisions
 * even when two rapid clicks would produce the same timestamp. Falls
 * back to Math.random when crypto.randomUUID isn't available (ancient
 * renderer, unlikely but defensive).
 */
function cryptoSuffix(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 6)
  } catch {
    return Math.random().toString(36).slice(2, 8)
  }
}
