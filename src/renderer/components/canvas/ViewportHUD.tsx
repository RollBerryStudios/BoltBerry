import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'

// Compact read-only chip at the bottom-left of the canvas.
// Shows the active map name, current zoom %, and grid scale (ft per cell).
// Meant to answer "where am I? how zoomed in am I? what scale is this?" at a glance.
export function ViewportHUD() {
  const { t } = useTranslation()
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const maps = useCampaignStore((s) => s.activeMaps)
  const scale = useMapTransformStore((s) => s.scale)
  const fitScale = useMapTransformStore((s) => s.fitScale)

  const map = maps.find((m) => m.id === activeMapId)
  if (!map) return null

  const relPct = fitScale ? Math.round((scale / fitScale) * 100) : Math.round(scale * 100)
  const gridLabel = map.gridType === 'none'
    ? t('canvas.hud.noGrid')
    : `${map.gridSize}px · ${map.ftPerUnit}${t('canvas.hud.ftSuffix')}`

  return (
    <div
      className="viewport-hud"
      role="status"
      aria-label={t('canvas.hud.viewportLabel')}
      title={`${map.name} · ${relPct}% · ${gridLabel}`}
    >
      <span className="viewport-hud-map" title={map.name}>{map.name}</span>
      <span className="viewport-hud-sep">·</span>
      <span className="viewport-hud-zoom">{relPct}%</span>
      <span className="viewport-hud-sep">·</span>
      <span className="viewport-hud-grid">{gridLabel}</span>
    </div>
  )
}
