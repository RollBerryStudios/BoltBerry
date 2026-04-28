import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type {
  CharacterSheet,
  CharacterSheetSummary,
  CharacterSavingThrows,
  CharacterSkills,
  CharacterAttack,
  CharacterSpells,
  CharacterSpellSlots,
  CharacterPartyEntry,
} from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `character_sheets` table. The schema
 * has ~40 columns plus several JSON blobs (saving_throws, skills,
 * attacks, spells, spell_slots); the handler owns the canonical row
 * ↔ CharacterSheet mapping so the renderer doesn't have to.
 */

interface CharacterRow {
  id: number
  campaign_id: number
  token_id: number | null
  name: string
  race: string
  class_name: string
  subclass: string
  level: number
  background: string
  alignment: string
  experience: number
  str: number; dex: number; con: number
  int_score: number; wis: number; cha: number
  hp_max: number; hp_current: number; hp_temp: number
  ac: number; speed: number
  initiative_bonus: number; proficiency_bonus: number
  hit_dice: string
  death_saves_success: number; death_saves_failure: number
  saving_throws: string; skills: string
  languages: string; proficiencies: string
  features: string; equipment: string
  attacks: string; spells: string; spell_slots: string
  personality: string; ideals: string; bonds: string; flaws: string
  backstory: string; notes: string
  inspiration: number; passive_perception: number
  portrait_path: string | null
  created_at: string; updated_at: string
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed as T
  } catch {
    return fallback
  }
}

function defaultSavingThrows(): CharacterSavingThrows {
  return { str: false, dex: false, con: false, int: false, wis: false, cha: false }
}

function defaultSkills(): CharacterSkills {
  return {
    acrobatics: false, animalHandling: false, arcana: false,
    athletics: false, deception: false, history: false,
    insight: false, intimidation: false, investigation: false,
    medicine: false, nature: false, perception: false,
    performance: false, persuasion: false, religion: false,
    sleightOfHand: false, stealth: false, survival: false,
  }
}

