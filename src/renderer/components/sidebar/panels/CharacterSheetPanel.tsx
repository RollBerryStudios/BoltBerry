import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCharacterStore } from '../../../stores/characterStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'
import type { CharacterSheet, CharacterAttack } from '@shared/ipc-types'
import { EmptyState } from '../../EmptyState'
import { BestiaryPicker } from '../../bestiary/BestiaryPicker'
import { CircularCropper } from '../../shared/CircularCropper'
import { useImageUrl } from '../../../hooks/useImageUrl'
import { showToast } from '../../shared/Toast'
import {
  buildCharacterFile,
  parseCharacterFile,
  suggestedCharacterFilename,
} from '../../../utils/characterTransfer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

// Maps the bestiary's `spell.level.en` string to a numeric slot 0-9.
// Accepts "cantrip", "cantrip (0)", "1", "3", … The dataset is terse but
// inconsistent, so we default to 0 when parsing fails rather than throwing.
function parseSpellLevel(level: string): number {
  const s = (level ?? '').trim().toLowerCase()
  if (!s || s.startsWith('cantrip') || s.startsWith('zauber')) return 0
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 && n <= 9 ? n : 0
}

function modStr(score: number): string {
  const m = modifier(score)
  return m >= 0 ? `+${m}` : `${m}`
}

const ABILITY_KEYS: Array<{ key: keyof CharacterSheet; label: string }> = [
  { key: 'str',      label: 'STR' },
  { key: 'dex',      label: 'DEX' },
  { key: 'con',      label: 'CON' },
  { key: 'intScore', label: 'INT' },
  { key: 'wis',      label: 'WIS' },
  { key: 'cha',      label: 'CHA' },
]

const SAVING_THROW_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const SKILL_DEFS: Array<{ key: string; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; label: string }> = [
  { key: 'acrobatics',     ability: 'dex', label: 'Akrobatik' },
  { key: 'animalHandling', ability: 'wis', label: 'Tierführung' },
  { key: 'arcana',         ability: 'int', label: 'Arkane Kunde' },
  { key: 'athletics',      ability: 'str', label: 'Athletik' },
  { key: 'deception',      ability: 'cha', label: 'Täuschung' },
  { key: 'history',        ability: 'int', label: 'Geschichte' },
  { key: 'insight',        ability: 'wis', label: 'Einblick' },
  { key: 'intimidation',   ability: 'cha', label: 'Einschüchterung' },
  { key: 'investigation',  ability: 'int', label: 'Nachforschung' },
  { key: 'medicine',       ability: 'wis', label: 'Medizin' },
  { key: 'nature',         ability: 'wis', label: 'Naturkunde' },
  { key: 'perception',     ability: 'wis', label: 'Wahrnehmung' },
  { key: 'performance',    ability: 'cha', label: 'Auftreten' },
  { key: 'persuasion',     ability: 'cha', label: 'Überzeugung' },
  { key: 'religion',       ability: 'int', label: 'Religion' },
  { key: 'sleightOfHand',  ability: 'dex', label: 'Fingerfertigkeit' },
  { key: 'stealth',        ability: 'dex', label: 'Heimlichkeit' },
  { key: 'survival',       ability: 'wis', label: 'Überleben' },
]

function skillBonus(sheet: CharacterSheet, sk: typeof SKILL_DEFS[number]): number {
  const abilityMap: Record<string, number> = {
    str: sheet.str, dex: sheet.dex, con: sheet.con,
    int: sheet.intScore, wis: sheet.wis, cha: sheet.cha,
  }
  const abilityMod = modifier(abilityMap[sk.ability] ?? 10)
  const prof = (sheet.skills as unknown as Record<string, boolean>)[sk.key] ? sheet.proficiencyBonus : 0
  return abilityMod + prof
}

function savingBonus(sheet: CharacterSheet, ability: string): number {
  const abilityMap: Record<string, number> = {
    str: sheet.str, dex: sheet.dex, con: sheet.con,
    int: sheet.intScore, wis: sheet.wis, cha: sheet.cha,
  }
  const abilityMod = modifier(abilityMap[ability] ?? 10)
  const prof = (sheet.savingThrows as unknown as Record<string, boolean>)[ability] ? sheet.proficiencyBonus : 0
  return abilityMod + prof
}

