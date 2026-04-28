import type { MenuResolver, MenuSection } from './types'
import { registerMenu } from './registry'

/**
 * Wall right-click menu (Phase 8 §E.Wall). Replaces WallLayer's
 * inline HTML overlay so visual + keyboard behaviour matches every
 * other right-click in the app. The wall layer still owns the
 * mutation IPC; menu items dispatch via window CustomEvents so the
 * Layer subscribes once and stays the source of truth on
 * wall-store updates.
 */
const WALL_TYPES: Array<{ id: 'wall' | 'door' | 'window'; labelKey: string; icon: string }> = [
  { id: 'wall',   labelKey: 'contextMenu.wall.typeWall',   icon: '▍' },
  { id: 'door',   labelKey: 'contextMenu.wall.typeDoor',   icon: '🚪' },
  { id: 'window', labelKey: 'contextMenu.wall.typeWindow', icon: '🪟' },
]

const wallResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'wall') return []
  const wall = env.primary.wall

  const sections: MenuSection[] = [
    {
      id: 'type',
      items: [
        {
          id: 'type',
          labelKey: 'contextMenu.wall.type',
          icon: '🔄',
          submenu: WALL_TYPES.map((t) => ({
            id: `type-${t.id}`,
            labelKey: t.labelKey,
            icon: wall.wallType === t.id ? '✓' : t.icon,
            run: () => {
              window.dispatchEvent(
                new CustomEvent('wall:update', { detail: { id: wall.id, patch: { wallType: t.id } } }),
              )
            },
          })),
        },
        {
          id: 'door-state',
          labelKey: wall.doorState === 'open' ? 'contextMenu.wall.closeDoor' : 'contextMenu.wall.openDoor',
          icon: wall.doorState === 'open' ? '🔒' : '🔓',
          show: () => wall.wallType === 'door' || wall.wallType === 'window',
          run: () => {
            window.dispatchEvent(
              new CustomEvent('wall:update', {
                detail: {
                  id: wall.id,
                  patch: { doorState: wall.doorState === 'open' ? 'closed' : 'open' },
                },
              }),
            )
          },
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
          run: () => {
            window.dispatchEvent(new CustomEvent('wall:delete', { detail: { id: wall.id } }))
          },
        },
      ],
    },
  ]

  return sections
}

let registered = false
export function registerWallMenu(): void {
  if (registered) return
  registered = true
  registerMenu('wall', wallResolver)
}
