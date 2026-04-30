/**
 * SMOKE: StartScreen rendering and basic campaign list
 *
 * Verifies that after a successful app launch (SetupWizard bypassed), the
 * StartScreen renders correctly with the logo, tagline, and empty-state.
 *
 * Group: smoke
 */

import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { StartScreenPage } from '../helpers/page-objects'

test.describe('StartScreen', () => {

  test('renders the BoltBerry logo', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await expect(dmWindow.getByText(/BOLTBERRY/i).first()).toBeVisible()
    } finally {
      await close()
    }
  })

  test('renders the "BoltBerry" heading', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await expect(dmWindow.getByText(/Heute Abend/i).first()).toBeVisible()
    } finally {
      await close()
    }
  })

  test('shows empty state when no campaigns exist', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Fresh database — no campaigns → empty state should show
      const isEmpty = await startScreen.hasNoCampaigns()
      expect(isEmpty).toBe(true)
    } finally {
      await close()
    }
  })

  test('"New Campaign" button is visible', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()
    } finally {
      await close()
    }
  })

  test('clicking "New Campaign" reveals the name input', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await startScreen.clickNewCampaign()

      const input = dmWindow.getByPlaceholder(/Kampagnen-Name/i)
      await expect(input).toBeVisible()
      await expect(input).toBeFocused()
    } finally {
      await close()
    }
  })

  test('pressing Escape cancels campaign creation', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await startScreen.clickNewCampaign()
      const input = dmWindow.getByPlaceholder(/Kampagnen-Name/i)
      await expect(input).toBeVisible()

      // Escape should hide the input
      await input.press('Escape')
      await expect(input).not.toBeVisible({ timeout: 2_000 })
    } finally {
      await close()
    }
  })

  test('electronAPI unavailability warning is NOT shown in normal launch', async () => {
    // If preload fails, StartScreen shows a red warning about DB not being available.
    // This must not appear in a normal launch.
    const { dmWindow, close } = await launchApp()

    try {
      await new StartScreenPage(dmWindow).waitFor()

      // Look for the error text that StartScreen renders when !window.electronAPI
      const warningText = 'Datenbankverbindung nicht verfügbar'
      const warning = dmWindow.locator(`text=${warningText}`)
      await expect(warning).not.toBeVisible()
    } finally {
      await close()
    }
  })
})
