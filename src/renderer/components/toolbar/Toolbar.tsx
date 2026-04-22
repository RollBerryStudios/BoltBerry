import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useUIStore, type WorkMode } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useUndoStore } from '../../stores/undoStore'
import { useFogStore } from '../../stores/fogStore'
import { MonitorDialog } from '../MonitorDialog'
import { SessionStartModal } from '../SessionStartModal'
import clsx from 'clsx'
import logoSquare from '../../assets/boltberry-logo.png'

// ─── Dropdown positioning ────────────────────────────────────────────────────
// The toolbar is overflow:hidden vertically (to hide horizontal scroll on
// narrow windows), so an absolutely-positioned child dropdown is clipped
// before it reaches the canvas. We sidestep that by portaling the dropdown
// to document.body and computing its position from the anchor's viewport
// rect — it's a fixed-position floating element, untouched by any
// stacking/clipping context on the toolbar side.
function useAnchoredPosition(anchorRef: React.RefObject<HTMLElement>, open: boolean) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])
  return pos
}

// ─── Toolbar Divider ───────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
}

// The BroadcastPill lives in DmTitleBar.tsx; the top toolbar no longer hosts
// the breadcrumb or the live/prep/offline indicator.

// ─── Action group dropdown ────────────────────────────────────────────────────
// Same UX as ToolGroup but for fire-and-forget commands (no persistent active
// state). Used to fold the four fog quick-action buttons into a single slot.

interface ActionItem {
  id: string
  icon: string
  labelKey: string
  run: () => void
}

interface ActionGroupProps {
  actions: ActionItem[]
  groupIcon: string
  groupLabelKey: string
}

