import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { mockConfirmDialog, mockOpenDialog, mockOpenDialogCancel } from '../helpers/dialog-helpers'
import { createCampaign, TEST_TRACKS_DIR } from '../helpers/test-data'

test.describe('Panel depth workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test('notes can be searched, edited, and deleted from the panel', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `Panel Notes ${Date.now()}`)

      await dmWindow.getByTestId('nav-workspace-notes').click()
      await dmWindow.getByTestId('button-create-note').click()
      await dmWindow.getByTestId('input-note-title').fill('Moon Gate')
      await dmWindow.getByTestId('textarea-note-body').fill('First draft')
      await dmWindow.getByTestId('textarea-note-body').blur()
      await expect(dmWindow.getByTestId('list-item-note').filter({ hasText: 'Moon Gate' })).toBeVisible()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.notes.listCategoryByCampaign(id), campaignId)
        return rows.some((row: any) => row.title === 'Moon Gate')
      }).toBe(true)

      await dmWindow.getByTestId('input-note-search').fill('Moon')
      const searchHit = dmWindow.getByRole('button', { name: /Moon Gate/i }).first()
      await expect(searchHit).toBeVisible()
      await searchHit.click()
      await dmWindow.getByTestId('input-note-title').fill('Moon Gate Revised')
      await dmWindow.getByTestId('textarea-note-body').fill('The second draft survives edits.')
      await dmWindow.getByTestId('textarea-note-body').blur()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.notes.listCategoryByCampaign(id), campaignId)
        return rows.some((row: any) => row.title === 'Moon Gate Revised' && row.content.includes('second draft'))
      }).toBe(true)

      await dmWindow.getByTestId('input-note-search').fill('')
      const noteRow = dmWindow.getByTestId('list-item-note').filter({ hasText: 'Moon Gate Revised' })
      await noteRow.hover()
      await noteRow.getByTestId('button-delete-note').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.notes.listCategoryByCampaign(id), campaignId)
        return rows.length
      }).toBe(0)
    } finally {
      await close()
    }
  })

  test('handouts and character sheets support cancel/confirm destructive paths', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `Panel Delete ${Date.now()}`)

      await dmWindow.getByTestId('nav-workspace-handouts').click()
      await dmWindow.getByTestId('button-create-handout').click()
      await dmWindow.getByTestId('input-handout-title').fill('Delete Candidate')
      await dmWindow.getByTestId('textarea-handout-body').fill('This handout is used for deletion coverage.')
      await mockOpenDialogCancel(app)
      await dmWindow.getByTestId('button-pick-handout-image').click()
      await dmWindow.getByTestId('button-save-handout').click()
      await expect(dmWindow.getByTestId('list-item-handout').filter({ hasText: 'Delete Candidate' })).toBeVisible()

      await mockConfirmDialog(app, false)
      await dmWindow.getByTestId('list-item-handout').filter({ hasText: 'Delete Candidate' }).getByTestId('button-delete-handout').click()
      await expect(dmWindow.getByTestId('list-item-handout').filter({ hasText: 'Delete Candidate' })).toBeVisible()
      await mockConfirmDialog(app, true)
      await dmWindow.getByTestId('list-item-handout').filter({ hasText: 'Delete Candidate' }).getByTestId('button-delete-handout').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.handouts.listByCampaign(id), campaignId))
        .toHaveLength(0)

      await dmWindow.getByTestId('nav-workspace-characters').click()
      await dmWindow.getByTestId('button-create-character-sheet').click()
      await dmWindow.getByTestId('input-character-name').fill('Delete Mira')
      await expect(dmWindow.getByTestId('list-item-character-sheet').filter({ hasText: 'Delete Mira' })).toBeVisible()
      const sheetRow = dmWindow.getByTestId('list-item-character-sheet').filter({ hasText: 'Delete Mira' })
      await sheetRow.hover()
      await mockConfirmDialog(app, false)
      await sheetRow.getByTestId('button-delete-character-sheet').click()
      await expect(sheetRow).toBeVisible()
      await sheetRow.hover()
      await mockConfirmDialog(app, true)
      await sheetRow.getByTestId('button-delete-character-sheet').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId))
        .toHaveLength(0)
    } finally {
      await close()
    }
  })

  test('audio library handles empty folder, filtering, assignment, and track deletion', async () => {
    const { app, dmWindow, close, userDataDir } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `Panel Audio ${Date.now()}`)
      await dmWindow.getByTestId('nav-workspace-audio').click()
      await expect(dmWindow.getByTestId('panel-audio-library')).toBeVisible()

      await dmWindow.evaluate(async (dir) => {
        await (window as any).electronAPI.openPath?.(dir).catch?.(() => undefined)
      }, userDataDir)
      await mockOpenDialog(app, [userDataDir])
      await dmWindow.getByTestId('button-add-audio-folder').click()
      await expect(dmWindow.getByTestId('list-item-track')).toHaveCount(0)

      await mockOpenDialog(app, [TEST_TRACKS_DIR])
      await dmWindow.getByTestId('button-add-audio-folder').click()
      await expect(dmWindow.getByTestId('list-item-track').first()).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('input-track-search').fill('Combat')
      await expect(dmWindow.getByTestId('list-item-track').first()).toContainText(/Combat/i)
      await dmWindow.getByTestId('list-item-track').first().getByTestId('button-assign-track-1').click()
      await expect.poll(async () => {
        const tracks = await dmWindow.evaluate((id) => (window as any).electronAPI.tracks.listByCampaign(id), campaignId)
        return tracks.some((track: any) => track.assignments.includes('track1'))
      }).toBe(true)

      await dmWindow.getByTestId('list-item-track').first().getByTestId('track-actions-menu').locator('summary').click()
      await mockConfirmDialog(app, true)
      await dmWindow.getByTestId('list-item-track').first().getByTestId('button-delete-track').click()
      await expect.poll(async () => {
        const tracks = await dmWindow.evaluate((id) => (window as any).electronAPI.tracks.listByCampaign(id), campaignId)
        return tracks.filter((track: any) => /Combat/i.test(track.fileName)).length
      }).toBeLessThan(2)
    } finally {
      await close()
    }
  })

  test('token library templates can be filtered, duplicated, and deleted', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Panel Library ${Date.now()}`)
      const templateName = `Panel Template ${Date.now()}`
      await dmWindow.evaluate((name) => (window as any).electronAPI.tokenTemplates.create({
        category: 'npc',
        name,
        size: 1,
        hp_max: 10,
        ac: 12,
        faction: 'neutral',
        marker_color: '#f59e0b',
      }), templateName)

      await dmWindow.getByTestId('nav-workspace-npcs').click()
      await dmWindow.getByTestId('input-token-search').fill(templateName)
      await expect.poll(async () => dmWindow.locator('[data-testid="list-item-token-template"] input').evaluateAll(
        (inputs, expectedName) => inputs.some((input) => (input as HTMLInputElement).value === expectedName),
        templateName,
      ), { timeout: 15_000 }).toBe(true)

      await dmWindow.getByTestId('list-item-token-template').first().getByTestId('button-duplicate-token-template').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate(() => (window as any).electronAPI.tokenTemplates.list())
        return rows.filter((row: any) => row.name.includes(templateName)).length
      }).toBe(2)

      await mockConfirmDialog(app, true)
      await dmWindow.getByTestId('list-item-token-template').first().getByTestId('button-delete-token-template').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate(() => (window as any).electronAPI.tokenTemplates.list())
        return rows.filter((row: any) => row.name.includes(templateName)).length
      }).toBe(1)
    } finally {
      await close()
    }
  })
})
