import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog } from '../helpers/dialog-helpers'

const DEMO_MAP = resolve(__dirname, '../testcontent/maps/cave.png')

async function createCampaign(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('button-create-campaign').click()
  await page.getByTestId('input-campaign-name').fill(name)
  await page.getByTestId('button-confirm-create-campaign').click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
}

test.describe('Accessibility panel focus basics', () => {
  test.describe.configure({ timeout: 60_000 })

  test('workspace panel controls expose stable keyboard-focusable entry points', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `A11y Panels ${Date.now()}`)

      await dmWindow.getByTestId('nav-workspace-notes').click()
      await dmWindow.getByTestId('button-create-note').focus()
      await expect(dmWindow.getByTestId('button-create-note')).toBeFocused()

      await dmWindow.getByTestId('nav-workspace-handouts').click()
      await dmWindow.getByTestId('button-create-handout').focus()
      await expect(dmWindow.getByTestId('button-create-handout')).toBeFocused()

      await dmWindow.getByTestId('nav-workspace-characters').click()
      await dmWindow.getByTestId('button-create-character-sheet').focus()
      await expect(dmWindow.getByTestId('button-create-character-sheet')).toBeFocused()

      await dmWindow.getByTestId('nav-workspace-audio').click()
      await dmWindow.getByTestId('button-add-audio-folder').focus()
      await expect(dmWindow.getByTestId('button-add-audio-folder')).toBeFocused()
    } finally {
      await close()
    }
  })

  test('canvas toolbar and sidebar controls are reachable by focus', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      expect(existsSync(DEMO_MAP), `Missing demo map at ${DEMO_MAP}`).toBe(true)
      await createCampaign(dmWindow, `A11y Canvas ${Date.now()}`)
      await mockOpenDialog(app, [DEMO_MAP])
      await dmWindow.getByTestId('button-import-first-map').click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })

      await dmWindow.getByTestId('canvas-area').focus()
      await expect(dmWindow.getByTestId('canvas-area')).toBeFocused()

      await dmWindow.getByTestId('button-canvas-tool-select').focus()
      await expect(dmWindow.getByTestId('button-canvas-tool-select')).toBeFocused()

      await dmWindow.getByTestId('button-sidebar-tab-initiative').focus()
      await expect(dmWindow.getByTestId('button-sidebar-tab-initiative')).toBeFocused()
    } finally {
      await close()
    }
  })
})
