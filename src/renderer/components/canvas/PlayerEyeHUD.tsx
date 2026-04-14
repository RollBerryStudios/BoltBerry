import { useMemo } from 'react'
import { useTokenStore } from '../../stores/tokenStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

export function PlayerEyeHUD() {
  const showPlayerEye = useUIStore((s) => s.showPlayerEye)
  const blackoutActive = useUIStore((s) => s.blackoutActive)
  const appMode = useUIStore((s) => s.appMode)
  const tokens = useTokenStore((s) => s.tokens)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const scale = useMapTransformStore((s) => s.scale)

  const mapTokens = useMemo(() =>
    tokens.filter((t) => t.mapId === activeMapId),
    [tokens, activeMapId]
  )

  const visibleCount = useMemo(() =>
    mapTokens.filter((t) => t.visibleToPlayers).length,
    [mapTokens]
  )

  const hiddenCount = useMemo(() =>
    mapTokens.filter((t) => !t.visibleToPlayers).length,
    [mapTokens]
  )

  const enemyVisible = useMemo(() =>
    mapTokens.filter((t) => t.visibleToPlayers && (t.faction === 'enemy' || t.faction === 'neutral')).length,
    [mapTokens]
  )

  const partyVisible = useMemo(() =>
    mapTokens.filter((t) => t.visibleToPlayers && t.faction === 'party').length,
    [mapTokens]
  )

  if (!showPlayerEye) return null

  const fogPercent = null
  const brightness = null

  return (
    <div style={{
      position: 'absolute',
      top: 36,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 150,
      display: 'flex',
      gap: 'var(--sp-3)',
      padding: 'var(--sp-2) var(--sp-4)',
      background: 'rgba(0,0,0,0.85)',
      border: '1px solid rgba(59,130,246,0.5)',
      borderRadius: 'var(--radius-lg)',
      backdropFilter: 'blur(8px)',
      pointerEvents: 'none',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <StatBadge icon="👁" label="Sichtbar" value={`${visibleCount}`} color="#22c55e" />
      <StatBadge icon="🙈" label="Versteckt" value={`${hiddenCount}`} color="#ef4444" />
      <StatBadge icon="⚔️" label="Gegner (sichtbar)" value={`${enemyVisible}`} color="#f59e0b" />
      <StatBadge icon="🛡" label="Party (sichtbar)" value={`${partyVisible}`} color="#3b82f6" />
      {blackoutActive && <StatBadge icon="⬛" label="Blackout" value="AKTIV" color="#ef4444" />}
      {appMode === 'atmosphere' && <StatBadge icon="🖼" label="Atmosphäre" value="AKTIV" color="#a855f7" />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(59,130,246,0.15)', borderRadius: 'var(--radius)', border: '1px solid rgba(59,130,246,0.3)' }}>
        <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>👁 SPIELER-SICHT MODUS</span>
      </div>
    </div>
  )
}

function StatBadge({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
      </div>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}