import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAudioStore, type ChannelId, type AudioBoard, type AudioBoardSlot } from '../../../stores/audioStore'
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

function ChannelStrip({ chId, label, activeMapId }: {
  chId: ChannelId
  label: string
  activeMapId: number | null
}) {
  const { t } = useTranslation()
  const store = useAudioStore()
  const ch = store[chId]
  const combatActive = useAudioStore((s) => s.combatActive)

  const disabled = chId !== 'combat' && combatActive

  async function handleImport() {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.importFile('audio')
      if (result) store.loadChannel(chId, result.path)
    } catch { /* silent */ }
  }

  async function handleSetAmbient() {
    if (!activeMapId || !ch.filePath) return
    await window.electronAPI?.dbRun(
      'UPDATE maps SET ambient_track_path = ? WHERE id = ?',
      [ch.filePath, activeMapId]
    ).catch(console.error)
  }

  const channelClass = `audio-channel ${chId}${disabled ? ' disabled' : ''}`

  return (
    <div className={channelClass}>
      <div className="audio-channel-head">
        <span className="audio-channel-label">{label}</span>
        {ch.playing && (
          <span className="audio-channel-badge animate-pulse">♪ {t('audio.play')}</span>
        )}
      </div>

      <button
        className={`audio-channel-file${ch.filePath ? '' : ' empty'}`}
        onClick={handleImport}
        disabled={disabled}
        title={ch.filePath ?? t('audio.loadFile')}
      >
        {ch.fileName ?? t('audio.loadFile')}
      </button>

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

export function AudioPanel({ layout = 'narrow' }: { layout?: 'narrow' | 'wide' }) {
  const { t } = useTranslation()
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const {
    masterVolume, sfxVolume, combatActive,
    setMasterVolume, setSfxVolume, setActiveBoardIndex,
    activateCombat, deactivateCombat,
    triggerSfx, boards, activeBoardIndex, setBoards,
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

      <ChannelStrip chId="track1" label={t('audio.track1')} activeMapId={activeMapId} />
      <ChannelStrip chId="track2" label={t('audio.track2')} activeMapId={activeMapId} />

      <button
        className={`audio-combat-toggle${combatActive ? ' active' : ''}`}
        onClick={combatActive ? deactivateCombat : activateCombat}
      >
        ⚔️ {combatActive ? t('audio.endCombat') : t('audio.startCombat')}
      </button>
      <ChannelStrip chId="combat" label={t('audio.combat')} activeMapId={activeMapId} />

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
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 16 }}>
          {activeCampaignId ? t('audio.noBoards') : t('audio.noCampaign')}
        </div>
      )}

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
        {t('audio.sfxHint')}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {layout === 'wide' ? (
        /* ── Wide two-column layout ── */
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
      ) : (
        /* ── Narrow tabbed layout (sidebar) ── */
        <>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {activeSection === 'music' ? musicContent : sfxContent}
          </div>
        </>
      )}

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
