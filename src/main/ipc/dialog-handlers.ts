import { ipcMain, dialog, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-types'

/**
 * Native confirm dialogs. The right-click context menu used to live
 * here too (`SHOW_CONTEXT_MENU` + `Menu.popup`) but the Phase 8
 * rollout moved every in-app menu to a shared in-renderer primitive
 * (<ContextMenu>) — the IPC roundtrip is gone, the allowlist is
 * gone, and the only thing left is the OS-level confirm prompts
 * the dialog handlers have always owned.
 */

export function registerDialogHandlers(): void {
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
