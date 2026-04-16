/**
 * Electron launch helpers
 *
 * Provides a typed, reusable factory for launching BoltBerry in tests.
 *
 * Usage:
 *   const { app, dmWindow } = await launchApp()
 *   // ... test
 *   await app.close()
 *
 * Isolation strategy:
 *   Each test call to launchApp() receives a fresh temporary userData
 *   directory, so tests never share state (DB, settings, assets).
 *
 * Setup-wizard bypass:
 *   BoltBerry shows a SetupWizard on first launch (checks localStorage key
 *   "boltberry-settings" persisted by Zustand).  We inject that key via
 *   a preload argument so smoke / regression tests land straight on the
 *   StartScreen without having to interact with the wizard.
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

const APP_ROOT = resolve(__dirname, '../..')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LaunchResult {
  app: ElectronApplication
  /** The DM (main) window */
  dmWindow: Page
  /** Temporary user-data directory path used by this test instance */
  userDataDir: string
  /** Close the app and clean up */
  close: () => Promise<void>
}

export interface LaunchOptions {
  /**
   * Whether to inject a pre-completed settings state so the app bypasses
   * the SetupWizard and lands on the StartScreen.
   * Default: true
   */
  skipSetupWizard?: boolean

  /**
   * Extra Electron app arguments forwarded as-is.
   */
  extraArgs?: string[]
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Launch BoltBerry with an isolated userData directory.
 *
 * The function waits until the DM window is fully loaded and React has
 * rendered the top-level App component (indicated by the root element).
 */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchResult> {
  const { skipSetupWizard = true, extraArgs = [] } = options

  // Create a unique temporary directory for this test run
  const userDataDir = resolve(tmpdir(), `boltberry-e2e-${randomBytes(6).toString('hex')}`)
  mkdirSync(userDataDir, { recursive: true })

  const args: string[] = [
    APP_ROOT,
    `--user-data-dir=${userDataDir}`,
    ...extraArgs,
  ]

  const app = await electron.launch({
    args,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // Tell Electron to use a unique app-data path so multiple parallel
      // instances (future) don't collide.
      ELECTRON_USER_DATA: userDataDir,
    },
  })

  // Wait for the first BrowserWindow to appear
  const dmWindow = await app.firstWindow()
  await dmWindow.waitForLoadState('domcontentloaded')

  // If skipping the wizard, inject the Zustand-persist settings into
  // localStorage before the renderer reads it.
  if (skipSetupWizard) {
    await dmWindow.evaluate((dir: string) => {
      const settingsState = {
        state: {
          isSetupComplete: true,
          userDataFolder: dir,
          language: 'de',
          theme: 'dark',
        },
        version: 0,
      }
      localStorage.setItem('boltberry-settings', JSON.stringify(settingsState))
    }, userDataDir)

    // Tell the main process to use this userDataDir as the DB path
    // by calling the IPC bridge that mirrors what SetupWizard would do.
    // We do this after injecting localStorage so the app can re-read it.
    await dmWindow.reload()
    await dmWindow.waitForLoadState('domcontentloaded')
  }

  // Wait for React app to mount (root div populated)
  await dmWindow.waitForSelector('#root > *', { timeout: 15_000 })

  const close = async () => {
    await app.close().catch(() => { /* already closed */ })
  }

  return { app, dmWindow, userDataDir, close }
}

// ─── Convenience selectors ────────────────────────────────────────────────────

/** Returns the Electron main-process title of the focused window. */
export async function getWindowTitle(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.isFocused())
    return win?.getTitle() ?? ''
  })
}

/** Returns the number of open BrowserWindows. */
export async function getWindowCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
}

/** Wait until a second BrowserWindow appears (Player window). */
export async function waitForPlayerWindow(app: ElectronApplication, timeout = 10_000): Promise<Page> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const windows = app.windows()
    if (windows.length >= 2) {
      // Player window is the second one
      return windows[1]
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('Player window did not appear within timeout')
}
