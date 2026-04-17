import { useTranslation } from 'react-i18next'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'

/**
 * Always-visible indicator of the currently armed tool. The top toolbar
 * highlights the active button too, but at a glance on a 1440p screen
 * with a map zoomed in, that highlight is miles away — DMs reported
 * firing clicks without realising which tool was active (fog vs. draw
 * vs. select). This chip sits above the viewport-HUD and names the tool
 * directly on the canvas. Hidden for `select` since that's the idle state
 * and announcing "select" would be noise.
 */
interface ToolMeta {
  icon: string
  labelKey: string
}

const TOOL_META: Partial<Record<ActiveTool, ToolMeta>> = {
  pointer:          { icon: '👆', labelKey: 'toolbar.tools.pointer' },
  token:            { icon: '⬤',  labelKey: 'toolbar.tools.token' },
  'fog-brush':      { icon: '🖌', labelKey: 'toolbar.tools.fogBrush' },
  'fog-brush-cover':{ icon: '✏',  labelKey: 'toolbar.tools.fogBrushCover' },
  'fog-rect':       { icon: '▭',  labelKey: 'toolbar.tools.fogRect' },
  'fog-polygon':    { icon: '⬡',  labelKey: 'toolbar.tools.fogPolygon' },
  'fog-cover':      { icon: '▮',  labelKey: 'toolbar.tools.fogCover' },
  'measure-line':   { icon: '📏', labelKey: 'toolbar.tools.measureLine' },
  'measure-circle': { icon: '◎',  labelKey: 'toolbar.tools.measureCircle' },
  'measure-cone':   { icon: '◿',  labelKey: 'toolbar.tools.measureCone' },
  'draw-freehand':  { icon: '✏️', labelKey: 'toolbar.tools.drawFreehand' },
  'draw-rect':      { icon: '▢',  labelKey: 'toolbar.tools.drawRect' },
  'draw-circle':    { icon: '○',  labelKey: 'toolbar.tools.drawCircle' },
  'draw-text':      { icon: 'T',  labelKey: 'toolbar.tools.drawText' },
  'wall-draw':      { icon: '🧱', labelKey: 'toolbar.tools.wallDraw' },
  'wall-door':      { icon: '🚪', labelKey: 'toolbar.tools.wallDoor' },
  room:             { icon: '🏠', labelKey: 'toolbar.tools.room' },
  atmosphere:       { icon: '🖼', labelKey: 'toolbar.tools.atmosphere' },
}

export function ActiveToolHUD() {
  const { t } = useTranslation()
  const activeTool = useUIStore((s) => s.activeTool)
  const meta = TOOL_META[activeTool]

  if (!meta) return null

  return (
    <div className="active-tool-hud" role="status" aria-live="polite">
      <span className="active-tool-hud-icon" aria-hidden="true">{meta.icon}</span>
      <span className="active-tool-hud-label">{t(meta.labelKey)}</span>
    </div>
  )
}
