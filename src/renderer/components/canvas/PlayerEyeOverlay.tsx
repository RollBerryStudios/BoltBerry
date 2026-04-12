import { useMemo } from 'react'
import { Layer, Group, Circle, Text } from 'react-konva'
import { useTokenStore } from '../../stores/tokenStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'
import type { MapRecord } from '@shared/ipc-types'

interface PlayerEyeOverlayProps {
  map: MapRecord
  stageRef: React.RefObject<any>
  canvasSize: { width: number; height: number }
}

export function PlayerEyeOverlay({ map, stageRef, canvasSize }: PlayerEyeOverlayProps) {
  const tokens = useTokenStore((s) => s.tokens)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const activeMapId = useCampaignStore((s) => s.activeMapId)

  // Single pass over the token list to derive all needed values
  const { hiddenTokens, visibleCount, enemyVisible, totalCount } = useMemo(() => {
    const mapTokens = tokens.filter((t) => t.mapId === activeMapId)
    const hidden = mapTokens.filter((t) => !t.visibleToPlayers)
    const visible = mapTokens.filter((t) => t.visibleToPlayers)
    return {
      hiddenTokens: hidden,
      visibleCount: visible.length,
      enemyVisible: visible.filter((t) => t.faction === 'enemy' || t.faction === 'neutral').length,
      totalCount: mapTokens.length,
    }
  }, [tokens, activeMapId])

  const markers = useMemo(() =>
    hiddenTokens.map((t) => {
      const sx = t.x * scale + offsetX
      const sy = t.y * scale + offsetY
      const size = map.gridSize * t.size * scale
      return {
        id: t.id,
        name: t.name,
        cx: sx + size / 2,
        cy: sy + size / 2,
        faction: t.faction,
      }
    }),
  [hiddenTokens, scale, offsetX, offsetY, map.gridSize])

  return (
    <Layer listening={false}>
      {markers.map((m) => (
        <Group key={`hidden-${m.id}`} listening={false}>
          <Circle
            x={m.cx}
            y={m.cy}
            radius={6}
            fill="rgba(239, 68, 68, 0.7)"
            stroke="#ffffff"
            strokeWidth={1}
          />
          <Circle
            x={m.cx}
            y={m.cy}
            radius={3}
            fill="#fff"
          />
          <Text
            text="🙈"
            x={m.cx - 6}
            y={m.cy - 18}
            fontSize={12}
            listening={false}
          />
          <Text
            text={m.name}
            x={m.cx + 8}
            y={m.cy - 5}
            fontSize={10}
            fill="#fca5a5"
            listening={false}
          />
        </Group>
      ))}

      <Group listening={false}>
        <Text
          x={8}
          y={42}
          text={`👁 Spieler-Sicht: ${visibleCount}/${totalCount} sichtbar · ${hiddenTokens.length} versteckt · ${enemyVisible} Gegner sichtbar`}
          fontSize={12}
          fontFamily="system-ui"
          fill="#94a3b8"
          padding={4}
        />
      </Group>
    </Layer>
  )
}
