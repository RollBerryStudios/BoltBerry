import type { ReactNode } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useTokenStore } from '../stores/tokenStore'
import { useCampaignStore } from '../stores/campaignStore'

interface SessionStartModalProps {
  onConfirm: () => void
  onCancel: () => void
  onOpenPlayerWindow: () => void
}

export function SessionStartModal({ onConfirm, onCancel, onOpenPlayerWindow }: SessionStartModalProps) {
  const playerConnected = useUIStore((s) => s.playerConnected)
  const tokens = useTokenStore((s) => s.tokens)
  const { activeMaps, activeMapId } = useCampaignStore()

  const activeMap = activeMaps.find((m) => m.id === activeMapId)
  const visibleTokenCount = tokens.filter((t) => t.visibleToPlayers).length

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
            icon="🖥"
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
            icon="🗺"
            label={activeMap ? `Karte: ${activeMap.name}` : 'Keine Karte geladen'}
          />

          {/* Visible tokens */}
          <CheckRow
            ok={visibleTokenCount > 0}
            warn={visibleTokenCount === 0}
            icon="⬤"
            label={visibleTokenCount > 0
              ? `${visibleTokenCount} Token für Spieler sichtbar`
              : 'Keine Token für Spieler sichtbar'}
          />
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            className="btn btn-primary"
            style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}
            onClick={onConfirm}
          >
            ▶ Jetzt live gehen
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
  const statusIcon = ok ? '✓' : warn ? '!' : '○'

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
