import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type {
  AudioBoardRecord,
  AudioBoardSlot,
  AudioChannelKey,
  ChannelPlaylistEntry,
  TrackRecord,
} from '../../shared/ipc-types'
import { getDb } from '../db/database'

/**
 * Semantic IPC channels for `audio_boards` + `audio_board_slots`.
 * Lists hydrate each board with its slots in one round-trip (the
 * renderer's old pattern was N+1 — SELECT boards, then per-board
 * SELECT slots — which scaled badly with campaign size).
 */

interface BoardRow {
  id: number
  campaign_id: number
  name: string
  sort_order: number
}

interface SlotRow {
  id: number
  board_id: number
  slot_number: number
  emoji: string | null
  title: string | null
  audio_path: string | null
  icon_path: string | null
  volume: number | null
  is_loop: number | null
}

function toAudioBoardSlot(r: SlotRow): AudioBoardSlot {
  return {
    slotNumber: r.slot_number,
    emoji: r.emoji ?? '🔊',
    title: r.title ?? '',
    audioPath: r.audio_path,
    iconPath: r.icon_path,
    volume: typeof r.volume === 'number' ? r.volume : 1,
    isLoop: r.is_loop === 1,
  }
}

function requireIntegerId(id: unknown, label: string): number {
  if (!Number.isInteger(id)) throw new Error(`Invalid ${label} id`)
  return id as number
}

function requireSlotNumber(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 9) {
    throw new Error('slot_number must be between 0 and 9')
  }
  return v as number
}

