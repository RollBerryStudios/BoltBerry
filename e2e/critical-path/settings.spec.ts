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
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

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

  test('invalid and system data folders are rejected without switching database state', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.campaigns.create('Still Here')
      )

      const missingDir = resolve(tmpdir(), `boltberry-missing-${Date.now()}`)
      const missingResult = await dmWindow.evaluate(async (dir: string) =>
        (window as any).electronAPI.setUserDataFolder(dir),
        missingDir,
      )
      expect(missingResult.success).toBe(false)
      expect(missingResult.error).toMatch(/does not exist|not a directory/i)

      if (process.platform !== 'win32') {
        const systemResult = await dmWindow.evaluate(async () =>
          (window as any).electronAPI.setUserDataFolder('/etc')
        )
        expect(systemResult.success).toBe(false)
        expect(systemResult.error).toMatch(/system directory/i)
      }

      const campaigns = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.campaigns.list()
      )
      expect(campaigns.map((campaign: any) => campaign.name)).toContain('Still Here')
    } finally {
      await close()
    }
  })

  test('asset cleanup removes orphaned files but preserves referenced assets', async () => {
    const { dmWindow, close, userDataDir } = await launchApp()

    try {
      const campaign = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.campaigns.create(`Cleanup ${Date.now()}`)
      )
      const png1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
      const referenced = await dmWindow.evaluate(async ({ campaignId, png }) =>
        (window as any).electronAPI.saveAssetImage({
          campaignId,
          dataUrl: png,
          originalName: 'referenced-cleanup.png',
          type: 'map',
        }),
      { campaignId: campaign.id, png: png1x1 })
      expect(referenced.path).toBeTruthy()

      const orphanDir = join(userDataDir, 'assets', 'map')
      mkdirSync(orphanDir, { recursive: true })
      const orphanPath = join(orphanDir, 'orphan-cleanup.bin')
      writeFileSync(orphanPath, Buffer.from([1, 2, 3, 4]))

      const dryRun = await dmWindow.evaluate(() => (window as any).electronAPI.assetCleanup(true))
      expect(dryRun.success).toBe(true)
      expect(dryRun.paths).toContain('assets/map/orphan-cleanup.bin')
      expect(dryRun.paths).not.toContain(referenced.path)

      const cleanup = await dmWindow.evaluate(() => (window as any).electronAPI.assetCleanup(false))
      expect(cleanup.success).toBe(true)
      expect(cleanup.paths).toContain('assets/map/orphan-cleanup.bin')
      expect(existsSync(orphanPath)).toBe(false)
      expect(existsSync(join(userDataDir, referenced.path))).toBe(true)
    } finally {
      await close()
    }
  })
})
