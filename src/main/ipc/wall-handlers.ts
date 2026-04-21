import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { WallRecord, WallType, DoorState } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `walls` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 */

interface WallRow {
  id: number
  map_id: number
  x1: number
  y1: number
  x2: number
  y2: number
  wall_type: string
  door_state: string
}

function toWallRecord(r: WallRow): WallRecord {
  return {
    id: r.id,
    mapId: r.map_id,
    x1: r.x1,
    y1: r.y1,
    x2: r.x2,
    y2: r.y2,
    wallType: r.wall_type as WallType,
    doorState: r.door_state as DoorState,
  }
}

const SELECT_COLUMNS = 'id, map_id, x1, y1, x2, y2, wall_type, door_state'

const VALID_WALL_TYPES = new Set<WallType>(['wall', 'door', 'window'])
const VALID_DOOR_STATES = new Set<DoorState>(['open', 'closed', 'locked'])

function requireIntegerId(id: unknown, label = 'wall'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function requireWallType(value: unknown): WallType {
  if (typeof value !== 'string' || !VALID_WALL_TYPES.has(value as WallType)) {
    throw new Error('Invalid wallType')
  }
  return value as WallType
}

function requireDoorState(value: unknown): DoorState {
  if (typeof value !== 'string' || !VALID_DOOR_STATES.has(value as DoorState)) {
    throw new Error('Invalid doorState')
  }
  return value as DoorState
}

export function registerWallHandlers(): void {
  ipcMain.handle(IPC.WALLS_LIST_BY_MAP, (_event, mapId: number): WallRecord[] => {
    requireIntegerId(mapId, 'map')
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM walls WHERE map_id = ?`)
      .all(mapId) as WallRow[]
    return rows.map(toWallRecord)
  })

  ipcMain.handle(
    IPC.WALLS_CREATE,
    (
      _event,
      patch: {
        mapId: number
        x1: number
        y1: number
        x2: number
        y2: number
        wallType: WallType
        doorState?: DoorState
      },
    ): WallRecord => {
      if (!patch) throw new Error('Invalid patch')
      const mapId = requireIntegerId(patch.mapId, 'map')
      const x1 = requireFiniteNumber(patch.x1, 'x1')
      const y1 = requireFiniteNumber(patch.y1, 'y1')
      const x2 = requireFiniteNumber(patch.x2, 'x2')
      const y2 = requireFiniteNumber(patch.y2, 'y2')
      const wallType = requireWallType(patch.wallType)
      const doorState = patch.doorState === undefined ? 'closed' : requireDoorState(patch.doorState)
      const row = getDb()
        .prepare(
          `INSERT INTO walls (map_id, x1, y1, x2, y2, wall_type, door_state)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(mapId, x1, y1, x2, y2, wallType, doorState) as WallRow
      return toWallRecord(row)
    },
  )

  ipcMain.handle(IPC.WALLS_RESTORE, (_event, wall: WallRecord): WallRecord => {
    if (!wall) throw new Error('Invalid wall')
    const id = requireIntegerId(wall.id, 'wall')
    const mapId = requireIntegerId(wall.mapId, 'map')
    const x1 = requireFiniteNumber(wall.x1, 'x1')
    const y1 = requireFiniteNumber(wall.y1, 'y1')
    const x2 = requireFiniteNumber(wall.x2, 'x2')
    const y2 = requireFiniteNumber(wall.y2, 'y2')
    const wallType = requireWallType(wall.wallType)
    const doorState = requireDoorState(wall.doorState)
    const row = getDb()
      .prepare(
        `INSERT INTO walls (id, map_id, x1, y1, x2, y2, wall_type, door_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING ${SELECT_COLUMNS}`,
      )
      .get(id, mapId, x1, y1, x2, y2, wallType, doorState) as WallRow
    return toWallRecord(row)
  })

  ipcMain.handle(
    IPC.WALLS_UPDATE,
    (
      _event,
      id: number,
      patch: Partial<{ wallType: WallType; doorState: DoorState }>,
    ): void => {
      const wallId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const sets: string[] = []
      const vals: unknown[] = []
      if (patch.wallType !== undefined) {
        sets.push('wall_type = ?')
        vals.push(requireWallType(patch.wallType))
      }
      if (patch.doorState !== undefined) {
        sets.push('door_state = ?')
        vals.push(requireDoorState(patch.doorState))
      }
      if (sets.length === 0) return
      vals.push(wallId)
      getDb().prepare(`UPDATE walls SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    },
  )

  ipcMain.handle(IPC.WALLS_DELETE, (_event, id: number): void => {
    const wallId = requireIntegerId(id)
    getDb().prepare('DELETE FROM walls WHERE id = ?').run(wallId)
  })
}
