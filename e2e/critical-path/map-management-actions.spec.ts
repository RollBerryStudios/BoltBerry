/**
 * CRITICAL PATH: Campaign map management actions
 *
 * Covers the workspace map-card actions that the demo session path only
 * touches indirectly: add a second real map, rename, reorder, cancel delete,
 * confirm delete, and open the remaining map.
 */

import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import {
  completeSetupWithFolder,
  createCampaignFromWelcome,
} from '../helpers/onboarding-helpers'
import { mockOpenDialog } from '../helpers/dialog-helpers'

const DEMO_ROOT = resolve(__dirname, '../testcontent')
const DEMO_MAP_A = resolve(DEMO_ROOT, 'maps/cave.png')
const DEMO_MAP_B = resolve(DEMO_ROOT, 'maps/bridge.png')

async function campaignByName(page: Page, name: string): Promise<{ id: number; name: string }> {
  const campaign = await page.evaluate(async (campaignName) => {
    const rows = await (window as any).electronAPI.campaigns.list()
    return rows.find((row: { id: number; name: string }) => row.name === campaignName) ?? null
  }, name)
  expect(campaign).toBeTruthy()
  return campaign
}

async function mapNames(page: Page, campaignId: number): Promise<string[]> {
  return page.evaluate(async (id) => {
    const rows = await (window as any).electronAPI.maps.list(id)
    return rows.map((row: { name: string }) => row.name)
  }, campaignId)
}

test.describe('Map management actions', () => {
  test.describe.configure({ timeout: 90_000 })

  test('adds, renames, reorders, cancels delete, deletes, and opens maps from the workspace', async () => {
    expect(existsSync(DEMO_MAP_A), `Missing demo map at ${DEMO_MAP_A}`).toBe(true)
    expect(existsSync(DEMO_MAP_B), `Missing demo map at ${DEMO_MAP_B}`).toBe(true)

    const dataDir = mkdtempSync(resolve(tmpdir(), 'boltberry-map-actions-data-'))
    const { app, dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      await completeSetupWithFolder(app, dmWindow, dataDir)
      const campaignName = await createCampaignFromWelcome(dmWindow, '  E2E Map Actions  ')
      const campaign = await campaignByName(dmWindow, campaignName)

      await mockOpenDialog(app, [DEMO_MAP_A])
      await dmWindow.getByRole('button', { name: /Erste Karte importieren/i }).first().click()
      await expect(dmWindow.getByRole('application', { name: /Map canvas/i })).toBeVisible({ timeout: 15_000 })

      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne/i }).click()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()

      await mockOpenDialog(app, [DEMO_MAP_B])
      await dmWindow.getByTestId('button-add-map').click()
      await expect(dmWindow.getByRole('application', { name: /Map canvas/i })).toBeVisible({ timeout: 15_000 })

      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne/i }).click()
      await expect(dmWindow.getByTestId('list-item-map')).toHaveCount(2)

      const firstCard = dmWindow.getByTestId('list-item-map').first()
      await firstCard.getByTestId('button-rename-map').click()
      const renameInput = firstCard.getByTestId('input-map-name')
      await expect(renameInput).toBeFocused()
      await renameInput.fill('Renamed Cave')
      await renameInput.press('Enter')
      await expect(firstCard.getByTestId('button-rename-map')).toHaveText('Renamed Cave')
      await expect.poll(() => mapNames(dmWindow, campaign.id)).toContain('Renamed Cave')

      await firstCard.getByTestId('button-map-move-down').click()
      await expect.poll(async () => (await mapNames(dmWindow, campaign.id))[1]).toBe('Renamed Cave')

      dmWindow.once('dialog', (dialog) => void dialog.dismiss())
      await dmWindow.getByTestId('list-item-map').last().getByTestId('button-delete-map').click()
      await expect(dmWindow.getByTestId('list-item-map')).toHaveCount(2)

      dmWindow.once('dialog', (dialog) => void dialog.accept())
      await dmWindow.getByTestId('list-item-map').last().getByTestId('button-delete-map').click()
      await expect(dmWindow.getByTestId('list-item-map')).toHaveCount(1)
      await expect.poll(() => mapNames(dmWindow, campaign.id)).not.toContain('Renamed Cave')

      await dmWindow.getByTestId('list-item-map').first().getByTestId('button-open-map').click()
      await expect(dmWindow.getByRole('application', { name: /Map canvas/i })).toBeVisible({ timeout: 15_000 })
    } finally {
      await close()
    }
  })
})
