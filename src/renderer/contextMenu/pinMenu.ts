import type { MenuResolver, MenuSection } from './types'
import { registerMenu } from './registry'

/**
 * GM Pin right-click menu (Phase 8 §E.GMPin). Replaces the native
 * Electron Menu.popup wired in GMPinLayer.tsx. The pin layer stays
 * the IPC owner; this menu emits CustomEvents so the existing
 * onContextMenu code path can subscribe.
 */
const pinResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'pin') return []
  const pin = env.primary.pin
  const selection = env.primary.selection
  const isMulti = selection.length > 1

  if (isMulti) {
    return [
      {
        id: 'multi-destructive',
        headerKey: 'contextMenu.pin.multiHeader',
        headerValues: { count: selection.length },
        items: [
          {
            id: 'delete-many',
            labelKey: 'contextMenu.pin.deleteMany',
            icon: '🗑',
            danger: true,
            run: () =>
              window.dispatchEvent(new CustomEvent('pin:delete-many', { detail: { ids: selection } })),
          },
        ],
      },
    ]
  }

  const sections: MenuSection[] = [
    {
      id: 'edit',
      items: [
        {
          id: 'edit-label',
          labelKey: 'contextMenu.pin.editLabel',
          icon: '✏',
          run: () => window.dispatchEvent(new CustomEvent('pin:edit-label', { detail: { id: pin.id } })),
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
          run: () => window.dispatchEvent(new CustomEvent('pin:delete', { detail: { id: pin.id } })),
        },
      ],
    },
  ]

  return sections
}

let registered = false
export function registerPinMenu(): void {
  if (registered) return
  registered = true
  registerMenu('pin', pinResolver)
}
