import { useState, useEffect, useCallback, useRef, RefObject } from 'react'
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

export const GM_PIN_ADD_EVENT = 'gm-pin-add'

export function GMPinLayer({ stageRef, mapId, gridSize }: GMPinLayerProps) {
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const [pins, setPins] = useState<GMPin[]>([])
  const [editingPinId, setEditingPinId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null)
  const selectedPinIdRef = useRef<number | null>(null)
  selectedPinIdRef.current = selectedPinId
  const [loadedMapId, setLoadedMapId] = useState<number | null>(null)

  useEffect(() => {
    if (mapId !== loadedMapId) {
      setLoadedMapId(mapId)
      loadPins(mapId).then(setPins)
    }
  }, [mapId, loadedMapId])

  const addPinAt = useCallback(async (mx: number, my: number) => {
    try {
      const result = await window.electronAPI?.dbRun(
        'INSERT INTO gm_pins (map_id, x, y, label, icon, color) VALUES (?, ?, ?, ?, ?, ?)',
        [mapId, mx, my, '', '📌', '#f59e0b']
      )
      if (result) {
        setPins(prev => [...prev, { id: result.lastInsertRowid, x: mx, y: my, label: '', icon: '📌', color: '#f59e0b' }])
      }
    } catch (err) {
      console.error('[GMPinLayer] add pin failed:', err)
    }
  }, [mapId])

  useEffect(() => {
    const handler = (e: CustomEvent<{ x: number; y: number }>) => {
      addPinAt(e.detail.x, e.detail.y)
    }
    window.addEventListener(GM_PIN_ADD_EVENT, handler as EventListener)
    return () => window.removeEventListener(GM_PIN_ADD_EVENT, handler as EventListener)
  }, [addPinAt])

  // Use ref so we don't re-register the listener on every pin selection change
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedPinIdRef.current !== null) {
        handleDeletePin(selectedPinIdRef.current)
        setSelectedPinId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleDeletePin(id: number) {
    try {
      await window.electronAPI?.dbRun('DELETE FROM gm_pins WHERE id = ?', [id])
      setPins(prev => prev.filter((p) => p.id !== id))
    } catch (err) {
      console.error('[GMPinLayer] delete pin failed:', err)
    }
  }

  async function handleUpdateLabel(id: number, label: string) {
    try {
      await window.electronAPI?.dbRun('UPDATE gm_pins SET label = ? WHERE id = ?', [label, id])
      setPins(prev => prev.map((p) => (p.id === id ? { ...p, label } : p)))
    } catch (err) {
      console.error('[GMPinLayer] update label failed:', err)
    }
    setEditingPinId(null)
  }

  return (
    <Layer onContextMenu={(e) => e.evt.preventDefault()}>
      {pins.map((pin) => {
        const sx = pin.x * scale + offsetX
        const sy = pin.y * scale + offsetY
        return (
          <Group key={pin.id} x={sx} y={sy} draggable
            onDragEnd={async (e) => {
              const mx = (e.target.x() - offsetX) / scale
              const my = (e.target.y() - offsetY) / scale
              e.target.position({ x: sx, y: sy })
              setPins(prev => prev.map((p) => (p.id === pin.id ? { ...p, x: mx, y: my } : p)))
              try {
                await window.electronAPI?.dbRun('UPDATE gm_pins SET x = ?, y = ? WHERE id = ?', [mx, my, pin.id])
              } catch (err) {
                console.error('[GMPinLayer] drag failed:', err)
              }
            }}
            onClick={() => setSelectedPinId(pin.id)}
            onTap={() => setSelectedPinId(pin.id)}
            onContextMenu={async (e) => {
              e.evt.preventDefault()
              e.cancelBubble = true
              if (!window.electronAPI) return
              const action = await window.electronAPI.showContextMenu([
                { label: 'Pin löschen', action: 'delete', danger: true },
                { label: 'Label bearbeiten', action: 'edit' },
              ])
              if (action === 'delete') handleDeletePin(pin.id)
              else if (action === 'edit') {
                setEditingPinId(pin.id)
                setEditingLabel(pin.label)
              }
            }}
            onDblClick={() => {
              setEditingPinId(pin.id)
              setEditingLabel(pin.label)
            }}
          >
            <Circle x={0} y={0} radius={14} fill={pin.color} opacity={0.85} listening={false}
              stroke={selectedPinId === pin.id ? '#F4F6FA' : undefined}
              strokeWidth={selectedPinId === pin.id ? 2 : 0}
            />
            <Text x={-7} y={-9} text={pin.icon} fontSize={14} listening={false} />
            {pin.label && editingPinId !== pin.id && (
              <Rect x={-pin.label.length * 3} y={16} width={pin.label.length * 6 + 8} height={16}
                fill="rgba(13,16,21,0.85)" cornerRadius={3} listening={false} />
            )}
            {pin.label && editingPinId !== pin.id && (
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