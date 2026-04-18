import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'

/**
 * Left-rail tool dock (v1 Conservative variant from the design bundle).
 * A floating 60-px vertical rail grouped into five sections, separated by
 * thin dividers. Each group's primary tool activates on click; groups with
 * variants fan out a popover to the right on chevron/right-click. Glass-
 * morphism panel anchored at left:12 / top:12 / bottom:12 inside the
 * canvas area, so it floats on top of the map.
 */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

interface ToolDef {
  id: ActiveTool
  icon: string
  labelKey: string
  shortcut?: string
}

interface ToolGroup {
  id: string
  primary: ToolDef
  variants?: ToolDef[]
}

interface DockSection {
  id: string
  groups: ToolGroup[]
}

const SECTIONS: DockSection[] = [
  {
    id: 'view',
    groups: [
      { id: 'select',  primary: { id: 'select',  icon: '↖',  labelKey: 'toolbar.tools.select',  shortcut: 'V' } },
      { id: 'pointer', primary: { id: 'pointer', icon: '👆', labelKey: 'toolbar.tools.pointer', shortcut: 'W' } },
      {
        id: 'measure',
        primary: { id: 'measure-line', icon: '📏', labelKey: 'toolbar.tools.measureLine', shortcut: 'M' },
        variants: [
          { id: 'measure-line',   icon: '📏', labelKey: 'toolbar.tools.measureLine',   shortcut: 'M' },
          { id: 'measure-circle', icon: '◎',  labelKey: 'toolbar.tools.measureCircle' },
          { id: 'measure-cone',   icon: '◿',  labelKey: 'toolbar.tools.measureCone' },
        ],
      },
    ],
  },
  {
    id: 'combat',
    groups: [
      { id: 'token', primary: { id: 'token', icon: '⬤', labelKey: 'toolbar.tools.token', shortcut: 'T' } },
    ],
  },
  {
    id: 'reveal',
    groups: [
      {
        id: 'fog',
        primary: { id: 'fog-brush', icon: '🖌', labelKey: 'toolbar.tools.fogBrush', shortcut: 'B' },
        variants: [
          { id: 'fog-brush',       icon: '🖌', labelKey: 'toolbar.tools.fogBrush',       shortcut: 'B' },
          { id: 'fog-brush-cover', icon: '✏',  labelKey: 'toolbar.tools.fogBrushCover', shortcut: 'X' },
          { id: 'fog-rect',        icon: '▭',  labelKey: 'toolbar.tools.fogRect',        shortcut: 'F' },
          { id: 'fog-polygon',     icon: '⬡',  labelKey: 'toolbar.tools.fogPolygon',     shortcut: 'P' },
          { id: 'fog-cover',       icon: '▮',  labelKey: 'toolbar.tools.fogCover',       shortcut: 'C' },
        ],
      },
    ],
  },
  {
    id: 'world',
    groups: [
      {
        id: 'wall',
        primary: { id: 'wall-draw', icon: '🧱', labelKey: 'toolbar.tools.wallDraw', shortcut: 'G' },
        variants: [
          { id: 'wall-draw', icon: '🧱', labelKey: 'toolbar.tools.wallDraw', shortcut: 'G' },
          { id: 'wall-door', icon: '🚪', labelKey: 'toolbar.tools.wallDoor', shortcut: 'J' },
        ],
      },
      { id: 'room', primary: { id: 'room', icon: '🏠', labelKey: 'toolbar.tools.room', shortcut: 'R' } },
      {
        id: 'draw',
        primary: { id: 'draw-freehand', icon: '✏️', labelKey: 'toolbar.tools.drawFreehand', shortcut: 'D' },
        variants: [
          { id: 'draw-freehand', icon: '✏️', labelKey: 'toolbar.tools.drawFreehand', shortcut: 'D' },
          { id: 'draw-rect',     icon: '▢',  labelKey: 'toolbar.tools.drawRect' },
          { id: 'draw-circle',   icon: '○',  labelKey: 'toolbar.tools.drawCircle' },
          { id: 'draw-text',     icon: 'T',  labelKey: 'toolbar.tools.drawText' },
        ],
      },
    ],
  },
  {
    id: 'present',
    groups: [
      { id: 'atmosphere', primary: { id: 'atmosphere', icon: '🖼', labelKey: 'toolbar.tools.atmosphere' } },
    ],
  },
]

