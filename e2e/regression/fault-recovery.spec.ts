import { test, expect } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog, mockSaveDialog } from '../helpers/dialog-helpers'
import { createCampaign, TEST_MAPS, TEST_TRACKS_DIR } from '../helpers/test-data'

function tempDir(prefix: string): string {
  return mkdtempSync(resolve(tmpdir(), prefix))
}

test.describe('Fault recovery and platform-path boundaries', () => {
  test.describe.configure({ timeout: 90_000 })

  test('imports map and exports campaign through unicode and space-heavy paths', async () => {
    const { app, dmWindow, close } = await launchApp()
    const dir = tempDir('boltberry-pfade-Ü space-')
    const sourceMap = join(dir, 'Brücke mit Leerzeichen ü.png')
    const exportDir = join(dir, 'Export Ziel ü')
    const exportPath = join(exportDir, 'Kampagne mit Leerzeichen.zip')

    try {
      copyFileSync(TEST_MAPS.bridge, sourceMap)
      mkdirSync(exportDir, { recursive: true })
      const campaignId = await createCampaign(dmWindow, `Pfad Recovery ${Date.now()}`)

      await mockOpenDialog(app, [sourceMap])
      await dmWindow.getByTestId('button-import-first-map').click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
      await expect.poll(async () => {
        const maps = await dmWindow.evaluate((id) => (window as any).electronAPI.maps.list(id), campaignId)
        return maps.length === 1 && /assets[\\/]+map[\\/].+\.png$/i.test(maps[0].imagePath)
      }).toBe(true)

      await mockSaveDialog(app, exportPath)
      const result = await dmWindow.evaluate((id) => (window as any).electronAPI.exportCampaign(id), campaignId)
      expect(result.success).toBe(true)
      expect(existsSync(exportPath)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await close()
    }
  })

  test('corrupt audio files are skipped without creating tracks or crashing the library', async () => {
    const { app, dmWindow, close } = await launchApp()
    const dir = tempDir('boltberry-corrupt-audio-')
    const corruptAudio = join(dir, 'not really audio.mp3')

    try {
      writeFileSync(corruptAudio, 'this is text pretending to be mp3', 'utf8')
      const campaignId = await createCampaign(dmWindow, `Corrupt Audio ${Date.now()}`)

      await mockOpenDialog(app, [corruptAudio])
      const imported = await dmWindow.evaluate((id) => (window as any).electronAPI.tracks.importFiles(id), campaignId)
      expect(imported).toEqual([])

      await dmWindow.getByTestId('nav-workspace-audio').click()
      await expect(dmWindow.getByTestId('panel-audio-library')).toBeVisible()
      await expect(dmWindow.getByTestId('list-item-track')).toHaveCount(0)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tracks.listByCampaign(id), campaignId))
        .toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await close()
    }
  })

  test('audio folder import ignores unsupported files and symlinked directories', async () => {
    test.skip(process.platform === 'win32', 'Directory symlink creation is not reliable on Windows CI without elevated privileges.')

    const { app, dmWindow, close } = await launchApp()
    const dir = tempDir('boltberry-audio-folder-edge-')

    try {
      writeFileSync(join(dir, 'notes.txt'), 'not an audio file', 'utf8')
      symlinkSync(TEST_TRACKS_DIR, join(dir, 'linked-real-tracks'), 'dir')
      const campaignId = await createCampaign(dmWindow, `Symlink Audio ${Date.now()}`)

      await mockOpenDialog(app, [dir])
      const result = await dmWindow.evaluate((id) => (window as any).electronAPI.tracks.importFolder(id), campaignId)
      expect(result?.files).toEqual([])
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tracks.listByCampaign(id), campaignId))
        .toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await close()
    }
  })

  test('missing referenced map asset keeps workspace usable and the bad map removable', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const campaignId = await createCampaign(dmWindow, `Missing Asset ${Date.now()}`)
      await dmWindow.evaluate((id) => (window as any).electronAPI.maps.create({
        campaignId: id,
        name: 'Missing Asset Map',
        imagePath: 'assets/map/does-not-exist.png',
      }), campaignId)

      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
      const row = dmWindow.getByTestId('list-item-map').filter({ hasText: 'Missing Asset Map' })
      await expect(row).toBeVisible()

      await dmWindow.evaluate(async (id) => {
        const maps = await (window as any).electronAPI.maps.list(id)
        await (window as any).electronAPI.maps.delete(maps.find((map: any) => map.name === 'Missing Asset Map').id)
      }, campaignId)
      await dmWindow.reload()
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await expect(dmWindow.getByTestId('list-item-map')).toHaveCount(0)
    } finally {
      await close()
    }
  })
})
