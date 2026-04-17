import { useState, useEffect } from 'react'
import { useCampaignStore } from '../stores/campaignStore'
import { useUIStore } from '../stores/uiStore'
import { NotesPanel } from './sidebar/panels/NotesPanel'
import { CharacterSheetPanel } from './sidebar/panels/CharacterSheetPanel'
import { HandoutsPanel } from './sidebar/panels/HandoutsPanel'
import { AudioPanel } from './sidebar/panels/AudioPanel'
import logoWide from '../assets/boltberry-logo-wide.png'
import type { MapRecord } from '@shared/ipc-types'

type Tab = 'notes' | 'characters' | 'handouts' | 'audio'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'notes',      label: 'Notizen',    icon: '📝' },
  { id: 'characters', label: 'Charaktere', icon: '👤' },
  { id: 'handouts',   label: 'Handouts',   icon: '📄' },
  { id: 'audio',      label: 'Audio',      icon: '🎵' },
]

// ─── CampaignView ─────────────────────────────────────────────────────────────

export function CampaignView() {
  const {
    activeCampaignId,
    campaigns,
    activeMaps,
    setActiveMaps,
    setActiveMap,
    addMap,
    setActiveCampaign,
  } = useCampaignStore()

  const { playerConnected } = useUIStore()

  const [tab, setTab] = useState<Tab>('notes')
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [importing, setImporting] = useState(false)

  const campaign = campaigns.find((c) => c.id === activeCampaignId)

  // Populate activeMaps so the "Spielansicht" button knows which map to open.
  useEffect(() => {
    if (!activeCampaignId) return
    setMapsLoaded(false)
    loadMaps(activeCampaignId)
  }, [activeCampaignId])

  async function loadMaps(campaignId: number) {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number; campaign_id: number; name: string; image_path: string
        grid_type: string; grid_size: number; ft_per_unit: number; order_index: number
        camera_x: number | null; camera_y: number | null; camera_scale: number | null
        rotation: number | null; grid_offset_x: number; grid_offset_y: number
        ambient_brightness: number; ambient_track_path: string | null
        track1_volume: number; track2_volume: number; combat_volume: number
        rotation_player: number
      }>(
        'SELECT id, campaign_id, name, image_path, grid_type, grid_size, ft_per_unit, order_index, camera_x, camera_y, camera_scale, rotation, rotation_player, grid_offset_x, grid_offset_y, ambient_brightness, ambient_track_path, track1_volume, track2_volume, combat_volume FROM maps WHERE campaign_id = ? ORDER BY order_index',
        [campaignId],
      )
      setActiveMaps(rows.map((r) => ({
        id: r.id,
        campaignId: r.campaign_id,
        name: r.name,
        imagePath: r.image_path,
        gridType: r.grid_type as MapRecord['gridType'],
        gridSize: r.grid_size,
        ftPerUnit: r.ft_per_unit ?? 5,
        orderIndex: r.order_index,
        rotation: r.rotation ?? 0,
        rotationPlayer: (r as any).rotation_player ?? 0,
        gridOffsetX: r.grid_offset_x ?? 0,
        gridOffsetY: r.grid_offset_y ?? 0,
        ambientBrightness: r.ambient_brightness ?? 100,
        cameraX: r.camera_x ?? null,
        cameraY: r.camera_y ?? null,
        cameraScale: r.camera_scale ?? null,
        ambientTrackPath: r.ambient_track_path ?? null,
        track1Volume: r.track1_volume ?? 1,
        track2Volume: r.track2_volume ?? 1,
        combatVolume: r.combat_volume ?? 1,
      })))
    } catch (err) {
      console.error('[CampaignView] loadMaps failed:', err)
    } finally {
      setMapsLoaded(true)
    }
  }

  // Import a first map and immediately enter the game view
  async function handleImportFirstMap() {
    if (!activeCampaignId || !window.electronAPI || importing) return
    setImporting(true)
    try {
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      if (!asset) return

      const fileName = asset.path.split(/[\\/]/).pop() || ''
      const finalMapName = fileName.replace(/\.[^/.]+$/, '') || 'Neue Karte'

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, rotation_player, grid_offset_x, grid_offset_y, ambient_brightness) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 100)`,
        [activeCampaignId, finalMapName, asset.path, activeMaps.length],
      )
      const newMap: MapRecord = {
        id: result.lastInsertRowid,
        campaignId: activeCampaignId,
        name: finalMapName,
        imagePath: asset.path,
        gridType: 'square',
        gridSize: 50,
        ftPerUnit: 5,
        orderIndex: activeMaps.length,
        rotation: 0,
        rotationPlayer: 0,
        gridOffsetX: 0,
        gridOffsetY: 0,
        ambientBrightness: 100,
        cameraX: null,
        cameraY: null,
        cameraScale: null,
        ambientTrackPath: null,
        track1Volume: 1,
        track2Volume: 1,
        combatVolume: 1,
      }
      addMap(newMap)
      setActiveMap(newMap.id)
    } catch (err) {
      console.error('[CampaignView] importFirstMap failed:', err)
    } finally {
      setImporting(false)
    }
  }

  // ── Game view entry button ─────────────────────────────────────────────────
  const loading = !mapsLoaded || importing
  const hasMaps = mapsLoaded && activeMaps.length > 0

  function renderGameButton() {
    if (loading) {
      return (
        <button
          disabled
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 18px',
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            cursor: 'default',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11 }}>…</span>
          Laden
        </button>
      )
    }

    if (hasMaps) {
      return (
        <button
          onClick={() => setActiveMap(activeMaps[0].id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 20px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius)',
            color: 'var(--text-inverse)',
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'opacity var(--transition)',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          title={`Spielansicht öffnen — ${activeMaps[0].name}`}
        >
          <span>▶</span>
          Spielansicht
        </button>
      )
    }

    return (
      <button
        onClick={handleImportFirstMap}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 18px',
          background: 'none',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius)',
          color: 'var(--accent-light)',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background var(--transition)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,168,0,0.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        title="Erste Karte importieren um die Spielansicht zu öffnen"
      >
        <span style={{ fontSize: 13 }}>+</span>
        Karte importieren
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: '0 var(--sp-5)',
        height: 56,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <button
          onClick={() => setActiveCampaign(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            transition: 'border-color var(--transition), color var(--transition)',
            flexShrink: 0,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent-light)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <span style={{ fontSize: 11 }}>◁</span>
          Kampagnen
        </button>

        <h1 style={{
          flex: 1,
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          margin: 0,
          letterSpacing: '-0.01em',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}>
          {campaign?.name ?? ''}
        </h1>

        {/* Player window controls — shown when window is open */}
        {playerConnected && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
            padding: '4px 10px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 'var(--radius)',
            flexShrink: 0,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}>
            <span style={{ fontSize: 8, color: 'var(--success)' }}>●</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 600 }}>
              Spielerfenster
            </span>
            <button
              onClick={() => window.electronAPI?.closePlayerWindow()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 12, padding: '0 0 0 4px',
                lineHeight: 1,
              }}
              title="Spielerfenster schließen"
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {renderGameButton()}
        </div>

        <img
          src={logoWide}
          alt="BoltBerry"
          style={{
            height: 26,
            width: 'auto',
            filter: 'drop-shadow(0 0 8px rgba(245, 168, 0, 0.3))',
            flexShrink: 0,
          }}
        />
      </div>

      {/* ── Tab Bar ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
        padding: '0 var(--sp-5)',
        overflowX: 'auto',
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 18px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--accent-light)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: tab === t.id ? 600 : 400,
              transition: 'color var(--transition), border-color var(--transition)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (tab !== t.id) e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={(e) => {
              if (tab !== t.id) e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {/* overflow: hidden so panels can control their own scrolling */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>

        {tab === 'notes' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', justifyContent: 'center',
            padding: 'var(--sp-6)',
            overflow: 'auto',
          }}>
            <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column' }}>
              <NotesPanel />
            </div>
          </div>
        )}

        {tab === 'characters' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <CharacterSheetPanel />
          </div>
        )}

        {tab === 'handouts' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <HandoutsPanel />
          </div>
        )}

        {tab === 'audio' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <AudioPanel layout="wide" />
          </div>
        )}

      </div>
    </div>
  )
}
