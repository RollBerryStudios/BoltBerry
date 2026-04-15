import { useTranslation } from 'react-i18next'
import { useUIStore, type SidebarTab } from '../../stores/uiStore'
import { TokenPanel } from './panels/TokenPanel'
import { InitiativePanel } from './panels/InitiativePanel'
import { NotesPanel } from './panels/NotesPanel'
import { AudioPanel } from './panels/AudioPanel'
import { HandoutsPanel } from './panels/HandoutsPanel'
import { OverlayPanel } from './panels/OverlayPanel'
import { DiceRoller } from './panels/DiceRoller'
import { EncounterPanel } from './panels/EncounterPanel'
import { RoomPanel } from './panels/RoomPanel'
import { CharacterSheetPanel } from './panels/CharacterSheetPanel'

// Single ordered list — session-critical tabs first, then utility
// Rendered in one horizontal scrollable row (min 44px per tab, no two-row grid)
const ALL_TABS: { id: SidebarTab; labelKey: string; icon: string; shortLabel: string }[] = [
  { id: 'tokens',     labelKey: 'sidebar.right.tabTokens',     icon: '⬤',  shortLabel: 'Tokens'  },
  { id: 'initiative', labelKey: 'sidebar.right.tabInitiative', icon: '⚔️', shortLabel: 'Init'    },
  { id: 'notes',      labelKey: 'sidebar.right.tabNotes',      icon: '📝', shortLabel: 'Notizen' },
  { id: 'audio',      labelKey: 'sidebar.right.tabAudio',      icon: '🎵', shortLabel: 'Audio'   },
  { id: 'handouts',   labelKey: 'sidebar.right.tabHandouts',   icon: '📜', shortLabel: 'Handout' },
  { id: 'overlay',    labelKey: 'sidebar.right.tabOverlay',    icon: '✦',  shortLabel: 'Overlay' },
  { id: 'dice',       labelKey: 'sidebar.right.tabDice',       icon: '🎲', shortLabel: 'Würfel'  },
  { id: 'characters', labelKey: 'sidebar.right.tabCharacters', icon: '📋', shortLabel: 'Chars'   },
  { id: 'encounters', labelKey: 'sidebar.right.tabEncounters', icon: '👾', shortLabel: 'Encounter'},
  { id: 'rooms',      labelKey: 'sidebar.right.tabRooms',      icon: '🏠', shortLabel: 'Räume'   },
]

export function RightSidebar() {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab } = useUIStore()

  function Tab({ tab }: { tab: typeof ROW_1[number] }) {
    return (
      <button
        key={tab.id}
        className={`sidebar-tab${sidebarTab === tab.id ? ' active' : ''}`}
        title={t(tab.labelKey)}
        aria-label={t(tab.labelKey)}
        onClick={() => setSidebarTab(tab.id)}
      >
        <span className="tab-icon">{tab.icon}</span>
        <span className="tab-label">{tab.shortLabel}</span>
      </button>
    )
  }

  return (
    <div className="sidebar sidebar-right">
      {/* Single scrollable row — 10 tabs, min 44px each, horizontally scrollable */}
      <div className="sidebar-tabs">
        {ALL_TABS.map((tab) => <Tab key={tab.id} tab={tab} />)}
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
        {sidebarTab === 'audio'       && <AudioPanel />}
        {sidebarTab === 'dice'        && <DiceRoller />}
      </div>
    </div>
  )
}
