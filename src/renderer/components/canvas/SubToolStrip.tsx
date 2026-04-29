import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useDockStore } from '../../stores/dockStore'

/**
 * Contextual sub-tool strip (v1 Conservative "SubToolStrip"). A floating
 * horizontal strip anchored top-left of the canvas, just right of the
 * LeftToolDock. Renders tool-specific option presets:
 *
 *  - fog brush / brush-cover   → size presets, reveal/cover mode
 *  - measure-*                 → shape toggle (line/circle/cone)
 *  - wall-*                    → wall/door toggle
 *  - draw-*                    → stroke-width presets, color swatches
 *
 * Returns null when the active tool has no configurable presets so the
 * strip never shows an empty shell. The strip is purely a convenience
 * layer on top of existing tool state — every control maps 1:1 to an
 * existing uiStore field so the toolbar / keyboard shortcuts keep working.
 */
export function SubToolStrip() {
  const { t } = useTranslation()
  const activeTool = useUIStore((s) => s.activeTool)
  const workMode = useSessionStore((s) => s.workMode)
  const fogBrushRadius = useUIStore((s) => s.fogBrushRadius)
  const setFogBrushRadius = useUIStore((s) => s.setFogBrushRadius)
  const drawWidth = useUIStore((s) => s.drawWidth)
  const setDrawWidth = useUIStore((s) => s.setDrawWidth)
  const drawColor = useUIStore((s) => s.drawColor)
  const setDrawColor = useUIStore((s) => s.setDrawColor)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const dockAutoHide = useDockStore((s) => s.dockAutoHide)

  if (workMode === 'player-preview') return null

  const content = renderContent()
  if (!content) return null

  // When combat mode is active, the InitiativeTopStrip anchors at top:12
  // in the same horizontal plane. Shift the SubToolStrip down by a
  // strip-height so the two don't fight for the same pixel row.
  const shiftForInitiative = workMode === 'combat'
  const classes = [
    'sub-tool-strip',
    shiftForInitiative ? 'sub-tool-strip--low' : '',
    dockAutoHide ? 'canvas-hud-fade' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} role="toolbar" aria-label={t('subtool.label')}>
      {content}
    </div>
  )

  function renderContent() {
    // Fog brush: size presets + reveal/cover switch.
    if (activeTool === 'fog-brush' || activeTool === 'fog-brush-cover') {
      const isCover = activeTool === 'fog-brush-cover'
      return (
        <>
          <Seg label={t('subtool.fogBrush')} />
          {[20, 60, 120].map((size) => (
            <Pill
              key={size}
              label={`${size}`}
              mono
              active={fogBrushRadius === size}
              onClick={() => setFogBrushRadius(size)}
            />
          ))}
          <Divider />
          <Pill
            label={t('subtool.reveal')}
            shortcut="B"
            active={!isCover}
            onClick={() => setActiveTool('fog-brush')}
          />
          <Pill
            label={t('subtool.cover')}
            shortcut="X"
            active={isCover}
            onClick={() => setActiveTool('fog-brush-cover')}
          />
        </>
      )
    }

    // Fog rect / polygon / cover — only need reveal/cover toggle via tool IDs.
    if (activeTool === 'fog-rect' || activeTool === 'fog-polygon' || activeTool === 'fog-cover') {
      const isCover = activeTool === 'fog-cover'
      return (
        <>
          <Seg label={t('subtool.fogShape')} />
          <Pill label={t('toolbar.tools.fogRect')}    shortcut="F" active={activeTool === 'fog-rect'}    onClick={() => setActiveTool('fog-rect')} />
          <Pill label={t('toolbar.tools.fogPolygon')} shortcut="P" active={activeTool === 'fog-polygon'} onClick={() => setActiveTool('fog-polygon')} />
          <Divider />
          <Pill label={t('subtool.reveal')} active={!isCover} onClick={() => setActiveTool('fog-rect')} />
          <Pill label={t('subtool.cover')}  shortcut="C" active={isCover}  onClick={() => setActiveTool('fog-cover')} />
        </>
      )
    }

    // Measure shape toggle. M cycles between them (Phase 11 M-3).
    if (activeTool === 'measure-line' || activeTool === 'measure-circle' || activeTool === 'measure-cone') {
      return (
        <>
          <Seg label={t('subtool.measure')} />
          <Pill label={t('toolbar.tools.measureLine')}   shortcut="M" active={activeTool === 'measure-line'}   onClick={() => setActiveTool('measure-line')} />
          <Pill label={t('toolbar.tools.measureCircle')} shortcut="M" active={activeTool === 'measure-circle'} onClick={() => setActiveTool('measure-circle')} />
          <Pill label={t('toolbar.tools.measureCone')}   shortcut="M" active={activeTool === 'measure-cone'}   onClick={() => setActiveTool('measure-cone')} />
        </>
      )
    }

    // Wall type toggle (BoltBerry only ships wall + door for now).
    if (activeTool === 'wall-draw' || activeTool === 'wall-door') {
      return (
        <>
          <Seg label={t('subtool.wall')} />
          <Pill label={t('toolbar.tools.wallDraw')} shortcut="G" active={activeTool === 'wall-draw'} onClick={() => setActiveTool('wall-draw')} />
          <Pill label={t('toolbar.tools.wallDoor')} shortcut="J" active={activeTool === 'wall-door'} onClick={() => setActiveTool('wall-door')} />
        </>
      )
    }

    // Draw tools: stroke width + color. Widths use named presets (the old
    // DrawingToolbar used Thin/Medium/Thick mapped to 1/3/6); colors
    // include black + white so map annotations stay legible on both light
    // and dark backgrounds.
    if (activeTool.startsWith('draw-')) {
      const widths: Array<{ label: string; value: number }> = [
        { label: t('subtool.thin'),   value: 1 },
        { label: t('subtool.medium'), value: 3 },
        { label: t('subtool.thick'),  value: 6 },
      ]
      const colors = ['#ff6b6b', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000']
      return (
        <>
          <Seg label={t('subtool.draw')} />
          {widths.map((w) => (
            <Pill
              key={w.value}
              label={w.label}
              active={drawWidth === w.value}
              onClick={() => setDrawWidth(w.value)}
            />
          ))}
          <Divider />
          {colors.map((c) => (
            <button
              key={c}
              className={`sub-tool-swatch${drawColor === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setDrawColor(c)}
              aria-label={c}
              title={c}
            />
          ))}
        </>
      )
    }

    return null
  }
}

// ”€”€ Shared tiny primitives ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€

interface PillProps {
  label: string
  active: boolean
  mono?: boolean
  /** Optional shortcut hint for the tooltip — Phase 11 m-43.
   *  Renders as `${label} [${shortcut}]` in the title attribute. */
  shortcut?: string
  onClick: () => void
}

function Pill({ label, active, mono, shortcut, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} [${shortcut}]` : label}
      className={`sub-tool-pill${active ? ' active' : ''}${mono ? ' mono' : ''}`}
    >
      {label}
    </button>
  )
}

function Seg({ label }: { label: string }) {
  return <div className="sub-tool-seg">{label}</div>
}

function Divider() {
  return <div className="sub-tool-divider" aria-hidden="true" />
}
