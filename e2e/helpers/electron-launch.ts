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
import { mkdirSync, rmSync } from 'fs'
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

  // If skipping the wizard, set the same localStorage keys the current
  // settingsStore uses and initialise the main-process DB folder. Older
  // tests used to write a stale "boltberry-settings" Zustand blob, which
  // left the renderer in SetupWizard; generic input selectors then typed
  // campaign names into the data-folder field.
  if (skipSetupWizard) {
    await dmWindow.evaluate(async (dir: string) => {
      localStorage.setItem('boltberry-data-folder', dir)
      localStorage.setItem('boltberry-setup-complete', '1')
      localStorage.setItem('boltberry-language', 'de')
      localStorage.setItem('boltberry-theme', 'dark')
      await (window as any).electronAPI?.setUserDataFolder?.(dir)
    }, userDataDir)

    await dmWindow.reload()
    await dmWindow.waitForLoadState('domcontentloaded')
  }

  // Wait for React app to mount (root div populated)
  await dmWindow.waitForSelector('#root > *', { timeout: 15_000 })

  const close = async () => {
    await app.close().catch(() => { /* already closed */ })
    rmSync(userDataDir, { recursive: true, force: true })
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
  const existing = app.windows()[1]
  if (existing) return existing
  return app.waitForEvent('window', { timeout })
}
