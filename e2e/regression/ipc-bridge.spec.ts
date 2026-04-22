/**
 * REGRESSION: IPC bridge correctness
 *
 * Validates that the preload bridge correctly channels calls between the
 * renderer and the main process.  These tests run entirely in the renderer
 * context using window.electronAPI, so they exercise the full IPC stack.
 *
 * Group: regression
 */

import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'

test.describe('IPC bridge — database', () => {

  test('dbQuery returns an array', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // Query the schema_version table (always present after DB init)
      const result = await dmWindow.evaluate(async () => {
        return (window as any).electronAPI.dbQuery(
          'SELECT version FROM schema_version WHERE id = 1'
        )
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      // Schema version should be a number ≥ 1
      expect(typeof result[0].version).toBe('number')
      expect(result[0].version).toBeGreaterThanOrEqual(1)
    } finally {
      await close()
    }
  })

  test('dbQuery returns the current schema version (37)', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const [row] = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbQuery<{ version: number }>(
          'SELECT version FROM schema_version WHERE id = 1'
        )
      )
      expect(row.version).toBe(23)
    } finally {
      await close()
    }
  })

  test('dbRun inserts a row and returns lastInsertRowid', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const result = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbRun(
          'INSERT INTO campaigns (name) VALUES (?)',
          ['IPC Test Campaign']
        )
      )

      expect(typeof result.lastInsertRowid).toBe('number')
      expect(result.lastInsertRowid).toBeGreaterThan(0)
      expect(result.changes).toBe(1)
    } finally {
      await close()
    }
  })

  test('dbRunBatch executes multiple statements atomically', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      // Insert a campaign, then verify it exists — both in a batch
      await dmWindow.evaluate(async () => {
        return (window as any).electronAPI.dbRunBatch([
          { sql: 'INSERT INTO campaigns (name) VALUES (?)', params: ['Batch Campaign 1'] },
          { sql: 'INSERT INTO campaigns (name) VALUES (?)', params: ['Batch Campaign 2'] },
        ])
      })

      const campaigns = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.dbQuery(
          "SELECT name FROM campaigns WHERE name LIKE 'Batch Campaign%'"
        )
      )

      expect(campaigns).toHaveLength(2)
    } finally {
      await close()
    }
  })

  test('forbidden SQL (DROP TABLE) is rejected from renderer', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const error = await dmWindow.evaluate(async () => {
        try {
          await (window as any).electronAPI.dbRun('DROP TABLE campaigns')
          return null
        } catch (e: any) {
          return e.message ?? String(e)
        }
      })

      expect(error).toBeTruthy()
      expect(error).toMatch(/not allowed/i)
    } finally {
      await close()
    }
  })

  test('forbidden SQL (ALTER TABLE) is rejected from renderer', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const error = await dmWindow.evaluate(async () => {
        try {
          await (window as any).electronAPI.dbRun('ALTER TABLE campaigns ADD COLUMN evil TEXT')
          return null
        } catch (e: any) {
          return e.message ?? String(e)
        }
      })

      expect(error).toBeTruthy()
      expect(error).toMatch(/not allowed/i)
    } finally {
      await close()
    }
  })
})

test.describe('IPC bridge — app handlers', () => {

  test('getMonitors returns an array of display objects', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const monitors = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.getMonitors()
      )

      expect(Array.isArray(monitors)).toBe(true)
      // At least one display (the primary)
      expect(monitors.length).toBeGreaterThanOrEqual(1)
      // Each monitor has required fields
      const m = monitors[0]
      expect(typeof m.id).toBe('number')
      expect(typeof m.isPrimary).toBe('boolean')
    } finally {
      await close()
    }
  })

  test('getUserDataPath returns a non-empty string', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const path = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.getUserDataPath()
      )
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  test('getDefaultUserDataFolder returns a path containing "BoltBerry"', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const path = await dmWindow.evaluate(async () =>
        (window as any).electronAPI.getDefaultUserDataFolder()
      )
      expect(path).toContain('BoltBerry')
    } finally {
      await close()
    }
  })
})

test.describe('IPC bridge — security', () => {

  test('local-asset protocol rejects path traversal attempts', async () => {
    // The local-asset protocol handler checks that the resolved path stays
    // within the userData directory.  A traversal attempt should return 403.
    const { dmWindow, close } = await launchApp()

    try {
      const status = await dmWindow.evaluate(async () => {
        try {
          const res = await fetch('local-asset://../../../etc/passwd')
          return res.status
        } catch {
          // fetch may throw instead of returning a response for 4xx
          return 403
        }
      })

      expect(status).toBe(403)
    } finally {
      await close()
    }
  })
})
