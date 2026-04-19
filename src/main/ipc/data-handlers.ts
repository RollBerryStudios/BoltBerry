import { ipcMain, app } from 'electron'
import { existsSync, readFileSync, realpathSync, statSync } from 'fs'
import { extname, join, sep } from 'path'
import { IPC } from '../../shared/ipc-types'
import type {
  ItemIndexEntry,
  ItemRecord,
  MonsterIndexEntry,
  MonsterRecord,
  SpellIndexEntry,
  SpellRecord,
} from '../../shared/ipc-types'

/* Bestiarium data handlers.

   All reads are rooted at <resources>/data/ which ships via electron-builder
   extraResources. In development, that folder lives under the repo at
   resources/data/. Slugs are validated against a tight regex so nothing the
   renderer sends can escape the data root via traversal.

   The index files (index.json, items-index.json, spells-index.json) are
   loaded lazily on first request and cached for the process lifetime —
   they're tiny (KB range) and never change at runtime. */

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function getDataRoot(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, 'data')
}

// Lazy cache for the three index files. Invalidated never — the data is
// read-only and bundled with the installer.
let monstersIndex: { monsters: MonsterIndexEntry[] } | null = null
let itemsIndex: { items: ItemIndexEntry[] } | null = null
let spellsIndex: { spells: SpellIndexEntry[] } | null = null

function readIndex<T>(file: string): T | null {
  const full = join(getDataRoot(), file)
  if (!existsSync(full)) return null
  try {
    return JSON.parse(readFileSync(full, 'utf-8')) as T
  } catch (err) {
    console.warn('[DataHandlers] Failed to parse', file, err)
    return null
  }
}

/** Read <root>/<subdir>/<slug>/<file> with a realpath guard so a crafted
 *  slug cannot escape the data root, even via symlinks. */
function readSlugFile(subdir: string, slug: string, file: string): unknown | null {
  if (!SLUG_RE.test(slug)) return null
  const root = getDataRoot()
  const target = join(root, subdir, slug, file)
  if (!existsSync(target)) return null
  try {
    const real = realpathSync(target)
    const realRoot = realpathSync(root)
    if (!real.startsWith(realRoot + sep) && real !== realRoot) return null
    return JSON.parse(readFileSync(real, 'utf-8'))
  } catch (err) {
    console.warn('[DataHandlers] Failed to read', subdir, slug, file, err)
    return null
  }
}

const TOKEN_MAX_BYTES = 4 * 1024 * 1024 // 4 MB per image — well over webp norms

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.webp': return 'image/webp'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.png': return 'image/png'
    default:      return 'application/octet-stream'
  }
}

/** Resolve a per-monster token image to a base64 data URL. Returned inline
 *  because the bundled files live under app resources (not userData) and
 *  the `local-asset` protocol is intentionally userData-only — a data URL
 *  keeps the security surface minimal while working under sandbox:true. */
function resolveTokenUrl(slug: string, file: string): string | null {
  if (!SLUG_RE.test(slug)) return null
  // Token files are human-readable and include spaces + parentheses —
  // `AbolethAberration (1).webp`. Reject traversal segments explicitly.
  if (file.includes('..') || file.includes('/') || file.includes('\\')) return null
  const ext = extname(file)
  if (!/^\.(webp|png|jpe?g)$/i.test(ext)) return null

  const root = getDataRoot()
  const target = join(root, 'monsters', slug, 'tokens', file)
  if (!existsSync(target)) return null
  try {
    const real = realpathSync(target)
    const realRoot = realpathSync(root)
    if (!real.startsWith(realRoot + sep) && real !== realRoot) return null
    const size = statSync(real).size
    if (size > TOKEN_MAX_BYTES) return null
    const buf = readFileSync(real)
    return `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export function registerDataHandlers(): void {
  ipcMain.handle(IPC.DATA_LIST_MONSTERS, (): MonsterIndexEntry[] => {
    if (!monstersIndex) {
      monstersIndex = readIndex<{ monsters: MonsterIndexEntry[] }>('index.json')
    }
    return monstersIndex?.monsters ?? []
  })

  ipcMain.handle(IPC.DATA_GET_MONSTER, (_event, slug: string): (MonsterRecord & {
    tokenDefaultUrl: string | null
  }) | null => {
    const raw = readSlugFile('monsters', slug, 'monster.json') as MonsterRecord | null
    if (!raw) return null
    const primary = raw.token?.file ?? raw.tokens?.[0]?.file ?? null
    return {
      ...raw,
      tokenDefaultUrl: primary ? resolveTokenUrl(slug, primary) : null,
    }
  })

  ipcMain.handle(IPC.DATA_GET_MONSTER_TOKEN, (
    _event,
    slug: string,
    file: string,
  ): string | null => resolveTokenUrl(slug, file))

  ipcMain.handle(IPC.DATA_LIST_ITEMS, (): ItemIndexEntry[] => {
    if (!itemsIndex) {
      itemsIndex = readIndex<{ items: ItemIndexEntry[] }>('items-index.json')
    }
    return itemsIndex?.items ?? []
  })

  ipcMain.handle(IPC.DATA_GET_ITEM, (_event, slug: string): ItemRecord | null => {
    return readSlugFile('items', slug, 'item.json') as ItemRecord | null
  })

  ipcMain.handle(IPC.DATA_LIST_SPELLS, (): SpellIndexEntry[] => {
    if (!spellsIndex) {
      spellsIndex = readIndex<{ spells: SpellIndexEntry[] }>('spells-index.json')
    }
    return spellsIndex?.spells ?? []
  })

  ipcMain.handle(IPC.DATA_GET_SPELL, (_event, slug: string): SpellRecord | null => {
    return readSlugFile('spells', slug, 'spell.json') as SpellRecord | null
  })
}

// Exposed so the DB seeder can pull the monster list at startup without
// duplicating the lookup path — single source of truth for "where does the
// data live?".
export function loadMonstersIndexSync(): MonsterIndexEntry[] {
  try {
    const full = join(getDataRoot(), 'index.json')
    if (!existsSync(full)) return []
    const parsed = JSON.parse(readFileSync(full, 'utf-8')) as { monsters?: MonsterIndexEntry[] }
    return parsed.monsters ?? []
  } catch {
    return []
  }
}

export function loadMonsterRecordSync(slug: string): MonsterRecord | null {
  if (!SLUG_RE.test(slug)) return null
  try {
    const full = join(getDataRoot(), 'monsters', slug, 'monster.json')
    if (!existsSync(full)) return null
    return JSON.parse(readFileSync(full, 'utf-8')) as MonsterRecord
  } catch {
    return null
  }
}

