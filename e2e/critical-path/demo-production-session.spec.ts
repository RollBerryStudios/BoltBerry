/**
 * CRITICAL PATH: Production demo session
 *
 * This spec exercises the release path with real demo assets. It avoids
 * legacy DB test hooks and verifies the app through visible UI plus public
 * preload APIs, which mirrors how a DM actually uses BoltBerry.
 */

import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  getWindowCount,
  launchApp,
  waitForPlayerWindow,
} from '../helpers/electron-launch'
import {
  completeSetupWithFolder,
  createCampaignFromWelcome,
} from '../helpers/onboarding-helpers'
import { mockOpenDialog, mockSaveDialog } from '../helpers/dialog-helpers'

const DEMO_ROOT = resolve(__dirname, '../testcontent')
const DEMO_MAP = resolve(DEMO_ROOT, 'maps/cave.png')
const DEMO_TRACKS_DIR = resolve(DEMO_ROOT, 'tracks')
const DEMO_TRACK_NAME = 'Cavern.ogg'

async function activeCampaignByName(page: Page, name: string): Promise<{ id: number; name: string } | null> {
  return page.evaluate(async (campaignName) => {
    const rows = await (window as any).electronAPI.campaigns.list()
    return rows.find((campaign: { id: number; name: string }) => campaign.name === campaignName) ?? null
  }, name)
}

async function expectCanvasReady(page: Page): Promise<void> {
  await expect(page.getByRole('application', { name: /Map canvas/i })).toBeVisible({ timeout: 15_000 })
  await expect.poll(
    () => page.locator('.canvas-area canvas').count(),
    { timeout: 15_000 },
  ).toBeGreaterThan(0)
}

test.describe('Production demo session with bundled content', () => {
  test.describe.configure({ timeout: 120_000 })

  test('runs setup, imports real map and audio, goes live to player window, and exports campaign', async () => {
    expect(existsSync(DEMO_MAP), `Missing demo map at ${DEMO_MAP}`).toBe(true)
    expect(existsSync(DEMO_TRACKS_DIR), `Missing demo tracks folder at ${DEMO_TRACKS_DIR}`).toBe(true)
    expect(existsSync(resolve(DEMO_TRACKS_DIR, DEMO_TRACK_NAME)), `Missing demo track ${DEMO_TRACK_NAME}`).toBe(true)

    const dataDir = mkdtempSync(resolve(tmpdir(), 'boltberry-demo-session-data-'))
    const { app, dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      await completeSetupWithFolder(app, dmWindow, dataDir)
      const campaignName = await createCampaignFromWelcome(dmWindow, '  E2E Demo Production Session  ')
      const campaign = await activeCampaignByName(dmWindow, campaignName)
      expect(campaign?.id).toBeTruthy()

      await mockOpenDialog(app, [DEMO_MAP])
      await dmWindow.getByTestId('button-import-first-map').click()
      await expectCanvasReady(dmWindow)
      await expect(dmWindow.getByTestId('toolbar')).toBeVisible()

      const maps = await dmWindow.evaluate(async (campaignId) => {
        return (window as any).electronAPI.maps.list(campaignId)
      }, campaign!.id)
      expect(
        maps.some((map: { imagePath: string }) => /assets[\\/]+map[\\/]+.+\.png$/i.test(map.imagePath)),
      ).toBe(true)

      await dmWindow.getByTestId('button-toggle-player-window').click()
      const monitorDialog = dmWindow.getByRole('dialog', { name: /Spieler-Monitor auswählen/i })
      await expect(monitorDialog).toBeVisible()
      await monitorDialog.getByRole('button', { name: /Fenster öffnen/i }).click()

      const playerWindow = await waitForPlayerWindow(app, 10_000)
      await playerWindow.waitForLoadState('domcontentloaded')
      expect(await getWindowCount(app)).toBe(2)
      await expect(playerWindow.getByText(/Warte auf den Spielleiter/i)).toBeVisible({ timeout: 10_000 })

      await dmWindow.getByTestId('button-session-toggle').click()
      const sessionDialog = dmWindow.getByRole('dialog', { name: /Session starten/i })
      await expect(sessionDialog).toBeVisible()
      await sessionDialog.getByRole('button', { name: /Jetzt live gehen/i }).click()
      await sessionDialog.getByRole('button', { name: /Trotzdem fortfahren/i }).click()
      await expect(dmWindow.getByRole('button', { name: /LIVE/i })).toBeVisible({ timeout: 10_000 })

      await expect(playerWindow.getByText(/Warte auf den Spielleiter/i)).toBeHidden({ timeout: 15_000 })
      await expect.poll(
        () => playerWindow.locator('canvas').count(),
        { timeout: 15_000 },
      ).toBeGreaterThan(0)

      await dmWindow.getByRole('button', { name: /Minimap/i }).click()
      await dmWindow.getByRole('button', { name: /Raster-Snap/i }).click()
      await dmWindow.getByRole('button', { name: /Spieler-Sicht anzeigen/i }).click()
      await dmWindow.getByRole('button', { name: /Spieler-Vorschau umschalten/i }).click()
      await dmWindow.getByRole('button', { name: /Spieler-Vorschau umschalten/i }).click()

      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne/i }).click()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()

      await dmWindow.getByTestId('nav-workspace-audio').click()
      await mockOpenDialog(app, [DEMO_TRACKS_DIR])
      await dmWindow.getByRole('button', { name: /\+ Ordner/i }).click()
      await expect(dmWindow.getByText(DEMO_TRACK_NAME)).toBeVisible({ timeout: 20_000 })

      const trackRow = dmWindow.locator('.music-library-track').filter({ hasText: DEMO_TRACK_NAME }).first()
      await expect(trackRow).toBeVisible()
      await trackRow.locator('button').filter({ hasText: /^T1$/ }).click()

      const tracks = await dmWindow.evaluate(async (campaignId) => {
        return (window as any).electronAPI.tracks.listByCampaign(campaignId)
      }, campaign!.id)
      const demoTrack = tracks.find((track: { fileName: string }) => track.fileName === DEMO_TRACK_NAME)
      expect(demoTrack).toBeTruthy()
      expect(demoTrack.assignments).toContain('track1')

      const exportPath = join(dataDir, 'demo-production-session.zip')
      await mockSaveDialog(app, exportPath)
      const exportResult = await dmWindow.evaluate(async (campaignId) => {
        return (window as any).electronAPI.exportCampaign(campaignId)
      }, campaign!.id)
      expect(exportResult.success).toBe(true)
      expect(existsSync(exportPath)).toBe(true)
    } finally {
      await dmWindow.evaluate(() => (window as any).electronAPI?.closePlayerWindow?.()).catch(() => {})
      await close()
    }
  })
})
