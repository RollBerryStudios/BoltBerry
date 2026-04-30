import { test, expect, type Page } from '@playwright/test'
import axe from 'axe-core'
import { launchApp } from '../helpers/electron-launch'

async function expectNoSeriousAxeViolations(page: Page, rootSelector?: string) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `,
  })
  await page.evaluate(axe.source)
  const results = await page.evaluate(async (selector) => {
    const root = selector ? document.querySelector(selector) : document
    if (!root) throw new Error(`Axe root not found: ${selector}`)
    return (window as any).axe.run(root, {
      resultTypes: ['violations'],
    })
  }, rootSelector)
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking).toEqual([])
}

test.describe('Accessibility baseline', () => {
  test.describe.configure({ timeout: 60_000 })

  test('setup wizard has no serious or critical axe violations', async () => {
    const { dmWindow, close } = await launchApp({ skipSetupWizard: false })
    try {
      await expect(dmWindow.getByTestId('setup-wizard')).toBeVisible()
      await expectNoSeriousAxeViolations(dmWindow)
    } finally {
      await close()
    }
  })

  test('dashboard has no serious or critical axe violations', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible()
      await expectNoSeriousAxeViolations(dmWindow)
    } finally {
      await close()
    }
  })

  test('campaign workspace has no serious or critical axe violations', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await dmWindow.getByTestId('button-create-campaign').click()
      await dmWindow.getByTestId('input-campaign-name').fill(`A11y Workspace ${Date.now()}`)
      await dmWindow.getByTestId('button-confirm-create-campaign').click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
      await expect(dmWindow.getByTestId('button-import-map-empty')).toBeVisible({ timeout: 15_000 })
      await expectNoSeriousAxeViolations(dmWindow, '[data-testid="screen-campaign-workspace"]')
    } finally {
      await close()
    }
  })

  test('settings modal has no serious or critical axe violations', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await dmWindow.getByTestId('button-open-settings').click()
      await expect(dmWindow.getByRole('dialog', { name: /Einstellungen|Settings/i })).toBeVisible()
      await expectNoSeriousAxeViolations(dmWindow, '[role="dialog"]')
    } finally {
      await close()
    }
  })
})
