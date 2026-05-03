import { test, expect, type Page } from '@playwright/test'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { launchApp } from '../helpers/electron-launch'
import {
  openSeededCanvas,
  seedCanvasEntities,
  TEST_MAPS,
} from '../helpers/test-data'
import { mockConfirmDialog, mockOpenDialog, mockSaveDialog } from '../helpers/dialog-helpers'

test.describe('Encounter workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test('encounters can be saved, renamed, spawned, exported, deleted, and imported from the panel', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { campaignId, mapId } = await openSeededCanvas(dmWindow, app, `Encounter Flow ${Date.now()}`, TEST_MAPS.bridge)
      await seedCanvasEntities(dmWindow, mapId)

      await dmWindow.getByTestId('button-sidebar-dock-content').click()
      await dmWindow.getByTestId('button-sidebar-tab-encounters').click()
      await expect(dmWindow.getByTestId('panel-encounters')).toBeVisible()

      await dmWindow.getByTestId('button-save-current-encounter').click()
      await dmWindow.getByTestId('input-encounter-name').fill('Bridge Ambush')
      await dmWindow.keyboard.press('Enter')
      await expect(dmWindow.getByTestId('list-item-encounter').filter({ hasText: 'Bridge Ambush' })).toBeVisible()
      await expect.poll(() => encounterNames(dmWindow, campaignId)).toEqual(['Bridge Ambush'])

      const encounterRow = dmWindow.getByTestId('list-item-encounter').filter({ hasText: 'Bridge Ambush' })
      await encounterRow.getByText('Bridge Ambush').dblclick()
      await dmWindow.getByTestId('input-edit-encounter-name').fill('Bridge Ambush Revised')
      await dmWindow.keyboard.press('Enter')
      await expect.poll(() => encounterNames(dmWindow, campaignId)).toEqual(['Bridge Ambush Revised'])

      const beforeSpawn = await tokenCount(dmWindow, mapId)
      await dmWindow.getByTestId('list-item-encounter').filter({ hasText: 'Bridge Ambush Revised' }).click()
      await dmWindow.getByTestId('button-encounter-formation-line').click()
      await dmWindow.getByTestId('button-encounter-difficulty-hard').click()
      await dmWindow.getByTestId('button-spawn-encounter').click()
      await expect.poll(() => tokenCount(dmWindow, mapId), { timeout: 10_000 }).toBeGreaterThan(beforeSpawn)

      const exportPath = join(tmpdir(), `boltberry-encounter-${Date.now()}.json`)
      await mockSaveDialog(app, exportPath)
      await dmWindow.getByTestId('list-item-encounter').filter({ hasText: 'Bridge Ambush Revised' }).getByTestId('button-export-encounter').click()
      await expect.poll(() => existsSync(exportPath)).toBe(true)

      await mockConfirmDialog(app, true)
      await dmWindow.getByTestId('list-item-encounter').filter({ hasText: 'Bridge Ambush Revised' }).getByTestId('button-delete-encounter').click()
      await expect.poll(() => encounterNames(dmWindow, campaignId)).toEqual([])

      await mockOpenDialog(app, [exportPath])
      await dmWindow.getByTestId('button-import-encounter').click()
      await expect.poll(() => encounterNames(dmWindow, campaignId)).toEqual(['Bridge Ambush Revised'])
    } finally {
      await close()
    }
  })
})

async function encounterNames(page: Page, campaignId: number): Promise<string[]> {
  return page.evaluate((id) =>
    (window as any).electronAPI.encounters.listByCampaign(id).then((rows: any[]) => rows.map((row) => row.name)),
  campaignId)
}

async function tokenCount(page: Page, mapId: number): Promise<number> {
  return page.evaluate((id) =>
    (window as any).electronAPI.tokens.listByMap(id).then((rows: any[]) => rows.length),
  mapId)
}
