/**
 * Page Object Models (POM) for BoltBerry UI elements.
 *
 * Each class wraps a Playwright Page and exposes high-level actions that
 * correspond to user intent (e.g. "create a campaign") rather than raw
 * locator chains.  This keeps test code readable and centralises selector
 * maintenance.
 */

import type { Page, Locator } from '@playwright/test'

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
    // Logo image is present on the StartScreen
    await this.page.waitForSelector('img[alt="BoltBerry"]', { timeout: 10_000 })
  }

  /** Check if the "no campaigns" empty state is shown. */
  async hasNoCampaigns(): Promise<boolean> {
    const emptyState = this.page.locator('.empty-state')
    return emptyState.isVisible().catch(() => false)
  }

  /** Click the "New Campaign" button to enter creation mode. */
  async clickNewCampaign(): Promise<void> {
    // The primary button that reads "Neue Kampagne" or similar
    await this.page.locator('button.btn-primary').last().click()
  }

  /** Type a campaign name and confirm. Returns when the campaign is created. */
  async createCampaign(name: string): Promise<void> {
    await this.clickNewCampaign()
    // Input appears after clicking
    const input = this.page.locator('input.input').last()
    await input.fill(name)
    // Press Enter to confirm
    await input.press('Enter')
    // Wait until we leave the StartScreen (campaign opened)
    await this.page.waitForSelector('img[alt="BoltBerry"]', { state: 'detached', timeout: 8_000 }).catch(() => {})
  }

  /** Click the "New Campaign" button, type a name, and click the Create button. */
  async createCampaignViaButton(name: string): Promise<void> {
    await this.clickNewCampaign()
    const input = this.page.locator('input.input').last()
    await input.fill(name)
    // Click the explicit Create button
    await this.page.locator('button.btn-primary').last().click()
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
    const items = this.page.locator('.campaign-row-name, [style*="fontWeight: 500"]')
    const count = await items.count().catch(() => 0)
    for (let i = 0; i < count; i++) {
      names.push((await items.nth(i).textContent()) ?? '')
    }
    return names
  }

  /** Rename a campaign via the rename (pencil) button. */
  async renameCampaign(currentName: string, newName: string): Promise<void> {
    // Hover the row to reveal the rename button
    const row = this.page.locator('div', { hasText: currentName }).first()
    await row.hover()
    // Click the rename button (pencil emoji)
    await this.page.locator('button[title="Umbenennen"]').first().click()
    const input = this.page.locator('input.input').last()
    await input.fill(newName)
    await input.press('Enter')
  }

  /** Delete a campaign via the delete (trash) button.
   *  The confirmation dialog is handled by the Electron main process. */
  async deleteCampaign(name: string): Promise<void> {
    const row = this.page.locator('div', { hasText: name }).first()
    await row.hover()
    // Click the delete (🗑) button
    await this.page.locator('button[title="Kampagne löschen"]').first().click()
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
    await this.page.waitForSelector('[class*="campaign"]', { timeout: 10_000 })
  }

  /** Navigate back to the StartScreen. */
  async goBackToStartScreen(): Promise<void> {
    // Usually a back/home button or the BoltBerry logo
    const homeBtn = this.page.locator('button[title*="Zurück"], button[aria-label*="home"]').first()
    await homeBtn.click()
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
