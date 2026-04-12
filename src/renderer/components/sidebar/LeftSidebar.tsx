import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useUIStore } from '../../stores/uiStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { AssetBrowser } from './panels/AssetBrowser'
import { SettingsPanel } from './panels/SettingsPanel'
import { useImageUrl } from '../../hooks/useImageUrl'
import { detectGrid } from '../../utils/gridDetect'
import { detectMargins } from '../../utils/autoCrop'
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

  // Current map settings
  const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null
  const [gridType, setGridType] = useState<MapRecord['gridType']>('square')
  const [gridSize, setGridSize] = useState(50)
  const [ftPerUnit, setFtPerUnit] = useState(5)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [gridOffsetX, setGridOffsetX] = useState(0)
  const [gridOffsetY, setGridOffsetY] = useState(0)
  const [gridDetecting, setGridDetecting] = useState(false)
  const [gridDetectMsg, setGridDetectMsg] = useState<{ text: string; ok: boolean } | null>(null)

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
    setGridOffsetX(activeMap.gridOffsetX ?? 0)
    setGridOffsetY(activeMap.gridOffsetY ?? 0)
    setGridDetecting(false)
    setGridDetectMsg(null)
  }, [activeMapId])

  async function loadMaps(campaignId: number) {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number; campaign_id: number; name: string; image_path: string
        grid_type: string; grid_size: number; ft_per_unit: number; order_index: number
        camera_x: number | null; camera_y: number | null; camera_scale: number | null
        rotation: number | null; grid_offset_x: number; grid_offset_y: number; ambient_brightness: number
      }>('SELECT id, campaign_id, name, image_path, grid_type, grid_size, ft_per_unit, order_index, camera_x, camera_y, camera_scale, rotation, grid_offset_x, grid_offset_y, ambient_brightness FROM maps WHERE campaign_id = ? ORDER BY order_index', [campaignId])

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
      })))
    } catch (err) {
      console.error('[LeftSidebar] loadMaps failed:', err)
    }
  }

  async function handleAddMap() {
    if (!activeCampaignId || !window.electronAPI) return
    try {
      const asset = await window.electronAPI.importFile('map', activeCampaignId)
      if (!asset) return

      // Auto-name from filename, strip extension
      const fileName = asset.path.split(/[\\/]/).pop() || ''
      const finalMapName = fileName.replace(/\.[^/.]+$/, '') || 'Neue Karte'

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, grid_offset_x, grid_offset_y, ambient_brightness) VALUES (?, ?, ?, ?, 0, 0, 0, 100)`,
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
        gridOffsetX: 0,
        gridOffsetY: 0,
        ambientBrightness: 100,
        cameraX: null,
        cameraY: null,
        cameraScale: null,
      }
      addMap(newMap)
      setActiveMap(newMap.id)

      // Auto-detect grid size from image
      detectGrid(asset.path).then((detected) => {
        if (detected.confidence > 0.3 && detected.gridSize > 10) {
          handleGridChange(detected.gridType, detected.gridSize, undefined, 0, 0)
        }
      }).catch(() => { /* ignore detection errors */ })
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

      let imagePath: string
      try {
        imagePath = await renderPdfToImage(pdfData.data, pdfData.originalName, activeCampaignId)
      } catch (err) {
        console.error('[LeftSidebar] PDF render failed:', err)
        return
      }

      // Auto-name from filename
      const finalMapName = pdfData.originalName.replace(/\.[^/.]+$/, '') || 'Neue Karte'

      const result = await window.electronAPI.dbRun(
        `INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, grid_offset_x, grid_offset_y, ambient_brightness) VALUES (?, ?, ?, ?, 0, 0, 0, 100)`,
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
        gridOffsetX: 0,
        gridOffsetY: 0,
        ambientBrightness: 100,
        cameraX: null,
        cameraY: null,
        cameraScale: null,
      }
      addMap(newMap)
      setActiveMap(newMap.id)

      detectGrid(imagePath).then((detected) => {
        if (detected.confidence > 0.3 && detected.gridSize > 10) {
          handleGridChange(detected.gridType, detected.gridSize, undefined, 0, 0)
        }
      }).catch(() => { /* ignore detection errors */ })
    } catch (err) {
      console.error('[LeftSidebar] handleAddMapFromPdf failed:', err)
    }
  }

  async function handleGridChange(type: MapRecord['gridType'], size: number, fpu?: number, offsetX?: number, offsetY?: number) {
    if (!activeMapId || !window.electronAPI) return
    const newFpu = fpu ?? ftPerUnit
    const newOffsetX = offsetX ?? gridOffsetX
    const newOffsetY = offsetY ?? gridOffsetY
    setGridType(type)
    setGridSize(size)
    setFtPerUnit(newFpu)
    setGridOffsetX(newOffsetX)
    setGridOffsetY(newOffsetY)
    try {
      await window.electronAPI.dbRun(
        'UPDATE maps SET grid_type = ?, grid_size = ?, ft_per_unit = ?, grid_offset_x = ?, grid_offset_y = ? WHERE id = ?',
        [type, size, newFpu, newOffsetX, newOffsetY, activeMapId]
      )
      const updatedMaps = activeMaps.map((m) =>
        m.id === activeMapId ? { ...m, gridType: type, gridSize: size, ftPerUnit: newFpu, gridOffsetX: newOffsetX, gridOffsetY: newOffsetY } : m
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
      {/* ── Tab bar ────────────────────────────────────────────────────────────────── */}
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
      {/* ── Map list ─────────────────────────────────────────────────────────────── */}
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

        <div style={{ display: 'flex', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)' }}>
          <button
            className="btn btn-ghost"
            style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)' }}
            onClick={handleAddMap}
            title="Bild-Datei als Karte importieren (Name wird aus Dateiname übernommen)"
          >
            🖼 {t('sidebar.left.addMap')}
          </button>
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px 8px' }}
            onClick={handleAddMapFromPdf}
            title="PDF als Karte importieren"
          >
            📄 PDF
          </button>
        </div>
      </div>

      {/* ── Grid settings (only when a map is active) ────────────────────────────── */}
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
                  {type === 'none' ? t('sidebar.left.gridOff') : type === 'square' ? '⬛' : '⭡'}
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
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', marginLeft: 'var(--sp-1)' }}
                  disabled={gridDetecting}
                  onClick={async () => {
                    if (!activeMap?.imagePath) return
                    setGridDetecting(true)
                    setGridDetectMsg(null)
                    try {
                      const detected = await detectGrid(activeMap.imagePath)
                      if (detected.confidence > 0.2 && detected.gridSize > 10) {
                        handleGridChange(detected.gridType, detected.gridSize, undefined, 0, 0)
                        setGridDetectMsg({ text: `✓ ${detected.gridType}, ${detected.gridSize}px`, ok: true })
                      } else {
                        setGridDetectMsg({ text: '✕ Kein Raster erkannt', ok: false })
                      }
                    } catch (err) {
                      console.error('[LeftSidebar] grid detect failed:', err)
                      setGridDetectMsg({ text: '✕ Fehler', ok: false })
                    } finally {
                      setGridDetecting(false)
                    }
                  }}
                  title="Raster automatisch erkennen"
                >
                  {gridDetecting ? '⏳' : '🔍'} Erkennen
                </button>
                {gridDetectMsg && (
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    color: gridDetectMsg.ok ? 'var(--success)' : 'var(--warning)',
                    whiteSpace: 'nowrap',
                  }}>
                    {gridDetectMsg.text}
                  </span>
                )}
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

            {/* Offset X */}
            {gridType !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  Offset X
                </label>
                <input
                  className="input"
                  type="number"
                  min={0} max={gridSize * 2} step={1}
                  value={gridOffsetX}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (v >= 0 && v <= gridSize * 2) handleGridChange(gridType, gridSize, undefined, v, undefined)
                  }}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>px</span>
              </div>
            )}

            {/* Offset Y */}
            {gridType !== 'none' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  Offset Y
                </label>
                <input
                  className="input"
                  type="number"
                  min={0} max={gridSize * 2} step={1}
                  value={gridOffsetY}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (v >= 0 && v <= gridSize * 2) handleGridChange(gridType, gridSize, undefined, undefined, v)
                  }}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>px</span>
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

// ── PDF → PNG conversion (renderer-side, requires pdfjs-dist) ─────────────────────

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
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(map.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) {
      setRenameValue(map.name)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [renaming, map.name])

  async function commitRename() {
    const trimmed = renameValue.trim()
    setRenaming(false)
    if (!trimmed || trimmed === map.name || !window.electronAPI) return
    await window.electronAPI.dbRun('UPDATE maps SET name = ? WHERE id = ?', [trimmed, map.id])
    useCampaignStore.getState().refreshCampaigns()
  }

  async function handleDelete() {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.deleteMapConfirm(map.name)
    if (!confirmed) return
    await window.electronAPI.dbRunBatch([
      { sql: 'DELETE FROM tokens WHERE map_id = ?', params: [map.id] },
      { sql: 'DELETE FROM initiative WHERE map_id = ?', params: [map.id] },
      { sql: 'DELETE FROM fog_state WHERE map_id = ?', params: [map.id] },
      { sql: 'DELETE FROM drawings WHERE map_id = ?', params: [map.id] },
      { sql: 'DELETE FROM walls WHERE map_id = ?', params: [map.id] },
      { sql: 'DELETE FROM rooms WHERE map_id = ?', params: [map.id] },
      { sql: 'DELETE FROM maps WHERE id = ?', params: [map.id] },
    ])
    useCampaignStore.getState().refreshCampaigns()
    if (map.id === useCampaignStore.getState().activeMapId) {
      useTokenStore.getState().setTokens([])
      useInitiativeStore.getState().setEntries([])
      useUIStore.getState().setPlayerConnected(false)
      window.electronAPI?.sendFullSync({
        mode: 'map',
        map: null,
        tokens: [],
        fogBitmap: null,
        exploredBitmap: null,
        atmosphereImagePath: null,
        blackout: false,
        drawings: [],
      })
    }
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
        width: '100%', padding: 'var(--sp-2)',
        background: isActive ? 'var(--accent-blue-dim)' : 'none',
        border: isActive ? '1px solid var(--accent-blue)' : '1px solid transparent',
        borderRadius: 'var(--radius)',
        color: isActive ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
        cursor: renaming ? 'default' : 'pointer',
        textAlign: 'left', fontSize: 'var(--text-sm)',
        marginBottom: 'var(--sp-1)', transition: 'background var(--transition)',
      }}
      onClick={renaming ? undefined : onSelect}
      onContextMenu={async (e) => {
        e.preventDefault()
        if (!window.electronAPI || renaming) return
        const selectedAction = await window.electronAPI.showContextMenu([
          { label: 'Umbenennen', action: 'rename' },
          { label: 'Löschen', action: 'delete', danger: true },
        ])
        if (selectedAction === 'rename') setRenaming(true)
        else if (selectedAction === 'delete') handleDelete()
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

      {renaming ? (
        <input
          ref={inputRef}
          className="input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            if (e.key === 'Escape') setRenaming(false)
            e.stopPropagation()
          }}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          style={{ flex: 1, fontSize: 'var(--text-xs)', padding: '2px 4px', height: 24 }}
        />
      ) : (
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true) }}
        >
          {map.name}
        </span>
      )}

      {!renaming && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: '0 4px', fontSize: 10, lineHeight: '14px', minHeight: 14 }}
            disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); onReorder(map.id, 'up') }}
            title="Nach oben"
          >▲</button>
          <button
            className="btn btn-ghost"
            style={{ padding: '0 4px', fontSize: 10, lineHeight: '14px', minHeight: 14 }}
            disabled={index === total - 1}
            onClick={(e) => { e.stopPropagation(); onReorder(map.id, 'down') }}
            title="Nach unten"
          >▼</button>
        </div>
      )}
    </div>
  )
}
