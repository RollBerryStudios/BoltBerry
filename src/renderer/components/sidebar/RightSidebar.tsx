import { useUIStore, type SidebarTab } from '../../stores/uiStore'
import { TokenPanel } from './panels/TokenPanel'
import { InitiativePanel } from './panels/InitiativePanel'
import { NotesPanel } from './panels/NotesPanel'
import { AudioPlayer } from './panels/AudioPlayer'
import { HandoutsPanel } from './panels/HandoutsPanel'
import { OverlayPanel } from './panels/OverlayPanel'
import { DiceRoller } from './panels/DiceRoller'

const TABS: { id: SidebarTab; label: string; icon: string }[] = [
  { id: 'tokens',     label: 'Token',      icon: '⬤' },
  { id: 'initiative', label: 'Initiative', icon: '⚔️' },
  { id: 'notes',      label: 'Notizen',   icon: '📝' },
  { id: 'handouts',   label: 'Handouts',  icon: '📜' },
  { id: 'overlay',    label: 'Overlay',   icon: '✦' },
  { id: 'audio',      label: 'Audio',     icon: '🎵' },
  { id: 'dice',       label: 'Würfel',    icon: '🎲' },
]

export function RightSidebar() {
  const { sidebarTab, setSidebarTab } = useUIStore()

  return (
    <div className="sidebar sidebar-right">
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            title={tab.label}
            aria-label={tab.label}
            onClick={() => setSidebarTab(tab.id)}
            style={{
              flex: 1,
              padding: 'var(--sp-2)',
              background: 'none',
              border: 'none',
              borderBottom: sidebarTab === tab.id
                ? '2px solid var(--accent-blue)'
                : '2px solid transparent',
              color: sidebarTab === tab.id ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'color var(--transition)',
            }}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sidebarTab === 'tokens'     && <TokenPanel />}
        {sidebarTab === 'initiative' && <InitiativePanel />}
        {sidebarTab === 'notes'      && <NotesPanel />}
        {sidebarTab === 'handouts'   && <HandoutsPanel />}
        {sidebarTab === 'overlay'    && <OverlayPanel />}
        {sidebarTab === 'audio'      && <AudioPlayer />}
        {sidebarTab === 'dice'       && <DiceRoller />}
      </div>
    </div>
  )
}
