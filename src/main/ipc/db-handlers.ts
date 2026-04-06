import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Exposes SQLite to the renderer via IPC.
 * The renderer never touches the DB directly (security + contextIsolation).
 */
export function registerDbHandlers(): void {
  ipcMain.handle(IPC.DB_QUERY, (_event, sql: string, params: unknown[] = []) => {
    const db = getDb()
    const stmt = db.prepare(sql)
    return stmt.all(...params)
  })

  ipcMain.handle(IPC.DB_RUN, (_event, sql: string, params: unknown[] = []) => {
    const db = getDb()
    const stmt = db.prepare(sql)
    const result = stmt.run(...params)
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes,
    }
  })
}
