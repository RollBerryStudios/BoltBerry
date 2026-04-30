import { test, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog, mockSaveDialogCancel } from '../helpers/dialog-helpers'

function tempDir(prefix: string): string {
  return mkdtempSync(resolve(tmpdir(), prefix))
}

function zipDir(dir: string, name: string): string {
  const zipPath = resolve(tmpdir(), `${name}-${Date.now()}.zip`)
  execFileSync('/usr/bin/zip', ['-qr', zipPath, '.'], { cwd: dir })
  return zipPath
}

async function createCampaignAndOpenWorkspace(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(name)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
}

test.describe('File workflow negative cases', () => {
  test.describe.configure({ timeout: 60_000 })

  test('invalid image file is rejected as a map without creating a map or crashing', async () => {
    const { app, dmWindow, close } = await launchApp()
    const dir = tempDir('boltberry-invalid-map-')
    const invalidImage = join(dir, 'not-a-real-image.png')
    writeFileSync(invalidImage, 'plain text with a png extension', 'utf8')

    try {
      await createCampaignAndOpenWorkspace(dmWindow, `Invalid Map ${Date.now()}`)
      await mockOpenDialog(app, [invalidImage])
      await dmWindow.getByTestId('button-import-first-map').click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible()
      await expect(dmWindow.getByTestId('list-item-map')).toHaveCount(0)

      const maps = await dmWindow.evaluate(async () => {
        const campaigns = await (window as any).electronAPI.campaigns.list()
        return (window as any).electronAPI.maps.list(campaigns[0].id)
      })
      expect(maps).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await close()
    }
  })

  test('non-existent campaign import file returns an error and keeps the app alive', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const missingPath = resolve(tmpdir(), `missing-${Date.now()}.zip`)
      await mockOpenDialog(app, [missingPath])
      const result = await dmWindow.evaluate(() => (window as any).electronAPI.importCampaign())
      expect(result.success).toBe(false)
      expect(result.error).toContain('existiert nicht')
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible()
    } finally {
      await close()
    }
  })

  test('cancelled campaign export does not create a file', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const campaign = await dmWindow.evaluate(() => (window as any).electronAPI.campaigns.create(`Export Cancel ${Date.now()}`))
      const expectedPath = resolve(tmpdir(), `should-not-exist-${Date.now()}.zip`)
      await mockSaveDialogCancel(app)
      const result = await dmWindow.evaluate((id) => (window as any).electronAPI.exportCampaign(id), campaign.id)
      expect(result.success).toBe(false)
      expect(result.canceled).toBe(true)
      expect(existsSync(expectedPath)).toBe(false)
    } finally {
      await close()
    }
  })

  test('ZIP without campaign.json returns a clear error', async () => {
    const { app, dmWindow, close } = await launchApp()
    const dir = tempDir('boltberry-zip-missing-json-')
    let zipPath = ''
    try {
      writeFileSync(join(dir, 'readme.txt'), 'not a campaign archive', 'utf8')
      zipPath = zipDir(dir, 'boltberry-missing-campaign-json')
      await mockOpenDialog(app, [zipPath])
      const result = await dmWindow.evaluate(() => (window as any).electronAPI.importCampaign())
      expect(result.success).toBe(false)
      expect(result.error).toContain('campaign.json fehlt')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      if (zipPath) rmSync(zipPath, { force: true })
      await close()
    }
  })

  test('ZIP with invalid campaign.json returns an error', async () => {
    const { app, dmWindow, close } = await launchApp()
    const dir = tempDir('boltberry-zip-invalid-json-')
    let zipPath = ''
    try {
      writeFileSync(join(dir, 'campaign.json'), '{ definitely not valid json', 'utf8')
      zipPath = zipDir(dir, 'boltberry-invalid-campaign-json')
      await mockOpenDialog(app, [zipPath])
      const result = await dmWindow.evaluate(() => (window as any).electronAPI.importCampaign())
      expect(result.success).toBe(false)
      expect(result.error).toContain('campaign.json konnte nicht gelesen werden')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      if (zipPath) rmSync(zipPath, { force: true })
      await close()
    }
  })
})
