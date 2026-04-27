import type { MonsterRecord, ItemRecord, SpellRecord } from '@shared/ipc-types'

export type WikiKind = 'monster' | 'item' | 'spell'
export type WikiRecord = MonsterRecord | ItemRecord | SpellRecord

const WIKI_FILE_VERSION = 1
export const WIKI_FILE_KIND = 'boltberry-wiki-entry'

export interface WikiFile {
  kind: typeof WIKI_FILE_KIND
  version: number
  exportedAt: string
  /** Discriminator so the importer can route back to the right user
   *  entries table partition (monster / item / spell). */
  entryKind: WikiKind
  /** Full record as stored under `user_wiki_entries.data`. The slug
   *  inside is the *exported* slug — the importer will collision-check
   *  it against the destination DB. */
  record: WikiRecord
}

const KIND_LABEL: Record<WikiKind, string> = {
  monster: 'Monster',
  item: 'Gegenstand',
  spell: 'Zauber',
}

export function buildWikiFile(kind: WikiKind, record: WikiRecord): WikiFile {
  return {
    kind: WIKI_FILE_KIND,
    version: WIKI_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    entryKind: kind,
    record,
  }
}

export function suggestedWikiFilename(kind: WikiKind, name: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[^\wäöüß-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  const stem = safe || KIND_LABEL[kind]
  return `BoltBerry_${kind}_${stem}_${new Date().toISOString().slice(0, 10)}.json`
}

export function parseWikiFile(json: string): WikiFile {
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
  if (obj.kind !== WIKI_FILE_KIND) {
    throw new Error('Datei ist kein BoltBerry-Wiki-Export.')
  }
  if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > WIKI_FILE_VERSION) {
    throw new Error(`Unbekannte Datei-Version (${obj.version}). BoltBerry aktualisieren?`)
  }
  if (obj.entryKind !== 'monster' && obj.entryKind !== 'item' && obj.entryKind !== 'spell') {
    throw new Error('Unbekannte Eintrags-Art.')
  }
  if (!obj.record || typeof obj.record !== 'object') {
    throw new Error('Datei enthält keinen Eintrag.')
  }
  return obj as unknown as WikiFile
}

/** Append a `-import-<rand>` suffix when the slug is already taken. */
export function ensureUniqueSlug(baseSlug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(baseSlug)) return baseSlug
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = randomSuffix()
    const next = `${baseSlug}-import-${suffix}`
    if (!taken.has(next)) return next
  }
  // After 8 attempts give up uniqueness and tag with timestamp;
  // collisions at this point would mean someone is racing the importer.
  return `${baseSlug}-import-${Date.now()}`
}

function randomSuffix(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 6)
  } catch {
    return Math.random().toString(36).slice(2, 8)
  }
}

/** Open the file picker, parse + upsert a wiki entry. Resolves with
 *  the imported slug on success so the caller can navigate to it,
 *  null on user cancel, throws on validation failure. The caller
 *  should pass `existingSlugs` so collisions get a `-import-<rand>`
 *  suffix instead of overwriting. */
export async function importWikiEntryViaDialog(
  expectedKind: WikiKind,
  existingSlugs: ReadonlySet<string>,
): Promise<{ slug: string; record: WikiRecord } | null> {
  if (!window.electronAPI) throw new Error('Renderer ist nicht in Electron geladen.')

  const open = await window.electronAPI.importFromFile({
    filters: [{ name: 'BoltBerry-Wiki (JSON)', extensions: ['json'] }],
    encoding: 'utf8',
  })
  if (!open.success) {
    if (open.canceled) return null
    throw new Error(open.error ?? 'Datei konnte nicht gelesen werden.')
  }

  const file = parseWikiFile(open.content ?? '')
  if (file.entryKind !== expectedKind) {
    throw new Error(
      `Datei enthält einen ${file.entryKind}-Eintrag, erwartet wurde ${expectedKind}.`,
    )
  }

  const slug = ensureUniqueSlug(file.record.slug, existingSlugs)
  const record = { ...file.record, slug, userOwned: true } as WikiRecord
  const res = await window.electronAPI.upsertWikiEntry(expectedKind, slug, record)
  if (!res?.success) {
    throw new Error(res?.error ?? 'Eintrag konnte nicht gespeichert werden.')
  }
  return { slug, record }
}
