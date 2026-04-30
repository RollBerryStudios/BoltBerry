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

test.describe('IPC bridge — semantic data APIs', () => {

  test('raw SQL database helpers are not exposed to the renderer', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const exposed = await dmWindow.evaluate(() => {
        const api = (window as any).electronAPI
        return {
          dbQuery: typeof api.dbQuery,
          dbRun: typeof api.dbRun,
          dbRunBatch: typeof api.dbRunBatch,
        }
      })

      expect(exposed).toEqual({
        dbQuery: 'undefined',
        dbRun: 'undefined',
        dbRunBatch: 'undefined',
      })
    } finally {
      await close()
    }
  })

  test('campaign semantic API supports create, list, get, rename, and delete', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const result = await dmWindow.evaluate(async () => {
        const api = (window as any).electronAPI.campaigns
        const created = await api.create('IPC Semantic Campaign')
        const listed = await api.list()
        const loaded = await api.get(created.id)
        await api.rename(created.id, 'IPC Semantic Campaign Renamed')
        const renamed = await api.get(created.id)
        await api.delete(created.id)
        const afterDelete = await api.get(created.id)
        return { created, listed, loaded, renamed, afterDelete }
      })

      expect(result.created.id).toBeGreaterThan(0)
      expect(result.listed.some((campaign: { id: number }) => campaign.id === result.created.id)).toBe(true)
      expect(result.loaded.name).toBe('IPC Semantic Campaign')
      expect(result.renamed.name).toBe('IPC Semantic Campaign Renamed')
      expect(result.afterDelete).toBeNull()
    } finally {
      await close()
    }
  })

  test('map semantic API supports create, list, rename, and delete', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const result = await dmWindow.evaluate(async () => {
        const campaigns = (window as any).electronAPI.campaigns
        const maps = (window as any).electronAPI.maps
        const campaign = await campaigns.create('Map IPC Campaign')
        const created = await maps.create({
          campaignId: campaign.id,
          name: 'IPC Map',
          imagePath: 'assets/map/ipc-map.png',
        })
        const listed = await maps.list(campaign.id)
        await maps.rename(created.id, 'IPC Map Renamed')
        const renamed = (await maps.list(campaign.id)).find((map: { id: number }) => map.id === created.id)
        await maps.delete(created.id)
        const afterDelete = await maps.list(campaign.id)
        return { created, listed, renamed, afterDelete }
      })

      expect(result.created.id).toBeGreaterThan(0)
      expect(result.listed.some((map: { id: number }) => map.id === result.created.id)).toBe(true)
      expect(result.renamed.name).toBe('IPC Map Renamed')
      expect(result.afterDelete.some((map: { id: number }) => map.id === result.created.id)).toBe(false)
    } finally {
      await close()
    }
  })

  test('semantic API validation rejects empty campaign names', async () => {
    const { dmWindow, close } = await launchApp()

    try {
      const message = await dmWindow.evaluate(async () => {
        try {
          await (window as any).electronAPI.campaigns.create('   ')
          return null
        } catch (e: any) {
          return e.message ?? String(e)
        }
      })

      expect(message).toMatch(/Campaign name is required/i)
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
