import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../../stores/campaignStore'
import {
  useAudioStore,
  type ChannelId,
  type PlaylistEntry,
} from '../../../stores/audioStore'
import { showToast } from '../../shared/Toast'
import { formatError } from '../../../utils/formatError'
import type { TrackRecord, AudioChannelKey } from '@shared/ipc-types'
import {
  buildSoundtrackFile,
  parseSoundtrackFile,
  suggestedSoundtrackFilename,
} from '../../../utils/soundtrackTransfer'

/**
 * MusicLibraryPanel — Workspace inventory view for the campaign's
 * audio library (v38). Replaces the cramped "wide-music" layout that
 * showed three live-control cards stacked vertically and hid every
 * track behind a dropdown.
 *
 * Layout
 *   ┌── Header — title + import + folder + refresh ──────────────────┐
 *   │ Left (stretch)               │ Right (sidebar)                 │
 *   │   Soundtrack filter           │   Now-Playing strip            │
 *   │   Search                       │   T1 / T2 / Combat sections   │
 *   │   Track rows                   │     each with assigned tracks │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Each track row shows: ♪ icon, file name, [▶ preview], T1 / T2 / C
 * toggle badges, ⋮ menu. Membership is the badge state (outline =
 * not assigned, filled = assigned). The "active on channel" state —
 * i.e. which assigned track is *currently* the one playing — is
 * indicated by the audioStore-level `track1.filePath` / `track2` /
 * `combat`. The right sidebar's section border glows when the
 * channel is actively playing.
 */
