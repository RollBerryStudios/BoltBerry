import { useState } from 'react'
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

// Session-critical tabs — always visible in the tab strip
const PRIMARY_TABS: { id: SidebarTab; labelKey: string; icon: string; shortLabel: string }[] = [
  { id: 'tokens',     labelKey: 'sidebar.right.tabTokens',     icon: '⬤',  shortLabel: 'Token'   },
  { id: 'initiative', labelKey: 'sidebar.right.tabInitiative', icon: '⚔️', shortLabel: 'Init'    },
  { id: 'notes',      labelKey: 'sidebar.right.tabNotes',      icon: '📝', shortLabel: 'Notizen' },
  { id: 'audio',      labelKey: 'sidebar.right.tabAudio',      icon: '🎵', shortLabel: 'Audio'   },
  { id: 'handouts',   labelKey: 'sidebar.right.tabHandouts',   icon: '📜', shortLabel: 'Handout' },
  { id: 'overlay',    labelKey: 'sidebar.right.tabOverlay',    icon: '✦',  shortLabel: 'Overlay' },
]

// Utility tabs — accessible via the "⋯" overflow button
const OVERFLOW_TABS: { id: SidebarTab; labelKey: string; icon: string; shortLabel: string }[] = [
  { id: 'dice',       labelKey: 'sidebar.right.tabDice',       icon: '🎲', shortLabel: 'Würfel'   },
  { id: 'characters', labelKey: 'sidebar.right.tabCharacters', icon: '📋', shortLabel: 'Chars'    },
  { id: 'encounters', labelKey: 'sidebar.right.tabEncounters', icon: '👾', shortLabel: 'Encounter' },
  { id: 'rooms',      labelKey: 'sidebar.right.tabRooms',      icon: '🏠', shortLabel: 'Räume'    },
]

const ALL_TABS = [...PRIMARY_TABS, ...OVERFLOW_TABS]

export function RightSidebar() {
  const { t } = useTranslation()
  const { sidebarTab, setSidebarTab } = useUIStore()
  const [overflowOpen, setOverflowOpen] = useState(false)

  const activeInOverflow = OVERFLOW_TABS.some((tab) => tab.id === sidebarTab)

  return (
    <div className="sidebar sidebar-right">
      {/* ── Tab strip ─────────────────────────────────────────────────────── */}
      <div className="sidebar-tabs" style={{ position: 'relative' }}>
        {/* Primary tabs */}
        {PRIMARY_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sidebar-tab${sidebarTab === tab.id ? ' active' : ''}`}
            title={t(tab.labelKey)}
            aria-label={t(tab.labelKey)}
            onClick={() => { setSidebarTab(tab.id); setOverflowOpen(false) }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.shortLabel}</span>
          </button>
        ))}

        {/* Overflow toggle — highlighted when an overflow tab is active */}
        <button
          className={`sidebar-tab${activeInOverflow || overflowOpen ? ' active' : ''}`}
          title="Weitere Panels"
          aria-label="Weitere Panels"
          onClick={() => setOverflowOpen((v) => !v)}
          style={{ minWidth: 36, flexShrink: 0 }}
        >
          <span className="tab-icon">{activeInOverflow ? OVERFLOW_TABS.find(t => t.id === sidebarTab)?.icon : '⋯'}</span>
          <span className="tab-label">{activeInOverflow ? OVERFLOW_TABS.find(t => t.id === sidebarTab)?.shortLabel : 'Mehr'}</span>
        </button>

        {/* Overflow dropdown */}
        {overflowOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
              onClick={() => setOverflowOpen(false)}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              zIndex: 1001,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '4px 0',
              minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              {OVERFLOW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setSidebarTab(tab.id); setOverflowOpen(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '7px 14px',
                    background: sidebarTab === tab.id ? 'var(--accent-blue-dim)' : 'none',
                    border: 'none',
                    borderLeft: sidebarTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    color: sidebarTab === tab.id ? 'var(--accent-blue-light)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { if (sidebarTab !== tab.id) e.currentTarget.style.background = 'var(--bg-overlay)' }}
                  onMouseLeave={(e) => { if (sidebarTab !== tab.id) e.currentTarget.style.background = 'none' }}
                >
                  <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{tab.icon}</span>
                  <span>{t(tab.labelKey)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Panel content ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sidebarTab === 'tokens'      && <TokenPanel />}
        {sidebarTab === 'initiative'  && <InitiativePanel />}
        {sidebarTab === 'notes'       && <NotesPanel />}
        {sidebarTab === 'audio'       && <AudioPanel />}
        {sidebarTab === 'handouts'    && <HandoutsPanel />}
        {sidebarTab === 'overlay'     && <OverlayPanel />}
        {sidebarTab === 'dice'        && <DiceRoller />}
        {sidebarTab === 'characters'  && <CharacterSheetPanel />}
        {sidebarTab === 'encounters'  && <EncounterPanel />}
        {sidebarTab === 'rooms'       && <RoomPanel />}
      </div>
    </div>
  )
}
