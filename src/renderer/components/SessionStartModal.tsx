import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'
import { Modal } from './shared/Modal'

interface SessionStartModalProps {
  onConfirm: () => void
  onCancel: () => void
  onOpenPlayerWindow: () => void
}

export function SessionStartModal({ onConfirm, onCancel, onOpenPlayerWindow }: SessionStartModalProps) {
  const { t } = useTranslation()
  const playerConnected = useSessionStore((s) => s.playerConnected)
  const tokens = useTokenStore((s) => s.tokens)
  const { activeMaps, activeMapId } = useCampaignStore()
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null)

  const activeMap = activeMaps.find((m) => m.id === activeMapId)
  const visibleTokenCount = tokens.filter((t) => t.visibleToPlayers).length

  function handleGoLive() {
    if (!playerConnected) {
      setConfirmWarning(t('sessionStart.warnNoPlayerWindow'))
    } else if (visibleTokenCount === 0) {
      setConfirmWarning(t('sessionStart.warnNoVisibleTokens'))
    } else {
      onConfirm()
    }
  }

  return (
    <Modal
      onClose={onCancel}
      ariaLabel={t('sessionStart.title')}
      style={{ padding: 'var(--sp-6)', width: 380 }}
    >
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 700, marginBottom: 4 }}>
          {t('sessionStart.title')}
        </h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-5)' }}>
          {t('sessionStart.subtitle')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
          {/* Player window */}
          <CheckRow
            ok={playerConnected}
            icon="🖥"
            label={playerConnected
              ? t('sessionStart.playerWindowConnected')
              : t('sessionStart.playerWindowNotOpen')}
            action={!playerConnected ? (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                onClick={onOpenPlayerWindow}
              >
                {t('sessionStart.open')}
              </button>
            ) : undefined}
          />

          {/* Active map */}
          <CheckRow
            ok={!!activeMap}
            icon="🗺"
            label={activeMap
              ? t('sessionStart.mapLoaded', { name: activeMap.name })
              : t('sessionStart.mapNotLoaded')}
          />

          {/* Visible tokens */}
          <CheckRow
            ok={visibleTokenCount > 0}
            warn={visibleTokenCount === 0}
            icon="⬤"
            label={visibleTokenCount > 0
              ? t('sessionStart.tokensVisible', { count: visibleTokenCount })
              : t('sessionStart.tokensNoneVisible')}
          />
        </div>

        {confirmWarning && (
          <div style={{
            marginBottom: 'var(--sp-4)',
            padding: 'var(--sp-3)',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.4)',
            borderRadius: 'var(--radius)',
          }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', margin: '0 0 var(--sp-3)' }}>
              {confirmWarning}
            </p>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-xs)' }}
                onClick={() => setConfirmWarning(null)}
              >
                {t('sessionStart.cancel')}
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 'var(--text-xs)', background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}
                onClick={() => { setConfirmWarning(null); onConfirm() }}
              >
                {t('sessionStart.continueAnyway')}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('sessionStart.cancel')}
          </button>
          <button
            className="btn btn-primary"
            style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}
            onClick={handleGoLive}
          >
            {t('sessionStart.goLive')}
          </button>
        </div>
    </Modal>
  )
}

function CheckRow({
  ok, warn, icon, label, action,
}: {
  ok: boolean
  warn?: boolean
  icon: string
  label: string
  action?: ReactNode
}) {
  const color = ok ? 'var(--success)' : warn ? 'var(--warning)' : 'var(--text-muted)'
  const statusIcon = ok ? '✓' : warn ? '!' : '⚠'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
      padding: 'var(--sp-2) var(--sp-3)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>{label}</span>
      {action}
      <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>{statusIcon}</span>
    </div>
  )
}
