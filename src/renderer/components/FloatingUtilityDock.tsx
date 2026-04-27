import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, type FloatingPanel } from '../stores/uiStore'
import { AudioFloatingPanel } from './sidebar/panels/AudioFloatingPanel'
import { OverlayPanel } from './sidebar/panels/OverlayPanel'
import { DiceRoller } from './sidebar/panels/DiceRoller'

interface DockItem {
  id: FloatingPanel
  labelKey: string
  icon: string
  render: () => JSX.Element
}

const ITEMS: DockItem[] = [
  { id: 'dice',    labelKey: 'sidebar.right.tabDice',    icon: '🎲', render: () => <DiceRoller /> },
  { id: 'audio',   labelKey: 'sidebar.right.tabAudio',   icon: '🎵', render: () => <AudioFloatingPanel /> },
  { id: 'overlay', labelKey: 'sidebar.right.tabOverlay', icon: '✦',  render: () => <OverlayPanel /> },
]

export function FloatingUtilityDock() {
  const { t } = useTranslation()
  const floatingPanel = useUIStore((s) => s.floatingPanel)
  const setFloatingPanel = useUIStore((s) => s.setFloatingPanel)
  const toggleFloatingPanel = useUIStore((s) => s.toggleFloatingPanel)
  const popoverRef = useRef<HTMLDivElement>(null)

  // ESC closes the open popover.
  useEffect(() => {
    if (!floatingPanel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setFloatingPanel(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [floatingPanel, setFloatingPanel])

  const active = ITEMS.find((i) => i.id === floatingPanel)

  return (
    <div className="floating-utility-dock" role="toolbar" aria-label={t('sidebar.right.utilityDock')}>
      {active && (
        <div
          ref={popoverRef}
          className="floating-utility-popover"
          role="dialog"
          aria-label={t(active.labelKey)}
        >
          <header className="floating-utility-popover-header">
            <span className="floating-utility-popover-icon">{active.icon}</span>
            <span className="floating-utility-popover-title">{t(active.labelKey)}</span>
            <button
              className="floating-utility-popover-close"
              onClick={() => setFloatingPanel(null)}
              aria-label={t('palette.close')}
            >
              ×
            </button>
          </header>
          <div className="floating-utility-popover-body">
            {active.render()}
          </div>
        </div>
      )}

      <div className="floating-utility-rail">
        {ITEMS.map((item) => {
          const isOpen = floatingPanel === item.id
          return (
            <button
              key={item.id}
              className={`floating-utility-btn${isOpen ? ' active' : ''}`}
              onClick={() => toggleFloatingPanel(item.id)}
              aria-pressed={isOpen}
              aria-label={t(item.labelKey)}
              title={t(item.labelKey)}
            >
              <span aria-hidden="true">{item.icon}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
