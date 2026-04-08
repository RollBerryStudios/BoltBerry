import { RefObject } from 'react'
import { Layer, Circle, Shape } from 'react-konva'
import Konva from 'konva'
import { useTokenStore } from '../../stores/tokenStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'

interface LightingLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

export function LightingLayer({ stageRef, mapId, gridSize }: LightingLayerProps) {
  const { tokens } = useTokenStore()
  const { scale, offsetX, offsetY } = useMapTransformStore()
  const { activeMapId } = useCampaignStore()

  if (activeMapId !== mapId) return null

  const tokensWithLight = tokens.filter((t) => {
    return t.notes && t.notes.includes('light:')
  })

  if (tokensWithLight.length === 0) return null

  return (
    <Layer listening={false} opacity={0.6}>
      {tokensWithLight.map((token) => {
        const match = token.notes?.match(/light:(\d+)(?::(#\w+))?/)
        if (!match) return null
        const lightRadius = parseInt(match[1]) || 0
        const lightColor = match[2] || '#ffcc44'
        if (lightRadius <= 0) return null

        const sx = token.x * scale + offsetX
        const sy = token.y * scale + offsetY
        const sizePx = gridSize * token.size * scale
        const cx = sx + sizePx / 2
        const cy = sy + sizePx / 2
        const rPx = lightRadius * gridSize * scale

        return (
          <Shape
            key={`light-${token.id}`}
            listening={false}
            sceneFunc={(ctx) => {
              const context = (ctx as any)._context
              context.save()
              const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, rPx)
              gradient.addColorStop(0, lightColor + '44')
              gradient.addColorStop(0.5, lightColor + '22')
              gradient.addColorStop(1, lightColor + '00')
              context.fillStyle = gradient
              context.beginPath()
              context.arc(cx, cy, rPx, 0, Math.PI * 2)
              context.fill()
              context.restore()
            }}
          />
        )
      })}
    </Layer>
  )
}