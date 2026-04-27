import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAudioStore,
  type AudioBoard,
  type AudioBoardSlot,
} from '../../../stores/audioStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useUIStore } from '../../../stores/uiStore'
import { showToast } from '../../shared/Toast'
import { formatError } from '../../../utils/formatError'

// Curated emoji set for the IconPicker — common SFX themes for D&D
// sessions. Kept short on purpose so the picker is a single grid the
// DM can scan in one glance instead of a 2000-entry full unicode dump.
const CURATED_EMOJIS = [
  '🔥', '💥', '⚡', '❄️', '🌊', '🪨', '🌪', '☔',
  '🗡', '🛡', '🏹', '🪓', '⚔️', '💀', '👹', '🐉',
  '🚪', '🔔', '📯', '🎺', '🥁', '🎵', '🍺', '🍷',
  '✨', '🔮', '📜', '🪄', '🧪', '💎', '🔑', '🕯',
  '👣', '🐺', '🐦', '🦇', '🦂', '🪲', '🐍', '🐺',
  '😱', '😈', '👻', '🤬', '😴', '🤝', '🙏', '🎭',
] as const

// Slot dimensions for the grid (5 cols × 2 rows = 10 slots).
const SLOT_PX = 70
const SLOT_GAP = 14

interface ProfessionalSfxPanelProps {
  /** When true, the panel hides the board selector strip — used by
   *  callers that show the panel inside a popover with its own
   *  surrounding chrome. Default false. */
  hideBoards?: boolean
}

/**
 * ProfessionalSfxPanel — replaces the legacy modal SlotEditor with a
 * permanent inline editor next to the slot grid. Per-slot fields
 * gained in v38 (custom icon path, volume, loop) are first-class
 * citizens of the UI; the audio engine reads them via the store-
 * level `triggerSfx(path, slotVolume, loop)` overloads added in the
 * same commit.
 *
 * Click semantics
 *   - Empty slot, left-click   → opens editor (so the DM can fill it
 *                                without a context menu)
 *   - Filled slot, left-click  → triggers the sound
 *   - Any slot, right-click    → opens editor (selection mode)
 *   - Any slot, double-click   → opens editor too (alternative for
 *                                people who never reach for the
 *                                context menu)
 *   - Selected slot, click ▶ in editor → preview without triggering
 *                                the production duck/pool path
 *
 * Auto-save: switching to a different slot persists pending changes
 * silently. The 💾 Save button stays for muscle-memory but is no
 * longer mandatory — discoverability was hurting the workflow.
 */
