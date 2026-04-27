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
  const combatActive = useAudioStore((s) => s.combatActive)
  const activateCombat = useAudioStore((s) => s.activateCombat)
  const deactivateCombat = useAudioStore((s) => s.deactivateCombat)
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

  // Combat-mode toggle is also surfaced when no channel is loaded, so
  // the DM can pre-arm the combat duck even on a fresh campaign. The
  // strip stays mounted in that case; the play/track meta block hides
  // until something is loaded.
  const hasLoaded = !!loaded

  const classes = ['audio-strip', dockAutoHide ? 'canvas-hud-fade' : '']
    .filter(Boolean).join(' ')

  return (
    <div className={classes} role="group" aria-label={t('audio.strip')}>
      {/* Combat toggle — prominent, always visible. Ducks track1+track2
          and brings the combat channel forward when active. Lights up
          red when on so it's clear at a glance even without opening
          the full audio popover. */}
      <button
        type="button"
        className={`audio-strip-combat${combatActive ? ' active' : ''}`}
        onClick={() => combatActive ? deactivateCombat() : activateCombat()}
        title={combatActive ? t('audio.endCombat') : t('audio.startCombat')}
        aria-pressed={combatActive}
      >
        ⚔️
      </button>

      {hasLoaded && (
        <>
          <button
            type="button"
            className={`audio-strip-play${loaded!.state.playing ? ' playing' : ''}`}
            onClick={() => loaded!.state.playing ? stopChannel(loaded!.id) : playChannel(loaded!.id)}
            title={loaded!.state.playing ? t('audio.pause') : t('audio.play')}
            aria-label={loaded!.state.playing ? t('audio.pause') : t('audio.play')}
          >
            {loaded!.state.playing ? '■' : '▶'}
          </button>
          <div className="audio-strip-meta">
            <span className="audio-strip-channel">
              {loaded!.id === 'track1' ? t('audio.track1')
                : loaded!.id === 'track2' ? t('audio.track2')
                : t('audio.combat')}
            </span>
            <span className="audio-strip-track" title={loaded!.state.fileName ?? ''}>
              {loaded!.state.fileName ?? ''}
            </span>
          </div>
        </>
      )}

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
