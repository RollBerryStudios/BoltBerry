import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { CREATE_TABLES_SQL, SEED_SCHEMA_VERSION, MIGRATE_V1_TO_V2, MIGRATE_V2_TO_V3, MIGRATE_V3_TO_V4, MIGRATE_V4_TO_V5, MIGRATE_V5_TO_V6, MIGRATE_V6_TO_V7, MIGRATE_V7_TO_V8, MIGRATE_V8_TO_V9, MIGRATE_V9_TO_V10, MIGRATE_V10_TO_V11, MIGRATE_V11_TO_V12, MIGRATE_V12_TO_V13, MIGRATE_V13_TO_V14, MIGRATE_V14_TO_V15, MIGRATE_V15_TO_V16, MIGRATE_V16_TO_V17, MIGRATE_V17_TO_V18, MIGRATE_V18_TO_V19, MIGRATE_V19_TO_V20 } from './schema'

let db: Database.Database | null = null

let customUserDataPath: string | null = null

export function setCustomUserDataPath(path: string) {
  customUserDataPath = path
}

export function getCustomUserDataPath(): string | null {
  return customUserDataPath
}

export function initDatabase(): Database.Database {
  const userDataPath = customUserDataPath || app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'rollberry.db')

  db = new Database(dbPath, {
    // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  })

  try {
    // WAL mode: dramatically better performance for concurrent reads + writes
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL')
    db.pragma('cache_size = -64000') // 64 MB cache

    // Create tables (idempotent — IF NOT EXISTS)
    db.exec(CREATE_TABLES_SQL)

    // Fix legacy schema_version tables that may have no PK (pre-v17 databases).
    // If the table has rows but no id column, migrate it to the new structure.
    try {
      const hasId = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('schema_version') WHERE name='id'").get() as { c: number }
      if (hasId.c === 0) {
        // Old table structure — get the max version, recreate the table, re-seed
        const oldRow = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
        const oldVersion = oldRow?.v ?? 1
        db.exec(`
          DROP TABLE schema_version;
          CREATE TABLE schema_version (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL
          );
        `)
        db.prepare('INSERT INTO schema_version (id, version) VALUES (1, ?)').run(oldVersion)
      }
    } catch {
      // Table didn't exist yet — SEED_SCHEMA_VERSION below will create it via CREATE_TABLES_SQL
    }

    // Seed only if no row exists (new database)
    db.exec(SEED_SCHEMA_VERSION)

    // Run schema migrations — each wrapped in a transaction for atomicity
    const migrate = (sql: string) => db!.transaction(() => db!.exec(sql))()
    const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined
    const version = row?.version ?? 1
    if (version < 2)  migrate(MIGRATE_V1_TO_V2)
    if (version < 3)  migrate(MIGRATE_V2_TO_V3)
    if (version < 4)  migrate(MIGRATE_V3_TO_V4)
    if (version < 5)  migrate(MIGRATE_V4_TO_V5)
    if (version < 6)  migrate(MIGRATE_V5_TO_V6)
    if (version < 7)  migrate(MIGRATE_V6_TO_V7)
    if (version < 8)  migrate(MIGRATE_V7_TO_V8)
    if (version < 9)  migrate(MIGRATE_V8_TO_V9)
    if (version < 10) migrate(MIGRATE_V9_TO_V10)
    if (version < 11) migrate(MIGRATE_V10_TO_V11)
    if (version < 12) migrate(MIGRATE_V11_TO_V12)
    if (version < 13) migrate(MIGRATE_V12_TO_V13)
    if (version < 14) migrate(MIGRATE_V13_TO_V14)
    if (version < 15) migrate(MIGRATE_V14_TO_V15)
    if (version < 16) migrate(MIGRATE_V15_TO_V16)
    if (version < 17) migrate(MIGRATE_V16_TO_V17)
    if (version < 18) migrate(MIGRATE_V17_TO_V18)
    if (version < 19) migrate(MIGRATE_V18_TO_V19)
    if (version < 20) migrate(MIGRATE_V19_TO_V20)
  } catch (err) {
    db.close()
    db = null
    throw err
  }

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
