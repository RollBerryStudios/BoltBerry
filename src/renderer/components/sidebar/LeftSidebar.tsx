import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useUIStore } from '../../stores/uiStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { AssetBrowser } from './panels/AssetBrowser'
import { SettingsPanel } from './panels/SettingsPanel'
import { useImageUrl } from '../../hooks/useImageUrl'
import type { MapRecord } from '@shared/ipc-types'

export function LeftSidebar() {
  const { t } = useTranslation()
  const {
    activeCampaignId,
    activeMaps,
    activeMapId,
    setActiveMaps,
    setActiveMap,
    addMap,
  } = useCampaignStore()

  const [tab, setTab] = useState<'maps' | 'assets' | 'settings'>('maps')
  const [addingMap, setAddingMap] = useState(false)
  const [mapName, setMapName] = useState('')

  // Current map settings
  const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null
  const [gridType, setGridType] = useState<MapRecord['gridType']>('square')
  const [gridSize, setGridSize] = useState(50)
  const [ftPerUnit, setFtPerUnit] = useState(5)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)

  useEffect(() => {
    if (!activeCampaignId) return
    loadMaps(activeCampaignId)
  }, [activeCampaignId])

  useEffect(() => {
    if (!activeMap) return
    setGridType(activeMap.gridType)
    setGridSize(activeMap.gridSize)
    setFtPerUnit(activeMap.ftPerUnit)
    setRotation((activeMap.rotation ?? 0) as 0 | 90 | 180 | 270)
  }, [activeMapId])

  async function loadMaps(campaignId: number) {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number; campaign_id: number; name: string; image_path: string
        grid_type: string; grid_size: number; ft_per_unit: number; order_index: number
        camera_x: number | null; camera_y: number | null; camera_scale: number | null
        rotation: number | null
      }>('SELECT id, campaign_id, name, image_path, grid_type, grid_size, ft_per_unit, order_index, camera_x, camera_y, camera_scale, rotation FROM maps WHERE campaign_id = ? ORDER BY order_index', [campaignId])

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
        cameraX: r.camera_x ?? null,
        cameraY: r.camera_y ?? null,
        cameraScale: r.camera_scale ?? null,
      })))
    } catch (err) {
      console.error('[LeftSidebar] loadMaps failed:', err)
    }
  }

  async function handleAddMap() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      // Get file first to extract name
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      if (!asset) return
      
      // Auto-name from file if no name was entered
      let finalMapName = mapName.trim()
      if (!finalMapName && asset.path) {
        // Extract filename from path and remove extension
        const fileName = asset.path.split(/[\\/]/).pop() || ''
        finalMapName = fileName.replace(/\.[^/.]+$/, "") || 'Neue Karte'
      }
      // If still no name, use default
      if (!finalMapName) {
        finalMapName = 'Neue Karte'
      }

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation) VALUES (?, ?, ?, ?, 0)`,
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
        cameraX: null,
        cameraY: null,
        cameraScale: null,
      }
      addMap(newMap)
      setActiveMap(newMap.id)
      setAddingMap(false)
      setMapName('')
    } catch (err) {
      console.error('[LeftSidebar] handleAddMap failed:', err)
      alert(`Karte konnte nicht hinzugefügt werden: ${err}`)
    }
  }

  async function handleAddMapFromPdf() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      const pdfData = await window.electronAPI.importPdf(activeCampaignId)
      if (!pdfData) return

      // Render PDF first page in renderer using pdfjs-dist
      let imagePath: string
      try {
        imagePath = await renderPdfToImage(pdfData.data, pdfData.originalName, activeCampaignId)
      } catch (err) {
        console.error('[LeftSidebar] PDF render failed:', err)
        return
      }

      // Auto-name from file if no name was entered
      let finalMapName = mapName.trim()
      if (!finalMapName && pdfData.originalName) {
        finalMapName = pdfData.originalName.replace(/\.[^/.]+$/, "") || 'Neue Karte'
      }

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation) VALUES (?, ?, ?, ?, 0)`,
        [activeCampaignId, finalMapName, imagePath, activeMaps.length]
      )
      const newMap: MapRecord = {
        id: result.lastInsertRowid,
        campaignId: activeCampaignId,
        name: finalMapName,
        imagePath,
        gridType: 'square',
        gridSize: 50,
        ftPerUnit: 5,
        orderIndex: activeMaps.length,
        rotation: 0,
        cameraX: null,
        cameraY: null,
        cameraScale: null,
      }
      addMap(newMap)
      setActiveMap(newMap.id)
      setAddingMap(false)
      setMapName('')
    } catch (err) {
      console.error('[LeftSidebar] handleAddMapFromPdf failed:', err)
    }
  }

  async function handleGridChange(type: MapRecord['gridType'], size: number, fpu?: number) {
    if (!activeMapId || !window.electronAPI) return
    const newFpu = fpu ?? ftPerUnit
    setGridType(type)
    setGridSize(size)
    setFtPerUnit(newFpu)
    try {
      await window.electronAPI.dbRun(
        'UPDATE maps SET grid_type = ?, grid_size = ?, ft_per_unit = ? WHERE id = ?',
        [type, size, newFpu, activeMapId]
      )
      const updatedMaps = activeMaps.map((m) =>
        m.id === activeMapId ? { ...m, gridType: type, gridSize: size, ftPerUnit: newFpu } : m
      )
      useCampaignStore.getState().setActiveMaps(updatedMaps)
      syncMapStateToPlayer(updatedMaps.find((m) => m.id === activeMapId)!)
    } catch (err) {
      console.error('[LeftSidebar] handleGridChange failed:', err)
    }
  }

  async function handleRotationChange(rot: 0 | 90 | 180 | 270) {
    if (!activeMapId || !window.electronAPI) return
    setRotation(rot)
    try {
      await window.electronAPI.dbRun(
        'UPDATE maps SET rotation = ? WHERE id = ?',
        [rot, activeMapId]
      )
      const updatedMaps = activeMaps.map((m) =>
        m.id === activeMapId ? { ...m, rotation: rot } : m
      )
      useCampaignStore.getState().setActiveMaps(updatedMaps)
      syncMapStateToPlayer(updatedMaps.find((m) => m.id === activeMapId)!)
    } catch (err) {
      console.error('[LeftSidebar] handleRotationChange failed:', err)
    }
  }

  async function handleReorderMap(mapId: number, direction: 'up' | 'down') {
    if (!window.electronAPI) return
    const idx = activeMaps.findIndex((m) => m.id === mapId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= activeMaps.length) return

    const mapA = activeMaps[idx]
    const mapB = activeMaps[swapIdx]
    try {
      await window.electronAPI.dbRun('UPDATE maps SET order_index = ? WHERE id = ?', [mapB.orderIndex, mapA.id])
      await window.electronAPI.dbRun('UPDATE maps SET order_index = ? WHERE id = ?', [mapA.orderIndex, mapB.id])
      useCampaignStore.getState().setActiveMaps(
        activeMaps.map((m) => {
          if (m.id === mapA.id) return { ...m, orderIndex: mapB.orderIndex }
          if (m.id === mapB.id) return { ...m, orderIndex: mapA.orderIndex }
          return m
        })
      )
    } catch (err) {
      console.error('[LeftSidebar] handleReorderMap failed:', err)
    }
  }

  function syncMapStateToPlayer(m: MapRecord) {
    if (!m || useUIStore.getState().sessionMode === 'prep') return
    window.electronAPI?.sendMapUpdate({
      imagePath: m.imagePath,
      gridType: m.gridType,
      gridSize: m.gridSize,
      rotation: m.rotation ?? 0,
    })
  }

  return (
    <div className="sidebar sidebar-left">
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        {([
          ['maps', '🗺️', t('sidebar.left.tabMaps')],
          ['assets', '🗄', t('sidebar.left.tabAssets')],
          ['settings', '⚙️', t('settings.title')]
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, padding: 'var(--sp-2)', background: 'none', border: 'none',
              borderBottom: tab === id ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: tab === id ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}
          >
            <span style={{ fontSize: 14 }}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {tab === 'assets' && <AssetBrowser />}
      
      {tab === 'settings' && <SettingsPanel />}

      {tab === 'maps' && <>
      {/* ── Map list ──────────────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">{t('sidebar.left.mapsTitle')}</div>

        {activeMaps.length === 0 && !addingMap && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2) 0' }}>
            {t('sidebar.left.mapsEmpty')}
          </div>
        )}

        {activeMaps.map((map, i) => (
          <MapListItem
            key={map.id}
            map={map}
            index={i}
            total={activeMaps.length}
            isActive={activeMapId === map.id}
            onSelect={() => setActiveMap(map.id)}
            onReorder={handleReorderMap}
          />
        ))}

        {addingMap ? (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <input
              className="input"
              autoFocus
              placeholder={t('sidebar.left.mapNamePlaceholder')}
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              style={{ marginBottom: 'var(--sp-2)' }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setAddingMap(false); setMapName('') }
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)' }}
                onClick={handleAddMap}
              >
                {t('sidebar.left.chooseImage')}
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)' }}
                onClick={handleAddMapFromPdf}
              >
                {t('sidebar.left.choosePdf')}
              </button>
              <button className="btn btn-ghost" onClick={() => { setAddingMap(false); setMapName('') }}>✕</button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--sp-2)', fontSize: 'var(--text-xs)' }}
            onClick={() => setAddingMap(true)}
          >
            {t('sidebar.left.addMap')}
          </button>
        )}
      </div>

      {/* ── Grid settings (only when a map is active) ─────────────────────── */}
      {activeMap && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">{t('sidebar.left.gridTitle', { name: activeMap.name })}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {/* Grid type */}
            <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
              {(['none', 'square', 'hex'] as const).map((type) => (
                <button
                  key={type}
                  className={`btn btn-ghost ${gridType === type ? 'btn-active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px' }}
                  onClick={() => handleGridChange(type, gridSize)}
                >
                  {type === 'none' ? t('sidebar.left.gridOff') : type === 'square' ? '⬛' : '⬡'}
                </button>
              ))}
            </div>

            {/* Grid size */}
            {gridType !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  Feld-px
                </label>
                <input
                  className="input"
                  type="number"
                  min={10} max={500}
                  value={gridSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    if (v >= 10 && v <= 500) handleGridChange(gridType, v)
                  }}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>px</span>
              </div>
            )}

            {/* ft per unit */}
            {gridType !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  Einheit
                </label>
                <input
                  className="input"
                  type="number"
                  min={1} max={100} step={1}
                  value={ftPerUnit}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (v >= 1 && v <= 100) handleGridChange(gridType, gridSize, v)
                  }}
                  style={{ width: 60 }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>ft / Feld</span>
              </div>
            )}

            {/* Rotation */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-1)' }}>
                Drehung
              </label>
              <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                {([0, 90, 180, 270] as const).map((rot) => (
                  <button
                    key={rot}
                    className={`btn btn-ghost ${rotation === rot ? 'btn-active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '3px' }}
                    onClick={() => handleRotationChange(rot)}
                  >
                    {rot === 0 ? '↑' : rot === 90 ? '→' : rot === 180 ? '↓' : '←'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}

// ── PDF → PNG conversion (renderer-side, requires pdfjs-dist) ─────────────────

async function renderPdfToImage(
  base64Data: string,
  originalName: string,
  campaignId: number,
): Promise<string> {
  // Dynamic import so pdfjs-dist only loads when needed
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const raw = atob(base64Data)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 }) // 2× for quality

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise

  const dataUrl = canvas.toDataURL('image/png')
  const saveName = originalName.replace(/\.pdf$/i, '.png')

  const result = await window.electronAPI!.saveAssetImage({
    dataUrl,
    originalName: saveName,
    type: 'map',
    campaignId,
  })
  return result.path
}

function MapListItem({ map, index, total, isActive, onSelect, onReorder }: {
  map: MapRecord
  index: number
  total: number
  isActive: boolean
  onSelect: () => void
  onReorder: (id: number, direction: 'up' | 'down') => void
}) {
  const thumbnailUrl = useImageUrl(map.imagePath)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        width: '100%', padding: 'var(--sp-2)',
        background: isActive ? 'var(--accent-blue-dim)' : 'none',
        border: isActive ? '1px solid var(--accent-blue)' : '1px solid transparent',
        borderRadius: 'var(--radius)',
        color: isActive ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
        cursor: 'pointer', textAlign: 'left', fontSize: 'var(--text-sm)',
        marginBottom: 'var(--sp-1)', transition: 'background var(--transition)',
      }}
      onClick={onSelect}
      onContextMenu={async (e) => {
        e.preventDefault()
        if (!window.electronAPI) return

        const selectedAction = await window.electronAPI.showContextMenu([
          { label: 'Umbenennen', action: 'rename' },
          { label: 'Löschen', action: 'delete', danger: true },
        ])

        if (selectedAction === 'rename') {
          const newName = prompt('Neuer Name:', map.name)
          if (newName && newName.trim()) {
            await window.electronAPI.dbRun(
              'UPDATE maps SET name = ? WHERE id = ?',
              [newName.trim(), map.id]
            )
            useCampaignStore.getState().refreshCampaigns()
          }
        } else if (selectedAction === 'delete') {
          const confirmed = await window.electronAPI.deleteMapConfirm(map.name)
          if (confirmed) {
            await window.electronAPI.dbRun(
              'DELETE FROM maps WHERE id = ?',
              [map.id]
            )
            await window.electronAPI.dbRun(
              'DELETE FROM tokens WHERE map_id = ?',
              [map.id]
            )
            await window.electronAPI.dbRun(
              'DELETE FROM initiative WHERE map_id = ?',
              [map.id]
            )
            await window.electronAPI.dbRun(
              'DELETE FROM fog_state WHERE map_id = ?',
              [map.id]
            )
            useCampaignStore.getState().refreshCampaigns()
            if (map.id === useCampaignStore.getState().activeMapId) {
              useTokenStore.getState().setTokens([])
              useInitiativeStore.getState().setEntries([])
            }
          }
        }
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', minWidth: 16 }}>{index + 1}</span>
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          style={{ width: 32, height: 24, objectFit: 'cover', borderRadius: 3, flexShrink: 0, border: '1px solid var(--border)' }}
        />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {map.name}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
        <button
          className="btn btn-ghost"
          style={{ padding: '0 4px', fontSize: 10, lineHeight: '14px', minHeight: 14 }}
          disabled={index === 0}
          onClick={(e) => { e.stopPropagation(); onReorder(map.id, 'up') }}
          title="Move up"
        >▲</button>
        <button
          className="btn btn-ghost"
          style={{ padding: '0 4px', fontSize: 10, lineHeight: '14px', minHeight: 14 }}
          disabled={index === total - 1}
          onClick={(e) => { e.stopPropagation(); onReorder(map.id, 'down') }}
          title="Move down"
        >▼</button>
      </div>
    </div>
  )
}
