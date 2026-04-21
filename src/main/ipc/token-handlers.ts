import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { TokenRecord } from '../../shared/ipc-types'
import { getDb } from '../db/database'
import type Database from 'better-sqlite3'

/**
 * Semantic IPC channels for the `tokens` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 *
 * The schema gives every mutable column a default or NULL, so
 * `create()` accepts a partial patch — the handler fills in the
 * DB-side defaults and returns the full row via RETURNING.
 *
 * Child-table coupling: the renderer used to pair a tokens DELETE with
 * `UPDATE initiative SET token_id = NULL`. We reproduce that here inside
 * a transaction so deleteMany() leaves no dangling initiative rows.
 */

interface TokenRow {
  id: number
  map_id: number
  name: string
  image_path: string | null
  x: number
  y: number
  size: number
  hp_current: number
  hp_max: number
  visible_to_players: number
  rotation: number
  locked: number
  z_index: number
  marker_color: string | null
  ac: number | null
  notes: string | null
  status_effects: string | null
  faction: string
  show_name: number
  light_radius: number
  light_color: string
}

function toTokenRecord(r: TokenRow): TokenRecord {
  let statusEffects: string[] | null = null
  if (r.status_effects) {
    try {
      const parsed = JSON.parse(r.status_effects)
      statusEffects = Array.isArray(parsed) && parsed.length > 0 ? parsed : null
    } catch {
      statusEffects = null
    }
  }
  return {
    id: r.id,
    mapId: r.map_id,
    name: r.name,
    imagePath: r.image_path,
    x: r.x,
    y: r.y,
    size: r.size,
    hpCurrent: r.hp_current,
    hpMax: r.hp_max,
    visibleToPlayers: r.visible_to_players !== 0,
    rotation: r.rotation,
    locked: r.locked !== 0,
    zIndex: r.z_index,
    markerColor: r.marker_color,
    ac: r.ac,
    notes: r.notes,
    statusEffects,
    faction: r.faction ?? 'party',
    showName: r.show_name !== 0,
    lightRadius: r.light_radius,
    lightColor: r.light_color,
  }
}

const SELECT_COLUMNS = [
  'id',
  'map_id',
  'name',
  'image_path',
  'x',
  'y',
  'size',
  'hp_current',
  'hp_max',
  'visible_to_players',
  'rotation',
  'locked',
  'z_index',
  'marker_color',
  'ac',
  'notes',
  'status_effects',
  'faction',
  'show_name',
  'light_radius',
  'light_color',
].join(', ')

/**
 * Maps a camelCase TokenRecord key to its snake_case column + a
 * type-appropriate value coercion. Unknown keys are rejected.
 */
const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  mapId: { col: 'map_id', coerce: (v) => v },
  name: { col: 'name', coerce: (v) => (v == null ? null : String(v)) },
  imagePath: { col: 'image_path', coerce: (v) => (v == null ? null : String(v)) },
  x: { col: 'x', coerce: coerceNumber },
  y: { col: 'y', coerce: coerceNumber },
  size: { col: 'size', coerce: coerceNumber },
  hpCurrent: { col: 'hp_current', coerce: coerceNumber },
  hpMax: { col: 'hp_max', coerce: coerceNumber },
  visibleToPlayers: { col: 'visible_to_players', coerce: coerceBool },
  rotation: { col: 'rotation', coerce: coerceNumber },
  locked: { col: 'locked', coerce: coerceBool },
  zIndex: { col: 'z_index', coerce: coerceNumber },
  markerColor: { col: 'marker_color', coerce: (v) => (v == null ? null : String(v)) },
  ac: { col: 'ac', coerce: (v) => (v == null ? null : coerceNumber(v)) },
  notes: { col: 'notes', coerce: (v) => (v == null ? null : String(v)) },
  statusEffects: {
    col: 'status_effects',
    coerce: (v) => {
      if (v == null) return null
      if (Array.isArray(v) && v.length === 0) return null
      return JSON.stringify(v)
    },
  },
  faction: { col: 'faction', coerce: (v) => (v == null ? null : String(v)) },
  showName: { col: 'show_name', coerce: coerceBool },
  lightRadius: { col: 'light_radius', coerce: coerceNumber },
  lightColor: { col: 'light_color', coerce: (v) => (v == null ? null : String(v)) },
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  throw new Error('Expected finite number')
}

function coerceBool(v: unknown): number {
  return v ? 1 : 0
}

