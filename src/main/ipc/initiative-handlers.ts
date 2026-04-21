import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { InitiativeEntry, EffectTimer } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `initiative` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 */

interface InitiativeRow {
  id: number
  map_id: number
  combatant_name: string
  roll: number
  current_turn: number
  token_id: number | null
  effect_timers: string | null
  sort_order: number
}

function toInitiativeEntry(r: InitiativeRow): InitiativeEntry {
  let effectTimers: EffectTimer[] | null = null
  if (r.effect_timers) {
    try {
      const parsed = JSON.parse(r.effect_timers)
      effectTimers = Array.isArray(parsed) && parsed.length > 0 ? parsed : null
    } catch {
      effectTimers = null
    }
  }
  return {
    id: r.id,
    mapId: r.map_id,
    combatantName: r.combatant_name,
    roll: r.roll,
    currentTurn: r.current_turn !== 0,
    tokenId: r.token_id,
    effectTimers,
  }
}

const SELECT_COLUMNS =
  'id, map_id, combatant_name, roll, current_turn, token_id, effect_timers, sort_order'

const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  mapId: { col: 'map_id', coerce: coerceInteger },
  combatantName: { col: 'combatant_name', coerce: (v) => (v == null ? '' : String(v)) },
  roll: { col: 'roll', coerce: coerceInteger },
  currentTurn: { col: 'current_turn', coerce: (v) => (v ? 1 : 0) },
  tokenId: {
    col: 'token_id',
    coerce: (v) => (v == null ? null : coerceInteger(v)),
  },
  effectTimers: {
    col: 'effect_timers',
    coerce: (v) => {
      if (v == null) return null
      if (Array.isArray(v) && v.length === 0) return null
      return JSON.stringify(v)
    },
  },
  sortOrder: { col: 'sort_order', coerce: coerceInteger },
}

function coerceInteger(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  throw new Error('Expected integer')
}

function requireIntegerId(id: unknown, label = 'initiative'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function buildFragments(patch: Record<string, unknown>): {
  cols: string[]
  vals: unknown[]
} {
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

export function registerInitiativeHandlers(): void {
  ipcMain.handle(IPC.INITIATIVE_LIST_BY_MAP, (_event, mapId: number): InitiativeEntry[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM initiative WHERE map_id = ?
         ORDER BY sort_order ASC, roll DESC`,
      )
      .all(mapId) as InitiativeRow[]
    return rows.map(toInitiativeEntry)
  })

  ipcMain.handle(
    IPC.INITIATIVE_CREATE,
    (_event, patch: Record<string, unknown>): InitiativeEntry => {
      if (!patch || typeof patch !== 'object') throw new Error('Invalid patch')
      const { cols, vals } = buildFragments(patch)
      if (!cols.includes('map_id')) throw new Error('mapId is required')
      if (!cols.includes('combatant_name')) {
        throw new Error('combatantName is required')
      }
      const placeholders = cols.map(() => '?').join(', ')
      const row = getDb()
        .prepare(
          `INSERT INTO initiative (${cols.join(', ')}) VALUES (${placeholders})
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(...vals) as InitiativeRow
      return toInitiativeEntry(row)
    },
  )

  ipcMain.handle(
    IPC.INITIATIVE_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const entryId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch)
      if (cols.length === 0) return
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(entryId)
      getDb().prepare(`UPDATE initiative SET ${setClause} WHERE id = ?`).run(...vals)
    },
  )

  ipcMain.handle(
    IPC.INITIATIVE_UPDATE_MANY,
    (_event, updates: Array<{ id: number; patch: Record<string, unknown> }>): void => {
      if (!Array.isArray(updates) || updates.length === 0) return
      const db = getDb()
      db.transaction(() => {
        for (const { id, patch } of updates) {
          const entryId = requireIntegerId(id)
          if (!patch || typeof patch !== 'object') continue
          const { cols, vals } = buildFragments(patch)
          if (cols.length === 0) continue
          const setClause = cols.map((c) => `${c} = ?`).join(', ')
          vals.push(entryId)
          db.prepare(`UPDATE initiative SET ${setClause} WHERE id = ?`).run(...vals)
        }
      })()
    },
  )

  ipcMain.handle(IPC.INITIATIVE_DELETE, (_event, id: number): void => {
    const entryId = requireIntegerId(id)
    getDb().prepare('DELETE FROM initiative WHERE id = ?').run(entryId)
  })

  ipcMain.handle(IPC.INITIATIVE_DELETE_BY_MAP, (_event, mapId: number): void => {
    const id = requireIntegerId(mapId, 'map')
    getDb().prepare('DELETE FROM initiative WHERE map_id = ?').run(id)
  })
}