function toCharacterSheet(r: CharacterRow): CharacterSheet {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    tokenId: r.token_id ?? null,
    name: r.name,
    race: r.race,
    className: r.class_name,
    subclass: r.subclass,
    level: r.level,
    background: r.background,
    alignment: r.alignment,
    experience: r.experience,
    str: r.str, dex: r.dex, con: r.con,
    intScore: r.int_score, wis: r.wis, cha: r.cha,
    hpMax: r.hp_max, hpCurrent: r.hp_current, hpTemp: r.hp_temp,
    ac: r.ac, speed: r.speed,
    initiativeBonus: r.initiative_bonus,
    proficiencyBonus: r.proficiency_bonus,
    hitDice: r.hit_dice,
    deathSavesSuccess: r.death_saves_success,
    deathSavesFailure: r.death_saves_failure,
    savingThrows: parseJson<CharacterSavingThrows>(r.saving_throws, defaultSavingThrows()),
    skills: parseJson<CharacterSkills>(r.skills, defaultSkills()),
    languages: r.languages,
    proficiencies: r.proficiencies,
    features: r.features,
    equipment: r.equipment,
    attacks: parseJson<CharacterAttack[]>(r.attacks, []),
    spells: parseJson<CharacterSpells>(r.spells, {}),
    spellSlots: parseJson<CharacterSpellSlots>(r.spell_slots, {}),
    personality: r.personality,
    ideals: r.ideals,
    bonds: r.bonds,
    flaws: r.flaws,
    backstory: r.backstory,
    notes: r.notes,
    inspiration: r.inspiration,
    passivePerception: r.passive_perception,
    portraitPath: r.portrait_path ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SELECT_COLUMNS = '*'

/**
 * CharacterSheet field → DB column + optional coercion. JSON fields
 * are stringified; booleans stay booleans (the columns are TEXT/INTEGER,
 * and SQLite coerces integer columns from booleans via better-sqlite3's
 * coerceBoolean, which we replicate here for explicitness).
 */
const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  campaignId: { col: 'campaign_id', coerce: coerceInteger },
  tokenId: { col: 'token_id', coerce: (v) => (v == null ? null : coerceInteger(v)) },
  name: { col: 'name', coerce: coerceString },
  race: { col: 'race', coerce: coerceString },
  className: { col: 'class_name', coerce: coerceString },
  subclass: { col: 'subclass', coerce: coerceString },
  level: { col: 'level', coerce: coerceInteger },
  background: { col: 'background', coerce: coerceString },
  alignment: { col: 'alignment', coerce: coerceString },
  experience: { col: 'experience', coerce: coerceInteger },
  str: { col: 'str', coerce: coerceInteger },
  dex: { col: 'dex', coerce: coerceInteger },
  con: { col: 'con', coerce: coerceInteger },
  intScore: { col: 'int_score', coerce: coerceInteger },
  wis: { col: 'wis', coerce: coerceInteger },
  cha: { col: 'cha', coerce: coerceInteger },
  hpMax: { col: 'hp_max', coerce: coerceInteger },
  hpCurrent: { col: 'hp_current', coerce: coerceInteger },
  hpTemp: { col: 'hp_temp', coerce: coerceInteger },
  ac: { col: 'ac', coerce: coerceInteger },
  speed: { col: 'speed', coerce: coerceInteger },
  initiativeBonus: { col: 'initiative_bonus', coerce: coerceInteger },
  proficiencyBonus: { col: 'proficiency_bonus', coerce: coerceInteger },
  hitDice: { col: 'hit_dice', coerce: coerceString },
  deathSavesSuccess: { col: 'death_saves_success', coerce: coerceInteger },
  deathSavesFailure: { col: 'death_saves_failure', coerce: coerceInteger },
  savingThrows: { col: 'saving_throws', coerce: coerceJson },
  skills: { col: 'skills', coerce: coerceJson },
  languages: { col: 'languages', coerce: coerceString },
  proficiencies: { col: 'proficiencies', coerce: coerceString },
  features: { col: 'features', coerce: coerceString },
  equipment: { col: 'equipment', coerce: coerceString },
  attacks: { col: 'attacks', coerce: coerceJson },
  spells: { col: 'spells', coerce: coerceJson },
  spellSlots: { col: 'spell_slots', coerce: coerceJson },
  personality: { col: 'personality', coerce: coerceString },
  ideals: { col: 'ideals', coerce: coerceString },
  bonds: { col: 'bonds', coerce: coerceString },
  flaws: { col: 'flaws', coerce: coerceString },
  backstory: { col: 'backstory', coerce: coerceString },
  notes: { col: 'notes', coerce: coerceString },
  inspiration: { col: 'inspiration', coerce: coerceInteger },
  passivePerception: { col: 'passive_perception', coerce: coerceInteger },
  portraitPath: { col: 'portrait_path', coerce: (v) => (v == null ? null : String(v)) },
}

function coerceInteger(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  throw new Error('Expected integer')
}

function coerceString(v: unknown): string {
  if (v == null) return ''
  return String(v)
}

function coerceJson(v: unknown): string {
  if (v == null) return '{}'
  return JSON.stringify(v)
}

function requireIntegerId(id: unknown, label = 'sheet'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function buildFragments(patch: Record<string, unknown>): { cols: string[]; vals: unknown[] } {
  const cols: string[] = []
  const vals: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    const mapping = COLUMN_MAP[key]
    if (!mapping) continue
    cols.push(mapping.col)
    vals.push(mapping.coerce(value))
  }
  return { cols, vals }
}

