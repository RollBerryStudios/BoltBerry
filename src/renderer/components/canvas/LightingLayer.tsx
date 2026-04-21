import { RefObject, useMemo } from 'react'
import { Layer, Shape } from 'react-konva'
import Konva from 'konva'
import { useTokenStore } from '../../stores/tokenStore'
import { useWallStore } from '../../stores/wallStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

// Accept the hex shapes actually produced by the token editor and the
// bundled defaults (#rgb, #rrggbb). Anything else falls back to the
// sensible default rather than silently corrupting the gradient.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
function isValidHexColor(s: string): boolean { return HEX_COLOR_RE.test(s) }
import { useCampaignStore } from '../../stores/campaignStore'
import { computeVisibilityPolygon, type Segment } from '../../utils/losEngine'

interface LightToken {
  id: number
  /** center in map-image pixels */
  cx: number
  cy: number
  /** radius in map-image pixels */
  rPx: number
  lightColor: string
}

interface LightingLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

export function LightingLayer({ mapId, gridSize }: LightingLayerProps) {
  const tokens    = useTokenStore((s) => s.tokens)
  const walls     = useWallStore((s) => s.walls)
  const scale     = useMapTransformStore((s) => s.scale)
  const offsetX   = useMapTransformStore((s) => s.offsetX)
  const offsetY   = useMapTransformStore((s) => s.offsetY)
  const imgW      = useMapTransformStore((s) => s.imgW)
  const imgH      = useMapTransformStore((s) => s.imgH)
  const activeMapId = useCampaignStore((s) => s.activeMapId)

  // Walls for the active map as Segment[] (map-image pixels)
  const segments: Segment[] = useMemo(
    () => walls
      .filter((w) => w.mapId === mapId)
      .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState })),
    [walls, mapId]
  )

  // Light sources for this map (map-image pixel coords)
  const lights: LightToken[] = useMemo(() => {
    if (activeMapId !== mapId) return []
    return tokens
      // Filter out bad light data: NaN / negative / non-finite radii, and
      // anything that isn't a real positive number. A NaN sneaks in when the
      // DB column round-trips through a broken import or a dirty template.
      .filter((t) => Number.isFinite(t.lightRadius) && t.lightRadius > 0)
      .map((token) => {
        const rawColor = token.lightColor && isValidHexColor(token.lightColor)
          ? token.lightColor
          : '#ffcc44'
        const lightColor = rawColor.length === 4
          ? '#' + rawColor[1] + rawColor[1] + rawColor[2] + rawColor[2] + rawColor[3] + rawColor[3]
          : rawColor
        const cx = token.x + (token.size * gridSize) / 2
        const cy = token.y + (token.size * gridSize) / 2
        return { id: token.id, cx, cy, rPx: token.lightRadius * gridSize, lightColor }
      })
  }, [tokens, gridSize, mapId, activeMapId])

  // LOS polygons are expensive (O(S) ray casts per light against every
  // wall segment) and only depend on the lights + map geometry — NOT on
  // scale / offset. Without this memo, every pan, zoom, pointer-move,
  // or measure-tool tick re-ran all the polygons because LightingLayer
  // re-rendered with fresh `scale` / `offsetX` / `offsetY` store
  // subscriptions. Recompute keyed on the stuff that actually shifts
  // the visibility geometry.
  const polygonsByLight = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const l of lights) {
      m.set(l.id, computeVisibilityPolygon(l.cx, l.cy, l.rPx, segments, imgW, imgH))
    }
    return m
  }, [lights, segments, imgW, imgH])

  if (activeMapId !== mapId || lights.length === 0) return null

  return (
    <Layer listening={false} opacity={0.6} perfectDrawEnabled={false}>
      {lights.map((l) => {
        const poly = polygonsByLight.get(l.id) ?? []

        // Convert polygon to screen coords. Cheap per-frame work — the
        // heavy part (ray-casting against walls) stays cached in
        // `polygonsByLight`.
        const screenPoly: number[] = []
        for (let i = 0; i < poly.length; i += 2) {
          screenPoly.push(poly[i] * scale + offsetX, poly[i + 1] * scale + offsetY)
        }

        const scx = l.cx * scale + offsetX
        const scy = l.cy * scale + offsetY
        const srPx = l.rPx * scale

        return (
          <Shape
            key={`light-${l.id}`}
            listening={false}
            perfectDrawEnabled={false}
            sceneFunc={(ctx) => {
              const context = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
              context.save()

              if (screenPoly.length >= 6) {
                // Clip to LOS polygon so light doesn't bleed through walls
                context.beginPath()
                context.moveTo(screenPoly[0], screenPoly[1])
                for (let i = 2; i < screenPoly.length; i += 2) {
                  context.lineTo(screenPoly[i], screenPoly[i + 1])
                }
                context.closePath()
                context.clip()
              } else {
                // No walls or degenerate poly — clip to circle only
                context.beginPath()
                context.arc(scx, scy, srPx, 0, Math.PI * 2)
                context.clip()
              }

              // Radial gradient fill
              const gradient = context.createRadialGradient(scx, scy, 0, scx, scy, srPx)
              gradient.addColorStop(0,   l.lightColor + '44')
              gradient.addColorStop(0.5, l.lightColor + '22')
              gradient.addColorStop(1,   l.lightColor + '00')
              context.fillStyle = gradient
              context.beginPath()
              context.arc(scx, scy, srPx, 0, Math.PI * 2)
              context.fill()

              context.restore()
            }}
          />
        )
      })}
    </Layer>
  )
}
