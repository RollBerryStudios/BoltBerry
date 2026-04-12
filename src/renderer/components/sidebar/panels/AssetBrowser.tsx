import { useState, useEffect, useMemo } from 'react'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useTokenStore } from '../../../stores/tokenStore'
import { useMapTransformStore } from '../../../stores/mapTransformStore'
import { useImageUrl } from '../../../hooks/useImageUrl'

interface AssetRow {
  id: number
  originalName: string
  storedPath: string
  type: 'map' | 'token' | 'atmosphere' | 'audio'
}

const TYPE_LABELS: Record<string, string> = {
  map: 'Karten',
  token: 'Token',
  atmosphere: 'Atmosphäre',
  audio: 'Audio',
}

export function AssetBrowser() {
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeMapId = useCampaignStore((s) => s.activeMapId)
  const activeMaps = useCampaignStore((s) => s.activeMaps)
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadAssets()
  }, [activeCampaignId])

  async function loadAssets() {
    if (!window.electronAPI) return
    // Show assets for current campaign plus assets without a campaign (legacy)
    const rows = await window.electronAPI.dbQuery<{
      id: number; original_name: string; stored_path: string; type: string
    }>(
      'SELECT id, original_name, stored_path, type FROM assets WHERE campaign_id = ? OR campaign_id IS NULL ORDER BY id DESC',
      [activeCampaignId ?? -1]
    )
    setAssets(rows.map((r) => ({
      id: r.id,
      originalName: r.original_name,
      storedPath: r.stored_path,
      type: r.type as AssetRow['type'],
    })))
  }

  async function handleDropTokenOnMap(asset: AssetRow) {
    if (!activeMapId || !window.electronAPI) return

    const { offsetX, offsetY, scale, canvasW, canvasH } = useMapTransformStore.getState()
    const activeMap = activeMaps.find((m) => m.id === activeMapId)

    // Place at viewport center
    const rawX = ((canvasW || 800) / 2 - offsetX) / scale
    const rawY = ((canvasH || 600) / 2 - offsetY) / scale

    // Snap to grid when grid is active
    const centerX = activeMap?.gridType !== 'none' && activeMap?.gridSize
      ? Math.round(rawX / activeMap.gridSize) * activeMap.gridSize
      : rawX
    const centerY = activeMap?.gridType !== 'none' && activeMap?.gridSize
      ? Math.round(rawY / activeMap.gridSize) * activeMap.gridSize
      : rawY

    try {
      const result = await window.electronAPI.dbRun(
        'INSERT INTO tokens (map_id, name, image_path, x, y, rotation, locked, z_index, marker_color, ac, notes, faction, show_name) VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, NULL, \'party\', 1)',
        [activeMapId, asset.originalName.replace(/\.[^.]+$/, ''), asset.storedPath, centerX, centerY]
      )
      useTokenStore.getState().addToken({
        id: result.lastInsertRowid,
        mapId: activeMapId,
        name: asset.originalName.replace(/\.[^.]+$/, ''),
        imagePath: asset.storedPath,
        x: centerX,
        y: centerY,
        size: 1,
        hpCurrent: 0,
        hpMax: 0,
        visibleToPlayers: true,
        rotation: 0,
        locked: false,
        zIndex: 0,
        markerColor: null,
        ac: null,
        notes: null,
        statusEffects: null,
        faction: 'party',
        showName: true,
      })
    } catch (err) {
      console.error('[AssetBrowser] token insert failed:', err)
    }
  }

  const filtered = useMemo(
    () => filter === 'all' ? assets : assets.filter((a) => a.type === filter),
    [assets, filter]
  )
  const imageTypes = ['map', 'token', 'atmosphere']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)' }}>
      <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-3)' }}>
        Asset-Browser
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 'var(--sp-1)', marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {['all', 'map', 'token', 'atmosphere', 'audio'].map((t) => (
          <button
            key={t}
            className={`btn btn-ghost ${filter === t ? 'btn-active' : ''}`}
            style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
            onClick={() => setFilter(t)}
          >
            {t === 'all' ? 'Alle' : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
            <div className="empty-state-icon" style={{ fontSize: 28 }}>🗄</div>
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Keine Assets</div>
            <div className="empty-state-desc">Importierte Dateien erscheinen hier</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-2)' }}>
            {filtered.map((asset) => (
              <div
                key={asset.id}
                title={asset.originalName}
                draggable={asset.type === 'token' || asset.type === 'map'}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/boltberry-asset-path', asset.storedPath)
                  e.dataTransfer.setData('application/boltberry-asset-type', asset.type)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                style={{
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                  background: 'var(--bg-elevated)',
                  cursor: asset.type === 'token' && activeMapId ? 'grab' : 'default',
                  position: 'relative',
                }}
                onClick={() => asset.type === 'token' && activeMapId ? handleDropTokenOnMap(asset) : undefined}
              >
                {imageTypes.includes(asset.type) ? (
                  <AssetThumbnail path={asset.storedPath} />
                ) : (
                  <div style={{
                    width: '100%', aspectRatio: '1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, color: 'var(--text-muted)',
                  }}>
                    🎵
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.65)', padding: '2px 4px',
                  fontSize: 9, color: '#c0c0d0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {asset.originalName}
                </div>
                {asset.type === 'token' && activeMapId && (
                  <div style={{
                    position: 'absolute', top: 2, right: 2,
                    background: 'var(--accent)', borderRadius: 3,
                    fontSize: 8, color: '#fff', padding: '1px 3px',
                  }}>
                    +
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn btn-ghost"
        style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--sp-2)', fontSize: 'var(--text-xs)' }}
        onClick={loadAssets}
      >
        ↺ Aktualisieren
      </button>
    </div>
  )
}

function AssetThumbnail({ path }: { path: string }) {
  const url = useImageUrl(path)
  if (!url) return <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg-overlay)' }} />
  return <img src={url} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} draggable={false} />
}
