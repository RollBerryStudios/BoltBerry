import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog } from '../helpers/dialog-helpers'

const DEMO_MAP = resolve(__dirname, '../testcontent/maps/cave.png')
const TRACKS_DIR = resolve(__dirname, '../testcontent/tracks')

async function createCampaign(page: Page, name: string) {
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(name)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
}

async function activeCampaignId(page: Page): Promise<number> {
  const id = await page.evaluate(async () => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    return campaigns[0]?.id
  })
  expect(id).toBeTruthy()
  return id
}

async function importMapAndOpenCanvas(page: Page, app: ElectronApplication) {
  expect(existsSync(DEMO_MAP), `Missing demo map at ${DEMO_MAP}`).toBe(true)
  await mockOpenDialog(app, [DEMO_MAP])
  await page.getByTestId('button-import-first-map').click()
  await expect(page.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
}

async function firstMapId(page: Page): Promise<number> {
  const mapId = await page.evaluate(async () => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    const maps = await (window as any).electronAPI.maps.list(campaigns[0].id)
    return maps[0]?.id
  })
  expect(mapId).toBeTruthy()
  return mapId
}

test.describe('Deep panel workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test('notes, handouts, and character sheets can be created and persisted from workspace panels', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const campaignName = `Deep Panels ${Date.now()}`
      await createCampaign(dmWindow, campaignName)
      const campaignId = await activeCampaignId(dmWindow)

      await dmWindow.getByTestId('nav-workspace-notes').click()
      await expect(dmWindow.getByTestId('panel-notes')).toBeVisible()
      await dmWindow.getByTestId('button-create-note').click()
      await dmWindow.getByTestId('input-note-title').fill('Session clue')
      await dmWindow.getByTestId('textarea-note-body').fill('The silver key opens the lower vault.')
      await dmWindow.getByTestId('textarea-note-body').blur()
      await expect(dmWindow.getByTestId('list-item-note').filter({ hasText: 'Session clue' })).toBeVisible()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.notes.listCategoryByCampaign(id), campaignId)
        return rows.some((row: any) => row.title === 'Session clue' && row.content.includes('silver key'))
      }).toBe(true)

      await dmWindow.getByTestId('nav-workspace-handouts').click()
      await expect(dmWindow.getByTestId('panel-handouts')).toBeVisible()
      await dmWindow.getByTestId('button-create-handout').click()
      await dmWindow.getByTestId('input-handout-title').fill('Vault sketch')
      await dmWindow.getByTestId('textarea-handout-body').fill('A charcoal sketch of the lower vault door.')
      await dmWindow.getByTestId('button-save-handout').click()
      await expect(dmWindow.getByTestId('list-item-handout').filter({ hasText: 'Vault sketch' })).toBeVisible()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.handouts.listByCampaign(id), campaignId)
        return rows.some((row: any) => row.title === 'Vault sketch' && row.textContent.includes('charcoal sketch'))
      }).toBe(true)

      await dmWindow.getByTestId('nav-workspace-characters').click()
      await expect(dmWindow.getByTestId('panel-character-sheets')).toBeVisible()
      await dmWindow.getByTestId('button-create-character-sheet').click()
      await expect(dmWindow.getByTestId('input-character-name')).toBeVisible()
      await dmWindow.getByTestId('input-character-name').fill('Mira Ashvale')
      await expect(dmWindow.getByTestId('list-item-character-sheet').filter({ hasText: 'Mira Ashvale' })).toBeVisible()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId)
        return rows.some((row: any) => row.name === 'Mira Ashvale')
      }).toBe(true)
    } finally {
      await close()
    }
  })

  test('audio library imports a folder and assigns a track to channel 1', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      expect(existsSync(TRACKS_DIR), `Missing tracks directory at ${TRACKS_DIR}`).toBe(true)
      await createCampaign(dmWindow, `Audio Panel ${Date.now()}`)
      const campaignId = await activeCampaignId(dmWindow)

      await dmWindow.getByTestId('nav-workspace-audio').click()
      await expect(dmWindow.getByTestId('panel-audio-library')).toBeVisible()
      await mockOpenDialog(app, [TRACKS_DIR])
      await dmWindow.getByTestId('button-add-audio-folder').click()
      await expect(dmWindow.getByTestId('list-item-track').first()).toBeVisible({ timeout: 15_000 })

      await dmWindow.getByTestId('list-item-track').first().getByTestId('button-assign-track-1').click()
      await expect.poll(async () => {
        const tracks = await dmWindow.evaluate((id) => (window as any).electronAPI.tracks.listByCampaign(id), campaignId)
        return tracks.some((track: any) => track.assignments.includes('track1'))
      }).toBe(true)
    } finally {
      await close()
    }
  })

  test('token library insertion and initiative entry create map records', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Library Initiative ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app)
      const mapId = await firstMapId(dmWindow)
      const templateName = `E2E Raider ${Date.now()}`
      await dmWindow.evaluate((name) => (window as any).electronAPI.tokenTemplates.create({
        category: 'npc',
        name,
        size: 1,
        hp_max: 11,
        ac: 13,
        faction: 'enemy',
        marker_color: '#ef4444',
        notes: 'Seeded by the deep panel workflow test.',
      }), templateName)

      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne/i }).click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible()
      await dmWindow.getByTestId('nav-workspace-npcs').click()
      await expect(dmWindow.getByTestId('panel-token-library')).toBeVisible()
      await dmWindow.getByTestId('input-token-search').fill(templateName)
      await expect.poll(async () => dmWindow.locator('[data-testid="list-item-token-template"] input').evaluateAll(
        (inputs, expectedName) => inputs.some((input) => (input as HTMLInputElement).value === expectedName),
        templateName,
      ), { timeout: 15_000 }).toBe(true)
      await dmWindow.getByTestId('list-item-token-template').first().getByTestId('button-insert-token').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(1)

      if (!await dmWindow.getByTestId('canvas-area').isVisible()) {
        const gameViewButton = dmWindow.getByTestId('button-open-game-view')
        if (await gameViewButton.count()) {
          await gameViewButton.first().click()
        } else {
          await dmWindow.getByRole('button', { name: /Spielansicht/i }).first().click()
        }
      }
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('button-sidebar-tab-initiative').click()
      await expect(dmWindow.getByTestId('panel-initiative')).toBeVisible()
      await dmWindow.getByTestId('input-initiative-name').fill('Bandit Captain')
      await dmWindow.getByTestId('button-add-initiative').click()
      await expect(dmWindow.getByTestId('list-item-initiative').filter({ hasText: 'Bandit Captain' })).toBeVisible()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.initiative.listByMap(id), mapId)
        return rows.some((row: any) => row.combatantName === 'Bandit Captain')
      }).toBe(true)
    } finally {
      await close()
    }
  })
})
