import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { HandoutRecord } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `handouts` table.
 */

interface HandoutRow {
  id: number
  campaign_id: number
  title: string
  image_path: string | null
  text_content: string | null
  created_at: string
}

function toHandoutRecord(r: HandoutRow): HandoutRecord {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    title: r.title,
    imagePath: r.image_path,
    textContent: r.text_content,
    createdAt: r.created_at,
  }
}

const SELECT_COLUMNS = 'id, campaign_id, title, image_path, text_content, created_at'

function requireIntegerId(id: unknown, label = 'handout'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

export function registerHandoutHandlers(): void {
  ipcMain.handle(
    IPC.HANDOUTS_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): HandoutRecord[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM handouts
           WHERE campaign_id = ? ORDER BY created_at DESC`,
        )
        .all(campaignId) as HandoutRow[]
      return rows.map(toHandoutRecord)
    },
  )

  ipcMain.handle(
    IPC.HANDOUTS_COUNT_BY_CAMPAIGNS,
    (_event, campaignIds: number[]): Array<{ campaignId: number; count: number }> => {
      if (!Array.isArray(campaignIds) || campaignIds.length === 0) return []
      const ids = campaignIds.filter((v): v is number => Number.isInteger(v))
      if (ids.length === 0) return []
      const placeholders = ids.map(() => '?').join(',')
      const rows = getDb()
        .prepare(
          `SELECT campaign_id, COUNT(*) as n FROM handouts
           WHERE campaign_id IN (${placeholders}) GROUP BY campaign_id`,
        )
        .all(...ids) as Array<{ campaign_id: number; n: number }>
      return rows.map((r) => ({ campaignId: r.campaign_id, count: r.n }))
    },
  )

  ipcMain.handle(
    IPC.HANDOUTS_CREATE,
    (
      _event,
      patch: { campaignId: number; title: string; imagePath: string | null; textContent: string | null },
    ): HandoutRecord => {
      if (!patch) throw new Error('Invalid patch')
      const campaignId = requireIntegerId(patch.campaignId, 'campaign')
      const title = typeof patch.title === 'string' && patch.title.trim()
        ? patch.title.trim()
        : 'Handout'
      const imagePath = patch.imagePath == null ? null : String(patch.imagePath)
      const textContent = patch.textContent == null ? null : String(patch.textContent)
      const row = getDb()
        .prepare(
          `INSERT INTO handouts (campaign_id, title, image_path, text_content)
           VALUES (?, ?, ?, ?)
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(campaignId, title, imagePath, textContent) as HandoutRow
      return toHandoutRecord(row)
    },
  )

  ipcMain.handle(IPC.HANDOUTS_DELETE, (_event, id: number): void => {
    const handoutId = requireIntegerId(id)
    getDb().prepare('DELETE FROM handouts WHERE id = ?').run(handoutId)
  })
}
