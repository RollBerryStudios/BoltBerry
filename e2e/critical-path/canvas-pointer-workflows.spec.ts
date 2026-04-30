import { test, expect, type Page, type ElectronApplication } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog, mockOpenDialogCancel } from '../helpers/dialog-helpers'

const DEMO_MAP = resolve(__dirname, '../testcontent/maps/bridge.png')
const MAP_SIZE = { width: 1536, height: 1024 }

async function openImportedMap(page: Page, app: ElectronApplication, campaignName: string) {
  expect(existsSync(DEMO_MAP), `Missing demo map at ${DEMO_MAP}`).toBe(true)
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(campaignName)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
  await mockOpenDialog(app, [DEMO_MAP])
  await page.getByTestId('button-import-first-map').click()
  await expect(page.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => page.locator('.canvas-area canvas').count(), { timeout: 15_000 }).toBeGreaterThan(0)
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

async function canvasPoint(page: Page, xPct: number, yPct: number) {
  const box = await page.getByTestId('canvas-area').boundingBox()
  expect(box).not.toBeNull()
  return {
    x: box!.x + box!.width * xPct,
    y: box!.y + box!.height * yPct,
  }
}

async function mapPointToScreen(page: Page, mapX: number, mapY: number) {
  const box = await page.getByTestId('canvas-area').boundingBox()
  expect(box).not.toBeNull()
  const scale = Math.min(box!.width / MAP_SIZE.width, box!.height / MAP_SIZE.height) * 0.95
  const offsetX = (box!.width - MAP_SIZE.width * scale) / 2
  const offsetY = (box!.height - MAP_SIZE.height * scale) / 2
  return {
    x: box!.x + offsetX + mapX * scale,
    y: box!.y + offsetY + mapY * scale,
  }
}

async function selectTool(page: Page, groupId: string, toolId?: string) {
  await page.getByTestId(`button-canvas-tool-${groupId}`).click()
  if (!toolId) return
  await page.getByTestId(`button-canvas-tool-${groupId}`).click()
  await expect(page.getByTestId(`canvas-tool-popover-${groupId}`)).toBeVisible()
  await page.getByTestId(`button-canvas-tool-${toolId}`).click()
}

test.describe('Canvas pointer workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test('dragging a token with the pointer updates its persisted map position', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openImportedMap(dmWindow, app, `Pointer Token ${Date.now()}`)
      const mapId = await firstMapId(dmWindow)

      await mockOpenDialogCancel(app)
      await dmWindow.getByTestId('button-create-blank-token').click()
      await expect(dmWindow.getByTestId('list-item-token').filter({ hasText: 'Token' })).toBeVisible()
      await dmWindow.getByTestId('button-canvas-tool-select').click()

      const before = await dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId)
      expect(before).toHaveLength(1)
      const gridSize = await dmWindow.evaluate(async (id) => {
        const campaigns = await (window as any).electronAPI.campaigns.list()
        const maps = await (window as any).electronAPI.maps.list(campaigns[0].id)
        return maps.find((map: any) => map.id === id)?.gridSize ?? 50
      }, mapId)
      const centerOffset = (before[0].size || 1) * gridSize / 2
      const start = await mapPointToScreen(dmWindow, before[0].x + centerOffset, before[0].y + centerOffset)
      const end = await mapPointToScreen(dmWindow, before[0].x + centerOffset + 225, before[0].y + centerOffset + 175)

      await dmWindow.mouse.move(start.x, start.y)
      await dmWindow.mouse.down()
      await dmWindow.mouse.move(end.x, end.y, { steps: 12 })
      await dmWindow.mouse.up()

      await expect.poll(async () => {
        const after = await dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId)
        return Math.abs(after[0].x - before[0].x) + Math.abs(after[0].y - before[0].y)
      }, { timeout: 8_000 }).toBeGreaterThan(50)
    } finally {
      await close()
    }
  })

  test('wall, drawing, and room tools create persisted geometry with real pointer input', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openImportedMap(dmWindow, app, `Pointer Geometry ${Date.now()}`)
      const mapId = await firstMapId(dmWindow)

      await selectTool(dmWindow, 'environment')
      const wallStart = await canvasPoint(dmWindow, 0.35, 0.35)
      const wallEnd = await canvasPoint(dmWindow, 0.58, 0.35)
      await dmWindow.mouse.move(wallStart.x, wallStart.y)
      await dmWindow.mouse.down()
      await dmWindow.mouse.move(wallEnd.x, wallEnd.y, { steps: 8 })
      await dmWindow.mouse.up()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.walls.listByMap(id), mapId))
        .toHaveLength(1)

      await selectTool(dmWindow, 'draw')
      const drawStart = await canvasPoint(dmWindow, 0.40, 0.48)
      const drawEnd = await canvasPoint(dmWindow, 0.58, 0.56)
      await dmWindow.mouse.move(drawStart.x, drawStart.y)
      await dmWindow.mouse.down()
      await dmWindow.mouse.move(drawEnd.x, drawEnd.y, { steps: 10 })
      await dmWindow.mouse.up()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.drawings.listByMap(id), mapId))
        .toHaveLength(1)

      await selectTool(dmWindow, 'environment', 'room')
      const p1 = await canvasPoint(dmWindow, 0.62, 0.42)
      const p2 = await canvasPoint(dmWindow, 0.74, 0.42)
      const p3 = await canvasPoint(dmWindow, 0.68, 0.58)
      await dmWindow.mouse.click(p1.x, p1.y)
      await dmWindow.mouse.click(p2.x, p2.y)
      await dmWindow.mouse.click(p3.x, p3.y)
      await dmWindow.keyboard.press('Enter')
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.rooms.listByMap(id), mapId))
        .toHaveLength(1)
    } finally {
      await close()
    }
  })
})