export function registerAudioBoardHandlers(): void {
  ipcMain.handle(
    IPC.AUDIO_BOARDS_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): AudioBoardRecord[] => {
      requireIntegerId(campaignId, 'campaign')
      const db = getDb()
      const boards = db
        .prepare(
          'SELECT id, campaign_id, name, sort_order FROM audio_boards WHERE campaign_id = ? ORDER BY sort_order',
        )
        .all(campaignId) as BoardRow[]
      if (boards.length === 0) return []
      // One slot query for all boards, then group. Avoids N+1.
      const placeholders = boards.map(() => '?').join(',')
      const slotRows = db
        .prepare(
          `SELECT id, board_id, slot_number, emoji, title, audio_path,
                  icon_path, volume, is_loop
           FROM audio_board_slots WHERE board_id IN (${placeholders})
           ORDER BY slot_number`,
        )
        .all(...boards.map((b) => b.id)) as SlotRow[]
      const slotsByBoard = new Map<number, AudioBoardSlot[]>()
      for (const s of slotRows) {
        const list = slotsByBoard.get(s.board_id) ?? []
        list.push(toAudioBoardSlot(s))
        slotsByBoard.set(s.board_id, list)
      }
      return boards.map((b) => ({
        id: b.id,
        campaignId: b.campaign_id,
        name: b.name,
        sortOrder: b.sort_order,
        slots: slotsByBoard.get(b.id) ?? [],
      }))
    },
  )

  ipcMain.handle(
    IPC.AUDIO_BOARDS_CREATE,
    (
      _event,
      campaignId: number,
      name: string,
      sortOrder: number,
    ): AudioBoardRecord => {
      requireIntegerId(campaignId, 'campaign')
      const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'Board'
      const order = Number.isInteger(sortOrder) ? sortOrder : 0
      const row = getDb()
        .prepare(
          `INSERT INTO audio_boards (campaign_id, name, sort_order) VALUES (?, ?, ?)
           RETURNING id, campaign_id, name, sort_order`,
        )
        .get(campaignId, safeName, order) as BoardRow
      return {
        id: row.id,
        campaignId: row.campaign_id,
        name: row.name,
        sortOrder: row.sort_order,
        slots: [],
      }
    },
  )

  ipcMain.handle(IPC.AUDIO_BOARDS_RENAME, (_event, id: number, name: string): void => {
    const boardId = requireIntegerId(id, 'board')
    const safeName = typeof name === 'string' ? name : ''
    getDb().prepare('UPDATE audio_boards SET name = ? WHERE id = ?').run(safeName, boardId)
  })

  ipcMain.handle(IPC.AUDIO_BOARDS_DELETE, (_event, id: number): void => {
    const boardId = requireIntegerId(id, 'board')
    // CASCADE on audio_board_slots.board_id handles the slot cleanup.
    getDb().prepare('DELETE FROM audio_boards WHERE id = ?').run(boardId)
  })

  ipcMain.handle(
    IPC.AUDIO_BOARDS_UPSERT_SLOT,
    (_event, boardId: number, slot: AudioBoardSlot): void => {
      const bId = requireIntegerId(boardId, 'board')
      const slotNumber = requireSlotNumber(slot?.slotNumber)
      const emoji = slot.emoji == null ? null : String(slot.emoji)
      const title = slot.title == null ? null : String(slot.title)
      const audioPath = slot.audioPath == null ? null : String(slot.audioPath)
      const iconPath = slot.iconPath == null ? null : String(slot.iconPath)
      // Clamp volume to [0, 1] — the slider can't exceed it but a
      // malicious renderer could.
      const volume = typeof slot.volume === 'number' && Number.isFinite(slot.volume)
        ? Math.max(0, Math.min(1, slot.volume))
        : 1
      const isLoop = slot.isLoop ? 1 : 0
      getDb()
        .prepare(
          `INSERT INTO audio_board_slots
             (board_id, slot_number, emoji, title, audio_path, icon_path, volume, is_loop)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(board_id, slot_number) DO UPDATE SET
             emoji      = excluded.emoji,
             title      = excluded.title,
             audio_path = excluded.audio_path,
             icon_path  = excluded.icon_path,
             volume     = excluded.volume,
             is_loop    = excluded.is_loop`,
        )
        .run(bId, slotNumber, emoji, title, audioPath, iconPath, volume, isLoop)
    },
  )

  ipcMain.handle(
    IPC.AUDIO_BOARDS_DELETE_SLOT,
    (_event, boardId: number, slotNumber: number): void => {
      const bId = requireIntegerId(boardId, 'board')
      const n = requireSlotNumber(slotNumber)
      getDb()
        .prepare('DELETE FROM audio_board_slots WHERE board_id = ? AND slot_number = ?')
        .run(bId, n)
    },
  )

  // ── Legacy channel_playlist adapter ──
  //
  // The renderer's right-sidebar AudioPanel still calls these three
  // methods. v38 dropped the underlying `channel_playlist` table and
  // replaced it with `tracks` + `track_channel_assignments`. We
  // continue to expose the v37 IPC shape so the legacy `narrow` /
  // `wide-music` AudioPanel keeps working byte-identical until
  // Commit 2 ships the MusicLibraryPanel that uses the new
  // `tracks.*` IPC directly.
  //
  // The `id` returned from `add` and accepted by `remove` is now
  // `track_channel_assignments.id` — that lets the renderer treat
  // each channel-membership as the addressable unit it always
  // thought it was.

  ipcMain.handle(
    IPC.CHANNEL_PLAYLIST_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): ChannelPlaylistEntry[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT a.id AS id, a.channel, t.path, t.file_name
           FROM track_channel_assignments a
           JOIN tracks t ON t.id = a.track_id
           WHERE t.campaign_id = ?
           ORDER BY a.channel, a.position, a.id`,
        )
        .all(campaignId) as Array<{
          id: number
          channel: string
          path: string
          file_name: string
        }>
      return rows.map((r) => ({
        id: r.id,
        channel: r.channel as AudioChannelKey,
        path: r.path,
        fileName: r.file_name,
      }))
    },
  )

  ipcMain.handle(
    IPC.CHANNEL_PLAYLIST_ADD,
    (
      _event,
      campaignId: number,
      channel: AudioChannelKey,
      path: string,
      fileName: string,
      position: number,
    ): { id: number } => {
      requireIntegerId(campaignId, 'campaign')
      if (channel !== 'track1' && channel !== 'track2' && channel !== 'combat') {
        throw new Error('Invalid channel')
      }
      const safePath = typeof path === 'string' && path ? path : ''
      if (!safePath) throw new Error('Track path is required')
      const safeName = typeof fileName === 'string' && fileName ? fileName : safePath
      const pos = Number.isInteger(position) ? position : 0
      const db = getDb()
      // Two-step upsert: ensure a tracks row exists, then attach the
      // channel-assignment. INSERT OR IGNORE keeps the duplicate-import
      // case quiet — the existing track row simply stays.
      const insertOrIgnoreTrack = db.prepare(
        `INSERT OR IGNORE INTO tracks (campaign_id, path, file_name)
         VALUES (?, ?, ?)`,
      )
      const selectTrackId = db.prepare(
        `SELECT id FROM tracks WHERE campaign_id = ? AND path = ?`,
      )
      const insertOrIgnoreAssignment = db.prepare(
        `INSERT OR IGNORE INTO track_channel_assignments (track_id, channel, position)
         VALUES (?, ?, ?)`,
      )
      const selectAssignmentId = db.prepare(
        `SELECT id FROM track_channel_assignments
         WHERE track_id = ? AND channel = ?`,
      )
      const txn = db.transaction(() => {
        insertOrIgnoreTrack.run(campaignId, safePath, safeName)
        const trackRow = selectTrackId.get(campaignId, safePath) as { id: number }
        insertOrIgnoreAssignment.run(trackRow.id, channel, pos)
        const assignmentRow = selectAssignmentId.get(trackRow.id, channel) as { id: number }
        return assignmentRow.id
      })
      return { id: txn() }
    },
  )

  ipcMain.handle(IPC.CHANNEL_PLAYLIST_REMOVE, (_event, id: number): void => {
    const entryId = requireIntegerId(id, 'playlist entry')
    // Drop the channel-membership only; the underlying track row
    // stays in the library so the user doesn't lose imports just
    // because they removed it from one channel.
    getDb()
      .prepare('DELETE FROM track_channel_assignments WHERE id = ?')
      .run(entryId)
  })

  // ── Tracks domain (v38) ──

  ipcMain.handle(
    IPC.TRACKS_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): TrackRecord[] => {
      requireIntegerId(campaignId, 'campaign')
      const db = getDb()
      const trackRows = db
        .prepare(
          `SELECT id, campaign_id, path, file_name, soundtrack, duration_s
           FROM tracks WHERE campaign_id = ?
           ORDER BY soundtrack IS NULL, soundtrack, file_name`,
        )
        .all(campaignId) as Array<{
          id: number
          campaign_id: number
          path: string
          file_name: string
          soundtrack: string | null
          duration_s: number | null
        }>
      if (trackRows.length === 0) return []
      const placeholders = trackRows.map(() => '?').join(',')
      const assignmentRows = db
        .prepare(
          `SELECT track_id, channel FROM track_channel_assignments
           WHERE track_id IN (${placeholders})`,
        )
        .all(...trackRows.map((r) => r.id)) as Array<{ track_id: number; channel: AudioChannelKey }>
      const assignmentsByTrack = new Map<number, AudioChannelKey[]>()
      for (const a of assignmentRows) {
        const list = assignmentsByTrack.get(a.track_id) ?? []
        list.push(a.channel)
        assignmentsByTrack.set(a.track_id, list)
      }
      return trackRows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        path: r.path,
        fileName: r.file_name,
        soundtrack: r.soundtrack,
        durationS: r.duration_s,
        assignments: assignmentsByTrack.get(r.id) ?? [],
      }))
    },
  )

  ipcMain.handle(
    IPC.TRACKS_CREATE,
    (
      _event,
      args: { campaignId: number; path: string; fileName: string; soundtrack?: string | null },
    ): TrackRecord => {
      requireIntegerId(args?.campaignId, 'campaign')
      const path = typeof args.path === 'string' && args.path ? args.path : ''
      if (!path) throw new Error('Track path is required')
      const fileName = typeof args.fileName === 'string' && args.fileName ? args.fileName : path
      const soundtrack =
        typeof args.soundtrack === 'string' && args.soundtrack.trim()
          ? args.soundtrack.trim()
          : null
      const db = getDb()
      // INSERT OR IGNORE lets multi-import flows be naively safe; the
      // returned row is whichever row now exists.
      db.prepare(
        `INSERT OR IGNORE INTO tracks (campaign_id, path, file_name, soundtrack)
         VALUES (?, ?, ?, ?)`,
      ).run(args.campaignId, path, fileName, soundtrack)
      const row = db
        .prepare(
          `SELECT id, campaign_id, path, file_name, soundtrack, duration_s
           FROM tracks WHERE campaign_id = ? AND path = ?`,
        )
        .get(args.campaignId, path) as {
          id: number
          campaign_id: number
          path: string
          file_name: string
          soundtrack: string | null
          duration_s: number | null
        }
      return {
        id: row.id,
        campaignId: row.campaign_id,
        path: row.path,
        fileName: row.file_name,
        soundtrack: row.soundtrack,
        durationS: row.duration_s,
        assignments: [],
      }
    },
  )

  ipcMain.handle(
    IPC.TRACKS_UPDATE,
    (
      _event,
      id: number,
      patch: Partial<{ fileName: string; soundtrack: string | null; durationS: number | null }>,
    ): void => {
      const trackId = requireIntegerId(id, 'track')
      const sets: string[] = []
      const values: Array<string | number | null> = []
      if (patch.fileName !== undefined) {
        sets.push('file_name = ?')
        values.push(typeof patch.fileName === 'string' ? patch.fileName : '')
      }
      if (patch.soundtrack !== undefined) {
        sets.push('soundtrack = ?')
        values.push(
          typeof patch.soundtrack === 'string' && patch.soundtrack.trim()
            ? patch.soundtrack.trim()
            : null,
        )
      }
      if (patch.durationS !== undefined) {
        sets.push('duration_s = ?')
        values.push(
          typeof patch.durationS === 'number' && Number.isFinite(patch.durationS)
            ? patch.durationS
            : null,
        )
      }
      if (sets.length === 0) return
      values.push(trackId)
      getDb()
        .prepare(`UPDATE tracks SET ${sets.join(', ')} WHERE id = ?`)
        .run(...values)
    },
  )

  ipcMain.handle(IPC.TRACKS_DELETE, (_event, id: number): void => {
    const trackId = requireIntegerId(id, 'track')
    // Cascade drops every channel-assignment via the FK — no manual
    // cleanup needed.
    getDb().prepare('DELETE FROM tracks WHERE id = ?').run(trackId)
  })

  ipcMain.handle(
    IPC.TRACKS_TOGGLE_ASSIGNMENT,
    (
      _event,
      trackId: number,
      channel: AudioChannelKey,
    ): { assigned: boolean } => {
      const id = requireIntegerId(trackId, 'track')
      if (channel !== 'track1' && channel !== 'track2' && channel !== 'combat') {
        throw new Error('Invalid channel')
      }
      const db = getDb()
      const existing = db
        .prepare(
          `SELECT id FROM track_channel_assignments WHERE track_id = ? AND channel = ?`,
        )
        .get(id, channel) as { id: number } | undefined
      if (existing) {
        db.prepare('DELETE FROM track_channel_assignments WHERE id = ?').run(existing.id)
        return { assigned: false }
      }
      // Append at the end of the channel's order.
      const maxRow = db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) AS max_pos
           FROM track_channel_assignments WHERE channel = ?`,
        )
        .get(channel) as { max_pos: number }
      db.prepare(
        `INSERT INTO track_channel_assignments (track_id, channel, position)
         VALUES (?, ?, ?)`,
      ).run(id, channel, (maxRow.max_pos ?? -1) + 1)
      return { assigned: true }
    },
  )
}
