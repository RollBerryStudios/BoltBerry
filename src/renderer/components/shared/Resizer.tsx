import { useCallback, useEffect, useRef } from 'react'

interface ResizerProps {
  /** Which side of the window the handle lives on — controls drag direction. */
  side: 'left' | 'right'
  /** Current width of the panel being resized, in px. */
  width: number
  /** Called with the new width (in px) as the user drags. Should clamp internally. */
  onResize: (px: number) => void
  /** Accessible label for screen readers. */
  label?: string
}

// Thin vertical handle placed between a sidebar and the canvas.
// For side='left': dragging right increases width (handle is on the right edge of the left sidebar).
// For side='right': dragging left increases width (handle is on the left edge of the right sidebar).
export function Resizer({ side, width, onResize, label }: ResizerProps) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    const next = side === 'left' ? startWidth.current + delta : startWidth.current - delta
    onResize(next)
  }, [side, onResize])

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* noop */ }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  // Double-click resets to a sensible default.
  const onDoubleClick = useCallback(() => {
    onResize(side === 'left' ? 240 : 300)
  }, [side, onResize])

  const STEP = 8
  const MIN_WIDTH = 200
  const MAX_WIDTH = 520

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onResize(width - STEP)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onResize(width + STEP)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onResize(MIN_WIDTH)
    } else if (e.key === 'End') {
      e.preventDefault()
      onResize(MAX_WIDTH)
    }
  }, [width, onResize])

  useEffect(() => {
    // Safety: if the component unmounts mid-drag, clear body cursor.
    return () => {
      if (dragging.current) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [])

  return (
    <div
      className={`sidebar-resizer sidebar-resizer-${side}`}
      role="separator"
      aria-label={label ?? 'Resize sidebar'}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  )
}
