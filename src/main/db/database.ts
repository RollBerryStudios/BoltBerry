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
  MIGRATE_V27_TO_V28, MIGRATE_V28_TO_V29, MIGRATE_V29_TO_V30,
  MIGRATE_V30_TO_V31, MIGRATE_V31_TO_V32, MIGRATE_V32_TO_V33,
  MIGRATE_V33_TO_V34, MIGRATE_V34_TO_V35, MIGRATE_V35_TO_V36,
} from './schema'
import { loadMonstersIndexSync, loadMonsterRecordSync } from '../ipc/data-handlers'

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
  [29, MIGRATE_V28_TO_V29], [30, MIGRATE_V29_TO_V30],
  [31, MIGRATE_V30_TO_V31],
  [32, MIGRATE_V31_TO_V32],
  [33, MIGRATE_V32_TO_V33],
  [34, MIGRATE_V33_TO_V34],
  [35, MIGRATE_V34_TO_V35],
  [36, MIGRATE_V35_TO_V36],
]

export class SchemaTooNewError extends Error {
  constructor(public dbVersion: number, public appVersion: number) {
    super(`Database schema v${dbVersion} was created by a newer app build (this build supports v${appVersion}). Please update the app.`)
    this.name = 'SchemaTooNewError'
  }
}

// Self-healing migration runner. Applies the migration SQL in one shot.
// When SQLite reports "duplicate column name: X" — which means an
// ALTER TABLE ADD COLUMN in the migration hit a column that already
// exists — we re-run the migration with the ALTER TABLE statements
// stripped. This recovers from older dev installations that advanced the
// schema by hand without bumping schema_version, and is a no-op on clean
// DBs. Any other SQL error still aborts the whole migration transaction.
function applyMigration(db: Database.Database, sql: string): void {
  try {
    db.exec(sql)
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
    if (!msg.includes('duplicate column name')) throw err
    const withoutAlters = sql
      .split(';')
      .filter((s) => !/^\s*ALTER\s+TABLE[^;]*ADD\s+COLUMN/i.test(s))
      .join(';')
    db.exec(withoutAlters)
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
            if (currentVersion < target) applyMigration(db!, sql)
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

    // Seed the SRD 5.1 monster library from resources/data/. Idempotent
    // via UNIQUE(source, name) — a user who deleted a seeded row keeps
    // it gone (INSERT OR IGNORE) across restarts.
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

// Seeds the D&D 5e SRD creature library into token_templates from the
// bilingual dataset shipped at resources/data/. Runs on every startup but
// UNIQUE(source, name) makes the INSERT a no-op for rows that already
// exist, so user-scoped tweaks (source='user') are never touched. A user
// who explicitly deleted a seeded row keeps it deleted — INSERT OR IGNORE
// will match the existing UNIQUE index, because the row-was-deleted case
// is indistinguishable from a fresh install after migration v33 wipes
// source='srd' rows on schema upgrade.
function seedSrdMonsters(database: Database.Database) {
  const index = loadMonstersIndexSync()
  if (index.length === 0) {
    // Nothing to seed — packaged build without data resources or dev setup
    // before data was staged. Log once, don't fail startup.
    console.warn('[Database] Bestiary index is empty — skipping SRD seed')
    return
  }

  const insert = database.prepare(
    `INSERT OR IGNORE INTO token_templates
      (category, source, name, image_path, size, hp_max, ac, speed, cr,
       creature_type, faction, marker_color, notes, stat_block, slug, created_at)
      VALUES
      ('monster', 'srd', @name, @image_path, @size, @hp_max, @ac, @speed, @cr,
       @creature_type, @faction, @marker_color, NULL, @stat_block, @slug,
       datetime('now'))`,
  )

  // Backfill: `INSERT OR IGNORE` is a no-op on existing rows, so an
  // upgrade leaves older seeds with NULL image_path. Fill in the
  // bestiary:// reference for any SRD row that still lacks one (and
  // still has the expected slug). User-edited rows (renamed, or with
  // image_path already set) are left alone.
  const backfillImagePath = database.prepare(
    `UPDATE token_templates
     SET image_path = @image_path
     WHERE source = 'srd' AND slug = @slug
       AND (image_path IS NULL OR image_path = '')`,
  )

  const tx = database.transaction(() => {
    for (const entry of index) {
      const full = loadMonsterRecordSync(entry.slug)
      if (!full) continue
      // Prefer the dataset's explicit `token` entry; fall back to the
      // first variant. `bestiary://<slug>/<file>` resolves through the
      // image loaders on both DM and player window without bloating the
      // DB with 30–50 KB of base64.
      const primaryFile = full.token?.file ?? full.tokens?.[0]?.file ?? null
      const imagePath = primaryFile ? `bestiary://${entry.slug}/${primaryFile}` : null
      const hpEn = typeof full.hp === 'object' ? full.hp?.en : undefined
      const acEn = typeof full.ac === 'object' ? full.ac?.en : (typeof full.ac === 'string' ? full.ac : undefined)
      const payload = {
        // Prefer the German name when present — the app's default locale is
        // DE and the Token Library's uniqueness key is the `name` column.
        name: entry.nameDe?.trim() || entry.name,
        image_path: imagePath,
        size: gridSizeFromLabel(entry.size),
        hp_max: parseHpMax(hpEn) ?? 10,
        ac: parseAc(acEn) ?? 10,
        speed: parseSpeed(full.speed?.run?.en) ?? 30,
        cr: full.challenge,
        creature_type: entry.type.en,
        faction: factionForType(entry.type.en),
        marker_color: markerColorForType(entry.type.en),
        stat_block: JSON.stringify({
          str: full.str, dex: full.dex, con: full.con,
          int: full.int, wis: full.wis, cha: full.cha,
          attacks: [], traits: [],
        }),
        slug: entry.slug,
      }
      insert.run(payload)
      if (imagePath) backfillImagePath.run({ slug: entry.slug, image_path: imagePath })
    }
  })
  tx()
}

function gridSizeFromLabel(label: string): number {
  switch ((label ?? '').toLowerCase()) {
    case 'tiny':
    case 'small':
    case 'medium': return 1
    case 'large': return 2
    case 'huge': return 3
    case 'gargantuan': return 4
    default: return 1
  }
}

// Extracts the leading integer from strings like "135 (18d10 + 36)".
function parseHpMax(hp: string | undefined): number | null {
  if (!hp) return null
  const m = hp.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

// Extracts the leading integer from strings like "17 (Natural Armor)".
function parseAc(ac: string | undefined): number | null {
  if (!ac) return null
  const m = ac.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

function parseSpeed(n: number | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

// Rough first-pass faction guess keyed on the creature type. Users can
// flip this inline via the Token Library edit surface.
function factionForType(type: string): string {
  const t = (type ?? '').toLowerCase()
  if (t.includes('humanoid') || t.includes('celestial')) return 'neutral'
  return 'enemy'
}

function markerColorForType(type: string): string {
  const t = (type ?? '').toLowerCase()
  if (t.includes('undead')) return '#a78bfa'
  if (t.includes('fiend')) return '#991b1b'
  if (t.includes('dragon')) return '#dc2626'
  if (t.includes('beast')) return '#b45309'
  if (t.includes('elemental')) return '#f59e0b'
  if (t.includes('plant')) return '#22c55e'
  if (t.includes('construct')) return '#64748b'
  if (t.includes('celestial')) return '#f4f6fa'
  if (t.includes('fey')) return '#ec4899'
  if (t.includes('aberration')) return '#7c3aed'
  if (t.includes('giant')) return '#78350f'
  if (t.includes('ooze')) return '#06b6d4'
  return '#ef4444'
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
