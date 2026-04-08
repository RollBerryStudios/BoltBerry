import { useState, RefObject } from 'react'
import { Layer, Group, Text, Circle, Rect } from 'react-konva'
import { Html } from 'react-konva-utils'
import Konva from 'konva'
import { useMapTransformStore } from '../../stores/mapTransformStore'

interface GMPin {
  id: number
  x: number
  y: number
  label: string
  icon: string
  color: string
}

interface GMPinLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

export function GMPinLayer({ stageRef, mapId, gridSize }: GMPinLayerProps) {
  const { scale, offsetX, offsetY } = useMapTransformStore()
  const [pins, setPins] = useState<GMPin[]>([])
  const [editingPinId, setEditingPinId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [loadedMapId, setLoadedMapId] = useState<number | null>(null)

  if (mapId !== loadedMapId) {
    setLoadedMapId(mapId)
    loadPins(mapId).then(setPins)
  }

  async function handleAddPin(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button !== 2) return
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const mx = (pos.x - offsetX) / scale
    const my = (pos.y - offsetY) / scale

    try {
      const result = await window.electronAPI?.dbRun(
        'INSERT INTO gm_pins (map_id, x, y, label, icon, color) VALUES (?, ?, ?, ?, ?, ?)',
        [mapId, mx, my, '', '📌', '#f59e0b']
      )
      if (result) {
        setPins([...pins, { id: result.lastInsertRowid, x: mx, y: my, label: '', icon: '📌', color: '#f59e0b' }])
      }
    } catch (err) {
      console.error('[GMPinLayer] add pin failed:', err)
    }
  }

  async function handleDeletePin(id: number) {
    try {
      await window.electronAPI?.dbRun('DELETE FROM gm_pins WHERE id = ?', [id])
      setPins(pins.filter((p) => p.id !== id))
    } catch (err) {
      console.error('[GMPinLayer] delete pin failed:', err)
    }
  }

  async function handleUpdateLabel(id: number, label: string) {
    try {
      await window.electronAPI?.dbRun('UPDATE gm_pins SET label = ? WHERE id = ?', [label, id])
      setPins(pins.map((p) => (p.id === id ? { ...p, label } : p)))
    } catch (err) {
      console.error('[GMPinLayer] update label failed:', err)
    }
    setEditingPinId(null)
  }

  return (
    <Layer onContextMenu={handleAddPin}>
      {pins.map((pin) => {
        const sx = pin.x * scale + offsetX
        const sy = pin.y * scale + offsetY
        return (
          <Group key={pin.id} x={sx} y={sy} draggable
            onDragEnd={async (e) => {
              const mx = (e.target.x() - offsetX) / scale
              const my = (e.target.y() - offsetY) / scale
              e.target.position({ x: sx, y: sy })
              setPins(pins.map((p) => (p.id === pin.id ? { ...p, x: mx, y: my } : p)))
              try {
                await window.electronAPI?.dbRun('UPDATE gm_pins SET x = ?, y = ? WHERE id = ?', [mx, my, pin.id])
              } catch (err) {
                console.error('[GMPinLayer] drag failed:', err)
              }
            }}
            onDblClick={() => {
              setEditingPinId(pin.id)
              setEditingLabel(pin.label)
            }}
          >
            <Circle x={0} y={0} radius={14} fill={pin.color} opacity={0.85} listening={false} />
            <Text x={-7} y={-9} text={pin.icon} fontSize={14} listening={false} />
            {pin.label && !editingPinId && (
              <Rect x={-pin.label.length * 3} y={16} width={pin.label.length * 6 + 8} height={16}
                fill="rgba(13,16,21,0.85)" cornerRadius={3} listening={false} />
            )}
            {pin.label && !editingPinId && (
              <Text x={-pin.label.length * 3 + 4} y={18} text={pin.label} fontSize={10}
                fill="#F4F6FA" listening={false} />
            )}
            {editingPinId === pin.id && (
              <Html divProps={{ style: { position: 'absolute', top: 0, left: 0 } }}>
                <input
                  autoFocus
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateLabel(pin.id, editingLabel)
                    if (e.key === 'Escape') setEditingPinId(null)
                  }}
                  onBlur={() => handleUpdateLabel(pin.id, editingLabel)}
                  style={{
                    position: 'absolute', left: sx - 30, top: sy + 20, width: 100,
                    background: '#0D1015', border: '1px solid #f59e0b', borderRadius: 4,
                    color: '#F4F6FA', fontSize: 11, padding: '2px 6px', outline: 'none',
                  }}
                />
              </Html>
            )}
          </Group>
        )
      })}
    </Layer>
  )
}

async function loadPins(mapId: number): Promise<GMPin[]> {
  if (!window.electronAPI) return []
  try {
    const rows = await window.electronAPI.dbQuery<{
      id: number; map_id: number; x: number; y: number; label: string; icon: string; color: string
    }>('SELECT id, map_id, x, y, label, icon, color FROM gm_pins WHERE map_id = ?', [mapId])
    return rows.map((r) => ({ id: r.id, x: r.x, y: r.y, label: r.label, icon: r.icon, color: r.color }))
  } catch (err) {
    console.error('[GMPinLayer] loadPins failed:', err)
    return []
  }
}