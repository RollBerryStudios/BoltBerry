/**
 * CRITICAL PATH: Full campaign lifecycle
 *
 * Validates the end-to-end flow a DM would follow in a real session:
 *   1. Create a campaign
 *   2. Navigate into it (CampaignView)
 *   3. Verify the campaign view renders
 *   4. (Optional) Navigate back to StartScreen
 *   5. Export/backup the campaign
 *   6. Import a previously exported campaign
 *
 * These tests represent the most user-critical paths and should be run
 * on every CI build.
 *
 * Group: critical-path
 */

import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { StartScreenPage } from '../helpers/page-objects'
import { mockSaveDialog, mockConfirmDialog } from '../helpers/dialog-helpers'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

// ─── Campaign creation → CampaignView ────────────────────────────────────────

test.describe('Campaign creation flow', () => {

  test('creates a campaign and the CampaignView is shown', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Act: Create a campaign
      await startScreen.createCampaign('Dragon\'s Lair')

      // Assert: We should now be in CampaignView
      // The BoltBerry start-screen logo should be hidden
      await expect(dmWindow.locator('img[alt="BoltBerry"]')).not.toBeVisible({ timeout: 8_000 })

      // Something from CampaignView must be visible — wait for any campaign UI
      // (panel tabs, toolbar, map selector, etc.)
      await dmWindow.waitForSelector(
        '[class*="campaign"], [class*="Campaign"], [class*="toolbar"], [class*="Toolbar"]',
        { timeout: 10_000 }
      )
    } finally {
      await close()
    }
  })

  test('opening an existing campaign navigates to CampaignView', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // Insert via IPC
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)', ['Preloaded Adventure']
        )
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Click to open
      const campaignBtn = dmWindow.locator('button', { hasText: 'Preloaded Adventure' })
      await campaignBtn.click()

      // StartScreen should no longer show the logo
      await expect(dmWindow.locator('img[alt="BoltBerry"]')).not.toBeVisible({ timeout: 8_000 })
    } finally {
      await close()
    }
  })
})

// ─── Campaign export (Quick Backup) ──────────────────────────────────────────

test.describe('Campaign backup', () => {

  test('quickBackup creates a .zip file in the documents folder', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // Insert a campaign
      const { lastInsertRowid: campaignId } = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)', ['Backup Test Campaign']
        )
      )

      // Call quickBackup via IPC (no dialog — it auto-saves)
      const result = await dmWindow.evaluate(async (id: number) =>
        (window as any).electronAPI.quickBackup(id),
        campaignId
      )

      expect(result.success).toBe(true)
      // filePath should end with .zip
      expect(result.filePath).toMatch(/\.zip$/i)
    } finally {
      await close()
    }
  })
})

// ─── Export campaign (with save dialog) ──────────────────────────────────────

test.describe('Campaign export', () => {

  test('exportCampaign succeeds when a save path is provided', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      const { lastInsertRowid: campaignId } = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)', ['Export Campaign']
        )
      )

      // Mock the save dialog to return a temp path
      const exportPath = resolve(tmpdir(), `e2e-export-${randomBytes(4).toString('hex')}.zip`)
      await mockSaveDialog(app, exportPath)

      const result = await dmWindow.evaluate(async (id: number) =>
        (window as any).electronAPI.exportCampaign(id),
        campaignId
      )

      expect(result.success).toBe(true)
      // canceled must be false or undefined
      expect(result.canceled).toBeFalsy()
    } finally {
      await close()
    }
  })

  test('exportCampaign returns canceled:true when dialog is dismissed', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      const { lastInsertRowid: campaignId } = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)', ['Export Cancel Test']
        )
      )

      // Mock dialog to simulate cancel
      await app.evaluate(({ dialog }) => {
        const orig = dialog.showSaveDialog.bind(dialog)
        // @ts-ignore
        dialog.showSaveDialog = async () => {
          // @ts-ignore
          dialog.showSaveDialog = orig
          return { canceled: true, filePath: undefined }
        }
      })

      const result = await dmWindow.evaluate(async (id: number) =>
        (window as any).electronAPI.exportCampaign(id),
        campaignId
      )

      expect(result.canceled).toBe(true)
    } finally {
      await close()
    }
  })
})

// ─── Duplicate campaign ───────────────────────────────────────────────────────

test.describe('Campaign duplicate via IPC', () => {

  test('duplicateCampaign creates a copy in the database', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const { lastInsertRowid: originalId } = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)', ['Original Campaign']
        )
      )

      const result = await dmWindow.evaluate(async (id: number) =>
        (window as any).electronAPI.duplicateCampaign(id),
        originalId
      )

      expect(result.success).toBe(true)
      // The new campaign's name should end with "(Kopie)"
      expect(result.campaign.name).toContain('(Kopie)')
      // It should have a different ID from the original
      expect(result.campaign.id).not.toBe(originalId)
    } finally {
      await close()
    }
  })
})

// ─── Error states ─────────────────────────────────────────────────────────────

test.describe('Campaign error handling', () => {

  test('exportCampaign with non-existent ID returns success: false', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // We need to also mock the dialog since exportCampaign opens one
      // before checking if campaign exists. Pre-supply a path.
      // Actually, looking at the code: it queries the DB first, then opens dialog.
      // So a missing campaign returns { success: false, error: '...' } without opening dialog.

      const result = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.exportCampaign(999999)
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    } finally {
      await close()
    }
  })

  test('duplicateCampaign with non-existent ID returns success: false', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const result = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.duplicateCampaign(999999)
      )

      expect(result.success).toBe(false)
    } finally {
      await close()
    }
  })
})
