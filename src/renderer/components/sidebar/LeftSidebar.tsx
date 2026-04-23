import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCampaignStore } from '../../stores/campaignStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useInitiativeStore } from '../../stores/initiativeStore'
import { AssetBrowser } from './panels/AssetBrowser'
import { SettingsPanel } from './panels/SettingsPanel'
import { useImageUrl } from '../../hooks/useImageUrl'
import { detectGrid } from '../../utils/gridDetect'
import { detectMargins } from '../../utils/autoCrop'
import { showToast } from '../shared/Toast'
import { formatError } from '../../utils/formatError'
import { NumberStepper } from '../shared/NumberStepper'
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
  const [newMapId, setNewMapId] = useState<number | null>(null)

  // Current map settings
  const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null
  const [gridType, setGridType] = useState<MapRecord['gridType']>('square')
  const [gridSize, setGridSize] = useState(50)
  const [ftPerUnit, setFtPerUnit] = useState(5)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [gridOffsetX, setGridOffsetX] = useState(0)
  const [gridOffsetY, setGridOffsetY] = useState(0)
  const [rotationPlayer, setRotationPlayer] = useState<0 | 90 | 180 | 270>(0)
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
    setRotationPlayer((activeMap.rotationPlayer ?? 0) as 0 | 90 | 180 | 270)
    setGridOffsetX(activeMap.gridOffsetX ?? 0)
    setGridOffsetY(activeMap.gridOffsetY ?? 0)
    setGridDetecting(false)
    setGridDetectMsg(null)
  }, [activeMapId])

  async function loadMaps(campaignId: number) {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.maps.list(campaignId)
      setActiveMaps(rows)
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

      const newMap = await window.electronAPI.maps.create({
        campaignId: activeCampaignId,
        name: finalMapName,
        imagePath: asset.path,
      })
      addMap(newMap)
      setActiveMap(newMap.id)
      setNewMapId(newMap.id)

      // Auto-detect grid size from image
      detectGrid(asset.path).then((detected) => {
        if (detected.confidence > 0.3 && detected.gridSize > 10) {
          handleGridChange(detected.gridType, detected.gridSize, undefined, 0, 0)
        }
      }).catch(() => { /* ignore detection errors */ })
    } catch (err) {
      console.error('[LeftSidebar] handleAddMap failed:', err)
      showToast(`Karte konnte nicht hinzugefügt werden: ${formatError(err)}`, 'error')
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

      const newMap = await window.electronAPI.maps.create({
        campaignId: activeCampaignId,
        name: finalMapName,
        imagePath,
      })
      addMap(newMap)
      setActiveMap(newMap.id)
      setNewMapId(newMap.id)

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
      await window.electronAPI.maps.setGrid(activeMapId, {
        gridType: type,
        gridSize: size,
        ftPerUnit: newFpu,
        gridOffsetX: newOffsetX,
        gridOffsetY: newOffsetY,
      })
      const updatedMaps = activeMaps.map((m) =>
        m.id === activeMapId ? { ...m, gridType: type, gridSize: size, ftPerUnit: newFpu, gridOffsetX: newOffsetX, gridOffsetY: newOffsetY } : m
      )
      useCampaignStore.getState().setActiveMaps(updatedMaps)
      syncMapStateToPlayer(updatedMaps.find((m) => m.id === activeMapId)!)
    } catch (err) {
      console.error('[LeftSidebar] handleGridChange failed:', err)
    }
  }

  // Partial patch for the new style-only grid fields (v32): visibility,
  // thickness, colour. Kept separate from handleGridChange so we don't
  // touch the geometry (type/size/offset/fpu) unless the caller asked for
  // it. Persists immediately and re-syncs the player window.
  async function handleGridStylePatch(patch: Partial<Pick<MapRecord, 'gridVisible' | 'gridThickness' | 'gridColor'>>) {
    if (!activeMapId || !window.electronAPI) return
    try {
      await window.electronAPI.maps.patchGridDisplay(activeMapId, patch)
      const updatedMaps = activeMaps.map((m) =>
        m.id === activeMapId ? { ...m, ...patch } : m,
      )
      useCampaignStore.getState().setActiveMaps(updatedMaps)
      syncMapStateToPlayer(updatedMaps.find((m) => m.id === activeMapId)!)
    } catch (err) {
      console.error('[LeftSidebar] handleGridStylePatch failed:', err)
    }
  }

  async function handleRotationChange(rot: 0 | 90 | 180 | 270) {
    if (!activeMapId || !window.electronAPI) return
    setRotation(rot)
    try {
      await window.electronAPI.maps.setRotation(activeMapId, rot)
      const updatedMaps = activeMaps.map((m) => m.id === activeMapId ? { ...m, rotation: rot } : m)
      useCampaignStore.getState().setActiveMaps(updatedMaps)
      // DM rotation does NOT sync to player
    } catch (err) {
      console.error('[LeftSidebar] handleRotationChange failed:', err)
    }
  }

  async function handlePlayerRotationChange(rot: 0 | 90 | 180 | 270) {
    if (!activeMapId || !window.electronAPI) return
    setRotationPlayer(rot)
    try {
      await window.electronAPI.maps.setRotationPlayer(activeMapId, rot)
      const updatedMaps = activeMaps.map((m) => m.id === activeMapId ? { ...m, rotationPlayer: rot } : m)
      useCampaignStore.getState().setActiveMaps(updatedMaps)
      syncMapStateToPlayer(updatedMaps.find((m) => m.id === activeMapId)!)
    } catch (err) {
      console.error('[LeftSidebar] handlePlayerRotationChange failed:', err)
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
      await window.electronAPI.maps.swapOrder(mapA.id, mapB.id)
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
    if (!m || useSessionStore.getState().sessionMode === 'prep') return
    window.electronAPI?.sendMapUpdate({
      imagePath: m.imagePath,
      gridType: m.gridType,
      gridSize: m.gridSize,
      rotation: m.rotationPlayer ?? 0,
      // v32 grid-styling columns — without these every tweak in the
      // sidebar (visibility / thickness / colour) stayed DM-only.
      gridVisible: m.gridVisible,
      gridThickness: m.gridThickness,
      gridColor: m.gridColor,
    })
  }

  return (
    <div className="sidebar sidebar-left">
      {/* â”€â”€ Tab bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="sidebar-tab-strip">
        {([
          ['maps', '🗺️', t('sidebar.left.tabMaps')],
          ['assets', '🗄', t('sidebar.left.tabAssets')],
          ['settings', '⚙️', t('settings.title')]
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? 'active' : ''}
          >
            <span className="tab-icon">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Content area: fills remaining sidebar height; AssetBrowser scrolls internally,
          maps/settings scroll via this container */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {tab === 'assets' && <AssetBrowser />}
        {tab === 'settings' && <SettingsPanel />}
        {tab === 'maps' && <>
      {/* â”€â”€ Map list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">{t('sidebar.left.mapsTitle')}</div>

        {activeMaps.length === 0 && (
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
            autoRename={map.id === newMapId}
            onAutoRenameDone={() => setNewMapId(null)}
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

      {/* â”€â”€ Grid settings (only when a map is active) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeMap && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">{t('sidebar.left.gridTitle', { name: activeMap.name })}</div>

          {/* Minimalist grid panel — square-only, two-colour palette,
              no offset fields. Hex / colourful palette / offset
              correction were rarely used and inflated the panel; the
              square fallback handles every map currently in the data
              set. The on/off toggle still maps to gridType: 'none' /
              'square' so downstream renderers stay back-compat. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {/* Grid On/Off + Erkennen on the same row to keep it compact */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-ghost ${gridType === 'square' ? 'btn-active' : ''}`}
                style={{ fontSize: 'var(--text-xs)', padding: '3px 10px' }}
                onClick={() => handleGridChange(gridType === 'square' ? 'none' : 'square', gridSize)}
                title="Raster ein/aus (G)"
              >
                {gridType === 'square' ? 'â¬› AN' : 'â¬œ AUS'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-xs)', padding: '3px 8px' }}
                disabled={gridDetecting || !activeMap?.imagePath}
                onClick={async () => {
                  if (!activeMap?.imagePath) return
                  setGridDetecting(true)
                  setGridDetectMsg(null)
                  try {
                    const detected = await detectGrid(activeMap.imagePath)
                    // Square-only mode: ignore the detector's gridType
                    // and force 'square' on success. Drops the brittle
                    // hex angle-histogram path that produced false
                    // positives on noisy maps.
                    if (detected.confidence > 0.15 && detected.gridSize > 10) {
                      handleGridChange('square', detected.gridSize, undefined, 0, 0)
                      setGridDetectMsg({ text: `âœ“ ${detected.gridSize}px`, ok: true })
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
                {gridDetecting ? 'â³' : 'ðŸ”'} Erkennen
              </button>
              {gridDetectMsg && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--text-xs)',
                  color: gridDetectMsg.ok ? 'var(--success)' : 'var(--warning)',
                  whiteSpace: 'nowrap',
                }}>
                  {gridDetectMsg.text}
                  <button
                    onClick={() => setGridDetectMsg(null)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 9, padding: 0, lineHeight: 1, opacity: 0.7 }}
                    title="Schließen"
                  >✕</button>
                </span>
              )}
            </div>

            {gridType === 'square' && (
              <>
                {/* Feld-px + Einheit on the same row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Feld</label>
                  <NumberStepper
                    value={gridSize}
                    onChange={(v) => handleGridChange('square', v)}
                    min={10}
                    max={500}
                    step={1}
                    bigStep={5}
                    width={84}
                    size="sm"
                    ariaLabel="Raster-Feldgröße in Pixeln"
                  />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>px</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'var(--sp-2)' }}>·</span>
                  <input
                    className="input"
                    type="number"
                    min={1} max={100} step={1}
                    value={ftPerUnit}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      if (v >= 1 && v <= 100) handleGridChange('square', gridSize, v)
                    }}
                    style={{ width: 52 }}
                  />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>ft</span>
                </div>

                {/* Dicke + Farbe (b/w) on the same row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Dicke</label>
                  <NumberStepper
                    value={activeMap.gridThickness}
                    onChange={(v) => handleGridStylePatch({ gridThickness: Math.max(0.25, Math.min(4, v)) })}
                    min={0.25}
                    max={4}
                    step={0.25}
                    bigStep={0.5}
                    width={84}
                    size="sm"
                    ariaLabel="Rasterlinien-Dicke"
                  />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'var(--sp-2)' }}>·</span>
                  {[
                    { label: 'Weiß',    value: 'rgba(255,255,255,0.34)' },
                    { label: 'Schwarz', value: 'rgba(0,0,0,0.45)' },
                  ].map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      title={label}
                      onClick={() => handleGridStylePatch({ gridColor: value })}
                      style={{
                        width: 22, height: 22,
                        borderRadius: '50%',
                        border: activeMap.gridColor === value
                          ? '2px solid var(--accent-blue)'
                          : '2px solid var(--border)',
                        background: value,
                        padding: 0,
                        cursor: 'pointer',
                        backgroundImage: value.includes('0,0,0')
                          ? 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.15) 75%)'
                          : undefined,
                        backgroundSize: '6px 6px',
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Rotation — DM view */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-1)' }}>
                Drehung (meine Ansicht)
              </label>
              <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                {([0, 90, 180, 270] as const).map((rot) => (
                  <button
                    key={rot}
                    className={`btn btn-ghost ${rotation === rot ? 'btn-active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '3px' }}
                    title={`DM-Ansicht: ${rot}Â°`}
                    onClick={() => handleRotationChange(rot)}
                  >
                    {rot === 0 ? 'â†‘' : rot === 90 ? 'â†’' : rot === 180 ? 'â†“' : 'â†'}
                  </button>
                ))}
              </div>
            </div>
            {/* Rotation — Player view */}
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-1)' }}>
                Drehung (Spieler-Ansicht)
              </label>
              <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
                {([0, 90, 180, 270] as const).map((rot) => (
                  <button
                    key={rot}
                    className={`btn btn-ghost ${rotationPlayer === rot ? 'btn-active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '3px' }}
                    title={`Spieler-Ansicht: ${rot}Â° (wird sofort synchronisiert)`}
                    onClick={() => handlePlayerRotationChange(rot)}
                  >
                    {rot === 0 ? 'â†‘' : rot === 90 ? 'â†’' : rot === 180 ? 'â†“' : 'â†'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
        </>}
      </div>
    </div>
  )
}

// â”€â”€ PDF â†’ PNG conversion (renderer-side, requires pdfjs-dist) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const viewport = page.getViewport({ scale: 2 }) // 2Ã— for quality

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

function MapListItem({ map, index, total, isActive, onSelect, onReorder, autoRename, onAutoRenameDone }: {
  map: MapRecord
  index: number
  total: number
  isActive: boolean
  onSelect: () => void
  onReorder: (id: number, direction: 'up' | 'down') => void
  autoRename?: boolean
  onAutoRenameDone?: () => void
}) {
  const { t } = useTranslation()
  const thumbnailUrl = useImageUrl(map.imagePath)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(map.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoRename) {
      setRenameValue('')
      setRenaming(true)
    }
  }, [autoRename])

  useEffect(() => {
    if (renaming) {
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [renaming])

  async function commitRename() {
    const trimmed = renameValue.trim() || map.name
    setRenaming(false)
    onAutoRenameDone?.()
    if (!window.electronAPI) return
    if (trimmed === map.name) return
    await window.electronAPI.maps.rename(map.id, trimmed)
    const { activeMaps, setActiveMaps } = useCampaignStore.getState()
    setActiveMaps(activeMaps.map((m) => m.id === map.id ? { ...m, name: trimmed } : m))
  }

  async function handleDelete() {
    if (!window.electronAPI) return
    const confirmed = await window.electronAPI.deleteMapConfirm(map.name)
    if (!confirmed) return
    // Child tables (tokens, initiative, fog_state, drawings, walls,
    // rooms) all cascade via ON DELETE CASCADE.
    await window.electronAPI.maps.delete(map.id)
    useCampaignStore.getState().refreshCampaigns()
    if (map.id === useCampaignStore.getState().activeMapId) {
      useTokenStore.getState().setTokens([])
      useInitiativeStore.getState().setEntries([])
      useSessionStore.getState().setPlayerConnected(false)
      // Drop the player window back to the idle splash. Sending
      // `mode: 'map'` with `map: null` used to make PlayerApp fall
      // through to the previous map state instead of idling out.
      // Walls + viewport must be present so the LOS engine and the
      // Player Control Mode frame don't keep stale geometry from the
      // map that just got deleted.
      window.electronAPI?.sendFullSync({
        mode: 'idle',
        map: null,
        tokens: [],
        walls: [],
        viewport: null,
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
      tabIndex={renaming ? -1 : 0}
      role="button"
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
      onKeyDown={(e) => {
        if (renaming) return
        if (e.key === 'F2') {
          e.preventDefault()
          setRenaming(true)
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
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
          placeholder={autoRename ? t('sidebar.left.mapNamePlaceholder') : undefined}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            if (e.key === 'Escape') { setRenameValue(map.name); setRenaming(false); onAutoRenameDone?.() }
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
          >â–²</button>
          <button
            className="btn btn-ghost"
            style={{ padding: '0 4px', fontSize: 10, lineHeight: '14px', minHeight: 14 }}
            disabled={index === total - 1}
            onClick={(e) => { e.stopPropagation(); onReorder(map.id, 'down') }}
            title="Nach unten"
          >â–¼</button>
        </div>
      )}
    </div>
  )
}
