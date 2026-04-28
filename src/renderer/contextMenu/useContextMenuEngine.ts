import { useCallback, useState } from 'react'
import type { ContextEnvelope, ContextTarget } from './types'

/**
 * Opens / closes the global context menu. Callers (CanvasArea, sidebar
 * row components, etc.) hand the engine a primary target + click
 * coords; the engine fills in `closeMenu` and stores the envelope.
 *
 * Hit-testing for layered targets (the "under" list) is the caller's
 * job — they have direct access to the Konva stage and the entity
 * stores. The engine only owns the open/close state + the resolved
 * menu spec, so it can stay agnostic about which entity layers exist.
 */
export interface ContextMenuEngine {
  envelope: ContextEnvelope | null
  open: (input: {
    primary: ContextTarget
    under?: ContextTarget[]
    pos?: { x: number; y: number }
    scenePos: { x: number; y: number }
  }) => void
  close: () => void
}

export function useContextMenuEngine(): ContextMenuEngine {
  const [envelope, setEnvelope] = useState<ContextEnvelope | null>(null)

  const close = useCallback(() => {
    setEnvelope(null)
  }, [])

  const open = useCallback<ContextMenuEngine['open']>((input) => {
    setEnvelope({
      primary: input.primary,
      under: input.under ?? [],
      pos: input.pos ?? { x: 0, y: 0 },
      scenePos: input.scenePos,
      closeMenu: close,
    })
  }, [close])

  return { envelope, open, close }
}
