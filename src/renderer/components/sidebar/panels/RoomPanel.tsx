import { useState, useCallback } from 'react'
import { useRoomStore } from '../../../stores/roomStore'
import { useCampaignStore } from '../../../stores/campaignStore'
import { useEncounterStore } from '../../../stores/encounterStore'
import { useUIStore } from '../../../stores/uiStore'
import { useMapTransformStore } from '../../../stores/mapTransformStore'
import { useFogStore } from '../../../stores/fogStore'
import type { RoomVisibility, RoomRecord } from '@shared/ipc-types'

const VISIBILITY_OPTIONS: { value: RoomVisibility; label: string; icon: string }[] = [
  { value: 'hidden', label: 'Versteckt', icon: '👁‍🗨' },
  { value: 'revealed', label: 'Sichtbar', icon: '👁' },
  { value: 'dimmed', label: 'Gedimmt', icon: '🌤' },
]

export function RoomPanel() {
  const { rooms, selectedRoomId, setSelectedRoomId, updateRoom, removeRoom } = useRoomStore()
  const { activeMapId } = useCampaignStore()
  const encounters = useEncounterStore((s) => s.encounters)
  const setActiveTool = useUIStore((s) => s.setActiveTool)

  const mapRooms = activeMapId ? rooms.filter((r) => r.mapId === activeMapId) : []

  const selected = mapRooms.find((r) => r.id === selectedRoomId) ?? null

  function handleCenterOnRoom(room: RoomRecord) {
    let points: Array<{x: number; y: number}> = []
    try { points = JSON.parse(room.polygon) } catch { return }
    if (points.length === 0) return
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length
    useMapTransformStore.getState().centerOnPoint(cx, cy)
  }

  const handleDelete = useCallback(async (id: number) => {
    if (!window.electronAPI) return
    const room = rooms.find((r) => r.id === id)
    const confirmed = await window.electronAPI.confirmDialog(
      `Raum "${room?.name ?? ''}" löschen?`,
      'Diese Aktion kann nicht rükgängig gemacht werden.'
    )
    if (!confirmed) return
    removeRoom(id)
    if (selectedRoomId === id) setSelectedRoomId(null)
    try {
      await window.electronAPI.dbRun('DELETE FROM rooms WHERE id = ?', [id])
    } catch (err) {
      console.error('[RoomPanel] delete failed:', err)
    }
  }, [rooms, removeRoom, selectedRoomId, setSelectedRoomId])

  const handleUpdateField = useCallback(async (id: number, field: string, value: any) => {
    // Convert snake_case DB field name to camelCase for store update
    const storeField = field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    const patch: Partial<RoomRecord> = {}
    ;(patch as any)[storeField] = value
    updateRoom(id, patch)
    try {
      const dbValue = value == null ? null : typeof value === 'string' ? value : JSON.stringify(value)
      await window.electronAPI?.dbRun(`UPDATE rooms SET ${field} = ? WHERE id = ?`, [dbValue, id])
    } catch (err) {
      console.error('[RoomPanel] update failed:', err)
    }
  }, [updateRoom])

  const handleRevealRoom = useCallback(async (room: RoomRecord) => {
    let points: Array<{x: number; y: number}> = []
    try { points = JSON.parse(room.polygon) } catch { return }
    if (points.length < 3) return

    const flatPoints = points.flatMap((p) => [p.x, p.y])
    const fogStore = useFogStore.getState()
    fogStore.pushOperation({
      type: 'reveal',
      shape: 'polygon',
      points: flatPoints,
    })
  }, [])

  const handleCoverRoom = useCallback(async (room: RoomRecord) => {
    let points: Array<{x: number; y: number}> = []
    try { points = JSON.parse(room.polygon) } catch { return }
    if (points.length < 3) return

    const flatPoints = points.flatMap((p) => [p.x, p.y])
    const fogStore = useFogStore.getState()
    fogStore.pushOperation({
      type: 'cover',
      shape: 'polygon',
      points: flatPoints,
    })
  }, [])

  const handleSpawnEncounter = useCallback(async (room: RoomRecord) => {
    if (!room.encounterId) return
    const encounter = encounters.find((e) => e.id === room.encounterId)
    if (!encounter || !activeMapId) return
    setActiveTool('select')
    window.dispatchEvent(new CustomEvent('encounter:spawn', { detail: { encounterId: room.encounterId } }))
  }, [encounters, activeMapId, setActiveTool])

  let parsedPoints: Array<{x: number; y: number}> = []
  if (selected) {
    try { parsedPoints = JSON.parse(selected.polygon) } catch { parsedPoints = [] }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
        <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
          Räume ({mapRooms.length})
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)' }}
          onClick={() => {
            setActiveTool('room')
            setSelectedRoomId(null)
          }}
        >
          📐 Raum zeichnen
        </button>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          Klicke Punkte auf der Karte, Doppelklick zum Abschließen
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {mapRooms.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
            <div className="empty-state-icon" style={{ fontSize: 32 }}>🏠</div>
            <div className="empty-state-title" style={{ fontSize: 'var(--text-sm)' }}>Keine Räume</div>
            <div className="empty-state-desc" style={{ fontSize: 'var(--text-xs)' }}>
              Zeichne Räume auf der Karte mit dem Raum-Werkzeug
            </div>
          </div>
        ) : (
          mapRooms.map((room) => (
            <div
              key={room.id}
              onClick={() => setSelectedRoomId(room.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                padding: 'var(--sp-2) var(--sp-4)',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                background: selectedRoomId === room.id ? 'var(--accent-blue-dim)' : 'transparent',
                borderLeft: selectedRoomId === room.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: room.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {room.name}
              </span>
              <button
                className="btn btn-ghost btn-icon"
                style={{ fontSize: 10, padding: 2, color: 'var(--text-muted)' }}
                onClick={(e) => { e.stopPropagation(); handleCenterOnRoom(room) }}
                title="Auf Karte zentrieren"
              >
                🎯
              </button>
              <button
                className="btn btn-ghost btn-icon"
                style={{ fontSize: 10, padding: 2, color: 'var(--danger)' }}
                onClick={(e) => { e.stopPropagation(); handleDelete(room.id) }}
                title="Raum löschen"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
          maxHeight: '50%',
          overflowY: 'auto',
        }}>
          <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
            {selected.name}
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Name
            </label>
            <input
              type="text"
              value={selected.name}
              onChange={(e) => handleUpdateField(selected.id, 'name', e.target.value)}
              style={{
                width: '100%', fontSize: 'var(--text-xs)', padding: '4px 8px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-primary)',
              }}
            />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Beschreibung
            </label>
            <textarea
              value={selected.description}
              onChange={(e) => handleUpdateField(selected.id, 'description', e.target.value)}
              rows={2}
              style={{
                width: '100%', fontSize: 'var(--text-xs)', padding: '4px 8px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-primary)', resize: 'vertical',
              }}
            />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Sichtbarkeit
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className="btn"
                  style={{
                    fontSize: 'var(--text-xs)',
                    padding: '2px 6px',
                    background: selected.visibility === opt.value ? 'var(--accent-blue-dim)' : undefined,
                    border: selected.visibility === opt.value ? '1px solid var(--accent-blue)' : undefined,
                  }}
                  onClick={() => handleUpdateField(selected.id, 'visibility', opt.value)}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Farbe
            </label>
            <input
              type="color"
              value={selected.color}
              onChange={(e) => handleUpdateField(selected.id, 'color', e.target.value)}
              style={{ width: 32, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer' }}
            />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Encounter
            </label>
            <select
              value={selected.encounterId ?? ''}
              onChange={(e) => handleUpdateField(selected.id, 'encounter_id', e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%', fontSize: 'var(--text-xs)', padding: '4px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-primary)',
              }}
            >
              <option value="">Kein Encounter</option>
              {encounters.map((enc) => (
                <option key={enc.id} value={enc.id}>{enc.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Atmosphäre-Hinweis
            </label>
            <input
              type="text"
              value={selected.atmosphereHint ?? ''}
              onChange={(e) => handleUpdateField(selected.id, 'atmosphere_hint', e.target.value)}
              placeholder="z.B. Musik, Stimmung..."
              style={{
                width: '100%', fontSize: 'var(--text-xs)', padding: '4px 8px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-primary)',
              }}
            />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
              Notizen
            </label>
            <textarea
              value={selected.notes ?? ''}
              onChange={(e) => handleUpdateField(selected.id, 'notes', e.target.value)}
              rows={2}
              style={{
                width: '100%', fontSize: 'var(--text-xs)', padding: '4px 8px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: 3, color: 'var(--text-primary)', resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginBottom: 'var(--sp-2)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              📍 {parsedPoints.length} Eckpunkte
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
              onClick={() => handleRevealRoom(selected)}
              title="Nebel in diesem Raum aufdecken"
            >
              👁 Aufdecken
            </button>
            <button
              className="btn"
              style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
              onClick={() => handleCoverRoom(selected)}
              title="Nebel in diesem Raum zudecken"
            >
              ⬛ Zudecken
            </button>
            {selected.encounterId && (
              <button
                className="btn btn-primary"
                style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                onClick={() => handleSpawnEncounter(selected)}
                title="Verknüpften Encounter spawnen"
              >
                ⚔️ Spawn
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
