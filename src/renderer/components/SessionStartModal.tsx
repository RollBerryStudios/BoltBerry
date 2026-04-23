import { useState } from 'react'
import type { ReactNode } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'

interface SessionStartModalProps {
  onConfirm: () => void
  onCancel: () => void
  onOpenPlayerWindow: () => void
}

export function SessionStartModal({ onConfirm, onCancel, onOpenPlayerWindow }: SessionStartModalProps) {
  const playerConnected = useSessionStore((s) => s.playerConnected)
  const tokens = useTokenStore((s) => s.tokens)
  const { activeMaps, activeMapId } = useCampaignStore()
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null)

  const activeMap = activeMaps.find((m) => m.id === activeMapId)
  const visibleTokenCount = tokens.filter((t) => t.visibleToPlayers).length

  function handleGoLive() {
    if (!playerConnected) {
      setConfirmWarning('Das Spielerfenster ist nicht geöffnet. Trotzdem live gehen?')
    } else if (visibleTokenCount === 0) {
      setConfirmWarning('Keine Token sind für Spieler sichtbar. Trotzdem live gehen?')
    } else {
      onConfirm()
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-6)',
        width: 380,
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
      }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 700, marginBottom: 4 }}>
          Session starten
        </h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-5)' }}>
          Ab jetzt werden alle Änderungen live an die Spieler gesendet.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
          {/* Player window */}
          <CheckRow
            ok={playerConnected}
            icon="ðŸ–¥"
            label={playerConnected ? 'Spielerfenster verbunden' : 'Spielerfenster nicht geöffnet'}
            action={!playerConnected ? (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                onClick={onOpenPlayerWindow}
              >
                Öffnen
              </button>
            ) : undefined}
          />

          {/* Active map */}
          <CheckRow
            ok={!!activeMap}
            icon="ðŸ—º"
            label={activeMap ? `Karte: ${activeMap.name}` : 'Keine Karte geladen'}
          />

          {/* Visible tokens */}
          <CheckRow
            ok={visibleTokenCount > 0}
            warn={visibleTokenCount === 0}
            icon="â¬¤"
            label={visibleTokenCount > 0
              ? `${visibleTokenCount} Token für Spieler sichtbar`
              : 'Keine Token für Spieler sichtbar'}
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
                Abbrechen
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 'var(--text-xs)', background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}
                onClick={() => { setConfirmWarning(null); onConfirm() }}
              >
                –¶ Trotzdem fortfahren
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            className="btn btn-primary"
            style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}
            onClick={handleGoLive}
          >
            –¶ Jetzt live gehen
          </button>
        </div>
      </div>
    </div>
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
  const statusIcon = ok ? 'âœ“' : warn ? '!' : 'â—‹'

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
