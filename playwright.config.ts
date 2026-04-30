/**
 * Playwright E2E Configuration for BoltBerry
 *
 * Uses Playwright's built-in Electron support (no extra adapter needed).
 *
 * Prerequisites:
 *   1. Build the app:  npm run build
 *   2. Install Playwright browsers (first time only):  npx playwright install
 *   3. Run tests:  npm run test:e2e
 *      or with UI:  npx playwright test --ui
 *
 * Environment variables:
 *   BOLTBERRY_APP_PATH   Override path to the Electron entry point (default: '.')
 *   E2E_HEADLESS         Set to '1' to run headless (default: headed for Electron)
 */

import { defineConfig } from '@playwright/test'
import { resolve } from 'path'

export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Timeouts
  timeout: 30_000,          // per-test timeout
  expect: { timeout: 8_000 }, // per-assertion timeout

  // Parallelism: Electron tests cannot run in parallel — each test
  // gets its own app instance but the build artefacts are shared.
  // Use workers: 1 to keep a predictable environment.
  workers: 1,
  fullyParallel: false,

  // Retries in CI
  retries: process.env.CI ? 2 : 0,

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  // Global setup / teardown
  globalSetup: './e2e/global-setup.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',

  use: {
    // Screenshot on failure
    screenshot: 'only-on-failure',
    // Video on failure
    video: 'retain-on-failure',
    // Trace on first retry
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke/**/*.spec.ts',
    },
    {
      name: 'regression',
      testMatch: '**/regression/**/*.spec.ts',
    },
    {
      name: 'critical-path',
      testMatch: '**/critical-path/**/*.spec.ts',
    },
    {
      name: 'visual',
      testMatch: '**/visual/**/*.visual.spec.ts',
      use: {
        screenshot: 'only-on-failure',
      },
    },
  ],
})
