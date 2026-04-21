import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { AssetEntry, AssetType } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `assets` table. Read-only from the
 * renderer — writes happen inside file-import handlers that also need
 * filesystem access.
 *
 * Scope: excludes `handout` rows, which have their own panel + IPC
 * surface. The AssetBrowser only handles map / token / atmosphere /
 * audio.
 */

interface AssetRow {
  id: number
  original_name: string
  stored_path: string
  type: string
}

function requireIntegerId(id: unknown, label = 'campaign'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

export function registerAssetHandlers(): void {
  ipcMain.handle(
    IPC.ASSETS_LIST_FOR_CAMPAIGN,
    (_event, campaignId: number): AssetEntry[] => {
      requireIntegerId(campaignId)
      // Include rows with NULL campaign_id (pre-v17 legacy) so an old
      // user install doesn't lose access to imports from before the
      // campaign scoping landed.
      const rows = getDb()
        .prepare(
          `SELECT id, original_name, stored_path, type FROM assets
           WHERE (campaign_id = ? OR campaign_id IS NULL) AND type != 'handout'
           ORDER BY id DESC`,
        )
        .all(campaignId) as AssetRow[]
      return rows.map((r) => ({
        id: r.id,
        originalName: r.original_name,
        storedPath: r.stored_path,
        type: r.type as AssetType,
      }))
    },
  )
}
