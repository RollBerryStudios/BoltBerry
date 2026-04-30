/**
 * Helpers for intercepting Electron native dialogs.
 *
 * BoltBerry uses ipcMain + dialog.showMessageBox() for confirmation dialogs
 * and dialog.showOpenDialog() for file pickers.  In tests we intercept these
 * at the Electron main-process level using app.evaluate(), which gives us
 * direct access to the dialog module.
 *
 * Usage:
 *   // Before triggering UI action that opens a dialog:
 *   await mockConfirmDialog(app, true)   // auto-accept
 *   await page.click('[title="Kampagne löschen"]')
 */

import type { ElectronApplication } from '@playwright/test'

/**
 * Replace dialog.showMessageBox with a one-shot mock that returns the given
 * button response index.  The original is restored after one call.
 *
 * BoltBerry confirmation dialogs:
 *   - Cancel = button index 0
 *   - OK / Delete / Confirm = button index 1
 */
export async function mockConfirmDialog(
  app: ElectronApplication,
  confirm: boolean,
): Promise<void> {
  const response = confirm ? 1 : 0
  await app.evaluate(
    ({ dialog }, res) => {
      const original = dialog.showMessageBox.bind(dialog)
      // @ts-ignore — override for testing
      dialog.showMessageBox = async (..._args: unknown[]) => {
        // Restore immediately so subsequent real dialogs work
        // @ts-ignore
        dialog.showMessageBox = original
        return { response: res, checkboxChecked: false }
      }
    },
    response,
  )
}

/**
 * Mock dialog.showSaveDialog to return a preset file path without showing UI.
 */
export async function mockSaveDialog(
  app: ElectronApplication,
  filePath: string,
): Promise<void> {
  await app.evaluate(
    ({ dialog }, fp) => {
      const original = dialog.showSaveDialog.bind(dialog)
      // @ts-ignore
      dialog.showSaveDialog = async (..._args: unknown[]) => {
        // @ts-ignore
        dialog.showSaveDialog = original
        return { canceled: false, filePath: fp }
      }
    },
    filePath,
  )
}

/**
 * Mock dialog.showSaveDialog as if the user cancelled the native picker.
 */
export async function mockSaveDialogCancel(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const original = dialog.showSaveDialog.bind(dialog)
    // @ts-ignore
    dialog.showSaveDialog = async (..._args: unknown[]) => {
      // @ts-ignore
      dialog.showSaveDialog = original
      return { canceled: true, filePath: undefined }
    }
  })
}

/**
 * Mock dialog.showOpenDialog to return preset file paths without showing UI.
 */
export async function mockOpenDialog(
  app: ElectronApplication,
  filePaths: string[],
): Promise<void> {
  await app.evaluate(
    ({ dialog }, fps) => {
      const original = dialog.showOpenDialog.bind(dialog)
      // @ts-ignore
      dialog.showOpenDialog = async (..._args: unknown[]) => {
        // @ts-ignore
        dialog.showOpenDialog = original
        return { canceled: false, filePaths: fps }
      }
    },
    filePaths,
  )
}

/**
 * Mock dialog.showOpenDialog as if the user cancelled the native picker.
 */
export async function mockOpenDialogCancel(
  app: ElectronApplication,
): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const original = dialog.showOpenDialog.bind(dialog)
    // @ts-ignore
    dialog.showOpenDialog = async (..._args: unknown[]) => {
      // @ts-ignore
      dialog.showOpenDialog = original
      return { canceled: true, filePaths: [] }
    }
  })
}
