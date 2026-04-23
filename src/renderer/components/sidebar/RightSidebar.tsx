import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, SIDEBAR_TAB_TO_DOCK, type SidebarTab, type SidebarDock } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { TokenPanel } from './panels/TokenPanel'
import { InitiativePanel } from './panels/InitiativePanel'
import { NotesPanel } from './panels/NotesPanel'
import { HandoutsPanel } from './panels/HandoutsPanel'
import { EncounterPanel } from './panels/EncounterPanel'
import { RoomPanel } from './panels/RoomPanel'
import { CharacterSheetPanel } from './panels/CharacterSheetPanel'

interface SectionDef {
  id: SidebarTab
  labelKey: string
  icon: string
  render: () => JSX.Element
  /** True when this section is currently the most relevant to user context. */
  isContextual?: boolean
}

interface DockDef {
  id: SidebarDock
  labelKey: string
  icon: string
  sections: SectionDef[]
}

export function RightSidebar() {
  const { t } = useTranslation()
  const sidebarTab = useUIStore((s) => s.sidebarTab)
  const sidebarDock = useUIStore((s) => s.sidebarDock)
  const setSidebarTab = useUIStore((s) => s.setSidebarTab)
  const setSidebarDock = useUIStore((s) => s.setSidebarDock)
  const selectedTokenId = useUIStore((s) => s.selectedTokenId)
  const workMode = useSessionStore((s) => s.workMode)
  const initiativeCount = useInitiativeStore((s) => s.entries.length)

  const combatActive = workMode === 'combat' || initiativeCount > 0
  const tokenSelected = selectedTokenId !== null

  // Auto-open the contextually-relevant section when user context changes.
  // We track the previous "context signature" to only fire on actual transitions —
  // not on every re-render — so the user can still manually navigate elsewhere.
  const prevContextRef = useRef<string>('')
  useEffect(() => {
    const sig = `${tokenSelected ? 't' : ''}|${combatActive ? 'c' : ''}`
    if (sig === prevContextRef.current) return
    prevContextRef.current = sig
    if (combatActive) {
      setSidebarTab('initiative')
    } else if (tokenSelected) {
      setSidebarTab('tokens')
    }
  }, [tokenSelected, combatActive, setSidebarTab])

  const docks: DockDef[] = [
    {
      id: 'scene',
      labelKey: 'sidebar.right.dockScene',
      icon: '🗺️',
      sections: [
        { id: 'tokens',     labelKey: 'sidebar.right.tabTokens',     icon: 'â¬¤',  render: () => <TokenPanel />,         isContextual: tokenSelected && !combatActive },
        { id: 'initiative', labelKey: 'sidebar.right.tabInitiative', icon: '⚔️', render: () => <InitiativePanel />,    isContextual: combatActive },
        { id: 'rooms',      labelKey: 'sidebar.right.tabRooms',      icon: 'ðŸ ', render: () => <RoomPanel /> },
      ],
    },
    {
      id: 'content',
      labelKey: 'sidebar.right.dockContent',
      icon: 'ðŸ“š',
      sections: [
        { id: 'notes',      labelKey: 'sidebar.right.tabNotes',      icon: 'ðŸ“', render: () => <NotesPanel /> },
        { id: 'handouts',   labelKey: 'sidebar.right.tabHandouts',   icon: '📜', render: () => <HandoutsPanel /> },
        { id: 'encounters', labelKey: 'sidebar.right.tabEncounters', icon: 'ðŸ‘¾', render: () => <EncounterPanel /> },
        { id: 'characters', labelKey: 'sidebar.right.tabCharacters', icon: 'ðŸ“‹', render: () => <CharacterSheetPanel /> },
      ],
    },
  ]

  // Reorder Scene dock so the contextual section appears first when active.
  const sceneDock = docks[0]
  const ctxIdx = sceneDock.sections.findIndex((s) => s.isContextual)
  if (ctxIdx > 0) {
    const reordered = [...sceneDock.sections]
    const [pinned] = reordered.splice(ctxIdx, 1)
    reordered.unshift(pinned)
    docks[0] = { ...sceneDock, sections: reordered }
  }

  const currentDock = docks.find((d) => d.id === sidebarDock) ?? docks[0]
  const expandedTab: SidebarTab =
    SIDEBAR_TAB_TO_DOCK[sidebarTab] === currentDock.id ? sidebarTab : currentDock.sections[0].id

  return (
    <div className="sidebar sidebar-right">
      <div className="sidebar-dock-strip">
        {docks.map((dock) => (
          <button
            key={dock.id}
            className={`sidebar-dock-tab${sidebarDock === dock.id ? ' active' : ''}`}
            title={t(dock.labelKey)}
            aria-label={t(dock.labelKey)}
            onClick={() => sidebarDock !== dock.id && setSidebarDock(dock.id)}
          >
            <span className="dock-icon">{dock.icon}</span>
            <span className="dock-label">{t(dock.labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-accordion">
        {currentDock.sections.map((section) => {
          const isOpen = section.id === expandedTab
          return (
            <div
              key={section.id}
              className={`accordion-item${isOpen ? ' open' : ''}${section.isContextual ? ' contextual' : ''}`}
            >
              <button
                className="accordion-header"
                aria-expanded={isOpen}
                aria-controls={`panel-${section.id}`}
                onClick={() => setSidebarTab(section.id)}
              >
                <span className="accordion-icon">{section.icon}</span>
                <span className="accordion-title">{t(section.labelKey)}</span>
                {section.isContextual && (
                  <span className="accordion-context-dot" aria-hidden="true" title={t('sidebar.right.contextual')} />
                )}
                <span className="accordion-chevron" aria-hidden="true">{isOpen ? 'â–¾' : 'â–¸'}</span>
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
