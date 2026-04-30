import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { createCampaign, importMapAndOpenCanvas, TEST_MAPS } from '../helpers/test-data'

test.describe('Accessibility keyboard coverage', () => {
  test.describe.configure({ timeout: 60_000 })

  test('dashboard create dialog supports keyboard entry, Escape close, and focus return', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible()
      await dmWindow.getByTestId('button-create-campaign').focus()
      await expect(dmWindow.getByTestId('button-create-campaign')).toBeFocused()
      await dmWindow.keyboard.press('Enter')
      await expect(dmWindow.getByTestId('input-campaign-name')).toBeFocused()
      await dmWindow.getByTestId('input-campaign-name').fill('Keyboard Campaign')
      await dmWindow.keyboard.press('Escape')
      await expect(dmWindow.getByTestId('input-campaign-name')).toHaveCount(0)
      await expect(dmWindow.getByTestId('button-create-campaign')).toBeVisible()
    } finally {
      await close()
    }
  })

  test('global settings modal is keyboard reachable and dismissible', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await dmWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
      const dialog = dmWindow.getByRole('dialog', { name: /Einstellungen|Settings/i })
      await expect(dialog).toBeVisible()
      await dmWindow.keyboard.press('Tab')
      const activeInsideDialog = await dmWindow.evaluate(() => {
        const active = document.activeElement
        return !!active?.closest('[role="dialog"]')
      })
      expect(activeInsideDialog).toBe(true)
      await dmWindow.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('canvas toolbars expose keyboard movement and labelled icon controls', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `A11y Keyboard ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.bridge)

      await dmWindow.getByTestId('button-canvas-tool-select').focus()
      await expect(dmWindow.getByTestId('button-canvas-tool-select')).toBeFocused()
      await dmWindow.keyboard.press('ArrowDown')
      const focusedToolChanged = await dmWindow.evaluate(() => document.activeElement?.getAttribute('data-testid'))
      expect(focusedToolChanged).not.toBe('button-canvas-tool-select')

      const unlabeledIconButtons = await dmWindow.getByTestId('toolbar').locator('button').evaluateAll((buttons) =>
        buttons
          .filter((button) => !button.textContent?.trim() && !button.getAttribute('aria-label') && !button.getAttribute('title'))
          .map((button) => button.outerHTML),
      )
      expect(unlabeledIconButtons).toEqual([])

      await dmWindow.getByTestId('canvas-area').focus()
      await expect(dmWindow.getByTestId('canvas-area')).toBeFocused()
      await dmWindow.keyboard.press('?')
      await expect(dmWindow.getByRole('dialog')).toBeVisible()
      await dmWindow.keyboard.press('Escape')
      await expect(dmWindow.getByRole('dialog')).toHaveCount(0)
    } finally {
      await close()
    }
  })
})
