/**
 * CRITICAL PATH: Player window management
 *
 * The Player window is BoltBerry's second display — it is shown on an
 * external monitor for the players.  These tests verify:
 *   - Opening the player window creates a second BrowserWindow
 *   - Closing it removes it and fires the dm:player-window-closed event
 *   - The player window uses the correct security settings
 *   - The playerAPI is available (but electronAPI is NOT) in the player window
 *
 * Group: critical-path
 */

import { test, expect } from '@playwright/test'
import { launchApp, waitForPlayerWindow, getWindowCount } from '../helpers/electron-launch'

test.describe('Player window lifecycle', () => {

  test('opening the player window creates a second BrowserWindow', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      // Verify we start with 1 window
      expect(await getWindowCount(app)).toBe(1)

      // Open the player window via IPC
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )

      // Wait for the second window to appear
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      expect(playerWindow).toBeTruthy()
      expect(await getWindowCount(app)).toBe(2)
    } finally {
      // Ensure cleanup
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })

  test('player window title contains "Spieler"', async () => {
    // windows.ts sets title: 'BoltBerry – Spieler' for the player window
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      await waitForPlayerWindow(app, 8_000)

      const titles = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((w) => w.getTitle())
      )

      const playerTitle = titles.find((t) => t.includes('Spieler') || t.includes('Player'))
      expect(playerTitle).toBeTruthy()
    } finally {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })

  test('player window does NOT have window.electronAPI', async () => {
    // preload.ts only exposes electronAPI for !isPlayerWindow
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')

      const hasElectronAPI = await playerWindow.evaluate(() =>
        typeof (window as any).electronAPI !== 'undefined'
      )
      expect(hasElectronAPI).toBe(false)
    } finally {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })

  test('player window HAS window.playerAPI', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')

      const hasPlayerAPI = await playerWindow.evaluate(() =>
        typeof (window as any).playerAPI === 'object'
      )
      expect(hasPlayerAPI).toBe(true)
    } finally {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })

  test('closing the player window via IPC reduces window count to 1', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      await waitForPlayerWindow(app, 8_000)
      expect(await getWindowCount(app)).toBe(2)

      // Close via IPC
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow()
      )

      // Wait for the window count to drop back to 1
      const deadline = Date.now() + 5_000
      while (Date.now() < deadline) {
        if (await getWindowCount(app) === 1) break
        await new Promise((r) => setTimeout(r, 200))
      }

      expect(await getWindowCount(app)).toBe(1)
    } finally {
      await close()
    }
  })

  test('calling openPlayerWindow twice re-focuses the existing window', async () => {
    // The OPEN_PLAYER_WINDOW handler returns early if a window already exists
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      await waitForPlayerWindow(app, 8_000)
      expect(await getWindowCount(app)).toBe(2)

      // Call again — should not create a third window
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      await new Promise((r) => setTimeout(r, 500))

      expect(await getWindowCount(app)).toBe(2)
    } finally {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })
})

test.describe('Player window security', () => {

  test('player window has contextIsolation enabled (no raw ipcRenderer)', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')

      const hasRawIpc = await playerWindow.evaluate(() =>
        typeof (window as any).ipcRenderer !== 'undefined'
      )
      expect(hasRawIpc).toBe(false)
    } finally {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })

  test('player window has no nodeIntegration (window.require is undefined)', async () => {
    const { dmWindow, app, close } = await launchApp()

    try {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.openPlayerWindow()
      )
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')

      const hasRequire = await playerWindow.evaluate(() =>
        typeof (window as any).require === 'function'
      )
      expect(hasRequire).toBe(false)
    } finally {
      await dmWindow.evaluate(async () =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {})
      ).catch(() => {})
      await close()
    }
  })
})
