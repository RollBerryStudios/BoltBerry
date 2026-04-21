import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import { getDb } from '../db/database'
import type Database from 'better-sqlite3'

/**
 * Legacy generic SQL tunnel. Being retired in favour of domain-scoped
 * IPC handlers (`campaign-handlers.ts`, `map-handlers.ts`,
 * `token-handlers.ts`, `initiative-handlers.ts`, …). New code should
 * NOT add call sites; extend the appropriate domain handler instead.
 *
 * Security while this handler is still live: allowlist approach —
 * only SELECT/INSERT/UPDATE/DELETE/WITH are permitted; multi-statement
 * SQL (`;`) is rejected; mutating statements must target a known table;
 * parameters are coerced to safe SQLite types.
 */

const ALLOWED_VERBS = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH'])

const ALLOWED_TABLES = new Set([
  'campaigns', 'maps', 'tokens', 'initiative', 'notes', 'handouts',
  'gm_pins', 'drawings', 'walls', 'rooms', 'encounters', 'assets',
  'character_sheets', 'audio_boards', 'audio_board_slots', 'fog_state',
  'schema_version', 'token_templates',
])

/**
 * Extract the first SQL keyword and, for mutating statements, the target table.
 * Rejects multi-statement SQL and anything outside the allowlist.
 */
function validateSql(sql: string): void {
  // Block multi-statement attacks
  if (sql.includes(';')) {
    throw new Error('SQL operation not allowed from renderer: multi-statement SQL is forbidden')
  }

  const trimmed = sql.trimStart()
  const firstWord = (trimmed.match(/^(\w+)/) ?? [])[1]?.toUpperCase()

  if (!firstWord || !ALLOWED_VERBS.has(firstWord)) {
    throw new Error(`SQL operation not allowed from renderer: verb "${firstWord ?? ''}" is not permitted`)
  }

  // For mutating statements, validate the target table name
  if (firstWord === 'INSERT' || firstWord === 'UPDATE' || firstWord === 'DELETE') {
    let tableName: string | undefined

    if (firstWord === 'INSERT') {
      // INSERT INTO <table>
      const m = trimmed.match(/^INSERT\s+INTO\s+(\w+)/i)
      tableName = m?.[1]
    } else if (firstWord === 'UPDATE') {
      // UPDATE <table>
      const m = trimmed.match(/^UPDATE\s+(\w+)/i)
      tableName = m?.[1]
    } else if (firstWord === 'DELETE') {
      // DELETE FROM <table>
      const m = trimmed.match(/^DELETE\s+FROM\s+(\w+)/i)
      tableName = m?.[1]
    }

    if (!tableName || !ALLOWED_TABLES.has(tableName.toLowerCase())) {
      throw new Error(`SQL operation not allowed from renderer: table "${tableName ?? ''}" is not in the allowlist`)
    }
  }
}

/**
 * Coerce parameters to safe SQLite-compatible types.
 * - booleans → 0/1 (SQLite has no boolean type)
 * - undefined → null
 */
function coerceParams(params: unknown[]): unknown[] {
  return params.map(p =>
    typeof p === 'boolean' ? Number(p) : p === undefined ? null : p
  )
}

// ─── Prepared-statement LRU cache ─────────────────────────────────────────────
const STMT_CACHE_MAX = 200
const stmtCache = new Map<string, Database.Statement>()

function getCachedStatement(db: Database.Database, sql: string): Database.Statement {
  let stmt = stmtCache.get(sql)
  if (stmt) {
    // Move to end (most recently used)
    stmtCache.delete(sql)
    stmtCache.set(sql, stmt)
    return stmt
  }

  stmt = db.prepare(sql)
  stmtCache.set(sql, stmt)

  // Evict oldest entry if over capacity
  if (stmtCache.size > STMT_CACHE_MAX) {
    const oldest = stmtCache.keys().next().value
    if (oldest !== undefined) {
      stmtCache.delete(oldest)
    }
  }

  return stmt
}

export function registerDbHandlers(): void {
  ipcMain.handle(IPC.DB_QUERY, (_event, sql: string, params: unknown[] = []) => {
    validateSql(sql)
    const db = getDb()
    const stmt = getCachedStatement(db, sql)
    return stmt.all(...coerceParams(params))
  })

  ipcMain.handle(IPC.DB_RUN, (_event, sql: string, params: unknown[] = []) => {
    validateSql(sql)
    const db = getDb()
    const stmt = getCachedStatement(db, sql)
    const result = stmt.run(...coerceParams(params))
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes,
    }
  })
}