const bonusStr = (n: number) => n >= 0 ? `+${n}` : `${n}`

// ─── Section component ────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--bg-surface)',
          border: 'none', borderBottom: '1px solid var(--border)',
          color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          minHeight: 32, padding: '6px 10px', cursor: 'pointer', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        {title}
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '6px 8px' }}>{children}</div>}
    </div>
  )
}

// ─── Numeric input ────────────────────────────────────────────────────────────

function NumInput({ value, onChange, style, id, ariaLabel }: {
  value: number
  onChange: (v: number) => void
  style?: React.CSSProperties
  id?: string
  ariaLabel?: string
}) {
  return (
    <input
      type="number"
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={{
        width: 44, textAlign: 'center', background: 'var(--bg-input)',
        border: '1px solid var(--border)', borderRadius: 4,
        color: 'var(--text)', fontSize: 12, minHeight: 28,
        padding: '4px 6px', boxSizing: 'border-box', ...style,
      }}
    />
  )
}

// ─── Text area ────────────────────────────────────────────────────────────────

function TextArea({ value, onChange, rows = 3, placeholder }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 4, color: 'var(--text)', fontSize: 12, padding: '7px 8px',
        resize: 'vertical', boxSizing: 'border-box',
      }}
    />
  )
}

// ─── Short text input ─────────────────────────────────────────────────────────

function TextInput({ value, onChange, placeholder, style, id, ariaLabel, dataTestId }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties
  id?: string
  ariaLabel?: string
  dataTestId?: string
}) {
  return (
    <input
      type="text"
      id={id}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 4, color: 'var(--text)', fontSize: 12, minHeight: 28, padding: '5px 8px',
        boxSizing: 'border-box', ...style,
      }}
    />
  )
}

