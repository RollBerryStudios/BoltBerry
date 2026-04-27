import type { EncounterRecord } from '@shared/ipc-types'

const ENCOUNTER_FILE_VERSION = 1
export const ENCOUNTER_FILE_KIND = 'boltberry-encounter'

export interface EncounterFile {
  kind: typeof ENCOUNTER_FILE_KIND
  version: number
  exportedAt: string
  /** `id` and `campaignId` are stripped — re-assigned on import. */
  encounter: Omit<EncounterRecord, 'id' | 'campaignId' | 'createdAt'>
}

export function buildEncounterFile(encounter: EncounterRecord): EncounterFile {
  return {
    kind: ENCOUNTER_FILE_KIND,
    version: ENCOUNTER_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    encounter: {
      name: encounter.name,
      templateData: encounter.templateData,
      notes: encounter.notes,
    },
  }
}

export function suggestedEncounterFilename(name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[^\wäöüß-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  const stem = safe || 'encounter'
  return `BoltBerry_Encounter_${stem}_${new Date().toISOString().slice(0, 10)}.json`
}

export function parseEncounterFile(json: string): EncounterFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Datei ist kein gültiges JSON.')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Datei-Inhalt ist kein Objekt.')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.kind !== ENCOUNTER_FILE_KIND) {
    throw new Error('Datei ist kein BoltBerry-Encounter-Export.')
  }
  if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > ENCOUNTER_FILE_VERSION) {
    throw new Error(`Unbekannte Datei-Version (${obj.version}). BoltBerry aktualisieren?`)
  }
  if (!obj.encounter || typeof obj.encounter !== 'object') {
    throw new Error('Datei enthält kein Encounter.')
  }
  const enc = obj.encounter as Record<string, unknown>
  if (typeof enc.name !== 'string' || !enc.name.trim()) {
    throw new Error('Encounter-Name fehlt.')
  }
  if (typeof enc.templateData !== 'string') {
    throw new Error('Encounter-Daten fehlen.')
  }
  // Round-trip the templateData JSON so we surface bad payloads at
  // import time instead of letting them break a future Spawn click.
  try {
    JSON.parse(enc.templateData)
  } catch {
    throw new Error('Encounter-Daten sind beschädigt (kein gültiges JSON).')
  }
  return obj as unknown as EncounterFile
}