export function MusicLibraryPanel() {
  const { t } = useTranslation()
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const setChannelPlaylist = useAudioStore((s) => s.setChannelPlaylist)
  const loadChannel = useAudioStore((s) => s.loadChannel)
  const track1 = useAudioStore((s) => s.track1)
  const track2 = useAudioStore((s) => s.track2)
  const combat = useAudioStore((s) => s.combat)

  const [tracks, setTracks] = useState<TrackRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [soundtrackFilter, setSoundtrackFilter] = useState<string>('__all__')
  const [search, setSearch] = useState('')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const reload = useCallback(async () => {
    if (!activeCampaignId || !window.electronAPI) {
      setTracks([])
      return
    }
    setLoading(true)
    try {
      const rows = await window.electronAPI.tracks.listByCampaign(activeCampaignId)
      setTracks(rows)
      // Pivot into per-channel arrays so the audioStore stays in
      // sync with the canonical library — MusicLivePanel reads these
      // to render its right-click playlist during play.
      const byChannel: Record<ChannelId, PlaylistEntry[]> = { track1: [], track2: [], combat: [] }
      for (const tr of rows) {
        for (const ch of tr.assignments) {
          byChannel[ch].push({ id: tr.id, path: tr.path, fileName: tr.fileName })
        }
      }
      setChannelPlaylist('track1', byChannel.track1)
      setChannelPlaylist('track2', byChannel.track2)
      setChannelPlaylist('combat', byChannel.combat)
    } catch (err) {
      console.error('[MusicLibraryPanel] reload failed:', err)
      showToast(`Bibliothek konnte nicht geladen werden: ${formatError(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [activeCampaignId, setChannelPlaylist])

  useEffect(() => { void reload() }, [reload])

  // Stop preview on unmount so a navigated-away panel doesn't keep audio running.
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
    }
  }, [])

  const soundtracks = useMemo(() => {
    const set = new Set<string>()
    for (const tr of tracks) if (tr.soundtrack) set.add(tr.soundtrack)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [tracks])

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tracks.filter((tr) => {
      // Soundtrack filter: __all__ matches everything; __none__
      // matches uncategorised; otherwise exact match.
      if (soundtrackFilter === '__none__' && tr.soundtrack !== null) return false
      if (
        soundtrackFilter !== '__all__' &&
        soundtrackFilter !== '__none__' &&
        tr.soundtrack !== soundtrackFilter
      ) return false
      if (q && !tr.fileName.toLowerCase().includes(q)) return false
      return true
    })
  }, [tracks, soundtrackFilter, search])

  // Active-on-channel paths — used both for badge "filled" state and
  // for the now-playing pulse on the assignment sidebar.
  const activePaths: Record<ChannelId, string | null> = {
    track1: track1.filePath,
    track2: track2.filePath,
    combat: combat.filePath,
  }
  const playingChannels: Record<ChannelId, boolean> = {
    track1: track1.playing,
    track2: track2.playing,
    combat: combat.playing,
  }

  // ── Actions ────────────────────────────────────────────────────────────

  async function handleAddFiles() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      const imported = await window.electronAPI.tracks.importFiles(activeCampaignId)
      if (imported.length === 0) return
      const soundtrack =
        soundtrackFilter !== '__all__' && soundtrackFilter !== '__none__'
          ? soundtrackFilter
          : null
      for (const file of imported) {
        await window.electronAPI.tracks.create({
          campaignId: activeCampaignId,
          path: file.relativePath,
          fileName: file.originalName,
          soundtrack,
        })
      }
      showToast(`${imported.length} Track(s) importiert`, 'success')
      await reload()
    } catch (err) {
      console.error('[MusicLibraryPanel] handleAddFiles failed:', err)
      showToast(`Import fehlgeschlagen: ${formatError(err)}`, 'error')
    }
  }

  async function handleAddFolder() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      const result = await window.electronAPI.tracks.importFolder(activeCampaignId)
      if (!result || result.files.length === 0) {
        if (result) showToast('Ordner enthielt keine Audiodateien', 'info')
        return
      }
      // The source folder name becomes the auto-soundtrack tag for
      // every track in the batch. Avoids the DM having to manually
      // categorise dozens of files after a folder import.
      for (const file of result.files) {
        await window.electronAPI.tracks.create({
          campaignId: activeCampaignId,
          path: file.relativePath,
          fileName: file.originalName,
          soundtrack: result.folderName,
        })
      }
      showToast(`${result.files.length} Track(s) aus „${result.folderName}" importiert`, 'success')
      await reload()
    } catch (err) {
      console.error('[MusicLibraryPanel] handleAddFolder failed:', err)
      showToast(`Ordner-Import fehlgeschlagen: ${formatError(err)}`, 'error')
    }
  }

  async function handleToggleAssignment(track: TrackRecord, channel: AudioChannelKey) {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.tracks.toggleAssignment(track.id, channel)
      await reload()
    } catch (err) {
      console.error('[MusicLibraryPanel] toggle assignment failed:', err)
      showToast(`Zuweisung fehlgeschlagen: ${formatError(err)}`, 'error')
    }
  }

  async function handleDeleteTrack(track: TrackRecord) {
    if (!window.electronAPI) return
    const ok = await window.electronAPI.confirmDialog(
      `Track „${track.fileName}" aus der Bibliothek entfernen?`,
      'Die Datei selbst bleibt auf der Festplatte. Alle Channel-Zuweisungen gehen verloren.',
    )
    if (!ok) return
    try {
      await window.electronAPI.tracks.delete(track.id)
      await reload()
    } catch (err) {
      console.error('[MusicLibraryPanel] delete failed:', err)
      showToast(`Löschen fehlgeschlagen: ${formatError(err)}`, 'error')
    }
  }

  async function handleSetSoundtrack(track: TrackRecord) {
    const next = window.prompt('Soundtrack-Name (leer = unkategorisiert)', track.soundtrack ?? '')
    if (next === null) return
    const value = next.trim() || null
    if (value === track.soundtrack) return
    try {
      await window.electronAPI?.tracks.update(track.id, { soundtrack: value })
      await reload()
    } catch (err) {
      console.error('[MusicLibraryPanel] update soundtrack failed:', err)
      showToast(`Soundtrack konnte nicht gesetzt werden: ${formatError(err)}`, 'error')
    }
  }

  function handleTogglePreview(track: TrackRecord) {
    // One shared <audio> element so toggling preview on a different
    // track stops the previous one cleanly (no two previews at once,
    // no leaked audio nodes if the user spam-clicks).
    const ae = previewAudioRef.current
    if (ae && previewPath === track.path) {
      ae.pause()
      previewAudioRef.current = null
      setPreviewPath(null)
      return
    }
    if (ae) {
      ae.pause()
      previewAudioRef.current = null
    }
    const url = `local-asset://${track.path.startsWith('/') ? track.path.slice(1) : track.path}`
    const audio = new Audio(url)
    audio.volume = 0.6
    audio.onended = () => {
      previewAudioRef.current = null
      setPreviewPath(null)
    }
    audio.onerror = () => {
      previewAudioRef.current = null
      setPreviewPath(null)
      showToast('Vorschau konnte nicht abgespielt werden', 'error')
    }
    previewAudioRef.current = audio
    setPreviewPath(track.path)
    void audio.play()
  }

  function handlePlayOnChannel(channel: ChannelId, track: TrackRecord) {
    // Activate the track on the channel (i.e. make it the live one)
    // and also ensure it's a member. The store-level loadChannel
    // takes care of the play-side fade.
    if (!track.assignments.includes(channel)) {
      void window.electronAPI?.tracks.toggleAssignment(track.id, channel).then(reload)
    }
    loadChannel(channel, track.path)
  }

  // ── Soundtrack manifest export / import ────────────────────────────────
  // Exports the current filter selection as a small JSON manifest
  // (file names + tags + slot assignments). Audio files are NOT
  // bundled — receivers re-import the same file names from their
  // own audio folder. Keeps exports tiny even for hour-long lists.
  async function handleExportSoundtrack() {
    if (!window.electronAPI) return
    if (soundtrackFilter === '__all__') {
      showToast('Bitte einen Soundtrack-Filter wählen, um den Export einzugrenzen.', 'info', 6000)
      return
    }
    const tag = soundtrackFilter === '__none__' ? null : soundtrackFilter
    const subset = tracks.filter((t) => t.soundtrack === tag)
    if (subset.length === 0) {
      showToast('Keine Tracks im aktuellen Filter.', 'info')
      return
    }
    try {
      const file = buildSoundtrackFile(tag, subset)
      const result = await window.electronAPI.exportToFile({
        suggestedName: suggestedSoundtrackFilename(tag),
        content: JSON.stringify(file, null, 2),
        encoding: 'utf8',
        filters: [{ name: 'BoltBerry-Soundtrack (JSON)', extensions: ['json'] }],
        dialogTitle: 'Soundtrack exportieren',
      })
      if (result.success) {
        showToast(`Soundtrack „${tag ?? 'unkategorisiert'}" exportiert (${subset.length} Tracks)`, 'success', 6000)
      } else if (!result.canceled) {
        showToast(`Export fehlgeschlagen: ${result.error ?? ''}`, 'error', 7000)
      }
    } catch (err) {
      showToast(`Export fehlgeschlagen: ${formatError(err)}`, 'error', 7000)
    }
  }

  async function handleImportSoundtrack() {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      const open = await window.electronAPI.importFromFile({
        filters: [{ name: 'BoltBerry-Soundtrack (JSON)', extensions: ['json'] }],
        encoding: 'utf8',
      })
      if (!open.success) {
        if (!open.canceled) showToast(`Import fehlgeschlagen: ${open.error ?? ''}`, 'error', 7000)
        return
      }
      const file = parseSoundtrackFile(open.content ?? '')
      // We re-tag any *existing* tracks in the campaign whose
      // fileName matches one in the manifest. We can't materialise
      // missing files — they have to live in the destination's
      // audio folder already. Report both halves so the DM knows.
      const byFileName = new Map<string, TrackRecord>()
      for (const t of tracks) byFileName.set(t.fileName, t)
      let matched = 0
      let missing = 0
      for (const entry of file.tracks) {
        const local = byFileName.get(entry.fileName)
        if (!local) { missing++; continue }
        try {
          await window.electronAPI.tracks.update(local.id, { soundtrack: file.soundtrack })
          matched++
        } catch (err) {
          console.warn('[MusicLibraryPanel] re-tag failed:', entry.fileName, err)
        }
      }
      await reload()
      const tagLabel = file.soundtrack ?? 'unkategorisiert'
      if (missing === 0) {
        showToast(`Soundtrack „${tagLabel}" importiert — ${matched} Tracks neu zugeordnet.`, 'success', 7000)
      } else {
        showToast(
          `Soundtrack „${tagLabel}" — ${matched} zugeordnet, ${missing} Datei(en) fehlen lokal.`,
          'info',
          9000,
        )
      }
    } catch (err) {
      showToast(`Import fehlgeschlagen: ${formatError(err)}`, 'error', 7000)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (!activeCampaignId) {
    return (
      <div className="music-library music-library-empty">
        <div className="music-library-empty-glyph" aria-hidden="true">🎵</div>
        <div>{t('audio.noCampaign')}</div>
      </div>
    )
  }

  return (
    <div className="music-library">
      <MusicLibraryStyles />

      <header className="music-library-header">
        <h2 className="music-library-title">🎵 {t('musicLibrary.title')}</h2>
        <div className="music-library-actions">
          <button className="btn" onClick={handleAddFiles} title={t('musicLibrary.addFilesHint')}>
            + {t('musicLibrary.addFiles')}
          </button>
          <button className="btn" onClick={handleAddFolder} title={t('musicLibrary.addFolderHint')}>
            + {t('musicLibrary.addFolder')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleExportSoundtrack}
            title={
              soundtrackFilter === '__all__'
                ? 'Bitte zuerst einen Soundtrack-Filter wählen, dann exportieren'
                : 'Aktuelle Soundtrack-Auswahl als JSON-Manifest exportieren'
            }
            aria-label="Soundtrack exportieren"
          >
            📤
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleImportSoundtrack}
            title="Soundtrack-Manifest importieren (matcht Tracks per Dateiname)"
            aria-label="Soundtrack importieren"
          >
            📥
          </button>
          <button
            className="btn btn-ghost"
            onClick={reload}
            title={t('musicLibrary.refresh')}
            disabled={loading}
          >
            ↻
          </button>
        </div>
      </header>

      <div className="music-library-body">
        <section className="music-library-list">
          <div className="music-library-filters">
            <select
              className="music-library-soundtrack"
              value={soundtrackFilter}
              onChange={(e) => setSoundtrackFilter(e.target.value)}
              aria-label={t('musicLibrary.soundtrackFilter')}
            >
              <option value="__all__">{t('musicLibrary.allSoundtracks')}</option>
              <option value="__none__">{t('musicLibrary.noSoundtrack')}</option>
              {soundtracks.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              type="text"
              className="music-library-search"
              placeholder={`🔍  ${t('musicLibrary.searchPlaceholder')}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredTracks.length === 0 ? (
            <div className="music-library-empty-list">
              {tracks.length === 0
                ? t('musicLibrary.empty')
                : t('musicLibrary.noMatches')}
            </div>
          ) : (
            <ul className="music-library-tracks">
              {filteredTracks.map((tr) => {
                const isPreview = previewPath === tr.path
                return (
                  <li key={tr.id} className="music-library-track">
                    <span className="music-library-track-icon" aria-hidden="true">♪</span>
                    <div className="music-library-track-info">
                      <span className="music-library-track-name" title={tr.path}>
                        {tr.fileName}
                      </span>
                      {tr.soundtrack && (
                        <span className="music-library-track-soundtrack">{tr.soundtrack}</span>
                      )}
                    </div>
                    <button
                      className={`music-library-track-preview${isPreview ? ' playing' : ''}`}
                      onClick={() => handleTogglePreview(tr)}
                      title={isPreview ? t('audio.stop') : t('musicLibrary.preview')}
                      aria-label={isPreview ? t('audio.stop') : t('musicLibrary.preview')}
                    >
                      {isPreview ? '■' : '▶'}
                    </button>
                    {(['track1', 'track2', 'combat'] as const).map((channel) => {
                      const assigned = tr.assignments.includes(channel)
                      const isActive = assigned && activePaths[channel] === tr.path
                      const label = channel === 'track1' ? 'T1' : channel === 'track2' ? 'T2' : 'C'
                      return (
                        <button
                          key={channel}
                          className={`music-library-badge ch-${channel}${assigned ? ' assigned' : ''}${isActive ? ' active' : ''}`}
                          onClick={() => handleToggleAssignment(tr, channel)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            handlePlayOnChannel(channel, tr)
                          }}
                          title={
                            isActive
                              ? t('musicLibrary.activeOn', { channel: label })
                              : assigned
                                ? t('musicLibrary.removeFrom', { channel: label })
                                : t('musicLibrary.addTo', { channel: label })
                          }
                        >
                          {label}
                        </button>
                      )
                    })}
                    <details
                      className="music-library-track-menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <summary>⋮</summary>
                      <div className="music-library-track-menu-list">
                        <button onClick={() => handleSetSoundtrack(tr)}>
                          {t('musicLibrary.setSoundtrack')}
                        </button>
                        <button onClick={() => handleDeleteTrack(tr)} className="danger">
                          {t('musicLibrary.deleteTrack')}
                        </button>
                      </div>
                    </details>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside className="music-library-sidebar">
          <h3 className="music-library-sidebar-title">📊 {t('musicLibrary.assignments')}</h3>
          {(['track1', 'track2', 'combat'] as const).map((channel) => {
            const assigned = tracks.filter((tr) => tr.assignments.includes(channel))
            const isPlaying = playingChannels[channel]
            const label = channel === 'track1'
              ? t('audio.track1')
              : channel === 'track2'
                ? t('audio.track2')
                : t('audio.combat')
            return (
              <section
                key={channel}
                className={`music-library-slot ch-${channel}${isPlaying ? ' playing' : ''}`}
              >
                <header className="music-library-slot-header">
                  <span className="music-library-slot-label">{label}</span>
                  <span className="music-library-slot-count">{assigned.length}</span>
                </header>
                {assigned.length === 0 ? (
                  <div className="music-library-slot-empty">—</div>
                ) : (
                  <ul className="music-library-slot-list">
                    {assigned.map((tr) => {
                      const isActive = activePaths[channel] === tr.path
                      return (
                        <li
                          key={tr.id}
                          className={`music-library-slot-item${isActive ? ' active' : ''}`}
                          onClick={() => handlePlayOnChannel(channel, tr)}
                          title={tr.path}
                        >
                          {isActive && <span className="music-library-slot-active">▶</span>}
                          <span className="music-library-slot-name">{tr.fileName}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </aside>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────
// Inline styles via a single `<style>` block so the panel ships
// self-contained — the project's existing CSS lives in
// styles/globals.css; rather than sprinkling more rules there for one
// new panel we keep the visual contract local. Mirrors the pattern
// CampaignDataStyles uses elsewhere in the renderer.

function MusicLibraryStyles() {
  return (
    <style>{`
      .music-library {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-base);
        color: var(--text-primary);
      }
      .music-library-empty {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        height: 100%; gap: 12px; color: var(--text-muted); font-size: var(--text-sm);
      }
      .music-library-empty-glyph { font-size: 48px; opacity: 0.5; }
      .music-library-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .music-library-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 0;
        color: var(--text-secondary);
      }
      .music-library-actions { display: flex; gap: 6px; }
      .music-library-actions .btn { font-size: 11px; padding: 4px 10px; }

      .music-library-body {
        flex: 1; overflow: hidden;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 280px;
      }

      .music-library-list {
        display: flex; flex-direction: column;
        overflow: hidden;
        border-right: 1px solid var(--border);
      }
      .music-library-filters {
        display: flex; gap: 8px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--border-subtle);
        flex-shrink: 0;
      }
      .music-library-soundtrack,
      .music-library-search {
        font-size: 12px;
        padding: 6px 8px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
      }
      .music-library-soundtrack { min-width: 180px; }
      .music-library-search { flex: 1; }

      .music-library-tracks {
        list-style: none; margin: 0; padding: 4px 0;
        flex: 1; overflow-y: auto;
      }
      .music-library-empty-list {
        flex: 1; display: flex; align-items: center; justify-content: center;
        color: var(--text-muted); font-size: var(--text-sm);
      }
      .music-library-track {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 16px;
        border-bottom: 1px solid var(--border-subtle);
        min-height: 40px;
      }
      .music-library-track:hover { background: var(--bg-overlay); }
      .music-library-track-icon { color: var(--text-muted); font-size: 12px; flex-shrink: 0; }
      .music-library-track-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
      .music-library-track-name {
        font-size: 12px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .music-library-track-soundtrack {
        font-size: 10px;
        color: var(--text-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .music-library-track-preview {
        width: 28px; height: 28px;
        border-radius: 4px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        color: var(--text-primary);
        cursor: pointer;
        font-size: 11px;
        flex-shrink: 0;
      }
      .music-library-track-preview:hover { border-color: var(--accent); }
      .music-library-track-preview.playing {
        background: var(--accent);
        color: var(--bg-base);
        border-color: var(--accent);
      }

      /* T1 / T2 / Combat toggle badges. Outline = membership off,
         filled = membership on, fill+pulse = currently active on
         that channel (wired to audioStore.<channel>.filePath). */
      .music-library-badge {
        width: 28px; height: 28px;
        border-radius: 4px;
        border: 1.5px solid var(--badge-color, var(--border));
        background: transparent;
        color: var(--badge-color, var(--text-secondary));
        cursor: pointer;
        font-size: 10px; font-weight: 700;
        flex-shrink: 0;
        font-family: var(--font-mono);
      }
      .music-library-badge.ch-track1 { --badge-color: #4a9eff; }
      .music-library-badge.ch-track2 { --badge-color: #10b981; }
      .music-library-badge.ch-combat { --badge-color: #ef4444; }
      .music-library-badge.assigned {
        background: var(--badge-color);
        color: #fff;
      }
      .music-library-badge.active {
        box-shadow: 0 0 0 2px var(--badge-color), 0 0 8px var(--badge-color);
      }

      .music-library-track-menu { position: relative; flex-shrink: 0; }
      .music-library-track-menu summary {
        list-style: none;
        cursor: pointer;
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 4px;
        color: var(--text-muted);
      }
      .music-library-track-menu summary::-webkit-details-marker { display: none; }
      .music-library-track-menu summary:hover { background: var(--bg-overlay); color: var(--text-primary); }
      .music-library-track-menu-list {
        position: absolute; top: 100%; right: 0; z-index: 30;
        min-width: 180px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        padding: 4px 0;
        display: flex; flex-direction: column;
      }
      .music-library-track-menu-list button {
        text-align: left;
        background: none;
        border: none;
        padding: 6px 12px;
        color: var(--text-primary);
        font-size: 12px;
        cursor: pointer;
      }
      .music-library-track-menu-list button:hover { background: var(--bg-overlay); }
      .music-library-track-menu-list button.danger { color: var(--danger); }

      .music-library-sidebar {
        overflow-y: auto;
        padding: 12px 14px;
        background: var(--bg-elevated);
      }
      .music-library-sidebar-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 0 0 12px;
        color: var(--text-secondary);
      }
      .music-library-slot {
        margin-bottom: 12px;
        border-left: 3px solid var(--slot-color, var(--border));
        padding-left: 8px;
        opacity: 0.85;
        transition: opacity 200ms, box-shadow 200ms;
      }
      .music-library-slot.ch-track1 { --slot-color: #4a9eff; }
      .music-library-slot.ch-track2 { --slot-color: #10b981; }
      .music-library-slot.ch-combat { --slot-color: #ef4444; }
      .music-library-slot.playing {
        opacity: 1;
        box-shadow: -3px 0 0 0 var(--slot-color), -3px 0 12px 0 var(--slot-color);
      }
      .music-library-slot-header {
        display: flex; align-items: center; justify-content: space-between;
        padding-bottom: 4px;
      }
      .music-library-slot-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--slot-color);
      }
      .music-library-slot-count {
        font-size: 10px;
        font-family: var(--font-mono);
        color: var(--text-muted);
        padding: 1px 6px;
        background: var(--bg-base);
        border-radius: 999px;
      }
      .music-library-slot-empty {
        font-size: 11px;
        color: var(--text-muted);
        padding: 4px 0;
      }
      .music-library-slot-list { list-style: none; margin: 0; padding: 0; }
      .music-library-slot-item {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 6px;
        margin: 2px 0;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
      }
      .music-library-slot-item:hover { background: var(--bg-overlay); }
      .music-library-slot-item.active { color: var(--slot-color); font-weight: 600; }
      .music-library-slot-item .music-library-slot-active { color: var(--slot-color); }
      .music-library-slot-name {
        flex: 1; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
    `}</style>
  )
}
