import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { mockOpenDialog } from './dialog-helpers'

export async function completeSetupWithFolder(
  app: ElectronApplication,
  dmWindow: Page,
  dataDir: string,
): Promise<void> {
  await expect(
    dmWindow.getByRole('heading', { name: /Willkommen bei BoltBerry!/i }),
  ).toBeVisible()

  const dataFolderInput = dmWindow.getByTestId('input-setup-data-folder')
  await expect(dataFolderInput).toBeVisible()
  await expect(dataFolderInput).toHaveValue(/BoltBerry$/)

  await mockOpenDialog(app, [dataDir])
  await dmWindow.getByTestId('button-setup-browse').click()
  await expect(dataFolderInput).toHaveValue(dataDir)

  await dmWindow.getByTestId('button-setup-next').click()
  await expect(
    dmWindow.getByTestId('button-create-campaign'),
  ).toBeVisible()
}

export async function createCampaignFromWelcome(
  dmWindow: Page,
  rawName: string,
): Promise<string> {
  const campaignName = rawName.trim()

  await dmWindow.getByTestId('button-create-campaign').click()
  const campaignInput = dmWindow.getByTestId('input-campaign-name')
  await expect(campaignInput).toBeFocused()
  await campaignInput.fill(rawName)
  await campaignInput.press('Enter')

  await expect(dmWindow.getByText(campaignName).first()).toBeVisible()
  await expect(
    dmWindow.getByTestId('button-import-first-map'),
  ).toBeVisible()

  return campaignName
}
