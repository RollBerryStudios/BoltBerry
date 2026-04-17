import { useState, useEffect, useCallback, RefObject } from 'react'
import { Layer, Group, Text, Circle, Rect } from 'react-konva'
import Konva from 'konva'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useUIStore } from '../../stores/uiStore'

// ── Event names (exported so other modules can dispatch them) ─────────────────

export const NOTE_OPEN_EVENT    = 'note:open'      // → { noteId: number }
export const NOTE_NEW_PIN_EVENT = 'note:new-pin'   // → { x, y, campaignId }
export const NOTE_REFRESH_EVENT = 'note:refresh'   // → (no detail)
export const NOTE_PIN_MODE_EVENT = 'note:enter-pin-mode' // → { noteId: number }

// ── Local type ────────────────────────────────────────────────────────────────

interface NotePin {
  id: number
  title: string
  pinX: number
  pinY: number
}

interface NoteLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
}

// ── NoteLayer ─────────────────────────────────────────────────────────────────

export function NoteLayer({ stageRef, mapId }: NoteLayerProps) {
  const scale   = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)

  const [pins, setPins]             = useState<NotePin[]>([])
  const [pinMode, setPinMode]       = useState(false)
  const [pinNoteId, setPinNoteId]   = useState<number | null>(null)

  // ── Load pins from DB ──────────────────────────────────────────────────────

  const loadPins = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const rows = await window.electronAPI.dbQuery<{
        id: number; title: string; pin_x: number; pin_y: number
      }>(
        `SELECT id, title, pin_x, pin_y FROM notes
         WHERE map_id = ? AND pin_x IS NOT NULL AND pin_y IS NOT NULL`,
        [mapId]
      )
      setPins(rows.map((r) => ({ id: r.id, title: r.title, pinX: r.pin_x, pinY: r.pin_y })))
    } catch (err) {
      console.error('[NoteLayer] loadPins failed:', err)
    }
  }, [mapId])

  useEffect(() => { loadPins() }, [loadPins])

  // ── Listen for external refresh ────────────────────────────────────────────

  useEffect(() => {
    const handler = () => loadPins()
    window.addEventListener(NOTE_REFRESH_EVENT, handler)
    return () => window.removeEventListener(NOTE_REFRESH_EVENT, handler)
  }, [loadPins])

  // ── Listen for "new pin" event (from canvas context menu) ──────────────────

  const handleNewPin = useCallback(async (
    e: CustomEvent<{ x: number; y: number; campaignId: number }>
  ) => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.dbRun(
        `INSERT INTO notes (campaign_id, map_id, category, title, content, pin_x, pin_y, updated_at)
         VALUES (?, ?, 'Allgemein', 'Neue Notiz', '', ?, ?, datetime('now'))`,
        [e.detail.campaignId, mapId, e.detail.x, e.detail.y]
      )
      const newPin: NotePin = {
        id: result.lastInsertRowid,
        title: 'Neue Notiz',
        pinX: e.detail.x,
        pinY: e.detail.y,
      }
      setPins((prev) => [...prev, newPin])
      // Switch to Notes panel and open the new note
      useUIStore.getState().setSidebarTab('notes')
      window.dispatchEvent(new CustomEvent(NOTE_OPEN_EVENT, { detail: { noteId: result.lastInsertRowid } }))
    } catch (err) {
      console.error('[NoteLayer] handleNewPin failed:', err)
    }
  }, [mapId])

  useEffect(() => {
    window.addEventListener(NOTE_NEW_PIN_EVENT, handleNewPin as EventListener)
    return () => window.removeEventListener(NOTE_NEW_PIN_EVENT, handleNewPin as EventListener)
  }, [handleNewPin])

  // ── Listen for "enter pin mode" (from NotesPanel "Auf Karte setzen") ────────

  useEffect(() => {
    const handler = (e: CustomEvent<{ noteId: number }>) => {
      setPinNoteId(e.detail.noteId)
      setPinMode(true)
    }
    window.addEventListener(NOTE_PIN_MODE_EVENT, handler as EventListener)
    return () => window.removeEventListener(NOTE_PIN_MODE_EVENT, handler as EventListener)
  }, [])

  // ESC cancels pin-placement mode
  useEffect(() => {
    if (!pinMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPinMode(false); setPinNoteId(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pinMode])

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handlePlacePin(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!pinMode || pinNoteId == null || !window.electronAPI) return
    const pos = stageRef.current?.getPointerPosition()
    if (!pos) return
    const mapPos = useMapTransformStore.getState().screenToMap(pos.x, pos.y)
    try {
      await window.electronAPI.dbRun(
        'UPDATE notes SET pin_x = ?, pin_y = ? WHERE id = ?',
        [mapPos.x, mapPos.y, pinNoteId]
      )
      setPins((prev) => {
        const existing = prev.find((p) => p.id === pinNoteId)
        if (existing) {
          return prev.map((p) => p.id === pinNoteId ? { ...p, pinX: mapPos.x, pinY: mapPos.y } : p)
        }
        return [...prev, { id: pinNoteId, title: '', pinX: mapPos.x, pinY: mapPos.y }]
      })
      window.dispatchEvent(new CustomEvent(NOTE_REFRESH_EVENT))
    } catch (err) {
      console.error('[NoteLayer] place pin failed:', err)
    }
    setPinMode(false)
    setPinNoteId(null)
    e.cancelBubble = true
  }

  async function handleRemovePin(id: number) {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.dbRun('UPDATE notes SET pin_x = NULL, pin_y = NULL WHERE id = ?', [id])
      setPins((prev) => prev.filter((p) => p.id !== id))
      window.dispatchEvent(new CustomEvent(NOTE_REFRESH_EVENT))
    } catch (err) {
      console.error('[NoteLayer] remove pin failed:', err)
    }
  }

  async function handleDeleteNote(id: number) {
    if (!window.electronAPI) return
    // Note delete is irreversible today — the body is dropped too. Ask
    // before we drop it. (Follow-up: wire into undo stack so the note
    // can be restored from a session-local buffer.)
    const ok = await window.electronAPI.confirmDialog(
      'Notiz löschen?',
      'Die Notiz wird dauerhaft entfernt.',
    )
    if (!ok) return
    try {
      await window.electronAPI.dbRun('DELETE FROM notes WHERE id = ?', [id])
      setPins((prev) => prev.filter((p) => p.id !== id))
      window.dispatchEvent(new CustomEvent(NOTE_REFRESH_EVENT))
    } catch (err) {
      console.error('[NoteLayer] delete note failed:', err)
    }
  }

  function openNote(noteId: number) {
    useUIStore.getState().setSidebarTab('notes')
    window.dispatchEvent(new CustomEvent(NOTE_OPEN_EVENT, { detail: { noteId } }))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layer onContextMenu={(e) => e.evt.preventDefault()}>

      {/* Pin-placement capture overlay */}
      {pinMode && (
        <Rect
          x={0} y={0} width={9999} height={9999}
          fill="transparent"
          onClick={handlePlacePin}
          onTap={handlePlacePin}
          style={{ cursor: 'crosshair' }}
        />
      )}

      {pins.map((pin) => {
        const sx = pin.pinX * scale + offsetX
        const sy = pin.pinY * scale + offsetY
        const labelW = Math.max(pin.title.length * 6 + 12, 40)

        return (
          <Group
            key={pin.id}
            x={sx} y={sy}
            draggable
            onDragEnd={async (e) => {
              const mx = (e.target.x() - offsetX) / scale
              const my = (e.target.y() - offsetY) / scale
              e.target.position({ x: sx, y: sy })
              setPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, pinX: mx, pinY: my } : p))
              try {
                await window.electronAPI?.dbRun(
                  'UPDATE notes SET pin_x = ?, pin_y = ? WHERE id = ?',
                  [mx, my, pin.id]
                )
              } catch (err) {
                console.error('[NoteLayer] drag update failed:', err)
              }
            }}
            onDblClick={() => openNote(pin.id)}
            onDblTap={() => openNote(pin.id)}
            onContextMenu={async (e) => {
              e.evt.preventDefault()
              e.cancelBubble = true
              if (!window.electronAPI) return
              const action = await window.electronAPI.showContextMenu([
                { label: 'Notiz öffnen', action: 'open' },
                { label: 'Pin entfernen', action: 'remove-pin' },
                { separator: true },
                { label: 'Notiz löschen', action: 'delete', danger: true },
              ])
              if (action === 'open')        openNote(pin.id)
              else if (action === 'remove-pin') handleRemovePin(pin.id)
              else if (action === 'delete') handleDeleteNote(pin.id)
            }}
          >
            {/* Backdrop circle */}
            <Circle
              x={0} y={0} radius={14}
              fill="rgba(20,30,70,0.88)"
              stroke="#5580ff"
              strokeWidth={1.5}
              listening={false}
            />
            {/* 📝 icon */}
            <Text x={-8} y={-9} text="📝" fontSize={14} listening={false} />

            {/* Title tooltip below pin */}
            {pin.title && pin.title !== 'Neue Notiz' && (
              <>
                <Rect
                  x={-labelW / 2} y={18}
                  width={labelW} height={16}
                  fill="rgba(13,16,21,0.88)"
                  cornerRadius={3}
                  listening={false}
                />
                <Text
                  x={-labelW / 2 + 4} y={20}
                  text={pin.title}
                  fontSize={10}
                  fill="#e0e8ff"
                  listening={false}
                />
              </>
            )}
          </Group>
        )
      })}
    </Layer>
  )
}
