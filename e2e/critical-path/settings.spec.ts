/**
 * CRITICAL PATH: Settings and data folder management
 *
 * BoltBerry stores all user data (DB + assets) in a configurable folder.
 * The SetupWizard sets this on first run; afterwards it can be changed in
 * the SettingsPanel.  These tests exercise the path-switching flow and
 * first-launch wizard behaviour.
 *
 * Group: critical-path
 */

import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { SetupWizardPage, StartScreenPage } from '../helpers/page-objects'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'

// ─── SetupWizard (first launch) ───────────────────────────────────────────────

test.describe('SetupWizard (first launch)', () => {

  test('SetupWizard is shown on first launch (no settings in localStorage)', async () => {
    // Launch WITHOUT injecting settings (skipSetupWizard: false)
    const { dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      await dmWindow.waitForSelector('#root > *', { timeout: 10_000 })

      // Check that boltberry-settings is NOT set in localStorage
      const hasSettings = await dmWindow.evaluate(() =>
        !!localStorage.getItem('boltberry-settings')
      )
      expect(hasSettings).toBe(false)

      // The SetupWizard should be rendered when isSetupComplete is false
      // Look for wizard-specific UI elements (primary action button on first step)
      // The wizard is the only view when settings are not complete
      const wizardEl = dmWindow.locator('[data-testid="setup-wizard"], [class*="wizard"], [class*="Wizard"]')
      // If no explicit testid, check that StartScreen logo is not visible (wizard takes over)
      const logoVisible = await dmWindow.locator('img[alt="BoltBerry"]').isVisible({ timeout: 3_000 }).catch(() => false)

      // Either the wizard element exists, or we are on a screen with no logo (both valid indicators)
      // Accept either as proof the wizard is running
      expect(await wizardEl.isVisible({ timeout: 3_000 }).catch(() => !logoVisible)).toBe(true)
    } finally {
      await close()
    }
  })

  test('after completing SetupWizard, StartScreen is shown', async () => {
    const { dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      await dmWindow.waitForSelector('#root > *', { timeout: 10_000 })

      // Simulate completing the wizard by injecting settings + reloading
      const defaultDir = mkdtempSync(resolve(tmpdir(), 'boltberry-wizard-'))
      await dmWindow.evaluate((dir: string) => {
        localStorage.setItem('boltberry-settings', JSON.stringify({
          state: { isSetupComplete: true, userDataFolder: dir, language: 'de', theme: 'dark' },
          version: 0,
        }))
      }, defaultDir)

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')

      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await expect(dmWindow.locator('img[alt="BoltBerry"]')).toBeVisible()
    } finally {
      await close()
    }
  })
})

// ─── Data folder switching ────────────────────────────────────────────────────

test.describe('Data folder management', () => {

  test('setUserDataFolder with a valid path returns success: true', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // Create a new temp dir to switch to
      const newDir = mkdtempSync(resolve(tmpdir(), 'boltberry-switch-'))

      const result = await dmWindow.evaluate(async (dir: string) =>
        (window as any).electronAPI.setUserDataFolder(dir),
        newDir
      )

      expect(result.success).toBe(true)
      expect(result.error).toBeFalsy()
    } finally {
      await close()
    }
  })

  test('getUserDataPath returns a string path', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const path = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.getUserDataPath()
      )
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  test('getDefaultUserDataFolder returns path ending in "BoltBerry"', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const path = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.getDefaultUserDataFolder()
      )
      // Default is: join(app.getPath('documents'), 'BoltBerry')
      expect(path).toMatch(/BoltBerry$/)
    } finally {
      await close()
    }
  })

  test('switching data folder resets the database connection', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // Insert a campaign in the current DB
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)', ['In Old Folder']
        )
      )

      // Switch to a new empty folder
      const newDir = mkdtempSync(resolve(tmpdir(), 'boltberry-new-'))
      await dmWindow.evaluate(async (dir: string) =>
        (window as any).electronAPI.setUserDataFolder(dir),
        newDir
      )

      // Query the new DB — should be empty
      const campaigns = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbQuery('SELECT * FROM campaigns')
      )

      expect(campaigns).toHaveLength(0)
    } finally {
      await close()
    }
  })
})
