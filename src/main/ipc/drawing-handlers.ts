import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { DrawingRecord, DrawingType } from '../../shared/ipc-types'
import { getDb } from '../db/database'
import { logger } from '../logger'
import { IpcValidationError } from './validators'

/**
 * Semantic IPC channels for the `drawings` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 *
 * The `points` column is stored as a JSON string. Legacy rows (from
 * before the v10 migration) encoded text drawings as `{ x, y, text }`
 * objects instead of arrays; the handler parses both shapes back into
 * the canonical numeric-array form.
 */

interface DrawingRow {
  id: number
  map_id: number
  type: string
  points: string
  color: string
  width: number
  text: string | null
  synced: number
}

const VALID_TYPES = new Set<DrawingType>(['freehand', 'rect', 'circle', 'text'])

/**
 * BB-028: prior QA #11. Corrupt JSON used to be silently swallowed
 * (returning `points: []`), so a damaged drawing simply vanished from
 * the canvas while still occupying a row. Now we log via the structured
 * logger (visible to crash reporting + dev console) and tag the record
 * as `corrupt: true` so the renderer can surface a toast / repair UI
 * without crashing the entire list call.
 */
function parsePoints(
  raw: string,
  rowId: number,
): { points: number[]; legacyText: string | null; corrupt: boolean } {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return {
        points: parsed.filter((n): n is number => typeof n === 'number'),
        legacyText: null,
        corrupt: false,
      }
    }
    // Legacy shape: text drawings used `{x, y, text}` before v10.
    if (parsed && typeof parsed === 'object' && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return {
        points: [parsed.x, parsed.y],
        legacyText: typeof parsed.text === 'string' ? parsed.text : null,
        corrupt: false,
      }
    }
    logger.warn(`[drawing-handlers] drawing ${rowId} has unrecognised points shape`)
  } catch (err) {
    logger.warn(
      `[drawing-handlers] drawing ${rowId} has malformed points JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  return { points: [], legacyText: null, corrupt: true }
}

function toDrawingRecord(r: DrawingRow): DrawingRecord {
  const { points, legacyText, corrupt } = parsePoints(r.points, r.id)
  return {
    id: r.id,
    mapId: r.map_id,
    type: r.type as DrawingType,
    points,
    color: r.color,
    width: r.width,
    text: r.text ?? legacyText,
    synced: r.synced !== 0,
    ...(corrupt ? { corrupt: true } : {}),
  }
}

const SELECT_COLUMNS = 'id, map_id, type, points, color, width, text, synced'

function requireIntegerId(id: unknown, label = 'drawing'): number {
  if (!Number.isInteger(id)) throw new IpcValidationError(`Invalid ${label} id`)
  return id as number
}

function requireDrawingType(v: unknown): DrawingType {
  if (typeof v !== 'string' || !VALID_TYPES.has(v as DrawingType)) {
    throw new IpcValidationError('Invalid drawing type')
  }
  return v as DrawingType
}

function coerceFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new IpcValidationError(`${label} must be a finite number`)
  }
  return v
}

function coercePoints(v: unknown): string {
  if (!Array.isArray(v)) throw new IpcValidationError('points must be a number array')
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new IpcValidationError('points must contain finite numbers only')
    }
  }
  return JSON.stringify(v)
}

interface CreatePatch {
  mapId: number
  type: DrawingType
  points: number[]
  color: string
  width: number
  text?: string | null
  /** Default true — hits the player broadcast path. Non-synced drawings
   *  are reserved for future GM-only sketches. */
  synced?: boolean
}

function insertDrawing(patch: CreatePatch): DrawingRow {
  const mapId = requireIntegerId(patch.mapId, 'map')
  const type = requireDrawingType(patch.type)
  const points = coercePoints(patch.points)
  const color = String(patch.color ?? '#f59e0b')
  const width = coerceFiniteNumber(patch.width, 'width')
  const text = patch.text == null ? null : String(patch.text)
  const synced = patch.synced === false ? 0 : 1
  return getDb()
    .prepare(
      `INSERT INTO drawings (map_id, type, points, color, width, text, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING ${SELECT_COLUMNS}`,
    )
    .get(mapId, type, points, color, width, text, synced) as DrawingRow
}

export function registerDrawingHandlers(): void {
  ipcMain.handle(IPC.DRAWINGS_LIST_BY_MAP, (_event, mapId: number): DrawingRecord[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM drawings WHERE map_id = ?`)
      .all(mapId) as DrawingRow[]
    return rows.map(toDrawingRecord)
  })

  ipcMain.handle(IPC.DRAWINGS_LIST_SYNCED_BY_MAP, (_event, mapId: number): DrawingRecord[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM drawings WHERE map_id = ? AND synced = 1`)
      .all(mapId) as DrawingRow[]
    return rows.map(toDrawingRecord)
  })

  ipcMain.handle(IPC.DRAWINGS_CREATE, (_event, patch: CreatePatch): DrawingRecord => {
    if (!patch || typeof patch !== 'object') throw new IpcValidationError('Invalid patch')
    return toDrawingRecord(insertDrawing(patch))
  })

  ipcMain.handle(
    IPC.DRAWINGS_CREATE_MANY,
    (_event, patches: CreatePatch[]): DrawingRecord[] => {
      if (!Array.isArray(patches) || patches.length === 0) return []
      const db = getDb()
      const txn = db.transaction(() =>
        patches.map((p) => {
          if (!p || typeof p !== 'object') throw new IpcValidationError('Invalid patch')
          return toDrawingRecord(insertDrawing(p))
        }),
      )
      return txn()
    },
  )

  ipcMain.handle(IPC.DRAWINGS_DELETE, (_event, id: number): void => {
    const drawingId = requireIntegerId(id)
    getDb().prepare('DELETE FROM drawings WHERE id = ?').run(drawingId)
  })

  ipcMain.handle(IPC.DRAWINGS_DELETE_BY_MAP, (_event, mapId: number): void => {
    const id = requireIntegerId(mapId, 'map')
    getDb().prepare('DELETE FROM drawings WHERE map_id = ?').run(id)
  })
}
