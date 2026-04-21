import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { NoteRecord } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `notes` table.
 *
 * The panel-level queries filter out pinned notes (those with non-null
 * `pin_x` / `pin_y`) because pinned notes are rendered as a separate
 * map-canvas layer. If/when that layer moves here, add a
 * `listPinnedByMap` channel.
 */

interface NoteRow {
  id: number
  campaign_id: number
  map_id: number | null
  category: string
  title: string
  content: string
  pin_x: number | null
  pin_y: number | null
  tags: string | null
  updated_at: string
}

function parseTags(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const clean = parsed.filter((v): v is string => typeof v === 'string')
      return clean.length > 0 ? clean : null
    }
  } catch {
    /* fall through */
  }
  return null
}

function toNoteRecord(r: NoteRow): NoteRecord {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    mapId: r.map_id,
    category: r.category,
    title: r.title,
    content: r.content,
    pinX: r.pin_x,
    pinY: r.pin_y,
    tags: parseTags(r.tags),
    updatedAt: r.updated_at,
  }
}

const SELECT_COLUMNS =
  'id, campaign_id, map_id, category, title, content, pin_x, pin_y, tags, updated_at'

const COLUMN_MAP: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  campaignId: { col: 'campaign_id', coerce: coerceInteger },
  mapId: { col: 'map_id', coerce: (v) => (v == null ? null : coerceInteger(v)) },
  category: { col: 'category', coerce: (v) => (v == null ? 'Allgemein' : String(v)) },
  title: { col: 'title', coerce: (v) => (v == null ? '' : String(v)) },
  content: { col: 'content', coerce: (v) => (v == null ? '' : String(v)) },
  pinX: { col: 'pin_x', coerce: (v) => (v == null ? null : coerceFiniteNumber(v)) },
  pinY: { col: 'pin_y', coerce: (v) => (v == null ? null : coerceFiniteNumber(v)) },
  tags: {
    col: 'tags',
    coerce: (v) => {
      if (v == null) return null
      if (!Array.isArray(v)) throw new Error('tags must be an array of strings')
      const clean = v.filter((s): s is string => typeof s === 'string')
      return clean.length > 0 ? JSON.stringify(clean) : null
    },
  },
}

function coerceInteger(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  throw new Error('Expected integer')
}

function coerceFiniteNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  throw new Error('Expected finite number')
}

function requireIntegerId(id: unknown, label = 'note'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function buildFragments(patch: Record<string, unknown>): {
  cols: string[]
  vals: unknown[]
} {
  const cols: string[] = []
  const vals: unknown[] = []
  for (const [key, value] of Object.entries(patch)) {
    const mapping = COLUMN_MAP[key]
    if (!mapping) continue
    cols.push(mapping.col)
    vals.push(mapping.coerce(value))
  }
  return { cols, vals }
}

export function registerNoteHandlers(): void {
  ipcMain.handle(
    IPC.NOTES_LIST_CATEGORY_BY_CAMPAIGN,
    (_event, campaignId: number): NoteRecord[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM notes
           WHERE campaign_id = ? AND map_id IS NULL
                 AND pin_x IS NULL AND pin_y IS NULL
           ORDER BY updated_at DESC`,
        )
        .all(campaignId) as NoteRow[]
      return rows.map(toNoteRecord)
    },
  )

  ipcMain.handle(
    IPC.NOTES_LIST_CATEGORY_BY_MAP,
    (_event, campaignId: number, mapId: number): NoteRecord[] => {
      requireIntegerId(campaignId, 'campaign')
      requireIntegerId(mapId, 'map')
      const rows = getDb()
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM notes
           WHERE campaign_id = ? AND map_id = ?
                 AND pin_x IS NULL AND pin_y IS NULL
           ORDER BY updated_at DESC`,
        )
        .all(campaignId, mapId) as NoteRow[]
      return rows.map(toNoteRecord)
    },
  )

  ipcMain.handle(
    IPC.NOTES_CREATE,
    (_event, patch: Record<string, unknown>): NoteRecord => {
      if (!patch || typeof patch !== 'object') throw new Error('Invalid patch')
      const { cols, vals } = buildFragments(patch)
      if (!cols.includes('campaign_id')) throw new Error('campaignId is required')
      // updated_at always reflects the write; default to now().
      cols.push('updated_at')
      vals.push(new Date().toISOString())
      const placeholders = cols.map(() => '?').join(', ')
      const row = getDb()
        .prepare(
          `INSERT INTO notes (${cols.join(', ')}) VALUES (${placeholders})
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(...vals) as NoteRow
      return toNoteRecord(row)
    },
  )

  ipcMain.handle(
    IPC.NOTES_UPDATE,
    (_event, id: number, patch: Record<string, unknown>): void => {
      const noteId = requireIntegerId(id)
      if (!patch || typeof patch !== 'object') return
      const { cols, vals } = buildFragments(patch)
      if (cols.length === 0) return
      // Every write bumps updated_at so the "sort by recency" list
      // reflects the edit order. Avoids relying on the renderer to
      // remember to include it.
      cols.push('updated_at')
      vals.push(new Date().toISOString())
      const setClause = cols.map((c) => `${c} = ?`).join(', ')
      vals.push(noteId)
      getDb().prepare(`UPDATE notes SET ${setClause} WHERE id = ?`).run(...vals)
    },
  )

  ipcMain.handle(IPC.NOTES_DELETE, (_event, id: number): void => {
    const noteId = requireIntegerId(id)
    getDb().prepare('DELETE FROM notes WHERE id = ?').run(noteId)
  })
}
