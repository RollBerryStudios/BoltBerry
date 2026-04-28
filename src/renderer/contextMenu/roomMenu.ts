import type { MenuResolver, MenuSection } from './types'
import { registerMenu } from './registry'
import type { RoomVisibility } from '@shared/ipc-types'

/**
 * Room polygon right-click menu (Phase 8 §E.Room). Rooms had no
 * context menu before — DMs had to enter the Room tool, click the
 * polygon, edit from the sidebar. The new menu surfaces the most
 * common verbs (visibility, fog reveal/cover inside, rename, delete)
 * directly under the cursor.
 */
const VISIBILITIES: Array<{ id: RoomVisibility; labelKey: string; icon: string }> = [
  { id: 'hidden',   labelKey: 'contextMenu.room.visHidden',   icon: '🌑' },
  { id: 'dimmed',   labelKey: 'contextMenu.room.visDimmed',   icon: '🌗' },
  { id: 'revealed', labelKey: 'contextMenu.room.visRevealed', icon: '☀' },
]

const roomResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'room') return []
  const room = env.primary.room

  const sections: MenuSection[] = [
    {
      id: 'identity',
      items: [
        {
          id: 'rename',
          labelKey: 'contextMenu.common.rename',
          icon: '✏',
          run: () => window.dispatchEvent(new CustomEvent('room:rename', { detail: { id: room.id } })),
        },
      ],
    },
    {
      id: 'visibility',
      items: [
        {
          id: 'visibility',
          labelKey: 'contextMenu.room.visibility',
          icon: '👁',
          submenu: VISIBILITIES.map((v) => ({
            id: `vis-${v.id}`,
            labelKey: v.labelKey,
            icon: room.visibility === v.id ? '✓' : v.icon,
            run: () =>
              window.dispatchEvent(
                new CustomEvent('room:update', { detail: { id: room.id, patch: { visibility: v.id } } }),
              ),
          })),
        },
      ],
    },
    {
      id: 'fog',
      items: [
        {
          id: 'reveal-fog',
          labelKey: 'contextMenu.room.revealFog',
          icon: '👁',
          run: () =>
            window.dispatchEvent(
              new CustomEvent('fog:action', { detail: { type: 'revealRoom', roomId: room.id } }),
            ),
        },
        {
          id: 'cover-fog',
          labelKey: 'contextMenu.room.coverFog',
          icon: '🌑',
          run: () =>
            window.dispatchEvent(
              new CustomEvent('fog:action', { detail: { type: 'coverRoom', roomId: room.id } }),
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
          run: () => window.dispatchEvent(new CustomEvent('room:delete', { detail: { id: room.id } })),
        },
      ],
    },
  ]

  return sections
}

let registered = false
export function registerRoomMenu(): void {
  if (registered) return
  registered = true
  registerMenu('room', roomResolver)
}
