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

  test('pressing ? opens the ShortcutOverlay', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Press ? key on the body (not in an input)
      await dmWindow.keyboard.press('?')

      // ShortcutOverlay should appear — it is rendered conditionally
      // Look for a heading or element containing shortcut info
      const overlay = dmWindow.locator('[class*="shortcut"], [class*="Shortcut"], [class*="overlay"]').first()
      await expect(overlay).toBeVisible({ timeout: 3_000 })
    } finally {
      await close()
    }
  })

  test('pressing F1 toggles the ShortcutOverlay', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await new StartScreenPage(dmWindow).waitFor()

      // Open
      await dmWindow.keyboard.press('F1')
      const overlay = dmWindow.locator('[class*="shortcut"], [class*="Shortcut"], [class*="overlay"]').first()
      await expect(overlay).toBeVisible({ timeout: 3_000 })

      // Close by pressing F1 again (toggle)
      await dmWindow.keyboard.press('F1')
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
      await dmWindow.keyboard.press('?')
      const overlay = dmWindow.locator('[class*="shortcut"], [class*="Shortcut"], [class*="overlay"]').first()
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
      const input = dmWindow.locator('input.input').last()
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
