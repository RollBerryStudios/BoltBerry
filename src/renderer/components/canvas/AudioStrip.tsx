import { useTranslation } from 'react-i18next'
import { useAudioStore, type ChannelId } from '../../stores/audioStore'
import { useUIStore } from '../../stores/uiStore'
import { useDockStore } from '../../stores/dockStore'

/**
 * Compact bottom-left floating audio strip (v1 Conservative). Shows the
 * currently-active channel (playing > loaded > first), a play/stop toggle,
 * and a handle that opens the full AudioPanel via the FloatingUtilityDock.
 * Hidden when no channel has a track loaded so it doesn't sit as an empty
 * shell on fresh campaigns.
 */
export function AudioStrip() {
  const { t } = useTranslation()
  const track1 = useAudioStore((s) => s.track1)
  const track2 = useAudioStore((s) => s.track2)
  const combat = useAudioStore((s) => s.combat)
  const playChannel = useAudioStore((s) => s.playChannel)
  const stopChannel = useAudioStore((s) => s.stopChannel)
  const setFloatingPanel = useUIStore((s) => s.setFloatingPanel)
  const dockAutoHide = useDockStore((s) => s.dockAutoHide)

  // Pick the channel worth surfacing. Playing wins; otherwise the first
  // loaded track; otherwise combat (it may be preloaded even if silent).
  const channels: Array<{ id: ChannelId; state: typeof track1 }> = [
    { id: 'track1', state: track1 },
    { id: 'track2', state: track2 },
    { id: 'combat', state: combat },
  ]
  const playing = channels.find((c) => c.state.playing)
  const loaded = playing ?? channels.find((c) => c.state.filePath)
  if (!loaded) return null

  const { id: activeChannel, state } = loaded
  const isPlaying = state.playing
  const label = state.fileName ?? ''

  const classes = ['audio-strip', dockAutoHide ? 'canvas-hud-fade' : '']
    .filter(Boolean).join(' ')

  const channelLabel =
    activeChannel === 'track1' ? t('audio.track1')
    : activeChannel === 'track2' ? t('audio.track2')
    : t('audio.combat')

  return (
    <div className={classes} role="group" aria-label={t('audio.strip')}>
      <button
        type="button"
        className={`audio-strip-play${isPlaying ? ' playing' : ''}`}
        onClick={() => isPlaying ? stopChannel(activeChannel) : playChannel(activeChannel)}
        title={isPlaying ? t('audio.pause') : t('audio.play')}
        aria-label={isPlaying ? t('audio.pause') : t('audio.play')}
      >
        {isPlaying ? '■' : '▶'}
      </button>
      <div className="audio-strip-meta">
        <span className="audio-strip-channel">{channelLabel}</span>
        <span className="audio-strip-track" title={label}>{label}</span>
      </div>
      <button
        type="button"
        className="audio-strip-expand"
        onClick={() => setFloatingPanel('audio')}
        title={t('audio.openPanel')}
        aria-label={t('audio.openPanel')}
      >
        ⋯
      </button>
    </div>
  )
}
