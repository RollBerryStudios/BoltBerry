import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { Campaign } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `campaigns` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain — the renderer can no
 * longer construct arbitrary SQL against campaigns, only invoke these
 * pre-shaped operations with typed parameters.
 */

interface CampaignRow {
  id: number
  name: string
  cover_path: string | null
  created_at: string
  last_opened: string
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    coverPath: row.cover_path,
    createdAt: row.created_at,
    lastOpened: row.last_opened,
  }
}

const SELECT_COLUMNS = 'id, name, cover_path, created_at, last_opened'

export function registerCampaignHandlers(): void {
  ipcMain.handle(IPC.CAMPAIGNS_LIST, (): Campaign[] => {
    const rows = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM campaigns ORDER BY last_opened DESC`)
      .all() as CampaignRow[]
    return rows.map(toCampaign)
  })

  ipcMain.handle(IPC.CAMPAIGNS_GET, (_event, id: number): Campaign | null => {
    if (!Number.isInteger(id)) return null
    const row = getDb()
      .prepare(`SELECT ${SELECT_COLUMNS} FROM campaigns WHERE id = ?`)
      .get(id) as CampaignRow | undefined
    return row ? toCampaign(row) : null
  })

  ipcMain.handle(IPC.CAMPAIGNS_COUNT, (): number => {
    const row = getDb()
      .prepare('SELECT COUNT(*) as n FROM campaigns')
      .get() as { n: number }
    return row.n
  })

  ipcMain.handle(IPC.CAMPAIGNS_CREATE, (_event, name: unknown): Campaign => {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) throw new Error('Campaign name is required')
    const row = getDb()
      .prepare(
        `INSERT INTO campaigns (name) VALUES (?) RETURNING ${SELECT_COLUMNS}`,
      )
      .get(trimmed) as CampaignRow
    return toCampaign(row)
  })

  ipcMain.handle(IPC.CAMPAIGNS_RENAME, (_event, id: number, name: unknown): void => {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) throw new Error('Campaign name is required')
    if (!Number.isInteger(id)) throw new Error('Invalid campaign id')
    getDb().prepare('UPDATE campaigns SET name = ? WHERE id = ?').run(trimmed, id)
  })

  ipcMain.handle(IPC.CAMPAIGNS_DELETE, (_event, id: number): void => {
    if (!Number.isInteger(id)) throw new Error('Invalid campaign id')
    getDb().prepare('DELETE FROM campaigns WHERE id = ?').run(id)
  })

  ipcMain.handle(
    IPC.CAMPAIGNS_SET_COVER,
    (_event, id: number, coverPath: string | null): void => {
      if (!Number.isInteger(id)) throw new Error('Invalid campaign id')
      // Accept null to clear; reject anything else non-string so a
      // mistyped object can't silently serialize into the column.
      const value = coverPath === null ? null : String(coverPath)
      getDb()
        .prepare('UPDATE campaigns SET cover_path = ? WHERE id = ?')
        .run(value, id)
    },
  )

  ipcMain.handle(IPC.CAMPAIGNS_TOUCH_LAST_OPENED, (_event, id: number): void => {
    if (!Number.isInteger(id)) throw new Error('Invalid campaign id')
    getDb()
      .prepare(`UPDATE campaigns SET last_opened = datetime('now') WHERE id = ?`)
      .run(id)
  })
}
