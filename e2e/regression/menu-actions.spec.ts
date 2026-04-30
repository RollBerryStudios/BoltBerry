import { test, expect, type ElectronApplication } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'

async function clickMenuItem(app: ElectronApplication, labels: RegExp[]) {
  const clicked = await app.evaluate(({ Menu, BrowserWindow }, sources) => {
    const menu = Menu.getApplicationMenu()
    const regexes = sources.map((source) => new RegExp(source, 'i'))
    const walk = (items: any[]): any | null => {
      for (const item of items) {
        if (item.label && regexes.some((re) => re.test(item.label))) return item
        const found = item.submenu ? walk(item.submenu.items) : null
        if (found) return found
      }
      return null
    }
    const item = menu ? walk(menu.items) : null
    if (!item || !item.click) return false
    const focused = BrowserWindow.getFocusedWindow() ?? undefined
    item.click(undefined as any, focused as any, undefined as any)
    return true
  }, labels.map((re) => re.source))
  expect(clicked).toBe(true)
}

test.describe('Native menu actions', () => {
  test.describe.configure({ timeout: 60_000 })

  test('Neue Kampagne opens the create campaign dialog', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await clickMenuItem(app, [/Neue Kampagne|New Campaign/])
      await expect(dmWindow.getByTestId('dialog-create-campaign')).toBeVisible()
      await expect(dmWindow.getByTestId('input-campaign-name')).toBeFocused()
    } finally {
      await close()
    }
  })

  test('Einstellungen opens the settings modal', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await clickMenuItem(app, [/Einstellungen|Settings/])
      await expect(dmWindow.getByRole('dialog', { name: /Einstellungen|Settings/i })).toBeVisible()
    } finally {
      await close()
    }
  })

  test('Über BoltBerry opens the About dialog', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await clickMenuItem(app, [/Über BoltBerry|About BoltBerry/])
      await expect(dmWindow.getByTestId('dialog-about')).toBeVisible()
    } finally {
      await close()
    }
  })

  test('Kampagne exportieren dispatches the export flow for the active campaign', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await dmWindow.getByTestId('button-create-campaign').click()
      await dmWindow.getByTestId('input-campaign-name').fill(`Menu Export ${Date.now()}`)
      await dmWindow.getByTestId('button-confirm-create-campaign').click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })

      await app.evaluate(({ dialog }) => {
        ;(globalThis as any).__boltberryE2eSaveDialogCalls = 0
        const original = dialog.showSaveDialog.bind(dialog)
        ;(dialog as any).showSaveDialog = async (..._args: unknown[]) => {
          ;(globalThis as any).__boltberryE2eSaveDialogCalls += 1
          ;(dialog as any).showSaveDialog = original
          return { canceled: true, filePath: undefined }
        }
      })

      await clickMenuItem(app, [/Kampagne exportieren|Export Campaign/])
      await expect.poll(() => app.evaluate(() => (globalThis as any).__boltberryE2eSaveDialogCalls ?? 0)).toBe(1)
    } finally {
      await close()
    }
  })
})