function ActionGroup({ actions, groupIcon, groupLabelKey }: ActionGroupProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pos = useAnchoredPosition(btnRef, open)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        className="tool-btn"
        title={t(groupLabelKey)}
        onClick={() => setOpen((v) => !v)}
      >
        {groupIcon}
        <span style={{ fontSize: 8, lineHeight: 1, marginLeft: 1, opacity: 0.6 }}>▾</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '4px 0',
            minWidth: 220,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 9999,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => { action.run(); setOpen(false) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <span style={{ fontSize: 16, minWidth: 20, textAlign: 'center' }}>{action.icon}</span>
              <span style={{ flex: 1 }}>{t(action.labelKey)}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Tool Definitions ──────────────────────────────────────────────────────────
// Primary tool selection (select/pointer/token/measure/fog/draw/wall/room) now
// lives in the floating LeftToolDock (v1 Conservative left rail). The top
// toolbar only keeps session chrome, work modes, contextual fog controls,
// and view actions (undo/redo/zoom/etc).

const WORK_MODE_CONFIG: { id: WorkMode; icon: string; label: string; shortLabel: string }[] = [
  { id: 'prep',           icon: '✎',  label: 'Vorbereitung',    shortLabel: 'Prep'    },
  { id: 'play',           icon: '▶',  label: 'Spiel',           shortLabel: 'Spiel'   },
  { id: 'combat',         icon: '⚔️', label: 'Kampf',           shortLabel: 'Kampf'   },
  { id: 'fog-edit',       icon: '🌫', label: 'Nebel bearbeiten',shortLabel: 'Fog'     },
  { id: 'player-preview', icon: '👁', label: 'Spieler-Vorschau',shortLabel: 'Vorschau'},
]

// ─── Main Toolbar ──────────────────────────────────────────────────────────────

export function Toolbar() {
  const { t } = useTranslation()
  const {
    activeTool,
    toggleBlackout, blackoutActive,
    toggleTheme, theme,
    toggleLeftSidebar, toggleRightSidebar,
    sessionMode, setSessionMode,
    toggleLanguage, language,
    playerViewportMode, setPlayerViewportMode, setPlayerViewport,
    gridSnap, toggleGridSnap,
    showMinimap, toggleMinimap,
    fogBrushRadius, setFogBrushRadius,
    workMode, setWorkMode,
    showPlayerEye, togglePlayerEye,
    playerConnected,
  } = useUIStore()
  const { activeCampaignId } = useCampaignStore()
  const [showMonitorDialog, setShowMonitorDialog] = useState(false)
  const [showSessionStartModal, setShowSessionStartModal] = useState(false)
  const [liveWarning, setLiveWarning] = useState<string | null>(null)
  const [workModeToast, setWorkModeToast] = useState<string | null>(null)
  const zoomPercent = Math.round(useMapTransformStore((s) => s.scale / s.fitScale * 100))
  const canUndo = useUndoStore((s) => s.undoStack.length > 0)
  const canRedo = useUndoStore((s) => s.redoStack.length > 0)
  const lastUndoLabel = useUndoStore((s) => s.undoStack[s.undoStack.length - 1]?.label ?? '')
  const lastRedoLabel = useUndoStore((s) => s.redoStack[0]?.label ?? '')
  const { undo, redo } = useUndoStore()

  // Leave the current map and return to the Campaign View
  function handleLeaveMap() {
    useCampaignStore.getState().setActiveMap(null)
    useTokenStore.getState().setTokens([])
    useInitiativeStore.getState().setEntries([])
    useFogStore.getState().clearHistory()
    useUIStore.getState().setWorkMode('prep')
    useUIStore.getState().setSessionMode('prep')
    useUIStore.getState().clearTokenSelection()
  }

  function handleSessionToggle() {
    if (sessionMode === 'prep') {
      // Going prep → session: require confirmation via SessionStartModal
      const { activeMapId } = useCampaignStore.getState()
      if (!activeMapId) {
        setLiveWarning('Keine Karte geladen')
        setTimeout(() => setLiveWarning(null), 3000)
        return
      }
      setShowSessionStartModal(true)
    } else {
      setSessionMode('prep')
    }
  }

  function handleSessionStartConfirm() {
    setShowSessionStartModal(false)
    setSessionMode('session')
    if (workMode === 'prep') setWorkMode('play')
  }

  function handleSessionStartCancel() {
    setShowSessionStartModal(false)
  }

  function handleSessionStartOpenPlayerWindow() {
    setShowMonitorDialog(true)
  }

  function handlePlayerWindowToggle() {
    if (playerConnected) {
      window.electronAPI?.closePlayerWindow()
    } else {
      setShowMonitorDialog(true)
    }
  }

  const isLive = sessionMode === 'session'

  return (
    <div className="toolbar">

      {/* ── SECTION: Navigation ─────────────────────────────────────────── */}
      <button className="tool-btn" title={t('toolbar.leftSidebar')} aria-label={t('toolbar.leftSidebar')} onClick={toggleLeftSidebar}>◧</button>

      {/* Breadcrumb + broadcast pill now live in the frameless title bar
          (src/renderer/components/DmTitleBar.tsx). Only the back-to-
          campaign button stays here as part of the toolbar's Navigation
          section — it's a tool action, not a status display. */}
      {activeCampaignId && (
        <button
          className="tool-btn"
          title={t('toolbar.backToCampaign')}
          aria-label={t('toolbar.backToCampaign')}
          onClick={handleLeaveMap}
          style={{ color: 'var(--text-secondary)' }}
        >
          ◁
        </button>
      )}

      <Divider />

      {/* ── SECTION: Work Modes ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div className="workmode-group">
          {WORK_MODE_CONFIG.map((wm) => (
            <button
              key={wm.id}
              className={clsx(
                'workmode-btn',
                workMode === wm.id && 'active',
                workMode === wm.id && wm.id === 'play'           && 'active-play',
                workMode === wm.id && wm.id === 'combat'         && 'active-combat',
                workMode === wm.id && wm.id === 'fog-edit'       && 'active-fog',
                workMode === wm.id && wm.id === 'player-preview' && 'active-prev',
              )}
              title={wm.label}
              onClick={() => {
                setWorkMode(wm.id)
                const config = WORK_MODE_CONFIG.find((c) => c.id === wm.id)
                if (config) {
                  setWorkModeToast(config.label)
                  setTimeout(() => setWorkModeToast(null), 1800)
                }
              }}
            >
              <span style={{ fontSize: 13 }}>{wm.icon}</span>
              <span style={{ fontSize: 10, marginLeft: 4 }}>{wm.shortLabel}</span>
            </button>
          ))}
        </div>
        {workModeToast && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '3px 10px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            {workModeToast}
          </div>
        )}
      </div>

      <Divider />

      {/* ── SECTION: Fog-contextual controls ────────────────────────────── */}
      {/* Primary tool selection lives in the floating LeftToolDock. What
          remains here are the fog-tool modifiers (brush radius, bulk
          reveal/cover actions) that only make sense while a fog tool is
          active. They render conditionally so the chrome strip stays slim
          outside of fog-editing. */}

      {/* Fog brush size — only when a brush fog tool is active */}
      {(activeTool === 'fog-brush' || activeTool === 'fog-brush-cover') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>⌀</span>
          <input
            type="range" min={5} max={100} step={1}
            value={fogBrushRadius}
            onChange={(e) => setFogBrushRadius(parseInt(e.target.value))}
            style={{ width: 60 }}
          />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 24 }}>{fogBrushRadius}px</span>
        </div>
      )}

      {/* Fog quick actions — folded into a single dropdown to keep the toolbar narrow */}
      {(activeTool.startsWith('fog-') || workMode === 'fog-edit') && (
        <ActionGroup
          groupIcon="🌫"
          groupLabelKey="toolbar.tools.fogActionsGroup"
          actions={[
            { id: 'revealAll',     icon: '👁',  labelKey: 'toolbar.tools.fogRevealAll',     run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealAll' } })) },
            { id: 'coverAll',      icon: '🌑',  labelKey: 'toolbar.tools.fogCoverAll',      run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } })) },
            { id: 'revealTokens',  icon: '⬤',   labelKey: 'toolbar.tools.fogRevealTokens',  run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealTokens' } })) },
            { id: 'resetExplored', icon: '🔄',  labelKey: 'toolbar.tools.fogResetExplored', run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'resetExplored' } })) },
          ]}
        />
      )}

      <button
        className={clsx('tool-btn', showPlayerEye && 'active')}
        title={showPlayerEye ? 'Spieler-Sicht ausblenden [E]' : 'Spieler-Sicht anzeigen [E]'}
        aria-label={showPlayerEye ? 'Spieler-Sicht ausblenden' : 'Spieler-Sicht anzeigen'}
        onClick={togglePlayerEye}
        style={showPlayerEye ? { color: 'var(--success)' } : undefined}
      >
        👁‍🗨
      </button>

      <Divider />

      {/* ── SECTION: Session ─────────────────────────────────────────────── */}
      {/* Live/Prep toggle — direct, no modal */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button
          onClick={handleSessionToggle}
          title={isLive ? 'Session beenden' : 'Session starten — Änderungen live an Spieler senden'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px',
            borderRadius: 'var(--radius)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.04em',
            transition: 'background var(--transition), color var(--transition)',
            ...(isLive ? {
              background: 'rgba(34, 197, 94, 0.15)',
              color: 'var(--success)',
              outline: '1px solid rgba(34, 197, 94, 0.4)',
            } : {
              background: 'rgba(245, 158, 0, 0.15)',
              color: 'var(--warning)',
              outline: '1px solid rgba(245, 158, 0, 0.4)',
            }),
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: isLive ? 'var(--success)' : 'var(--warning)',
            boxShadow: isLive ? '0 0 0 2px rgba(34,197,94,0.3)' : 'none',
          }} />
          {isLive ? 'LIVE' : 'VORBEREITUNG'}
        </button>
        {liveWarning && (
          <span style={{
            fontSize: 9, color: 'var(--warning)', whiteSpace: 'nowrap',
            background: 'rgba(245,158,0,0.12)', padding: '1px 6px',
            borderRadius: 3, border: '1px solid rgba(245,158,0,0.3)',
          }}>
            ⚠ {liveWarning}
          </span>
        )}
      </div>

      {/* Compendium — always reachable, swaps the whole view via topView */}
      <button
        className="tool-btn"
        title={t('compendium.title')}
        aria-label={t('compendium.title')}
        onClick={() => useUIStore.getState().setTopView('compendium')}
      >
        📚
      </button>

      {/* Player window */}
      <button
        className={clsx('tool-btn', playerConnected && 'active')}
        title={playerConnected ? 'Spielerfenster schließen (Ctrl+P)' : `${t('toolbar.openPlayerWindow')} (Ctrl+P)`}
        onClick={handlePlayerWindowToggle}
        style={playerConnected ? { color: 'var(--success)' } : undefined}
      >
        🖥
        <span style={{ fontSize: 8, marginLeft: 2, opacity: 0.7 }}>{playerConnected ? '●' : '○'}</span>
      </button>

      {/* Player Control Mode — independent framed view on the player screen.
          Replaces the legacy 📡 "follow camera" + 📺 "share once" buttons.
          The dashed rectangle on the GM canvas is the single source of
          truth for what the player window renders. */}
      <button
        className={clsx('tool-btn', playerViewportMode && 'active')}
        title={playerViewportMode
          ? t('toolbar.playerControl.on')
          : t('toolbar.playerControl.off')}
        onClick={() => {
          const next = !playerViewportMode
          if (next) {
            const { scale, offsetX, offsetY, canvasW, canvasH } = useMapTransformStore.getState()
            if (scale > 0 && canvasW > 0 && canvasH > 0) {
              setPlayerViewport({
                cx: (canvasW / 2 - offsetX) / scale,
                cy: (canvasH / 2 - offsetY) / scale,
                w: canvasW / scale,
                h: canvasH / scale,
                rotation: 0,
              })
            }
          }
          setPlayerViewportMode(next)
        }}
        style={playerViewportMode ? { color: 'var(--accent)' } : undefined}
      >
        🎯
      </button>

      {/* Blackout */}
      <button
        className={clsx('tool-btn', blackoutActive && 'active')}
        title={`${t('toolbar.blackout')} (Ctrl+B)`}
        aria-label={t('toolbar.blackout')}
        onClick={toggleBlackout}
        style={blackoutActive ? { color: 'var(--warning)' } : undefined}
      >
        🌚
      </button>

      <Divider />

      {/* ── SECTION: Undo / Redo ────────────────────────────────────────── */}
      <button
        className="tool-btn"
        title={canUndo ? `Rückgängig: ${lastUndoLabel} (Ctrl+Z)` : 'Nichts rückgängig zu machen'}
        aria-label="Rückgängig"
        disabled={!canUndo}
        onClick={() => undo()}
        style={!canUndo ? { opacity: 0.35 } : undefined}
      >
        ↩
      </button>
      <button
        className="tool-btn"
        title={canRedo ? `Wiederholen: ${lastRedoLabel} (Ctrl+Y)` : 'Nichts zu wiederholen'}
        aria-label="Wiederholen"
        disabled={!canRedo}
        onClick={() => redo()}
        style={!canRedo ? { opacity: 0.35 } : undefined}
      >
        ↪
      </button>

      <Divider />

      {/* ── SECTION: View ───────────────────────────────────────────────── */}
      <div
        title="Zoom (Mausrad zum Zoomen)"
        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'center', lineHeight: '32px', fontFamily: 'monospace', cursor: 'default' }}
      >
        {zoomPercent}%
      </div>
      <button className="tool-btn" title="Ansicht einpassen (0)" aria-label="Ansicht einpassen" onClick={() => useMapTransformStore.getState().fitToScreen()}>⊡</button>
      <button className={clsx('tool-btn', showMinimap && 'active')} title="Minimap" aria-label="Minimap" onClick={toggleMinimap}>🗺</button>
      <button
        className={clsx('tool-btn', gridSnap && 'active')}
        title={gridSnap ? 'Raster-Snap AN' : 'Raster-Snap AUS'}
        aria-label={gridSnap ? 'Raster-Snap AN' : 'Raster-Snap AUS'}
        onClick={toggleGridSnap}
      >
        ⊞
      </button>

      <div style={{ flex: 1 }} />

      {/* ── SECTION: Misc ───────────────────────────────────────────────── */}
      {activeCampaignId && (
        <img
          src={logoSquare}
          alt="BoltBerry"
          style={{
            height: 24,
            width: 'auto',
            marginRight: 'var(--sp-2)',
            filter: 'drop-shadow(0 0 6px rgba(245, 168, 0, 0.3))',
          }}
        />
      )}

      <button
        className="tool-btn"
        title={t('toolbar.shortcuts')}
        aria-label={t('toolbar.shortcuts')}
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
      >
        ?
      </button>

      <button
        className="tool-btn"
        title={t('toolbar.switchLanguage')}
        aria-label={t('toolbar.switchLanguage')}
        onClick={toggleLanguage}
        style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}
      >
        {language === 'de' ? 'EN' : 'DE'}
      </button>

      <button
        className="tool-btn"
        title={theme === 'dark' ? t('toolbar.themeDark') : t('toolbar.themeLight')}
        aria-label={theme === 'dark' ? t('toolbar.themeDark') : t('toolbar.themeLight')}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>

      <button className="tool-btn" title={t('toolbar.rightSidebar')} aria-label={t('toolbar.rightSidebar')} onClick={toggleRightSidebar}>◨</button>

      {showMonitorDialog && (
        <MonitorDialog onClose={() => setShowMonitorDialog(false)} />
      )}

      {showSessionStartModal && (
        <SessionStartModal
          onConfirm={handleSessionStartConfirm}
          onCancel={handleSessionStartCancel}
          onOpenPlayerWindow={handleSessionStartOpenPlayerWindow}
        />
      )}
    </div>
  )
}
