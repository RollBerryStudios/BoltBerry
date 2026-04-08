import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
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

// ─── Main Toolbar ──────────────────────────────────────────────────────────────

const PRIMARY_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'select',  icon: '↖',  labelKey: 'toolbar.tools.select',  shortcut: 'V' },
  { id: 'pointer', icon: '👆', labelKey: 'toolbar.tools.pointer', shortcut: 'W' },
  { id: 'token',   icon: '⬤',  labelKey: 'toolbar.tools.token',   shortcut: 'T' },
]

const FOG_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'fog-rect',    icon: '▭', labelKey: 'toolbar.tools.fogRect',    shortcut: 'F' },
  { id: 'fog-polygon', icon: '⬡', labelKey: 'toolbar.tools.fogPolygon', shortcut: 'P' },
  { id: 'fog-cover',   icon: '▮', labelKey: 'toolbar.tools.fogCover',   shortcut: 'C' },
]

const MEASURE_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'measure-line',   icon: '📏', labelKey: 'toolbar.tools.measureLine',   shortcut: 'M' },
  { id: 'measure-circle', icon: '◎',  labelKey: 'toolbar.tools.measureCircle', shortcut: '' },
  { id: 'measure-cone',   icon: '◿',  labelKey: 'toolbar.tools.measureCone',   shortcut: '' },
]

const DRAW_TOOLS: { id: ActiveTool; icon: string; labelKey: string; shortcut: string }[] = [
  { id: 'draw-freehand', icon: '✏️', labelKey: 'toolbar.tools.drawFreehand', shortcut: 'D' },
  { id: 'draw-rect',    icon: '▢',  labelKey: 'toolbar.tools.drawRect',     shortcut: '' },
  { id: 'draw-circle',  icon: '○',  labelKey: 'toolbar.tools.drawCircle',   shortcut: '' },
  { id: 'draw-text',    icon: 'T',  labelKey: 'toolbar.tools.drawText',     shortcut: '' },
]

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
  } = useUIStore()
  const { activeCampaignId } = useCampaignStore()
  const [showMonitorDialog, setShowMonitorDialog] = useState(false)
  const [cameraSent, setCameraSent] = useState(false)
  const zoomPercent = Math.round(useMapTransformStore((s) => s.scale / s.fitScale * 100))

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
    if (tool === 'atmosphere') {
      handleAtmosphere()
      return
    }
    setActiveTool(tool)
  }

  return (
    <div className="toolbar">
      <button className="tool-btn" title={t('toolbar.leftSidebar')} onClick={toggleLeftSidebar}>◧</button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {PRIMARY_TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={clsx('tool-btn', activeTool === tool.id && 'active')}
          title={`${t(tool.labelKey)} [${tool.shortcut}]`}
          onClick={() => handleToolClick(tool.id)}
        >
          {tool.icon}
        </button>
      ))}

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      <ToolGroup
        tools={FOG_TOOLS}
        activeTool={activeTool}
        groupIcon="▭"
        groupLabelKey="toolbar.tools.fogGroup"
        onSelect={handleToolClick}
      />

      <ToolGroup
        tools={MEASURE_TOOLS}
        activeTool={activeTool}
        groupIcon="📏"
        groupLabelKey="toolbar.tools.measureGroup"
        onSelect={handleToolClick}
      />

      <ToolGroup
        tools={DRAW_TOOLS}
        activeTool={activeTool}
        groupIcon="✏️"
        groupLabelKey="toolbar.tools.drawGroup"
        onSelect={handleToolClick}
      />

      <button
        className="tool-btn"
        title={t('toolbar.tools.atmosphere')}
        onClick={handleAtmosphere}
      >
        🖼
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Session mode */}
      <button
        className={clsx('tool-btn', sessionMode === 'prep' && 'active')}
        title={sessionMode === 'session' ? t('toolbar.sessionModeHint') : t('toolbar.prepModeHint')}
        onClick={() => setSessionMode(sessionMode === 'session' ? 'prep' : 'session')}
        style={sessionMode === 'prep' ? { color: 'var(--warning)' } : undefined}
      >
        {sessionMode === 'session' ? '▶' : '✎'}
      </button>

      {/* Camera follow toggle */}
      <button
        className={clsx('tool-btn', cameraFollowDM && 'active')}
        title={cameraFollowDM ? 'Kamera-Folgemodus AN (DM-Ansicht wird kontinuierlich an Spieler gesendet)' : 'Kamera-Folgemodus AUS (Einmalig senden)'}
        onClick={toggleCameraFollow}
        style={cameraFollowDM ? { color: 'var(--success)' } : undefined}
      >
        📡
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Blackout */}
      <button
        className={clsx('tool-btn', blackoutActive && 'active')}
        title={t('toolbar.blackout')}
        onClick={toggleBlackout}
        style={blackoutActive ? { color: 'var(--warning)' } : undefined}
      >
        ⬛
      </button>

      {/* Single camera send */}
      <button
        className={clsx('tool-btn', cameraSent && 'active')}
        title={t('toolbar.shareCamera')}
        onClick={handleShareCamera}
        style={cameraSent ? { color: 'var(--success)' } : undefined}
      >
        📺
      </button>

      <button className="tool-btn" title={t('toolbar.openPlayerWindow')} onClick={() => setShowMonitorDialog(true)}>🖥</button>
      <button className="tool-btn" title="Playerfenster schließen" onClick={() => window.electronAPI?.closePlayerWindow()}>✕🖥</button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Zoom controls + percentage */}
      <button className="tool-btn" title="Vergrößern (+)" onClick={() => useMapTransformStore.getState().zoomIn()}>🔍+</button>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'center', lineHeight: '32px', fontFamily: 'monospace' }}>
        {zoomPercent}%
      </div>
      <button className="tool-btn" title="Verkleinern (-)" onClick={() => useMapTransformStore.getState().zoomOut()}>🔍−</button>
      <button className="tool-btn" title="Ansicht anpassen (0)" onClick={() => useMapTransformStore.getState().fitToScreen()}>⊡</button>
      <button className={clsx('tool-btn', showMinimap && 'active')} title="Minimap" onClick={toggleMinimap}>🗺</button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Grid snap toggle */}
      <button
        className={clsx('tool-btn', gridSnap && 'active')}
        title={gridSnap ? 'Raster-Snapp AN' : 'Raster-Snapp AUS'}
        onClick={toggleGridSnap}
      >
        ⊞
      </button>

      <div style={{ flex: 1 }} />

      {/* Session mode indicator */}
      {sessionMode === 'prep' && (
        <div style={{
          padding: '2px 8px', borderRadius: 'var(--radius)', fontSize: 'var(--text-xs)', fontWeight: 600,
          background: 'rgba(245, 158, 0, 0.15)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 0, 0.3)',
          marginRight: 4,
        }}>
          PREP
        </div>
      )}

      {activeCampaignId && (
        <img
          src={logoSquare}
          alt="BoltBerry"
          style={{
            height: 28,
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