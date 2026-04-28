import type { MenuResolver, MenuSection } from './types'
import { registerMenu } from './registry'

/**
 * Drawing right-click menu (Phase 8 §E.Drawing). Drawings had no
 * per-shape menu — only "Clear all drawings" via the canvas menu.
 * Now individual strokes / shapes / text get hide-from-players
 * (toggle the existing `synced` flag) and direct delete.
 */
const drawingResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'drawing') return []
  const d = env.primary.drawing

  const sections: MenuSection[] = [
    {
      id: 'edit',
      items: [
        {
          id: 'edit-text',
          labelKey: 'contextMenu.drawing.editText',
          icon: '✏',
          show: () => d.type === 'text',
          run: () => window.dispatchEvent(new CustomEvent('drawing:edit-text', { detail: { id: d.id } })),
        },
        {
          id: 'toggle-synced',
          labelKey: d.synced
            ? 'contextMenu.drawing.hideFromPlayers'
            : 'contextMenu.drawing.showToPlayers',
          icon: d.synced ? '🙈' : '👁',
          run: () =>
            window.dispatchEvent(
              new CustomEvent('drawing:update', { detail: { id: d.id, patch: { synced: !d.synced } } }),
            ),
        },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'delete',
          labelKey: 'contextMenu.common.delete',
          icon: '🗑',
          danger: true,
          run: () => window.dispatchEvent(new CustomEvent('drawing:delete', { detail: { id: d.id } })),
        },
      ],
    },
  ]

  return sections
}

let registered = false
export function registerDrawingMenu(): void {
  if (registered) return
  registered = true
  registerMenu('drawing', drawingResolver)
}