export function registerCharacterSheetHandlers(): void {
  ipcMain.handle(
    IPC.CHARACTER_SHEETS_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): CharacterSheet[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM character_sheets
           WHERE campaign_id = ? ORDER BY name ASC`,
        )
        .all(campaignId) as CharacterRow[]
      return rows.map(toCharacterSheet)
    },
  )

  // BB-014: minimal-projection list. The full LIST_BY_CAMPAIGN ships
  // every JSON blob (skills, spells, attacks, backstory, ...) on every
  // open; for a campaign with 20 detailed sheets that's ~1 MB across
  // IPC just to render the picker. The summary keeps the renderer
  // responsive; the full sheet loads on selection via CHARACTER_SHEETS_GET.
  ipcMain.handle(
    IPC.CHARACTER_SHEETS_LIST_SUMMARY_BY_CAMPAIGN,
    (_event, campaignId: number): CharacterSheetSummary[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT id, campaign_id, token_id, name, race, class_name, level,
                  hp_max, hp_current, ac, portrait_path
             FROM character_sheets
            WHERE campaign_id = ?
            ORDER BY name ASC`,
        )
        .all(campaignId) as Array<{
          id: number
          campaign_id: number
          token_id: number | null
          name: string
          race: string
          class_name: string
          level: number
          hp_max: number
          hp_current: number
          ac: number
          portrait_path: string | null
        }>
      return rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        tokenId: r.token_id ?? null,
        name: r.name,
        race: r.race,
        className: r.class_name,
        level: r.level,
        hpMax: r.hp_max,
        hpCurrent: r.hp_current,
        ac: r.ac,
        portraitPath: r.portrait_path ?? null,
      }))
    },
  )

  ipcMain.handle(
    IPC.CHARACTER_SHEETS_GET,
    (_event, id: number): CharacterSheet | null => {
      requireIntegerId(id, 'character-sheet')
      const row = getDb()
        .prepare(`SELECT ${SELECT_COLUMNS} FROM character_sheets WHERE id = ?`)
        .get(id) as CharacterRow | undefined
      return row ? toCharacterSheet(row) : null
    },
  )

  ipcMain.handle(
    IPC.CHARACTER_SHEETS_LIST_PARTY_BY_CAMPAIGNS,
    (_event, campaignIds: number[]): CharacterPartyEntry[] => {
      if (!Array.isArray(campaignIds) || campaignIds.length === 0) return []
      const ids = campaignIds.filter((v): v is number => Number.isInteger(v))
      if (ids.length === 0) return []
      const placeholders = ids.map(() => '?').join(',')
      const rows = getDb()
        .prepare(
          `SELECT campaign_id, name, class_name, level
           FROM character_sheets WHERE campaign_id IN (${placeholders})
           ORDER BY level DESC, id ASC`,
        )
        .all(...ids) as Array<{
          campaign_id: number
          name: string
          class_name: string
          level: number
        }>
      return rows.map((r) => ({
        campaignId: r.campaign_id,
        name: r.name,
        className: r.class_name,
        level: r.level,
      }))
    },
  )

  ipcMain.handle(IPC.CHARACTER_SHEETS_COUNT, (): number => {
    const row = getDb()
      .prepare('SELECT COUNT(*) as n FROM character_sheets')
      .get() as { n: number }
    return row.n
  })

  ipcMain.handle(
    IPC.CHARACTER_SHEETS_CREATE,
    (_event, campaignId: number, name?: string): CharacterSheet => {
      requireIntegerId(campaignId, 'campaign')
      const safeName =
        typeof name === 'string' && name.trim() ? name.trim() : 'Neuer Charakter'
      const row = getDb()
        .prepare(
          `INSERT INTO character_sheets (campaign_id, name) VALUES (?, ?)
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(campaignId, safeName) as CharacterRow
      return toCharacterSheet(row)
    },
  )

  ipcMain.handle(
    IPC.CHARACTER_SHEETS_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const sheetId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch)
      if (cols.length === 0) return
      // updated_at bumps on every write so "Letzte Aktivität" reflects
      // the edit order.
      cols.push('updated_at')
      vals.push(new Date().toISOString())
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(sheetId)
      getDb()
        .prepare(`UPDATE character_sheets SET ${setClause} WHERE id = ?`)
        .run(...vals)
    },
  )

  ipcMain.handle(IPC.CHARACTER_SHEETS_DELETE, (_event, id: number): void => {
    const sheetId = requireIntegerId(id)
    getDb().prepare('DELETE FROM character_sheets WHERE id = ?').run(sheetId)
  })
}
