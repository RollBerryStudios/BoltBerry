import { ipcMain, dialog, Menu, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-types'

/**
 * Native confirm dialogs + right-click context menu. Extracted from
 * the former `app-handlers.ts` god file per audit AP-1.
 *
 * Context menus are especially sensitive: the renderer sends a list of
 * menu items with `action` strings, and the main process shells out to
 * Electron's native menu. An unbounded allowlist would give a
 * compromised renderer a way to trigger privileged actions by
 * fabricating an `action`. We restrict the set to the exact verbs
 * actually used by the renderer today.
 */

// Action names the renderer is allowed to route through SHOW_CONTEXT_MENU.
// After the Phase 8 context-menu migration, every canvas / entity
// menu renders in-renderer via the shared <ContextMenu> primitive,
// so the only remaining caller is the LeftSidebar map row's right-
// click. Keep the allowlist tight — anything else here would just be
// dead code lying around as a future-confusion vector.
const ALLOWED_CONTEXT_MENU_ACTIONS = new Set<string>([
  'rename', 'delete',
])

export function registerDialogHandlers(): void {
  // Context menu: renderer sends menu items, main process shows native
  // menu and returns selected action. Actions are validated against an
  // allowlist to prevent the renderer from triggering arbitrary strings.
  ipcMain.handle(
    IPC.SHOW_CONTEXT_MENU,
    async (
      event,
      items: Array<{ label: string; action: string; danger?: boolean } | { separator: true }>,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return null

      // Filter items: drop any non-separator entry whose action is not in the allowlist.
      const validatedItems = items.filter((item) => {
        if ('separator' in item) return true
        if (!ALLOWED_CONTEXT_MENU_ACTIONS.has(item.action)) {
          console.warn('[DialogHandlers] SHOW_CONTEXT_MENU: rejected unknown action:', item.action)
          return false
        }
        return true
      })

      return new Promise<string | null>((resolve) => {
        let resolved = false
        const safeResolve = (value: string | null) => {
          if (!resolved) {
            resolved = true
            resolve(value)
          }
        }

        const menuItems = validatedItems.map((item) => {
          if ('separator' in item) return { type: 'separator' as const }
          return {
            label: item.label,
            click: () => safeResolve(item.action),
          }
        })

        const menu = Menu.buildFromTemplate(menuItems)

        // Resolve null on menu close, but defer one microtask so any
        // click handler (which fires before `menu-will-close`) has
        // already called safeResolve.
        menu.once('menu-will-close', () => {
          queueMicrotask(() => safeResolve(null))
        })

        menu.popup({ window: win })
      })
    },
  )

  // Generic confirm dialog
  ipcMain.handle(IPC.CONFIRM_DIALOG, async (event, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      title: 'Bestätigung',
      message,
      detail,
      buttons: ['Abbrechen', 'OK'],
      defaultId: 1,
      cancelId: 0,
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })

  // Delete map (with native confirmation dialog)
  ipcMain.handle(IPC.DELETE_MAP_CONFIRM, async (event, mapName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      title: 'Karte löschen',
      message: `Karte "${mapName}" wirklich löschen?`,
      detail: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: ['Abbrechen', 'Löschen'],
      defaultId: 0,
      cancelId: 0,
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })

  // Delete token (with native confirmation dialog)
  ipcMain.handle(IPC.DELETE_TOKEN_CONFIRM, async (event, tokenName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      title: 'Token löschen',
      message: `Token "${tokenName}" wirklich löschen?`,
      detail: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: ['Abbrechen', 'Löschen'],
      defaultId: 0,
      cancelId: 0,
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })
}