export function ProfessionalSfxPanel({ hideBoards = false }: ProfessionalSfxPanelProps) {
  const { t } = useTranslation()
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const language = useUIStore((s) => s.language)
  const {
    boards, activeBoardIndex, setActiveBoardIndex, setBoards, setSlots,
    sfxVolume, setSfxVolume, triggerSfx,
  } = useAudioStore()

  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null)
  const [editorBuffer, setEditorBuffer] = useState<EditorBuffer>(emptyBuffer())
  const [iconPicker, setIconPicker] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  // Load boards when the campaign changes.
  const reloadBoards = useCallback(async () => {
    if (!activeCampaignId || !window.electronAPI) {
      setBoards([])
      return
    }
    try {
      const rows = await window.electronAPI.audioBoards.listByCampaign(activeCampaignId)
      setBoards(rows)
    } catch (err) {
      console.error('[ProfessionalSfxPanel] loadBoards failed:', err)
      showToast(`Boards konnten nicht geladen werden: ${formatError(err)}`, 'error')
    }
  }, [activeCampaignId, setBoards])

  useEffect(() => { void reloadBoards() }, [reloadBoards])

  const activeBoard: AudioBoard | null = boards[activeBoardIndex] ?? null

  // Stop preview on unmount + on slot/board switch.
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
    }
  }, [])

  // Hydrate the editor buffer when a different slot is selected. The
  // previous buffer's auto-save is fired *first* so switching never
  // loses input.
  const selectSlot = useCallback(async (idx: number | null) => {
    if (selectedSlotIndex !== null && selectedSlotIndex !== idx && editorBuffer.dirty && activeBoard) {
      await persistBuffer(activeBoard.id, editorBuffer)
      // Force a board reload so the slot grid reflects the saved state.
      await reloadBoards()
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    setSelectedSlotIndex(idx)
    if (idx === null || !activeBoard) {
      setEditorBuffer(emptyBuffer())
      return
    }
    const slot = activeBoard.slots.find((s) => s.slotNumber === idx)
    setEditorBuffer(bufferFromSlot(idx, slot))
  }, [selectedSlotIndex, editorBuffer, activeBoard, reloadBoards])

  // ── Board management ──────────────────────────────────────────────

  async function handleAddBoard() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      await window.electronAPI.audioBoards.create(
        activeCampaignId,
        `Board ${boards.length + 1}`,
        boards.length,
      )
      await reloadBoards()
      // Newly added board becomes active.
      setActiveBoardIndex(boards.length)
    } catch (err) {
      console.error('[ProfessionalSfxPanel] addBoard failed:', err)
      showToast(`Board konnte nicht angelegt werden: ${formatError(err)}`, 'error')
    }
  }

  // ── Slot interactions ────────────────────────────────────────────

  function handleSlotLeftClick(slotIndex: number) {
    if (!activeBoard) return
    const slot = activeBoard.slots.find((s) => s.slotNumber === slotIndex)
    if (slot?.audioPath) {
      // Trigger the sound *and* select for editing — the DM almost
      // always wants to do both, and the pool-based engine doesn't
      // mind being re-triggered while another instance plays.
      triggerSfx(slot.audioPath, slot.volume ?? 1, slot.isLoop ?? false)
    }
    void selectSlot(slotIndex)
  }

  function handleSlotContextMenu(e: React.MouseEvent, slotIndex: number) {
    e.preventDefault()
    void selectSlot(slotIndex)
  }

  async function handleClearSlot(slotIndex: number) {
    if (!activeBoard || !window.electronAPI) return
    try {
      await window.electronAPI.audioBoards.deleteSlot(activeBoard.id, slotIndex)
      const newSlots = (activeBoard.slots ?? []).filter((s) => s.slotNumber !== slotIndex)
      setSlots(activeBoard.id, newSlots)
      if (selectedSlotIndex === slotIndex) {
        setEditorBuffer(emptyBuffer())
        setSelectedSlotIndex(null)
      }
    } catch (err) {
      console.error('[ProfessionalSfxPanel] clearSlot failed:', err)
      showToast(`Slot konnte nicht geleert werden: ${formatError(err)}`, 'error')
    }
  }

  // ── Editor actions ───────────────────────────────────────────────

  async function persistBuffer(boardId: number, buf: EditorBuffer) {
    if (!window.electronAPI) return
    const slot: AudioBoardSlot = {
      slotNumber: buf.slotIndex,
      emoji: buf.emoji,
      title: buf.title,
      audioPath: buf.audioPath,
      iconPath: buf.iconPath,
      volume: buf.volume,
      isLoop: buf.isLoop,
    }
    try {
      await window.electronAPI.audioBoards.upsertSlot(boardId, slot)
      // Mirror into the store so the grid renders without waiting for
      // a full reload.
      const board = useAudioStore.getState().boards.find((b) => b.id === boardId)
      if (board) {
        const newSlots = [...(board.slots ?? [])]
        const existing = newSlots.findIndex((s) => s.slotNumber === buf.slotIndex)
        if (existing >= 0) newSlots[existing] = slot
        else newSlots.push(slot)
        setSlots(boardId, newSlots)
      }
    } catch (err) {
      console.error('[ProfessionalSfxPanel] persistBuffer failed:', err)
      showToast(`Slot konnte nicht gespeichert werden: ${formatError(err)}`, 'error')
    }
  }

  async function handleSaveEditor() {
    if (!activeBoard) return
    await persistBuffer(activeBoard.id, editorBuffer)
    setEditorBuffer((b) => ({ ...b, dirty: false }))
  }

  async function handlePickAudio() {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.importFile('audio')
      if (!result) return
      setEditorBuffer((b) => ({ ...b, audioPath: result.path, dirty: true }))
    } catch (err) {
      console.error('[ProfessionalSfxPanel] pickAudio failed:', err)
      showToast(`Sound konnte nicht ausgewählt werden: ${formatError(err)}`, 'error')
    }
  }

  async function handleUploadIcon() {
    if (!window.electronAPI) return
    try {
      const path = await window.electronAPI.audioBoards.importIcon()
      if (!path) return
      setEditorBuffer((b) => ({ ...b, iconPath: path, dirty: true }))
    } catch (err) {
      console.error('[ProfessionalSfxPanel] uploadIcon failed:', err)
      showToast(`Icon konnte nicht importiert werden: ${formatError(err)}`, 'error')
    }
  }

  function handleClearIcon() {
    setEditorBuffer((b) => ({ ...b, iconPath: null, dirty: true }))
  }

  function handlePickEmoji(emoji: string) {
    setEditorBuffer((b) => ({ ...b, emoji, dirty: true }))
    setIconPicker(false)
  }

  function handleEditorPreview() {
    if (!editorBuffer.audioPath) return
    // Preview path — independent of the production SFX pool so it
    // doesn't duck the music tracks during editing.
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
      return
    }
    const url = `local-asset://${editorBuffer.audioPath.startsWith('/')
      ? editorBuffer.audioPath.slice(1)
      : editorBuffer.audioPath}`
    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, editorBuffer.volume * sfxVolume))
    audio.loop = editorBuffer.isLoop
    audio.onended = () => { previewAudioRef.current = null }
    audio.onerror = () => {
      previewAudioRef.current = null
      showToast('Vorschau fehlgeschlagen', 'error')
    }
    previewAudioRef.current = audio
    void audio.play().catch(() => {})
  }

  // ── Render ───────────────────────────────────────────────────────

  if (!activeCampaignId) {
    return (
      <div className="sfx-panel sfx-panel-empty">
        <SfxPanelStyles />
        <div className="sfx-panel-empty-glyph" aria-hidden="true">🎛</div>
        <div>{t('audio.noCampaign')}</div>
      </div>
    )
  }

  return (
    <div className="sfx-panel">
      <SfxPanelStyles />

      {!hideBoards && (
        <header className="sfx-panel-header">
          <span className="sfx-panel-board-label">{t('sfxPanel.board')}:</span>
          <select
            className="sfx-panel-board-select"
            value={activeBoard?.id ?? ''}
            onChange={(e) => {
              const targetId = Number(e.target.value)
              const idx = boards.findIndex((b) => b.id === targetId)
              if (idx >= 0) {
                void selectSlot(null) // auto-saves any pending edit before switching
                setActiveBoardIndex(idx)
              }
            }}
          >
            {boards.length === 0 && <option value="">{t('sfxPanel.noBoards')}</option>}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            className="sfx-panel-add-board"
            onClick={handleAddBoard}
            title={t('sfxPanel.addBoard')}
            aria-label={t('sfxPanel.addBoard')}
          >+</button>
          <div className="sfx-panel-spacer" />
          <span className="sfx-panel-master-label">{t('audio.tabSfx')}</span>
          <input
            type="range" min={0} max={1} step={0.01} value={sfxVolume}
            onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
            className="sfx-panel-master-slider"
            title={t('audio.volume')}
          />
          <span className="sfx-panel-master-value">{Math.round(sfxVolume * 100)}%</span>
        </header>
      )}

      <div className="sfx-panel-body">
        {/* Slot grid */}
        <section className="sfx-panel-grid-wrap">
          {!activeBoard ? (
            <div className="sfx-panel-no-board">
              <div className="sfx-panel-no-board-glyph">🎛</div>
              <div>{t('sfxPanel.noBoardsHint')}</div>
              <button className="btn btn-primary" onClick={handleAddBoard}>
                + {t('sfxPanel.addBoard')}
              </button>
            </div>
          ) : (
            <div
              className="sfx-panel-grid"
              style={{
                gridTemplateColumns: `repeat(5, ${SLOT_PX}px)`,
                gap: SLOT_GAP,
              }}
            >
              {Array.from({ length: 10 }, (_, i) => {
                const slot = activeBoard.slots.find((s) => s.slotNumber === i)
                const isSelected = selectedSlotIndex === i
                const keyLabel = i === 9 ? '0' : String(i + 1)
                const hasIcon = !!slot?.iconPath
                const iconUrl = hasIcon
                  ? `local-asset://${slot.iconPath!.startsWith('/')
                      ? slot.iconPath!.slice(1)
                      : slot.iconPath}`
                  : null
                return (
                  <div
                    key={i}
                    className={[
                      'sfx-slot',
                      slot?.audioPath ? 'filled' : 'empty',
                      isSelected ? 'selected' : '',
                      slot?.isLoop ? 'is-loop' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ width: SLOT_PX, height: SLOT_PX }}
                    onClick={() => handleSlotLeftClick(i)}
                    onDoubleClick={() => void selectSlot(i)}
                    onContextMenu={(e) => handleSlotContextMenu(e, i)}
                    title={slot?.title || `Slot ${keyLabel}`}
                  >
                    <span className="sfx-slot-key">{keyLabel}</span>
                    {slot?.audioPath ? (
                      hasIcon ? (
                        <img className="sfx-slot-icon" src={iconUrl!} alt="" />
                      ) : (
                        <span className="sfx-slot-emoji">{slot.emoji || '🔊'}</span>
                      )
                    ) : (
                      <span className="sfx-slot-empty-num">{keyLabel}</span>
                    )}
                    {slot?.title && <span className="sfx-slot-title">{slot.title}</span>}
                    {slot?.isLoop && <span className="sfx-slot-loop" title={t('sfxPanel.loop')}>↻</span>}
                  </div>
                )
              })}
            </div>
          )}
          <div className="sfx-panel-grid-hint">{t('sfxPanel.gridHint')}</div>
        </section>

        {/* Inline editor */}
        <section className="sfx-panel-editor">
          {selectedSlotIndex === null ? (
            <div className="sfx-panel-editor-empty">
              <div className="sfx-panel-editor-empty-arrow">←</div>
              <div>{t('sfxPanel.editorEmpty')}</div>
            </div>
          ) : (
            <>
              <header className="sfx-panel-editor-header">
                <span className="sfx-panel-editor-badge">
                  {t('sfxPanel.slotN', { n: selectedSlotIndex === 9 ? 0 : selectedSlotIndex + 1 })}
                </span>
                {editorBuffer.dirty && (
                  <span className="sfx-panel-editor-dirty">●</span>
                )}
                <div className="sfx-panel-spacer" />
                <button
                  className="btn btn-ghost"
                  onClick={() => void handleClearSlot(selectedSlotIndex)}
                  title={t('sfxPanel.clearSlot')}
                >🗑</button>
              </header>

              <label className="sfx-panel-field">
                <span className="sfx-panel-field-label">{t('sfxPanel.title')}</span>
                <input
                  type="text"
                  className="sfx-panel-input"
                  placeholder={t('sfxPanel.titlePlaceholder')}
                  value={editorBuffer.title}
                  onChange={(e) => setEditorBuffer((b) => ({ ...b, title: e.target.value, dirty: true }))}
                />
              </label>

              <div className="sfx-panel-field">
                <span className="sfx-panel-field-label">{t('sfxPanel.icon')}</span>
                <div className="sfx-panel-icon-row">
                  {editorBuffer.iconPath ? (
                    <img
                      className="sfx-panel-icon-preview"
                      src={`local-asset://${editorBuffer.iconPath.startsWith('/')
                        ? editorBuffer.iconPath.slice(1)
                        : editorBuffer.iconPath}`}
                      alt=""
                    />
                  ) : (
                    <span className="sfx-panel-icon-emoji">{editorBuffer.emoji || '🔊'}</span>
                  )}
                  <input
                    type="text"
                    className="sfx-panel-input sfx-panel-emoji-input"
                    maxLength={4}
                    value={editorBuffer.emoji}
                    onChange={(e) => setEditorBuffer((b) => ({ ...b, emoji: e.target.value, dirty: true }))}
                    placeholder="🔊"
                    title={t('sfxPanel.emojiHint')}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => setIconPicker((v) => !v)}
                    title={t('sfxPanel.pickEmoji')}
                  >📦 {t('sfxPanel.library')}</button>
                  <button
                    className="btn btn-ghost"
                    onClick={handleUploadIcon}
                    title={t('sfxPanel.uploadIconHint')}
                  >📁 {t('sfxPanel.uploadIcon')}</button>
                  {editorBuffer.iconPath && (
                    <button
                      className="btn btn-ghost"
                      onClick={handleClearIcon}
                      title={t('sfxPanel.clearIcon')}
                    >✕</button>
                  )}
                </div>
                {iconPicker && (
                  <div className="sfx-panel-emoji-grid">
                    {CURATED_EMOJIS.map((e, i) => (
                      <button
                        key={`${e}-${i}`}
                        className="sfx-panel-emoji-cell"
                        onClick={() => handlePickEmoji(e)}
                        title={e}
                      >{e}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className="sfx-panel-field">
                <span className="sfx-panel-field-label">{t('sfxPanel.sound')}</span>
                <div className="sfx-panel-sound-row">
                  <span className="sfx-panel-sound-name" title={editorBuffer.audioPath ?? ''}>
                    {editorBuffer.audioPath
                      ? `📄 ${editorBuffer.audioPath.split(/[\\/]/).pop()}`
                      : t('sfxPanel.noSound')}
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={handlePickAudio}
                    title={t('sfxPanel.pickAudio')}
                  >📁</button>
                </div>
              </div>

              <div className="sfx-panel-field">
                <span className="sfx-panel-field-label">
                  {t('sfxPanel.volume')}: <strong>{Math.round(editorBuffer.volume * 100)}%</strong>
                </span>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={editorBuffer.volume}
                  onChange={(e) => setEditorBuffer((b) => ({
                    ...b, volume: parseFloat(e.target.value), dirty: true,
                  }))}
                  className="sfx-panel-volume"
                />
              </div>

              <label className="sfx-panel-field sfx-panel-loop-row">
                <input
                  type="checkbox"
                  checked={editorBuffer.isLoop}
                  onChange={(e) => setEditorBuffer((b) => ({ ...b, isLoop: e.target.checked, dirty: true }))}
                />
                <span>{t('sfxPanel.loop')}</span>
              </label>

              <div className="sfx-panel-editor-actions">
                <button
                  className="btn"
                  onClick={handleEditorPreview}
                  disabled={!editorBuffer.audioPath}
                  title={t('sfxPanel.preview')}
                >▶ {t('sfxPanel.preview')}</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveEditor}
                  disabled={!editorBuffer.dirty}
                  title={t('sfxPanel.save')}
                >💾 {t('sfxPanel.save')}</button>
              </div>

              <div className="sfx-panel-editor-hint">{t('sfxPanel.autoSaveHint')}</div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Editor buffer state shape ────────────────────────────────────────────

interface EditorBuffer {
  slotIndex: number
  emoji: string
  title: string
  audioPath: string | null
  iconPath: string | null
  volume: number
  isLoop: boolean
  dirty: boolean
}

function emptyBuffer(): EditorBuffer {
  return {
    slotIndex: -1,
    emoji: '🔊', title: '',
    audioPath: null, iconPath: null,
    volume: 1, isLoop: false, dirty: false,
  }
}

function bufferFromSlot(slotIndex: number, slot: AudioBoardSlot | undefined): EditorBuffer {
  return {
    slotIndex,
    emoji: slot?.emoji ?? '🔊',
    title: slot?.title ?? '',
    audioPath: slot?.audioPath ?? null,
    iconPath: slot?.iconPath ?? null,
    volume: typeof slot?.volume === 'number' ? slot.volume : 1,
    isLoop: slot?.isLoop ?? false,
    dirty: false,
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────

function SfxPanelStyles() {
  return (
    <style>{`
      .sfx-panel {
        display: flex; flex-direction: column;
        height: 100%;
        background: var(--bg-base);
        color: var(--text-primary);
      }
      .sfx-panel-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 100%; gap: 12px;
        color: var(--text-muted); font-size: var(--text-sm);
      }
      .sfx-panel-empty-glyph { font-size: 48px; opacity: 0.5; }

      .sfx-panel-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .sfx-panel-board-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--text-muted);
      }
      .sfx-panel-board-select {
        font-size: 12px;
        padding: 6px 10px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        min-width: 220px;
      }
      .sfx-panel-add-board {
        width: 28px; height: 28px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        font-size: 14px;
        cursor: pointer;
      }
      .sfx-panel-add-board:hover { border-color: var(--accent); }
      .sfx-panel-spacer { flex: 1; }
      .sfx-panel-master-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--text-muted);
      }
      .sfx-panel-master-slider { width: 100px; }
      .sfx-panel-master-value {
        font-size: 11px;
        font-family: var(--font-mono);
        color: var(--text-muted);
        min-width: 40px; text-align: right;
      }

      .sfx-panel-body {
        flex: 1; overflow: hidden;
        display: grid;
        grid-template-columns: minmax(0, 60%) minmax(280px, 40%);
      }

      .sfx-panel-grid-wrap {
        padding: 16px;
        display: flex; flex-direction: column; gap: 14px;
        align-items: center; justify-content: flex-start;
        overflow-y: auto;
        border-right: 1px solid var(--border);
      }
      .sfx-panel-no-board {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 12px; padding: 40px 20px;
        color: var(--text-muted); font-size: var(--text-sm);
      }
      .sfx-panel-no-board-glyph { font-size: 48px; opacity: 0.5; }
      .sfx-panel-grid {
        display: grid;
      }
      .sfx-panel-grid-hint {
        font-size: 11px;
        color: var(--text-muted);
        text-align: center;
      }

      .sfx-slot {
        position: relative;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 2px; padding: 4px;
        background: var(--bg-elevated);
        border: 1.5px solid var(--border);
        border-radius: 8px;
        cursor: pointer;
        transition: border-color 120ms, background 120ms, transform 80ms;
      }
      .sfx-slot:hover { border-color: var(--accent); }
      .sfx-slot:active { transform: scale(0.97); }
      .sfx-slot.empty {
        background: var(--bg-base);
        border-style: dashed;
      }
      .sfx-slot.empty:hover { border-color: var(--accent); }
      .sfx-slot.filled {
        background: linear-gradient(135deg, var(--bg-overlay), var(--bg-elevated));
      }
      .sfx-slot.selected {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent), 0 0 12px rgba(232, 162, 55, 0.4);
      }
      .sfx-slot.is-loop {
        border-color: #4a9eff;
      }
      .sfx-slot-key {
        position: absolute; top: 3px; right: 5px;
        font-size: 8px;
        color: var(--text-muted);
        pointer-events: none;
        font-family: var(--font-mono);
      }
      .sfx-slot-loop {
        position: absolute; top: 3px; left: 5px;
        font-size: 11px;
        color: #4a9eff;
        pointer-events: none;
      }
      .sfx-slot-emoji { font-size: 28px; line-height: 1; }
      .sfx-slot-empty-num {
        font-size: 22px; font-weight: 700;
        color: var(--text-muted);
      }
      .sfx-slot-icon {
        width: 45px; height: 45px;
        object-fit: contain;
      }
      .sfx-slot-title {
        font-size: 8px;
        color: var(--text-secondary);
        max-width: 100%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        text-align: center;
      }

      /* Inline editor */
      .sfx-panel-editor {
        padding: 16px 18px;
        overflow-y: auto;
        background: linear-gradient(180deg, var(--bg-elevated), var(--bg-base));
        display: flex; flex-direction: column; gap: 14px;
      }
      .sfx-panel-editor-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 100%;
        color: var(--text-muted);
        gap: 8px;
        font-size: var(--text-sm);
        text-align: center;
      }
      .sfx-panel-editor-empty-arrow {
        font-size: 32px;
        opacity: 0.4;
      }
      .sfx-panel-editor-header {
        display: flex; align-items: center; gap: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .sfx-panel-editor-badge {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.06em; text-transform: uppercase;
        background: var(--accent);
        color: var(--bg-base);
        padding: 2px 8px;
        border-radius: 999px;
      }
      .sfx-panel-editor-dirty {
        color: var(--accent);
        font-size: 14px;
        line-height: 1;
      }

      .sfx-panel-field {
        display: flex; flex-direction: column; gap: 4px;
      }
      .sfx-panel-field-label {
        font-size: 11px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--text-muted);
      }
      .sfx-panel-input {
        font-size: 12px;
        padding: 6px 8px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
      }
      .sfx-panel-input:focus { border-color: var(--accent); outline: none; }

      .sfx-panel-icon-row {
        display: flex; align-items: center; gap: 8px;
        flex-wrap: wrap;
      }
      .sfx-panel-icon-preview {
        width: 40px; height: 40px;
        object-fit: contain;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 2px;
      }
      .sfx-panel-icon-emoji {
        width: 40px; height: 40px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 24px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: 4px;
      }
      .sfx-panel-emoji-input {
        width: 60px; text-align: center; font-size: 16px;
      }

      .sfx-panel-emoji-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 4px;
        margin-top: 6px;
        padding: 8px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        max-height: 180px;
        overflow-y: auto;
      }
      .sfx-panel-emoji-cell {
        background: none;
        border: 1px solid transparent;
        font-size: 18px;
        padding: 4px;
        cursor: pointer;
        border-radius: 4px;
      }
      .sfx-panel-emoji-cell:hover {
        background: var(--bg-overlay);
        border-color: var(--accent);
      }

      .sfx-panel-sound-row {
        display: flex; align-items: center; gap: 8px;
      }
      .sfx-panel-sound-name {
        flex: 1;
        font-size: 11px;
        font-family: var(--font-mono);
        color: var(--text-secondary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        padding: 6px 8px;
      }

      .sfx-panel-volume { width: 100%; }

      .sfx-panel-loop-row {
        flex-direction: row; align-items: center; gap: 8px;
        cursor: pointer;
      }
      .sfx-panel-loop-row input { cursor: pointer; }

      .sfx-panel-editor-actions {
        display: flex; gap: 8px; margin-top: 6px;
      }
      .sfx-panel-editor-actions .btn { flex: 1; }

      .sfx-panel-editor-hint {
        font-size: 10px;
        color: var(--text-muted);
        text-align: center;
        font-style: italic;
      }
    `}</style>
  )
}
