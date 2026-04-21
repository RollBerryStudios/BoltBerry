import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { TokenTemplateRow } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `token_templates` table — the DM's
 * custom library of creature/token templates plus the seeded SRD set.
 *
 * The schema has UNIQUE(source, name); the renderer's uniquifier
 * relies on `listUserNames()` to pre-compute a free name before
 * insert so we don't have to bubble a SQLite constraint error back
 * through IPC.
 */

interface TokenTemplateDbRow {
  id: number
  category: string
  source: string
  name: string
  image_path: string | null
  size: number
  hp_max: number
  ac: number | null
  speed: number | null
  cr: string | null
  creature_type: string | null
  faction: string
  marker_color: string | null
  notes: string | null
  stat_block: string | null
  slug: string | null
  created_at: string
}

function toTokenTemplateRow(r: TokenTemplateDbRow): TokenTemplateRow {
  let parsed: unknown | null = null
  if (r.stat_block) {
    try {
      parsed = JSON.parse(r.stat_block)
    } catch {
      parsed = null
    }
  }
  return { ...r, stat_block: parsed }
}

const SELECT_COLUMNS = [
  'id',
  'category',
  'source',
  'name',
  'image_path',
  'size',
  'hp_max',
  'ac',
  'speed',
  'cr',
  'creature_type',
  'faction',
  'marker_color',
  'notes',
  'stat_block',
  'slug',
  'created_at',
].join(', ')

const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  category: { col: 'category', coerce: (v) => String(v ?? 'monster') },
  source: { col: 'source', coerce: (v) => String(v ?? 'user') },
  name: { col: 'name', coerce: requireNonEmptyString },
  image_path: { col: 'image_path', coerce: (v) => (v == null ? null : String(v)) },
  size: { col: 'size', coerce: coerceInteger },
  hp_max: { col: 'hp_max', coerce: coerceInteger },
  ac: { col: 'ac', coerce: (v) => (v == null ? null : coerceInteger(v)) },
  speed: { col: 'speed', coerce: (v) => (v == null ? null : coerceInteger(v)) },
  cr: { col: 'cr', coerce: (v) => (v == null ? null : String(v)) },
  creature_type: { col: 'creature_type', coerce: (v) => (v == null ? null : String(v)) },
  faction: { col: 'faction', coerce: (v) => String(v ?? 'enemy') },
  marker_color: { col: 'marker_color', coerce: (v) => (v == null ? null : String(v)) },
  notes: { col: 'notes', coerce: (v) => (v == null ? null : String(v)) },
  stat_block: {
    col: 'stat_block',
    coerce: (v) => (v == null ? null : JSON.stringify(v)),
  },
  slug: { col: 'slug', coerce: (v) => (v == null ? null : String(v)) },
}

function coerceInteger(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  throw new Error('Expected integer')
}

function requireNonEmptyString(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error('name is required')
  return v.trim()
}

function requireIntegerId(id: unknown, label = 'template'): number {
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

// CR-weighted sort order. Matches the previous inline SQL: user rows
// first, then templates sorted by parsed-numeric CR (fractional
// 1/8, 1/4, 1/2 expanded), then by name.
const LIST_SQL = `SELECT ${SELECT_COLUMNS} FROM token_templates
  ORDER BY
    CASE source WHEN 'user' THEN 0 ELSE 1 END,
    CASE
      WHEN cr LIKE '1/8' THEN 0.125
      WHEN cr LIKE '1/4' THEN 0.25
      WHEN cr LIKE '1/2' THEN 0.5
      WHEN cr GLOB '[0-9]*' THEN CAST(cr AS REAL)
      ELSE 999
    END,
    name`

export function registerTokenTemplateHandlers(): void {
  ipcMain.handle(IPC.TOKEN_TEMPLATES_LIST, (): TokenTemplateRow[] => {
    const rows = getDb().prepare(LIST_SQL).all() as TokenTemplateDbRow[]
    return rows.map(toTokenTemplateRow)
  })

  ipcMain.handle(IPC.TOKEN_TEMPLATES_LIST_USER_NAMES, (): string[] => {
    const rows = getDb()
      .prepare("SELECT name FROM token_templates WHERE source = 'user'")
      .all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  })

  ipcMain.handle(
    IPC.TOKEN_TEMPLATES_CREATE,
    (_event, patch: Record<string, unknown>): TokenTemplateRow => {
      if (!patch || typeof patch !== 'object') throw new Error('Invalid patch')
      const { cols, vals } = buildFragments(patch)
      if (!cols.includes('name')) throw new Error('name is required')
      // Default source='user' — the seeded SRD rows are created by the
      // main-process seeder, not through this channel.
      if (!cols.includes('source')) {
        cols.push('source')
        vals.push('user')
      }
      const placeholders = cols.map(() => '?').join(', ')
      const row = getDb()
        .prepare(
          `INSERT INTO token_templates (${cols.join(', ')}) VALUES (${placeholders})
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(...vals) as TokenTemplateDbRow
      return toTokenTemplateRow(row)
    },
  )

  ipcMain.handle(
    IPC.TOKEN_TEMPLATES_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const tplId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch)
      if (cols.length === 0) return
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(tplId)
      getDb()
        .prepare(`UPDATE token_templates SET ${setClause} WHERE id = ?`)
        .run(...vals)
    },
  )

  ipcMain.handle(IPC.TOKEN_TEMPLATES_DELETE, (_event, id: number): void => {
    const tplId = requireIntegerId(id)
    getDb().prepare('DELETE FROM token_templates WHERE id = ?').run(tplId)
  })
}
