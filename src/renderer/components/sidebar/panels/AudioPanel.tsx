import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAudioStore, type ChannelId, type AudioBoard, type AudioBoardSlot, type PlaylistEntry } from '../../../stores/audioStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: number): string {
  if (!s || !isFinite(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// ─── Channel strip ────────────────────────────────────────────────────────────

const VOLUME_COL: Record<ChannelId, string> = {
  track1: 'track1_volume',
  track2: 'track2_volume',
  combat: 'combat_volume',
}

function ChannelStrip({ chId, label, activeMapId, activeCampaignId, combatControl }: {
  chId: ChannelId
  label: string
  activeMapId: number | null
  activeCampaignId: number | null
  /** Rendered on the 'combat' strip only — integrates the combat-mode
   *  enable/disable toggle into the Kampf card instead of floating it
   *  between other tracks. */
  combatControl?: { active: boolean; onToggle: () => void }
}) {
  const { t } = useTranslation()
  const store = useAudioStore()
  const ch = store[chId]
  const combatActive = useAudioStore((s) => s.combatActive)
  const [showPlaylist, setShowPlaylist] = useState(false)
  // 'down' = dropdown hangs below the track button (default); 'up' =
  // flipped above because the below-variant would overflow the viewport.
  // Mirrors the token context menu's clamp pattern — in tight sidebar
  // / popover layouts the playlist dropdown would otherwise be clipped.
  const [dropdownDir, setDropdownDir] = useState<'down' | 'up'>('down')
  const menuRef = useRef<HTMLDivElement>(null)
  const fileBtnRef = useRef<HTMLButtonElement>(null)

  const disabled = chId !== 'combat' && combatActive

  // Close the dropdown on outside click so nested context menus don't
  // pile up. Escape-to-close is handled in the key listener below.
  useEffect(() => {
    if (!showPlaylist) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      setShowPlaylist(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowPlaylist(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [showPlaylist])

  // Flip the dropdown above the track button when the default "below"
  // placement would overflow the viewport. Channels near the bottom of
  // the right sidebar or the compact audio popover would otherwise
  // clip the list; measuring post-mount and toggling a direction flag
  // is cheaper + more robust than a portal.
  useLayoutEffect(() => {
    if (!showPlaylist) { setDropdownDir('down'); return }
    const btn = fileBtnRef.current
    const menu = menuRef.current
    if (!btn || !menu) return
    const btnRect = btn.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const spaceBelow = window.innerHeight - btnRect.bottom
    const spaceAbove = btnRect.top
    // Only flip when below is truly too tight and above has more room
    // — prevents thrashing when both are fine.
    if (menuRect.height > spaceBelow - 8 && spaceAbove > spaceBelow) {
      setDropdownDir('up')
    } else {
      setDropdownDir('down')
    }
  }, [showPlaylist, ch.playlist.length])

  // Add a track to the channel's playlist. Persists to DB and updates
  // the store so the dropdown reflects the new entry immediately. Picks
  // the new track as active when the playlist was previously empty so
  // the ▶ button has something to play without requiring a second click.
  async function handleAddTrack() {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      const result = await window.electronAPI.importFile('audio')
      if (!result) return
      const fileName = result.path.split(/[\\/]/).pop() ?? result.path
      const position = ch.playlist.length
      const dbResult = await window.electronAPI.dbRun(
        `INSERT INTO channel_playlist (campaign_id, channel, path, file_name, position)
         VALUES (?, ?, ?, ?, ?)`,
        [activeCampaignId, chId, result.path, fileName, position],
      )
      const id = Number(dbResult?.lastInsertRowid ?? 0)
      if (!id) return
      const wasEmpty = ch.playlist.length === 0
      store.addPlaylistEntry(chId, { id, path: result.path, fileName }, wasEmpty)
      if (wasEmpty) store.loadChannel(chId, result.path)
    } catch (err) {
      console.error('[AudioPanel] addTrack failed:', err)
    }
  }

  // Activate a pre-assigned track. Also closes the dropdown so the DM
  // can ▶ immediately without a second click.
  function handleActivate(entry: PlaylistEntry) {
    store.loadChannel(chId, entry.path)
    setShowPlaylist(false)
  }

  async function handleRemoveTrack(entry: PlaylistEntry, evt: React.MouseEvent) {
    evt.stopPropagation()
    if (!window.electronAPI) return
    try {
      await window.electronAPI.dbRun(
        'DELETE FROM channel_playlist WHERE id = ?', [entry.id],
      )
      store.removePlaylistEntry(chId, entry.id)
    } catch (err) {
      console.error('[AudioPanel] removeTrack failed:', err)
    }
  }

  function handleChannelContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setShowPlaylist((v) => !v)
  }

  async function handleSetAmbient() {
    if (!activeMapId || !ch.filePath) return
    await window.electronAPI?.dbRun(
      'UPDATE maps SET ambient_track_path = ? WHERE id = ?',
      [ch.filePath, activeMapId]
    ).catch(console.error)
  }

  const classes = ['audio-channel', chId]
  if (disabled) classes.push('disabled')
  // Kampf channel gets a 'combat-mode-on' class when the combat toggle
  // is engaged — the CSS uses it to un-dim the file picker + controls.
  if (chId === 'combat' && combatActive) classes.push('combat-mode-on')
  const channelClass = classes.join(' ')

  return (
    <div className={channelClass} onContextMenu={handleChannelContextMenu}>
      <div className="audio-channel-head">
        <span className="audio-channel-label">{label}</span>
        {ch.playlist.length > 1 && (
          <span
            className="audio-channel-playlist-count"
            title={t('audio.playlistCount', { count: ch.playlist.length })}
          >
            ♪ {ch.playlist.length}
          </span>
        )}
        {ch.playing && (
          <span className="audio-channel-badge animate-pulse">♪ {t('audio.play')}</span>
        )}
        {combatControl && (
          <button
            type="button"
            className={`audio-channel-combat-toggle${combatControl.active ? ' active' : ''}`}
            onClick={combatControl.onToggle}
            title={combatControl.active ? t('audio.endCombat') : t('audio.startCombat')}
          >
            {combatControl.active ? `⚔️ ${t('audio.endCombat')}` : `⚔️ ${t('audio.startCombat')}`}
          </button>
        )}
      </div>

      {/* Current track display + playlist picker. Left-click swaps the
          active track when there are multiple (or opens the add-file
          picker when the playlist is empty). Right-click anywhere on
          the strip also opens the dropdown — the contextmenu handler
          above catches it. */}
      <div className="audio-channel-file-wrap">
        <button
          ref={fileBtnRef}
          className={`audio-channel-file${ch.filePath ? '' : ' empty'}`}
          onClick={() => {
            // Empty playlist + no campaign → nothing useful to do. An
            // empty playlist *with* a campaign opens the file picker
            // directly to save the DM a click.
            if (ch.playlist.length === 0) {
              if (activeCampaignId) void handleAddTrack()
              return
            }
            setShowPlaylist((v) => !v)
          }}
          disabled={disabled || (ch.playlist.length === 0 && !activeCampaignId)}
          title={
            ch.playlist.length === 0 && !activeCampaignId
              ? t('audio.noCampaign')
              : (ch.filePath ?? t('audio.loadFile'))
          }
        >
          <span className="audio-channel-file-icon" aria-hidden="true">♪</span>
          <span className="audio-channel-file-name">{ch.fileName ?? t('audio.loadFile')}</span>
          {ch.playlist.length > 0 && <span className="audio-channel-file-chev">▾</span>}
        </button>
        {showPlaylist && (
          <div
            className={`audio-channel-playlist audio-channel-playlist-${dropdownDir}`}
            ref={menuRef}
            role="menu"
          >
            {ch.playlist.length === 0 && (
              <div className="audio-channel-playlist-empty">{t('audio.playlistEmpty')}</div>
            )}
            {ch.playlist.map((entry) => {
              const isActive = entry.path === ch.filePath
              return (
                <div
                  key={entry.id}
                  className={`audio-channel-playlist-item${isActive ? ' active' : ''}`}
                  role="menuitem"
                  onClick={() => handleActivate(entry)}
                  title={entry.path}
                >
                  <span className="audio-channel-playlist-item-icon">{isActive ? '▶' : '♪'}</span>
                  <span className="audio-channel-playlist-item-name">{entry.fileName}</span>
                  <button
                    type="button"
                    className="audio-channel-playlist-item-remove"
                    onClick={(e) => handleRemoveTrack(entry, e)}
                    title={t('audio.removeTrack')}
                    aria-label={t('audio.removeTrack')}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              className="audio-channel-playlist-add"
              onClick={() => { setShowPlaylist(false); void handleAddTrack() }}
              disabled={!activeCampaignId}
              title={activeCampaignId ? undefined : t('audio.noCampaign')}
            >
              + {t('audio.addTrack')}
            </button>
          </div>
        )}
      </div>

      {ch.filePath && (
        <div className="audio-channel-seek">
          <span>{fmt(ch.currentTime)}</span>
          <input
            type="range" min={0} max={ch.duration || 100} step={0.1} value={ch.currentTime}
            onChange={(e) => store.seekChannel(chId, parseFloat(e.target.value))}
            disabled={disabled || !ch.duration}
            style={{ flex: 1 }}
          />
          <span>{fmt(ch.duration)}</span>
        </div>
      )}

      <div className="audio-channel-controls">
        <button
          className={`audio-channel-play${ch.playing ? ' playing' : ''}`}
          onClick={() => ch.playing ? store.stopChannel(chId) : store.playChannel(chId)}
          disabled={disabled || !ch.filePath}
          title={ch.playing ? t('audio.pause') : t('audio.play')}
        >
          {ch.playing ? '⏸' : '▶'}
        </button>
        <button
          className="audio-channel-icon-btn"
          onClick={() => store.stopChannel(chId)}
          disabled={disabled || !ch.filePath}
          title={t('audio.stop')}
        >
          ⏹
        </button>
        {chId === 'track2' && (
          <button
            className="audio-channel-icon-btn"
            onClick={handleSetAmbient}
            disabled={!ch.filePath || !activeMapId}
            title={t('audio.setAmbient')}
          >
            🌙
          </button>
        )}
      </div>

      <div className="audio-channel-volume">
        <span className="audio-channel-volume-icon">🔊</span>
        <input
          type="range" min={0} max={1} step={0.01} value={ch.volume}
          onChange={(e) => {
            const vol = parseFloat(e.target.value)
            store.setChannelVolume(chId, vol)
            if (activeMapId) {
              window.electronAPI?.dbRun(
                `UPDATE maps SET ${VOLUME_COL[chId]} = ? WHERE id = ?`,
                [vol, activeMapId]
              )
            }
          }}
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <span className="audio-channel-volume-value">{Math.round(ch.volume * 100)}%</span>
      </div>
    </div>
  )
}

// ─── SFX slot button ──────────────────────────────────────────────────────────

function SfxSlot({ slot, slotIndex, onTrigger, onEdit }: {
  slot: AudioBoardSlot | undefined
  slotIndex: number
  onTrigger: () => void
  onEdit: () => void
}) {
  const keyLabel = slotIndex === 9 ? '0' : String(slotIndex + 1)
  return (
    <div style={{ position: 'relative', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <button
        onClick={slot?.audioPath ? onTrigger : undefined}
        onContextMenu={(e) => { e.preventDefault(); onEdit() }}
        style={{
          width: '100%', height: '100%', background: slot?.audioPath ? 'var(--bg-surface)' : 'var(--bg)',
          border: `1px solid ${slot?.audioPath ? 'var(--border)' : 'var(--border-subtle, #333)'}`,
          borderRadius: 6, cursor: slot?.audioPath ? 'pointer' : 'default',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2, padding: 2,
        }}
        title={slot?.title || `Slot ${keyLabel}`}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>{slot?.emoji || '·'}</span>
        <span style={{
          fontSize: 8, color: 'var(--text-muted)', maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center',
        }}>
          {slot?.title || ''}
        </span>
      </button>
      <span style={{
        position: 'absolute', top: 2, right: 4, fontSize: 8, color: 'var(--text-muted)', pointerEvents: 'none',
      }}>{keyLabel}</span>
    </div>
  )
}

// ─── Slot editor popup ────────────────────────────────────────────────────────

function SlotEditor({ boardId, slot, slotIndex, onClose }: {
  boardId: number
  slot: AudioBoardSlot | undefined
  slotIndex: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const setSlots = useAudioStore((s) => s.setSlots)
  const boards = useAudioStore((s) => s.boards)
  const board = boards.find((b) => b.id === boardId)

  const [emoji, setEmoji] = useState(slot?.emoji ?? '🔊')
  const [title, setTitle] = useState(slot?.title ?? '')
  const [audioPath, setAudioPath] = useState(slot?.audioPath ?? null)
  const [fileName, setFileName] = useState(slot?.audioPath?.split(/[\\/]/).pop() ?? '')

  async function handlePickFile() {
    const result = await window.electronAPI?.importFile('audio').catch(() => null)
    if (result) {
      setAudioPath(result.path)
      setFileName(result.path.split(/[\\/]/).pop() ?? '')
    }
  }

  async function handleSave() {
    if (!board) return
    // Upsert slot in DB
    await window.electronAPI?.dbRun(
      `INSERT INTO audio_board_slots (board_id, slot_number, emoji, title, audio_path)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(board_id, slot_number) DO UPDATE SET emoji=excluded.emoji, title=excluded.title, audio_path=excluded.audio_path`,
      [boardId, slotIndex, emoji, title, audioPath]
    ).catch(console.error)
    // Rebuild slots array
    const newSlots = [...(board.slots ?? [])]
    const existing = newSlots.findIndex((s) => s.slotNumber === slotIndex)
    const updated: AudioBoardSlot = { slotNumber: slotIndex, emoji, title, audioPath }
    if (existing >= 0) newSlots[existing] = updated
    else newSlots.push(updated)
    setSlots(boardId, newSlots)
    onClose()
  }

  async function handleClear() {
    if (!board) return
    await window.electronAPI?.dbRun(
      `DELETE FROM audio_board_slots WHERE board_id = ? AND slot_number = ?`,
      [boardId, slotIndex]
    ).catch(console.error)
    const newSlots = (board.slots ?? []).filter((s) => s.slotNumber !== slotIndex)
    setSlots(boardId, newSlots)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
        padding: 16, width: 280, display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{t('audio.editSlot')} #{slotIndex === 9 ? 0 : slotIndex + 1}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={emoji} onChange={(e) => setEmoji(e.target.value)}
            placeholder="🔊"
            style={{ width: 44, textAlign: 'center', fontSize: 20, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: 4 }}
          />
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t('audio.slotTitle')}
            style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 6px', color: 'var(--text)', fontSize: 12 }}
          />
        </div>

        <button
          onClick={handlePickFile}
          style={{ textAlign: 'left', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: audioPath ? 'var(--text)' : 'var(--text-muted)', fontSize: 11, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {fileName || t('audio.loadFile')}
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            style={{ flex: 1, padding: '5px 0', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >{t('audio.save')}</button>
          <button
            onClick={handleClear}
            style={{ padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
          >{t('audio.clear')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Board manager ────────────────────────────────────────────────────────────

function BoardManager({ boards, activeBoardIndex, onSelect, campaignId, onBoardsChanged }: {
  boards: AudioBoard[]
  activeBoardIndex: number
  onSelect: (i: number) => void
  campaignId: number
  onBoardsChanged: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const updateBoardName = useAudioStore((s) => s.updateBoardName)

  async function handleAdd() {
    const result = await window.electronAPI?.dbRun(
      'INSERT INTO audio_boards (campaign_id, name, sort_order) VALUES (?, ?, ?)',
      [campaignId, `Board ${boards.length + 1}`, boards.length]
    ).catch(() => null)
    if (result) onBoardsChanged()
  }

  async function handleRename(id: number, name: string) {
    updateBoardName(id, name)
    await window.electronAPI?.dbRun('UPDATE audio_boards SET name = ? WHERE id = ?', [name, id]).catch(console.error)
    setEditing(null)
  }

  async function handleDelete(id: number) {
    const ok = await window.electronAPI?.confirmDialog(t('audio.deleteBoardConfirm'))
    if (!ok) return
    await window.electronAPI?.dbRun('DELETE FROM audio_boards WHERE id = ?', [id]).catch(console.error)
    onBoardsChanged()
  }

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
      {boards.map((b, i) => (
        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {editing === b.id ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRename(b.id, editName)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(b.id, editName); if (e.key === 'Escape') setEditing(null) }}
              style={{ width: 80, fontSize: 10, padding: '2px 4px', background: 'var(--bg-input)', border: '1px solid var(--accent-blue)', borderRadius: 4, color: 'var(--text)' }}
            />
          ) : (
            <button
              onClick={() => onSelect(i)}
              onDoubleClick={() => { setEditing(b.id); setEditName(b.name) }}
              style={{
                padding: '2px 8px', fontSize: 10, borderRadius: 4,
                background: i === activeBoardIndex ? 'var(--accent-blue)' : 'var(--bg-surface)',
                color: i === activeBoardIndex ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${i === activeBoardIndex ? 'var(--accent-blue)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >{b.name}</button>
          )}
          <button
            onClick={() => handleDelete(b.id)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '0 2px', opacity: 0.6 }}
          >✕</button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        style={{ padding: '2px 8px', fontSize: 10, background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer' }}
      >+ {t('audio.addBoard')}</button>
    </div>
  )
}

// ─── Main AudioPanel ──────────────────────────────────────────────────────────
// `layout="wide"`: two-column (music | sfx) — used in CampaignView
// `layout="narrow"` (default): tabbed — used in the right sidebar

/**
 * AudioPanel layouts:
 *  - 'narrow' — tabbed (Music / SFX) for the right sidebar during play.
 *  - 'wide'   — full two-column view; music + SFX side by side.
 *  - 'wide-music' / 'wide-sfx' — split one section into its own view.
 *    CampaignView uses these for the separated "Audio" and "SFX" tabs
 *    so content management stays focused while the wide layout is
 *    still available elsewhere if needed.
 */
export type AudioPanelLayout = 'narrow' | 'wide' | 'wide-music' | 'wide-sfx'

export function AudioPanel({ layout = 'narrow' }: { layout?: AudioPanelLayout }) {
  const { t } = useTranslation()
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const {
    masterVolume, sfxVolume, combatActive,
    setMasterVolume, setSfxVolume, setActiveBoardIndex,
    activateCombat, deactivateCombat,
    triggerSfx, boards, activeBoardIndex, setBoards,
    setChannelPlaylist, clearAllPlaylists,
  } = useAudioStore()

  const [editingSlot, setEditingSlot] = useState<{ boardId: number; slotIndex: number } | null>(null)
  const [activeSection, setActiveSection] = useState<'music' | 'sfx'>('music')

  // Load boards for current campaign
  const loadBoards = useCallback(async () => {
    if (!activeCampaignId) { setBoards([]); return }
    try {
      const boardRows = await window.electronAPI!.dbQuery<{
        id: number; campaign_id: number; name: string; sort_order: number
      }>('SELECT * FROM audio_boards WHERE campaign_id = ? ORDER BY sort_order', [activeCampaignId])

      const result: AudioBoard[] = []
      for (const br of boardRows) {
        const slotRows = await window.electronAPI!.dbQuery<{
          id: number; board_id: number; slot_number: number; emoji: string | null; title: string | null; audio_path: string | null
        }>('SELECT * FROM audio_board_slots WHERE board_id = ? ORDER BY slot_number', [br.id])
        result.push({
          id: br.id,
          campaignId: br.campaign_id,
          name: br.name,
          sortOrder: br.sort_order,
          slots: slotRows.map((s) => ({
            slotNumber: s.slot_number,
            emoji: s.emoji ?? '🔊',
            title: s.title ?? '',
            audioPath: s.audio_path,
          })),
        })
      }
      setBoards(result)
    } catch (err) {
      console.error('[AudioPanel] loadBoards failed:', err)
    }
  }, [activeCampaignId, setBoards])

  useEffect(() => { loadBoards() }, [loadBoards])

  // Hydrate per-channel playlists when the active campaign changes so
  // the right-click menu always reflects the DM's pre-assigned tracks.
  // Keyed on `activeCampaignId` so campaign switches clear + reload the
  // store cleanly (otherwise track1's playlist would bleed between
  // campaigns because ChannelState lives in the singleton store).
  useEffect(() => {
    if (!activeCampaignId) { clearAllPlaylists(); return }
    let cancelled = false
    ;(async () => {
      try {
        const rows = await window.electronAPI?.dbQuery<{
          id: number; channel: ChannelId; path: string; file_name: string
        }>(
          `SELECT id, channel, path, file_name
             FROM channel_playlist
            WHERE campaign_id = ?
            ORDER BY channel, position, id`,
          [activeCampaignId],
        ) ?? []
        if (cancelled) return
        const byChannel: Record<ChannelId, PlaylistEntry[]> = { track1: [], track2: [], combat: [] }
        for (const r of rows) {
          byChannel[r.channel]?.push({ id: r.id, path: r.path, fileName: r.file_name })
        }
        setChannelPlaylist('track1', byChannel.track1)
        setChannelPlaylist('track2', byChannel.track2)
        setChannelPlaylist('combat', byChannel.combat)
      } catch (err) {
        console.error('[AudioPanel] loadPlaylists failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [activeCampaignId, setChannelPlaylist, clearAllPlaylists])

  const activeBoard = boards[activeBoardIndex] ?? null

  function handleTriggerSlot(slotIndex: number) {
    const slot = activeBoard?.slots.find((s) => s.slotNumber === slotIndex)
    if (slot?.audioPath) triggerSfx(slot.audioPath)
  }

  // ── Shared content blocks (used in both layouts) ───────────────────────────

  const musicContent = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="audio-master-row">
        <span className="audio-master-label">Master</span>
        <input type="range" min={0} max={1} step={0.01} value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span className="audio-master-value">{Math.round(masterVolume * 100)}%</span>
      </div>

      <ChannelStrip chId="track1" label={t('audio.track1')} activeMapId={activeMapId} activeCampaignId={activeCampaignId} />
      <ChannelStrip chId="track2" label={t('audio.track2')} activeMapId={activeMapId} activeCampaignId={activeCampaignId} />
      {/* The combat-mode toggle is a gameplay action (ducks the music
          tracks and swaps to the Kampf channel). It has no place in the
          CampaignView content overview — that view only manages assets,
          not the live session. Only the narrow layout (right sidebar
          during play) shows the pill. */}
      <ChannelStrip
        chId="combat"
        label={t('audio.combat')}
        activeMapId={activeMapId}
        activeCampaignId={activeCampaignId}
        combatControl={layout === 'narrow' ? {
          active: combatActive,
          onToggle: combatActive ? deactivateCombat : activateCombat,
        } : undefined}
      />

      {!activeCampaignId && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: '8px 0 0' }}>
          {t('audio.noCampaign')}
        </div>
      )}
    </div>
  )

  const sfxContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="audio-master-row" style={{ marginBottom: 0 }}>
        <span className="audio-master-label">SFX</span>
        <input type="range" min={0} max={1} step={0.01} value={sfxVolume}
          onChange={(e) => setSfxVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span className="audio-master-value">{Math.round(sfxVolume * 100)}%</span>
      </div>

      {activeCampaignId && (
        <BoardManager
          boards={boards}
          activeBoardIndex={activeBoardIndex}
          onSelect={setActiveBoardIndex}
          campaignId={activeCampaignId}
          onBoardsChanged={loadBoards}
        />
      )}

      {activeBoard ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {Array.from({ length: 10 }, (_, i) => {
              const slot = activeBoard.slots.find((s) => s.slotNumber === i)
              return (
                <SfxSlot
                  key={i}
                  slot={slot}
                  slotIndex={i}
                  onTrigger={() => handleTriggerSlot(i)}
                  onEdit={() => setEditingSlot({ boardId: activeBoard.id, slotIndex: i })}
                />
              )
            })}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            {t('audio.sfxHint')}
          </div>
        </>
      ) : (
        <div className="audio-sfx-empty">
          <div className="audio-sfx-empty-glyph" aria-hidden="true">🎛</div>
          <div className="audio-sfx-empty-title">
            {activeCampaignId ? t('audio.noBoards') : t('audio.noCampaign')}
          </div>
          {activeCampaignId && (
            <div className="audio-sfx-empty-hint">{t('audio.sfxHint')}</div>
          )}
        </div>
      )}
    </div>
  )

  // Wide is rendered inside CampaignView's own flex column (with a
  // definite height) — the original "fill the parent" sizing works
  // there. Narrow lives inside FloatingUtilityDock's popover whose
  // height is *content-driven*; with `height: 100%` the inner
  // `flex: 1` content collapsed to zero, leaving the popover as a
  // tiny white shell. The narrow path now uses intrinsic sizing and
  // lets the popover-body scroll if content overflows.
  // The split layouts render a single section full-width. CampaignView
  // uses these for the separated "Audio" and "SFX" tabs; wide (both
  // columns) stays available if any caller wants the old side-by-side.
  if (layout === 'wide-music' || layout === 'wide-sfx') {
    const body = layout === 'wide-music' ? musicContent : sfxContent
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: 'var(--sp-4) var(--sp-5)',
        }}>
          {body}
        </div>

        {editingSlot && (
          <SlotEditor
            boardId={editingSlot.boardId}
            slot={boards.find((b) => b.id === editingSlot.boardId)?.slots.find((s) => s.slotNumber === editingSlot.slotIndex)}
            slotIndex={editingSlot.slotIndex}
            onClose={() => setEditingSlot(null)}
          />
        )}
      </div>
    )
  }

  if (layout === 'wide') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          flex: 1, overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
        }}>
          {/* Left: Music */}
          <div style={{
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            padding: 'var(--sp-4) var(--sp-5)',
          }}>
            <div style={{
              fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--sp-4)',
            }}>
              {t('audio.tabMusic')}
            </div>
            {musicContent}
          </div>

          {/* Right: SFX */}
          <div style={{ overflowY: 'auto', padding: 'var(--sp-4) var(--sp-5)' }}>
            <div style={{
              fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 'var(--sp-4)',
            }}>
              {t('audio.tabSfx')}
            </div>
            {sfxContent}
          </div>
        </div>

        {editingSlot && (
          <SlotEditor
            boardId={editingSlot.boardId}
            slot={boards.find((b) => b.id === editingSlot.boardId)?.slots.find((s) => s.slotNumber === editingSlot.slotIndex)}
            slotIndex={editingSlot.slotIndex}
            onClose={() => setEditingSlot(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>
        {(['music', 'sfx'] as const).map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            style={{
              flex: 1, padding: '5px 0', background: 'none', border: 'none',
              borderBottom: activeSection === sec ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeSection === sec ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            {sec === 'music' ? t('audio.tabMusic') : t('audio.tabSfx')}
          </button>
        ))}
      </div>
      <div style={{ padding: '8px 10px' }}>
        {activeSection === 'music' ? musicContent : sfxContent}
      </div>

      {/* Slot editor modal */}
      {editingSlot && (
        <SlotEditor
          boardId={editingSlot.boardId}
          slot={boards.find((b) => b.id === editingSlot.boardId)?.slots.find((s) => s.slotNumber === editingSlot.slotIndex)}
          slotIndex={editingSlot.slotIndex}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  )
}
