import { ipcMain } from 'electron'
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'fs'
import { extname, join, sep } from 'path'
import { IPC } from '../../shared/ipc-types'
import { getDb } from '../db/database'
import { SLUG_RE, getDataRoot } from '../data/monsters'
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
   renderer sends can escape the data root via traversal. The root resolver
   and slug regex live in data/monsters.ts so the DB seeder can share them
   without pulling in the whole IPC module.

   The index files (index.json, items-index.json, spells-index.json) are
   loaded lazily on first request and cached for the process lifetime —
   they're tiny (KB range) and never change at runtime. */

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

// ── User Wiki entries merge layer ─────────────────────────────────────────
// The SRD dataset is read-only and comes off disk. User-authored entries
// live in the SQLite `user_wiki_entries` table; we read them on every
// list / get call (they're tiny — name + JSON blob — and the table has
// an index on `kind`). When a user entry and an SRD entry share a slug,
// the user entry shadows the SRD row so edits feel "in-place" from the
// renderer's perspective.

type WikiKind = 'monster' | 'item' | 'spell'

function listUserEntries(kind: WikiKind): Array<{ slug: string; data: unknown }> {
  try {
    const rows = getDb().prepare(
      'SELECT slug, data FROM user_wiki_entries WHERE kind = ? ORDER BY slug',
    ).all(kind) as Array<{ slug: string; data: string }>
    return rows.map((r) => {
      try {
        return { slug: r.slug, data: JSON.parse(r.data) }
      } catch {
        // Corrupt row — skip rather than crash the whole list. The DM
        // can recreate from a clone.
        return null
      }
    }).filter((r): r is { slug: string; data: unknown } => r !== null)
  } catch {
    return []
  }
}

function getUserEntry(kind: WikiKind, slug: string): unknown | null {
  if (!SLUG_RE.test(slug)) return null
  try {
    const row = getDb().prepare(
      'SELECT data FROM user_wiki_entries WHERE kind = ? AND slug = ?',
    ).get(kind, slug) as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data)
    } catch {
      return null
    }
  } catch {
    return null
  }
}

/** Merge a user entry list with the bundled index. User slugs shadow
 *  SRD slugs (the user's copy wins) and every returned row carries a
 *  `userOwned` flag. */
function mergeIndex<T extends { slug: string }>(
  bundled: T[],
  userEntries: Array<{ slug: string; data: unknown }>,
  toIndexEntry: (data: unknown) => T | null,
): (T & { userOwned?: boolean })[] {
  const userBySlug = new Map<string, T>()
  for (const ue of userEntries) {
    const entry = toIndexEntry(ue.data)
    if (entry) userBySlug.set(ue.slug, entry)
  }
  const srdFiltered = bundled.filter((row) => !userBySlug.has(row.slug))
  const userRows = Array.from(userBySlug.values()).map((row) => ({ ...row, userOwned: true as const }))
  return [...userRows, ...srdFiltered]
}

