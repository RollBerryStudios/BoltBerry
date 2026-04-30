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
import { StartScreenPage } from '../helpers/page-objects'
import { completeSetupWithFolder } from '../helpers/onboarding-helpers'
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

      const hasCompletedSetup = await dmWindow.evaluate(() =>
        localStorage.getItem('boltberry-setup-complete') === '1'
      )
      expect(hasCompletedSetup).toBe(false)

      await expect(dmWindow.getByRole('heading', { name: /Willkommen bei BoltBerry!/i })).toBeVisible()
      await expect(dmWindow.getByPlaceholder(/Pfad zum Datenordner/i)).toBeVisible()
    } finally {
      await close()
    }
  })

  test('after completing SetupWizard, StartScreen is shown', async () => {
    const { app, dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      const defaultDir = mkdtempSync(resolve(tmpdir(), 'boltberry-wizard-'))
      await completeSetupWithFolder(app, dmWindow, defaultDir)

      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()
      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()
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
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.campaigns.create('In Old Folder')
      )

      // Switch to a new empty folder
      const newDir = mkdtempSync(resolve(tmpdir(), 'boltberry-new-'))
      await dmWindow.evaluate(async (dir: string) =>
        (window as any).electronAPI.setUserDataFolder(dir),
        newDir
      )

      const campaigns = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.campaigns.list()
      )

      expect(campaigns).toHaveLength(0)
    } finally {
      await close()
    }
  })
})
