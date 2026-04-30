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
import { existsSync, mkdirSync, rmSync } from 'fs'
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

  /**
   * Remove the userData directory when close() is called.
   * Default: true for launchApp(), false for launchAppWithUserDataDir().
   */
  cleanupUserDataDir?: boolean

  /**
   * Enables deterministic renderer settings for visual/a11y/performance
   * tests: stable viewport, disabled CSS animation/transition timing,
   * hidden caret, reduced motion, and visual-mode localStorage markers.
   * Default: false.
   */
  visualTestMode?: boolean

  /**
   * BrowserWindow size used for deterministic screenshots.
   * Default: 1920x1080 when visualTestMode is true.
   */
  windowSize?: { width: number; height: number }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Launch BoltBerry with an isolated userData directory.
 *
 * The function waits until the DM window is fully loaded and React has
 * rendered the top-level App component (indicated by the root element).
 */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchResult> {
  const userDataDir = resolve(tmpdir(), `boltberry-e2e-${randomBytes(6).toString('hex')}`)
  mkdirSync(userDataDir, { recursive: true })
  return launchAppWithUserDataDir(userDataDir, {
    ...options,
    cleanupUserDataDir: options.cleanupUserDataDir ?? true,
  })
}

/**
 * Launch BoltBerry against an explicit userData directory.
 *
 * Use this for restart/persistence tests: close the returned app without
 * cleanup, then call this helper again with the same directory.
 */
export async function launchAppWithUserDataDir(
  userDataDir: string,
  options: LaunchOptions = {},
): Promise<LaunchResult> {
  const {
    skipSetupWizard = true,
    extraArgs = [],
    cleanupUserDataDir = false,
    visualTestMode = false,
    windowSize,
  } = options
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })

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
      BOLTBERRY_E2E_VISUAL: visualTestMode ? '1' : process.env.BOLTBERRY_E2E_VISUAL,
    },
  })

  // Wait for the first BrowserWindow to appear
  const dmWindow = await app.firstWindow()
  if (visualTestMode || windowSize) {
    const size = windowSize ?? { width: 1920, height: 1080 }
    await app.evaluate(({ BrowserWindow }, nextSize) => {
      const win = BrowserWindow.getAllWindows()[0]
      win?.setSize(nextSize.width, nextSize.height)
      win?.center()
    }, size)
    await dmWindow.setViewportSize(size).catch(() => { /* Electron viewport follows BrowserWindow */ })
  }
  await dmWindow.waitForLoadState('domcontentloaded')

  // If skipping the wizard, set the same localStorage keys the current
  // settingsStore uses and initialise the main-process DB folder. Older
  // tests used to write a stale "boltberry-settings" Zustand blob, which
  // left the renderer in SetupWizard; generic input selectors then typed
  // campaign names into the data-folder field.
  if (skipSetupWizard) {
    await dmWindow.evaluate(async ({ dir, visual }: { dir: string; visual: boolean }) => {
      localStorage.setItem('boltberry-data-folder', dir)
      localStorage.setItem('boltberry-setup-complete', '1')
      localStorage.setItem('boltberry-language', 'de')
      localStorage.setItem('boltberry-theme', 'dark')
      localStorage.setItem('boltberry-e2e-hooks', '1')
      if (visual) localStorage.setItem('boltberry-e2e-visual', '1')
      await (window as any).electronAPI?.setUserDataFolder?.(dir)
    }, { dir: userDataDir, visual: visualTestMode })

    await dmWindow.reload()
    await dmWindow.waitForLoadState('domcontentloaded')
  }

  // Wait for React app to mount (root div populated)
  await dmWindow.waitForSelector('#root > *', { timeout: 15_000 })
  if (visualTestMode) await installDeterministicVisualMode(dmWindow)

  const close = async () => {
    await app.close().catch(() => { /* already closed */ })
    if (cleanupUserDataDir) {
      rmSync(userDataDir, { recursive: true, force: true })
    }
  }

  return { app, dmWindow, userDataDir, close }
}

export async function installDeterministicVisualMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.dataset.e2eVisual = 'true'
    localStorage.setItem('boltberry-e2e-visual', '1')
  })
  await page.addStyleTag({
    content: `
      :root[data-e2e-visual="true"],
      :root[data-e2e-visual="true"] * {
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
      :root[data-e2e-visual="true"] *,
      :root[data-e2e-visual="true"] *::before,
      :root[data-e2e-visual="true"] *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      :root[data-e2e-visual="true"] .canvas-hud-fade {
        opacity: 1 !important;
      }
      :root[data-e2e-visual="true"] [role="alert"],
      :root[data-e2e-visual="true"] [aria-live] {
        visibility: hidden !important;
      }
    `,
  })
}

/**
 * Close one Electron app instance and reopen BoltBerry with the same
 * userData directory. Cleanup is deliberately left to the caller's final
 * close/remove step.
 */
export async function relaunchApp(
  current: Pick<LaunchResult, 'app' | 'userDataDir'>,
  options: LaunchOptions = {},
): Promise<LaunchResult> {
  const userDataDir = current.userDataDir
  await current.app.close().catch(() => { /* already closed */ })
  return launchAppWithUserDataDir(userDataDir, {
    ...options,
    cleanupUserDataDir: options.cleanupUserDataDir ?? false,
  })
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
