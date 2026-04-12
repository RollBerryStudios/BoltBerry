import { useState, useMemo, useEffect, useRef } from 'react'
import { useEncounterStore } from '../../../stores/encounterStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useTokenStore } from '../../../stores/tokenStore'
import { useInitiativeStore } from '../../../stores/initiativeStore'
import { useWallStore } from '../../../stores/wallStore'
import { useUIStore } from '../../../stores/uiStore'
import { showToast } from '../../shared/Toast'
import type { EncounterTemplate, FormationType, DifficultyLevel } from '@shared/ipc-types'
import {
  getFormationOffsets,
  applyDifficultyToToken,
  selectTokensForDifficulty,
  selectRandomTokens,
} from '../../../utils/formationLayout'

function broadcastTokensFromPanel() {
  if (useUIStore.getState().sessionMode === 'prep') return
  const tokens = useTokenStore.getState().tokens
  const visible = tokens
    .filter((t) => t.visibleToPlayers)
    .map((t) => ({
      id: t.id, name: t.name, imagePath: t.imagePath,
      x: t.x, y: t.y, size: t.size,
      hpCurrent: t.hpCurrent, hpMax: t.hpMax,
      showName: t.showName, rotation: t.rotation,
      markerColor: t.markerColor, statusEffects: t.statusEffects,
      ac: t.ac, faction: t.faction,
    }))
  window.electronAPI?.sendTokenUpdate(visible)
}

const FORMATIONS: { value: FormationType; label: string; icon: string }[] = [
  { value: 'saved', label: 'Gespeichert', icon: '📌' },
  { value: 'line', label: 'Linie', icon: '➖' },
  { value: 'circle', label: 'Kreis', icon: '⭕' },
  { value: 'cluster', label: 'Haufen', icon: '💥' },
  { value: 'wing', label: 'Flügel', icon: '🦅' },
  { value: 'v-formation', label: 'Keil', icon: '🔻' },
]

const DIFFICULTIES: { value: DifficultyLevel; label: string; color: string }[] = [
  { value: 'easy', label: 'Leicht', color: '#22c55e' },
  { value: 'normal', label: 'Normal', color: '#3b82f6' },
  { value: 'hard', label: 'Schwer', color: '#f59e0b' },
  { value: 'deadly', label: 'Tödlich', color: '#ef4444' },
]

// Tiny SVG previews for each formation
function FormationPreview({ formation, count = 5 }: { formation: FormationType; count?: number }) {
  const size = 48
  const cx = size / 2
  const cy = size / 2
  const r = 3
  const spread = 16

  const pts: { x: number; y: number }[] = []
  const n = Math.min(count, 6)

  switch (formation) {
    case 'saved':
      for (let i = 0; i < n; i++) {
        pts.push({ x: cx + (i % 3 - 1) * 12, y: cy + Math.floor(i / 3) * 12 - 4 })
      }
      break
    case 'line':
      for (let i = 0; i < n; i++) {
        pts.push({ x: cx + (i - (n - 1) / 2) * 9, y: cy })
      }
      break
    case 'circle':
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        pts.push({ x: cx + Math.cos(a) * spread * 0.7, y: cy + Math.sin(a) * spread * 0.7 })
      }
      break
    case 'cluster':
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const rr = i === 0 ? 0 : spread * 0.4 + (i % 2) * 4
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr })
      }
      break
    case 'wing': {
      pts.push({ x: cx, y: cy })
      for (let i = 1; i < n; i++) {
        const side = i % 2 === 0 ? 1 : -1
        const row = Math.ceil(i / 2)
        pts.push({ x: cx + side * row * 10, y: cy + row * 8 })
      }
      break
    }
    case 'v-formation': {
      pts.push({ x: cx, y: cy - spread * 0.6 })
      for (let i = 1; i < n; i++) {
        const side = i % 2 === 0 ? 1 : -1
        const row = Math.ceil(i / 2)
        pts.push({ x: cx + side * row * 9, y: cy - spread * 0.6 + row * 9 })
      }
      break
    }
  }

  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={r} fill={i === 0 ? '#ef4444' : '#f59e0b'} opacity={0.85} />
      ))}
    </svg>
  )
}

