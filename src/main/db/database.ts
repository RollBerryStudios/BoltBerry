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
  MIGRATE_V24_TO_V25, MIGRATE_V25_TO_V26, MIGRATE_V26_TO_V27,
  MIGRATE_V27_TO_V28, MIGRATE_V28_TO_V29,
} from './schema'
import { SRD_MONSTERS } from './srd-monsters'

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
  [25, MIGRATE_V24_TO_V25], [26, MIGRATE_V25_TO_V26],
  [27, MIGRATE_V26_TO_V27], [28, MIGRATE_V27_TO_V28],
  [29, MIGRATE_V28_TO_V29],
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

    // Seed SRD monsters into token_templates. Idempotent via
    // UNIQUE(source, name) — a user who deleted a seeded row keeps it
    // gone (INSERT OR IGNORE), which is the right behavior.
    seedSrdMonsters(db)
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

// Seeds the D&D 5e SRD creature library into token_templates. Runs on every
// startup but UNIQUE(source, name) makes the INSERT a no-op for rows that
// already exist, so user-scoped tweaks (source='user') are never touched.
// A user who explicitly deleted a seeded row keeps it deleted — we don't
// re-insert because the WHERE clause on INSERT OR IGNORE matches by UNIQUE.
function seedSrdMonsters(database: Database.Database) {
  const insert = database.prepare(
    `INSERT OR IGNORE INTO token_templates
      (category, source, name, image_path, size, hp_max, ac, speed, cr,
       creature_type, faction, marker_color, notes, stat_block, slug, created_at)
      VALUES
      ('monster', 'srd', @name, NULL, @size, @hp_max, @ac, @speed, @cr,
       @creature_type, @faction, @marker_color, NULL, @stat_block, @slug,
       datetime('now'))`,
  )
  // Backfill slug for rows seeded before v26 (inserted as INSERT OR IGNORE
  // above is a no-op for them, but they're missing the new column). Only
  // touches rows where slug IS NULL so user edits (even renames) are safe.
  const backfill = database.prepare(
    `UPDATE token_templates
     SET slug = @slug
     WHERE source = 'srd' AND name = @name AND slug IS NULL`,
  )
  const tx = database.transaction((rows: typeof SRD_MONSTERS) => {
    for (const m of rows) {
      const payload = {
        name: m.name_de,
        size: m.size,
        hp_max: m.hp_max,
        ac: m.ac,
        speed: m.speed,
        cr: m.cr,
        creature_type: m.creature_type,
        faction: m.faction,
        marker_color: m.marker_color,
        stat_block: JSON.stringify(m.stat_block),
        slug: m.slug,
      }
      insert.run(payload)
      if (m.slug !== null) backfill.run({ name: m.name_de, slug: m.slug })
    }
  })
  tx(SRD_MONSTERS)
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
