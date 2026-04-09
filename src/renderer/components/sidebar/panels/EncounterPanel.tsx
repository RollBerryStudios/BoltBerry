import { useState } from 'react'
import { useEncounterStore } from '../../../stores/encounterStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useTokenStore } from '../../../stores/tokenStore'
import { useInitiativeStore } from '../../../stores/initiativeStore'
import { useWallStore } from '../../../stores/wallStore'
import { useUIStore } from '../../../stores/uiStore'
import type { EncounterTemplate } from '@shared/ipc-types'

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

export function EncounterPanel() {
  const { encounters, addEncounter, removeEncounter } = useEncounterStore()
  const { activeMapId, activeCampaignId } = useCampaignStore()
  const tokens = useTokenStore((s) => s.tokens)
  const walls = useWallStore((s) => s.walls)
  const { entries } = useInitiativeStore()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selected = encounters.find((e) => e.id === selectedId) ?? null

  async function handleSave() {
    if (!activeCampaignId || !activeMapId) return
    const template: EncounterTemplate = {
      tokens: tokens
        .filter((t) => t.faction === 'enemy' || t.faction === 'neutral')
        .map((t) => ({
          name: t.name,
          imagePath: t.imagePath,
          x: t.x,
          y: t.y,
          size: t.size,
          hpCurrent: t.hpCurrent,
          hpMax: t.hpMax,
          faction: t.faction,
          ac: t.ac,
          visibleToPlayers: t.visibleToPlayers,
        })),
      walls: walls
        .filter((w) => w.mapId === activeMapId)
        .map((w) => ({
          x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
          wallType: w.wallType, doorState: w.doorState,
        })),
      initiative: entries.map((e) => ({
        combatantName: e.combatantName,
        roll: e.roll,
        tokenId: e.tokenId,
      })),
      notes: null,
    }
    const name = prompt('Encounter-Name:', 'Neues Encounter') ?? 'Encounter'
    if (!name) return
    try {
      const result = await window.electronAPI?.dbRun(
        'INSERT INTO encounters (campaign_id, name, template_data) VALUES (?, ?, ?)',
        [activeCampaignId, name.trim(), JSON.stringify(template)]
      )
      if (result) {
        addEncounter({
          id: result.lastInsertRowid,
          campaignId: activeCampaignId,
          name: name.trim(),
          templateData: JSON.stringify(template),
          notes: null,
          createdAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('[EncounterPanel] save failed:', err)
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

    const tokenIdMap = new Map<number, number>()

    for (const t of template.tokens) {
      try {
        const result = await window.electronAPI.dbRun(
          'INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, faction, show_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 1)',
          [activeMapId, t.name, t.imagePath, t.x, t.y, t.size, t.hpCurrent, t.hpMax, t.visibleToPlayers ? 1 : 0, t.faction]
        )
        useTokenStore.getState().addToken({
          id: result.lastInsertRowid,
          mapId: activeMapId,
          name: t.name,
          imagePath: t.imagePath,
          x: t.x, y: t.y, size: t.size,
          hpCurrent: t.hpCurrent, hpMax: t.hpMax,
          visibleToPlayers: t.visibleToPlayers,
          rotation: 0, locked: false, zIndex: 0,
          markerColor: null, ac: t.ac, notes: null,
          statusEffects: null, faction: t.faction, showName: true,
        })
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
          id: result.lastInsertRowid,
          mapId: activeMapId,
          x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
          wallType: w.wallType as any,
          doorState: w.doorState as any,
        })
      } catch (err) {
        console.error('[EncounterPanel] spawn wall failed:', err)
      }
    }

    for (const init of template.initiative) {
      const linkedToken = init.tokenId
        ? useTokenStore.getState().tokens.find((t) => t.name === template.tokens.find((tt, i) => i === template.tokens.indexOf(tt))?.name)
        : null
      try {
        const result = await window.electronAPI.dbRun(
          'INSERT INTO initiative (map_id, combatant_name, roll, current_turn, token_id) VALUES (?, ?, ?, 0, ?)',
          [activeMapId, init.combatantName, init.roll, linkedToken?.id ?? null]
        )
        useInitiativeStore.getState().addEntry({
          id: result.lastInsertRowid,
          mapId: activeMapId,
          combatantName: init.combatantName,
          roll: init.roll,
          currentTurn: false,
          tokenId: linkedToken?.id ?? null,
          effectTimers: null,
        })
      } catch (err) {
        console.error('[EncounterPanel] spawn initiative failed:', err)
      }
    }

    broadcastTokensFromPanel()
  }

  async function handleDelete(id: number) {
    removeEncounter(id)
    if (selectedId === id) setSelectedId(null)
    try {
      await window.electronAPI?.dbRun('DELETE FROM encounters WHERE id = ?', [id])
    } catch (err) {
      console.error('[EncounterPanel] delete failed:', err)
    }
  }

  const mapTokens = tokens.filter((t) => t.faction === 'enemy' || t.faction === 'neutral')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
        <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
          Encounter-Vorlagen ({encounters.length})
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
          onClick={handleSave}
          disabled={!activeCampaignId || mapTokens.length === 0}
        >
          💾 Aktuelle Gegner als Encounter speichern
        </button>
        {mapTokens.length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Keine Gegner/Neutral-Token auf der Karte
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
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
            try {
              const t = JSON.parse(enc.templateData)
              count = t.tokens?.length ?? 0
            } catch {}
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
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {enc.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {count} {count === 1 ? 'Gegner' : 'Gegner'}
                </span>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                  onClick={(e) => { e.stopPropagation(); handleSpawn(enc.id) }}
                  title="Encounter auf der Karte spawnen"
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

      {selected && (() => {
        let template: EncounterTemplate | null = null
        try { template = JSON.parse(selected.templateData) } catch {}
        if (!template) return null
        return (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'var(--bg-elevated)',
            flexShrink: 0,
            maxHeight: '40%',
            overflowY: 'auto',
          }}>
            <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
              {selected.name} — Vorschau
            </div>
            {template.tokens.length > 0 && (
              <div style={{ marginBottom: 'var(--sp-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Token ({template.tokens.length})</div>
                {template.tokens.map((t, i) => (
                  <div key={i} style={{ fontSize: 'var(--text-xs)', display: 'flex', gap: 4, padding: '2px 0' }}>
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: t.faction === 'enemy' ? '#ef4444' : t.faction === 'neutral' ? '#f59e0b' : '#22c55e',
                      marginTop: 4, flexShrink: 0,
                    }} />
                    <span>{t.name}</span>
                    {t.hpMax > 0 && <span style={{ color: 'var(--text-muted)' }}>HP{t.hpCurrent}/{t.hpMax}</span>}
                    {t.ac != null && <span style={{ color: 'var(--text-muted)' }}>RK{t.ac}</span>}
                  </div>
                ))}
              </div>
            )}
            {template.walls.length > 0 && (
              <div style={{ marginBottom: 'var(--sp-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  🧱 {template.walls.length} Wände/Türen
                </div>
              </div>
            )}
            {template.initiative.length > 0 && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  ⚔️ {template.initiative.length} Initiative-Einträge
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}