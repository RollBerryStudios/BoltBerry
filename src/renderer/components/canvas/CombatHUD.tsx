import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/uiStore'
import { useInitiativeStore } from '../../stores/initiativeStore'

// Top-center chip visible only while workMode === 'combat'.
// Surfaces the current round + whose turn it is, with a quick "end turn" button.
export function CombatHUD() {
  const { t } = useTranslation()
  const workMode = useUIStore((s) => s.workMode)
  const entries = useInitiativeStore((s) => s.entries)
  const round = useInitiativeStore((s) => s.round)

  if (workMode !== 'combat') return null
  if (entries.length === 0) return null

  const current = entries.find((e) => e.currentTurn) ?? entries[0]
  const currentIndex = entries.indexOf(current)
  const next = entries[(currentIndex + 1) % entries.length]

  return (
    <div className="combat-hud" role="status" aria-label={t('canvas.hud.combatLabel')}>
      <div className="combat-hud-round">
        <span className="combat-hud-round-label">{t('canvas.hud.round')}</span>
        <span className="combat-hud-round-value">{round}</span>
      </div>
      <div className="combat-hud-divider" />
      <div className="combat-hud-turn">
        <span className="combat-hud-turn-label">{t('canvas.hud.currentTurn')}</span>
        <span className="combat-hud-turn-name" title={current.combatantName}>{current.combatantName}</span>
      </div>
      <div className="combat-hud-divider" />
      <div className="combat-hud-next" title={next.combatantName}>
        <span className="combat-hud-next-label">{t('canvas.hud.upNext')}</span>
        <span className="combat-hud-next-name">{next.combatantName}</span>
      </div>
      <button
        type="button"
        className="combat-hud-btn"
        onClick={() => useInitiativeStore.getState().nextTurn()}
        title={t('canvas.hud.endTurn')}
        aria-label={t('canvas.hud.endTurn')}
      >
        {t('canvas.hud.endTurn')} ›
      </button>
    </div>
  )
}
