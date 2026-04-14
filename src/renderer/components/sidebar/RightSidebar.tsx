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

// Split 10 tabs into two logical rows of 5
// Row 1 — session-critical (always needed during play)
const ROW_1: { id: SidebarTab; labelKey: string; icon: string; shortLabel: string }[] = [
  { id: 'tokens',     labelKey: 'sidebar.right.tabTokens',     icon: '⬤',  shortLabel: 'Tokens'   },
  { id: 'initiative', labelKey: 'sidebar.right.tabInitiative', icon: '⚔️', shortLabel: 'Initiative' },
  { id: 'characters', labelKey: 'sidebar.right.tabCharacters', icon: '📋', shortLabel: 'Chars'    },
  { id: 'notes',      labelKey: 'sidebar.right.tabNotes',      icon: '📝', shortLabel: 'Notizen'  },
  { id: 'audio',      labelKey: 'sidebar.right.tabAudio',      icon: '🎵', shortLabel: 'Audio'    },
]

// Row 2 — world & utility (less frequently needed mid-session)
const ROW_2: { id: SidebarTab; labelKey: string; icon: string; shortLabel: string }[] = [
  { id: 'encounters', labelKey: 'sidebar.right.tabEncounters', icon: '👾', shortLabel: 'Encounter' },
  { id: 'rooms',      labelKey: 'sidebar.right.tabRooms',      icon: '🏠', shortLabel: 'Räume'    },
  { id: 'handouts',   labelKey: 'sidebar.right.tabHandouts',   icon: '📜', shortLabel: 'Handouts' },
  { id: 'overlay',    labelKey: 'sidebar.right.tabOverlay',    icon: '✦',  shortLabel: 'Overlay'  },
  { id: 'dice',       labelKey: 'sidebar.right.tabDice',       icon: '🎲', shortLabel: 'Würfel'   },
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
      {/* Two-row tab grid — 5 tabs per row */}
      <div className="sidebar-tabs" style={{ gridTemplateRows: 'auto 1px auto' }}>
        {ROW_1.map((tab) => <Tab key={tab.id} tab={tab} />)}
        <div className="sidebar-tabs-divider" />
        {ROW_2.map((tab) => <Tab key={tab.id} tab={tab} />)}
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
