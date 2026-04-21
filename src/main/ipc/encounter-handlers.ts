import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type { EncounterRecord } from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for the `encounters` table. Replaces the raw
 * `db:query` / `db:run` tunnel for this domain.
 */

interface EncounterRow {
  id: number
  campaign_id: number
  name: string
  template_data: string
  notes: string | null
  created_at: string
}

function toEncounterRecord(r: EncounterRow): EncounterRecord {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    name: r.name,
    templateData: r.template_data,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

const SELECT_COLUMNS = 'id, campaign_id, name, template_data, notes, created_at'

function requireIntegerId(id: unknown, label = 'encounter'): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function requireNonEmptyString(v: unknown, label: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${label} is required`)
  return v.trim()
}

function validateTemplateJson(v: unknown): string {
  // template_data is opaque JSON from the renderer — parse to verify
  // well-formedness so a malformed blob can't silently break every
  // future spawn that runs `JSON.parse(enc.templateData)`.
  if (typeof v !== 'string') throw new Error('templateData must be a JSON string')
  try {
    JSON.parse(v)
  } catch {
    throw new Error('templateData is not valid JSON')
  }
  return v
}

export function registerEncounterHandlers(): void {
  ipcMain.handle(
    IPC.ENCOUNTERS_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): EncounterRecord[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM encounters
           WHERE campaign_id = ? ORDER BY created_at DESC`,
        )
        .all(campaignId) as EncounterRow[]
      return rows.map(toEncounterRecord)
    },
  )

  ipcMain.handle(
    IPC.ENCOUNTERS_CREATE,
    (
      _event,
      patch: { campaignId: number; name: string; templateData: string; notes?: string | null },
    ): EncounterRecord => {
      if (!patch) throw new Error('Invalid patch')
      const campaignId = requireIntegerId(patch.campaignId, 'campaign')
      const name = requireNonEmptyString(patch.name, 'name')
      const templateData = validateTemplateJson(patch.templateData)
      const notes = patch.notes == null ? null : String(patch.notes)
      const row = getDb()
        .prepare(
          `INSERT INTO encounters (campaign_id, name, template_data, notes)
           VALUES (?, ?, ?, ?)
           RETURNING ${SELECT_COLUMNS}`,
        )
        .get(campaignId, name, templateData, notes) as EncounterRow
      return toEncounterRecord(row)
    },
  )

  ipcMain.handle(IPC.ENCOUNTERS_RENAME, (_event, id: number, name: unknown): void => {
    const encounterId = requireIntegerId(id)
    const trimmed = requireNonEmptyString(name, 'name')
    getDb().prepare('UPDATE encounters SET name = ? WHERE id = ?').run(trimmed, encounterId)
  })

  ipcMain.handle(IPC.ENCOUNTERS_DELETE, (_event, id: number): void => {
    const encounterId = requireIntegerId(id)
    getDb().prepare('DELETE FROM encounters WHERE id = ?').run(encounterId)
  })
}
