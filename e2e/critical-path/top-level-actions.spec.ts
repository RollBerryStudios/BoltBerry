/**
 * CRITICAL PATH: Top-level UI actions
 *
 * This spec is intentionally broad and public-API oriented. It exercises
 * the visible navigation and reversible actions a DM can trigger before
 * importing real campaign assets. Native file pickers are mocked as
 * cancels so the test proves graceful no-op behaviour without depending
 * on host files.
 */

import { test, expect, type Locator, type Page } from '@playwright/test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import {
  completeSetupWithFolder,
  createCampaignFromWelcome,
} from '../helpers/onboarding-helpers'
import { mockOpenDialogCancel } from '../helpers/dialog-helpers'

async function expectDialog(page: Page, name: RegExp): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  return dialog
}

async function closeDialog(page: Page, name: RegExp): Promise<void> {
  const dialog = await expectDialog(page, name)
  const closeButton = dialog.getByRole('button', { name: /Schließen|✕/i }).first()
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click()
  } else {
    await page.keyboard.press('Escape')
  }
  await expect(dialog).toBeHidden()
}

async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /App-Einstellungen öffnen/i }).first().click()
  return expectDialog(page, /Einstellungen/i)
}

async function assertNoConsoleErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as Window & { __e2eConsoleErrors?: string[] }).__e2eConsoleErrors ?? [])
}

test.describe('Top-level UI actions', () => {
  test.describe.configure({ timeout: 60_000 })

  test('welcome actions, reference views, settings sections, and modal exits are reachable', async () => {
    const dataDir = mkdtempSync(resolve(tmpdir(), 'boltberry-actions-data-'))
    const { app, dmWindow, close } = await launchApp({ skipSetupWizard: false })

    dmWindow.on('console', (msg) => {
      if (msg.type() !== 'error') return
      void dmWindow.evaluate((text) => {
        const bucket = ((window as Window & { __e2eConsoleErrors?: string[] }).__e2eConsoleErrors ??= [])
        bucket.push(text)
      }, msg.text()).catch(() => {})
    })

    try {
      await completeSetupWithFolder(app, dmWindow, dataDir)

      await expect(dmWindow.getByRole('button', { name: /Profil/i })).toBeVisible()
      await expect(dmWindow.getByRole('button', { name: /Wiki/i })).toBeVisible()
      await expect(dmWindow.getByRole('button', { name: /Kompendium/i })).toBeVisible()
      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()
      await expect(dmWindow.getByRole('button', { name: /Importieren/i })).toBeVisible()

      await dmWindow.getByRole('button', { name: /Profil/i }).click()
      let settings = await expectDialog(dmWindow, /Einstellungen/i)
      await expect(settings.getByRole('heading', { name: /DM-Profil/i })).toBeVisible()
      await closeDialog(dmWindow, /Einstellungen/i)

      settings = await openSettings(dmWindow)
      for (const section of [/Speicher/i, /Darstellung/i, /DM-Profil/i, /Datei/i, /Über BoltBerry/i]) {
        await settings.getByRole('button', { name: section }).click()
        await expect(settings.getByRole('heading', { name: section }).first()).toBeVisible()
      }
      await closeDialog(dmWindow, /Einstellungen/i)

      await dmWindow.getByRole('button', { name: /Über BoltBerry/i }).click()
      await expectDialog(dmWindow, /BoltBerry/i)
      await dmWindow.keyboard.press('Escape')
      await expect(dmWindow.getByRole('dialog')).toBeHidden()

      await dmWindow.getByRole('button', { name: /Wiki/i }).click()
      await expect(dmWindow.getByText(/Bestiarium|Wiki/i).first()).toBeVisible()
      await expect(dmWindow.getByPlaceholder(/Name, Typ, Schule suchen/i)).toBeVisible()
      for (const tab of [/Monster/i, /Gegenstände/i, /Zauber/i]) {
        await dmWindow.getByRole('tab', { name: tab }).click()
        await expect(dmWindow.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
      }
      await dmWindow.getByRole('button', { name: /Zurück/i }).click()
      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()

      await dmWindow.getByRole('button', { name: /Kompendium/i }).click()
      await expect(dmWindow.getByText(/Kompendium/i).first()).toBeVisible()
      await expect(dmWindow.getByPlaceholder(/Alle PDFs/i)).toBeVisible()
      await mockOpenDialogCancel(app)
      await dmWindow.getByRole('button', { name: /PDF importieren/i }).click()
      await expect(dmWindow.getByText(/Kompendium/i).first()).toBeVisible()
      await dmWindow.getByRole('button', { name: /Zurück/i }).click()

      await mockOpenDialogCancel(app)
      await dmWindow.getByRole('button', { name: /Importieren/i }).click()
      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()

      const errors = await assertNoConsoleErrors(dmWindow)
      expect(errors).toEqual([])
    } finally {
      await close()
    }
  })

  test('campaign workspace tabs and reversible top-bar actions are reachable', async () => {
    const dataDir = mkdtempSync(resolve(tmpdir(), 'boltberry-workspace-data-'))
    const { app, dmWindow, close } = await launchApp({ skipSetupWizard: false })

    try {
      await completeSetupWithFolder(app, dmWindow, dataDir)
      const campaignName = await createCampaignFromWelcome(dmWindow, '  E2E Volltest Kampagne  ')

      await expect(dmWindow.getByRole('button', { name: /Kampagnen/i }).first()).toBeVisible()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()
      await expect(dmWindow.getByRole('button', { name: /Erste Karte importieren/i }).first()).toBeVisible()

      const workspaceTabs = dmWindow.getByTestId('workspace-tabs')
      for (const tab of [/Karten/i, /Charaktere/i, /NSC/i, /Audio/i, /SFX/i, /Handouts/i, /Notizen/i]) {
        await workspaceTabs.getByRole('button', { name: tab }).click()
        await expect(workspaceTabs.getByRole('button', { name: tab })).toBeVisible()
      }

      await mockOpenDialogCancel(app)
      await dmWindow.getByRole('button', { name: /Erste Karte importieren/i }).first().click()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()

      await dmWindow.getByRole('button', { name: /App-Einstellungen öffnen/i }).first().click()
      await expectDialog(dmWindow, /Einstellungen/i)
      await closeDialog(dmWindow, /Einstellungen/i)

      await dmWindow.getByTestId('nav-compendium').click()
      await expect(dmWindow.getByText(/Kompendium/i).first()).toBeVisible()
      await dmWindow.getByRole('button', { name: /Zurück/i }).click()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()

      await dmWindow.getByRole('button', { name: /Kampagnen/i }).first().click()
      await expect(dmWindow.getByRole('button', { name: /Neue Kampagne/i }).first()).toBeVisible()
      await expect(dmWindow.getByText(campaignName).first()).toBeVisible()
    } finally {
      await close()
    }
  })
})
