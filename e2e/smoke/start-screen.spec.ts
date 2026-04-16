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

      // The logo <img alt="BoltBerry"> must be visible
      const logo = dmWindow.locator('img[alt="BoltBerry"]')
      await expect(logo).toBeVisible()
    } finally {
      await close()
    }
  })

  test('renders the "BoltBerry" heading', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      const heading = dmWindow.locator('h1', { hasText: 'BoltBerry' })
      await expect(heading).toBeVisible()
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

      // The primary action button (creates a campaign) must be present
      const newBtn = dmWindow.locator('button.btn-primary').last()
      await expect(newBtn).toBeVisible()
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

      // An input with placeholder text should appear
      const input = dmWindow.locator('input.input').last()
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
      const input = dmWindow.locator('input.input').last()
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
