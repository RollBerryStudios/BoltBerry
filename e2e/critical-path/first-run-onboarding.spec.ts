/**
 * CRITICAL PATH: First-run onboarding
 *
 * This test intentionally drives the app through public UI surfaces only:
 * no direct DB helpers, no renderer-store mutation, no private preload
 * shortcuts. It covers the flow a new DM must complete before BoltBerry is
 * useful: choose a data folder, finish setup, create the first campaign, and
 * arrive in the campaign workspace.
 */

import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { completeSetupWithFolder } from '../helpers/onboarding-helpers'

test.describe('First-run onboarding', () => {
  test('completes setup, validates campaign creation, and opens the first campaign', async () => {
    const dataDir = mkdtempSync(resolve(tmpdir(), 'boltberry-onboarding-data-'))
    const rawCampaignName = '  E2E Onboarding Abenteuer  '
    const campaignName = rawCampaignName.trim()
    const { app, dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      await completeSetupWithFolder(app, dmWindow, dataDir)
      expect(existsSync(join(dataDir, 'data', 'rollberry.db'))).toBe(true)

      await expect
        .poll(() => dmWindow.evaluate(() => localStorage.getItem('boltberry-setup-complete')))
        .toBe('1')
      await expect
        .poll(() => dmWindow.evaluate(() => localStorage.getItem('boltberry-data-folder')))
        .toBe(dataDir)

      await dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first().click()
      const campaignInput = dmWindow.getByPlaceholder(/Kampagnen-Name/i)
      const createButton = dmWindow.getByRole('button', { name: /^Erstellen$/i })

      await expect(campaignInput).toBeFocused()
      await expect(campaignInput).toHaveAttribute('maxLength', '60')
      await expect(createButton).toBeDisabled()

      await campaignInput.fill('   ')
      await expect(createButton).toBeDisabled()

      await campaignInput.fill('A'.repeat(70))
      await expect(campaignInput).toHaveValue('A'.repeat(60))

      await campaignInput.press('Escape')
      await expect(campaignInput).toBeHidden()

      await dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first().click()
      const reopenedCampaignInput = dmWindow.getByPlaceholder(/Kampagnen-Name/i)
      await reopenedCampaignInput.fill(rawCampaignName)
      await expect(createButton).toBeEnabled()
      await reopenedCampaignInput.press('Enter')

      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()
      await expect(
        dmWindow.getByRole('button', { name: /Erste Karte importieren/i }).first(),
      ).toBeVisible()

      await dmWindow.getByRole('button', { name: /Kampagnen/i }).first().click()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()
    } finally {
      await close()
    }
  })
})
