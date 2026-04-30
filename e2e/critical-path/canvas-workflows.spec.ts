import { test, expect, type Page } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockConfirmDialog, mockOpenDialog, mockOpenDialogCancel } from '../helpers/dialog-helpers'

const DEMO_MAP = resolve(__dirname, '../testcontent/maps/bridge.png')

async function openImportedMap(page: Page, app: Awaited<ReturnType<typeof launchApp>>['app'], campaignName: string) {
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(campaignName)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
  await mockOpenDialog(app, [DEMO_MAP])
  await page.getByTestId('button-import-first-map').click()
  await expect(page.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('toolbar')).toBeVisible()
  await expect.poll(() => page.locator('.canvas-area canvas').count(), { timeout: 15_000 }).toBeGreaterThan(0)
}

async function firstMapId(page: Page): Promise<number> {
  const map = await firstMap(page)
  return map.id
}

async function firstMap(page: Page): Promise<{ id: number; name: string }> {
  const maps = await page.evaluate(async () => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    return (window as any).electronAPI.maps.list(campaigns[0].id)
  })
  expect(maps.length).toBeGreaterThan(0)
  return maps[0]
}

test.describe('Canvas workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test.beforeEach(() => {
    expect(existsSync(DEMO_MAP), `Missing demo map at ${DEMO_MAP}`).toBe(true)
  })

  test('opens a map with toolbar, tool dock, and canvas visible', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openImportedMap(dmWindow, app, `Canvas Visible ${Date.now()}`)
      await expect(dmWindow.getByTestId('canvas-tool-dock')).toBeVisible()
      await expect(dmWindow.getByTestId('canvas-layer-dock')).toBeVisible()
    } finally {
      await close()
    }
  })

  test('creates, displays, and deletes a token via the canvas token panel', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openImportedMap(dmWindow, app, `Canvas Token ${Date.now()}`)
      await expect(dmWindow.getByTestId('panel-tokens')).toBeVisible()

      await mockOpenDialogCancel(app)
      await dmWindow.getByTestId('button-create-blank-token').click()
      await expect(dmWindow.getByTestId('list-item-token').filter({ hasText: 'Token' })).toBeVisible()

      const mapId = await firstMapId(dmWindow)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(1)

      await mockConfirmDialog(app, true)
      await dmWindow.getByTestId('button-delete-token').click()
      await expect(dmWindow.getByTestId('list-item-token')).toHaveCount(0)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(0)
    } finally {
      await close()
    }
  })

  test('covering fog changes persisted fog state', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openImportedMap(dmWindow, app, `Canvas Fog ${Date.now()}`)
      const mapId = await firstMapId(dmWindow)
      const before = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)

      await dmWindow.evaluate(() => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))
      })
      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap && fog.fogBitmap !== before.fogBitmap
      }, { timeout: 8_000 }).toBeTruthy()
    } finally {
      await close()
    }
  })

  test('undo and redo restore a simple fog action', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openImportedMap(dmWindow, app, `Canvas Undo ${Date.now()}`)
      const mapId = await firstMapId(dmWindow)

      await dmWindow.evaluate(() => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))
      })
      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap
      }, { timeout: 8_000 }).not.toBeNull()
      const covered = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id).then((f: any) => f.fogBitmap), mapId)

      await expect(dmWindow.getByTestId('button-undo')).toBeEnabled()
      await dmWindow.getByTestId('button-undo').click()
      await expect(dmWindow.getByTestId('button-redo')).toBeEnabled()
      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap !== covered
      }, { timeout: 8_000 }).toBeTruthy()

      await dmWindow.getByTestId('button-redo').click()
      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap === covered
      }, { timeout: 8_000 }).toBeTruthy()
    } finally {
      await close()
    }
  })

  test('returning to campaign keeps the imported map listed', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const campaignName = `Canvas Return ${Date.now()}`
      await openImportedMap(dmWindow, app, campaignName)
      const map = await firstMap(dmWindow)
      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne/i }).click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible()
      await dmWindow.getByTestId('nav-workspace-maps').click()
      await expect(dmWindow.getByTestId('list-item-map').filter({ hasText: map.name })).toBeVisible()
    } finally {
      await close()
    }
  })
})
