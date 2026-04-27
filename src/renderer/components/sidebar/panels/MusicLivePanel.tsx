import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAudioStore,
  type ChannelId,
  type PlaylistEntry,
} from '../../../stores/audioStore'
import { useCampaignStore } from '../../../stores/campaignStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: number): string {
  if (!s || !isFinite(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// ─── Channel strip ────────────────────────────────────────────────────────────
//
// Extracted from the v37 AudioPanel.tsx. Same UX as before — current
// track button (left-click swaps active when there are multiple in the
// channel's playlist; opens the file picker when empty); right-click
// or chevron drops a playlist menu; seek bar; play/stop; ambient set
// for track2; volume slider. The combat strip carries the combat-mode
// toggle pill in its header.

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
  const [dropdownDir, setDropdownDir] = useState<'down' | 'up'>('down')
  const menuRef = useRef<HTMLDivElement>(null)
  const fileBtnRef = useRef<HTMLButtonElement>(null)

  const disabled = chId !== 'combat' && combatActive

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

  // Flip the dropdown above the track button when "below" overflows
  // the viewport — mirrors the token context-menu clamp pattern.
  useLayoutEffect(() => {
    if (!showPlaylist) { setDropdownDir('down'); return }
    const btn = fileBtnRef.current
    const menu = menuRef.current
    if (!btn || !menu) return
    const btnRect = btn.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const spaceBelow = window.innerHeight - btnRect.bottom
    const spaceAbove = btnRect.top
    if (menuRect.height > spaceBelow - 8 && spaceAbove > spaceBelow) {
      setDropdownDir('up')
    } else {
      setDropdownDir('down')
    }
  }, [showPlaylist, ch.playlist.length])

  async function handleAddTrack() {
    if (!window.electronAPI || !activeCampaignId) return
    try {
      const result = await window.electronAPI.importFile('audio')
      if (!result) return
      const fileName = result.path.split(/[\\/]/).pop() ?? result.path
      const created = await window.electronAPI.tracks.create({
        campaignId: activeCampaignId, path: result.path, fileName,
      })
      await window.electronAPI.tracks.toggleAssignment(created.id, chId)
      const wasEmpty = ch.playlist.length === 0
      store.addPlaylistEntry(chId, { id: created.id, path: result.path, fileName }, wasEmpty)
      if (wasEmpty) store.loadChannel(chId, result.path)
    } catch (err) {
      console.error('[MusicLivePanel] addTrack failed:', err)
    }
  }

  function handleActivate(entry: PlaylistEntry) {
    store.loadChannel(chId, entry.path)
    setShowPlaylist(false)
  }

  async function handleRemoveTrack(entry: PlaylistEntry, evt: React.MouseEvent) {
    evt.stopPropagation()
    if (!window.electronAPI) return
    try {
      // Remove the channel-membership only; the track row stays in
      // the campaign library so the file is recoverable.
      await window.electronAPI.tracks.toggleAssignment(entry.id, chId)
      store.removePlaylistEntry(chId, entry.id)
    } catch (err) {
      console.error('[MusicLivePanel] removeTrack failed:', err)
    }
  }

  function handleChannelContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setShowPlaylist((v) => !v)
  }

  async function handleSetAmbient() {
    if (!activeMapId || !ch.filePath) return
    await window.electronAPI?.maps
      .setAmbientTrack(activeMapId, ch.filePath)
      .catch(console.error)
  }

  const classes = ['audio-channel', chId]
  if (disabled) classes.push('disabled')
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

      <div className="audio-channel-file-wrap">
        <button
          ref={fileBtnRef}
          className={`audio-channel-file${ch.filePath ? '' : ' empty'}`}
          onClick={() => {
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
              window.electronAPI?.maps.setChannelVolume(activeMapId, chId, vol)
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

// ─── MusicLivePanel ───────────────────────────────────────────────────────────

/**
 * Live music controls — three channel strips (track1, track2, combat)
 * plus master volume. Used in the floating audio popover during play
 * and (will be) in the right sidebar's audio section. Inventory
 * management lives in the workspace's MusicLibraryPanel; this panel
 * is purely about *driving* what's already in the library.
 */
export function MusicLivePanel() {
  const { t } = useTranslation()
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const {
    masterVolume, combatActive,
    setMasterVolume,
    activateCombat, deactivateCombat,
    setChannelPlaylist, clearAllPlaylists,
  } = useAudioStore()

  // Hydrate per-channel playlists from the canonical track library on
  // campaign change. Keyed on `activeCampaignId` so switches clear and
  // reload cleanly — without this, channels would bleed between
  // campaigns because ChannelState lives in the singleton store.
  useEffect(() => {
    if (!activeCampaignId) { clearAllPlaylists(); return }
    let cancelled = false
    void (async () => {
      try {
        const tracks = (await window.electronAPI?.tracks.listByCampaign(activeCampaignId)) ?? []
        if (cancelled) return
        const byChannel: Record<ChannelId, PlaylistEntry[]> = { track1: [], track2: [], combat: [] }
        for (const t of tracks) {
          for (const ch of t.assignments) {
            byChannel[ch]?.push({ id: t.id, path: t.path, fileName: t.fileName })
          }
        }
        setChannelPlaylist('track1', byChannel.track1)
        setChannelPlaylist('track2', byChannel.track2)
        setChannelPlaylist('combat', byChannel.combat)
      } catch (err) {
        console.error('[MusicLivePanel] loadPlaylists failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [activeCampaignId, setChannelPlaylist, clearAllPlaylists])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '8px 10px' }}>
      <div className="audio-master-row">
        <span className="audio-master-label">Master</span>
        <input type="range" min={0} max={1} step={0.01} value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span className="audio-master-value">{Math.round(masterVolume * 100)}%</span>
      </div>

      <ChannelStrip chId="track1" label={t('audio.track1')} activeMapId={activeMapId} activeCampaignId={activeCampaignId} />
      <ChannelStrip chId="track2" label={t('audio.track2')} activeMapId={activeMapId} activeCampaignId={activeCampaignId} />
      <ChannelStrip
        chId="combat"
        label={t('audio.combat')}
        activeMapId={activeMapId}
        activeCampaignId={activeCampaignId}
        combatControl={{
          active: combatActive,
          onToggle: combatActive ? deactivateCombat : activateCombat,
        }}
      />

      {!activeCampaignId && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: '8px 0 0' }}>
          {t('audio.noCampaign')}
        </div>
      )}
    </div>
  )
}
