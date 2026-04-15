import { useState } from 'react'
import { useCampaignStore } from '../../stores/campaignStore'
import { useImageUrl } from '../../hooks/useImageUrl'
import type { MapRecord } from '@shared/ipc-types'

// ── Single map card ───────────────────────────────────────────────────────────

function MapCard({ map, onSelect }: { map: MapRecord; onSelect: () => void }) {
  const thumb = useImageUrl(map.imagePath)
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: hover ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: `1px solid ${hover ? 'var(--accent-blue)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color var(--transition), box-shadow var(--transition)',
        boxShadow: hover ? '0 4px 16px rgba(47,107,255,0.18)' : '0 2px 8px rgba(0,0,0,0.24)',
        userSelect: 'none',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: '100%',
        aspectRatio: '4/3',
        background: 'var(--bg-base)',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}>
        {thumb ? (
          <img
            src={thumb}
            alt={map.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, color: 'var(--text-muted)',
          }}>🗺️</div>
        )}
        {/* Grid type badge */}
        {map.gridType !== 'none' && (
          <div style={{
            position: 'absolute', bottom: 4, right: 4,
            background: 'rgba(0,0,0,0.65)',
            color: 'var(--text-secondary)',
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
          }}>
            {map.gridType === 'square' ? '⬛' : '⭡'} {map.gridSize}px
          </div>
        )}
      </div>
      {/* Name */}
      <div style={{
        padding: '6px 10px 8px',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: hover ? 'var(--accent-blue-light)' : 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        transition: 'color var(--transition)',
      }}>
        {map.name}
      </div>
    </div>
  )
}

// ── Add map card ──────────────────────────────────────────────────────────────

function AddMapCard({ onAdd }: { onAdd: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onAdd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: hover ? 'var(--bg-elevated)' : 'transparent',
        border: `1px dashed ${hover ? 'var(--accent-blue)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition)',
        aspectRatio: '4/3',
        color: hover ? 'var(--accent-blue-light)' : 'var(--text-muted)',
        fontSize: 'var(--text-xs)',
      }}
    >
      <span style={{ fontSize: 24 }}>+</span>
      <span>Karte hinzufügen</span>
    </div>
  )
}

// ── Campaign map grid ─────────────────────────────────────────────────────────

export function CampaignMapGrid() {
  const { activeMaps, setActiveMap, activeCampaignId } = useCampaignStore()

  async function handleAddMap() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      if (!asset) return
      const fileName = asset.path.split(/[\\/]/).pop() || ''
      const finalMapName = fileName.replace(/\.[^/.]+$/, '') || 'Neue Karte'
      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, rotation_player, grid_offset_x, grid_offset_y, ambient_brightness) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 100)`,
        [activeCampaignId, finalMapName, asset.path, activeMaps.length]
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
      useCampaignStore.getState().addMap(newMap)
      setActiveMap(newMap.id)
    } catch (err) {
      console.error('[CampaignMapGrid] handleAddMap failed:', err)
    }
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      padding: '32px 40px',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    }}>
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Karten
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Karte anklicken um sie zu laden
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 16,
      }}>
        {activeMaps.map((map) => (
          <MapCard key={map.id} map={map} onSelect={() => setActiveMap(map.id)} />
        ))}
        <AddMapCard onAdd={handleAddMap} />
      </div>

      {activeMaps.length === 0 && (
        <div style={{
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
          marginTop: 8,
        }}>
          Noch keine Karten. Klicke auf <strong>+ Karte hinzufügen</strong> um zu starten.
        </div>
      )}
    </div>
  )
}
