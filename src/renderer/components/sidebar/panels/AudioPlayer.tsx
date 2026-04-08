import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { useAudioStore } from '../../../stores/audioStore'

export function AudioPlayer() {
  const { t } = useTranslation()
  const {
    filePath, fileName, isPlaying, volume, loop,
    currentTime, duration, playlist, playlistIndex,
    loadFile, play, pause, stop, setVolume, toggleLoop,
    addToPlaylist, removeFromPlaylist, clearPlaylist,
    playNext, playPrev, seekTo,
  } = useAudioStore()

  async function handleImport() {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.importFile('audio')
      if (result) {
        loadFile(result.path)
        addToPlaylist(result.path)
      }
    } catch (err) {
      console.error('[AudioPlayer] handleImport failed:', err)
    }
  }

  function formatTime(s: number) {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)' }}>
      <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-3)' }}>
        {t('audio.title')}
      </div>

      <button
        className="btn btn-ghost"
        style={{
          marginBottom: 'var(--sp-2)', textAlign: 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 'var(--text-xs)',
        }}
        onClick={handleImport}
        title={filePath ?? t('audio.loadFile')}
      >
        {fileName ?? t('audio.loadFile')}
      </button>

      {filePath && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'monospace', minWidth: 32 }}>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0} max={duration || 100} step={0.1}
            value={currentTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            style={{ flex: 1 }}
            disabled={!duration}
          />
          <span style={{ fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>{formatTime(duration)}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <button className="btn btn-ghost btn-icon" onClick={playPrev} disabled={playlistIndex <= 0} title="Previous">⏮</button>
        <button
          className="btn btn-primary btn-icon"
          onClick={isPlaying ? pause : play}
          disabled={!filePath}
          title={isPlaying ? t('audio.pause') : t('audio.play')}
          style={{ flex: 1 }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={playNext} disabled={playlistIndex >= playlist.length - 1} title="Next">⏭</button>
        <button
          className="btn btn-ghost btn-icon"
          onClick={stop}
          disabled={!filePath}
          title={t('audio.stop')}
        >
          ⏹
        </button>
        <button
          className={clsx('btn btn-icon', loop ? 'btn-primary' : 'btn-ghost')}
          onClick={toggleLoop}
          disabled={!filePath}
          title={t('audio.loop')}
        >
          🔁
        </button>
      </div>

      {loop && isPlaying && (
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--accent-green, #22c55e)',
          marginBottom: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ animation: 'pulse 2s infinite' }}>🔁</span> Looping
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
          {t('audio.volume')}
        </span>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{ flex: 1 }}
          disabled={!filePath}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 30, textAlign: 'right' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {playlist.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-1)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Playlist</span>
            <button className="btn btn-ghost" style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }} onClick={clearPlaylist}>Clear</button>
          </div>
          {playlist.map((entry, i) => (
            <div
              key={`${entry.path}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-1)',
                padding: 'var(--sp-1) var(--sp-2)',
                background: i === playlistIndex ? 'var(--accent-blue-dim)' : 'transparent',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                color: i === playlistIndex ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
              }}
            onClick={() => {
              useAudioStore.getState().loadFile(entry.path)
              useAudioStore.getState().play()
            }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
              <button
                className="btn btn-ghost"
                style={{ padding: '0 2px', fontSize: 10, lineHeight: '14px', minHeight: 14 }}
                onClick={(e) => { e.stopPropagation(); removeFromPlaylist(i) }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}