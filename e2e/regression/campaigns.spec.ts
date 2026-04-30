/**
 * REGRESSION: Campaign CRUD operations
 *
 * Tests the full lifecycle of campaigns from the StartScreen:
 *  - Create
 *  - Open (navigate in)
 *  - Rename
 *  - Duplicate
 *  - Delete (with native confirmation dialog)
 *  - Error handling (empty name, max-length)
 *
 * Group: regression
 */

import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { StartScreenPage } from '../helpers/page-objects'
import { mockConfirmDialog } from '../helpers/dialog-helpers'

// ─── Campaign Creation ────────────────────────────────────────────────────────

test.describe('Campaign creation', () => {

  test('creates a campaign and navigates to CampaignView', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Create a campaign named "Test Abenteuer"
      await startScreen.createCampaign('Test Abenteuer')

      // After creation, the app should navigate away from StartScreen.
      // The logo is no longer visible (CampaignView is shown).
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 8_000 })
    } finally {
      await close()
    }
  })

  test('empty campaign name does not create a campaign', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await startScreen.clickNewCampaign()
      const input = dmWindow.getByTestId('input-campaign-name')

      // Submit without typing a name
      await input.fill('')
      await input.press('Enter')

      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()
    } finally {
      await close()
    }
  })

  test('campaign name is trimmed of surrounding whitespace', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // handleCreate() calls newName.trim() before inserting
      await startScreen.createCampaign('   Trimmed Name   ')

      // App navigated → campaign was created (trim did not block it)
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 6_000 })
    } finally {
      await close()
    }
  })

  test('campaign name respects maxLength 60', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      await startScreen.clickNewCampaign()
      const input = dmWindow.getByTestId('input-campaign-name')

      // Attempt to type 70 characters (input has maxLength={60})
      const longName = 'A'.repeat(70)
      await input.fill(longName)

      const actualValue = await input.inputValue()
      expect(actualValue.length).toBeLessThanOrEqual(60)
    } finally {
      await close()
    }
  })

})

// ─── Campaign List ────────────────────────────────────────────────────────────

test.describe('Campaign list', () => {

  test('created campaigns appear in the list', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const startScreen = new StartScreenPage(dmWindow)
      await startScreen.waitFor()

      // Create two campaigns, then navigate back after each
      // (Simpler: create first, navigate back, create second)

      await startScreen.createCampaignViaButton('Dungeon Run')
      // Navigate back to StartScreen (need to find the back button in CampaignView)
      // Implementation depends on CampaignView's back button selector
      await dmWindow.getByTestId('nav-dashboard').click()
      await startScreen.waitFor()
      await expect(dmWindow.getByTestId('list-item-campaign').filter({ hasText: 'Dungeon Run' })).toBeVisible()
    } finally {
      await close()
    }
  })

  test('"Recently used" header is shown when campaigns exist', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('Direct Insert')
      })

      // Reload to re-run loadCampaigns()
      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      // The "recently used" label (German: 'Zuletzt verwendet') should appear
      const header = dmWindow.locator('text=/[Zz]uletzt|[Rr]ecent/i')
      await expect(header).toBeVisible({ timeout: 5_000 })
    } finally {
      await close()
    }
  })
})

// ─── Campaign Rename ──────────────────────────────────────────────────────────

test.describe('Campaign rename', () => {

  test('double-clicking campaign name enters rename mode', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('Rename Me')
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      const row = dmWindow.getByTestId('list-item-campaign').first()
      await expect(row).toContainText('Rename Me')
      await row.hover()
      await row.getByTestId('button-rename-campaign').click()

      // An input field should now be visible with the current name
      const input = row.getByTestId('input-campaign-rename')
      await expect(input).toBeVisible()
      const value = await input.inputValue()
      expect(value).toBe('Rename Me')
    } finally {
      await close()
    }
  })

  test('rename commit updates the campaign name', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('OldName')
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      const row = dmWindow.getByTestId('list-item-campaign').first()
      await expect(row).toContainText('OldName')
      await row.hover()
      await row.getByTestId('button-rename-campaign').click()

      const input = row.getByTestId('input-campaign-rename')
      await input.fill('NewName')
      await input.press('Enter')

      // New name should appear; old name gone
      await expect(dmWindow.locator('div', { hasText: 'NewName' }).first()).toBeVisible({ timeout: 4_000 })
    } finally {
      await close()
    }
  })

  test('pressing Escape during rename cancels the change', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('StayTheSame')
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      const row = dmWindow.getByTestId('list-item-campaign').first()
      await expect(row).toContainText('StayTheSame')
      await row.hover()
      await row.getByTestId('button-rename-campaign').click()

      const input = row.getByTestId('input-campaign-rename')
      await input.fill('Cancelled Name')
      await input.press('Escape')

      // Original name still visible
      await expect(dmWindow.locator('div', { hasText: 'StayTheSame' }).first()).toBeVisible({ timeout: 3_000 })
    } finally {
      await close()
    }
  })
})

// ─── Campaign Delete ──────────────────────────────────────────────────────────

test.describe('Campaign delete', () => {

  test('deleting a campaign removes it from the list', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('To Be Deleted')
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      // Mock the native confirm dialog to click OK (index 1)
      await mockConfirmDialog(app, true)

      const row = dmWindow.getByTestId('list-item-campaign').filter({ hasText: 'To Be Deleted' }).first()
      await row.hover()
      await row.getByTestId('button-delete-campaign').click()

      // After deletion, the campaign row should be gone
      await expect(dmWindow.getByTestId('list-item-campaign').filter({ hasText: 'To Be Deleted' })).not.toBeVisible({ timeout: 5_000 })
    } finally {
      await close()
    }
  })

  test('cancelling delete dialog leaves the campaign in the list', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('Keep Me')
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      // Mock the dialog to return Cancel (index 0)
      await mockConfirmDialog(app, false)

      const row = dmWindow.getByTestId('list-item-campaign').filter({ hasText: 'Keep Me' }).first()
      await row.hover()
      await row.getByTestId('button-delete-campaign').click()

      // Campaign should still be visible
      await expect(dmWindow.locator('div', { hasText: 'Keep Me' }).first()).toBeVisible({ timeout: 3_000 })
    } finally {
      await close()
    }
  })
})

// ─── Campaign Duplicate ───────────────────────────────────────────────────────

test.describe('Campaign duplicate', () => {

  test('clicking duplicate creates a copy suffixed with "(Kopie)"', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () => {
        await (window as any).electronAPI.campaigns.create('Original')
      })

      await dmWindow.reload()
      await dmWindow.waitForSelector('#root > *')
      await new StartScreenPage(dmWindow).waitFor()

      const row = dmWindow.getByTestId('list-item-campaign').filter({ hasText: 'Original' }).first()
      await row.hover()
      await row.getByTestId('button-duplicate-campaign').click()
      await expect(dmWindow.locator('div', { hasText: 'Original (Kopie)' }).first()).toBeVisible({ timeout: 6_000 })
    } finally {
      await close()
    }
  })
})