export function LeftToolDock() {
  const { t } = useTranslation()
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const workMode = useUIStore((s) => s.workMode)
  const dockLabels = useUIStore((s) => s.dockLabels)
  const dockAutoHide = useUIStore((s) => s.dockAutoHide)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  // Player-preview restricts the DM to the pointer tool — hide the rail.
  if (workMode === 'player-preview') return null

  const handleSelect = async (id: ActiveTool) => {
    setOpenGroup(null)
    if (id === 'atmosphere') {
      if (!window.electronAPI) return
      const result = await window.electronAPI.importFile('atmosphere')
      if (result) {
        useUIStore.getState().setAtmosphereImage(result.path)
        window.electronAPI.sendAtmosphere(result.path)
      }
      return
    }
    setActiveTool(id)
  }

  const classes = [
    'left-tool-dock',
    dockLabels ? 'left-tool-dock--labels' : '',
    // Auto-hide pairs with `.canvas-area.hud-idle` (the class CanvasArea sets
    // when the cursor is idle over the map). The `canvas-hud-fade` opt-in
    // gives us the same fade contract the other ambient HUDs use.
    dockAutoHide ? 'canvas-hud-fade' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} role="toolbar" aria-label={t('toolbar.tools.select')}>
      {SECTIONS.map((section, i) => (
        <div key={section.id} className="left-tool-dock-section">
          {i > 0 && <div className="left-tool-dock-divider" aria-hidden="true" />}
          {section.groups.map((g) => (
            <ToolGroupButton
              key={g.id}
              group={g}
              activeTool={activeTool}
              open={openGroup === g.id}
              onToggleOpen={() => setOpenGroup(openGroup === g.id ? null : g.id)}
              onClose={() => setOpenGroup(null)}
              onSelect={handleSelect}
              showLabel={dockLabels}
              t={t}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface ToolGroupButtonProps {
  group: ToolGroup
  activeTool: ActiveTool
  open: boolean
  onToggleOpen: () => void
  onClose: () => void
  onSelect: (id: ActiveTool) => void
  showLabel: boolean
  t: (k: string) => string
}

function ToolGroupButton({ group, activeTool, open, onToggleOpen, onClose, onSelect, showLabel, t }: ToolGroupButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const hasVariants = !!group.variants && group.variants.length > 1
  const groupActive =
    activeTool === group.primary.id ||
    (group.variants?.some((v) => v.id === activeTool) ?? false)
  const displayedVariant = group.variants?.find((v) => v.id === activeTool)
  const displayIcon = displayedVariant?.icon ?? group.primary.icon

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect()
      // Anchor the popover to the right of the button, vertically centered.
      setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (btnRef.current?.contains(tgt)) return
      if (popRef.current?.contains(tgt)) return
      onClose()
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose])

  const handleClick = () => { onSelect(group.primary.id) }
  const handleChevron = (e: React.MouseEvent) => { e.stopPropagation(); onToggleOpen() }
  const handleContext = (e: React.MouseEvent) => {
    if (!hasVariants) return
    e.preventDefault()
    onToggleOpen()
  }
  const label = t(group.primary.labelKey) + (group.primary.shortcut ? ` [${group.primary.shortcut}]` : '')

  return (
    <div className="left-tool-group">
      <button
        ref={btnRef}
        className={`left-tool-btn${groupActive ? ' active' : ''}`}
        title={label}
        aria-label={label}
        aria-pressed={groupActive}
        onClick={handleClick}
        onContextMenu={handleContext}
      >
        {groupActive && <span className="left-tool-btn-accent" aria-hidden="true" />}
        <span className="left-tool-btn-icon" aria-hidden="true">{displayIcon}</span>
        {showLabel && (
          <span className="left-tool-btn-label">
            {truncate(t(group.primary.labelKey), 8)}
          </span>
        )}
        {hasVariants && (
          <span
            className="left-tool-btn-chevron"
            aria-label="Expand"
            role="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleChevron}
          >
            ›
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="left-tool-popover"
          style={{ top: pos.top, left: pos.left }}
          role="menu"
        >
          {group.variants!.map((v) => {
            const isCur = activeTool === v.id
            return (
              <button
                key={v.id}
                className={`left-tool-popover-item${isCur ? ' active' : ''}`}
                onClick={() => onSelect(v.id)}
                role="menuitem"
              >
                <span className="left-tool-popover-item-icon" aria-hidden="true">{v.icon}</span>
                <span className="left-tool-popover-item-label">{t(v.labelKey)}</span>
                {v.shortcut && (
                  <span className="left-tool-popover-item-shortcut">{v.shortcut}</span>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
