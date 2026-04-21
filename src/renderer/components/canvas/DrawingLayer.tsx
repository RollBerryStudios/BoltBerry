import { useState, useEffect, useMemo, useRef, RefObject } from 'react'
import { Layer, Line, Rect, Circle, Text as KonvaText } from 'react-konva'
import { Html } from 'react-konva-utils'
import Konva from 'konva'
import { useUIStore } from '../../stores/uiStore'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'

export type DrawingType = 'freehand' | 'rect' | 'circle' | 'text'

interface Drawing {
  id: number
  type: DrawingType
  points: number[]
  color: string
  width: number
  text?: string
}

interface DrawingLayerProps {
  stageRef: RefObject<Konva.Stage>
  mapId: number
  gridSize: number
}

const DRAWING_TOOLS = new Set<string>(['draw-freehand', 'draw-rect', 'draw-circle', 'draw-text'])

export function DrawingLayer({ stageRef, mapId, gridSize }: DrawingLayerProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const drawColor = useUIStore((s) => s.drawColor)
  const drawWidth = useUIStore((s) => s.drawWidth)
  const drawingClearTick = useUIStore((s) => s.drawingClearTick)
  const scale = useMapTransformStore((s) => s.scale)
  const offsetX = useMapTransformStore((s) => s.offsetX)
  const offsetY = useMapTransformStore((s) => s.offsetY)
  const canvasW = useMapTransformStore((s) => s.canvasW)
  const canvasH = useMapTransformStore((s) => s.canvasH)
  const screenToMap = useMapTransformStore((s) => s.screenToMap)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [currentPath, setCurrentPath] = useState<number[]>([])
  const [loadedMapId, setLoadedMapId] = useState<number | null>(null)
  const [pendingText, setPendingText] = useState<{ screenX: number; screenY: number; mapX: number; mapY: number } | null>(null)
  const [pendingTextValue, setPendingTextValue] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)
  const focusTimerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear any pending focus timer on unmount
  useEffect(() => {
    return () => {
      if (focusTimerIdRef.current != null) {
        clearTimeout(focusTimerIdRef.current)
        focusTimerIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadDrawings(mapId)
      .then((result) => { if (!cancelled) setDrawings(result) })
      .catch((err) => { if (!cancelled) console.error('[DrawingLayer] loadDrawings failed:', err) })
    setLoadedMapId(mapId)
    return () => { cancelled = true }
  }, [mapId])

  // Clear local drawings when the GM triggers a full clear from OverlayPanel
  useEffect(() => {
    if (drawingClearTick > 0) setDrawings([])
  }, [drawingClearTick])

  const isDrawingActive = DRAWING_TOOLS.has(activeTool)

  function getMapPos() {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return screenToMap(pos.x, pos.y)
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!isDrawingActive || e.evt.button !== 0) return
    const pos = getMapPos()
    if (!pos) return

    if (activeTool === 'draw-freehand') {
      setCurrentPath([pos.x, pos.y])
    } else if (activeTool === 'draw-text') {
      const stage = stageRef.current
      const containerRect = stage?.container().getBoundingClientRect()
      const screenPos = stage?.getPointerPosition()
      if (containerRect && screenPos) {
        setPendingText({ screenX: screenPos.x, screenY: screenPos.y, mapX: pos.x, mapY: pos.y })
        setPendingTextValue('')
        if (focusTimerIdRef.current != null) clearTimeout(focusTimerIdRef.current)
        focusTimerIdRef.current = setTimeout(() => {
          textInputRef.current?.focus()
          focusTimerIdRef.current = null
        }, 20)
      }
    } else if (activeTool === 'draw-rect' || activeTool === 'draw-circle') {
      setCurrentPath([pos.x, pos.y, pos.x, pos.y])
    }
  }

  function handleMouseMove() {
    if (!isDrawingActive || currentPath.length === 0) return
    const pos = getMapPos()
    if (!pos) return

    if (activeTool === 'draw-freehand') {
      setCurrentPath([...currentPath, pos.x, pos.y])
    } else if (activeTool === 'draw-rect' || activeTool === 'draw-circle') {
      setCurrentPath([currentPath[0], currentPath[1], pos.x, pos.y])
    }
  }

  function handleMouseUp() {
    if (!isDrawingActive || currentPath.length < 4) { setCurrentPath([]); return }
    // For freehand: need ≥4 values (2 distinct points = actual stroke)
    // For rect/circle: need exactly 4 values (start + end corner), already satisfied by check above

    const type: DrawingType =
      activeTool === 'draw-freehand' ? 'freehand' :
      activeTool === 'draw-rect' ? 'rect' :
      activeTool === 'draw-circle' ? 'circle' : 'freehand'

    addDrawing({ type, points: currentPath, color: drawColor, width: drawWidth })
    setCurrentPath([])
  }

  async function addDrawing(d: { type: DrawingType; points: number[]; color: string; width: number; text?: string }) {
    if (!window.electronAPI) return
    try {
      const pointsStr = JSON.stringify(d.points)
      const result = await window.electronAPI.dbRun(
        'INSERT INTO drawings (map_id, type, points, color, width, text, synced) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [mapId, d.type, pointsStr, d.color, d.width, d.text ?? null]
      )
      // `id` is mutable across undo→redo cycles because each redo
      // writes a new SQLite row (INSERT autoincrements). Keeping the
      // closure variable bound to `currentId` means the follow-up
      // undo deletes whichever row is "current" rather than the
      // orphaned first one.
      let currentId: number = result.lastInsertRowid
      const newDrawing: Drawing = { id: currentId, type: d.type, points: d.points, color: d.color, width: d.width, text: d.text }
      setDrawings(prev => [...prev, newDrawing])
      window.electronAPI?.sendDrawing(newDrawing)

      useUndoStore.getState().pushCommand({
        id: nextCommandId(),
        label: `Zeichnung (${d.type})`,
        undo: async () => {
          await window.electronAPI?.dbRun('DELETE FROM drawings WHERE id = ?', [currentId])
          setDrawings(prev => prev.filter((x) => x.id !== currentId))
          // Re-broadcast the full drawing set so the player window
          // drops the undone stroke. There's no per-drawing delete
          // channel; the clear-tick triggers a usePlayerSync rebuild
          // that re-pushes the remaining drawings in a full-sync.
          useUIStore.getState().incrementDrawingClearTick()
        },
        redo: async () => {
          const r = await window.electronAPI?.dbRun(
            'INSERT INTO drawings (map_id, type, points, color, width, text, synced) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [mapId, d.type, pointsStr, d.color, d.width, d.text ?? null]
          )
          if (!r) return
          currentId = r.lastInsertRowid
          const restored: Drawing = { id: currentId, type: d.type, points: d.points, color: d.color, width: d.width, text: d.text }
          setDrawings(prev => [...prev, restored])
          window.electronAPI?.sendDrawing(restored)
        },
      })
    } catch (err) {
      console.error('[DrawingLayer] addDrawing failed:', err)
    }
  }

  // Memoized rendered nodes: only recompute when drawings or transform changes,
  // not on tool/color/currentPath changes.
  const renderedDrawings = useMemo(() => drawings.map((d) => {
    if (d.type === 'freehand' && d.points.length >= 4) {
      const screenPoints = d.points.flatMap((p, i) => i % 2 === 0 ? p * scale + offsetX : p * scale + offsetY)
      return <Line key={d.id} points={screenPoints} stroke={d.color} strokeWidth={d.width * scale} listening={false} />
    }
    if (d.type === 'rect' && d.points.length >= 4) {
      const x1 = d.points[0] * scale + offsetX
      const y1 = d.points[1] * scale + offsetY
      const x2 = d.points[2] * scale + offsetX
      const y2 = d.points[3] * scale + offsetY
      return <Rect key={d.id} x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        stroke={d.color} strokeWidth={d.width * scale} listening={false} />
    }
    if (d.type === 'circle' && d.points.length >= 4) {
      const cx = d.points[0] * scale + offsetX
      const cy = d.points[1] * scale + offsetY
      const dx = d.points[2] - d.points[0]
      const dy = d.points[3] - d.points[1]
      const radius = Math.sqrt(dx * dx + dy * dy) * scale
      return <Circle key={d.id} x={cx} y={cy} radius={radius}
        stroke={d.color} strokeWidth={d.width * scale} listening={false} />
    }
    if (d.type === 'text' && d.points.length >= 2) {
      const tx = d.points[0] * scale + offsetX
      const ty = d.points[1] * scale + offsetY
      return <KonvaText key={d.id} x={tx} y={ty} text={d.text ?? ''}
        fontSize={14 * scale} fill={d.color} listening={false} />
    }
    return null
  }), [drawings, scale, offsetX, offsetY])

  function renderCurrentPath() {
    if (currentPath.length < 2) return null
    if (activeTool === 'draw-freehand') {
      const screenPoints = currentPath.flatMap((p, i) => i % 2 === 0 ? p * scale + offsetX : p * scale + offsetY)
      return <Line points={screenPoints} stroke={drawColor} strokeWidth={drawWidth * scale} listening={false} />
    }
    if (activeTool === 'draw-rect') {
      const x1 = currentPath[0] * scale + offsetX
      const y1 = currentPath[1] * scale + offsetY
      const x2 = currentPath[2] * scale + offsetX
      const y2 = currentPath[3] * scale + offsetY
      return <Rect x={Math.min(x1, x2)} y={Math.min(y1, y2)}
        width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
        stroke={drawColor} strokeWidth={drawWidth * scale} dash={[4, 3]} listening={false} />
    }
    if (activeTool === 'draw-circle') {
      const cx = currentPath[0] * scale + offsetX
      const cy = currentPath[1] * scale + offsetY
      const dx = currentPath[2] - currentPath[0]
      const dy = currentPath[3] - currentPath[1]
      const radius = Math.sqrt(dx * dx + dy * dy) * scale
      return <Circle x={cx} y={cy} radius={radius}
        stroke={drawColor} strokeWidth={drawWidth * scale} dash={[4, 3]} listening={false} />
    }
    return null
  }

  function commitPendingText() {
    if (!pendingText || !pendingTextValue.trim()) { setPendingText(null); return }
    addDrawing({ type: 'text', points: [pendingText.mapX, pendingText.mapY], color: drawColor, width: drawWidth, text: pendingTextValue.trim() })
    setPendingText(null)
    setPendingTextValue('')
  }

  return (
    <Layer
      listening={isDrawingActive}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Full-canvas transparent hit target. Without this, empty-space
          clicks on the map never bubble to the Layer's onMouseDown since
          every rendered drawing uses listening:false. */}
      {isDrawingActive && (
        <Rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(0,0,0,0.001)" listening />
      )}
      {renderedDrawings}
      {isDrawingActive && renderCurrentPath()}

      {pendingText && (
        <Html divProps={{ style: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' } }}>
          <div style={{ position: 'fixed', left: pendingText.screenX, top: pendingText.screenY, zIndex: 9999, pointerEvents: 'all' }}>
            <input
              ref={textInputRef}
              value={pendingTextValue}
              onChange={(e) => setPendingTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitPendingText() }
                if (e.key === 'Escape') { setPendingText(null) }
              }}
              onBlur={commitPendingText}
              placeholder="Text eingeben…"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent-blue)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
                padding: '3px 8px',
                outline: 'none',
                minWidth: 140,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        </Html>
      )}
    </Layer>
  )
}

async function loadDrawings(mapId: number): Promise<Drawing[]> {
  if (!window.electronAPI) return []
  try {
    const rows = await window.electronAPI.dbQuery<{
      id: number; type: string; points: string; color: string; width: number; text: string | null
    }>('SELECT id, type, points, color, width, text FROM drawings WHERE map_id = ?', [mapId])
    return rows.map((r) => {
      const parsed = JSON.parse(r.points)
      let points: number[]
      let text: string | undefined = r.text ?? undefined
      if (Array.isArray(parsed)) {
        points = parsed
      } else if (parsed != null && typeof parsed === 'object' && parsed.x != null) {
        // Legacy format: text was encoded inside points JSON
        points = [parsed.x as number, parsed.y as number]
        text = text ?? (parsed.text as string | undefined)
      } else {
        points = []
      }
      return { id: r.id, type: r.type as DrawingType, points, color: r.color, width: r.width, text }
    })
  } catch (err) {
    console.error('[DrawingLayer] loadDrawings failed:', err)
    return []
  }
}