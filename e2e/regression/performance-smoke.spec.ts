import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'

test.describe('Performance smoke', () => {
  test.describe.configure({ timeout: 60_000 })

  test('dashboard remains responsive with many campaigns in an isolated profile', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const prefix = `Perf ${Date.now()}`
      await dmWindow.evaluate(async (namePrefix) => {
        for (let i = 0; i < 30; i += 1) {
          await (window as any).electronAPI.campaigns.create(`${namePrefix} ${String(i).padStart(2, '0')}`)
        }
      }, prefix)

      const started = Date.now()
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await expect(dmWindow.getByTestId('list-item-campaign')).toHaveCount(30, { timeout: 15_000 })
      const elapsed = Date.now() - started

      // Generous smoke guard: catches pathological hangs without turning
      // normal CI variance into a flaky performance benchmark.
      expect(elapsed).toBeLessThan(10_000)
    } finally {
      await close()
    }
  })
})
