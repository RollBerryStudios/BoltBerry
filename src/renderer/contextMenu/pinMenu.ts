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
