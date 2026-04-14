import { RefObject, useMemo } from 'react'
import { Layer, Shape } from 'react-konva'
import Konva from 'konva'
import { useTokenStore } from '../../stores/tokenStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'

interface LightToken {
  id: number
  cx: number
  cy: number
  rPx: number
  lightColor: string
}

interface LightingLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

export function LightingLayer({ stageRef, mapId, gridSize }: LightingLayerProps) {
  const tokens = useTokenStore((s) => s.tokens)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const activeMapId = useCampaignStore((s) => s.activeMapId)

  const lights: LightToken[] = useMemo(() => {
    if (activeMapId !== mapId) return []
    return tokens
      .filter((t) => t.lightRadius > 0)
      .map((token) => {
        const rawColor = token.lightColor || '#ffcc44'
        const lightColor = rawColor.length === 4
          ? '#' + rawColor[1] + rawColor[1] + rawColor[2] + rawColor[2] + rawColor[3] + rawColor[3]
          : rawColor
        const sx = token.x * scale + offsetX
        const sy = token.y * scale + offsetY
        const sizePx = gridSize * token.size * scale
        return {
          id: token.id,
          cx: sx + sizePx / 2,
          cy: sy + sizePx / 2,
          rPx: token.lightRadius * gridSize * scale,
          lightColor,
        }
      })
  }, [tokens, scale, offsetX, offsetY, gridSize, mapId, activeMapId])

  if (activeMapId !== mapId || lights.length === 0) return null

  return (
    <Layer listening={false} opacity={0.6} perfectDrawEnabled={false}>
      {lights.map((l) => (
        <Shape
          key={`light-${l.id}`}
          listening={false}
          perfectDrawEnabled={false}
          sceneFunc={(ctx) => {
            const context = (ctx as any)._context
            context.save()
            const gradient = context.createRadialGradient(l.cx, l.cy, 0, l.cx, l.cy, l.rPx)
            gradient.addColorStop(0, l.lightColor + '44')
            gradient.addColorStop(0.5, l.lightColor + '22')
            gradient.addColorStop(1, l.lightColor + '00')
            context.fillStyle = gradient
            context.beginPath()
            context.arc(l.cx, l.cy, l.rPx, 0, Math.PI * 2)
            context.fill()
            context.restore()
          }}
        />
      ))}
    </Layer>
  )
}
