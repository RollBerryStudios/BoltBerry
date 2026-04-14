import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Exposes SQLite to the renderer via IPC.
 * The renderer never touches the DB directly (security + contextIsolation).
 */

const FORBIDDEN_SQL = /\b(DROP\s+TABLE|DROP\s+INDEX|ALTER\s+TABLE|TRUNCATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|CREATE\s+TABLE|CREATE\s+INDEX)\b/i

function validateSql(sql: string): void {
  if (FORBIDDEN_SQL.test(sql)) {
    throw new Error('SQL operation not allowed from renderer')
  }
}

export function registerDbHandlers(): void {
  ipcMain.handle(IPC.DB_QUERY, (_event, sql: string, params: unknown[] = []) => {
    validateSql(sql)
    const db = getDb()
    const stmt = db.prepare(sql)
    return stmt.all(...params)
  })

  ipcMain.handle(IPC.DB_RUN, (_event, sql: string, params: unknown[] = []) => {
    validateSql(sql)
    const db = getDb()
    const stmt = db.prepare(sql)
    const result = stmt.run(...params)
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes,
    }
  })

  ipcMain.handle(IPC.DB_RUN_BATCH, (_event, statements: Array<{ sql: string; params?: unknown[] }>) => {
    const db = getDb()
    const txn = db.transaction(() => {
      for (const { sql, params = [] } of statements) {
        validateSql(sql)
        db.prepare(sql).run(...params)
      }
    })
    txn()
    return true
  })
}
