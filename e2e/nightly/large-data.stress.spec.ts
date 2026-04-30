import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { createCampaign, importMapAndOpenCanvas, TEST_MAPS } from '../helpers/test-data'

test.skip(!process.env.BOLTBERRY_RUN_NIGHTLY, 'Nightly stress checks run only via npm run test:e2e:nightly')

test.describe('Nightly large-data stress guards', () => {
  test.describe.configure({ timeout: 240_000 })

  test('large map state remains openable with hundreds of tokens and geometry rows', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Nightly Large Canvas ${Date.now()}`)
      const mapId = await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.castle)

      await dmWindow.evaluate(async (id) => {
        const api = (window as any).electronAPI
        for (let i = 0; i < 400; i += 1) {
          await api.tokens.create({
            mapId: id,
            name: `Stress Token ${String(i).padStart(3, '0')}`,
            x: 80 + (i % 25) * 48,
            y: 80 + Math.floor(i / 25) * 48,
            size: 1,
            hpCurrent: 10,
            hpMax: 10,
            ac: 12,
            faction: i % 3 === 0 ? 'enemy' : 'party',
            markerColor: i % 3 === 0 ? '#ef4444' : '#22c55e',
            visibleToPlayers: i % 4 !== 0,
          })
        }
        for (let i = 0; i < 120; i += 1) {
          await api.walls.create({
            mapId: id,
            x1: 100 + (i % 20) * 60,
            y1: 120 + Math.floor(i / 20) * 80,
            x2: 140 + (i % 20) * 60,
            y2: 150 + Math.floor(i / 20) * 80,
            wallType: i % 5 === 0 ? 'door' : 'wall',
          })
        }
        for (let i = 0; i < 60; i += 1) {
          await api.drawings.create({
            mapId: id,
            type: 'freehand',
            points: [120 + i * 6, 520, 140 + i * 6, 540, 180 + i * 6, 530],
            color: i % 2 === 0 ? '#f59e0b' : '#3b82f6',
            width: 4,
            synced: true,
          })
        }
      }, mapId)

      const started = Date.now()
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 20_000 })
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await dmWindow.getByTestId('button-open-map').first().click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 20_000 })
      expect(Date.now() - started).toBeLessThan(25_000)

      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(400)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.walls.listByMap(id), mapId))
        .toHaveLength(120)
    } finally {
      await close()
    }
  })

  test('large audio library filtering remains responsive', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `Nightly Audio ${Date.now()}`)
      await dmWindow.evaluate(async (id) => {
        const api = (window as any).electronAPI
        for (let i = 0; i < 600; i += 1) {
          await api.tracks.create({
            campaignId: id,
            path: `tracks/nightly-${i}.mp3`,
            fileName: `${i % 3 === 0 ? 'Combat' : i % 3 === 1 ? 'Travel' : 'Ambient'} Nightly ${String(i).padStart(3, '0')}.mp3`,
            soundtrack: i % 3 === 0 ? 'Combat' : i % 3 === 1 ? 'Travel' : 'Ambient',
          })
        }
      }, campaignId)

      await dmWindow.getByTestId('nav-workspace-audio').click()
      await expect(dmWindow.getByTestId('list-item-track')).toHaveCount(600, { timeout: 20_000 })
      const started = Date.now()
      await dmWindow.getByTestId('input-track-search').fill('Combat')
      await expect(dmWindow.getByTestId('list-item-track')).toHaveCount(200, { timeout: 20_000 })
      expect(Date.now() - started).toBeLessThan(8_000)
    } finally {
      await close()
    }
  })
})
