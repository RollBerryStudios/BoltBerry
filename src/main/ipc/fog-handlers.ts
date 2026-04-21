import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { FogStateRecord } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `fog_state` table. One row per map,
 * keyed on map_id. Both bitmaps are stored as PNG data URLs.
 */

interface FogRow {
  fog_bitmap: string | null
  explored_bitmap: string | null
}

function requireIntegerId(id: unknown, label = 'map'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

export function registerFogHandlers(): void {
  ipcMain.handle(IPC.FOG_GET, (_event, mapId: number): FogStateRecord => {
    requireIntegerId(mapId)
    const row = getDb()
      .prepare('SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?')
      .get(mapId) as FogRow | undefined
    if (!row) return { fogBitmap: null, exploredBitmap: null }
    return {
      fogBitmap: row.fog_bitmap ?? null,
      exploredBitmap: row.explored_bitmap ?? null,
    }
  })

  ipcMain.handle(
    IPC.FOG_SAVE,
    (_event, mapId: number, bitmaps: FogStateRecord): void => {
      requireIntegerId(mapId)
      const fogBitmap = bitmaps?.fogBitmap == null ? null : String(bitmaps.fogBitmap)
      const exploredBitmap = bitmaps?.exploredBitmap == null ? null : String(bitmaps.exploredBitmap)
      // Schema has PRIMARY KEY on map_id, so UPSERT is the natural
      // shape — matches the renderer's previous pattern.
      getDb()
        .prepare(
          `INSERT INTO fog_state (map_id, fog_bitmap, explored_bitmap)
           VALUES (?, ?, ?)
           ON CONFLICT(map_id) DO UPDATE SET
             fog_bitmap      = excluded.fog_bitmap,
             explored_bitmap = excluded.explored_bitmap`,
        )
        .run(mapId, fogBitmap, exploredBitmap)
    },
  )
}