export function registerDataHandlers(): void {
  ipcMain.handle(IPC.DATA_LIST_MONSTERS, (): MonsterIndexEntry[] => {
    if (!monstersIndex) {
      monstersIndex = readIndex<{ monsters: MonsterIndexEntry[] }>('index.json')
    }
    const bundled = monstersIndex?.monsters ?? []
    return mergeIndex(bundled, listUserEntries('monster'), (d) => {
      // User entries store the full MonsterRecord. Project down to the
      // index shape the renderer expects.
      const rec = d as Partial<MonsterRecord> & { slug: string; name: string }
      if (!rec?.slug || !rec?.name) return null
      return {
        id: rec.id ?? 0,
        slug: rec.slug,
        name: rec.name,
        nameDe: rec.nameDe,
        type: rec.meta ?? { en: '', de: '' },
        challenge: rec.challenge ?? '0',
        size: '',
        tokenDefault: null,
        tokenCount: 0,
      }
    })
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
    const userOverride = getUserEntry('monster', slug) as MonsterRecord | null
    const raw = userOverride ?? (readSlugFile('monsters', slug, 'monster.json') as MonsterRecord | null)
    if (!raw) return null
    if (userOverride) raw.userOwned = true
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
    const bundled = itemsIndex?.items ?? []
    return mergeIndex(bundled, listUserEntries('item'), (d) => {
      const rec = d as Partial<ItemRecord> & { slug: string; name: string }
      if (!rec?.slug || !rec?.name) return null
      return {
        id: rec.id ?? 0,
        slug: rec.slug,
        name: rec.name,
        nameDe: rec.nameDe,
        category: rec.category ?? { en: '', de: '' },
        rarity: rec.rarity ?? { en: '', de: '' },
        cost: rec.cost,
      }
    })
  })

  ipcMain.handle(IPC.DATA_GET_ITEM, (_event, slug: string): ItemRecord | null => {
    const userOverride = getUserEntry('item', slug) as ItemRecord | null
    const raw = userOverride ?? (readSlugFile('items', slug, 'item.json') as ItemRecord | null)
    if (!raw) return null
    if (userOverride) raw.userOwned = true
    return raw
  })

  ipcMain.handle(IPC.DATA_LIST_SPELLS, (): SpellIndexEntry[] => {
    if (!spellsIndex) {
      spellsIndex = readIndex<{ spells: SpellIndexEntry[] }>('spells-index.json')
    }
    const bundled = spellsIndex?.spells ?? []
    return mergeIndex(bundled, listUserEntries('spell'), (d) => {
      const rec = d as Partial<SpellRecord> & { slug: string; name: string }
      if (!rec?.slug || !rec?.name) return null
      return {
        id: rec.id ?? 0,
        slug: rec.slug,
        name: rec.name,
        nameDe: rec.nameDe,
        level: rec.level ?? { en: '', de: '' },
        school: rec.school ?? { en: '', de: '' },
        classes: rec.classes,
      }
    })
  })

  ipcMain.handle(IPC.DATA_GET_SPELL, (_event, slug: string): SpellRecord | null => {
    const userOverride = getUserEntry('spell', slug) as SpellRecord | null
    const raw = userOverride ?? (readSlugFile('spells', slug, 'spell.json') as SpellRecord | null)
    if (!raw) return null
    if (userOverride) raw.userOwned = true
    return raw
  })

  // ── User-authored Wiki entry CRUD ─────────────────────────────────────────
  // 5 MB is several orders of magnitude above any realistic SRD-shape
  // statblock (~5–50 KB). This cap exists so a hand-crafted import file
  // can't bloat user_wiki_entries to gigabytes — every list/get scans
  // the table, so a single oversized row taxes every read forever.
  const MAX_WIKI_ENTRY_BYTES = 5 * 1024 * 1024
  ipcMain.handle(IPC.WIKI_UPSERT_USER_ENTRY, (
    _event,
    kind: WikiKind,
    slug: string,
    data: unknown,
  ): { success: boolean; error?: string } => {
    if (kind !== 'monster' && kind !== 'item' && kind !== 'spell') {
      return { success: false, error: 'invalid-kind' }
    }
    if (!SLUG_RE.test(slug)) return { success: false, error: 'invalid-slug' }
    // Minimum-viable shape sanity. The renderer (parseWikiFile +
    // BestiaryView form) is the canonical validator; this is a
    // defense-in-depth check at the IPC boundary so a hand-crafted
    // import or buggy caller can't poison user_wiki_entries.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { success: false, error: 'invalid-data' }
    }
    const rec = data as Record<string, unknown>
    if (typeof rec.name !== 'string' || !rec.name.trim()) {
      return { success: false, error: 'missing-name' }
    }
    // The slug embedded in the record must match the slug parameter.
    // If a caller passes mismatched values we reject rather than silently
    // honoring one or the other — both interpretations would surprise
    // the user later (lookups by slug would not find what they saved).
    if (typeof rec.slug === 'string' && rec.slug !== slug) {
      return { success: false, error: 'slug-mismatch' }
    }
    try {
      const json = JSON.stringify(data)
      if (json.length > MAX_WIKI_ENTRY_BYTES) {
        return { success: false, error: `entry-too-large (${json.length} bytes)` }
      }
      getDb().prepare(
        `INSERT INTO user_wiki_entries (kind, slug, data, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(kind, slug) DO UPDATE SET
           data       = excluded.data,
           updated_at = datetime('now')`,
      ).run(kind, slug, json)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.WIKI_DELETE_USER_ENTRY, (
    _event,
    kind: WikiKind,
    slug: string,
  ): { success: boolean; error?: string } => {
    if (kind !== 'monster' && kind !== 'item' && kind !== 'spell') {
      return { success: false, error: 'invalid-kind' }
    }
    if (!SLUG_RE.test(slug)) return { success: false, error: 'invalid-slug' }
    try {
      getDb().prepare(
        'DELETE FROM user_wiki_entries WHERE kind = ? AND slug = ?',
      ).run(kind, slug)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}


