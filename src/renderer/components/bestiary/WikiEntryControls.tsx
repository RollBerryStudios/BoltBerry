import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MonsterRecord, ItemRecord, SpellRecord } from '@shared/ipc-types'
import { showToast } from '../shared/Toast'
import { WikiEntryForm } from './WikiEntryForm'

/**
 * Wiki user-entry controls — clone, rename, delete. Mounted at the
 * bottom of each detail view (Monster / Item / Spell). Clone is the
 * primary path for creating editable copies: it duplicates the current
 * record with a fresh slug and a "(Kopie)" name suffix, writes it to
 * `user_wiki_entries`, and kicks the parent's refresh callback so the
 * list badges + counts stay accurate.
 *
 * Rename is a prompt-based inline edit for the localised names — a
 * full field-by-field form lives outside the scope of this component.
 * Delete is gated to user-owned rows only (DBs never delete SRD data).
 */
export type WikiKind = 'monster' | 'item' | 'spell'

export interface WikiEntryControlsProps {
  kind: WikiKind
  record: MonsterRecord | ItemRecord | SpellRecord
  /** Called after every successful mutation. Pass a follow-up slug to
   *  navigate the parent list to a freshly cloned row. */
  onChanged?: (nextSlug?: string) => void
}

export function WikiEntryControls({ kind, record, onChanged }: WikiEntryControlsProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const isUser = !!record.userOwned

  async function handleClone() {
    if (!window.electronAPI || busy) return
    setBusy(true)
    try {
      const newSlug = freshSlug(record.slug)
      // The clone is a deep copy of the source record with the slug
      // bumped and the display names suffixed. Everything else stays
      // identical so the DM can edit from a complete template.
      const clone = structuredClone(record) as typeof record
      clone.slug = newSlug
      clone.userOwned = true
      clone.name = `${record.name} (Kopie)`
      if ('nameDe' in clone && typeof clone.nameDe === 'string') {
        clone.nameDe = `${clone.nameDe} (Kopie)`
      }
      const res = await window.electronAPI.upsertWikiEntry(kind, newSlug, clone)
      if (!res.success) throw new Error(res.error || 'unknown')
      showToast(t('bestiary.cloneSuccess', { name: clone.name }), 'success')
      onChanged?.(newSlug)
    } catch (err) {
      console.error('[WikiEntryControls] clone failed:', err)
      showToast(t('bestiary.cloneFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleRename() {
    if (!window.electronAPI || busy || !isUser) return
    const nextEn = window.prompt(t('bestiary.renamePromptEn'), record.name)
    if (nextEn === null) return
    const trimmedEn = nextEn.trim()
    if (!trimmedEn) return
    // DE name is optional; blanking keeps the existing value since
    // empty prompts usually mean "didn't want to change it".
    const currentDe = ('nameDe' in record ? record.nameDe : '') ?? ''
    const nextDe = window.prompt(t('bestiary.renamePromptDe'), currentDe)
    setBusy(true)
    try {
      const updated = structuredClone(record) as typeof record
      updated.name = trimmedEn
      if ('nameDe' in updated) {
        updated.nameDe = (nextDe ?? '').trim() || currentDe || undefined
      }
      const res = await window.electronAPI.upsertWikiEntry(kind, record.slug, updated)
      if (!res.success) throw new Error(res.error || 'unknown')
      showToast(t('bestiary.renameSuccess'), 'success')
      onChanged?.()
    } catch (err) {
      console.error('[WikiEntryControls] rename failed:', err)
      showToast(t('bestiary.renameFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.electronAPI || busy || !isUser) return
    const confirmed = window.confirm(t('bestiary.deleteConfirm', { name: record.name }))
    if (!confirmed) return
    setBusy(true)
    try {
      const res = await window.electronAPI.deleteWikiEntry(kind, record.slug)
      if (!res.success) throw new Error(res.error || 'unknown')
      showToast(t('bestiary.deleteSuccess'), 'success')
      onChanged?.()
    } catch (err) {
      console.error('[WikiEntryControls] delete failed:', err)
      showToast(t('bestiary.deleteFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bb-best-actions-bar">
      <button
        type="button"
        className="bb-best-action-btn"
        data-testid={`button-wiki-${kind}-clone`}
        onClick={handleClone}
        disabled={busy}
        title={t('bestiary.cloneHint')}
      >
        📋 {t('bestiary.clone')}
      </button>
      {isUser && (
        <>
          <button
            type="button"
            className="bb-best-action-btn"
            data-testid={`button-wiki-${kind}-edit`}
            onClick={() => setEditing(true)}
            disabled={busy}
            title={t('bestiary.editHint')}
          >
            📝 {t('bestiary.edit')}
          </button>
          <button
            type="button"
            className="bb-best-action-btn"
            data-testid={`button-wiki-${kind}-rename`}
            onClick={handleRename}
            disabled={busy}
            title={t('bestiary.renameHint')}
          >
            ✏️ {t('bestiary.rename')}
          </button>
          <button
            type="button"
            className="bb-best-action-btn bb-best-action-danger"
            data-testid={`button-wiki-${kind}-delete`}
            onClick={handleDelete}
            disabled={busy}
            title={t('bestiary.deleteHint')}
          >
            🗑 {t('bestiary.delete')}
          </button>
        </>
      )}
      {editing && (
        <WikiEntryForm
          kind={kind}
          initialRecord={record}
          onClose={() => setEditing(false)}
          onSaved={(slug) => { setEditing(false); onChanged?.(slug) }}
        />
      )}
    </div>
  )
}

/**
 * Derive a new unique slug from an existing one. Appends `-copy-` +
 * a cryptographically random 6-char token so rapid-fire clones (or
 * two simultaneous duplicate clicks) never collide against the
 * UNIQUE(kind, slug) constraint. `crypto.randomUUID()` is available
 * in every Electron build we target (Chrome 92+); the 6-char slice
 * keeps the slug readable without sacrificing the ~16M collision
 * space needed here.
 */
function freshSlug(source: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 6)
  return `${source}-copy-${uuid}`
}
