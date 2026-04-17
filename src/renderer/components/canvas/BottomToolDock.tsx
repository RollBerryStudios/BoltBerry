import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'

/**
 * Bottom-center floating tool dock. Six primary actions, each optionally
 * fanning into a sub-palette that opens *upward* (so it stays on-screen at
 * any canvas height). Pattern modelled on Owlbear Rodeo's dock — the
 * primary click of a group button activates the group's default tool;
 * the chevron fans the sub-tools. The top toolbar still exists for
 * power-users and session controls — this dock is the play-mode fast-path.
 *
 * Positioned above the status bar with enough clearance for the
 * MultiSelectBar (which reflows upward via CSS when this dock is present).
 */
interface ToolDef {
  id: ActiveTool
  icon: string
  labelKey: string
  shortcut?: string
}

interface ToolGroup {
  id: string
  icon: string
  labelKey: string
  /** Tool activated on plain click of the group button. */
  primary: ToolDef
  /** Additional tools shown in the fan-out popover. */
  variants?: ToolDef[]
}

const GROUPS: ToolGroup[] = [
  {
    id: 'select',
    icon: '↖',
    labelKey: 'toolbar.tools.select',
    primary: { id: 'select', icon: '↖', labelKey: 'toolbar.tools.select', shortcut: 'V' },
  },
  {
    id: 'pointer',
    icon: '👆',
    labelKey: 'toolbar.tools.pointer',
    primary: { id: 'pointer', icon: '👆', labelKey: 'toolbar.tools.pointer', shortcut: 'W' },
  },
  {
    id: 'measure',
    icon: '📏',
    labelKey: 'toolbar.tools.measureGroup',
    primary: { id: 'measure-line', icon: '📏', labelKey: 'toolbar.tools.measureLine', shortcut: 'M' },
    variants: [
      { id: 'measure-line',   icon: '📏', labelKey: 'toolbar.tools.measureLine',   shortcut: 'M' },
      { id: 'measure-circle', icon: '◎',  labelKey: 'toolbar.tools.measureCircle' },
      { id: 'measure-cone',   icon: '◿',  labelKey: 'toolbar.tools.measureCone' },
    ],
  },
  {
    id: 'draw',
    icon: '✏️',
    labelKey: 'toolbar.tools.drawGroup',
    primary: { id: 'draw-freehand', icon: '✏️', labelKey: 'toolbar.tools.drawFreehand', shortcut: 'D' },
    variants: [
      { id: 'draw-freehand', icon: '✏️', labelKey: 'toolbar.tools.drawFreehand', shortcut: 'D' },
      { id: 'draw-rect',     icon: '▢',  labelKey: 'toolbar.tools.drawRect' },
      { id: 'draw-circle',   icon: '○',  labelKey: 'toolbar.tools.drawCircle' },
      { id: 'draw-text',     icon: 'T',  labelKey: 'toolbar.tools.drawText' },
    ],
  },
  {
    id: 'fog',
    icon: '🌫',
    labelKey: 'toolbar.tools.fogGroup',
    primary: { id: 'fog-brush', icon: '🖌', labelKey: 'toolbar.tools.fogBrush', shortcut: 'B' },
    variants: [
      { id: 'fog-brush',       icon: '🖌', labelKey: 'toolbar.tools.fogBrush',       shortcut: 'B' },
      { id: 'fog-brush-cover', icon: '✏',  labelKey: 'toolbar.tools.fogBrushCover', shortcut: 'X' },
      { id: 'fog-rect',        icon: '▭',  labelKey: 'toolbar.tools.fogRect',        shortcut: 'F' },
      { id: 'fog-polygon',     icon: '⬡',  labelKey: 'toolbar.tools.fogPolygon',     shortcut: 'P' },
      { id: 'fog-cover',       icon: '▮',  labelKey: 'toolbar.tools.fogCover',       shortcut: 'C' },
    ],
  },
  {
    id: 'token',
    icon: '⬤',
    labelKey: 'toolbar.tools.token',
    primary: { id: 'token', icon: '⬤', labelKey: 'toolbar.tools.token', shortcut: 'T' },
  },
]

export function BottomToolDock() {
  const { t } = useTranslation()
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const workMode = useUIStore((s) => s.workMode)
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  // In player-preview mode the DM only has access to the pointer tool;
  // don't expose the full dock. Keep it out of the DOM entirely so the
  // dock doesn't flash briefly when the mode toggles.
  if (workMode === 'player-preview') return null

  return (
    <div className="bottom-tool-dock" role="toolbar" aria-label="Canvas tools">
      {GROUPS.map((g) => (
        <ToolGroupButton
          key={g.id}
          group={g}
          activeTool={activeTool}
          open={openGroup === g.id}
          onToggleOpen={() => setOpenGroup(openGroup === g.id ? null : g.id)}
          onClose={() => setOpenGroup(null)}
          onSelect={(id) => { setActiveTool(id); setOpenGroup(null) }}
          t={t}
        />
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
  t: (k: string) => string
}

function ToolGroupButton({ group, activeTool, open, onToggleOpen, onClose, onSelect, t }: ToolGroupButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null)

  const hasVariants = !!group.variants && group.variants.length > 1
  // The group button is "active" when any tool in its set is armed.
  const groupActive =
    activeTool === group.primary.id ||
    (group.variants?.some((v) => v.id === activeTool) ?? false)
  // Which icon to display: the currently-armed variant if any, else the primary/group icon.
  const displayedVariant = group.variants?.find((v) => v.id === activeTool)
  const displayIcon = displayedVariant?.icon ?? group.primary.icon

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect()
      // Anchor the popover above the button, centered horizontally.
      setPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left + rect.width / 2,
      })
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
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
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

  const handleClick = () => {
    // Plain click: activate the group's primary tool immediately. The chevron
    // is for users who want to peek/swap to a variant — matches Figma's
    // tool-group interaction.
    onSelect(group.primary.id)
  }

  const handleChevron = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleOpen()
  }

  const label = t(group.labelKey) + (group.primary.shortcut ? ` [${group.primary.shortcut}]` : '')

  return (
    <div className="bottom-tool-group">
      <button
        ref={btnRef}
        className={`bottom-tool-btn${groupActive ? ' active' : ''}`}
        title={label}
        aria-label={label}
        aria-pressed={groupActive}
        onClick={handleClick}
      >
        <span className="bottom-tool-btn-icon" aria-hidden="true">{displayIcon}</span>
        {hasVariants && (
          <span
            className="bottom-tool-btn-chevron"
            aria-label="Expand"
            role="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleChevron}
          >
            ▴
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="bottom-tool-popover"
          style={{ bottom: pos.bottom, left: pos.left }}
          role="menu"
        >
          {group.variants!.map((v) => {
            const isCur = activeTool === v.id
            return (
              <button
                key={v.id}
                className={`bottom-tool-popover-item${isCur ? ' active' : ''}`}
                onClick={() => onSelect(v.id)}
                role="menuitem"
              >
                <span className="bottom-tool-popover-item-icon" aria-hidden="true">{v.icon}</span>
                <span className="bottom-tool-popover-item-label">{t(v.labelKey)}</span>
                {v.shortcut && (
                  <span className="bottom-tool-popover-item-shortcut">{v.shortcut}</span>
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
