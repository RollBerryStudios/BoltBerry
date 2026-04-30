import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { mockOpenDialog } from './dialog-helpers'

export const TEST_MAPS = {
  bridge: resolve(__dirname, '../testcontent/maps/bridge.png'),
  cave: resolve(__dirname, '../testcontent/maps/cave.png'),
  castle: resolve(__dirname, '../testcontent/maps/castle.png'),
}

export const TEST_TRACKS_DIR = resolve(__dirname, '../testcontent/tracks')

export async function createCampaign(page: Page, name: string): Promise<number> {
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(name)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
  return activeCampaignId(page)
}

export async function activeCampaignId(page: Page): Promise<number> {
  const id = await page.evaluate(async () => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    return campaigns[0]?.id
  })
  expect(id).toBeTruthy()
  return id
}

export async function firstMapId(page: Page): Promise<number> {
  const mapId = await page.evaluate(async () => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    const maps = await (window as any).electronAPI.maps.list(campaigns[0].id)
    return maps[0]?.id
  })
  expect(mapId).toBeTruthy()
  return mapId
}

export async function importMapAndOpenCanvas(
  page: Page,
  app: ElectronApplication,
  mapPath = TEST_MAPS.bridge,
): Promise<number> {
  expect(existsSync(mapPath), `Missing demo map at ${mapPath}`).toBe(true)
  await mockOpenDialog(app, [mapPath])
  await page.getByTestId('button-import-first-map').click()
  await expect(page.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => page.locator('.canvas-area canvas').count(), { timeout: 15_000 }).toBeGreaterThan(0)
  return firstMapId(page)
}

export async function openSeededCanvas(
  page: Page,
  app: ElectronApplication,
  campaignName: string,
  mapPath = TEST_MAPS.bridge,
): Promise<{ campaignId: number; mapId: number }> {
  const campaignId = await createCampaign(page, campaignName)
  const mapId = await importMapAndOpenCanvas(page, app, mapPath)
  return { campaignId, mapId }
}

export async function seedCanvasEntities(page: Page, mapId: number): Promise<void> {
  await page.evaluate(async (id) => {
    const api = (window as any).electronAPI
    await api.tokens.create({
      mapId: id,
      name: 'Visual Knight',
      x: 260,
      y: 220,
      size: 1,
      hpCurrent: 18,
      hpMax: 24,
      ac: 16,
      faction: 'party',
      markerColor: '#22c55e',
      visibleToPlayers: true,
    })
    await api.tokens.create({
      mapId: id,
      name: 'Hidden Scout',
      x: 420,
      y: 340,
      size: 1,
      hpCurrent: 9,
      hpMax: 9,
      ac: 13,
      faction: 'enemy',
      markerColor: '#ef4444',
      visibleToPlayers: false,
    })
    await api.walls.create({ mapId: id, x1: 180, y1: 160, x2: 620, y2: 160, wallType: 'wall' })
    await api.rooms.create({
      mapId: id,
      name: 'Vault',
      polygon: JSON.stringify([{ x: 700, y: 220 }, { x: 940, y: 220 }, { x: 900, y: 420 }, { x: 720, y: 390 }]),
      color: '#3b82f6',
      visibleToPlayers: true,
    })
    await api.drawings.create({
      mapId: id,
      type: 'freehand',
      points: [320, 520, 360, 560, 420, 550, 480, 600],
      color: '#f59e0b',
      width: 6,
      synced: true,
    })
  }, mapId)
  await page.reload()
  await expect(page.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('list-item-campaign').first().click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('button-open-map').first().click()
  await expect(page.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
}

export async function seedWorkspacePanels(page: Page, campaignId: number): Promise<void> {
  await page.evaluate(async (id) => {
    const api = (window as any).electronAPI
    await api.notes.create({
      campaignId: id,
      title: 'Visual Session Note',
      content: 'The gate opens only under moonlight.',
      category: 'Allgemein',
    })
    await api.handouts.create({
      campaignId: id,
      title: 'Ancient Handout',
      imagePath: null,
      textContent: 'A copied inscription from the old wall.',
    })
    await api.characterSheets.create(id, 'Mira Ashvale')
    await api.tracks.create({
      campaignId: id,
      path: 'tracks/visual-theme.ogg',
      fileName: 'Visual Theme.ogg',
      soundtrack: 'Visual',
    })
    await api.tokenTemplates.create({
      category: 'npc',
      name: `Visual Guide ${id}`,
      size: 1,
      hp_max: 12,
      ac: 14,
      faction: 'neutral',
      marker_color: '#f59e0b',
    })
  }, campaignId)
}

export async function canvasPoint(page: Page, xPct: number, yPct: number): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('canvas-area').boundingBox()
  expect(box).not.toBeNull()
  return {
    x: box!.x + box!.width * xPct,
    y: box!.y + box!.height * yPct,
  }
}

export async function selectCanvasTool(page: Page, groupId: string, toolId?: string): Promise<void> {
  await page.getByTestId(`button-canvas-tool-${groupId}`).click()
  if (!toolId) return
  await page.getByTestId(`button-canvas-tool-${groupId}`).click()
  await expect(page.getByTestId(`canvas-tool-popover-${groupId}`)).toBeVisible()
  await page.getByTestId(`button-canvas-tool-${toolId}`).click()
}
