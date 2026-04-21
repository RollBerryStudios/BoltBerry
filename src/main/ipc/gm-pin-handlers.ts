import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { GMPinRecord } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `gm_pins` table. GM-only bookmarks
 * tied to a map, rendered as a Konva layer on top of the DM canvas.
 */

interface GMPinRow {
  id: number
  map_id: number
  x: number
  y: number
  label: string
  icon: string
  color: string
}

function toGMPinRecord(r: GMPinRow): GMPinRecord {
  return {
    id: r.id,
    mapId: r.map_id,
    x: r.x,
    y: r.y,
    label: r.label,
    icon: r.icon,
    color: r.color,
  }
}

const SELECT_COLUMNS = 'id, map_id, x, y, label, icon, color'

const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  mapId: { col: 'map_id', coerce: coerceInteger },
  x: { col: 'x', coerce: coerceNumber },
  y: { col: 'y', coerce: coerceNumber },
  label: { col: 'label', coerce: (v) => (v == null ? '' : String(v)) },
  icon: { col: 'icon', coerce: (v) => (v == null ? '📌' : String(v)) },
  color: { col: 'color', coerce: (v) => (v == null ? '#f59e0b' : String(v)) },
}

function coerceInteger(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  throw new Error('Expected integer')
}

function coerceNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  throw new Error('Expected finite number')
}

function requireIntegerId(id: unknown, label = 'pin'): number {
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

export function registerGMPinHandlers(): void {
  ipcMain.handle(IPC.GM_PINS_LIST_BY_MAP, (_event, mapId: number): GMPinRecord[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM gm_pins WHERE map_id = ?`)
      .all(mapId) as GMPinRow[]
    return rows.map(toGMPinRecord)
  })

  ipcMain.handle(
    IPC.GM_PINS_CREATE,
    (_event, patch: Record<string, unknown>): GMPinRecord => {
      if (!patch || typeof patch !== 'object') throw new Error('Invalid patch')
      const { cols, vals } = buildFragments(patch)
      if (!cols.includes('map_id')) throw new Error('mapId is required')
      const placeholders = cols.map(() => '?').join(', ')
      const row = getDb()
        .prepare(
          `INSERT INTO gm_pins (${cols.join(', ')}) VALUES (${placeholders})
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(...vals) as GMPinRow
      return toGMPinRecord(row)
    },
  )

  ipcMain.handle(
    IPC.GM_PINS_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const pinId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch)
      if (cols.length === 0) return
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(pinId)
      getDb().prepare(`UPDATE gm_pins SET ${setClause} WHERE id = ?`).run(...vals)
    },
  )

  ipcMain.handle(IPC.GM_PINS_DELETE, (_event, id: number): void => {
    const pinId = requireIntegerId(id)
    getDb().prepare('DELETE FROM gm_pins WHERE id = ?').run(pinId)
  })
}
