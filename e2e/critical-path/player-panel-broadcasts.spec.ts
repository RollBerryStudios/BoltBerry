import { test, expect, type Page } from '@playwright/test'
import { launchApp, waitForPlayerWindow } from '../helpers/electron-launch'
import { createCampaign, importMapAndOpenCanvas } from '../helpers/test-data'

test.describe('Panel-driven player broadcasts', () => {
  test.describe.configure({ timeout: 90_000 })

  test('handouts sent from the panel appear in the player view and can be cleared', async () => {
      const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Handout Broadcast ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app)
      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')

      await startSession(dmWindow)
      await dmWindow.getByTestId('button-sidebar-dock-content').click()
      await dmWindow.getByTestId('button-sidebar-tab-handouts').click()
      await dmWindow.getByTestId('button-create-handout').click()
      await dmWindow.getByTestId('input-handout-title').fill('Player Panel Letter')
      await dmWindow.getByTestId('textarea-handout-body').fill('This handout was sent through the real panel controls.')
      await dmWindow.getByTestId('button-save-handout').click()

      const handoutRow = dmWindow.getByTestId('list-item-handout').filter({ hasText: 'Player Panel Letter' })
      await expect(handoutRow).toBeVisible()
      await handoutRow.getByTitle('An Spieler senden').click()

      await expect(playerWindow.getByTestId('player-handout')).toBeVisible({ timeout: 8_000 })
      await expect(playerWindow.getByTestId('player-handout-title')).toHaveText('Player Panel Letter')
      await expect(playerWindow.getByTestId('player-handout-body')).toContainText('real panel controls')

      await dmWindow.getByTitle('Handout beim Spieler ausblenden').click()
      await expect(playerWindow.getByTestId('player-handout')).toHaveCount(0)
      await expect(playerWindow.getByTestId('player-map-root')).toBeVisible()
    } finally {
      await dmWindow.evaluate(() =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {}),
      ).catch(() => {})
      await close()
    }
  })

  test('initiative edits from the panel update persisted order and player broadcast state', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Initiative Broadcast ${Date.now()}`)
      const mapId = await importMapAndOpenCanvas(dmWindow, app)
      await dmWindow.evaluate((id) => (window as any).electronAPI.tokens.create({
        mapId: id,
        name: 'Panel Raider',
        x: 300,
        y: 280,
        size: 1,
        hpCurrent: 10,
        hpMax: 18,
        ac: 13,
        faction: 'enemy',
        visibleToPlayers: true,
      }), mapId)
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await dmWindow.getByTestId('button-open-map').first().click()

      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')
      await startSession(dmWindow)

      await dmWindow.getByTestId('button-sidebar-tab-initiative').click()
      await dmWindow.getByTestId('input-initiative-name').fill('Panel Raider')
      await dmWindow.getByTestId('input-initiative-roll').fill('12')
      await dmWindow.getByTestId('button-add-initiative').click()
      await dmWindow.getByTestId('input-initiative-name').fill('Panel Wizard')
      await dmWindow.getByTestId('input-initiative-roll').fill('18')
      await dmWindow.getByTestId('button-add-initiative').click()

      await expect(playerWindow.getByTestId('player-initiative')).toContainText('Panel Raider')
      await expect(playerWindow.getByTestId('player-initiative')).toContainText('Panel Wizard')

      await dmWindow.getByTitle('Sortieren').click()
      await dmWindow.getByTitle('Nächster Kämpfer [N]').click()
      await expect.poll(async () => {
        const entries = await dmWindow.evaluate((id) => (window as any).electronAPI.initiative.listByMap(id), mapId)
        return entries.some((entry: any) => entry.currentTurn)
      }).toBe(true)

      const wizardRow = dmWindow.getByTestId('list-item-initiative').filter({ hasText: 'Panel Wizard' })
      await wizardRow.getByLabel(/entfernen|remove/i).click()
      await expect.poll(async () => {
        const entries = await dmWindow.evaluate((id) => (window as any).electronAPI.initiative.listByMap(id), mapId)
        return entries.map((entry: any) => entry.combatantName)
      }).toEqual(['Panel Raider'])
    } finally {
      await dmWindow.evaluate(() =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {}),
      ).catch(() => {})
      await close()
    }
  })
})

async function startSession(page: Page): Promise<void> {
  await page.getByTestId('button-session-toggle').click()
  const sessionDialog = page.getByRole('dialog', { name: /Session starten/i })
  await expect(sessionDialog).toBeVisible()
  await sessionDialog.getByRole('button', { name: /Jetzt live gehen/i }).click()
  const continueButton = sessionDialog.getByRole('button', { name: /Trotzdem fortfahren/i })
  if (await continueButton.count()) await continueButton.click()
  await expect(page.getByRole('button', { name: /LIVE/i })).toBeVisible({ timeout: 10_000 })
}
