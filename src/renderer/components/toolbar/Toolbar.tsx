import { useEffect, useRef, useState } from 'react'
import { useUIStore, type ActiveTool } from '../../stores/uiStore'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { MonitorDialog } from '../MonitorDialog'
import clsx from 'clsx'
import logoSquare from '../../assets/boltberry-logo.png'

// ─── Tool definitions ──────────────────────────────────────────────────────────

const PRIMARY_TOOLS: { id: ActiveTool; icon: string; label: string; shortcut: string }[] = [
  { id: 'select',  icon: '↖',  label: 'Auswählen / Verschieben', shortcut: 'V' },
  { id: 'pointer', icon: '👆', label: 'Zeiger / Ping',            shortcut: 'W' },
  { id: 'token',   icon: '⬤',  label: 'Token platzieren',         shortcut: 'T' },
]

const FOG_TOOLS: { id: ActiveTool; icon: string; label: string; shortcut: string }[] = [
  { id: 'fog-rect',    icon: '▭', label: 'Fog aufdecken (Rechteck)', shortcut: 'F' },
  { id: 'fog-polygon', icon: '⬡', label: 'Fog aufdecken (Polygon)',  shortcut: 'P' },
  { id: 'fog-cover',   icon: '▮', label: 'Fog zudecken',             shortcut: 'C' },
]

const MEASURE_TOOLS: { id: ActiveTool; icon: string; label: string; shortcut: string }[] = [
  { id: 'measure-line',   icon: '📏', label: 'Distanz messen',       shortcut: 'M' },
  { id: 'measure-circle', icon: '◎',  label: 'Radius / AoE (Kreis)', shortcut: '' },
  { id: 'measure-cone',   icon: '◿',  label: 'Kegel (60°)',          shortcut: '' },
]

// ─── Dropdown group component ──────────────────────────────────────────────────

interface ToolGroupProps {
  tools: { id: ActiveTool; icon: string; label: string; shortcut: string }[]
  activeTool: ActiveTool
  groupIcon: string
  groupLabel: string
  onSelect: (id: ActiveTool) => void
}

function ToolGroup({ tools, activeTool, groupIcon, groupLabel, onSelect }: ToolGroupProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const activeInGroup = tools.find((t) => t.id === activeTool)
  const displayIcon = activeInGroup?.icon ?? groupIcon
  const isGroupActive = !!activeInGroup

  // Close dropdown on outside click
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
        title={groupLabel}
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
          minWidth: 180,
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
              <span style={{ flex: 1 }}>{tool.label}</span>
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

export function Toolbar() {
  const { activeTool, setActiveTool, toggleBlackout, blackoutActive, toggleTheme, theme, toggleLeftSidebar, toggleRightSidebar, sessionMode, setSessionMode } = useUIStore()
  const { activeCampaignId } = useCampaignStore()
  const [showMonitorDialog, setShowMonitorDialog] = useState(false)
  const [cameraSent, setCameraSent] = useState(false)

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
      {/* Left: sidebar toggle */}
      <button className="tool-btn" title="Linke Sidebar" onClick={toggleLeftSidebar}>◧</button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Primary tools */}
      {PRIMARY_TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={clsx('tool-btn', activeTool === tool.id && 'active')}
          title={`${tool.label} [${tool.shortcut}]`}
          onClick={() => handleToolClick(tool.id)}
        >
          {tool.icon}
        </button>
      ))}

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Fog tools group */}
      <ToolGroup
        tools={FOG_TOOLS}
        activeTool={activeTool}
        groupIcon="▭"
        groupLabel="Nebel-Werkzeuge"
        onSelect={handleToolClick}
      />

      {/* Measure tools group */}
      <ToolGroup
        tools={MEASURE_TOOLS}
        activeTool={activeTool}
        groupIcon="📏"
        groupLabel="Mess-Werkzeuge"
        onSelect={handleToolClick}
      />

      {/* Atmosphere */}
      <button
        className="tool-btn"
        title="Atmosphäre-Bild [A]"
        onClick={handleAtmosphere}
      >
        🖼
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Session / Prep mode toggle */}
      <button
        className={clsx('tool-btn', sessionMode === 'prep' && 'active')}
        title={sessionMode === 'session'
          ? 'Sitzungsmodus: Spieler sieht Änderungen live. Klicken für Vorbereitungsmodus.'
          : 'Vorbereitungsmodus: Spieler-Sync gesperrt. Klicken für Sitzungsmodus.'}
        onClick={() => setSessionMode(sessionMode === 'session' ? 'prep' : 'session')}
        style={sessionMode === 'prep' ? { color: 'var(--warning)' } : undefined}
      >
        {sessionMode === 'session' ? '▶' : '✎'}
      </button>

      <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />

      {/* Blackout */}
      <button
        className={clsx('tool-btn', blackoutActive && 'active')}
        title="Schwarzbild [Space]"
        onClick={toggleBlackout}
        style={blackoutActive ? { color: 'var(--warning)' } : undefined}
      >
        ⬛
      </button>

      {/* Camera share */}
      <button
        className={clsx('tool-btn', cameraSent && 'active')}
        title="Ansicht an Spieler senden"
        onClick={handleShareCamera}
        style={cameraSent ? { color: 'var(--success)' } : undefined}
      >
        📺
      </button>

      {/* Player window */}
      <button className="tool-btn" title="Spieler-Fenster öffnen" onClick={() => setShowMonitorDialog(true)}>🖥</button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right side */}
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
        title="Tastenkürzel [?]"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
      >
        ?
      </button>

      <button
        className="tool-btn"
        title={`Theme: ${theme === 'dark' ? 'Hell' : 'Dunkel'}`}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>

      <button className="tool-btn" title="Rechte Sidebar" onClick={toggleRightSidebar}>◨</button>

      {showMonitorDialog && (
        <MonitorDialog onClose={() => setShowMonitorDialog(false)} />
      )}
    </div>
  )
}
