import { useEffect, useMemo, useRef, useState } from 'react'
import type { BardBoard, BardBoardSlot, BardLibrary, BardTrack, ChannelId } from '../preload/preload'
import { useBardAudio, type ChannelState } from './audioEngine'
import logoUrl from './bardberry-logo.svg'

const CHANNELS: Array<{ id: ChannelId; label: string; hint: string }> = [
  { id: 'track1', label: 'Music', hint: 'main loop' },
  { id: 'track2', label: 'Ambience', hint: 'layer' },
  { id: 'combat', label: 'Combat', hint: 'override' },
]

const EMOJIS = ['🔥', '💥', '⚡', '❄️', '🌊', '🪨', '🌪', '☔', '🗡', '🛡', '🏹', '⚔️', '🚪', '🔔', '🥁', '🎵', '✨', '🔮', '👣', '😱', '👻', '🎭']

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyLibrary(): BardLibrary {
  const boardId = newId()
  return {
    version: 1,
    tracks: [],
    boards: [{ id: boardId, name: 'Main Board', sortOrder: 0, slots: [] }],
    activeBoardId: boardId,
    masterVolume: 1,
    sfxVolume: 0.8,
    channelVolumes: { track1: 1, track2: 0.85, combat: 1 },
  }
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function fileUrl(path: string | null): string | null {
  if (!path) return null
  return `local-asset://${path.startsWith('/') ? path.slice(1) : path}`
}

export default function App() {
  const [library, setLibrary] = useState<BardLibrary>(emptyLibrary)
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [collection, setCollection] = useState('__all__')
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [slotDraft, setSlotDraft] = useState<BardBoardSlot>(() => makeEmptySlot(0))
  const [toast, setToast] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const audio = useBardAudio()
  const activeBoard = library.boards.find((b) => b.id === library.activeBoardId) ?? library.boards[0] ?? null

  useEffect(() => {
    void window.bardberry.loadLibrary().then((loaded) => {
      const normalized = {
        ...emptyLibrary(),
        ...loaded,
        activeBoardId: loaded.activeBoardId ?? loaded.boards[0]?.id ?? null,
      }
      setLibrary(normalized)
      const store = useBardAudio.getState()
      store.setMasterVolume(normalized.masterVolume)
      store.setSfxVolume(normalized.sfxVolume)
      for (const ch of CHANNELS) store.setChannelVolume(ch.id, normalized.channelVolumes[ch.id])
      store.setPlaylists(normalized.tracks)
      store.setBoards(normalized.boards, normalized.activeBoardId)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const store = useBardAudio.getState()
    store.setPlaylists(library.tracks)
    store.setBoards(library.boards, library.activeBoardId)
  }, [library.activeBoardId, library.boards, library.tracks])

  useEffect(() => {
    if (!ready) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.bardberry.saveLibrary(library)
    }, 250)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [library, ready])

  useEffect(() => {
    const slot = activeBoard?.slots.find((s) => s.slotNumber === selectedSlot)
    setSlotDraft(slot ? { ...slot } : makeEmptySlot(selectedSlot))
  }, [activeBoard?.id, activeBoard?.slots, selectedSlot])

  useEffect(() => {
    if (!ready) return
    setLibrary((l) => {
      const s = useBardAudio.getState()
      const nextVolumes = { track1: s.track1.volume, track2: s.track2.volume, combat: s.combat.volume }
      if (
        l.masterVolume === s.masterVolume &&
        l.sfxVolume === s.sfxVolume &&
        l.channelVolumes.track1 === nextVolumes.track1 &&
        l.channelVolumes.track2 === nextVolumes.track2 &&
        l.channelVolumes.combat === nextVolumes.combat
      ) return l
      return { ...l, masterVolume: s.masterVolume, sfxVolume: s.sfxVolume, channelVolumes: nextVolumes }
    })
  }, [audio.combat.volume, audio.masterVolume, audio.sfxVolume, audio.track1.volume, audio.track2.volume, ready])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
      const keyMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '0': 9 }
      const slotIndex = keyMap[e.key]
      if (slotIndex === undefined) return
      const slot = activeBoard?.slots.find((s) => s.slotNumber === slotIndex)
      if (slot?.audioPath) {
        e.preventDefault()
        audio.triggerSfx(slot)
        setSelectedSlot(slotIndex)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeBoard?.slots, audio])

  const collections = useMemo(() => {
    return Array.from(new Set(library.tracks.map((t) => t.collection).filter(Boolean) as string[])).sort()
  }, [library.tracks])

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return library.tracks.filter((track) => {
      if (collection === '__none__' && track.collection) return false
      if (collection !== '__all__' && collection !== '__none__' && track.collection !== collection) return false
      if (q && !`${track.fileName} ${track.collection ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [collection, library.tracks, search])

  function notify(message: string): void {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }

  function mergeTracks(tracks: BardTrack[]): void {
    if (tracks.length === 0) return
    setLibrary((l) => ({ ...l, tracks: [...tracks, ...l.tracks] }))
    notify(`${tracks.length} file(s) imported`)
  }

  async function importFiles(): Promise<void> {
    mergeTracks(await window.bardberry.importAudioFiles())
  }

  async function importFolder(): Promise<void> {
    const result = await window.bardberry.importAudioFolder()
    if (!result) return
    mergeTracks(result.tracks)
    if (result.tracks.length > 0) setCollection(result.folderName)
  }

  function toggleAssignment(trackId: string, channel: ChannelId): void {
    setLibrary((l) => ({
      ...l,
      tracks: l.tracks.map((track) => {
        if (track.id !== trackId) return track
        const assigned = track.assignments.includes(channel)
        return {
          ...track,
          assignments: assigned ? track.assignments.filter((c) => c !== channel) : [...track.assignments, channel],
        }
      }),
    }))
  }

  function playTrack(track: BardTrack, channel: ChannelId): void {
    if (!track.assignments.includes(channel)) toggleAssignment(track.id, channel)
    audio.loadChannel(channel, track)
    window.setTimeout(() => audio.playChannel(channel), 50)
  }

  async function deleteTrack(track: BardTrack): Promise<void> {
    const ok = await window.bardberry.confirm(`Remove "${track.fileName}"?`, 'The copied audio asset remains in BardBerry data for now.')
    if (!ok) return
    setLibrary((l) => ({ ...l, tracks: l.tracks.filter((t) => t.id !== track.id) }))
  }

  function updateVolumesFromAudio(): void {
    setLibrary((l) => ({
      ...l,
      masterVolume: useBardAudio.getState().masterVolume,
      sfxVolume: useBardAudio.getState().sfxVolume,
      channelVolumes: {
        track1: useBardAudio.getState().track1.volume,
        track2: useBardAudio.getState().track2.volume,
        combat: useBardAudio.getState().combat.volume,
      },
    }))
  }

  function upsertSlot(slot: BardBoardSlot): void {
    if (!activeBoard) return
    setLibrary((l) => ({
      ...l,
      boards: l.boards.map((board) => {
        if (board.id !== activeBoard.id) return board
        const next = board.slots.filter((s) => s.slotNumber !== slot.slotNumber)
        return { ...board, slots: [...next, slot].sort((a, b) => a.slotNumber - b.slotNumber) }
      }),
    }))
  }

  async function pickSlotAudio(): Promise<void> {
    const imported = await window.bardberry.importAudioFiles()
    if (imported[0]) setSlotDraft((s) => ({ ...s, audioPath: imported[0].path, title: s.title || imported[0].fileName.replace(/\.[^.]+$/, '') }))
  }

  async function pickSlotIcon(): Promise<void> {
    const iconPath = await window.bardberry.importIcon()
    if (iconPath) setSlotDraft((s) => ({ ...s, iconPath }))
  }

  async function addBoard(): Promise<void> {
    const id = newId()
    setLibrary((l) => ({
      ...l,
      activeBoardId: id,
      boards: [...l.boards, { id, name: `Board ${l.boards.length + 1}`, sortOrder: l.boards.length, slots: [] }],
    }))
  }

  async function deleteBoard(): Promise<void> {
    if (!activeBoard || library.boards.length <= 1) return
    const ok = await window.bardberry.confirm(`Delete board "${activeBoard.name}"?`)
    if (!ok) return
    setLibrary((l) => {
      const boards = l.boards.filter((b) => b.id !== activeBoard.id)
      return { ...l, boards, activeBoardId: boards[0]?.id ?? null }
    })
  }

  async function importLibrary(): Promise<void> {
    const imported = await window.bardberry.importLibrary()
    if (!imported) return
    setLibrary(imported)
    notify('Library imported')
  }

  if (!ready) {
    return <div className="loading">Loading BardBerry...</div>
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="brand">
          <img src={logoUrl} alt="" />
          <div>
            <strong>BardBerry</strong>
            <span>Local ambience, music and SFX cockpit</span>
          </div>
        </div>
        <div className="titlebar-actions">
          <button onClick={importFiles}>Import Files</button>
          <button onClick={importFolder}>Import Folder</button>
          <button onClick={() => window.bardberry.exportLibrary(library)}>Export</button>
          <button onClick={importLibrary}>Import</button>
          <button onClick={() => window.bardberry.revealData()}>Data</button>
        </div>
      </header>

      <main className="main-grid">
        <section className="live-panel">
          <div className="section-head">
            <div>
              <h1>Live Mixer</h1>
              <p>Layer music and ambience, then punch into combat without losing timestamps.</p>
            </div>
            <div className="master">
              <label>Master <strong>{Math.round(audio.masterVolume * 100)}%</strong></label>
              <input type="range" min={0} max={1} step={0.01} value={audio.masterVolume} onChange={(e) => { audio.setMasterVolume(Number(e.target.value)); updateVolumesFromAudio() }} />
            </div>
          </div>
          <div className="channel-grid">
            {CHANNELS.map((ch) => (
              <ChannelCard key={ch.id} id={ch.id} label={ch.label} hint={ch.hint} state={audio[ch.id]} combatActive={audio.combatActive} />
            ))}
          </div>
          <div className="combat-row">
            <button className={audio.combatActive ? 'danger active' : 'danger'} onClick={() => audio.combatActive ? audio.deactivateCombat() : audio.activateCombat()}>
              {audio.combatActive ? 'End Combat Mode' : 'Start Combat Mode'}
            </button>
            <span>Combat freezes Music and Ambience, fades them down, then restores them when combat ends.</span>
          </div>
        </section>

        <section className="library-panel">
          <div className="section-head compact">
            <h2>Track Library</h2>
            <span>{library.tracks.length} tracks</span>
          </div>
          <div className="filters">
            <select value={collection} onChange={(e) => setCollection(e.target.value)}>
              <option value="__all__">All collections</option>
              <option value="__none__">Unsorted</option>
              {collections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tracks" />
          </div>
          <div className="track-list">
            {filteredTracks.map((track) => (
              <div className="track-row" key={track.id}>
                <button className="track-main" onClick={() => playTrack(track, 'track1')} title={track.path}>
                  <span>♪</span>
                  <strong>{track.fileName}</strong>
                  {track.collection && <em>{track.collection}</em>}
                </button>
                <div className="assignments">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch.id}
                      className={track.assignments.includes(ch.id) ? `chip ${ch.id} on` : `chip ${ch.id}`}
                      onClick={() => toggleAssignment(track.id, ch.id)}
                      onContextMenu={(e) => { e.preventDefault(); playTrack(track, ch.id) }}
                      title="Click assigns, right-click plays on this channel"
                    >
                      {ch.id === 'track1' ? 'M' : ch.id === 'track2' ? 'A' : 'C'}
                    </button>
                  ))}
                  <button className="icon-button" onClick={() => deleteTrack(track)} title="Remove">×</button>
                </div>
              </div>
            ))}
            {filteredTracks.length === 0 && <div className="empty">Import audio files or folders to build your local table soundtrack.</div>}
          </div>
        </section>

        <section className="sfx-panel">
          <div className="section-head compact">
            <div className="board-select">
              <select value={activeBoard?.id ?? ''} onChange={(e) => setLibrary((l) => ({ ...l, activeBoardId: e.target.value }))}>
                {library.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
              </select>
              <button onClick={addBoard}>+</button>
              <button onClick={deleteBoard}>×</button>
            </div>
            <label className="sfx-master">SFX {Math.round(audio.sfxVolume * 100)}% <input type="range" min={0} max={1} step={0.01} value={audio.sfxVolume} onChange={(e) => { audio.setSfxVolume(Number(e.target.value)); updateVolumesFromAudio() }} /></label>
          </div>
          <div className="sfx-body">
            <div className="sfx-grid">
              {Array.from({ length: 10 }, (_, idx) => {
                const slot = activeBoard?.slots.find((s) => s.slotNumber === idx)
                const icon = fileUrl(slot?.iconPath ?? null)
                return (
                  <button
                    key={idx}
                    className={selectedSlot === idx ? 'sfx-slot selected' : slot?.audioPath ? 'sfx-slot filled' : 'sfx-slot'}
                    onClick={() => { if (slot?.audioPath) audio.triggerSfx(slot); setSelectedSlot(idx) }}
                    onContextMenu={(e) => { e.preventDefault(); setSelectedSlot(idx) }}
                  >
                    <span className="sfx-key">{idx === 9 ? 0 : idx + 1}</span>
                    {icon ? <img src={icon} alt="" /> : <span className="sfx-emoji">{slot?.emoji ?? '♪'}</span>}
                    <strong>{slot?.title || 'Empty'}</strong>
                    {slot?.isLoop && <em>loop</em>}
                  </button>
                )
              })}
            </div>
            <div className="slot-editor">
              <h3>Slot {selectedSlot === 9 ? 0 : selectedSlot + 1}</h3>
              <input value={slotDraft.title} onChange={(e) => setSlotDraft((s) => ({ ...s, title: e.target.value }))} placeholder="Title" />
              <div className="emoji-row">
                {EMOJIS.map((emoji) => <button key={emoji} className={slotDraft.emoji === emoji ? 'on' : ''} onClick={() => setSlotDraft((s) => ({ ...s, emoji }))}>{emoji}</button>)}
              </div>
              <div className="editor-actions">
                <button onClick={pickSlotAudio}>Pick Sound</button>
                <button onClick={pickSlotIcon}>Pick Icon</button>
              </div>
              <label>Volume {Math.round(slotDraft.volume * 100)}%<input type="range" min={0} max={1} step={0.01} value={slotDraft.volume} onChange={(e) => setSlotDraft((s) => ({ ...s, volume: Number(e.target.value) }))} /></label>
              <label className="check"><input type="checkbox" checked={slotDraft.isLoop} onChange={(e) => setSlotDraft((s) => ({ ...s, isLoop: e.target.checked }))} /> Loop</label>
              <div className="editor-actions">
                <button disabled={!slotDraft.audioPath} onClick={() => audio.triggerSfx(slotDraft)}>Preview</button>
                <button className="primary" onClick={() => { upsertSlot(slotDraft); notify('Slot saved') }}>Save Slot</button>
                <button onClick={() => { upsertSlot(makeEmptySlot(selectedSlot)); notify('Slot cleared') }}>Clear</button>
              </div>
              <p className="file-hint">{slotDraft.audioPath ? slotDraft.audioPath.split(/[\\/]/).pop() : 'No sound selected'}</p>
            </div>
          </div>
        </section>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function ChannelCard({ id, label, hint, state, combatActive }: { id: ChannelId; label: string; hint: string; state: ChannelState; combatActive: boolean }) {
  const audio = useBardAudio()
  const disabled = id !== 'combat' && combatActive
  return (
    <article className={`channel-card ${id}${disabled ? ' disabled' : ''}${state.playing ? ' playing' : ''}`}>
      <header>
        <span>{label}</span>
        <em>{hint}</em>
      </header>
      <select value={state.filePath ?? ''} onChange={(e) => {
        const track = state.playlist.find((t) => t.path === e.target.value)
        if (track) audio.loadChannel(id, track)
      }} disabled={disabled || state.playlist.length === 0}>
        <option value="">{state.playlist.length === 0 ? 'No assigned tracks' : 'Choose track'}</option>
        {state.playlist.map((track) => <option key={track.id} value={track.path}>{track.fileName}</option>)}
      </select>
      <div className="seek">
        <span>{fmt(state.currentTime)}</span>
        <input type="range" min={0} max={state.duration || 100} step={0.1} value={state.currentTime} disabled={disabled || !state.duration} onChange={(e) => audio.seekChannel(id, Number(e.target.value))} />
        <span>{fmt(state.duration)}</span>
      </div>
      <div className="transport">
        <button disabled={disabled || !state.filePath} onClick={() => state.playing ? audio.stopChannel(id) : audio.playChannel(id)}>{state.playing ? 'Pause' : 'Play'}</button>
        <button disabled={disabled || !state.filePath} onClick={() => audio.stopChannel(id)}>Stop</button>
        <button disabled={disabled || !state.filePath} className={state.loop ? 'on' : ''} onClick={() => audio.toggleLoop(id)}>Loop</button>
      </div>
      <label className="volume">Vol {Math.round(state.volume * 100)}%<input type="range" min={0} max={1} step={0.01} value={state.volume} disabled={disabled} onChange={(e) => audio.setChannelVolume(id, Number(e.target.value))} /></label>
    </article>
  )
}

function makeEmptySlot(slotNumber: number): BardBoardSlot {
  return { slotNumber, emoji: '♪', title: '', audioPath: null, iconPath: null, volume: 1, isLoop: false }
}
