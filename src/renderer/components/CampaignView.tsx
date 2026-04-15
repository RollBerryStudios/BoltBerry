import { useState, useEffect } from 'react'
import { useCampaignStore } from '../stores/campaignStore'
import { useImageUrl } from '../hooks/useImageUrl'
import { NotesPanel } from './sidebar/panels/NotesPanel'
import { CharacterSheetPanel } from './sidebar/panels/CharacterSheetPanel'
import { HandoutsPanel } from './sidebar/panels/HandoutsPanel'
import { AudioPanel } from './sidebar/panels/AudioPanel'
import { SettingsPanel } from './sidebar/panels/SettingsPanel'
import logoWide from '../assets/boltberry-logo-wide.png'
import type { MapRecord } from '@shared/ipc-types'

type Tab = 'maps' | 'notes' | 'characters' | 'handouts' | 'audio' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'maps',       label: 'Karten',       icon: '🗺️' },
  { id: 'notes',      label: 'Notizen',       icon: '📝' },
  { id: 'characters', label: 'Charaktere',    icon: '👤' },
  { id: 'handouts',   label: 'Handouts',      icon: '📄' },
  { id: 'audio',      label: 'Audio',         icon: '🎵' },
  { id: 'settings',   label: 'Einstellungen', icon: '⚙️' },
]

// ─── Map Thumbnail Card ───────────────────────────────────────────────────────

function MapCard({ map, onOpen }: { map: MapRecord; onOpen: (id: number) => void }) {
  const url = useImageUrl(map.imagePath)

  return (
    <div
      onDoubleClick={() => onOpen(map.id)}
      title={`${map.name} — Doppelklick zum Öffnen`}
      style={{
        width: 200,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color var(--transition), transform var(--transition), box-shadow var(--transition)',
        flexShrink: 0,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{
        width: '100%',
        height: 130,
        background: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {url ? (
          <img
            src={url}
            alt={map.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            draggable={false}
          />
        ) : (
          <span style={{ fontSize: 36, opacity: 0.3 }}>🗺️</span>
        )}
      </div>
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {map.name}
        </div>
      </div>
    </div>
  )
}

// ─── Add Map Card ─────────────────────────────────────────────────────────────

function AddMapCard({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div
      onClick={loading ? undefined : onClick}
      title="Neue Karte importieren"
      style={{
        width: 200,
        height: 178,
        borderRadius: 'var(--radius-lg)',
        border: '2px dashed var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: loading ? 'default' : 'pointer',
        gap: 8,
        opacity: loading ? 0.6 : 1,
        transition: 'border-color var(--transition), background var(--transition)',
        flexShrink: 0,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.borderColor = 'var(--accent)'
          e.currentTarget.style.background = 'var(--bg-overlay)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'var(--bg-surface)'
      }}
    >
      <span style={{ fontSize: 32, opacity: 0.5 }}>{loading ? '…' : '+'}</span>
      <span style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        textAlign: 'center',
        lineHeight: 1.4,
        padding: '0 16px',
      }}>
        {loading ? 'Importiere…' : 'Karte importieren'}
      </span>
    </div>
  )
}

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

  const [tab, setTab] = useState<Tab>('maps')
  const [importing, setImporting] = useState(false)

  const campaign = campaigns.find((c) => c.id === activeCampaignId)

  // Load maps when campaign changes — mirrors LeftSidebar's loadMaps
  useEffect(() => {
    if (!activeCampaignId) return
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
      }>(
        'SELECT id, campaign_id, name, image_path, grid_type, grid_size, ft_per_unit, order_index, camera_x, camera_y, camera_scale, rotation, grid_offset_x, grid_offset_y, ambient_brightness, ambient_track_path, track1_volume, track2_volume, combat_volume FROM maps WHERE campaign_id = ? ORDER BY order_index',
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
    }
  }

  async function handleAddMap() {
    if (!activeCampaignId || !window.electronAPI || importing) return
    setImporting(true)
    try {
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      if (!asset) return

      const fileName = asset.path.split(/[\\/]/).pop() || ''
      const finalMapName = fileName.replace(/\.[^/.]+$/, '') || 'Neue Karte'

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, grid_offset_x, grid_offset_y, ambient_brightness) VALUES (?, ?, ?, ?, 0, 0, 0, 100)`,
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
      console.error('[CampaignView] addMap failed:', err)
    } finally {
      setImporting(false)
    }
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
        gap: 'var(--sp-4)',
        padding: '0 var(--sp-5)',
        height: 56,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setActiveCampaign(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
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
          }}
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
        }}>
          {campaign?.name ?? ''}
        </h1>

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
              padding: '10px 16px',
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
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>

        {/* Maps tab */}
        {tab === 'maps' && (
          <div style={{
            padding: 'var(--sp-6)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--sp-4)',
            alignContent: 'flex-start',
          }}>
            {activeMaps.length === 0 && !importing && (
              <div style={{
                width: '100%',
                textAlign: 'center',
                padding: 'var(--sp-10) 0',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-sm)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 'var(--sp-3)', opacity: 0.4 }}>🗺️</div>
                Keine Karten vorhanden. Importiere eine Karte um zu beginnen.
              </div>
            )}
            {activeMaps.map((map) => (
              <MapCard
                key={map.id}
                map={map}
                onOpen={(id) => setActiveMap(id)}
              />
            ))}
            <AddMapCard onClick={handleAddMap} loading={importing} />
          </div>
        )}

        {/* Notes tab */}
        {tab === 'notes' && (
          <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--sp-6)' }}>
            <NotesPanel />
          </div>
        )}

        {/* Characters tab */}
        {tab === 'characters' && (
          <div style={{ padding: 'var(--sp-6)' }}>
            <CharacterSheetPanel />
          </div>
        )}

        {/* Handouts tab */}
        {tab === 'handouts' && (
          <div style={{ padding: 'var(--sp-6)' }}>
            <HandoutsPanel />
          </div>
        )}

        {/* Audio tab */}
        {tab === 'audio' && (
          <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--sp-6)' }}>
            <AudioPanel />
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--sp-6)' }}>
            <SettingsPanel />
          </div>
        )}
      </div>
    </div>
  )
}
