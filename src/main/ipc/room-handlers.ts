import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { RoomRecord, RoomVisibility } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `rooms` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 */

interface RoomRow {
  id: number
  map_id: number
  name: string
  description: string
  polygon: string
  visibility: string
  encounter_id: number | null
  atmosphere_hint: string | null
  notes: string | null
  color: string
  created_at: string
}

function toRoomRecord(r: RoomRow): RoomRecord {
  return {
    id: r.id,
    mapId: r.map_id,
    name: r.name,
    description: r.description,
    polygon: r.polygon,
    visibility: r.visibility as RoomVisibility,
    encounterId: r.encounter_id,
    atmosphereHint: r.atmosphere_hint,
    notes: r.notes,
    color: r.color,
    createdAt: r.created_at,
  }
}

const SELECT_COLUMNS =
  'id, map_id, name, description, polygon, visibility, encounter_id, atmosphere_hint, notes, color, created_at'

const VALID_VISIBILITY = new Set<RoomVisibility>(['hidden', 'revealed', 'dimmed'])

const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  mapId: { col: 'map_id', coerce: coerceInteger },
  name: { col: 'name', coerce: (v) => (v == null ? '' : String(v)) },
  description: { col: 'description', coerce: (v) => (v == null ? '' : String(v)) },
  polygon: { col: 'polygon', coerce: coercePolygon },
  visibility: { col: 'visibility', coerce: coerceVisibility },
  encounterId: {
    col: 'encounter_id',
    coerce: (v) => (v == null ? null : coerceInteger(v)),
  },
  atmosphereHint: {
    col: 'atmosphere_hint',
    coerce: (v) => (v == null ? null : String(v)),
  },
  notes: { col: 'notes', coerce: (v) => (v == null ? null : String(v)) },
  color: { col: 'color', coerce: (v) => (v == null ? '#3b82f6' : String(v)) },
}

function coerceInteger(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  throw new Error('Expected integer')
}

function coerceVisibility(v: unknown): string {
  if (typeof v !== 'string' || !VALID_VISIBILITY.has(v as RoomVisibility)) {
    throw new Error('Invalid visibility')
  }
  return v
}

/**
 * Polygon arrives as a JSON string (already encoded in the renderer's
 * RoomRecord.polygon shape). Re-parse to validate it's a well-formed
 * array of {x,y} points before writing — rejects random strings that
 * would poison the row.
 */
function coercePolygon(v: unknown): string {
  if (typeof v !== 'string') throw new Error('polygon must be a JSON string')
  let parsed: unknown
  try {
    parsed = JSON.parse(v)
  } catch {
    throw new Error('polygon is not valid JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('polygon must be an array')
  for (const pt of parsed) {
    if (!pt || typeof pt !== 'object') throw new Error('polygon points must be objects')
    const p = pt as { x: unknown; y: unknown }
    if (typeof p.x !== 'number' || typeof p.y !== 'number') {
      throw new Error('polygon points must have numeric x/y')
    }
  }
  return v
}

function requireIntegerId(id: unknown, label = 'room'): number {
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

export function registerRoomHandlers(): void {
  ipcMain.handle(IPC.ROOMS_LIST_BY_MAP, (_event, mapId: number): RoomRecord[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM rooms WHERE map_id = ?`)
      .all(mapId) as RoomRow[]
    return rows.map(toRoomRecord)
  })

  ipcMain.handle(
    IPC.ROOMS_CREATE,
    (_event, patch: Record<string, unknown>): RoomRecord => {
      if (!patch || typeof patch !== 'object') throw new Error('Invalid patch')
      const { cols, vals } = buildFragments(patch)
      if (!cols.includes('map_id')) throw new Error('mapId is required')
      const placeholders = cols.map(() => '?').join(', ')
      const row = getDb()
        .prepare(
          `INSERT INTO rooms (${cols.join(', ')}) VALUES (${placeholders})
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(...vals) as RoomRow
      return toRoomRecord(row)
    },
  )

  ipcMain.handle(IPC.ROOMS_RESTORE, (_event, room: RoomRecord): RoomRecord => {
    if (!room) throw new Error('Invalid room')
    const id = requireIntegerId(room.id, 'room')
    // Re-insert preserving every field — including id + createdAt so the
    // restored row is bit-identical to the deleted one.
    const row = getDb()
      .prepare(
        `INSERT INTO rooms (id, map_id, name, description, polygon, visibility,
                            encounter_id, atmosphere_hint, notes, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING ${SELECT_COLUMNS}`,
      )
      .get(
        id,
        requireIntegerId(room.mapId, 'map'),
        String(room.name ?? ''),
        String(room.description ?? ''),
        coercePolygon(room.polygon),
        coerceVisibility(room.visibility),
        room.encounterId == null ? null : coerceInteger(room.encounterId),
        room.atmosphereHint == null ? null : String(room.atmosphereHint),
        room.notes == null ? null : String(room.notes),
        String(room.color ?? '#3b82f6'),
        String(room.createdAt ?? new Date().toISOString()),
      ) as RoomRow
    return toRoomRecord(row)
  })

  ipcMain.handle(
    IPC.ROOMS_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const roomId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch)
      if (cols.length === 0) return
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(roomId)
      getDb().prepare(`UPDATE rooms SET ${setClause} WHERE id = ?`).run(...vals)
    },
  )

  ipcMain.handle(IPC.ROOMS_DELETE, (_event, id: number): void => {
    const roomId = requireIntegerId(id)
    getDb().prepare('DELETE FROM rooms WHERE id = ?').run(roomId)
  })
}
