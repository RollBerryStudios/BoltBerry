import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useUIStore, type ActiveTool, type WorkMode } from '../../stores/uiStore'
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

// ─── Tool group dropdown ───────────────────────────────────────────────────────

interface ToolGroupProps {
  tools: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[]
  activeTool: ActiveTool
  groupIcon: string
  groupLabelKey: string
  onSelect: (id: ActiveTool) => void
}

function ToolGroup({ tools, activeTool, groupIcon, groupLabelKey, onSelect }: ToolGroupProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pos = useAnchoredPosition(btnRef, open)

  const activeInGroup = tools.find((t) => t.id === activeTool)
  const displayIcon = activeInGroup?.icon ?? groupIcon
  const isGroupActive = !!activeInGroup

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
        className={clsx('tool-btn', isGroupActive && 'active')}
        title={t(groupLabelKey)}
        onClick={() => setOpen((v) => !v)}
      >
        {displayIcon}
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
            minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 9999,
          }}
        >
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => { onSelect(tool.id); setOpen(false) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 12px',
                background: activeTool === tool.id ? 'var(--accent-blue-dim)' : 'none',
                border: 'none',
                borderLeft: activeTool === tool.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                color: activeTool === tool.id ? 'var(--accent-blue-light)' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (activeTool !== tool.id) e.currentTarget.style.background = 'var(--bg-overlay)' }}
              onMouseLeave={(e) => { if (activeTool !== tool.id) e.currentTarget.style.background = 'none' }}
            >
              <span style={{ fontSize: 16, minWidth: 20, textAlign: 'center' }}>{tool.icon}</span>
              <span style={{ flex: 1 }}>{t(tool.labelKey)}</span>
              {tool.shortcut && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-overlay)', padding: '1px 4px', borderRadius: 3 }}>
                  {tool.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Toolbar Divider ───────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
}

// ─── Broadcast status pill ───────────────────────────────────────────────
// Read-only indicator of what the second-screen is receiving right now.
// Green = session running + player connected. Yellow = player connected but
// DM still prepping (so any share is visible to players). Muted = no player.
function BroadcastPill({ status }: { status: 'live' | 'prep' | 'offline' }) {
  const { t } = useTranslation()
  const label =
    status === 'live' ? t('toolbar.broadcastLive')
    : status === 'prep' ? t('toolbar.broadcastPrep')
    : t('toolbar.broadcastOffline')
  const title =
    status === 'live' ? t('toolbar.broadcastLiveHint')
    : status === 'prep' ? t('toolbar.broadcastPrepHint')
    : t('toolbar.broadcastOfflineHint')
  return (
    <div className={clsx('toolbar-broadcast-pill', `toolbar-broadcast-${status}`)} title={title}>
      <span className="toolbar-broadcast-dot" />
      <span className="toolbar-broadcast-label">{label}</span>
    </div>
  )
}

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

const PRIMARY_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'select',  icon: '↖',  labelKey: 'toolbar.tools.select',  shortcut: 'V' },
  { id: 'pointer', icon: '👆', labelKey: 'toolbar.tools.pointer', shortcut: 'W' },
  { id: 'token',   icon: '⬤',  labelKey: 'toolbar.tools.token',   shortcut: 'T' },
]

const FOG_DIRECT_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'fog-brush', icon: '🖌', labelKey: 'toolbar.tools.fogBrush', shortcut: 'B' },
  { id: 'fog-rect',  icon: '▭',  labelKey: 'toolbar.tools.fogRect',  shortcut: 'F' },
]

const FOG_GROUP_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'fog-polygon',     icon: '⬡', labelKey: 'toolbar.tools.fogPolygon',    shortcut: 'P' },
  { id: 'fog-cover',       icon: '▮', labelKey: 'toolbar.tools.fogCover',      shortcut: 'C' },
  { id: 'fog-brush-cover', icon: '✏', labelKey: 'toolbar.tools.fogBrushCover', shortcut: 'X' },
]

const MEASURE_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'measure-line',   icon: '📏', labelKey: 'toolbar.tools.measureLine',   shortcut: 'M' },
  { id: 'measure-circle', icon: '◎',  labelKey: 'toolbar.tools.measureCircle', shortcut: '' },
  { id: 'measure-cone',   icon: '◿',  labelKey: 'toolbar.tools.measureCone',   shortcut: '' },
]

const DRAW_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'draw-freehand', icon: '✏️', labelKey: 'toolbar.tools.drawFreehand', shortcut: 'D' },
  { id: 'draw-rect',     icon: '▢',  labelKey: 'toolbar.tools.drawRect',     shortcut: '' },
  { id: 'draw-circle',   icon: '○',  labelKey: 'toolbar.tools.drawCircle',   shortcut: '' },
  { id: 'draw-text',     icon: 'T',  labelKey: 'toolbar.tools.drawText',     shortcut: '' },
]

const WALL_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'wall-draw', icon: '🧱', labelKey: 'toolbar.tools.wallDraw', shortcut: 'G' },
  { id: 'wall-door', icon: '🚪', labelKey: 'toolbar.tools.wallDoor', shortcut: 'J' },
]

