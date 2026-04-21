import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { SessionStatsEntry } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `sessions` table.
 *
 * Lifecycle: `start` opens a row with started_at = now(); `endOpen`
 * closes whichever row is still open for the campaign (UPDATE is a
 * no-op if none). The dashboard stats channel groups by campaign.
 */

function requireIntegerId(id: unknown, label = 'campaign'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

export function registerSessionHandlers(): void {
  ipcMain.handle(IPC.SESSIONS_START, (_event, campaignId: number): void => {
    requireIntegerId(campaignId)
    getDb().prepare('INSERT INTO sessions (campaign_id) VALUES (?)').run(campaignId)
  })

  ipcMain.handle(IPC.SESSIONS_END_OPEN, (_event, campaignId: number): void => {
    requireIntegerId(campaignId)
    getDb()
      .prepare(
        `UPDATE sessions SET ended_at = datetime('now')
         WHERE campaign_id = ? AND ended_at IS NULL`,
      )
      .run(campaignId)
  })

  ipcMain.handle(
    IPC.SESSIONS_STATS_BY_CAMPAIGNS,
    (_event, campaignIds: number[]): SessionStatsEntry[] => {
      if (!Array.isArray(campaignIds) || campaignIds.length === 0) return []
      const ids = campaignIds.filter((v): v is number => Number.isInteger(v))
      if (ids.length === 0) return []
      const placeholders = ids.map(() => '?').join(',')
      const rows = getDb()
        .prepare(
          `SELECT campaign_id, COUNT(*) as n, MAX(started_at) as last_at
           FROM sessions WHERE campaign_id IN (${placeholders}) GROUP BY campaign_id`,
        )
        .all(...ids) as Array<{ campaign_id: number; n: number; last_at: string | null }>
      return rows.map((r) => ({
        campaignId: r.campaign_id,
        count: r.n,
        lastAt: r.last_at,
      }))
    },
  )
}
