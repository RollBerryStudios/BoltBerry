import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import {
  SCHEMA_VERSION,
  CREATE_TABLES_SQL, CREATE_POST_MIGRATION_INDEXES_SQL, SEED_SCHEMA_VERSION,
  MIGRATE_V1_TO_V2, MIGRATE_V2_TO_V3, MIGRATE_V3_TO_V4, MIGRATE_V4_TO_V5,
  MIGRATE_V5_TO_V6, MIGRATE_V6_TO_V7, MIGRATE_V7_TO_V8, MIGRATE_V8_TO_V9,
  MIGRATE_V9_TO_V10, MIGRATE_V10_TO_V11, MIGRATE_V11_TO_V12, MIGRATE_V12_TO_V13,
  MIGRATE_V13_TO_V14, MIGRATE_V14_TO_V15, MIGRATE_V15_TO_V16, MIGRATE_V16_TO_V17,
  MIGRATE_V17_TO_V18, MIGRATE_V18_TO_V19, MIGRATE_V19_TO_V20, MIGRATE_V20_TO_V21,
  MIGRATE_V21_TO_V22, MIGRATE_V22_TO_V23, MIGRATE_V23_TO_V24,
  MIGRATE_V24_TO_V25,
} from './schema'

let db: Database.Database | null = null

let customUserDataPath: string | null = null

export function setCustomUserDataPath(path: string) {
  customUserDataPath = path
}

export function getCustomUserDataPath(): string | null {
  return customUserDataPath
}

const MIGRATIONS: ReadonlyArray<readonly [target: number, sql: string]> = [
  [2, MIGRATE_V1_TO_V2], [3, MIGRATE_V2_TO_V3], [4, MIGRATE_V3_TO_V4],
  [5, MIGRATE_V4_TO_V5], [6, MIGRATE_V5_TO_V6], [7, MIGRATE_V6_TO_V7],
  [8, MIGRATE_V7_TO_V8], [9, MIGRATE_V8_TO_V9], [10, MIGRATE_V9_TO_V10],
  [11, MIGRATE_V10_TO_V11], [12, MIGRATE_V11_TO_V12], [13, MIGRATE_V12_TO_V13],
  [14, MIGRATE_V13_TO_V14], [15, MIGRATE_V14_TO_V15], [16, MIGRATE_V15_TO_V16],
  [17, MIGRATE_V16_TO_V17], [18, MIGRATE_V17_TO_V18], [19, MIGRATE_V18_TO_V19],
  [20, MIGRATE_V19_TO_V20], [21, MIGRATE_V20_TO_V21], [22, MIGRATE_V21_TO_V22],
  [23, MIGRATE_V22_TO_V23], [24, MIGRATE_V23_TO_V24],
  [25, MIGRATE_V24_TO_V25],
]

export class SchemaTooNewError extends Error {
  constructor(public dbVersion: number, public appVersion: number) {
    super(`Database schema v${dbVersion} was created by a newer app build (this build supports v${appVersion}). Please update the app.`)
    this.name = 'SchemaTooNewError'
  }
}

export function initDatabase(): Database.Database {
  const userDataPath = customUserDataPath || app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'rollberry.db')

  db = new Database(dbPath, {})

  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL')
    db.pragma('cache_size = -64000') // 64 MB cache
    db.pragma('wal_autocheckpoint = 1000')

    db.exec(CREATE_TABLES_SQL)

    // Legacy schema_version tables (pre-v17) had no PK. Rebuild atomically.
    // Without the transaction, a crash between DROP and INSERT would leave an
    // empty schema_version table and re-run every migration on next launch.
    db.transaction(() => {
      const hasId = db!.prepare(
        "SELECT COUNT(*) as c FROM pragma_table_info('schema_version') WHERE name='id'",
      ).get() as { c: number } | undefined
      if (hasId && hasId.c === 0) {
        const oldRow = db!.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
        const oldVersion = oldRow?.v ?? 1
        db!.exec(`
          DROP TABLE schema_version;
          CREATE TABLE schema_version (
            id      INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL
          );
        `)
        db!.prepare('INSERT INTO schema_version (id, version) VALUES (1, ?)').run(oldVersion)
      }
    })()

    db.exec(SEED_SCHEMA_VERSION)

    const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined
    const currentVersion = row?.version ?? 1

    if (currentVersion > SCHEMA_VERSION) {
      throw new SchemaTooNewError(currentVersion, SCHEMA_VERSION)
    }

    if (currentVersion < SCHEMA_VERSION) {
      // Wrap the entire upgrade in one transaction. If any step fails, the DB
      // rolls back to the starting version instead of landing in a half-migrated
      // state that re-triggers the same failure on next launch.
      //
      // Table-rebuild migrations (v17, v23, v24) drop + rename tables; for those
      // we disable FK checks for the duration and re-verify integrity at the end.
      db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          for (const [target, sql] of MIGRATIONS) {
            if (currentVersion < target) db!.exec(sql)
          }
        })()

        const fkIssues = db.prepare('PRAGMA foreign_key_check').all() as Array<unknown>
        if (fkIssues.length > 0) {
          throw new Error(`Foreign-key check failed after migration: ${JSON.stringify(fkIssues)}`)
        }
      } finally {
        db.pragma('foreign_keys = ON')
      }
    }

    // Indexes that depend on columns added in later migrations must run
    // *after* migrations — otherwise opening a legacy DB blows up with
    // "no such column" before the migration gets a chance to add it.
    db.exec(CREATE_POST_MIGRATION_INDEXES_SQL)
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
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // Checkpoint is best-effort on close; proceed to close even if it fails.
    }
    db.close()
    db = null
  }
}
