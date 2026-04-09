import { useTranslation } from 'react-i18next'
import { useUIStore, type SidebarTab } from '../../stores/uiStore'
import { TokenPanel } from './panels/TokenPanel'
import { InitiativePanel } from './panels/InitiativePanel'
import { NotesPanel } from './panels/NotesPanel'
import { AudioPlayer } from './panels/AudioPlayer'
import { HandoutsPanel } from './panels/HandoutsPanel'
import { OverlayPanel } from './panels/OverlayPanel'
import { DiceRoller } from './panels/DiceRoller'
import { EncounterPanel } from './panels/EncounterPanel'
import { RoomPanel } from './panels/RoomPanel'

const ALL_TABS: { id: SidebarTab; labelKey: string; icon: string }[] = [
  { id: 'tokens',      labelKey: 'sidebar.right.tabTokens',      icon: '⬤' },
  { id: 'initiative',  labelKey: 'sidebar.right.tabInitiative',  icon: '⚔️' },
  { id: 'encounters',  labelKey: 'sidebar.right.tabEncounters',  icon: '👾' },
  { id: 'rooms',       labelKey: 'sidebar.right.tabRooms',       icon: '🏠' },
  { id: 'notes',       labelKey: 'sidebar.right.tabNotes',       icon: '📝' },
  { id: 'handouts',    labelKey: 'sidebar.right.tabHandouts',    icon: '📜' },
  { id: 'overlay',     labelKey: 'sidebar.right.tabOverlay',     icon: '✦' },
  { id: 'audio',       labelKey: 'sidebar.right.tabAudio',       icon: '🎵' },
  { id: 'dice',        labelKey: 'sidebar.right.tabDice',        icon: '🎲' },
]

export function RightSidebar() {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab, workMode } = useUIStore()

  const visibleTabs: typeof ALL_TABS = workMode === 'player-preview'
    ? []
    : workMode === 'combat'
      ? ALL_TABS.filter((t) => t.id === 'tokens' || t.id === 'initiative')
      : workMode === 'fog-edit'
        ? ALL_TABS.filter((t) => t.id === 'tokens')
        : ALL_TABS

  if (workMode === 'player-preview') return null

  return (
    <div className="sidebar sidebar-right">
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            title={t(tab.labelKey)}
            aria-label={t(tab.labelKey)}
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

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sidebarTab === 'tokens'      && <TokenPanel />}
        {sidebarTab === 'initiative'  && <InitiativePanel />}
        {sidebarTab === 'encounters'  && <EncounterPanel />}
        {sidebarTab === 'rooms'       && <RoomPanel />}
        {sidebarTab === 'notes'       && <NotesPanel />}
        {sidebarTab === 'handouts'    && <HandoutsPanel />}
        {sidebarTab === 'overlay'     && <OverlayPanel />}
        {sidebarTab === 'audio'       && <AudioPlayer />}
        {sidebarTab === 'dice'        && <DiceRoller />}
      </div>
    </div>
  )
}