function requireIntegerId(id: unknown, label = 'token'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

/**
 * Turn a partial token patch into INSERT or UPDATE fragments. Unknown
 * keys are ignored — the renderer can't sneak extra columns through.
 */
function buildFragments(patch: Record<string, unknown>, includeId: boolean): {
  cols: string[]
  vals: unknown[]
} {
  const cols: string[] = []
  const vals: unknown[] = []
  if (includeId && 'id' in patch) {
    cols.push('id')
    vals.push(patch.id)
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id') continue
    const mapping = COLUMN_MAP[key]
    if (!mapping) continue
    cols.push(mapping.col)
    vals.push(mapping.coerce(value))
  }
  return { cols, vals }
}

function insertToken(db: Database.Database, patch: Record<string, unknown>, withId: boolean): TokenRow {
  const { cols, vals } = buildFragments(patch, withId)
  if (!cols.includes('map_id')) throw new Error('mapId is required')
  const placeholders = cols.map(() => '?').join(', ')
  return db
    .prepare(
      `INSERT INTO tokens (${cols.join(', ')}) VALUES (${placeholders})
       RETURNING ${SELECT_COLUMNS}`,
    )
    .get(...vals) as TokenRow
}

export function registerTokenHandlers(): void {
  ipcMain.handle(IPC.TOKENS_LIST_BY_MAP, (_event, mapId: number): TokenRecord[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM tokens WHERE map_id = ?`)
      .all(mapId) as TokenRow[]
    return rows.map(toTokenRecord)
  })

  ipcMain.handle(
    IPC.TOKENS_CREATE,
    (_event, patch: Record<string, unknown>): TokenRecord => {
      if (!patch || typeof patch !== 'object') throw new Error('Invalid patch')
      const row = insertToken(getDb(), patch, false)
      return toTokenRecord(row)
    },
  )

  ipcMain.handle(
    IPC.TOKENS_RESTORE,
    (_event, token: TokenRecord): TokenRecord => {
      if (!token || typeof token !== 'object') throw new Error('Invalid token')
      requireIntegerId(token.id, 'token')
      const row = insertToken(getDb(), token as unknown as Record<string, unknown>, true)
      return toTokenRecord(row)
    },
  )

  ipcMain.handle(
    IPC.TOKENS_RESTORE_MANY,
    (_event, tokens: TokenRecord[]): TokenRecord[] => {
      if (!Array.isArray(tokens) || tokens.length === 0) return []
      const db = getDb()
      const txn = db.transaction(() =>
        tokens.map((t) => {
          requireIntegerId(t?.id, 'token')
          return toTokenRecord(insertToken(db, t as unknown as Record<string, unknown>, true))
        }),
      )
      return txn()
    },
  )

  ipcMain.handle(
    IPC.TOKENS_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const tokenId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch, false)
      if (cols.length === 0) return
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(tokenId)
      getDb().prepare(`UPDATE tokens SET ${setClause} WHERE id = ?`).run(...vals)
    },
  )

  ipcMain.handle(
    IPC.TOKENS_UPDATE_MANY,
    (_event, updates: Array<{ id: number; patch: Record<string, unknown> }>): void => {
      if (!Array.isArray(updates) || updates.length === 0) return
      const db = getDb()
      db.transaction(() => {
        for (const { id, patch } of updates) {
          const tokenId = requireIntegerId(id)
          if (!patch || typeof patch !== 'object') continue
          const { cols, vals } = buildFragments(patch, false)
          if (cols.length === 0) continue
          const setClause = cols.map((c) => `${c} = ?`).join(', ')
          vals.push(tokenId)
          db.prepare(`UPDATE tokens SET ${setClause} WHERE id = ?`).run(...vals)
        }
      })()
    },
  )

  ipcMain.handle(IPC.TOKENS_DELETE, (_event, id: number): void => {
    const tokenId = requireIntegerId(id)
    const db = getDb()
    db.transaction(() => {
      db.prepare('UPDATE initiative SET token_id = NULL WHERE token_id = ?').run(tokenId)
      db.prepare('DELETE FROM tokens WHERE id = ?').run(tokenId)
    })()
  })

  ipcMain.handle(IPC.TOKENS_DELETE_MANY, (_event, ids: number[]): void => {
    if (!Array.isArray(ids) || ids.length === 0) return
    const cleanIds = ids.filter((v): v is number => Number.isInteger(v))
    if (cleanIds.length === 0) return
    const placeholders = cleanIds.map(() => '?').join(',')
    const db = getDb()
    db.transaction(() => {
      db.prepare(
        `UPDATE initiative SET token_id = NULL WHERE token_id IN (${placeholders})`,
      ).run(...cleanIds)
      db.prepare(`DELETE FROM tokens WHERE id IN (${placeholders})`).run(...cleanIds)
    })()
  })
}
