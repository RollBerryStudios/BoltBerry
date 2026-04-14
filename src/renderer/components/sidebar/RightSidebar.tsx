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
import { CharacterSheetPanel } from './panels/CharacterSheetPanel'

const ALL_TABS: { id: SidebarTab; labelKey: string; icon: string; shortLabel: string }[] = [
  { id: 'tokens',      labelKey: 'sidebar.right.tabTokens',      icon: '⬤',  shortLabel: 'Token' },
  { id: 'initiative',  labelKey: 'sidebar.right.tabInitiative',  icon: '⚔️', shortLabel: 'Init' },
  { id: 'encounters',  labelKey: 'sidebar.right.tabEncounters',  icon: '👾', shortLabel: 'Enc.' },
  { id: 'rooms',       labelKey: 'sidebar.right.tabRooms',       icon: '🏠', shortLabel: 'Räume' },
  { id: 'characters',  labelKey: 'sidebar.right.tabCharacters',  icon: '📋', shortLabel: 'Chars' },
  { id: 'notes',       labelKey: 'sidebar.right.tabNotes',       icon: '📝', shortLabel: 'Notiz' },
  { id: 'handouts',    labelKey: 'sidebar.right.tabHandouts',    icon: '📜', shortLabel: 'Handout' },
  { id: 'overlay',     labelKey: 'sidebar.right.tabOverlay',     icon: '✦',  shortLabel: 'Overlay' },
  { id: 'audio',       labelKey: 'sidebar.right.tabAudio',       icon: '🎵', shortLabel: 'Audio' },
  { id: 'dice',        labelKey: 'sidebar.right.tabDice',        icon: '🎲', shortLabel: 'Würfel' },
]

export function RightSidebar() {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab } = useUIStore()

  const visibleTabs = ALL_TABS

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
              padding: '4px 2px',
              background: 'none',
              border: 'none',
              borderBottom: sidebarTab === tab.id
                ? '2px solid var(--accent-blue)'
                : '2px solid transparent',
              color: sidebarTab === tab.id ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              transition: 'color var(--transition)',
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ lineHeight: 1.2, letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {tab.shortLabel}
            </span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sidebarTab === 'tokens'      && <TokenPanel />}
        {sidebarTab === 'initiative'  && <InitiativePanel />}
        {sidebarTab === 'encounters'  && <EncounterPanel />}
        {sidebarTab === 'rooms'       && <RoomPanel />}
        {sidebarTab === 'characters'  && <CharacterSheetPanel />}
        {sidebarTab === 'notes'       && <NotesPanel />}
        {sidebarTab === 'handouts'    && <HandoutsPanel />}
        {sidebarTab === 'overlay'     && <OverlayPanel />}
        {sidebarTab === 'audio'       && <AudioPlayer />}
        {sidebarTab === 'dice'        && <DiceRoller />}
      </div>
    </div>
  )
}