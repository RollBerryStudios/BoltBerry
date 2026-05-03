import { test, expect, type Page } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { canvasPoint, openSeededCanvas, TEST_MAPS } from '../helpers/test-data'

test.describe('Canvas context menu actions', () => {
  test.describe.configure({ timeout: 90_000 })

  test('canvas context submenu actions rotate the scene, update fog, and close cleanly', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Canvas Context ${Date.now()}`, TEST_MAPS.cave)

      await openCanvasMenu(dmWindow)
      await dmWindow.getByRole('menuitem', { name: /Drehen|Rotate/i }).hover()
      await dmWindow.keyboard.press('ArrowRight')
      await dmWindow.getByRole('menuitem', { name: /90/ }).click()
      await expect(dmWindow.getByRole('menu')).toHaveCount(0)
      await expect.poll(() => mapField(dmWindow, mapId, 'rotation')).toBe(90)
      await expect.poll(() => mapField(dmWindow, mapId, 'rotationPlayer')).toBe(90)

      await openCanvasMenu(dmWindow)
      await dmWindow.getByRole('menuitem', { name: /Nebel|Fog/i }).hover()
      await dmWindow.keyboard.press('ArrowRight')
      await dmWindow.getByRole('menuitem', { name: /Alles (?:zu|ver)decken|Cover All/i }).click()
      await expect(dmWindow.getByRole('menu')).toHaveCount(0)
      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap
      }, { timeout: 8_000 }).not.toBeNull()
    } finally {
      await close()
    }
  })
})

async function openCanvasMenu(page: Page): Promise<void> {
  const p = await canvasPoint(page, 0.12, 0.16)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await expect(page.getByRole('menu').first()).toBeVisible()
}

async function mapField(page: Page, mapId: number, field: string) {
  return page.evaluate(async ({ id, key }: { id: number; key: string }) => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    const maps = await (window as any).electronAPI.maps.list(campaigns[0].id)
    const map = maps.find((candidate: any) => candidate.id === id)
    return map?.[key]
  }, { id: mapId, key: field })
}