// Inline spellbook — renders the CharacterSheet.spells JSON ({ [level]: name[] })
// as collapsible level groups with inline delete + a single "Add from
// Bestiarium" picker shared across levels (spell.level decides the bucket).
function SpellbookSection({
  spells,
  onRemove,
  onOpenPicker,
}: {
  spells: { [level: number]: string[] }
  onRemove: (level: number, i: number) => void
  onOpenPicker: () => void
}) {
  const { t } = useTranslation()
  // Always show the canonical 0-9 buckets so DMs can see at a glance
  // which levels are still empty and which need spell-slot tracking.
  const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  return (
    <Section title={t('characters.sectionSpells')} defaultOpen={false}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginBottom: 8, fontSize: 'var(--text-xs)' }}
        onClick={onOpenPicker}
      >
        ✨ {t('characters.addSpellFromBestiary')}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {LEVELS.map((lvl) => {
          const list = spells[lvl] ?? []
          if (list.length === 0) return null
          return (
            <div key={lvl}>
              <div style={{
                fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-muted)', fontWeight: 700, marginBottom: 3,
              }}>
                {lvl === 0 ? t('characters.cantripsLabel') : t('characters.spellLevelLabel', { level: lvl })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {list.map((name, i) => (
                  <div
                    key={`${name}-${i}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '3px 6px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 3,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: 'var(--text-primary)' }}>{name}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      style={{ padding: 2, fontSize: 10 }}
                      onClick={() => onRemove(lvl, i)}
                      title={t('characters.removeSpell')}
                      aria-label={t('characters.removeSpell')}
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {LEVELS.every((lvl) => (spells[lvl] ?? []).length === 0) && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {t('characters.noSpellsYet')}
          </div>
        )}
      </div>
    </Section>
  )
}

// ─── Sheet list sidebar ───────────────────────────────────────────────────────

function SheetList({ sheets, activeId, onSelect, onNew, onDelete }: {
  sheets: CharacterSheet[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <button
          onClick={onNew}
          style={{
            flex: 1, padding: '4px 8px', background: 'var(--accent-blue)', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}
        >
          + {t('characters.newSheet')}
        </button>
      </div>
      {sheets.map((s) => (
        <div
          key={s.id}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
            background: s.id === activeId ? 'var(--accent-blue)' : 'var(--bg-surface)',
            color: s.id === activeId ? '#fff' : 'var(--text)',
            border: `1px solid ${s.id === activeId ? 'var(--accent-blue)' : 'var(--border)'}`,
          }}
          onClick={() => onSelect(s.id)}
        >
          <span style={{ fontSize: 11, fontWeight: 600 }}>{s.name}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>Lv.{s.level} {s.className}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 12, opacity: 0.6 }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Main sheet editor ────────────────────────────────────────────────────────

type SheetTab = 'combat' | 'abilities' | 'inventory' | 'bio'

const SHEET_TAB_STORAGE_KEY = 'boltberry-character-sheet-tab'
function loadInitialTab(): SheetTab {
  try {
    const v = localStorage.getItem(SHEET_TAB_STORAGE_KEY)
    if (v === 'combat' || v === 'abilities' || v === 'inventory' || v === 'bio') return v
  } catch { /* noop */ }
  return 'combat'
}

function SheetEditor({ sheet, onUpdate }: {
  sheet: CharacterSheet
  onUpdate: (patch: Partial<CharacterSheet>) => void
}) {
  const { t } = useTranslation()
  const language = useUIStore((s) => s.language)
  const [activeTab, setActiveTab] = useState<SheetTab>(loadInitialTab)
  const [pickerKind, setPickerKind] = useState<'item' | 'spell' | null>(null)

  function selectTab(tab: SheetTab) {
    setActiveTab(tab)
    try { localStorage.setItem(SHEET_TAB_STORAGE_KEY, tab) } catch { /* noop */ }
  }

  // Append an item to the freeform equipment field. Keeps the field
  // plain-text (no structured inventory) so existing users' data stays
  // unchanged — the picker just saves them from typing.
  function addItemFromPicker(name: string) {
    const current = (sheet.equipment ?? '').trim()
    const next = current ? `${current}\n• ${name}` : `• ${name}`
    onUpdate({ equipment: next })
  }

  // Spells are stored as `{[level: number]: string[]}`. The bestiary gives
  // us a spell level as a localised string ("1", "cantrip", …); we map
  // that back to a numeric bucket here.
  async function addSpellFromPicker(slug: string) {
    const record = await window.electronAPI?.getSpell(slug)
    if (!record) return
    const lvl = parseSpellLevel(record.level.en)
    const name = language === 'de' && record.nameDe ? record.nameDe : record.name
    const current = sheet.spells ?? {}
    const existing = current[lvl] ?? []
    if (existing.includes(name)) return // no dupes
    onUpdate({ spells: { ...current, [lvl]: [...existing, name] } })
  }

  function removeSpell(level: number, i: number) {
    const current = sheet.spells ?? {}
    const arr = (current[level] ?? []).filter((_, j) => j !== i)
    onUpdate({ spells: { ...current, [level]: arr } })
  }

  const TABS: { id: SheetTab; labelKey: string; icon: string }[] = [
    { id: 'combat',    labelKey: 'characters.tabCombat',    icon: '⚔' },
    { id: 'abilities', labelKey: 'characters.tabAbilities', icon: '✦' },
    { id: 'inventory', labelKey: 'characters.tabInventory', icon: '🎒' },
    { id: 'bio',       labelKey: 'characters.tabBio',       icon: '📖' },
  ]

  const field = <K extends keyof CharacterSheet>(k: K) => ({
    value: sheet[k] as string,
    onChange: (v: string) => onUpdate({ [k]: v } as Partial<CharacterSheet>),
  })

  const numField = <K extends keyof CharacterSheet>(k: K) => ({
    value: sheet[k] as number,
    onChange: (v: number) => onUpdate({ [k]: v } as Partial<CharacterSheet>),
  })

  function toggleSavingThrow(ability: string) {
    const updated = { ...sheet.savingThrows, [ability]: !((sheet.savingThrows as unknown as Record<string, boolean>)[ability]) }
    onUpdate({ savingThrows: updated as CharacterSheet['savingThrows'] })
  }

  function toggleSkill(key: string) {
    const updated = { ...sheet.skills, [key]: !((sheet.skills as unknown as Record<string, boolean>)[key]) }
    onUpdate({ skills: updated as CharacterSheet['skills'] })
  }

  function addAttack() {
    const attack: CharacterAttack = { name: 'Angriff', bonus: '+0', damage: '1d6', damageType: 'Hieb', range: '1,5m', notes: '' }
    onUpdate({ attacks: [...sheet.attacks, attack] })
  }

  function updateAttack(i: number, patch: Partial<CharacterAttack>) {
    const attacks = sheet.attacks.map((a, idx) => idx === i ? { ...a, ...patch } : a)
    onUpdate({ attacks })
  }

  function removeAttack(i: number) {
    onUpdate({ attacks: sheet.attacks.filter((_, idx) => idx !== i) })
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {/* ── Header ── */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <PortraitPicker
            portrait={sheet.portraitPath}
            fallbackInitial={(sheet.name || 'C').charAt(0).toUpperCase()}
            onChange={(p) => onUpdate({ portraitPath: p })}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              {...field('name')}
              dataTestId="input-character-name"
              id="character-name"
              ariaLabel={t('characters.name')}
              placeholder={t('characters.name')}
              style={{ fontSize: 14, fontWeight: 700 }}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
          <TextInput {...field('race')} ariaLabel={t('characters.race')} placeholder={t('characters.race')} />
          <TextInput {...field('className')} ariaLabel={t('characters.class')} placeholder={t('characters.class')} />
          <TextInput {...field('subclass')} ariaLabel={t('characters.subclass')} placeholder={t('characters.subclass')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
          <div>
            <label htmlFor="character-level" style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.level')}</label>
            <NumInput {...numField('level')} id="character-level" style={{ width: '100%' }} />
          </div>
          <div>
            <label htmlFor="character-prof-bonus" style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.profBonus')}</label>
            <NumInput {...numField('proficiencyBonus')} id="character-prof-bonus" style={{ width: '100%' }} />
          </div>
          <div>
            <label htmlFor="character-xp" style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.xp')}</label>
            <NumInput {...numField('experience')} id="character-xp" style={{ width: '100%' }} />
          </div>
          <div>
            <label htmlFor="character-inspiration" style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.inspiration')}</label>
            <NumInput {...numField('inspiration')} id="character-inspiration" style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
          <TextInput {...field('background')} ariaLabel={t('characters.background')} placeholder={t('characters.background')} />
          <TextInput {...field('alignment')} ariaLabel={t('characters.alignment')} placeholder={t('characters.alignment')} />
        </div>
      </div>

      {/* ── Tabs (progressive disclosure) ─────────────────────────────────────
          Long sheets default to information overload; the tab strip groups
          related sections so the DM only sees what they're working on. */}
      <div className="character-sheet-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`character-sheet-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            <span className="character-sheet-tab-icon">{tab.icon}</span>
            <span className="character-sheet-tab-label">{t(tab.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* ── Combat stats + Attacks ── */}
      {activeTab === 'combat' && <>
      <Section title={t('characters.sectionCombat')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, textAlign: 'center' }}>
          {([
            { label: 'AC', key: 'ac' },
            { label: t('characters.speed'), key: 'speed' },
            { label: t('characters.init'), key: 'initiativeBonus' },
            { label: t('characters.hpMax'), key: 'hpMax' },
            { label: t('characters.hpCurr'), key: 'hpCurrent' },
          ] as Array<{ label: string; key: keyof CharacterSheet }>).map(({ label, key }) => (
            <div key={key}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
              <NumInput {...numField(key)} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 6, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{t('characters.hpTemp')}</div>
            <NumInput {...numField('hpTemp')} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{t('characters.hitDice')}</div>
            <TextInput {...field('hitDice')} style={{ textAlign: 'center' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{t('characters.passPerc')}</div>
            <NumInput {...numField('passivePerception')} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{t('characters.deathSuccess')}</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${t('characters.deathSuccess')} ${i + 1}`}
                  onClick={() => onUpdate({ deathSavesSuccess: sheet.deathSavesSuccess === i + 1 ? i : i + 1 })}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)',
                    background: i < sheet.deathSavesSuccess ? '#22c55e' : 'var(--bg-input)',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Attacks (combat tab) ── */}
      <Section title={t('characters.sectionAttacks')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sheet.attacks.map((atk, i) => (
            <div key={i} style={{ background: 'var(--bg)', borderRadius: 4, padding: 6, border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 80px', gap: 4, marginBottom: 4 }}>
                <TextInput value={atk.name} onChange={(v) => updateAttack(i, { name: v })} placeholder={t('characters.atkName')} />
                <TextInput value={atk.bonus} onChange={(v) => updateAttack(i, { bonus: v })} placeholder="+0" style={{ textAlign: 'center' }} />
                <TextInput value={atk.damage} onChange={(v) => updateAttack(i, { damage: v })} placeholder="1d6" style={{ textAlign: 'center' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 4 }}>
                <TextInput value={atk.damageType} onChange={(v) => updateAttack(i, { damageType: v })} placeholder={t('characters.atkDmgType')} />
                <TextInput value={atk.range} onChange={(v) => updateAttack(i, { range: v })} placeholder={t('characters.atkRange')} />
                <button
                  type="button"
                  aria-label={t('characters.removeAttack')}
                  onClick={() => removeAttack(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, width: 32, height: 32 }}
                >✕</button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addAttack}
            style={{
              minHeight: 34,
              padding: '7px 10px', background: 'var(--bg-surface)', border: '1px dashed var(--border)',
              color: 'var(--text-muted)', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >
            + {t('characters.addAttack')}
          </button>
        </div>
      </Section>
      </>}

      {/* ── Abilities, Saving throws, Skills ── */}
      {activeTab === 'abilities' && <>
      <Section title={t('characters.sectionAbilities')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, textAlign: 'center' }}>
          {ABILITY_KEYS.map(({ key, label }) => {
            const score = sheet[key] as number
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{modStr(score)}</span>
                <NumInput value={score} onChange={(v) => onUpdate({ [key]: v } as Partial<CharacterSheet>)} style={{ width: '100%' }} />
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Saving throws ── */}
      <Section title={t('characters.sectionSavingThrows')} defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SAVING_THROW_KEYS.map((ab) => {
            const proficient = (sheet.savingThrows as unknown as Record<string, boolean>)[ab]
            const bonus = savingBonus(sheet, ab)
            return (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <button
                  onClick={() => toggleSavingThrow(ab)}
                  style={{
                    width: 12, height: 12, borderRadius: '50%', border: '1px solid var(--border)',
                    background: proficient ? 'var(--accent-blue)' : 'var(--bg-input)',
                    cursor: 'pointer', padding: 0, flexShrink: 0,
                  }}
                />
                <span style={{ width: 24, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{bonusStr(bonus)}</span>
                <span style={{ color: 'var(--text)', textTransform: 'uppercase', fontSize: 10 }}>{ab.toUpperCase()}</span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Skills ── */}
      <Section title={t('characters.sectionSkills')} defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SKILL_DEFS.map((sk) => {
            const proficient = (sheet.skills as unknown as Record<string, boolean>)[sk.key]
            const bonus = skillBonus(sheet, sk)
            return (
              <div key={sk.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <button
                  onClick={() => toggleSkill(sk.key)}
                  style={{
                    width: 12, height: 12, borderRadius: '50%', border: '1px solid var(--border)',
                    background: proficient ? 'var(--accent-blue)' : 'var(--bg-input)',
                    cursor: 'pointer', padding: 0, flexShrink: 0,
                  }}
                />
                <span style={{ width: 28, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{bonusStr(bonus)}</span>
                <span style={{ flex: 1, color: 'var(--text)' }}>{sk.label}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sk.ability.toUpperCase()}</span>
              </div>
            )
          })}
        </div>
      </Section>

      </>}

      {/* ── Inventory tab: Equipment & proficiencies ── */}
      {activeTab === 'inventory' && <>
      <Section title={t('characters.sectionEquipment')} defaultOpen={true}>
        <TextArea {...field('equipment')} rows={4} placeholder={t('characters.equipmentPlaceholder')} />
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: 6, fontSize: 'var(--text-xs)' }}
          onClick={() => setPickerKind('item')}
        >
          🗡 {t('characters.addItemFromBestiary')}
        </button>
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.languages')}</label>
          <TextArea {...field('languages')} rows={2} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.proficiencies')}</label>
          <TextArea {...field('proficiencies')} rows={2} />
        </div>
      </Section>

      <SpellbookSection
        spells={sheet.spells ?? {}}
        onRemove={removeSpell}
        onOpenPicker={() => setPickerKind('spell')}
      />

      </>}

      {pickerKind && (
        <BestiaryPicker
          kind={pickerKind}
          onPick={(entry) => {
            if (pickerKind === 'item') addItemFromPicker(entry.label)
            else void addSpellFromPicker(entry.slug)
            setPickerKind(null)
          }}
          onClose={() => setPickerKind(null)}
        />
      )}

      {/* ── Bio tab: Features, Personality, Backstory ── */}
      {activeTab === 'bio' && <>
      <Section title={t('characters.sectionFeatures')} defaultOpen={true}>
        <TextArea {...field('features')} rows={5} placeholder={t('characters.featuresPlaceholder')} />
      </Section>

      <Section title={t('characters.sectionPersonality')} defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.personality')}</label>
            <TextArea {...field('personality')} rows={3} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.ideals')}</label>
            <TextArea {...field('ideals')} rows={3} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.bonds')}</label>
            <TextArea {...field('bonds')} rows={3} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.flaws')}</label>
            <TextArea {...field('flaws')} rows={3} />
          </div>
        </div>
      </Section>

      <Section title={t('characters.sectionBackstory')} defaultOpen={false}>
        <TextArea {...field('backstory')} rows={5} />
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.notes')}</label>
          <TextArea {...field('notes')} rows={3} />
        </div>
      </Section>
      </>}
    </div>
  )
}

// ─── CharacterSheetPanel ──────────────────────────────────────────────────────
// Split-pane: character list on the left, editor fills the right.

export function CharacterSheetPanel() {
  const { t } = useTranslation()
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const { sheets, activeSheetId, setSheets, addSheet, updateSheet, removeSheet, setActiveSheetId } = useCharacterStore()

  // Load sheets for current campaign
  useEffect(() => {
    if (!activeCampaignId) { setSheets([]); return }
    window.electronAPI?.characterSheets
      .listByCampaign(activeCampaignId)
      .then(setSheets)
      .catch(console.error)
  }, [activeCampaignId, setSheets])

  const handleNew = useCallback(async () => {
    if (!activeCampaignId) return
    try {
      const sheet = await window.electronAPI?.characterSheets.create(activeCampaignId)
      if (sheet) {
        addSheet(sheet)
        setActiveSheetId(sheet.id)
      }
    } catch (err) { console.error('[CharacterSheetPanel] new sheet failed:', err) }
  }, [activeCampaignId, addSheet, setActiveSheetId])

  const handleUpdate = useCallback(async (id: number, patch: Partial<CharacterSheet>) => {
    updateSheet(id, patch)
    await window.electronAPI?.characterSheets.update(id, patch).catch(console.error)
  }, [updateSheet])

  const handleDelete = useCallback(async (id: number) => {
    const ok = await window.electronAPI?.confirmDialog(t('characters.deleteConfirm'))
    if (!ok) return
    // Grab the portrait path before the row disappears so we can
    // unlink the asset file too. Any legacy data URL is rejected by
    // the main-process safety guard, so we pass it unconditionally.
    const sheet = sheets.find((s) => s.id === id)
    const portraitPath = sheet?.portraitPath ?? null
    removeSheet(id)
    await window.electronAPI?.characterSheets.delete(id).catch(console.error)
    if (portraitPath) {
      await window.electronAPI?.deletePortrait(portraitPath).catch(() => { /* best-effort */ })
    }
    if (activeSheetId === id) setActiveSheetId(null)
  }, [activeSheetId, sheets, removeSheet, setActiveSheetId, t])

  const handleExport = useCallback(async (sheet: CharacterSheet) => {
    if (!window.electronAPI) return
    try {
      const file = await buildCharacterFile(sheet)
      if (!file) return
      const result = await window.electronAPI.exportToFile({
        suggestedName: suggestedCharacterFilename(sheet.name),
        content: JSON.stringify(file, null, 2),
        encoding: 'utf8',
        filters: [{ name: 'BoltBerry-Charakter (JSON)', extensions: ['json'] }],
        dialogTitle: t('characters.exportDialogTitle'),
      })
      if (result.success) {
        showToast(t('characters.exportDone', { name: sheet.name }), 'success', 6000)
      } else if (!result.canceled) {
        showToast(t('characters.exportFailed', { error: result.error ?? '' }), 'error', 7000)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(t('characters.exportFailed', { error: msg }), 'error', 7000)
    }
  }, [t])

  const handleImport = useCallback(async () => {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      const open = await window.electronAPI.importFromFile({
        filters: [{ name: 'BoltBerry-Charakter (JSON)', extensions: ['json'] }],
        dialogTitle: t('characters.importDialogTitle'),
        encoding: 'utf8',
      })
      if (!open.success) {
        if (!open.canceled) {
          showToast(t('characters.importFailed', { error: open.error ?? '' }), 'error', 7000)
        }
        return
      }
      const file = parseCharacterFile(open.content ?? '')
      // Create the row first so we have an id, then patch all the
      // sheet fields in a single update call. Two round-trips, but
      // it reuses the existing CRUD instead of needing a new IPC.
      const created = await window.electronAPI.characterSheets.create(activeCampaignId, file.sheet.name)
      if (!created) throw new Error('Charakter konnte nicht erstellt werden.')

      let portraitPath: string | null = null
      if (file.portraitDataUrl) {
        try {
          const saved = await window.electronAPI.savePortrait(file.portraitDataUrl, null)
          if (saved?.success && saved.path) portraitPath = saved.path
        } catch {
          // best-effort — character imports without portrait still
          // succeed; the user just won't see a profile picture.
        }
      }

      const patch: Partial<CharacterSheet> = {
        ...file.sheet,
        portraitPath,
      }
      await window.electronAPI.characterSheets.update(created.id, patch)
      const merged: CharacterSheet = { ...created, ...patch }
      addSheet(merged)
      setActiveSheetId(merged.id)
      showToast(t('characters.importDone', { name: file.sheet.name }), 'success', 6000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(t('characters.importFailed', { error: msg }), 'error', 7000)
    }
  }, [activeCampaignId, addSheet, setActiveSheetId, t])

  const activeSheet = sheets.find((s) => s.id === activeSheetId)

  if (!activeCampaignId) {
    return <EmptyState icon="👤" title={t('characters.noCampaign')} />
  }

  return (
    <div data-testid="panel-character-sheets" style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-surface)' }}>

      {/* ── Left: character list (fixed width) ── */}
      <div style={{
        width: 220,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
      }}>
        {/* List header */}
        <div style={{
          padding: 'var(--sp-3) var(--sp-3)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-2)',
        }}>
          <span style={{
            flex: 1,
            fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)',
          }}>
            Charaktere
          </span>
          <button
            onClick={handleImport}
            className="btn btn-secondary btn-icon"
            style={{ fontSize: 'var(--text-xs)', width: 34, height: 34, padding: 0 }}
            title={t('characters.import')}
            aria-label={t('characters.import')}
          >
            📥
          </button>
          <button
            onClick={handleNew}
            data-testid="button-create-character-sheet"
            className="btn btn-secondary btn-icon"
            style={{ fontSize: 'var(--text-sm)', width: 34, height: 34, padding: 0 }}
            title={t('characters.newSheet')}
            aria-label={t('characters.newSheet')}
          >
            +
          </button>
        </div>

        {/* Character list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-2)' }}>
          {sheets.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 'var(--sp-3)', padding: 'var(--sp-6) var(--sp-3)',
              color: 'var(--text-secondary)', textAlign: 'center',
            }}>
              <span style={{ fontSize: 32, opacity: 0.85 }}>📋</span>
              <p style={{ fontSize: 'var(--text-xs)', margin: 0, lineHeight: 1.5 }}>
                {t('characters.empty')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sheets.map((s) => (
                <div
                  key={s.id}
                  data-testid="list-item-character-sheet"
                  className={`character-sheet-row${s.id === activeSheetId ? ' active' : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center',
                    minHeight: 50,
                    padding: 'var(--sp-2) var(--sp-3)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    background: s.id === activeSheetId ? 'var(--accent-blue-dim)' : 'transparent',
                    border: `1px solid ${s.id === activeSheetId ? 'var(--accent-blue)' : 'transparent'}`,
                    transition: 'background var(--transition), border-color var(--transition)',
                  }}
                  onClick={() => setActiveSheetId(s.id)}
                  onMouseEnter={(e) => {
                    if (s.id !== activeSheetId) e.currentTarget.style.background = 'var(--bg-overlay)'
                  }}
                  onMouseLeave={(e) => {
                    if (s.id !== activeSheetId) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--text-sm)', fontWeight: 600,
                      color: s.id === activeSheetId ? 'var(--accent-blue-light)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                      Lv.{s.level} {s.className}
                    </div>
                  </div>
                  <button
                    data-testid="button-export-character-sheet"
                    onClick={(e) => { e.stopPropagation(); handleExport(s) }}
                    title={t('characters.export')}
                    aria-label={t('characters.export')}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 13, opacity: 0, padding: 0,
                      width: 32, height: 32,
                      flexShrink: 0,
                    }}
                    className="sheet-row-action"
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-blue-light)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    📤
                  </button>
                  <button
                    data-testid="button-delete-character-sheet"
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }}
                    title={t('characters.delete')}
                    aria-label={t('characters.delete')}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 14, opacity: 0, padding: 0,
                      width: 32, height: 32,
                      flexShrink: 0,
                    }}
                    className="sheet-row-action"
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: sheet editor fills remaining space ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeSheet ? (
          <SheetEditor
            sheet={activeSheet}
            onUpdate={(patch) => handleUpdate(activeSheet.id, patch)}
          />
        ) : (
          <EmptyState
            icon="👤"
            title="Kein Charakter ausgewählt"
            description="Wähle einen Charakter aus der Liste oder erstelle einen neuen."
            className="character-empty-state"
            actions={sheets.length === 0 ? (
              <button className="btn btn-secondary" onClick={handleNew} style={{ minHeight: 36 }}>
                {t('characters.newSheet')}
              </button>
            ) : undefined}
          />
        )}
      </div>
    </div>
  )
}

// ─── Portrait picker ──────────────────────────────────────────────────────────
// Circular thumbnail. Clicking opens a native file picker; the selected
// image is read in-renderer (FileReader → data URL) and fed into the
// shared CircularCropper.
//
// The cropped PNG is persisted via the main-process SAVE_PORTRAIT IPC
// which writes it to `userData/assets/portrait/*.png` and returns a
// **relative** path (e.g. `assets/portrait/xxx.png`). The DB column now
// holds that path, matching the existing map/token convention, so
// campaign export/import can bundle + remap the file and moving the
// user-data folder across machines keeps portraits intact.
//
// Legacy rows holding a `data:` URL keep working — useImageUrl passes
// data URLs through unchanged; only relative paths hit the main-process
// base64 loader.

function PortraitPicker({ portrait, fallbackInitial, onChange }: {
  portrait: string | null
  fallbackInitial: string
  onChange: (path: string | null) => void
}) {
  const { t } = useTranslation()
  const resolvedUrl = useImageUrl(portrait)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset the broken-image fallback whenever the stored path changes
  // so recovering from a failed state (new file chosen) re-shows the
  // image instead of the persistent initial.
  useEffect(() => { setLoadFailed(false) }, [portrait])

  function openPicker() {
    fileInputRef.current?.click()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Always clear the input value so picking the same file twice still
    // fires `change` the second time.
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : null
      if (url) setCropSrc(url)
    }
    reader.readAsDataURL(file)
  }

  async function handleCropComplete(dataUrl: string) {
    setCropSrc(null)
    setBusy(true)
    try {
      // Pass the current `portrait` so the main process can unlink the
      // replaced PNG (only if it's a safe asset path — data URLs are
      // ignored by the guard, so legacy rows are never touched). Falling
      // back to the inline data URL on IPC failure keeps the feature
      // usable on unexpected errors.
      const res = await window.electronAPI?.savePortrait(dataUrl, portrait)
      if (res?.success && res.path) {
        onChange(res.path)
      } else {
        console.error('[PortraitPicker] savePortrait failed:', res?.error)
        onChange(dataUrl)
      }
    } finally {
      setBusy(false)
    }
  }

  const showImage = portrait && resolvedUrl && !loadFailed

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        title={t('characters.portraitEdit')}
        style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '2px solid var(--border)',
          background: 'var(--bg-elevated)',
          padding: 0,
          overflow: 'hidden',
          cursor: busy ? 'progress' : 'pointer',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)',
          fontWeight: 700,
          fontSize: 22,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {showImage
          ? (
            <img
              src={resolvedUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setLoadFailed(true)}
            />
          )
          : fallbackInitial
        }
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {cropSrc && (
        <CircularCropper
          src={cropSrc}
          onComplete={handleCropComplete}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </>
  )
}
