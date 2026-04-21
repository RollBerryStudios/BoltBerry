import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type {
  MapRecord,
  GridType,
  MapStatsRow,
  RecentMapEntry,
  AudioChannelKey,
} from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `maps` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 *
 * Schema columns:
 *   id, campaign_id, name, image_path,
 *   grid_type, grid_size, ft_per_unit, order_index,
 *   camera_x, camera_y, camera_scale,
 *   rotation, rotation_player,
 *   grid_offset_x, grid_offset_y,
 *   ambient_brightness, ambient_track_path,
 *   track1_volume, track2_volume, combat_volume,
 *   grid_visible, grid_thickness, grid_color
 */

interface MapRow {
  id: number
  campaign_id: number
  name: string
  image_path: string
  grid_type: string
  grid_size: number
  ft_per_unit: number
  order_index: number
  camera_x: number | null
  camera_y: number | null
  camera_scale: number | null
  rotation: number | null
  rotation_player: number | null
  grid_offset_x: number
  grid_offset_y: number
  ambient_brightness: number
  ambient_track_path: string | null
  track1_volume: number
  track2_volume: number
  combat_volume: number
  grid_visible: number | null
  grid_thickness: number | null
  grid_color: string | null
}

function toMapRecord(r: MapRow): MapRecord {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    name: r.name,
    imagePath: r.image_path,
    gridType: r.grid_type as GridType,
    gridSize: r.grid_size,
    ftPerUnit: r.ft_per_unit ?? 5,
    orderIndex: r.order_index,
    rotation: r.rotation ?? 0,
    rotationPlayer: r.rotation_player ?? 0,
    gridOffsetX: r.grid_offset_x ?? 0,
    gridOffsetY: r.grid_offset_y ?? 0,
    ambientBrightness: r.ambient_brightness ?? 100,
    cameraX: r.camera_x,
    cameraY: r.camera_y,
    cameraScale: r.camera_scale,
    ambientTrackPath: r.ambient_track_path ?? null,
    track1Volume: r.track1_volume ?? 1,
    track2Volume: r.track2_volume ?? 1,
    combatVolume: r.combat_volume ?? 1,
    gridVisible: (r.grid_visible ?? 1) !== 0,
    gridThickness: r.grid_thickness ?? 1,
    gridColor: r.grid_color ?? 'rgba(255,255,255,0.34)',
  }
}

const SELECT_COLUMNS = [
  'id',
  'campaign_id',
  'name',
  'image_path',
  'grid_type',
  'grid_size',
  'ft_per_unit',
  'order_index',
  'camera_x',
  'camera_y',
  'camera_scale',
  'rotation',
  'rotation_player',
  'grid_offset_x',
  'grid_offset_y',
  'ambient_brightness',
  'ambient_track_path',
  'track1_volume',
  'track2_volume',
  'combat_volume',
  'grid_visible',
  'grid_thickness',
  'grid_color',
].join(', ')

const VALID_GRID_TYPES = new Set<GridType>(['none', 'square', 'hex'])
const VALID_ROTATIONS = new Set([0, 90, 180, 270])
const VOLUME_COLUMN: Record<AudioChannelKey, string> = {
  track1: 'track1_volume',
  track2: 'track2_volume',
  combat: 'combat_volume',
}

function requireIntegerId(id: unknown, label = 'map'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }
  return value
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