export function EncounterPanel() {
  const { encounters, addEncounter, removeEncounter, updateEncounter } = useEncounterStore()
  const { activeMapId, activeCampaignId } = useCampaignStore()
  const tokens = useTokenStore((s) => s.tokens)
  const walls = useWallStore((s) => s.walls)
  const { entries } = useInitiativeStore()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formation, setFormation] = useState<FormationType>('saved')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('normal')
  const [randomVariant, setRandomVariant] = useState(false)
  const [randomCount, setRandomCount] = useState(0)
  const [pendingSpawn, setPendingSpawn] = useState<number | null>(null)
  const [isSpawning, setIsSpawning] = useState(false)

  // Inline name input for new encounter
  const [newNameValue, setNewNameValue] = useState('')
  const [showNewNameInput, setShowNewNameInput] = useState(false)
  const newNameInputRef = useRef<HTMLInputElement>(null)

  // Inline edit for existing encounter name
  const [editingNameId, setEditingNameId] = useState<number | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const editNameInputRef = useRef<HTMLInputElement>(null)

  const selected = encounters.find((e) => e.id === selectedId) ?? null

  const selectedTemplate = useMemo<EncounterTemplate | null>(() => {
    if (!selected) return null
    try { return JSON.parse(selected.templateData) } catch { return null }
  }, [selected])

  useEffect(() => {
    function onEncounterSpawn(e: Event) {
      const encounterId = (e as CustomEvent).detail?.encounterId
      if (encounterId) setPendingSpawn(encounterId)
    }
    window.addEventListener('encounter:spawn', onEncounterSpawn as EventListener)
    return () => window.removeEventListener('encounter:spawn', onEncounterSpawn as EventListener)
  }, [])

  useEffect(() => {
    if (pendingSpawn !== null) {
      setPendingSpawn(null)
      handleSpawn(pendingSpawn)
    }
  }, [pendingSpawn]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showNewNameInput) setTimeout(() => newNameInputRef.current?.focus(), 20)
  }, [showNewNameInput])

  useEffect(() => {
    if (editingNameId !== null) setTimeout(() => editNameInputRef.current?.focus(), 20)
  }, [editingNameId])

  async function handleSave() {
    if (!activeCampaignId || !activeMapId) return
    setShowNewNameInput(true)
    setNewNameValue('Neues Encounter')
  }

  async function commitNewEncounter() {
    if (!activeCampaignId || !activeMapId) return
    const name = newNameValue.trim() || 'Encounter'
    setShowNewNameInput(false)
    setNewNameValue('')

    const template: EncounterTemplate = {
      tokens: tokens
        .filter((t) => t.faction === 'enemy' || t.faction === 'neutral')
        .map((t) => ({
          name: t.name, imagePath: t.imagePath,
          x: t.x, y: t.y, size: t.size,
          hpCurrent: t.hpCurrent, hpMax: t.hpMax,
          faction: t.faction, ac: t.ac, visibleToPlayers: t.visibleToPlayers,
        })),
      walls: walls
        .filter((w) => w.mapId === activeMapId)
        .map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, wallType: w.wallType, doorState: w.doorState })),
      initiative: entries.map((e) => ({ combatantName: e.combatantName, roll: e.roll, tokenId: e.tokenId })),
      notes: null,
    }
    try {
      const result = await window.electronAPI?.dbRun(
        'INSERT INTO encounters (campaign_id, name, template_data) VALUES (?, ?, ?)',
        [activeCampaignId, name, JSON.stringify(template)]
      )
      if (result) {
        addEncounter({
          id: result.lastInsertRowid,
          campaignId: activeCampaignId,
          name,
          templateData: JSON.stringify(template),
          notes: null,
          createdAt: new Date().toISOString(),
        })
        showToast(`Encounter „${name}" gespeichert`, 'success')
      }
    } catch (err) {
      console.error('[EncounterPanel] save failed:', err)
      showToast('Encounter konnte nicht gespeichert werden', 'error')
    }
  }

  async function commitEncounterRename(id: number) {
    const name = editingNameValue.trim()
    setEditingNameId(null)
    if (!name) return
    updateEncounter(id, { name })
    try {
      await window.electronAPI?.dbRun('UPDATE encounters SET name = ? WHERE id = ?', [name, id])
    } catch (err) {
      console.error('[EncounterPanel] rename failed:', err)
    }
  }

  async function handleSpawn(encounterId: number) {
    const enc = encounters.find((e) => e.id === encounterId)
    if (!enc || !activeMapId) return
    let template: EncounterTemplate
    try {
      template = JSON.parse(enc.templateData)
    } catch {
      console.error('[EncounterPanel] invalid template data')
      return
    }

    if (template.tokens.length === 0) return

    setIsSpawning(true)
    const gridSize = useCampaignStore.getState().activeMaps.find((m) => m.id === activeMapId)?.gridSize ?? 50

    const centerToken = template.tokens[0]
    const centerX = centerToken.x
    const centerY = centerToken.y

    let spawnTokens = [...template.tokens]

    if (difficulty !== 'normal') {
      spawnTokens = selectTokensForDifficulty(spawnTokens, difficulty)
      spawnTokens = spawnTokens.map((t) => applyDifficultyToToken(t, difficulty))
    }

    if (randomVariant && randomCount > 0 && randomCount < spawnTokens.length) {
      spawnTokens = selectRandomTokens(spawnTokens, randomCount)
    }

    const offsets = getFormationOffsets(formation, spawnTokens.length, gridSize)
    const spawnedTokenIds: { name: string; id: number }[] = []

    for (let i = 0; i < spawnTokens.length; i++) {
      const t = spawnTokens[i]
      const offset = offsets[i] ?? { dx: 0, dy: 0 }
      const spawnX = formation === 'saved' ? t.x : centerX + offset.dx
      const spawnY = formation === 'saved' ? t.y : centerY + offset.dy

      try {
        const result = await window.electronAPI.dbRun(
          'INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, faction, show_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 1)',
          [activeMapId, t.name, t.imagePath, Math.round(spawnX), Math.round(spawnY), t.size, t.hpCurrent, t.hpMax, t.visibleToPlayers ? 1 : 0, t.faction]
        )
        const newTokenId = result.lastInsertRowid
        useTokenStore.getState().addToken({
          id: newTokenId, mapId: activeMapId, name: t.name, imagePath: t.imagePath,
          x: Math.round(spawnX), y: Math.round(spawnY), size: t.size,
          hpCurrent: t.hpCurrent, hpMax: t.hpMax, visibleToPlayers: t.visibleToPlayers,
          rotation: 0, locked: false, zIndex: 0, markerColor: null, ac: t.ac, notes: null,
          statusEffects: null, faction: t.faction, showName: true,
        })
        spawnedTokenIds.push({ name: t.name, id: newTokenId })
      } catch (err) {
        console.error('[EncounterPanel] spawn token failed:', err)
      }
    }

    for (const w of template.walls) {
      try {
        const result = await window.electronAPI.dbRun(
          'INSERT INTO walls (map_id, x1, y1, x2, y2, wall_type, door_state) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [activeMapId, w.x1, w.y1, w.x2, w.y2, w.wallType, w.doorState]
        )
        useWallStore.getState().addWall({
          id: result.lastInsertRowid, mapId: activeMapId,
          x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
          wallType: w.wallType as any, doorState: w.doorState as any,
        })
      } catch (err) {
        console.error('[EncounterPanel] spawn wall failed:', err)
      }
    }

    for (const init of template.initiative) {
      const linkedToken = init.tokenId
        ? spawnedTokenIds.find((st) => {
            const originalToken = template.tokens.find((t) => t.name === init.combatantName)
            return originalToken && st.name === originalToken.name
          }) ?? null
        : null
      try {
        const result = await window.electronAPI.dbRun(
          'INSERT INTO initiative (map_id, combatant_name, roll, current_turn, token_id) VALUES (?, ?, ?, 0, ?)',
          [activeMapId, init.combatantName, init.roll, linkedToken?.id ?? null]
        )
        useInitiativeStore.getState().addEntry({
          id: result.lastInsertRowid, mapId: activeMapId,
          combatantName: init.combatantName, roll: init.roll,
          currentTurn: false, tokenId: linkedToken?.id ?? null, effectTimers: null,
        })
      } catch (err) {
        console.error('[EncounterPanel] spawn initiative failed:', err)
      }
    }

    broadcastTokensFromPanel()
    setIsSpawning(false)
    showToast(`${enc.name}: ${spawnedTokenIds.length} Token gespawnt`, 'success')
  }

  async function handleDelete(id: number) {
    if (!window.electronAPI) return
    const enc = encounters.find((e) => e.id === id)
    const confirmed = await window.electronAPI.confirmDialog(
      `Begegnung „${enc?.name ?? ''}" löschen?`,
      'Diese Aktion kann nicht rückgängig gemacht werden.'
    )
    if (!confirmed) return
    removeEncounter(id)
    if (selectedId === id) setSelectedId(null)
    try {
      await window.electronAPI.dbRun('DELETE FROM encounters WHERE id = ?', [id])
      showToast(`Encounter gelöscht`, 'info')
    } catch (err) {
      console.error('[EncounterPanel] delete failed:', err)
    }
  }

  const mapTokens = tokens.filter((t) => t.faction === 'enemy' || t.faction === 'neutral')

  const spawnTokenCount = useMemo(() => {
    if (!selectedTemplate) return 0
    let count = selectedTemplate.tokens.length
    if (difficulty !== 'normal') {
      const cfg = difficulty === 'easy' ? { mult: 0.5 }
        : difficulty === 'hard' ? { mult: 1.5 }
        : { mult: 2.0 }
      count = Math.max(1, Math.round(count * cfg.mult))
    }
    if (randomVariant && randomCount > 0) count = Math.min(count, randomCount)
    return count
  }, [selectedTemplate, difficulty, randomVariant, randomCount])

  const previewTokens = useMemo(() => {
    if (!selectedTemplate) return []
    let preview = [...selectedTemplate.tokens]
    if (difficulty !== 'normal') {
      preview = selectTokensForDifficulty(preview, difficulty)
      preview = preview.map((t) => applyDifficultyToToken(t, difficulty))
    }
    if (randomVariant && randomCount > 0 && randomCount < preview.length) {
      preview = selectRandomTokens(preview, randomCount)
    }
    return preview
  }, [selectedTemplate, difficulty, randomVariant, randomCount])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
        <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
          Encounter-Vorlagen ({encounters.length})
        </div>

        {showNewNameInput ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              ref={newNameInputRef}
              value={newNameValue}
              onChange={(e) => setNewNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewEncounter()
                if (e.key === 'Escape') { setShowNewNameInput(false); setNewNameValue('') }
              }}
              placeholder="Encounter-Name…"
              style={{
                flex: 1, fontSize: 'var(--text-xs)', padding: '4px 8px',
                background: 'var(--bg-base)', border: '1px solid var(--accent-blue)',
                borderRadius: 3, color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button className="btn btn-primary" style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }} onClick={commitNewEncounter}>OK</button>
            <button className="btn btn-ghost" style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }} onClick={() => { setShowNewNameInput(false); setNewNameValue('') }}>✕</button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
            onClick={handleSave}
            disabled={!activeCampaignId || mapTokens.length === 0}
          >
            💾 Aktuelle Gegner als Encounter speichern
          </button>
        )}

        {!showNewNameInput && mapTokens.length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Keine Gegner/Neutral-Token auf der Karte
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {isSpawning && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 24, animation: 'spin 0.8s linear infinite' }}>⚔️</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Spawne Encounter…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {encounters.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
            <div className="empty-state-icon" style={{ fontSize: 32 }}>⚔️</div>
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Keine Encounter</div>
            <div className="empty-state-desc" style={{ fontSize: 'var(--text-xs)' }}>
              Platziere Gegner auf der Karte und speichere sie als Vorlage
            </div>
          </div>
        ) : (
          encounters.map((enc) => {
            let count = 0
            try { const t = JSON.parse(enc.templateData); count = t.tokens?.length ?? 0 } catch {}
            return (
              <div
                key={enc.id}
                onClick={() => setSelectedId(enc.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-2)',
                  padding: 'var(--sp-2) var(--sp-4)',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  background: selectedId === enc.id ? 'var(--accent-blue-dim)' : 'transparent',
                  borderLeft: selectedId === enc.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
                }}
              >
                {editingNameId === enc.id ? (
                  <input
                    ref={editNameInputRef}
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEncounterRename(enc.id)
                      if (e.key === 'Escape') setEditingNameId(null)
                    }}
                    onBlur={() => commitEncounterRename(enc.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1, fontSize: 'var(--text-sm)', padding: '1px 4px',
                      background: 'var(--bg-base)', border: '1px solid var(--accent-blue)',
                      borderRadius: 3, color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    style={{ flex: 1, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingNameId(enc.id); setEditingNameValue(enc.name) }}
                    title="Doppelklick zum Umbenennen"
                  >
                    {enc.name}
                  </span>
                )}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {count} Gegner
                </span>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                  onClick={(e) => { e.stopPropagation(); handleSpawn(enc.id) }}
                  title="Encounter auf der Karte spawnen"
                  disabled={isSpawning}
                >
                  ⚔️ Spawn
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  style={{ fontSize: 10, padding: 2, color: 'var(--danger)' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(enc.id) }}
                  title="Encounter löschen"
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>

      {selected && selectedTemplate && (() => (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
          maxHeight: '55%',
          overflowY: 'auto',
        }}>
          <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
            {selected.name} — Spawn-Optionen
          </div>

          {/* Formation selector with previews */}
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Formation</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FORMATIONS.map((f) => (
                <button
                  key={f.value}
                  className="btn"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '4px 6px', fontSize: 'var(--text-xs)',
                    background: formation === f.value ? 'var(--accent-blue-dim)' : 'var(--bg-base)',
                    border: formation === f.value ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                    borderRadius: 4,
                  }}
                  onClick={() => setFormation(f.value)}
                  title={f.label}
                >
                  <FormationPreview formation={f.value} count={Math.min(previewTokens.length || 4, 6)} />
                  <span style={{ fontSize: 9, color: formation === f.value ? 'var(--accent-blue-light)' : 'var(--text-muted)' }}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
              Schwierigkeit
              {difficulty !== 'normal' && (
                <span style={{ marginLeft: 4, color: DIFFICULTIES.find((d) => d.value === difficulty)?.color }}>
                  ({DIFFICULTIES.find((d) => d.value === difficulty)?.label})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  className="btn"
                  style={{
                    fontSize: 'var(--text-xs)', padding: '2px 8px',
                    background: difficulty === d.value ? `${d.color}22` : undefined,
                    border: difficulty === d.value ? `1px solid ${d.color}` : undefined,
                    color: difficulty === d.value ? d.color : undefined,
                  }}
                  onClick={() => setDifficulty(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={randomVariant} onChange={(e) => setRandomVariant(e.target.checked)} style={{ margin: 0 }} />
              Zufällige Auswahl
            </label>
            {randomVariant && (
              <input
                type="number" min={1} max={selectedTemplate.tokens.length}
                value={randomCount || selectedTemplate.tokens.length}
                onChange={(e) => setRandomCount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 40, fontSize: 'var(--text-xs)', padding: '1px 4px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-primary)' }}
                title="Anzahl der zu spawnenden Token"
              />
            )}
          </div>

          <div style={{ marginBottom: 'var(--sp-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Wird gespawnt: {spawnTokenCount} Token
          </div>

          {previewTokens.length > 0 && (
            <div style={{ marginBottom: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
                Vorschau ({previewTokens.length})
              </div>
              {previewTokens.slice(0, 12).map((t, i) => (
                <div key={i} style={{ fontSize: 'var(--text-xs)', display: 'flex', gap: 4, padding: '1px 0' }}>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: t.faction === 'enemy' ? '#ef4444' : t.faction === 'neutral' ? '#f59e0b' : '#22c55e',
                    marginTop: 3, flexShrink: 0,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.name}</span>
                  {t.hpMax > 0 && <span style={{ color: 'var(--text-muted)' }}>HP{t.hpCurrent}/{t.hpMax}</span>}
                  {t.ac != null && <span style={{ color: 'var(--text-muted)' }}>RK{t.ac}</span>}
                </div>
              ))}
              {previewTokens.length > 12 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  … und {previewTokens.length - 12} weitere
                </div>
              )}
            </div>
          )}

          {selectedTemplate.walls.length > 0 && (
            <div style={{ marginBottom: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                🧱 {selectedTemplate.walls.length} Wände/Türen
              </div>
            </div>
          )}
          {selectedTemplate.initiative.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                ⚔️ {selectedTemplate.initiative.length} Initiative-Einträge
              </div>
            </div>
          )}
        </div>
      ))()}
    </div>
  )
}
