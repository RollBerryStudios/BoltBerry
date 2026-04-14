import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  CharacterSheet,
  CharacterSavingThrows,
  CharacterSkills,
  CharacterAttack,
  CharacterSpells,
  CharacterSpellSlots,
} from '@shared/ipc-types'

// ─── DB row → domain object ───────────────────────────────────────────────────

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

type DbRow = {
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
  created_at: string; updated_at: string
}

export function rowToSheet(r: DbRow): CharacterSheet {
  const parseJson = <T>(s: string, fallback: T): T => {
    try { return JSON.parse(s) } catch { return fallback }
  }
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CharacterState {
  sheets: CharacterSheet[]
  activeSheetId: number | null

  setSheets: (sheets: CharacterSheet[]) => void
  addSheet: (sheet: CharacterSheet) => void
  updateSheet: (id: number, patch: Partial<CharacterSheet>) => void
  removeSheet: (id: number) => void
  setActiveSheetId: (id: number | null) => void
}

export const useCharacterStore = create<CharacterState>()(
  immer((set) => ({
    sheets: [],
    activeSheetId: null,

    setSheets: (sheets) =>
      set((s) => { s.sheets = sheets }),

    addSheet: (sheet) =>
      set((s) => { s.sheets.push(sheet) }),

    updateSheet: (id, patch) =>
      set((s) => {
        const sheet = s.sheets.find((c) => c.id === id)
        if (sheet) Object.assign(sheet, patch)
      }),

    removeSheet: (id) =>
      set((s) => {
        s.sheets = s.sheets.filter((c) => c.id !== id)
        if (s.activeSheetId === id) s.activeSheetId = null
      }),

    setActiveSheetId: (id) =>
      set((s) => { s.activeSheetId = id }),
  }))
)
