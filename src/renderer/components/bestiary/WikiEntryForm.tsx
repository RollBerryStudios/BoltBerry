import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { L10n, L10nArray, MonsterRecord, ItemRecord, SpellRecord, NamedText } from '@shared/ipc-types'
import { showToast } from '../shared/Toast'

/**
 * Wiki entry editor — create / edit a custom monster, item, or spell.
 * Writes to `user_wiki_entries` via the upsertWikiEntry IPC. Used for
 * two flows:
 *   • "Neu" — starts from an empty template; DM enters a unique slug.
 *   • "Bearbeiten" — loads an existing user-owned record; slug is
 *     fixed (editing it would orphan references).
 *
 * Scope: only the fields DMs typically need to author a homebrew
 * entry. A few niche fields (tokens, image, legacy saving-throw
 * arrays, raw component strings, …) are preserved from the incoming
 * record but not editable through the form — they round-trip so an
 * existing entry isn't silently stripped by a rename.
 */
export type WikiKind = 'monster' | 'item' | 'spell'

export interface WikiEntryFormProps {
  kind: WikiKind
  /** Pass an existing record to edit; undefined for "Neu". */
  initialRecord?: MonsterRecord | ItemRecord | SpellRecord
  onClose: () => void
  onSaved: (slug: string) => void
}

