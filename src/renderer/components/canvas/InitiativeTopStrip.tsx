import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/uiStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useImageUrl } from '../../hooks/useImageUrl'
import type { InitiativeEntry } from '@shared/ipc-types'

/**
 * Horizontal portrait strip docked top-center of the canvas during combat.
 * Replaces the prior text-only CombatHUD with at-a-glance combatant cards
 * (portrait, name, HP bar, current-turn highlight). Click a card to jump
 * the selection to that token. Initiative roll order is left-to-right.
 *
 * Inspired by Alchemy RPG's combat tracker — the goal is to surface the
 * full turn order without forcing the DM to open the right sidebar.
 */
export function InitiativeTopStrip() {
  const { t } = useTranslation()
  const workMode = useUIStore((s) => s.workMode)
  const entries = useInitiativeStore((s) => s.entries)
  const round = useInitiativeStore((s) => s.round)

  if (workMode !== 'combat' || entries.length === 0) return null

  return (
    <div
      className="initiative-strip canvas-hud-fade"
      role="status"
      aria-label={t('canvas.hud.combatLabel')}
    >
      <div className="initiative-strip-round">
        <span className="initiative-strip-round-label">{t('canvas.hud.round')}</span>
        <span className="initiative-strip-round-value">{round}</span>
      </div>

      <div className="initiative-strip-list">
        {entries.map((entry) => (
          <CombatantCard key={entry.id} entry={entry} />
        ))}
      </div>

      <button
        type="button"
        className="initiative-strip-next"
        onClick={() => useInitiativeStore.getState().nextTurn()}
        title={t('canvas.hud.endTurn')}
        aria-label={t('canvas.hud.endTurn')}
      >
        {t('canvas.hud.endTurn')} ›
      </button>
    </div>
  )
}

function CombatantCard({ entry }: { entry: InitiativeEntry }) {
  const token = useTokenStore((s) =>
    entry.tokenId !== null ? s.tokens.find((tok) => tok.id === entry.tokenId) ?? null : null
  )
  const setSelectedToken = useUIStore((s) => s.setSelectedToken)
  const portraitUrl = useImageUrl(token?.imagePath ?? null)

  const hpCurrent = token?.hpCurrent ?? 0
  const hpMax = token?.hpMax ?? 0
  const hpPct = hpMax > 0 ? Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100)) : 0
  const hpColor = hpPct > 60 ? 'var(--hp-high)' : hpPct > 25 ? 'var(--hp-mid)' : 'var(--hp-low)'

  const initial = entry.combatantName.trim().charAt(0).toUpperCase() || '?'

  function handleClick() {
    if (token) setSelectedToken(token.id)
  }

  return (
    <button
      type="button"
      className={`initiative-card${entry.currentTurn ? ' current' : ''}`}
      onClick={handleClick}
      title={`${entry.combatantName} · ${entry.roll}${hpMax > 0 ? ` · ${hpCurrent}/${hpMax} HP` : ''}`}
    >
      <div className="initiative-card-portrait">
        {portraitUrl ? (
          <img src={portraitUrl} alt="" />
        ) : (
          <span className="initiative-card-initial">{initial}</span>
        )}
        <span className="initiative-card-roll">{entry.roll}</span>
      </div>
      <div className="initiative-card-name">{entry.combatantName}</div>
      {hpMax > 0 && (
        <div className="initiative-card-hp">
          <div
            className="initiative-card-hp-fill"
            style={{ width: `${hpPct}%`, background: hpColor }}
          />
        </div>
      )}
    </button>
  )
}
