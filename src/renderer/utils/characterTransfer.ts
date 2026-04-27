import type { CharacterSheet } from '@shared/ipc-types'

/** File-format header — bumped when the on-disk schema changes
 *  incompatibly. The importer rejects unknown / future versions. */
const CHARACTER_FILE_VERSION = 1
export const CHARACTER_FILE_KIND = 'boltberry-character'

export interface CharacterFile {
  kind: typeof CHARACTER_FILE_KIND
  version: number
  exportedAt: string
  /** Sheet payload — `id`/`campaignId`/`tokenId`/`portraitPath` are
   *  intentionally stripped; they're re-assigned on import to match
   *  the destination DB. The portrait is embedded as a data URL. */
  sheet: Omit<CharacterSheet, 'id' | 'campaignId' | 'tokenId' | 'portraitPath' | 'createdAt' | 'updatedAt'>
  /** PNG portrait as `data:image/...` (omitted when the source had no
   *  portrait). Bound by GET_IMAGE_AS_BASE64's 20 MB cap. */
  portraitDataUrl?: string
}

/** Build the JSON-serialisable payload from a live sheet, embedding
 *  the portrait via the GET_IMAGE_AS_BASE64 IPC. Returns null when
 *  the renderer is not running inside Electron. */
export async function buildCharacterFile(sheet: CharacterSheet): Promise<CharacterFile | null> {
  if (!window.electronAPI) return null

  let portraitDataUrl: string | undefined
  if (sheet.portraitPath) {
    try {
      const dataUrl = await window.electronAPI.getImageAsBase64(sheet.portraitPath)
      if (dataUrl) portraitDataUrl = dataUrl
    } catch {
      // Best-effort: a missing or unreadable portrait shouldn't block
      // the export. The sheet rides without it.
    }
  }

  const stripped: CharacterFile['sheet'] = {
    name: sheet.name,
    race: sheet.race,
    className: sheet.className,
    subclass: sheet.subclass,
    level: sheet.level,
    background: sheet.background,
    alignment: sheet.alignment,
    experience: sheet.experience,
    str: sheet.str, dex: sheet.dex, con: sheet.con,
    intScore: sheet.intScore, wis: sheet.wis, cha: sheet.cha,
    hpMax: sheet.hpMax, hpCurrent: sheet.hpCurrent, hpTemp: sheet.hpTemp,
    ac: sheet.ac, speed: sheet.speed,
    initiativeBonus: sheet.initiativeBonus,
    proficiencyBonus: sheet.proficiencyBonus,
    hitDice: sheet.hitDice,
    deathSavesSuccess: sheet.deathSavesSuccess,
    deathSavesFailure: sheet.deathSavesFailure,
    savingThrows: sheet.savingThrows,
    skills: sheet.skills,
    languages: sheet.languages,
    proficiencies: sheet.proficiencies,
    features: sheet.features,
    equipment: sheet.equipment,
    attacks: sheet.attacks,
    spells: sheet.spells,
    spellSlots: sheet.spellSlots,
    personality: sheet.personality,
    ideals: sheet.ideals,
    bonds: sheet.bonds,
    flaws: sheet.flaws,
    backstory: sheet.backstory,
    notes: sheet.notes,
    inspiration: sheet.inspiration,
    passivePerception: sheet.passivePerception,
  }

  return {
    kind: CHARACTER_FILE_KIND,
    version: CHARACTER_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    sheet: stripped,
    portraitDataUrl,
  }
}

/** Slug-ish filename from a sheet name. Falls back to "character"
 *  so we never produce an empty filename. */
export function suggestedCharacterFilename(name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[^\wäöüß-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  const stem = safe || 'character'
  return `BoltBerry_Character_${stem}_${new Date().toISOString().slice(0, 10)}.json`
}

/** Hard cap on embedded portrait size (bytes of decoded image). The
 *  exporter side is bounded by GET_IMAGE_AS_BASE64 (20 MB), so a
 *  legitimate file never exceeds it; we re-check at import to refuse
 *  hand-crafted JSONs that try to slip a giant blob past savePortrait
 *  (which has no size guard of its own). 20 MB matches the export cap
 *  exactly so a clean roundtrip never trips this. */
const MAX_PORTRAIT_DATA_URL_BYTES = 20 * 1024 * 1024

/** Parse + validate the on-disk format. Throws with a human message
 *  on bad input so the caller can surface a useful toast. */
export function parseCharacterFile(json: string): CharacterFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error('Datei ist kein gültiges JSON.')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Datei-Inhalt ist kein Objekt.')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.kind !== CHARACTER_FILE_KIND) {
    throw new Error('Datei ist kein BoltBerry-Charakter-Export.')
  }
  if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > CHARACTER_FILE_VERSION) {
    throw new Error(`Unbekannte Datei-Version (${obj.version}). BoltBerry aktualisieren?`)
  }
  if (!obj.sheet || typeof obj.sheet !== 'object') {
    throw new Error('Datei enthält keinen Charakterbogen.')
  }
  if (obj.portraitDataUrl !== undefined) {
    if (typeof obj.portraitDataUrl !== 'string') {
      throw new Error('Portrait-Daten sind beschädigt.')
    }
    if (!obj.portraitDataUrl.startsWith('data:image/')) {
      throw new Error('Portrait-Daten haben ein unbekanntes Format.')
    }
    if (obj.portraitDataUrl.length > MAX_PORTRAIT_DATA_URL_BYTES) {
      const mb = (obj.portraitDataUrl.length / (1024 * 1024)).toFixed(1)
      throw new Error(`Portrait ist zu groß (${mb} MB). Maximum: 20 MB.`)
    }
  }
  return obj as unknown as CharacterFile
}
