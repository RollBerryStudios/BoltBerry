/**
 * REGRESSION: Keyboard shortcuts
 *
 * BoltBerry registers global keyboard shortcuts in useKeyboardShortcuts.ts.
 * These tests verify that key bindings fire the correct UI effects.
 *
 * Tested shortcuts (subset — extend as features grow):
 *  ? / F1  → open/close ShortcutOverlay
 *  Escape  → close ShortcutOverlay
 *
 * Group: regression
 */

import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { StartScreenPage } from '../helpers/page-objects'

test.describe('Keyboard shortcuts', () => {
  async function pressAppShortcut(page: import('@playwright/test').Page, key: string): Promise<void> {
    await page.evaluate((shortcutKey) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: shortcutKey, bubbles: true, cancelable: true }))
    }, key)
  }

  function shortcutDialog(page: import('@playwright/test').Page) {
    return page.getByRole('dialog', { name: /Tastenkürzel|Keyboard Shortcuts/i })
  }

  test('pressing ? opens the ShortcutOverlay', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Press ? key on the body (not in an input)
      await pressAppShortcut(dmWindow, '?')

      await expect(shortcutDialog(dmWindow)).toBeVisible({ timeout: 3_000 })
    } finally {
      await close()
    }
  })

  test('pressing F1 toggles the ShortcutOverlay', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await new StartScreenPage(dmWindow).waitFor()

      // Open
      await pressAppShortcut(dmWindow, 'F1')
      const overlay = shortcutDialog(dmWindow)
      await expect(overlay).toBeVisible({ timeout: 3_000 })

      await pressAppShortcut(dmWindow, 'F1')
      await expect(overlay).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await close()
    }
  })

  test('pressing Escape closes the ShortcutOverlay', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await new StartScreenPage(dmWindow).waitFor()

      // Open overlay
      await pressAppShortcut(dmWindow, '?')
      const overlay = shortcutDialog(dmWindow)
      await expect(overlay).toBeVisible({ timeout: 3_000 })

      // Close with Escape
      await dmWindow.keyboard.press('Escape')
      await expect(overlay).not.toBeVisible({ timeout: 3_000 })
    } finally {
      await close()
    }
  })

  test('shortcut keys are ignored while an input is focused', async () => {
    // App.tsx skips shortcut if tag === 'INPUT' or 'TEXTAREA'
    const { dmWindow, close } = await launchApp()

    try {
      await new StartScreenPage(dmWindow).waitFor()

      // Open the campaign name input
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.clickNewCampaign()
      const input = dmWindow.getByPlaceholder(/Kampagnen-Name/i)
      await expect(input).toBeFocused()

      // Pressing ? while focused on input should NOT open the overlay
      await input.press('?')
      const overlay = dmWindow.locator('[class*="shortcut"], [class*="Shortcut"]').first()
      await expect(overlay).not.toBeVisible({ timeout: 1_500 })
    } finally {
      await close()
    }
  })
})