const ROOM_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'room', icon: '🏠', labelKey: 'toolbar.tools.room', shortcut: 'R' },
]

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
    activeTool, setActiveTool,
    toggleBlackout, blackoutActive,
    toggleTheme, theme,
    toggleLeftSidebar, toggleRightSidebar,
    sessionMode, setSessionMode,
    toggleLanguage, language,
    cameraFollowDM, toggleCameraFollow,
    gridSnap, toggleGridSnap,
    showMinimap, toggleMinimap,
    fogBrushRadius, setFogBrushRadius,
    workMode, setWorkMode,
    showPlayerEye, togglePlayerEye,
    playerConnected,
  } = useUIStore()
  const { activeCampaignId, campaigns, activeMapId, activeMaps } = useCampaignStore()
  const [showMonitorDialog, setShowMonitorDialog] = useState(false)
  const [showSessionStartModal, setShowSessionStartModal] = useState(false)
  const [liveWarning, setLiveWarning] = useState<string | null>(null)
  const [cameraSent, setCameraSent] = useState(false)
  const [workModeToast, setWorkModeToast] = useState<string | null>(null)
  const zoomPercent = Math.round(useMapTransformStore((s) => s.scale / s.fitScale * 100))
  const canUndo = useUndoStore((s) => s.undoStack.length > 0)
  const canRedo = useUndoStore((s) => s.redoStack.length > 0)
  const lastUndoLabel = useUndoStore((s) => s.undoStack[s.undoStack.length - 1]?.label ?? '')
  const lastRedoLabel = useUndoStore((s) => s.redoStack[0]?.label ?? '')
  const { undo, redo } = useUndoStore()

  const activeCampaignName = campaigns.find((c) => c.id === activeCampaignId)?.name ?? ''
  const activeMapName = activeMaps.find((m) => m.id === activeMapId)?.name ?? ''

  // Broadcast status: what the player window is currently receiving.
  // live     — session is running AND player window is connected.
  // prep     — player window is connected but DM is prepping (session not
  //            started) — anything shared is visible to players right now.
  // offline  — no player window open; nothing is being broadcast.
  const broadcastStatus: 'live' | 'prep' | 'offline' =
    !playerConnected ? 'offline' : sessionMode === 'session' ? 'live' : 'prep'

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

  async function handleAtmosphere() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.importFile('atmosphere')
    if (result) {
      useUIStore.getState().setAtmosphereImage(result.path)
      window.electronAPI.sendAtmosphere(result.path)
    }
  }

  function handleShareCamera() {
    const { scale, offsetX, offsetY, fitScale, canvasW, canvasH } = useMapTransformStore.getState()
    if (!fitScale || !canvasW || !canvasH) return
    const imageCenterX = (canvasW / 2 - offsetX) / scale
    const imageCenterY = (canvasH / 2 - offsetY) / scale
    const relZoom = scale / fitScale
    window.electronAPI?.sendCameraView({ imageCenterX, imageCenterY, relZoom })
    setCameraSent(true)
    setTimeout(() => setCameraSent(false), 1200)
  }

  function handleToolClick(tool: ActiveTool) {
    if (tool === 'atmosphere') { handleAtmosphere(); return }
    setActiveTool(tool)
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

  // Filter tools based on work mode
  const visiblePrimaryTools = PRIMARY_TOOLS.filter((tool) => {
    if (workMode === 'player-preview') return tool.id === 'pointer'
    return true
  })
  const showFogTools     = workMode === 'fog-edit' || workMode === 'prep'
  const showDrawTools    = workMode === 'prep' || workMode === 'play' || workMode === 'combat'
  // Wall/room tools are always visible but dimmed in combat mode (progressive disclosure)
  const showWallTools    = workMode === 'prep' || workMode === 'fog-edit' || workMode === 'combat'
  const showMeasureTools = workMode !== 'player-preview'
  const showRoomTools    = workMode === 'prep' || workMode === 'play' || workMode === 'combat'
  const combatActive     = workMode === 'combat'

  const isLive = sessionMode === 'session'

  return (
    <div className="toolbar">

      {/* ── SECTION: Navigation ─────────────────────────────────────────── */}
      <button className="tool-btn" title={t('toolbar.leftSidebar')} onClick={toggleLeftSidebar}>◧</button>

      {activeCampaignId && (
        <>
          <button
            className="tool-btn"
            title={t('toolbar.backToCampaign')}
            onClick={handleLeaveMap}
            style={{ color: 'var(--text-secondary)' }}
          >
            ◁
          </button>
          <div className="toolbar-breadcrumb" title={`${activeCampaignName}${activeMapName ? ' / ' + activeMapName : ''}`}>
            <span className="toolbar-breadcrumb-campaign">{activeCampaignName}</span>
            {activeMapName && (
              <>
                <span className="toolbar-breadcrumb-sep">/</span>
                <span className="toolbar-breadcrumb-map">{activeMapName}</span>
              </>
            )}
          </div>
          <BroadcastPill status={broadcastStatus} />
        </>
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

      {/* ── SECTION: Tools ──────────────────────────────────────────────── */}
      {visiblePrimaryTools.map((tool) => (
        <button
          key={tool.id}
          className={clsx('tool-btn', activeTool === tool.id && 'active')}
          title={`${t(tool.labelKey)} [${tool.shortcut}]`}
          onClick={() => handleToolClick(tool.id)}
        >
          {tool.icon}
        </button>
      ))}

      {showFogTools && (
        <>
          {FOG_DIRECT_TOOLS.map((tool) => (
            <button
              key={tool.id}
              className={clsx('tool-btn', activeTool === tool.id && 'active')}
              title={`${t(tool.labelKey)} [${tool.shortcut}]`}
              onClick={() => handleToolClick(tool.id)}
            >
              {tool.icon}
            </button>
          ))}
          <ToolGroup
            tools={FOG_GROUP_TOOLS}
            activeTool={activeTool}
            groupIcon="⬡"
            groupLabelKey="toolbar.tools.fogGroup"
            onSelect={handleToolClick}
          />
        </>
      )}

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

      {showMeasureTools && (
        <ToolGroup
          tools={MEASURE_TOOLS}
          activeTool={activeTool}
          groupIcon="📏"
          groupLabelKey="toolbar.tools.measureGroup"
          onSelect={handleToolClick}
        />
      )}

      {showDrawTools && (
        <ToolGroup
          tools={DRAW_TOOLS}
          activeTool={activeTool}
          groupIcon="✏️"
          groupLabelKey="toolbar.tools.drawGroup"
          onSelect={handleToolClick}
        />
      )}

      {showWallTools && (
        <div
          style={combatActive ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
          title={combatActive ? 'Im Kampfmodus nicht verfügbar' : undefined}
        >
          <ToolGroup
            tools={WALL_TOOLS}
            activeTool={activeTool}
            groupIcon="🧱"
            groupLabelKey="toolbar.tools.wallGroup"
            onSelect={handleToolClick}
          />
        </div>
      )}

      {showRoomTools && (
        <div
          style={combatActive ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
          title={combatActive ? 'Im Kampfmodus nicht verfügbar' : undefined}
        >
          <ToolGroup
            tools={ROOM_TOOLS}
            activeTool={activeTool}
            groupIcon="🏠"
            groupLabelKey="toolbar.tools.roomGroup"
            onSelect={handleToolClick}
          />
        </div>
      )}

      <button
        className="tool-btn"
        title={t('toolbar.tools.atmosphere')}
        onClick={handleAtmosphere}
      >
        🖼
      </button>

      <button
        className={clsx('tool-btn', showPlayerEye && 'active')}
        title={showPlayerEye ? 'Spieler-Sicht ausblenden [E]' : 'Spieler-Sicht anzeigen [E]'}
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

      {/* Camera: one-shot send */}
      <button
        className={clsx('tool-btn', cameraSent && 'active')}
        title="Kamera einmalig senden — überträgt den aktuellen Bildausschnitt einmalig an das Spielerfenster"
        onClick={handleShareCamera}
        style={cameraSent ? { color: 'var(--success)' } : undefined}
      >
        📺
      </button>

      {/* Camera follow toggle */}
      <button
        className={clsx('tool-btn', cameraFollowDM && 'active')}
        title={cameraFollowDM
          ? 'Kamera-Synchronisierung AN — Spielerfenster folgt automatisch deinem Bildausschnitt (klicken zum Deaktivieren)'
          : 'Kamera-Synchronisierung AUS — Spielerfenster bewegt sich nicht mit (klicken zum Aktivieren)'}
        onClick={toggleCameraFollow}
        style={cameraFollowDM ? { color: 'var(--success)' } : undefined}
      >
        📡
      </button>

      {/* Blackout */}
      <button
        className={clsx('tool-btn', blackoutActive && 'active')}
        title={`${t('toolbar.blackout')} (Ctrl+B)`}
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
        disabled={!canUndo}
        onClick={() => undo()}
        style={!canUndo ? { opacity: 0.35 } : undefined}
      >
        ↩
      </button>
      <button
        className="tool-btn"
        title={canRedo ? `Wiederholen: ${lastRedoLabel} (Ctrl+Y)` : 'Nichts zu wiederholen'}
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
      <button className="tool-btn" title="Ansicht einpassen (0)" onClick={() => useMapTransformStore.getState().fitToScreen()}>⊡</button>
      <button className={clsx('tool-btn', showMinimap && 'active')} title="Minimap" onClick={toggleMinimap}>🗺</button>
      <button
        className={clsx('tool-btn', gridSnap && 'active')}
        title={gridSnap ? 'Raster-Snap AN' : 'Raster-Snap AUS'}
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
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
      >
        ?
      </button>

      <button
        className="tool-btn"
        title={t('toolbar.switchLanguage')}
        onClick={toggleLanguage}
        style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}
      >
        {language === 'de' ? 'EN' : 'DE'}
      </button>

      <button
        className="tool-btn"
        title={theme === 'dark' ? t('toolbar.themeDark') : t('toolbar.themeLight')}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>

      <button className="tool-btn" title={t('toolbar.rightSidebar')} onClick={toggleRightSidebar}>◨</button>

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
