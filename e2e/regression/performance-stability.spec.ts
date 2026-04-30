import { test, expect } from '@playwright/test'
import { launchApp, waitForPlayerWindow } from '../helpers/electron-launch'
import { createCampaign, importMapAndOpenCanvas, TEST_MAPS } from '../helpers/test-data'

test.describe('Performance and stability guards', () => {
  test.describe.configure({ timeout: 120_000 })

  test('canvas remains responsive with a large token roster', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Perf Canvas ${Date.now()}`)
      const mapId = await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.bridge)

      await dmWindow.evaluate(async (id) => {
        const api = (window as any).electronAPI
        for (let i = 0; i < 150; i += 1) {
          await api.tokens.create({
            mapId: id,
            name: `Token ${String(i).padStart(3, '0')}`,
            x: 80 + (i % 15) * 70,
            y: 80 + Math.floor(i / 15) * 70,
            size: 1,
            hpCurrent: 8,
            hpMax: 8,
            ac: 12,
            faction: i % 2 === 0 ? 'party' : 'enemy',
            markerColor: i % 2 === 0 ? '#22c55e' : '#ef4444',
            visibleToPlayers: i % 3 !== 0,
          })
        }
      }, mapId)

      const started = Date.now()
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('button-open-map').first().click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('button-canvas-tool-select').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(150)
      expect(Date.now() - started).toBeLessThan(15_000)
    } finally {
      await close()
    }
  })

  test('audio library filtering stays responsive with many tracks', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `Perf Audio ${Date.now()}`)
      await dmWindow.evaluate(async (id) => {
        const api = (window as any).electronAPI
        for (let i = 0; i < 120; i += 1) {
          await api.tracks.create({
            campaignId: id,
            path: `tracks/perf-${i}.mp3`,
            fileName: `${i % 2 === 0 ? 'Combat' : 'Travel'} Perf ${String(i).padStart(3, '0')}.mp3`,
            soundtrack: i % 2 === 0 ? 'Combat' : 'Travel',
          })
        }
      }, campaignId)

      await dmWindow.getByTestId('nav-workspace-audio').click()
      await expect(dmWindow.getByTestId('list-item-track')).toHaveCount(120, { timeout: 15_000 })
      const started = Date.now()
      await dmWindow.getByTestId('input-track-search').fill('Combat')
      await expect(dmWindow.getByTestId('list-item-track')).toHaveCount(60, { timeout: 15_000 })
      expect(Date.now() - started).toBeLessThan(5_000)
    } finally {
      await close()
    }
  })

  test('player reconnect and renderer memory stay within smoke thresholds', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Stability Player ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.cave)

      for (let i = 0; i < 3; i += 1) {
        const playerWait = waitForPlayerWindow(app, 15_000)
        await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
        const playerWindow = await playerWait
        await expect(playerWindow).toHaveTitle(/Spieler|Player/i)
        await dmWindow.evaluate(() => (window as any).electronAPI.closePlayerWindow())
        await expect.poll(() => app.windows().length, { timeout: 10_000 }).toBe(1)
      }

      const heapSize = await dmWindow.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? null)
      if (heapSize !== null) {
        expect(heapSize).toBeLessThan(350 * 1024 * 1024)
      }
    } finally {
      await close()
    }
  })
})
