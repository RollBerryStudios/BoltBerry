import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { CREATE_TABLES_SQL, SEED_SCHEMA_VERSION, MIGRATE_V1_TO_V2, MIGRATE_V2_TO_V3, MIGRATE_V3_TO_V4, MIGRATE_V4_TO_V5, MIGRATE_V5_TO_V6, MIGRATE_V6_TO_V7, MIGRATE_V7_TO_V8, MIGRATE_V8_TO_V9, MIGRATE_V9_TO_V10, MIGRATE_V10_TO_V11, MIGRATE_V11_TO_V12, MIGRATE_V12_TO_V13, MIGRATE_V13_TO_V14, MIGRATE_V14_TO_V15, MIGRATE_V15_TO_V16 } from './schema'

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

  // WAL mode: dramatically better performance for concurrent reads + writes
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -64000') // 64 MB cache

  // Create tables
  db.exec(CREATE_TABLES_SQL)
  db.exec(SEED_SCHEMA_VERSION)

  // Run schema migrations
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined
  const version = row?.version ?? 1
  if (version < 2) db.exec(MIGRATE_V1_TO_V2)
  if (version < 3) db.exec(MIGRATE_V2_TO_V3)
  if (version < 4) db.exec(MIGRATE_V3_TO_V4)
  if (version < 5) db.exec(MIGRATE_V4_TO_V5)
  if (version < 6) db.exec(MIGRATE_V5_TO_V6)
  if (version < 7) db.exec(MIGRATE_V6_TO_V7)
  if (version < 8) db.exec(MIGRATE_V7_TO_V8)
  if (version < 9) db.exec(MIGRATE_V8_TO_V9)
  if (version < 10) db.exec(MIGRATE_V9_TO_V10)
  if (version < 11) db.exec(MIGRATE_V10_TO_V11)
  if (version < 12) db.exec(MIGRATE_V11_TO_V12)
  if (version < 13) db.exec(MIGRATE_V12_TO_V13)
  if (version < 14) db.exec(MIGRATE_V13_TO_V14)
  if (version < 15) db.exec(MIGRATE_V14_TO_V15)
  if (version < 16) db.exec(MIGRATE_V15_TO_V16)

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