export function WikiEntryForm({ kind, initialRecord, onClose, onSaved }: WikiEntryFormProps) {
  const { t } = useTranslation()
  const isNew = !initialRecord
  const [busy, setBusy] = useState(false)
  const [record, setRecord] = useState<AnyRecord>(
    () => initialRecord ? structuredClone(initialRecord) as AnyRecord : emptyRecord(kind),
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (busy) return
    if (!record.name.trim()) {
      showToast(t('wikiForm.errorNameRequired'), 'error')
      return
    }
    const slug = isNew
      ? deriveSlug((record as { slug?: string }).slug, record.name)
      : record.slug
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      showToast(t('wikiForm.errorSlugInvalid'), 'error')
      return
    }
    // Dup-slug guard for new entries. The backend uses ON CONFLICT DO
    // UPDATE so an unchecked save would silently clobber an existing
    // user entry with the same slug — catch that early and ask the DM
    // to confirm. SRD entries are fair game to shadow (the whole
    // "clone" flow relies on that), so we only warn when *their own*
    // bucket would be overwritten.
    if (isNew) {
      try {
        const existing = await lookupUserSlug(kind, slug)
        if (existing && !window.confirm(t('wikiForm.slugExistsWarn', { slug }))) {
          return
        }
      } catch { /* best-effort check */ }
    }
    setBusy(true)
    try {
      // Strip empty NamedText entries so phantom `{name:'', text:''}`
      // rows don't pollute the detail view. Only monsters have named
      // lists — items and spells round-trip unchanged.
      const payload = { ...cleanRecord(kind, record), slug, userOwned: true }
      const res = await window.electronAPI?.upsertWikiEntry(kind, slug, payload)
      if (!res?.success) throw new Error(res?.error || 'unknown')
      showToast(isNew ? t('wikiForm.createdSuccess') : t('wikiForm.updatedSuccess'), 'success')
      onSaved(slug)
    } catch (err) {
      console.error('[WikiEntryForm] save failed:', err)
      showToast(t('wikiForm.saveFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wiki-form-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="wiki-form-card" onClick={(e) => e.stopPropagation()}>
        <header className="wiki-form-header">
          <div className="wiki-form-title">
            {isNew ? t(`wikiForm.new_${kind}`) : t(`wikiForm.edit_${kind}`)}
          </div>
          <button className="wiki-form-close" onClick={onClose} aria-label={t('cropper.cancel')}>×</button>
        </header>

        <div className="wiki-form-body">
          {/* Shared name + slug block */}
          <FormRow label={t('wikiForm.nameEn')}>
            <input
              className="wiki-form-input"
              value={record.name}
              onChange={(e) => setRecord({ ...record, name: e.target.value })}
              autoFocus
            />
          </FormRow>
          <FormRow label={t('wikiForm.nameDe')}>
            <input
              className="wiki-form-input"
              value={record.nameDe ?? ''}
              onChange={(e) => setRecord({ ...record, nameDe: e.target.value })}
            />
          </FormRow>
          <FormRow label={t('wikiForm.slug')}>
            <input
              className="wiki-form-input wiki-form-input-mono"
              value={(record as { slug?: string }).slug ?? ''}
              onChange={(e) => setRecord({ ...record, slug: slugify(e.target.value) } as AnyRecord)}
              disabled={!isNew}
              placeholder={slugify(record.name || '')}
            />
          </FormRow>

          <div className="wiki-form-divider" />

          {/* Type-specific body */}
          {kind === 'monster' && <MonsterFormBody record={record as MonsterRecord} setRecord={setRecord as (r: MonsterRecord) => void} />}
          {kind === 'item'    && <ItemFormBody    record={record as ItemRecord}    setRecord={setRecord as (r: ItemRecord) => void} />}
          {kind === 'spell'   && <SpellFormBody   record={record as SpellRecord}   setRecord={setRecord as (r: SpellRecord) => void} />}
        </div>

        <footer className="wiki-form-footer">
          <button type="button" className="wiki-form-btn" onClick={onClose}>
            {t('cropper.cancel')}
          </button>
          <button
            type="button"
            className="wiki-form-btn wiki-form-btn-primary"
            onClick={handleSave}
            disabled={busy || !record.name.trim()}
          >
            {busy ? '…' : t('wikiForm.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── Shared row ────────────────────────────────────────────────────────────
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="wiki-form-row">
      <span className="wiki-form-row-label">{label}</span>
      {children}
    </label>
  )
}

function L10nRow({ label, value, onChange, textarea }: {
  label: string
  value: L10n | string | undefined
  onChange: (v: L10n) => void
  textarea?: boolean
}) {
  // Normalise string-or-L10n inputs into L10n so the form always
  // edits EN + DE separately, even when the upstream dataset stored
  // a plain string on this field.
  const en = typeof value === 'string' ? value : value?.en ?? ''
  const de = typeof value === 'string' ? value : value?.de ?? ''
  return (
    <div className="wiki-form-l10n">
      <span className="wiki-form-row-label">{label}</span>
      <div className="wiki-form-l10n-pair">
        {textarea ? (
          <>
            <textarea
              className="wiki-form-input"
              placeholder="EN"
              rows={3}
              value={en}
              onChange={(e) => onChange({ en: e.target.value, de })}
            />
            <textarea
              className="wiki-form-input"
              placeholder="DE"
              rows={3}
              value={de}
              onChange={(e) => onChange({ en, de: e.target.value })}
            />
          </>
        ) : (
          <>
            <input
              className="wiki-form-input"
              placeholder="EN"
              value={en}
              onChange={(e) => onChange({ en: e.target.value, de })}
            />
            <input
              className="wiki-form-input"
              placeholder="DE"
              value={de}
              onChange={(e) => onChange({ en, de: e.target.value })}
            />
          </>
        )}
      </div>
    </div>
  )
}

function L10nArrayRow({ label, value, onChange }: {
  label: string
  value: L10nArray | undefined
  onChange: (v: L10nArray) => void
}) {
  // Edit as comma-separated strings so DMs can type quickly. Empty
  // entries are trimmed out on save so trailing commas don't leave
  // phantom items.
  const en = (value?.en ?? []).join(', ')
  const de = (value?.de ?? []).join(', ')
  function parse(s: string): string[] {
    return s.split(',').map((p) => p.trim()).filter(Boolean)
  }
  return (
    <div className="wiki-form-l10n">
      <span className="wiki-form-row-label">{label}</span>
      <div className="wiki-form-l10n-pair">
        <input
          className="wiki-form-input"
          placeholder="EN (comma separated)"
          value={en}
          onChange={(e) => onChange({ en: parse(e.target.value), de: value?.de ?? [] })}
        />
        <input
          className="wiki-form-input"
          placeholder="DE (Komma-getrennt)"
          value={de}
          onChange={(e) => onChange({ en: value?.en ?? [], de: parse(e.target.value) })}
        />
      </div>
    </div>
  )
}

function NamedListEditor({ label, value, onChange }: {
  label: string
  value: NamedText[] | undefined
  onChange: (v: NamedText[]) => void
}) {
  const items = value ?? []
  const updateAt = (i: number, patch: Partial<NamedText>) =>
    onChange(items.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const add = () => onChange([...items, { name: '', text: '' }])

  return (
    <div className="wiki-form-named-list">
      <div className="wiki-form-row-label">{label}</div>
      {items.map((entry, i) => (
        <div key={i} className="wiki-form-named-item">
          <div className="wiki-form-named-head">
            <input
              className="wiki-form-input"
              placeholder="Name"
              value={entry.name}
              onChange={(e) => updateAt(i, { name: e.target.value })}
            />
            <button
              type="button"
              className="wiki-form-named-remove"
              onClick={() => remove(i)}
              aria-label="remove"
            >
              ✕
            </button>
          </div>
          <textarea
            className="wiki-form-input"
            rows={3}
            value={entry.text}
            onChange={(e) => updateAt(i, { text: e.target.value })}
          />
        </div>
      ))}
      <button type="button" className="wiki-form-named-add" onClick={add}>
        + {label}
      </button>
    </div>
  )
}

// ─── Monster body ──────────────────────────────────────────────────────────
function MonsterFormBody({ record, setRecord }: { record: MonsterRecord; setRecord: (r: MonsterRecord) => void }) {
  const { t } = useTranslation()
  const patch = (p: Partial<MonsterRecord>) => setRecord({ ...record, ...p })
  return (
    <>
      <L10nRow
        label={t('wikiForm.monsterMeta')}
        value={record.meta}
        onChange={(v) => patch({ meta: v })}
      />
      <div className="wiki-form-grid">
        <FormRow label={t('wikiForm.monsterChallenge')}>
          <input
            className="wiki-form-input wiki-form-input-mono"
            value={record.challenge}
            onChange={(e) => patch({ challenge: e.target.value })}
            placeholder="1/4, 1, 5, …"
          />
        </FormRow>
        <FormRow label={t('wikiForm.monsterXp')}>
          <input
            type="number"
            className="wiki-form-input wiki-form-input-mono"
            value={record.xp}
            onChange={(e) => patch({ xp: Number(e.target.value) || 0 })}
          />
        </FormRow>
      </div>
      <L10nRow
        label={t('wikiForm.monsterAc')}
        value={typeof record.ac === 'string' ? { en: record.ac, de: record.ac } : record.ac}
        onChange={(v) => patch({ ac: v })}
      />
      <L10nRow
        label={t('wikiForm.monsterHp')}
        value={record.hp}
        onChange={(v) => patch({ hp: v })}
      />
      <div className="wiki-form-grid wiki-form-grid-6">
        {(['str','dex','con','int','wis','cha'] as const).map((k) => (
          <FormRow key={k} label={k.toUpperCase()}>
            <input
              type="number"
              className="wiki-form-input wiki-form-input-mono"
              value={record[k]}
              onChange={(e) => patch({ [k]: Number(e.target.value) || 0 } as Partial<MonsterRecord>)}
            />
          </FormRow>
        ))}
      </div>
      <div className="wiki-form-grid">
        <FormRow label={t('wikiForm.monsterSpeedEn')}>
          <input
            type="number"
            className="wiki-form-input wiki-form-input-mono"
            value={record.speed?.run?.en ?? 30}
            onChange={(e) => patch({ speed: { ...record.speed, run: { en: Number(e.target.value) || 0, de: record.speed?.run?.de ?? 0 } } })}
          />
        </FormRow>
        <FormRow label={t('wikiForm.monsterSpeedDe')}>
          <input
            type="number"
            className="wiki-form-input wiki-form-input-mono"
            value={record.speed?.run?.de ?? 9}
            onChange={(e) => patch({ speed: { ...record.speed, run: { en: record.speed?.run?.en ?? 0, de: Number(e.target.value) || 0 } } })}
          />
        </FormRow>
      </div>
      <L10nArrayRow
        label={t('wikiForm.monsterSenses')}
        value={record.senses}
        onChange={(v) => patch({ senses: v })}
      />
      <L10nArrayRow
        label={t('wikiForm.monsterLanguages')}
        value={record.languages}
        onChange={(v) => patch({ languages: v })}
      />

      <div className="wiki-form-divider" />

      <div className="wiki-form-grid">
        <NamedListEditor
          label={t('wikiForm.monsterTraitsEn')}
          value={record.traits?.en}
          onChange={(v) => patch({ traits: { en: v, de: record.traits?.de ?? [] } })}
        />
        <NamedListEditor
          label={t('wikiForm.monsterTraitsDe')}
          value={record.traits?.de}
          onChange={(v) => patch({ traits: { en: record.traits?.en ?? [], de: v } })}
        />
      </div>
      <div className="wiki-form-grid">
        <NamedListEditor
          label={t('wikiForm.monsterActionsEn')}
          value={(record.actions?.en ?? []).filter(isNamed)}
          onChange={(v) => patch({ actions: mergeNamedWithStrings(record.actions, 'en', v) })}
        />
        <NamedListEditor
          label={t('wikiForm.monsterActionsDe')}
          value={(record.actions?.de ?? []).filter(isNamed)}
          onChange={(v) => patch({ actions: mergeNamedWithStrings(record.actions, 'de', v) })}
        />
      </div>
      <div className="wiki-form-grid">
        <NamedListEditor
          label={t('wikiForm.monsterReactionsEn')}
          value={record.reactions?.en}
          onChange={(v) => patch({ reactions: { en: v, de: record.reactions?.de ?? [] } })}
        />
        <NamedListEditor
          label={t('wikiForm.monsterReactionsDe')}
          value={record.reactions?.de}
          onChange={(v) => patch({ reactions: { en: record.reactions?.en ?? [], de: v } })}
        />
      </div>
      <div className="wiki-form-grid">
        <NamedListEditor
          label={t('wikiForm.monsterLegendaryEn')}
          value={(record.legendaryActions?.en ?? []).filter(isNamed)}
          onChange={(v) => patch({ legendaryActions: mergeNamedWithStrings(record.legendaryActions, 'en', v) })}
        />
        <NamedListEditor
          label={t('wikiForm.monsterLegendaryDe')}
          value={(record.legendaryActions?.de ?? []).filter(isNamed)}
          onChange={(v) => patch({ legendaryActions: mergeNamedWithStrings(record.legendaryActions, 'de', v) })}
        />
      </div>
    </>
  )
}

// ─── Item body ─────────────────────────────────────────────────────────────
function ItemFormBody({ record, setRecord }: { record: ItemRecord; setRecord: (r: ItemRecord) => void }) {
  const { t } = useTranslation()
  const patch = (p: Partial<ItemRecord>) => setRecord({ ...record, ...p })
  return (
    <>
      <L10nRow
        label={t('wikiForm.itemCategory')}
        value={record.category}
        onChange={(v) => patch({ category: v })}
      />
      <L10nRow
        label={t('wikiForm.itemRarity')}
        value={record.rarity}
        onChange={(v) => patch({ rarity: v })}
      />
      <div className="wiki-form-grid">
        <FormRow label={t('wikiForm.itemCost')}>
          <input
            type="number"
            className="wiki-form-input wiki-form-input-mono"
            value={record.cost ?? ''}
            onChange={(e) => patch({ cost: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="gp"
          />
        </FormRow>
        <FormRow label={t('wikiForm.itemWeight')}>
          <input
            className="wiki-form-input wiki-form-input-mono"
            value={record.weight as (string | number) ?? ''}
            onChange={(e) => patch({ weight: e.target.value === '' ? null : e.target.value })}
            placeholder="lb"
          />
        </FormRow>
      </div>
      <L10nRow
        label={t('wikiForm.itemClassification')}
        value={record.classification}
        onChange={(v) => patch({ classification: v })}
      />
      <FormRow label={t('wikiForm.itemDamage')}>
        <input
          className="wiki-form-input"
          value={record.damage ?? ''}
          onChange={(e) => patch({ damage: e.target.value })}
          placeholder="1d6"
        />
      </FormRow>
      <L10nRow
        label={t('wikiForm.itemDamageType')}
        value={record.damageType}
        onChange={(v) => patch({ damageType: v })}
      />
      <L10nRow
        label={t('wikiForm.itemAc')}
        value={record.ac}
        onChange={(v) => patch({ ac: v })}
      />
      <L10nRow
        label={t('wikiForm.description')}
        value={record.description}
        onChange={(v) => patch({ description: v })}
        textarea
      />
    </>
  )
}

// ─── Spell body ────────────────────────────────────────────────────────────
function SpellFormBody({ record, setRecord }: { record: SpellRecord; setRecord: (r: SpellRecord) => void }) {
  const { t } = useTranslation()
  const patch = (p: Partial<SpellRecord>) => setRecord({ ...record, ...p })
  const comps = record.components ?? { verbal: false, somatic: false, material: false }
  return (
    <>
      <L10nRow
        label={t('wikiForm.spellLevel')}
        value={record.level}
        onChange={(v) => patch({ level: v })}
      />
      <L10nRow
        label={t('wikiForm.spellSchool')}
        value={record.school}
        onChange={(v) => patch({ school: v })}
      />
      <div className="wiki-form-row">
        <span className="wiki-form-row-label">{t('wikiForm.spellComponents')}</span>
        <div className="wiki-form-components">
          <label>
            <input
              type="checkbox"
              checked={!!comps.verbal}
              onChange={(e) => patch({ components: { ...comps, verbal: e.target.checked } })}
            /> V
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!comps.somatic}
              onChange={(e) => patch({ components: { ...comps, somatic: e.target.checked } })}
            /> S
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!comps.material}
              onChange={(e) => patch({ components: { ...comps, material: e.target.checked } })}
            /> M
          </label>
          <input
            className="wiki-form-input"
            placeholder={t('wikiForm.spellComponentsMaterial')}
            value={typeof comps.raw === 'string' ? comps.raw : (comps.raw?.en ?? '')}
            onChange={(e) => {
              // The dataset stores `raw` as either a plain string or
              // L10n. Mirror whatever was there; don't flatten an L10n
              // object into a string (that would drop the DE version
              // silently on every edit).
              const next = typeof comps.raw === 'object' && comps.raw !== null
                ? { en: e.target.value, de: comps.raw.de ?? '' }
                : e.target.value
              patch({ components: { ...comps, raw: next } })
            }}
            disabled={!comps.material}
          />
        </div>
      </div>
      <L10nRow
        label={t('wikiForm.spellCastingTime')}
        value={record.castingTime}
        onChange={(v) => patch({ castingTime: v })}
      />
      <L10nRow
        label={t('wikiForm.spellRange')}
        value={record.range}
        onChange={(v) => patch({ range: v })}
      />
      <L10nRow
        label={t('wikiForm.spellDuration')}
        value={record.duration}
        onChange={(v) => patch({ duration: v })}
      />
      <L10nArrayRow
        label={t('wikiForm.spellClasses')}
        value={record.classes}
        onChange={(v) => patch({ classes: v })}
      />
      <FormRow label={t('wikiForm.spellRitual')}>
        <input
          type="checkbox"
          checked={!!record.ritual}
          onChange={(e) => patch({ ritual: e.target.checked })}
        />
      </FormRow>
      <L10nRow
        label={t('wikiForm.description')}
        value={record.description}
        onChange={(v) => patch({ description: v })}
        textarea
      />
      <L10nRow
        label={t('wikiForm.spellHigherLevels')}
        value={record.higherLevels}
        onChange={(v) => patch({ higherLevels: v })}
        textarea
      />
    </>
  )
}

// ─── Empty templates ──────────────────────────────────────────────────────
type AnyRecord = MonsterRecord | ItemRecord | SpellRecord

function emptyRecord(kind: WikiKind): AnyRecord {
  if (kind === 'monster') return emptyMonster()
  if (kind === 'item')    return emptyItem()
  return emptySpell()
}

function emptyMonster(): MonsterRecord {
  return {
    id: 0,
    slug: '',
    name: '',
    nameDe: '',
    source: 'Eigene',
    meta: { en: 'Medium humanoid, neutral', de: 'Mittelgroßer Humanoid, neutral' },
    challenge: '0',
    xp: 0,
    ac: { en: '10', de: '10' },
    hp: { en: '10', de: '10' },
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    speed: { run: { en: 30, de: 9 } },
    senses: { en: [], de: [] },
    languages: { en: [], de: [] },
    traits: { en: [], de: [] },
    actions: { en: [], de: [] },
    reactions: { en: [], de: [] },
    legendaryActions: { en: [], de: [] },
    size: { en: 'Medium', de: 'Mittel' },
    type: { en: 'humanoid', de: 'Humanoid' },
    alignment: { en: 'neutral', de: 'neutral' },
    license: 'Homebrew',
    licenseSource: 'User',
    userOwned: true,
  }
}

function emptyItem(): ItemRecord {
  return {
    id: 0,
    slug: '',
    name: '',
    nameDe: '',
    category: { en: 'ADVENTURING_GEAR', de: 'Abenteuerausrüstung' },
    rarity: { en: 'common', de: 'gewöhnlich' },
    cost: null,
    weight: null,
    description: { en: '', de: '' },
    license: 'Homebrew',
    licenseSource: 'User',
    userOwned: true,
  }
}

function emptySpell(): SpellRecord {
  return {
    id: 0,
    slug: '',
    name: '',
    nameDe: '',
    level: { en: '1', de: '1' },
    school: { en: 'evocation', de: 'Hervorrufung' },
    castingTime: { en: '1 action', de: '1 Aktion' },
    range: { en: '60 feet', de: '18 Meter' },
    duration: { en: 'Instantaneous', de: 'Unmittelbar' },
    components: { verbal: false, somatic: false, material: false },
    classes: { en: [], de: [] },
    description: { en: '', de: '' },
    license: 'Homebrew',
    licenseSource: 'User',
    userOwned: true,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as Record<string, string>)[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function deriveSlug(explicit: string | undefined, name: string): string {
  const s = (explicit ?? '').trim()
  return s || slugify(name)
}

function isNamed(x: NamedText | string): x is NamedText {
  return typeof x !== 'string'
}

/**
 * Probe whether a user-authored entry already exists for this slug.
 * We don't have a dedicated "get user entry" IPC — the list handler is
 * already O(n) in the table size (indexed by `kind`), and homebrew
 * tables stay small, so a single list walk is cheap and avoids adding
 * a second IPC surface for one warning dialog.
 */
async function lookupUserSlug(kind: WikiKind, slug: string): Promise<boolean> {
  if (!window.electronAPI) return false
  const list = kind === 'monster'
    ? await window.electronAPI.listMonsters()
    : kind === 'item'
      ? await window.electronAPI.listItems()
      : await window.electronAPI.listSpells()
  return list.some((e) => e.slug === slug && e.userOwned)
}

/**
 * Strip empty NamedText rows ({name:'', text:''}) from monster lists
 * so the detail view doesn't render phantom bullet points. Items /
 * spells have no NamedText fields; they round-trip unchanged.
 */
function cleanRecord(kind: WikiKind, record: AnyRecord): AnyRecord {
  if (kind !== 'monster') return record
  const m = record as MonsterRecord
  const clean = (arr: Array<NamedText | string> | undefined) =>
    (arr ?? []).filter((x) => typeof x === 'string' || (x.name.trim() !== '' || x.text.trim() !== ''))
  const cleanNamed = (arr: NamedText[] | undefined) =>
    (arr ?? []).filter((x) => x.name.trim() !== '' || x.text.trim() !== '')
  return {
    ...m,
    traits: { en: cleanNamed(m.traits?.en), de: cleanNamed(m.traits?.de) },
    actions: { en: clean(m.actions?.en), de: clean(m.actions?.de) },
    reactions: { en: cleanNamed(m.reactions?.en), de: cleanNamed(m.reactions?.de) },
    legendaryActions: { en: clean(m.legendaryActions?.en), de: clean(m.legendaryActions?.de) },
  }
}

/**
 * Monster `actions` (and legendary / reactions in the dataset) use a
 * mixed `Array<NamedText | string>` shape — the first entry is often
 * a plain-string intro like "The dragon can take 3 legendary actions…".
 * The form only edits NamedText entries (they're the meaningful ones),
 * but we must preserve any incoming string intros so editing doesn't
 * silently strip them. This helper spLices the edited NamedText list
 * back in while keeping the original string entries in their original
 * positions.
 */
function mergeNamedWithStrings(
  source: { en: Array<NamedText | string>; de: Array<NamedText | string> } | undefined,
  locale: 'en' | 'de',
  edited: NamedText[],
): { en: Array<NamedText | string>; de: Array<NamedText | string> } {
  const merged = { en: source?.en ?? [], de: source?.de ?? [] }
  const original = merged[locale]
  const strings = original.filter((x): x is string => typeof x === 'string')
  // Keep string intros at the front; the dataset always places them
  // there so this matches the source ordering.
  merged[locale] = [...strings, ...edited]
  return merged
}
