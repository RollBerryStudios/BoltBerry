import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, type SidebarTab } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import { useUndoStore } from '../stores/undoStore'
import { useCampaignStore } from '../stores/campaignStore'

interface Command {
  id: string
  /** i18n key for the primary label. */
  labelKey: string
  /** Optional i18n key for a short group/category label (e.g. "View", "Session"). */
  groupKey?: string
  /** Keyboard shortcut hint shown on the right. Purely cosmetic. */
  shortcut?: string
  /** Substring keywords in English + German that make this command discoverable via search. */
  keywords: string
  run: () => void
}

interface CommandPaletteProps {
  onClose: () => void
}

// Single source of truth for the palette's action set.
// Each command delegates to a store action — the palette doesn't own any business logic itself.
function buildCommands(t: (k: string) => string): Command[] {
  const ui = useUIStore.getState
  const session = useSessionStore.getState
  const cam = useMapTransformStore.getState
  const undo = useUndoStore.getState
  const campaign = useCampaignStore.getState

  const openTab = (tab: SidebarTab) => {
    if (!ui().rightSidebarOpen) ui().toggleRightSidebar()
    ui().setSidebarTab(tab)
  }
  const openFloating = (panel: 'audio' | 'overlay' | 'dice') => ui().setFloatingPanel(panel)

  return [
    // ── Session
    { id: 'session.start',    labelKey: 'palette.startSession',  groupKey: 'palette.groupSession', keywords: 'start session play begin session starten spiel', run: () => { session().setSessionMode('session'); if (session().workMode === 'prep') session().setWorkMode('play') } },
    { id: 'session.end',      labelKey: 'palette.endSession',    groupKey: 'palette.groupSession', keywords: 'end session stop prep session beenden vorbereitung',    run: () => session().setSessionMode('prep') },
    { id: 'session.blackout', labelKey: 'palette.toggleBlackout',groupKey: 'palette.groupSession', shortcut: 'Ctrl+B', keywords: 'blackout black out verdunkeln schwarz',       run: () => ui().toggleBlackout() },

    // ── View
    { id: 'view.zoomIn',       labelKey: 'palette.zoomIn',       groupKey: 'palette.groupView', shortcut: 'Ctrl+=',  keywords: 'zoom in hineinzoomen vergrößern',            run: () => cam().zoomIn() },
    { id: 'view.zoomOut',      labelKey: 'palette.zoomOut',      groupKey: 'palette.groupView', shortcut: 'Ctrl+-',  keywords: 'zoom out herauszoomen verkleinern',          run: () => cam().zoomOut() },
    { id: 'view.fit',          labelKey: 'palette.fitToScreen',  groupKey: 'palette.groupView', shortcut: 'Ctrl+0',  keywords: 'fit screen reset camera zoom anpassen',      run: () => cam().fitToScreen() },
    { id: 'view.minimap',      labelKey: 'palette.toggleMinimap',groupKey: 'palette.groupView',                     keywords: 'minimap übersicht karte mini',               run: () => ui().toggleMinimap() },
    { id: 'view.leftSidebar',  labelKey: 'palette.toggleLeft',   groupKey: 'palette.groupView', shortcut: 'Ctrl+\\', keywords: 'left sidebar links seitenleiste',            run: () => ui().toggleLeftSidebar() },
    { id: 'view.rightSidebar', labelKey: 'palette.toggleRight',  groupKey: 'palette.groupView', shortcut: 'Ctrl+Shift+\\', keywords: 'right sidebar rechts seitenleiste',    run: () => ui().toggleRightSidebar() },
    { id: 'view.theme',        labelKey: 'palette.toggleTheme',  groupKey: 'palette.groupView',                     keywords: 'theme dark light design hell dunkel',        run: () => ui().toggleTheme() },
    { id: 'view.language',     labelKey: 'palette.toggleLanguage',groupKey: 'palette.groupView',                    keywords: 'language sprache german english deutsch',     run: () => ui().toggleLanguage() },

    // ── Panels
    { id: 'panel.tokens',     labelKey: 'palette.openTokens',     groupKey: 'palette.groupPanels', keywords: 'tokens token creatures karten',        run: () => openTab('tokens') },
    { id: 'panel.initiative', labelKey: 'palette.openInitiative', groupKey: 'palette.groupPanels', keywords: 'initiative combat kampf reihenfolge',  run: () => openTab('initiative') },
    { id: 'panel.rooms',      labelKey: 'palette.openRooms',      groupKey: 'palette.groupPanels', keywords: 'rooms räume zonen',                    run: () => openTab('rooms') },
    { id: 'panel.notes',      labelKey: 'palette.openNotes',      groupKey: 'palette.groupPanels', keywords: 'notes notizen',                        run: () => openTab('notes') },
    { id: 'panel.handouts',   labelKey: 'palette.openHandouts',   groupKey: 'palette.groupPanels', keywords: 'handouts handout',                     run: () => openTab('handouts') },
    { id: 'panel.encounters', labelKey: 'palette.openEncounters', groupKey: 'palette.groupPanels', keywords: 'encounters begegnungen',               run: () => openTab('encounters') },
    { id: 'panel.characters', labelKey: 'palette.openCharacters', groupKey: 'palette.groupPanels', keywords: 'characters charaktere',                run: () => openTab('characters') },
    { id: 'panel.library',    labelKey: 'palette.openLibrary',    groupKey: 'palette.groupPanels', keywords: 'bestiary bestiarium library bibliothek monster token srd',
      run: () => {
        // Bestiarium is a Workspace tab — exit the map first if needed
        // so CampaignView is the visible layer that catches the event.
        useCampaignStore.getState().setActiveMap(null)
        window.dispatchEvent(new CustomEvent('workspace:open-tab', { detail: 'library' }))
      } },
    { id: 'panel.audio',      labelKey: 'palette.openAudio',      groupKey: 'palette.groupPanels', keywords: 'audio music sound musik',              run: () => openFloating('audio') },
    { id: 'panel.overlay',    labelKey: 'palette.openOverlay',    groupKey: 'palette.groupPanels', keywords: 'overlay atmosphere weather wetter',    run: () => openFloating('overlay') },
    { id: 'panel.dice',       labelKey: 'palette.openDice',       groupKey: 'palette.groupPanels', keywords: 'dice würfel roll rollen',              run: () => openFloating('dice') },

    // ── Edit
    { id: 'edit.undo', labelKey: 'palette.undo', groupKey: 'palette.groupEdit', shortcut: 'Ctrl+Z',       keywords: 'undo rückgängig', run: () => undo().undo() },
    { id: 'edit.redo', labelKey: 'palette.redo', groupKey: 'palette.groupEdit', shortcut: 'Ctrl+Shift+Z', keywords: 'redo wiederholen', run: () => undo().redo() },

    // ── Campaign / File
    { id: 'campaign.save',   labelKey: 'palette.saveNow',       groupKey: 'palette.groupFile', shortcut: 'Ctrl+S', keywords: 'save speichern', run: () => { window.electronAPI?.saveNow() } },
    { id: 'campaign.export', labelKey: 'palette.exportCampaign',groupKey: 'palette.groupFile', keywords: 'export kampagne exportieren', run: () => { const id = campaign().activeCampaignId; if (id) window.electronAPI?.exportCampaign(id) } },
    { id: 'campaign.import', labelKey: 'palette.importCampaign',groupKey: 'palette.groupFile', keywords: 'import kampagne importieren', run: () => { window.electronAPI?.importCampaign() } },
    { id: 'compendium.open', labelKey: 'palette.openCompendium', groupKey: 'palette.groupFile', keywords: 'compendium kompendium srd pdf regelwerk rulebook', run: () => ui().setTopView('compendium') },
    { id: 'bestiary.open',   labelKey: 'palette.openBestiary',   groupKey: 'palette.groupFile', keywords: 'bestiary bestiarium monsters items spells gegenstände zauber', run: () => ui().setTopView('bestiary') },

    // ── Player window
    { id: 'player.open',         labelKey: 'palette.openPlayerWindow',   groupKey: 'palette.groupPlayer', shortcut: 'Ctrl+P', keywords: 'player window spielerfenster öffnen', run: () => { window.electronAPI?.openPlayerWindow?.() } },
  ].map((c) => ({ ...c, keywords: `${c.keywords} ${t(c.labelKey).toLowerCase()}`.toLowerCase() }))
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Rebuild on every render — cheap enough for ~30 commands, and i18n may have changed.
  const commands = useMemo(() => buildCommands(t), [t])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    const terms = q.split(/\s+/)
    return commands.filter((c) => terms.every((term) => c.keywords.includes(term)))
  }, [query, commands])

  // Focus the input on mount; restore focus to the previously-focused element on unmount.
  const previousFocusRef = useRef<Element | null>(null)
  useEffect(() => {
    previousFocusRef.current = document.activeElement
    inputRef.current?.focus()
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [])

  // Reset the highlighted row whenever the filter changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Keep the active row scrolled into view as the user arrow-keys through it.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const runAt = (i: number) => {
    const cmd = filtered[i]
    if (!cmd) return
    onClose()
    // Defer so the close animation can start before any heavy action fires.
    queueMicrotask(() => cmd.run())
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Focus trap: keep Tab/Shift+Tab within the palette (input ↔ list)
      e.preventDefault()
      const focusable = [inputRef.current, listRef.current].filter(Boolean) as HTMLElement[]
      if (focusable.length === 0) return
      const idx = focusable.indexOf(e.target as HTMLElement)
      const next = e.shiftKey
        ? (idx <= 0 ? focusable.length - 1 : idx - 1)
        : (idx >= focusable.length - 1 ? 0 : idx + 1)
      focusable[next]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(activeIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="command-palette-backdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={t('palette.title')}>
      <div
        className="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          placeholder={t('palette.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('palette.title')}
          aria-controls="command-palette-list"
          aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
        />
        <div id="command-palette-list" className="command-palette-list" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">{t('palette.noResults')}</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                id={`cmd-${cmd.id}`}
                data-index={i}
                className={`command-palette-row${i === activeIndex ? ' active' : ''}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => runAt(i)}
              >
                {cmd.groupKey && <span className="command-palette-group">{t(cmd.groupKey)}</span>}
                <span className="command-palette-label">{t(cmd.labelKey)}</span>
                {cmd.shortcut && <span className="command-palette-shortcut">{cmd.shortcut}</span>}
              </button>
            ))
          )}
        </div>
        <div className="command-palette-footer">
          <span>↑↓ {t('palette.navigate')}</span>
          <span>↵ {t('palette.execute')}</span>
          <span>Esc {t('palette.close')}</span>
        </div>
      </div>
    </div>
  )
}