export function registerMapHandlers(): void {
  ipcMain.handle(IPC.MAPS_LIST, (_event, campaignId: number): MapRecord[] => {
    requireIntegerId(campaignId, 'campaign')
    const rows = getDb()
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM maps WHERE campaign_id = ? ORDER BY order_index`,
      )
      .all(campaignId) as MapRow[]
    return rows.map(toMapRecord)
  })

  ipcMain.handle(
    IPC.MAPS_LIST_FOR_STATS,
    (_event, campaignIds: number[]): MapStatsRow[] => {
      if (!Array.isArray(campaignIds) || campaignIds.length === 0) return []
      // Filter to integers so a stray non-integer can't break the
      // prepared-statement placeholder expansion.
      const ids = campaignIds.filter((v): v is number => Number.isInteger(v))
      if (ids.length === 0) return []
      const placeholders = ids.map(() => '?').join(',')
      const rows = getDb()
        .prepare(
          `SELECT campaign_id, image_path, order_index FROM maps
           WHERE campaign_id IN (${placeholders}) ORDER BY order_index ASC`,
        )
        .all(...ids) as Array<{
          campaign_id: number
          image_path: string
          order_index: number
        }>
      return rows.map((r) => ({
        campaignId: r.campaign_id,
        imagePath: r.image_path,
        orderIndex: r.order_index,
      }))
    },
  )

  ipcMain.handle(
    IPC.MAPS_LIST_RECENT,
    (_event, campaignIds: number[], limit: number): RecentMapEntry[] => {
      if (!Array.isArray(campaignIds) || campaignIds.length === 0) return []
      const ids = campaignIds.filter((v): v is number => Number.isInteger(v))
      if (ids.length === 0) return []
      const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 12
      const placeholders = ids.map(() => '?').join(',')
      const rows = getDb()
        .prepare(
          `SELECT m.id, m.name, m.image_path, m.campaign_id, c.name as campaign_name
           FROM maps m
           JOIN campaigns c ON c.id = m.campaign_id
           WHERE m.campaign_id IN (${placeholders})
           ORDER BY m.id DESC
           LIMIT ?`,
        )
        .all(...ids, cap) as Array<{
          id: number
          name: string
          image_path: string
          campaign_id: number
          campaign_name: string
        }>
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        imagePath: r.image_path,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
      }))
    },
  )

  ipcMain.handle(IPC.MAPS_COUNT, (): number => {
    const row = getDb().prepare('SELECT COUNT(*) as n FROM maps').get() as { n: number }
    return row.n
  })

  ipcMain.handle(
    IPC.MAPS_CREATE,
    (
      _event,
      args: { campaignId: number; name: string; imagePath: string },
    ): MapRecord => {
      const campaignId = requireIntegerId(args?.campaignId, 'campaign')
      const name = requireString(args?.name, 'Map name').trim()
      const imagePath = requireString(args?.imagePath, 'Image path')
      const db = getDb()
      const txn = db.transaction(() => {
        // Next order_index for this campaign
        const nextRow = db
          .prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM maps WHERE campaign_id = ?',
          )
          .get(campaignId) as { next: number }
        return db
          .prepare(
            `INSERT INTO maps (
               campaign_id, name, image_path, order_index,
               rotation, rotation_player,
               grid_offset_x, grid_offset_y, ambient_brightness
             ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 100)
             RETURNING ${SELECT_COLUMNS}`,
          )
          .get(campaignId, name, imagePath, nextRow.next) as MapRow
      })
      return toMapRecord(txn())
    },
  )

  ipcMain.handle(IPC.MAPS_RENAME, (_event, id: number, name: unknown): void => {
    const mapId = requireIntegerId(id)
    const trimmed = requireString(name, 'Map name').trim()
    getDb().prepare('UPDATE maps SET name = ? WHERE id = ?').run(trimmed, mapId)
  })

  ipcMain.handle(IPC.MAPS_DELETE, (_event, id: number): void => {
    const mapId = requireIntegerId(id)
    // Child tables (tokens, initiative, fog_state, drawings, walls,
    // rooms) all reference maps with ON DELETE CASCADE + foreign_keys
    // PRAGMA is on — one DELETE is enough.
    getDb().prepare('DELETE FROM maps WHERE id = ?').run(mapId)
  })

  ipcMain.handle(
    IPC.MAPS_SWAP_ORDER,
    (_event, aId: number, bId: number): void => {
      const idA = requireIntegerId(aId, 'map a')
      const idB = requireIntegerId(bId, 'map b')
      const db = getDb()
      db.transaction(() => {
        const a = db
          .prepare('SELECT order_index FROM maps WHERE id = ?')
          .get(idA) as { order_index: number } | undefined
        const b = db
          .prepare('SELECT order_index FROM maps WHERE id = ?')
          .get(idB) as { order_index: number } | undefined
        if (!a || !b) throw new Error('Map not found for swap')
        db.prepare('UPDATE maps SET order_index = ? WHERE id = ?').run(b.order_index, idA)
        db.prepare('UPDATE maps SET order_index = ? WHERE id = ?').run(a.order_index, idB)
      })()
    },
  )

  ipcMain.handle(
    IPC.MAPS_SET_GRID,
    (
      _event,
      id: number,
      patch: {
        gridType: GridType
        gridSize: number
        ftPerUnit: number
        gridOffsetX: number
        gridOffsetY: number
      },
    ): void => {
      const mapId = requireIntegerId(id)
      if (!patch || !VALID_GRID_TYPES.has(patch.gridType)) {
        throw new Error('Invalid gridType')
      }
      const gridSize = requireFiniteNumber(patch.gridSize, 'gridSize')
      const ftPerUnit = requireFiniteNumber(patch.ftPerUnit, 'ftPerUnit')
      const gridOffsetX = requireFiniteNumber(patch.gridOffsetX, 'gridOffsetX')
      const gridOffsetY = requireFiniteNumber(patch.gridOffsetY, 'gridOffsetY')
      getDb()
        .prepare(
          `UPDATE maps SET grid_type = ?, grid_size = ?, ft_per_unit = ?,
             grid_offset_x = ?, grid_offset_y = ? WHERE id = ?`,
        )
        .run(patch.gridType, gridSize, ftPerUnit, gridOffsetX, gridOffsetY, mapId)
    },
  )

  ipcMain.handle(
    IPC.MAPS_PATCH_GRID_DISPLAY,
    (
      _event,
      id: number,
      patch: Partial<{
        gridVisible: boolean
        gridThickness: number
        gridColor: string
        gridSize: number
      }>,
    ): void => {
      const mapId = requireIntegerId(id)
      const sets: string[] = []
      const vals: Array<number | string> = []
      if (patch?.gridVisible !== undefined) {
        sets.push('grid_visible = ?')
        vals.push(patch.gridVisible ? 1 : 0)
      }
      if (patch?.gridThickness !== undefined) {
        sets.push('grid_thickness = ?')
        vals.push(requireFiniteNumber(patch.gridThickness, 'gridThickness'))
      }
      if (patch?.gridColor !== undefined) {
        sets.push('grid_color = ?')
        vals.push(String(patch.gridColor))
      }
      if (patch?.gridSize !== undefined) {
        sets.push('grid_size = ?')
        vals.push(requireFiniteNumber(patch.gridSize, 'gridSize'))
      }
      if (sets.length === 0) return
      vals.push(mapId)
      getDb()
        .prepare(`UPDATE maps SET ${sets.join(', ')} WHERE id = ?`)
        .run(...vals)
    },
  )

  ipcMain.handle(IPC.MAPS_SET_ROTATION, (_event, id: number, rotation: number): void => {
    const mapId = requireIntegerId(id)
    if (!VALID_ROTATIONS.has(rotation)) throw new Error('Invalid rotation')
    getDb().prepare('UPDATE maps SET rotation = ? WHERE id = ?').run(rotation, mapId)
  })

  ipcMain.handle(
    IPC.MAPS_SET_ROTATION_PLAYER,
    (_event, id: number, rotation: number): void => {
      const mapId = requireIntegerId(id)
      if (!VALID_ROTATIONS.has(rotation)) throw new Error('Invalid rotation')
      getDb()
        .prepare('UPDATE maps SET rotation_player = ? WHERE id = ?')
        .run(rotation, mapId)
    },
  )

  ipcMain.handle(
    IPC.MAPS_SET_CAMERA,
    (
      _event,
      id: number,
      camera: { cameraX: number; cameraY: number; cameraScale: number },
    ): void => {
      const mapId = requireIntegerId(id)
      const x = requireFiniteNumber(camera?.cameraX, 'cameraX')
      const y = requireFiniteNumber(camera?.cameraY, 'cameraY')
      const scale = requireFiniteNumber(camera?.cameraScale, 'cameraScale')
      getDb()
        .prepare('UPDATE maps SET camera_x = ?, camera_y = ?, camera_scale = ? WHERE id = ?')
        .run(x, y, scale, mapId)
    },
  )

  ipcMain.handle(
    IPC.MAPS_SET_AMBIENT_TRACK,
    (_event, id: number, path: string | null): void => {
      const mapId = requireIntegerId(id)
      const value = path === null ? null : String(path)
      getDb()
        .prepare('UPDATE maps SET ambient_track_path = ? WHERE id = ?')
        .run(value, mapId)
    },
  )

  ipcMain.handle(
    IPC.MAPS_SET_CHANNEL_VOLUME,
    (_event, id: number, channel: AudioChannelKey, volume: number): void => {
      const mapId = requireIntegerId(id)
      const column = VOLUME_COLUMN[channel]
      if (!column) throw new Error('Invalid channel')
      const vol = requireFiniteNumber(volume, 'volume')
      // Whitelisted column name is safe to splice into the SQL string.
      getDb()
        .prepare(`UPDATE maps SET ${column} = ? WHERE id = ?`)
        .run(vol, mapId)
    },
  )
}
