import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCharacterStore, rowToSheet } from '../../../stores/characterStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import type { CharacterSheet, CharacterAttack } from '@shared/ipc-types'
import { EmptyState } from '../../EmptyState'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
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
  const prof = (sheet.skills as Record<string, boolean>)[sk.key] ? sheet.proficiencyBonus : 0
  return abilityMod + prof
}

function savingBonus(sheet: CharacterSheet, ability: string): number {
  const abilityMap: Record<string, number> = {
    str: sheet.str, dex: sheet.dex, con: sheet.con,
    int: sheet.intScore, wis: sheet.wis, cha: sheet.cha,
  }
  const abilityMod = modifier(abilityMap[ability] ?? 10)
  const prof = (sheet.savingThrows as Record<string, boolean>)[ability] ? sheet.proficiencyBonus : 0
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
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--bg-surface)',
          border: 'none', borderBottom: '1px solid var(--border)',
          color: 'var(--text-muted)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '4px 8px', cursor: 'pointer', display: 'flex',
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

function NumInput({ value, onChange, style }: {
  value: number
  onChange: (v: number) => void
  style?: React.CSSProperties
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={{
        width: 44, textAlign: 'center', background: 'var(--bg-input)',
        border: '1px solid var(--border)', borderRadius: 4,
        color: 'var(--text)', fontSize: 12, padding: '2px 4px', ...style,
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
        borderRadius: 4, color: 'var(--text)', fontSize: 11, padding: '4px 6px',
        resize: 'vertical', boxSizing: 'border-box',
      }}
    />
  )
}

// ─── Short text input ─────────────────────────────────────────────────────────

