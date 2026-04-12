import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, type ActiveTool, type WorkMode } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { useUndoStore } from '../../stores/undoStore'
import { MonitorDialog } from '../MonitorDialog'
import clsx from 'clsx'
import logoSquare from '../../assets/boltberry-logo.png'

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
  const wrapRef = useRef<HTMLDivElement>(null)

  const activeInGroup = tools.find((t) => t.id === activeTool)
  const displayIcon = activeInGroup?.icon ?? groupIcon
  const isGroupActive = !!activeInGroup

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className={clsx('tool-btn', isGroupActive && 'active')}
        title={t(groupLabelKey)}
        onClick={() => setOpen((v) => !v)}
      >
        {displayIcon}
        <span style={{ fontSize: 8, lineHeight: 1, marginLeft: 1, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '4px 0',
          minWidth: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          zIndex: 9999,
        }}>
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
        </div>
      )}
    </div>
  )
}

// ─── Toolbar Divider ───────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
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

const WORK_MODE_CONFIG: { id: WorkMode; icon: string; label: string }[] = [
  { id: 'prep',           icon: '✎',  label: 'Vorbereitung' },
  { id: 'play',           icon: '▶',  label: 'Spiel' },
  { id: 'combat',         icon: '⚔️', label: 'Kampf' },
  { id: 'fog-edit',       icon: '🌫', label: 'Fog' },
  { id: 'player-preview', icon: '👁', label: 'Spieler-Vorschau' },
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
  const { activeCampaignId, campaigns } = useCampaignStore()
  const [showMonitorDialog, setShowMonitorDialog] = useState(false)
  const [cameraSent, setCameraSent] = useState(false)
  const zoomPercent = Math.round(useMapTransformStore((s) => s.scale / s.fitScale * 100))
  const canUndo = useUndoStore((s) => s.undoStack.length > 0)
  const canRedo = useUndoStore((s) => s.redoStack.length > 0)
  const lastUndoLabel = useUndoStore((s) => s.undoStack[s.undoStack.length - 1]?.label ?? '')
  const lastRedoLabel = useUndoStore((s) => s.redoStack[0]?.label ?? '')
  const { undo, redo } = useUndoStore()

  const activeCampaignName = campaigns.find((c) => c.id === activeCampaignId)?.name ?? ''

  // Leave current campaign and return to campaign list
  function handleLeaveCampaign() {
    useCampaignStore.getState().setActiveCampaign(null)
    useCampaignStore.getState().setActiveMaps([])
    useCampaignStore.getState().setActiveMap(null)
    useTokenStore.getState().setTokens([])
    useInitiativeStore.getState().setEntries([])
    useUIStore.getState().setWorkMode('prep')
    useUIStore.getState().setSessionMode('prep')
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
      setSessionMode('session')
      // Auto-switch to play mode if still on prep work-mode
      if (workMode === 'prep') setWorkMode('play')
    } else {
      setSessionMode('prep')
    }
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
  const showWallTools    = workMode === 'prep' || workMode === 'fog-edit'
  const showMeasureTools = workMode !== 'player-preview'
  const showRoomTools    = workMode === 'prep' || workMode === 'play'

  const isLive = sessionMode === 'session'

  return (
    <div className="toolbar">

      {/* ── SECTION: Navigation ─────────────────────────────────────────── */}
      <button className="tool-btn" title={t('toolbar.leftSidebar')} onClick={toggleLeftSidebar}>◧</button>

      {activeCampaignId && (
        <button
          className="tool-btn"
          title="Zur Kampagnenliste"
          onClick={handleLeaveCampaign}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 'var(--text-xs)', fontWeight: 600,
            maxWidth: 140, overflow: 'hidden',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ fontSize: 10 }}>◁</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeCampaignName}
          </span>
        </button>
      )}

      <Divider />

      {/* ── SECTION: Work Modes ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {WORK_MODE_CONFIG.map((wm) => (
          <button
            key={wm.id}
            className={clsx('tool-btn', workMode === wm.id && 'active')}
            title={wm.label}
            onClick={() => setWorkMode(wm.id)}
            style={workMode === wm.id ? {
              color: wm.id === 'combat'         ? 'var(--danger)'
                   : wm.id === 'fog-edit'       ? '#3b82f6'
                   : wm.id === 'player-preview' ? '#22c55e'
                   : undefined
            } : undefined}
          >
            {wm.icon}
          </button>
        ))}
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

      {/* Fog quick actions — shown when any fog tool is active */}
      {activeTool.startsWith('fog-') && (
        <>
          <button className="tool-btn" title="Alles aufdecken" onClick={() => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealAll' } }))}>👁</button>
          <button className="tool-btn" title="Alles zudecken" onClick={() => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))}>🌑</button>
          <button className="tool-btn" title="Token-Sichtbereich aufdecken" onClick={() => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealTokens' } }))}>⬤👁</button>
          <button className="tool-btn" title="Erkundetes zurücksetzen" onClick={() => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'resetExplored' } }))}>🔄</button>
        </>
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
        <ToolGroup
          tools={WALL_TOOLS}
          activeTool={activeTool}
          groupIcon="🧱"
          groupLabelKey="toolbar.tools.wallGroup"
          onSelect={handleToolClick}
        />
      )}

      {showRoomTools && (
        <ToolGroup
          tools={ROOM_TOOLS}
          activeTool={activeTool}
          groupIcon="🏠"
          groupLabelKey="toolbar.tools.roomGroup"
          onSelect={handleToolClick}
        />
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
        style={showPlayerEye ? { color: '#22c55e' } : undefined}
      >
        👁‍🗨
      </button>

      <Divider />

      {/* ── SECTION: Session Status (prominent) ─────────────────────────── */}
      <button
        onClick={handleSessionToggle}
        title={isLive ? 'Session beenden — Spieler-Sync deaktivieren' : 'Session starten — Änderungen live an Spieler senden'}
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
          flexShrink: 0,
          ...(isLive ? {
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#22c55e',
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
          background: isLive ? '#22c55e' : 'var(--warning)',
          boxShadow: isLive ? '0 0 0 2px rgba(34,197,94,0.3)' : 'none',
        }} />
        {isLive ? 'LIVE' : 'VORBEREITUNG'}
      </button>

      {/* Camera follow toggle */}
      <button
        className={clsx('tool-btn', cameraFollowDM && 'active')}
        title={cameraFollowDM ? 'Kamera-Folgemodus AN — Kamera wird kontinuierlich synchronisiert' : 'Kamera-Folgemodus AUS — Einmalig senden mit 📺'}
        onClick={toggleCameraFollow}
        style={cameraFollowDM ? { color: 'var(--success)' } : undefined}
      >
        📡
      </button>

      <Divider />

      {/* ── SECTION: Player Window ──────────────────────────────────────── */}
      <button
        className={clsx('tool-btn', playerConnected && 'active')}
        title={playerConnected ? 'Spielerfenster schließen' : 'Spielerfenster öffnen'}
        onClick={handlePlayerWindowToggle}
        style={playerConnected ? { color: '#22c55e' } : undefined}
      >
        {playerConnected ? '🖥' : '🖥'}
        <span style={{ fontSize: 8, marginLeft: 2, opacity: 0.7 }}>{playerConnected ? '●' : '○'}</span>
      </button>

      {/* Single camera send */}
      <button
        className={clsx('tool-btn', cameraSent && 'active')}
        title="Kamera-Ausschnitt einmalig an Spieler senden"
        onClick={handleShareCamera}
        style={cameraSent ? { color: 'var(--success)' } : undefined}
      >
        📺
      </button>

      {/* Blackout — use distinct icon */}
      <button
        className={clsx('tool-btn', blackoutActive && 'active')}
        title={t('toolbar.blackout')}
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
      <button className="tool-btn" title="Vergrößern (+)" onClick={() => useMapTransformStore.getState().zoomIn()}>🔍+</button>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'center', lineHeight: '32px', fontFamily: 'monospace' }}>
        {zoomPercent}%
      </div>
      <button className="tool-btn" title="Verkleinern (-)" onClick={() => useMapTransformStore.getState().zoomOut()}>🔍−</button>
      <button className="tool-btn" title="Ansicht anpassen (0)" onClick={() => useMapTransformStore.getState().fitToScreen()}>⊡</button>
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
    </div>
  )
}
