import { test, expect } from '@playwright/test'
import { launchApp, getWindowCount } from '../helpers/electron-launch'

test.skip(!process.env.BOLTBERRY_E2E_EXECUTABLE_PATH, 'Set BOLTBERRY_E2E_EXECUTABLE_PATH to smoke-test a packaged app executable.')

test.describe('Packaged app smoke', () => {
  test('packaged executable opens the DM shell and preload bridge', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      expect(await getWindowCount(app)).toBe(1)
      const hasBridge = await dmWindow.evaluate(() => typeof (window as any).electronAPI?.campaigns?.list === 'function')
      expect(hasBridge).toBe(true)
    } finally {
      await close()
    }
  })
})
