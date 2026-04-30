import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { launchAppWithUserDataDir, relaunchApp, type LaunchResult } from '../helpers/electron-launch'
import { mockConfirmDialog, mockOpenDialog } from '../helpers/dialog-helpers'

const DEMO_MAP = resolve(__dirname, '../testcontent/maps/cave.png')

function tempProfile(prefix: string): string {
  return mkdtempSync(resolve(tmpdir(), prefix))
}

async function waitForDashboard(page: Page) {
  await expect(page.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
}

async function createCampaignViaDashboard(page: Page, name: string) {
  await waitForDashboard(page)
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(name)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
}

async function openCampaign(page: Page, name: string) {
  await waitForDashboard(page)
  await page.getByTestId('list-item-campaign').filter({ hasText: name }).click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
}

async function openMapsTab(page: Page) {
  await page.getByTestId('nav-workspace-maps').click()
  await expect(page.getByTestId('button-import-map-empty').or(page.getByTestId('list-item-map').first())).toBeVisible({ timeout: 15_000 })
}

async function firstMapName(page: Page): Promise<string> {
  const maps = await page.evaluate(async () => {
    const campaigns = await (window as any).electronAPI.campaigns.list()
    return (window as any).electronAPI.maps.list(campaigns[0].id)
  })
  expect(maps.length).toBeGreaterThan(0)
  return maps[0].name
}

async function reloadDashboardData(page: Page) {
  await page.reload()
  await waitForDashboard(page)
}

test.describe('Restart persistence', () => {
  test.describe.configure({ timeout: 90_000 })

  let launch: LaunchResult | null = null
  let userDataDir = ''

  test.afterEach(async () => {
    await launch?.close().catch(() => {})
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
    launch = null
    userDataDir = ''
  })

  test('campaign remains visible after closing and relaunching with the same profile', async () => {
    userDataDir = tempProfile('boltberry-persist-campaign-')
    launch = await launchAppWithUserDataDir(userDataDir, { cleanupUserDataDir: false })
    const name = `Persist Campaign ${Date.now()}`

    await createCampaignViaDashboard(launch.dmWindow, name)
    await launch.dmWindow.getByTestId('nav-dashboard').click()
    await waitForDashboard(launch.dmWindow)

    launch = await relaunchApp(launch)
    await expect(launch.dmWindow.getByTestId('list-item-campaign').filter({ hasText: name })).toBeVisible()
  })

  test('renamed campaign keeps the new name across restart', async () => {
    userDataDir = tempProfile('boltberry-persist-rename-')
    launch = await launchAppWithUserDataDir(userDataDir, { cleanupUserDataDir: false })
    const oldName = `Rename Before ${Date.now()}`
    const newName = `Rename After ${Date.now()}`

    await launch.dmWindow.evaluate((name) => (window as any).electronAPI.campaigns.create(name), oldName)
    await reloadDashboardData(launch.dmWindow)
    const row = launch.dmWindow.getByTestId('list-item-campaign').filter({ hasText: oldName })
    await row.hover()
    await row.getByTestId('button-rename-campaign').click()
    const renameInput = launch.dmWindow.getByTestId('input-campaign-rename')
    await expect(renameInput).toBeVisible()
    await renameInput.fill(newName)
    await renameInput.press('Enter')
    await expect(launch.dmWindow.getByTestId('list-item-campaign').filter({ hasText: newName })).toBeVisible()

    launch = await relaunchApp(launch)
    await expect(launch.dmWindow.getByTestId('list-item-campaign').filter({ hasText: newName })).toBeVisible()
    await expect(launch.dmWindow.getByText(oldName)).toHaveCount(0)
  })

  test('deleted campaign stays removed after restart', async () => {
    userDataDir = tempProfile('boltberry-persist-delete-')
    launch = await launchAppWithUserDataDir(userDataDir, { cleanupUserDataDir: false })
    const name = `Delete Persist ${Date.now()}`

    await launch.dmWindow.evaluate((campaignName) => (window as any).electronAPI.campaigns.create(campaignName), name)
    await reloadDashboardData(launch.dmWindow)
    await mockConfirmDialog(launch.app, true)
    const row = launch.dmWindow.getByTestId('list-item-campaign').filter({ hasText: name })
    await row.hover()
    await row.getByTestId('button-delete-campaign').click()
    await expect(row).toHaveCount(0)

    launch = await relaunchApp(launch)
    await expect(launch.dmWindow.getByText(name)).toHaveCount(0)
  })

  test('imported map remains in the campaign workspace after restart', async () => {
    expect(existsSync(DEMO_MAP), `Missing demo map at ${DEMO_MAP}`).toBe(true)
    userDataDir = tempProfile('boltberry-persist-map-')
    launch = await launchAppWithUserDataDir(userDataDir, { cleanupUserDataDir: false })
    const name = `Map Persist ${Date.now()}`

    await createCampaignViaDashboard(launch.dmWindow, name)
    await mockOpenDialog(launch.app, [DEMO_MAP])
    await launch.dmWindow.getByTestId('button-import-first-map').click()
    await expect(launch.dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
    const mapName = await firstMapName(launch.dmWindow)

    launch = await relaunchApp(launch)
    await openCampaign(launch.dmWindow, name)
    await openMapsTab(launch.dmWindow)
    await expect(launch.dmWindow.getByTestId('list-item-map').filter({ hasText: mapName })).toBeVisible()
  })

  test('theme, language, and data folder survive restart', async () => {
    userDataDir = tempProfile('boltberry-persist-settings-')
    const dataFolder = tempProfile('boltberry-persist-settings-data-')
    launch = await launchAppWithUserDataDir(userDataDir, { cleanupUserDataDir: false })

    await launch.dmWindow.getByTestId('button-open-settings').click()
    await expect(launch.dmWindow.getByRole('dialog', { name: /Einstellungen|Settings/i })).toBeVisible()
    await launch.dmWindow.getByTestId('settings-tab-appearance').click()
    await launch.dmWindow.getByTestId('button-theme-light').click()
    await launch.dmWindow.getByTestId('button-language-en').click()
    await launch.dmWindow.getByTestId('settings-tab-storage').click()
    await mockOpenDialog(launch.app, [dataFolder])
    await launch.dmWindow.getByTestId('button-change-data-folder').click()
    await expect(launch.dmWindow.getByTestId('settings-data-folder')).toContainText(dataFolder)

    launch = await relaunchApp(launch, { skipSetupWizard: false })
    await waitForDashboard(launch.dmWindow)
    await expect.poll(() => launch!.dmWindow.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light')
    await launch.dmWindow.getByTestId('button-open-settings').click()
    await launch.dmWindow.getByTestId('settings-tab-storage').click()
    await expect(launch.dmWindow.getByTestId('settings-data-folder')).toContainText(dataFolder)

    rmSync(dataFolder, { recursive: true, force: true })
  })
})
