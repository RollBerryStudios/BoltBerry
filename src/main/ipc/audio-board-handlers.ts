import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import type {
  AudioBoardRecord,
  AudioBoardSlot,
  AudioChannelKey,
  ChannelPlaylistEntry,
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
}

function toAudioBoardSlot(r: SlotRow): AudioBoardSlot {
  return {
    slotNumber: r.slot_number,
    emoji: r.emoji ?? '🔊',
    title: r.title ?? '',
    audioPath: r.audio_path,
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
          `SELECT id, board_id, slot_number, emoji, title, audio_path
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
      getDb()
        .prepare(
          `INSERT INTO audio_board_slots (board_id, slot_number, emoji, title, audio_path)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(board_id, slot_number) DO UPDATE SET
             emoji      = excluded.emoji,
             title      = excluded.title,
             audio_path = excluded.audio_path`,
        )
        .run(bId, slotNumber, emoji, title, audioPath)
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

  // ── channel_playlist ──

  ipcMain.handle(
    IPC.CHANNEL_PLAYLIST_LIST_BY_CAMPAIGN,
    (_event, campaignId: number): ChannelPlaylistEntry[] => {
      requireIntegerId(campaignId, 'campaign')
      const rows = getDb()
        .prepare(
          `SELECT id, channel, path, file_name FROM channel_playlist
           WHERE campaign_id = ? ORDER BY channel, position, id`,
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
      const safeName = typeof fileName === 'string' && fileName ? fileName : safePath
      const pos = Number.isInteger(position) ? position : 0
      const row = getDb()
        .prepare(
          `INSERT INTO channel_playlist (campaign_id, channel, path, file_name, position)
           VALUES (?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(campaignId, channel, safePath, safeName, pos) as { id: number }
      return { id: row.id }
    },
  )

  ipcMain.handle(IPC.CHANNEL_PLAYLIST_REMOVE, (_event, id: number): void => {
    const entryId = requireIntegerId(id, 'playlist entry')
    getDb().prepare('DELETE FROM channel_playlist WHERE id = ?').run(entryId)
  })
}
