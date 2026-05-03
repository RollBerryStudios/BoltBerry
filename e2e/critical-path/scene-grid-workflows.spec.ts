import { test, expect, type Page } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { openSeededCanvas, TEST_MAPS } from '../helpers/test-data'

test.describe('Scene grid and rotation workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test('grid controls, display style, and DM/player rotations persist from the scene panel', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Scene Grid ${Date.now()}`, TEST_MAPS.castle)

      await expect(dmWindow.getByTestId('button-grid-toggle')).toBeVisible()
      await dmWindow.getByTestId('button-grid-toggle').click()
      await expect.poll(() => mapField(dmWindow, mapId, 'gridType')).toBe('none')

      await dmWindow.getByTestId('button-grid-toggle').click()
      await expect.poll(() => mapField(dmWindow, mapId, 'gridType')).toBe('square')

      await dmWindow.getByLabel('Raster-Feldgröße in Pixeln').fill('72')
      await dmWindow.getByLabel('Raster-Feldgröße in Pixeln').blur()
      await expect.poll(() => mapField(dmWindow, mapId, 'gridSize')).toBe(72)

      await dmWindow.getByTestId('input-grid-feet-per-unit').fill('10')
      await expect.poll(() => mapField(dmWindow, mapId, 'ftPerUnit')).toBe(10)

      await dmWindow.getByTestId('button-grid-color-black').click()
      await expect.poll(() => mapField(dmWindow, mapId, 'gridColor')).toContain('0,0,0')

      await dmWindow.getByTestId('button-dm-rotation-90').click()
      await expect.poll(() => mapField(dmWindow, mapId, 'rotation')).toBe(90)

      await dmWindow.getByTestId('button-player-rotation-180').click()
      await expect.poll(() => mapField(dmWindow, mapId, 'rotationPlayer')).toBe(180)
    } finally {
      await close()
    }
  })
})

async function mapField(page: Page, mapId: number, field: string) {
  return page.evaluate(async ({ id, key }: { id: number; key: string }) => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    const maps = await (window as any).electronAPI.maps.list(campaigns[0].id)
    const map = maps.find((candidate: any) => candidate.id === id)
    return map?.[key]
  }, { id: mapId, key: field })
}
