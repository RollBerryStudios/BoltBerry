import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MonsterIndexEntry, MonsterRecord } from '../../shared/ipc-types'

/**
 * Bestiary data-root helpers, extracted from `ipc/data-handlers.ts`
 * to break the circular dep with `db/database.ts`.
 *
 *   before:  database.ts ──▶ ipc/data-handlers.ts ──▶ db/database.ts
 *   after:   database.ts ──▶ data/monsters.ts ◀── ipc/data-handlers.ts
 *
 * Both the DB seeder (needs the monster list on boot) and the
 * Bestiarium IPC handlers (expose the library to the renderer) share
 * one on-disk source of truth.
 */

/** Kebab-case slug pattern used to validate on-disk monster folder
 *  names. Shared with data-handlers so the Bestiarium IPC surface
 *  rejects identical traversal attempts. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** `<resources>/data/` in production (shipped via electron-builder's
 *  extraResources), `<repo>/resources/data/` in development. */
export function getDataRoot(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, 'data')
}

export function loadMonstersIndexSync(): MonsterIndexEntry[] {
  try {
    const full = join(getDataRoot(), 'index.json')
    if (!existsSync(full)) return []
    const parsed = JSON.parse(readFileSync(full, 'utf-8')) as { monsters?: MonsterIndexEntry[] }
    return parsed.monsters ?? []
  } catch {
    return []
  }
}

export function loadMonsterRecordSync(slug: string): MonsterRecord | null {
  if (!SLUG_RE.test(slug)) return null
  try {
    const full = join(getDataRoot(), 'monsters', slug, 'monster.json')
    if (!existsSync(full)) return null
    return JSON.parse(readFileSync(full, 'utf-8')) as MonsterRecord
  } catch {
    return null
  }
}