function TextInput({ value, onChange, placeholder, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 4, color: 'var(--text)', fontSize: 11, padding: '3px 6px',
        boxSizing: 'border-box', ...style,
      }}
    />
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)', padding: 24 }}>
      <span style={{ fontSize: 32 }}>📋</span>
      <p style={{ textAlign: 'center', fontSize: 12, margin: 0 }}>{t('characters.empty')}</p>
      <button
        onClick={onNew}
        style={{
          padding: '6px 16px', background: 'var(--accent-blue)', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        }}
      >
        {t('characters.newSheet')}
      </button>
    </div>
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
  const [activeTab, setActiveTab] = useState<SheetTab>(loadInitialTab)

  function selectTab(tab: SheetTab) {
    setActiveTab(tab)
    try { localStorage.setItem(SHEET_TAB_STORAGE_KEY, tab) } catch { /* noop */ }
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
    const updated = { ...sheet.savingThrows, [ability]: !((sheet.savingThrows as Record<string, boolean>)[ability]) }
    onUpdate({ savingThrows: updated as CharacterSheet['savingThrows'] })
  }

  function toggleSkill(key: string) {
    const updated = { ...sheet.skills, [key]: !((sheet.skills as Record<string, boolean>)[key]) }
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
        <TextInput {...field('name')} placeholder={t('characters.name')} style={{ fontSize: 14, fontWeight: 700 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
          <TextInput {...field('race')} placeholder={t('characters.race')} />
          <TextInput {...field('className')} placeholder={t('characters.class')} />
          <TextInput {...field('subclass')} placeholder={t('characters.subclass')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.level')}</label>
            <NumInput {...numField('level')} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.profBonus')}</label>
            <NumInput {...numField('proficiencyBonus')} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.xp')}</label>
            <NumInput {...numField('experience')} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.inspiration')}</label>
            <NumInput {...numField('inspiration')} style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
          <TextInput {...field('background')} placeholder={t('characters.background')} />
          <TextInput {...field('alignment')} placeholder={t('characters.alignment')} />
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
            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  onClick={() => onUpdate({ deathSavesSuccess: sheet.deathSavesSuccess === i + 1 ? i : i + 1 })}
                  style={{
                    width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--border)',
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
                  onClick={() => removeAttack(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
                >✕</button>
              </div>
            </div>
          ))}
          <button
            onClick={addAttack}
            style={{
              padding: '4px 8px', background: 'var(--bg-surface)', border: '1px dashed var(--border)',
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
            const proficient = (sheet.savingThrows as Record<string, boolean>)[ab]
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
            const proficient = (sheet.skills as Record<string, boolean>)[sk.key]
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
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.languages')}</label>
          <TextArea {...field('languages')} rows={2} />
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('characters.proficiencies')}</label>
          <TextArea {...field('proficiencies')} rows={2} />
        </div>
      </Section>

      </>}

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
    window.electronAPI?.dbQuery<Parameters<typeof rowToSheet>[0]>(
      `SELECT * FROM character_sheets WHERE campaign_id = ? ORDER BY name ASC`,
      [activeCampaignId],
    ).then((rows) => setSheets(rows.map(rowToSheet))).catch(console.error)
  }, [activeCampaignId, setSheets])

  const handleNew = useCallback(async () => {
    if (!activeCampaignId) return
    try {
      const result = await window.electronAPI?.dbRun(
        `INSERT INTO character_sheets (campaign_id, name) VALUES (?, 'Neuer Charakter')`,
        [activeCampaignId],
      )
      if (!result) return
      const rows = await window.electronAPI?.dbQuery<Parameters<typeof rowToSheet>[0]>(
        `SELECT * FROM character_sheets WHERE id = ?`,
        [result.lastInsertRowid],
      )
      if (rows && rows.length > 0) {
        addSheet(rowToSheet(rows[0]))
        setActiveSheetId(result.lastInsertRowid)
      }
    } catch (err) { console.error('[CharacterSheetPanel] new sheet failed:', err) }
  }, [activeCampaignId, addSheet, setActiveSheetId])

  const handleUpdate = useCallback(async (id: number, patch: Partial<CharacterSheet>) => {
    updateSheet(id, patch)
    const sets: string[] = []
    const vals: unknown[] = []
    const colMap: Record<string, string> = {
      name: 'name', race: 'race', className: 'class_name', subclass: 'subclass',
      level: 'level', background: 'background', alignment: 'alignment', experience: 'experience',
      str: 'str', dex: 'dex', con: 'con', intScore: 'int_score', wis: 'wis', cha: 'cha',
      hpMax: 'hp_max', hpCurrent: 'hp_current', hpTemp: 'hp_temp',
      ac: 'ac', speed: 'speed', initiativeBonus: 'initiative_bonus',
      proficiencyBonus: 'proficiency_bonus', hitDice: 'hit_dice',
      deathSavesSuccess: 'death_saves_success', deathSavesFailure: 'death_saves_failure',
      savingThrows: 'saving_throws', skills: 'skills',
      languages: 'languages', proficiencies: 'proficiencies',
      features: 'features', equipment: 'equipment',
      attacks: 'attacks', spells: 'spells', spellSlots: 'spell_slots',
      personality: 'personality', ideals: 'ideals', bonds: 'bonds', flaws: 'flaws',
      backstory: 'backstory', notes: 'notes',
      inspiration: 'inspiration', passivePerception: 'passive_perception',
    }
    for (const [k, v] of Object.entries(patch)) {
      const col = colMap[k]
      if (!col) continue
      sets.push(`${col} = ?`)
      vals.push(typeof v === 'object' ? JSON.stringify(v) : v)
    }
    if (sets.length === 0) return
    sets.push("updated_at = datetime('now')")
    vals.push(id)
    await window.electronAPI?.dbRun(
      `UPDATE character_sheets SET ${sets.join(', ')} WHERE id = ?`, vals
    ).catch(console.error)
  }, [updateSheet])

  const handleDelete = useCallback(async (id: number) => {
    const ok = await window.electronAPI?.confirmDialog(t('characters.deleteConfirm'))
    if (!ok) return
    removeSheet(id)
    await window.electronAPI?.dbRun('DELETE FROM character_sheets WHERE id = ?', [id]).catch(console.error)
    if (activeSheetId === id) setActiveSheetId(null)
  }, [activeSheetId, removeSheet, setActiveSheetId, t])

  const activeSheet = sheets.find((s) => s.id === activeSheetId)

  if (!activeCampaignId) {
    return <EmptyState icon="👤" title={t('characters.noCampaign')} />
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

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
            onClick={handleNew}
            className="btn btn-secondary"
            style={{ fontSize: 'var(--text-xs)', padding: '3px 8px' }}
            title={t('characters.newSheet')}
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
              color: 'var(--text-muted)', textAlign: 'center',
            }}>
              <span style={{ fontSize: 28 }}>📋</span>
              <p style={{ fontSize: 'var(--text-xs)', margin: 0, lineHeight: 1.5 }}>
                {t('characters.empty')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sheets.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center',
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
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 12, opacity: 0, padding: '0 2px',
                      flexShrink: 0,
                    }}
                    className="sheet-delete-btn"
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
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
            actions={sheets.length === 0 ? (
              <button className="btn btn-secondary" onClick={handleNew}>
                {t('characters.newSheet')}
              </button>
            ) : undefined}
          />
        )}
      </div>
    </div>
  )
}
