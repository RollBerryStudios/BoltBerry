import { ipcMain, app } from 'electron'
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'fs'
import { extname, join, sep } from 'path'
import { IPC } from '../../shared/ipc-types'
import { getDb } from '../db/database'
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
// Git LFS pointer files start with this magic line and are typically 130–
// 200 bytes of ASCII (oid + size). If the user clones the repo without
// `git lfs install` (or fetches without LFS bandwidth), the working
// copy contains pointers instead of webp bytes — base64-encoding those
// would produce a "valid" data URL whose image data is garbage and the
// browser would render the alt text. Detect + reject early.
const LFS_POINTER_HEADER = 'version https://git-lfs.github.com/spec/v1'

function looksLikeLfsPointer(buf: Buffer): boolean {
  if (buf.length > 1024) return false
  // Pointer files are ASCII; any non-printable byte means it's a real image.
  for (let i = 0; i < Math.min(buf.length, 64); i++) {
    const b = buf[i]
    if (b !== 0x0a && b !== 0x0d && (b < 0x20 || b > 0x7e)) return false
  }
  return buf.toString('utf-8', 0, LFS_POINTER_HEADER.length) === LFS_POINTER_HEADER
}

let lfsWarningLogged = false

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
    if (looksLikeLfsPointer(buf)) {
      if (!lfsWarningLogged) {
        lfsWarningLogged = true
        console.warn(
          '[DataHandlers] Token files appear to be Git LFS pointers. Run\n' +
          '  git lfs install && git lfs pull\n' +
          'in the project root to fetch the actual webp images.',
        )
      }
      return null
    }
    return `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// Look up the user's preferred token filename for this slug. Missing
// table (fresh DB pre-v34 migration) or query failure both resolve to
// null so getMonster can fall back to the dataset's default token.
function readUserDefaultToken(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return null
  try {
    const row = getDb().prepare(
      'SELECT token_file FROM monster_defaults WHERE slug = ?',
    ).get(slug) as { token_file: string } | undefined
    return row?.token_file ?? null
  } catch {
    return null
  }
}

// Cheap probe so the get-monster handler can flag the LFS state without
// re-encoding the entire file again. Reads only the first kilobyte.
function fileIsLfsPointer(slug: string, file: string): boolean {
  if (!SLUG_RE.test(slug)) return false
  if (file.includes('..') || file.includes('/') || file.includes('\\')) return false
  const target = join(getDataRoot(), 'monsters', slug, 'tokens', file)
  if (!existsSync(target)) return false
  try {
    const fd = openSync(target, 'r')
    const buf = Buffer.alloc(256)
    const read = readSync(fd, buf, 0, 256, 0)
    closeSync(fd)
    return looksLikeLfsPointer(buf.subarray(0, read))
  } catch {
    return false
  }
}

// Whitelist the user's chosen token against the creature's actual token
// list before we persist it — otherwise a crafted request could point a
// slug at any file on disk (we do the realpath guard too, but checking
// the manifest first gives us a clean "not a real variant" error path).
function tokenFileBelongsToMonster(slug: string, file: string): boolean {
  const raw = readSlugFile('monsters', slug, 'monster.json') as MonsterRecord | null
  if (!raw) return false
  if (raw.token?.file === file) return true
  return (raw.tokens ?? []).some((t) => t.file === file)
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
    userDefaultFile: string | null
    /** True when the monster *has* token entries but every one is an LFS
     *  pointer (i.e. the user cloned without `git lfs pull`). Lets the
     *  renderer show a single, actionable hint instead of a broken
     *  image. */
    tokensMissing: boolean
  }) | null => {
    const raw = readSlugFile('monsters', slug, 'monster.json') as MonsterRecord | null
    if (!raw) return null
    const override = readUserDefaultToken(slug)
    const primary = override ?? raw.token?.file ?? raw.tokens?.[0]?.file ?? null
    const tokenDefaultUrl = primary ? resolveTokenUrl(slug, primary) : null
    const hasTokenEntries = !!raw.token || !!(raw.tokens && raw.tokens.length > 0)
    const tokensMissing = hasTokenEntries && tokenDefaultUrl === null && primary !== null
      && fileIsLfsPointer(slug, primary)
    return {
      ...raw,
      tokenDefaultUrl,
      userDefaultFile: override,
      tokensMissing,
    }
  })

  ipcMain.handle(IPC.DATA_GET_MONSTER_TOKEN, (
    _event,
    slug: string,
    file: string,
  ): string | null => resolveTokenUrl(slug, file))

  ipcMain.handle(IPC.DATA_SET_MONSTER_DEFAULT, (
    _event,
    slug: string,
    file: string | null,
  ): { success: boolean; error?: string } => {
    if (!SLUG_RE.test(slug)) return { success: false, error: 'invalid-slug' }
    try {
      const db = getDb()
      if (file === null) {
        db.prepare('DELETE FROM monster_defaults WHERE slug = ?').run(slug)
        return { success: true }
      }
      if (!tokenFileBelongsToMonster(slug, file)) {
        return { success: false, error: 'unknown-variant' }
      }
      db.prepare(
        'INSERT OR REPLACE INTO monster_defaults (slug, token_file) VALUES (?, ?)',
      ).run(slug, file)
      // Keep token_templates.image_path in sync so the Token Library panel
      // (which reads image_path) picks up the same preferred variant on
      // its next query. Use the compact bestiary:// scheme — the image
      // loaders resolve it through this same handler. Best-effort: never
      // fail the set-default call on a sync glitch.
      try {
        db.prepare(
          `UPDATE token_templates
           SET image_path = ?
           WHERE slug = ? AND source = 'srd'`,
        ).run(`bestiary://${slug}/${file}`, slug)
      } catch { /* ignore */ }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

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

