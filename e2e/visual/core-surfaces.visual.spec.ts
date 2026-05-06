import { test, expect } from '@playwright/test'
import { launchApp, waitForPlayerWindow } from '../helpers/electron-launch'
import {
  createCampaign,
  importMapAndOpenCanvas,
  seedCanvasEntities,
  seedWorkspacePanels,
  TEST_MAPS,
} from '../helpers/test-data'

test.skip(!process.env.BOLTBERRY_RUN_VISUAL, 'Visual baselines run only via npm run test:e2e:visual')

test.describe('Visual regression — core surfaces', () => {
  test.describe.configure({ timeout: 90_000 })

  test('dashboard empty state', async () => {
    const { dmWindow, close } = await launchApp({ visualTestMode: true })
    try {
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible()
      await expect(dmWindow).toHaveScreenshot('dashboard-empty.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      })
      await dmWindow.getByTestId('button-open-settings').click()
      await expect(dmWindow.getByRole('dialog', { name: /Einstellungen|Settings/i })).toBeVisible()
      await expect(dmWindow).toHaveScreenshot('settings-dark-de.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      })
    } finally {
      await close()
    }
  })

  test('campaign workspace with seeded panels', async () => {
    const { dmWindow, close } = await launchApp({ visualTestMode: true })
    try {
      const campaignId = await createCampaign(dmWindow, 'Visual Workspace')
      await seedWorkspacePanels(dmWindow, campaignId)
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('nav-workspace-notes').click()
      await expect(dmWindow.getByTestId('panel-notes')).toBeVisible()
      await expect(dmWindow).toHaveScreenshot('workspace-seeded-notes.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      })
    } finally {
      await close()
    }
  })

  test('canvas with map, tokens, fog, walls, rooms, and drawings', async () => {
    const { app, dmWindow, close } = await launchApp({ visualTestMode: true })
    try {
      const campaignId = await createCampaign(dmWindow, 'Visual Canvas')
      await seedWorkspacePanels(dmWindow, campaignId)
      const mapId = await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.bridge)
      await seedCanvasEntities(dmWindow, mapId)
      await dmWindow.evaluate(() => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))
      })
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
      await expect(dmWindow).toHaveScreenshot('canvas-seeded.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      })
    } finally {
      await close()
    }
  })

  test('player view with synchronized visible state', async () => {
    const { app, dmWindow, close } = await launchApp({ visualTestMode: true })
    try {
      const campaignId = await createCampaign(dmWindow, 'Visual Player')
      await seedWorkspacePanels(dmWindow, campaignId)
      const mapId = await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.cave)
      await seedCanvasEntities(dmWindow, mapId)
      const playerWait = waitForPlayerWindow(app, 15_000)
      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await playerWait
      await playerWindow.setViewportSize({ width: 1280, height: 720 }).catch(() => { /* BrowserWindow-sized in Electron */ })
      await dmWindow.getByTestId('button-session-toggle').click()
      const sessionDialog = dmWindow.getByRole('dialog', { name: /Session starten/i })
      await expect(sessionDialog).toBeVisible()
      await sessionDialog.getByRole('button', { name: /Jetzt live gehen/i }).click()
      const continueButton = sessionDialog.getByRole('button', { name: /Trotzdem fortfahren/i })
      if (await continueButton.count()) await continueButton.click()
      await expect.poll(() => playerWindow.locator('canvas').count(), { timeout: 15_000 }).toBeGreaterThan(0)
      await expect(playerWindow).toHaveScreenshot('player-view-seeded.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      })
    } finally {
      await close()
    }
  })
})
