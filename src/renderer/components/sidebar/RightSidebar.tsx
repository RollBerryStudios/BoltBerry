import { useTranslation } from 'react-i18next'
import { useUIStore, SIDEBAR_TAB_TO_DOCK, type SidebarTab, type SidebarDock } from '../../stores/uiStore'
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

interface SectionDef {
  id: SidebarTab
  labelKey: string
  icon: string
  render: () => JSX.Element
}

interface DockDef {
  id: SidebarDock
  labelKey: string
  icon: string
  sections: SectionDef[]
}

// The three docks group related panels together. Each dock is a tab in the top strip;
// within a dock, sections behave as an accordion (one open at a time = the current sidebarTab).
const DOCKS: DockDef[] = [
  {
    id: 'scene',
    labelKey: 'sidebar.right.dockScene',
    icon: '🗺️',
    sections: [
      { id: 'tokens',     labelKey: 'sidebar.right.tabTokens',     icon: '⬤',  render: () => <TokenPanel /> },
      { id: 'initiative', labelKey: 'sidebar.right.tabInitiative', icon: '⚔️', render: () => <InitiativePanel /> },
      { id: 'rooms',      labelKey: 'sidebar.right.tabRooms',      icon: '🏠', render: () => <RoomPanel /> },
    ],
  },
  {
    id: 'content',
    labelKey: 'sidebar.right.dockContent',
    icon: '📚',
    sections: [
      { id: 'notes',      labelKey: 'sidebar.right.tabNotes',      icon: '📝', render: () => <NotesPanel /> },
      { id: 'handouts',   labelKey: 'sidebar.right.tabHandouts',   icon: '📜', render: () => <HandoutsPanel /> },
      { id: 'encounters', labelKey: 'sidebar.right.tabEncounters', icon: '👾', render: () => <EncounterPanel /> },
      { id: 'characters', labelKey: 'sidebar.right.tabCharacters', icon: '📋', render: () => <CharacterSheetPanel /> },
    ],
  },
  {
    id: 'ambience',
    labelKey: 'sidebar.right.dockAmbience',
    icon: '✦',
    sections: [
      { id: 'overlay', labelKey: 'sidebar.right.tabOverlay', icon: '✦',  render: () => <OverlayPanel /> },
      { id: 'audio',   labelKey: 'sidebar.right.tabAudio',   icon: '🎵', render: () => <AudioPanel /> },
      { id: 'dice',    labelKey: 'sidebar.right.tabDice',    icon: '🎲', render: () => <DiceRoller /> },
    ],
  },
]

export function RightSidebar() {
  const { t } = useTranslation()
  const sidebarTab = useUIStore((s) => s.sidebarTab)
  const sidebarDock = useUIStore((s) => s.sidebarDock)
  const setSidebarTab = useUIStore((s) => s.setSidebarTab)
  const setSidebarDock = useUIStore((s) => s.setSidebarDock)

  const currentDock = DOCKS.find((d) => d.id === sidebarDock) ?? DOCKS[0]
  // If the current sidebarTab doesn't belong to the current dock (e.g. dock switched but no tab
  // was clicked yet), fall back to the dock's first section as the expanded one.
  const expandedTab: SidebarTab =
    SIDEBAR_TAB_TO_DOCK[sidebarTab] === currentDock.id ? sidebarTab : currentDock.sections[0].id

  const handleDockClick = (dockId: SidebarDock) => {
    if (dockId === sidebarDock) return
    setSidebarDock(dockId)
  }

  const handleSectionClick = (sectionId: SidebarTab) => {
    setSidebarTab(sectionId)
  }

  return (
    <div className="sidebar sidebar-right">
      {/* Dock strip — three top-level groupings */}
      <div className="sidebar-dock-strip">
        {DOCKS.map((dock) => (
          <button
            key={dock.id}
            className={`sidebar-dock-tab${sidebarDock === dock.id ? ' active' : ''}`}
            title={t(dock.labelKey)}
            aria-label={t(dock.labelKey)}
            onClick={() => handleDockClick(dock.id)}
          >
            <span className="dock-icon">{dock.icon}</span>
            <span className="dock-label">{t(dock.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Accordion body — sections within the active dock */}
      <div className="sidebar-accordion">
        {currentDock.sections.map((section) => {
          const isOpen = section.id === expandedTab
          return (
            <div key={section.id} className={`accordion-item${isOpen ? ' open' : ''}`}>
              <button
                className="accordion-header"
                aria-expanded={isOpen}
                aria-controls={`panel-${section.id}`}
                onClick={() => handleSectionClick(section.id)}
              >
                <span className="accordion-icon">{section.icon}</span>
                <span className="accordion-title">{t(section.labelKey)}</span>
                <span className="accordion-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div
                  id={`panel-${section.id}`}
                  className="accordion-panel"
                  role="region"
                  aria-label={t(section.labelKey)}
                >
                  {section.render()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
