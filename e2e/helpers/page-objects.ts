/**
 * Page Object Models (POM) for BoltBerry UI elements.
 *
 * Each class wraps a Playwright Page and exposes high-level actions that
 * correspond to user intent (e.g. "create a campaign") rather than raw
 * locator chains.  This keeps test code readable and centralises selector
 * maintenance.
 */

import { expect, type Page, type Locator } from '@playwright/test'

// ─── SetupWizard POM ──────────────────────────────────────────────────────────

export class SetupWizardPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // The wizard should show when boltberry-settings is not in localStorage
  async isVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="setup-wizard"]').isVisible().catch(() => false)
  }

  /** Click "Use default folder" or the equivalent first-step CTA. */
  async completeWithDefaults(): Promise<void> {
    // Click the first primary button (accept defaults)
    await this.page.locator('button.btn-primary').first().click()
    // Second step may exist — click through
    const nextBtn = this.page.locator('button.btn-primary')
    if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click()
    }
  }
}

// ─── StartScreen POM ──────────────────────────────────────────────────────────

export class StartScreenPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Wait for the StartScreen to be rendered. */
  async waitFor(): Promise<void> {
    await expect(this.page.getByTestId('screen-dashboard')).toBeVisible({ timeout: 10_000 })
    await expect(this.page.getByTestId('button-create-campaign')).toBeVisible()
  }

  /** Check if the "no campaigns" empty state is shown. */
  async hasNoCampaigns(): Promise<boolean> {
    const cards = this.page.getByTestId('list-item-campaign')
    return (await cards.count().catch(() => 0)) === 0
  }

  /** Click the "New Campaign" button to enter creation mode. */
  async clickNewCampaign(): Promise<void> {
    await this.page.getByTestId('button-create-campaign').click()
  }

  /** Type a campaign name and confirm. Returns when the campaign is created. */
  async createCampaign(name: string): Promise<void> {
    await this.clickNewCampaign()
    const input = this.page.getByTestId('input-campaign-name')
    await expect(input).toBeVisible()
    await input.fill(name)
    await input.press('Enter')
    await expect(this.page.getByText(name.trim()).first()).toBeVisible({ timeout: 8_000 })
  }

  /** Click the "New Campaign" button, type a name, and click the Create button. */
  async createCampaignViaButton(name: string): Promise<void> {
    await this.clickNewCampaign()
    const input = this.page.getByTestId('input-campaign-name')
    await expect(input).toBeVisible()
    await input.fill(name)
    await this.page.getByTestId('button-confirm-create-campaign').click()
    await expect(this.page.getByText(name.trim()).first()).toBeVisible({ timeout: 8_000 })
  }

  /** Open an existing campaign by name. */
  async openCampaign(name: string): Promise<void> {
    const row = this.page.locator('button', { hasText: name })
    await row.click()
  }

  /** Get the names of all listed campaigns. */
  async getCampaignNames(): Promise<string[]> {
    // Each campaign row has a fontWeight: 500 div with the name
    const names: string[] = []
    const items = this.page.getByTestId('list-item-campaign').locator('.bb-welcome-row-title')
    const count = await items.count().catch(() => 0)
    for (let i = 0; i < count; i++) {
      names.push((await items.nth(i).textContent()) ?? '')
    }
    return names
  }

  /** Rename a campaign via the rename (pencil) button. */
  async renameCampaign(currentName: string, newName: string): Promise<void> {
    // Hover the row to reveal the rename button
    const row = this.page.getByTestId('list-item-campaign').filter({ hasText: currentName }).first()
    await row.hover()
    await row.getByTestId('button-rename-campaign').click()
    const input = row.getByTestId('input-campaign-rename')
    await input.fill(newName)
    await input.press('Enter')
  }

  /** Delete a campaign via the delete (trash) button.
   *  The confirmation dialog is handled by the Electron main process. */
  async deleteCampaign(name: string): Promise<void> {
    const row = this.page.getByTestId('list-item-campaign').filter({ hasText: name }).first()
    await row.hover()
    await row.getByTestId('button-delete-campaign').click()
    // Confirmation is a native dialog — respond via Electron's dialog mock
    // (see dialogHelpers.ts for how to mock native dialogs)
  }
}

// ─── CampaignView POM ─────────────────────────────────────────────────────────

export class CampaignViewPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async waitFor(): Promise<void> {
    // CampaignView has a header with the campaign name
    await expect(this.page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 10_000 })
  }

  /** Navigate back to the StartScreen. */
  async goBackToStartScreen(): Promise<void> {
    // Usually a back/home button or the BoltBerry logo
    await this.page.getByTestId('nav-dashboard').click()
  }
}

// ─── StatusBar POM ────────────────────────────────────────────────────────────

export class StatusBarPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async waitFor(): Promise<void> {
    // StatusBar is at the bottom of the AppLayout
    await this.page.waitForSelector('[class*="status"], [class*="StatusBar"]', { timeout: 5_000 })
  }
}

// ─── Keyboard shortcut helpers ────────────────────────────────────────────────

export async function pressShortcut(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key)
}
