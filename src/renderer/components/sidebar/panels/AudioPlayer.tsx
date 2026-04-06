import clsx from 'clsx'
import { useAudioStore } from '../../../stores/audioStore'

export function AudioPlayer() {
  const {
    filePath, fileName, isPlaying, volume, loop,
    loadFile, play, pause, stop, setVolume, toggleLoop,
  } = useAudioStore()

  async function handleImport() {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.importFile('audio')
      if (result) loadFile(result.path)
    } catch (err) {
      console.error('[AudioPlayer] handleImport failed:', err)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)' }}>
      <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-3)' }}>
        Hintergrundmusik
      </div>

      {/* File selector */}
      <button
        className="btn btn-ghost"
        style={{
          marginBottom: 'var(--sp-3)', textAlign: 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 'var(--text-xs)',
        }}
        onClick={handleImport}
        title={filePath ?? 'Keine Datei geladen'}
      >
        {fileName ?? '♪ Datei laden…'}
      </button>

      {/* Playback controls */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
        <button
          className="btn btn-primary btn-icon"
          onClick={isPlaying ? pause : play}
          disabled={!filePath}
          title={isPlaying ? 'Pause' : 'Abspielen'}
          style={{ flex: 1 }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="btn btn-ghost btn-icon"
          onClick={stop}
          disabled={!filePath}
          title="Stop / An den Anfang"
        >
          ⏹
        </button>
        <button
          className={clsx('btn btn-icon', loop ? 'btn-primary' : 'btn-ghost')}
          onClick={toggleLoop}
          title={loop ? 'Wiederholen: an' : 'Wiederholen: aus'}
        >
          🔁
        </button>
      </div>

      {/* Volume slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 16 }}>🔈</span>
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {!filePath && (
        <div className="empty-state" style={{ marginTop: 'auto', paddingBottom: 'var(--sp-8)' }}>
          <div className="empty-state-icon">🎵</div>
          <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Keine Musik geladen</div>
          <div className="empty-state-desc">MP3, OGG oder WAV importieren</div>
        </div>
      )}
    </div>
  )
}
