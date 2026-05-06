import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Circle, Group, Layer, Rect, Text } from 'react-konva'
import { Html } from 'react-konva-utils'
import type { NoteRecord } from '@shared/ipc-types'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { noteCategoryMeta, normalizeNoteIcon, noteMarkerIcon } from '../../notes/categories'
import { showToast } from '../shared/Toast'

type NoteMarker = NoteRecord & { pinX: number; pinY: number }

interface NoteMarkerLayerProps {
  campaignId: number | null
  mapId: number
  visible: boolean
}

interface CreateNoteMarkerDetail {
  x: number
  y: number
  category: string
}

export function NoteMarkerLayer({ campaignId, mapId, visible }: NoteMarkerLayerProps) {
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const [markers, setMarkers] = useState<NoteMarker[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftIcon, setDraftIcon] = useState('')
  const markersRef = useRef(markers)
  markersRef.current = markers

  useEffect(() => {
    if (!campaignId) {
      setMarkers([])
      return
    }
    void loadMarkers(campaignId, mapId).then(setMarkers)
  }, [campaignId, mapId])

  useEffect(() => {
    const onCreate = (ev: Event) => {
      const detail = (ev as CustomEvent<CreateNoteMarkerDetail>).detail
      if (!detail || !campaignId || detail.x == null || detail.y == null) return
      void createMarker(detail)
    }
    const onLookup = (ev: Event) => {
      const detail = (ev as CustomEvent<{ id: number; resolve: (note: NoteRecord | null) => void }>).detail
      detail.resolve(markersRef.current.find((marker) => marker.id === detail.id) ?? null)
    }
    const onEdit = (ev: Event) => {
      const { id } = (ev as CustomEvent<{ id: number }>).detail
      const marker = markersRef.current.find((item) => item.id === id)
      if (marker) startEditing(marker)
    }
    const onDelete = (ev: Event) => {
      const { id } = (ev as CustomEvent<{ id: number }>).detail
      void deleteMarker(id)
    }
    window.addEventListener('note-marker:create', onCreate)
    window.addEventListener('note-marker:lookup', onLookup)
    window.addEventListener('note-marker:edit', onEdit)
    window.addEventListener('note-marker:delete', onDelete)
    return () => {
      window.removeEventListener('note-marker:create', onCreate)
      window.removeEventListener('note-marker:lookup', onLookup)
      window.removeEventListener('note-marker:edit', onEdit)
      window.removeEventListener('note-marker:delete', onDelete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, mapId])

  async function createMarker(detail: CreateNoteMarkerDetail) {
    if (!window.electronAPI || !campaignId) return
    const category = noteCategoryMeta(detail.category)
    try {
      const created = await window.electronAPI.notes.create({
        campaignId,
        mapId,
        category: category.id,
        title: `${category.id}-Marker`,
        content: '',
        pinX: detail.x,
        pinY: detail.y,
        icon: null,
        tags: [category.key],
      })
      if (created.pinX == null || created.pinY == null) return
      setMarkers((prev) => [created as NoteMarker, ...prev])
      showToast('Notizmarker gesetzt', 'success', 2200)
    } catch (err) {
      console.error('[NoteMarkerLayer] create marker failed:', err)
      showToast('Notizmarker konnte nicht gesetzt werden', 'error', 4000)
    }
  }

  async function updateMarker(id: number, patch: Partial<NoteRecord>) {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.notes.update(id, patch)
      setMarkers((prev) => prev.map((marker) => marker.id === id ? { ...marker, ...patch } : marker))
    } catch (err) {
      console.error('[NoteMarkerLayer] update marker failed:', err)
      showToast('Notizmarker konnte nicht gespeichert werden', 'error', 4000)
    }
  }

  async function deleteMarker(id: number) {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.notes.delete(id)
      setMarkers((prev) => prev.filter((marker) => marker.id !== id))
      if (editingId === id) setEditingId(null)
    } catch (err) {
      console.error('[NoteMarkerLayer] delete marker failed:', err)
      showToast('Notizmarker konnte nicht gelöscht werden', 'error', 4000)
    }
  }

  function startEditing(marker: NoteMarker) {
    setEditingId(marker.id)
    setDraftTitle(marker.title)
    setDraftIcon(noteMarkerIcon(marker.category, marker.icon))
  }

  function commitEdit(marker: NoteMarker) {
    const fallbackIcon = noteCategoryMeta(marker.category).icon
    const nextIcon = normalizeNoteIcon(draftIcon)
    void updateMarker(marker.id, {
      title: draftTitle.trim() || marker.title || 'Notizmarker',
      icon: nextIcon && nextIcon !== fallbackIcon ? nextIcon : null,
    })
    setEditingId(null)
  }

  return (
    <Layer visible={visible}>
      {markers.map((marker) => {
        const sx = marker.pinX * scale + offsetX
        const sy = marker.pinY * scale + offsetY
        const meta = noteCategoryMeta(marker.category)
        const icon = noteMarkerIcon(marker.category, marker.icon)
        const title = marker.title || meta.id
        return (
          <Group
            key={marker.id}
            name="note-marker-root"
            id={`note-marker-${marker.id}`}
            x={sx}
            y={sy}
            draggable
            onDragEnd={(e) => {
              const mx = (e.target.x() - offsetX) / scale
              const my = (e.target.y() - offsetY) / scale
              e.target.position({ x: sx, y: sy })
              void updateMarker(marker.id, { pinX: mx, pinY: my })
            }}
            onDblClick={() => startEditing(marker)}
            onDblTap={() => startEditing(marker)}
          >
            <Circle
              x={0}
              y={0}
              radius={15}
              fill={meta.color}
              opacity={0.92}
              stroke="rgba(244,246,250,0.9)"
              strokeWidth={2}
              listening={false}
            />
            <Text x={-8} y={-10} width={16} align="center" text={icon} fontSize={15} listening={false} />
            {editingId !== marker.id && (
              <>
                <Rect
                  x={-Math.min(120, Math.max(42, title.length * 5)) / 2}
                  y={18}
                  width={Math.min(120, Math.max(42, title.length * 5))}
                  height={17}
                  fill="rgba(13,16,21,0.86)"
                  cornerRadius={4}
                  listening={false}
                />
                <Text
                  x={-Math.min(120, Math.max(42, title.length * 5)) / 2 + 5}
                  y={21}
                  width={Math.min(110, Math.max(32, title.length * 5 - 10))}
                  text={title}
                  fontSize={10}
                  fill="#F4F6FA"
                  ellipsis
                  listening={false}
                />
              </>
            )}
            {editingId === marker.id && (
              <Html divProps={{ style: { position: 'absolute', top: 0, left: 0 } }}>
                <div
                  style={{
                    position: 'absolute',
                    left: sx - 88,
                    top: sy + 20,
                    width: 176,
                    display: 'grid',
                    gridTemplateColumns: '38px 1fr',
                    gap: 6,
                    padding: 8,
                    background: '#0D1015',
                    border: '1px solid #f59e0b',
                    borderRadius: 6,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                  }}
                >
                  <input
                    aria-label="Markersymbol"
                    autoFocus
                    value={draftIcon}
                    onChange={(e) => setDraftIcon(Array.from(e.target.value).slice(0, 4).join(''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(marker)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    style={markerEditorInput}
                  />
                  <input
                    aria-label="Markertitel"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(marker)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => commitEdit(marker)}
                    style={markerEditorInput}
                  />
                </div>
              </Html>
            )}
          </Group>
        )
      })}
    </Layer>
  )
}

async function loadMarkers(campaignId: number, mapId: number): Promise<NoteMarker[]> {
  if (!window.electronAPI) return []
  try {
    const rows = await window.electronAPI.notes.listPinnedByMap(campaignId, mapId)
    return rows.filter((row): row is NoteMarker => row.pinX != null && row.pinY != null)
  } catch (err) {
    console.error('[NoteMarkerLayer] load markers failed:', err)
    return []
  }
}

const markerEditorInput: CSSProperties = {
  minWidth: 0,
  height: 30,
  background: '#151922',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 4,
  color: '#F4F6FA',
  fontSize: 12,
  padding: '4px 6px',
  outline: 'none',
  boxSizing: 'border-box',
}
