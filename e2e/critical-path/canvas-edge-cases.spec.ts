import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { mockConfirmDialog } from '../helpers/dialog-helpers'
import {
  canvasPoint,
  openSeededCanvas,
  seedCanvasEntities,
  selectCanvasTool,
  TEST_MAPS,
} from '../helpers/test-data'

test.describe('Canvas edge cases', () => {
  test.describe.configure({ timeout: 90_000 })

  test('edits and deletes existing walls, rooms, and drawings through canvas action paths', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Canvas Edit ${Date.now()}`, TEST_MAPS.bridge)
      await seedCanvasEntities(dmWindow, mapId)

      const seeded = await dmWindow.evaluate(async (id) => {
        const api = (window as any).electronAPI
        return {
          wall: (await api.walls.listByMap(id))[0],
          room: (await api.rooms.listByMap(id))[0],
          drawing: (await api.drawings.listByMap(id))[0],
        }
      }, mapId)

      await dmWindow.evaluate((wallId) => {
        window.dispatchEvent(new CustomEvent('wall:update', {
          detail: { id: wallId, patch: { wallType: 'door', doorState: 'open' } },
        }))
      }, seeded.wall.id)
      await expect.poll(async () => {
        const walls = await dmWindow.evaluate((id) => (window as any).electronAPI.walls.listByMap(id), mapId)
        return walls[0]?.wallType === 'door' && walls[0]?.doorState === 'open'
      }).toBe(true)

      await dmWindow.evaluate((roomId) => {
        window.dispatchEvent(new CustomEvent('room:update', {
          detail: { id: roomId, patch: { visibility: 'revealed', name: 'Revealed Vault' } },
        }))
      }, seeded.room.id)
      await expect.poll(async () => {
        const rooms = await dmWindow.evaluate((id) => (window as any).electronAPI.rooms.listByMap(id), mapId)
        return rooms[0]?.visibility === 'revealed' && rooms[0]?.name === 'Revealed Vault'
      }).toBe(true)

      await dmWindow.evaluate((drawingId) => {
        window.dispatchEvent(new CustomEvent('drawing:delete', { detail: { id: drawingId } }))
      }, seeded.drawing.id)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.drawings.listByMap(id), mapId))
        .toHaveLength(0)

      await mockConfirmDialog(app, true)
      await dmWindow.evaluate((wallId) => {
        window.dispatchEvent(new CustomEvent('wall:delete', { detail: { id: wallId } }))
      }, seeded.wall.id)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.walls.listByMap(id), mapId))
        .toHaveLength(0)

      await mockConfirmDialog(app, true)
      await dmWindow.evaluate((roomId) => {
        window.dispatchEvent(new CustomEvent('room:delete', { detail: { id: roomId } }))
      }, seeded.room.id)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.rooms.listByMap(id), mapId))
        .toHaveLength(0)
    } finally {
      await close()
    }
  })

  test('fog brush reveal and cover variants persist distinct fog states', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Canvas Fog Brush ${Date.now()}`, TEST_MAPS.cave)

      await selectCanvasTool(dmWindow, 'fog')
      await expect(dmWindow.getByTestId('canvas-subtool-strip')).toBeVisible()
      await dmWindow.getByTestId('button-fog-brush-size-20').click()
      const revealStart = await canvasPoint(dmWindow, 0.30, 0.35)
      const revealEnd = await canvasPoint(dmWindow, 0.42, 0.42)
      await dmWindow.mouse.move(revealStart.x, revealStart.y)
      await dmWindow.mouse.down()
      await dmWindow.mouse.move(revealEnd.x, revealEnd.y, { steps: 8 })
      await dmWindow.mouse.up()

      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap
      }, { timeout: 8_000 }).not.toBeNull()
      const revealBitmap = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id).then((fog: any) => fog.fogBitmap), mapId)

      await dmWindow.getByTestId('button-fog-brush-size-120').click()
      await dmWindow.getByTestId('button-fog-brush-cover').click()
      const coverStart = await canvasPoint(dmWindow, 0.55, 0.45)
      const coverEnd = await canvasPoint(dmWindow, 0.68, 0.52)
      await dmWindow.mouse.move(coverStart.x, coverStart.y)
      await dmWindow.mouse.down()
      await dmWindow.mouse.move(coverEnd.x, coverEnd.y, { steps: 8 })
      await dmWindow.mouse.up()

      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return fog.fogBitmap !== revealBitmap
      }, { timeout: 8_000 }).toBe(true)
    } finally {
      await close()
    }
  })

  test('room fog cover and reveal actions persist polygon fog from room id', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Canvas Room Fog ${Date.now()}`, TEST_MAPS.cave)
      await seedCanvasEntities(dmWindow, mapId)

      const room = await dmWindow.evaluate(async (id) => {
        const rooms = await (window as any).electronAPI.rooms.listByMap(id)
        return rooms[0]
      }, mapId)
      expect(room).toBeTruthy()

      await dmWindow.evaluate((roomId) => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverRoom', roomId } }))
      }, room.id)
      await expect.poll(() => roomFogAlphaAtCenter(dmWindow, mapId, room), { timeout: 8_000 })
        .toBeGreaterThan(80)

      await dmWindow.evaluate((roomId) => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealRoom', roomId } }))
      }, room.id)
      await expect.poll(() => roomFogAlphaAtCenter(dmWindow, mapId, room), { timeout: 8_000 })
        .toBeLessThan(8)
    } finally {
      await close()
    }
  })

  test('multi-select controls and layer toggles keep canvas usable', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Canvas Layers ${Date.now()}`, TEST_MAPS.bridge)
      await seedCanvasEntities(dmWindow, mapId)

      await dmWindow.getByTestId('button-canvas-layers').click()
      await expect(dmWindow.getByTestId('button-canvas-layer-tokens')).toBeVisible()
      await dmWindow.getByTestId('button-canvas-layer-tokens').click()
      await dmWindow.getByTestId('button-canvas-layer-fog').click()
      await dmWindow.getByTestId('button-canvas-layer-drawings').click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible()
      await dmWindow.getByTestId('button-canvas-layer-reset').click()

      const tokenIds = await dmWindow.evaluate((id) =>
        (window as any).electronAPI.tokens.listByMap(id).then((tokens: any[]) => tokens.map((token) => token.id)),
      mapId)
      await dmWindow.evaluate((ids) => {
        window.dispatchEvent(new CustomEvent('e2e:set-token-selection', { detail: { ids } }))
      }, tokenIds)

      await expect(dmWindow.getByTestId('multi-select-bar')).toBeVisible({ timeout: 8_000 })
      await dmWindow.getByTestId('button-multi-select-visibility').click()
      await expect.poll(async () => {
        const tokens = await dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId)
        return tokens.every((token: any) => token.visibleToPlayers === true)
      }).toBe(true)
      await dmWindow.getByTestId('button-multi-select-clear').click()
      await expect(dmWindow.getByTestId('multi-select-bar')).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('zoom, pan, and fit controls preserve interactive canvas state', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await openSeededCanvas(dmWindow, app, `Canvas Zoom ${Date.now()}`, TEST_MAPS.castle)
      const before = await dmWindow.getByTestId('toolbar-zoom-percent').innerText()
      const center = await canvasPoint(dmWindow, 0.50, 0.50)
      await dmWindow.mouse.move(center.x, center.y)
      await dmWindow.mouse.wheel(0, -600)
      await expect.poll(() => dmWindow.getByTestId('toolbar-zoom-percent').innerText()).not.toBe(before)

      await dmWindow.mouse.move(center.x, center.y)
      await dmWindow.mouse.down({ button: 'middle' })
      await dmWindow.mouse.move(center.x + 120, center.y + 80, { steps: 10 })
      await dmWindow.mouse.up({ button: 'middle' })
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible()

      await dmWindow.getByTestId('button-zoom-fit').click()
      await expect.poll(() => dmWindow.getByTestId('toolbar-zoom-percent').innerText()).toBe('100%')
    } finally {
      await close()
    }
  })

  test('token copy and paste creates undoable duplicated map records', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const { mapId } = await openSeededCanvas(dmWindow, app, `Canvas Copy Paste ${Date.now()}`, TEST_MAPS.bridge)
      await seedCanvasEntities(dmWindow, mapId)

      const tokenIds = await dmWindow.evaluate((id) =>
        (window as any).electronAPI.tokens.listByMap(id).then((tokens: any[]) => tokens.map((token) => token.id)),
      mapId)
      expect(tokenIds).toHaveLength(2)
      await dmWindow.evaluate((ids) => {
        window.dispatchEvent(new CustomEvent('e2e:set-token-selection', { detail: { ids } }))
      }, tokenIds)
      await expect(dmWindow.getByTestId('multi-select-bar')).toBeVisible({ timeout: 8_000 })

      const pastePoint = await canvasPoint(dmWindow, 0.68, 0.58)
      await dmWindow.mouse.move(pastePoint.x, pastePoint.y)
      const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
      await dmWindow.keyboard.press(`${mod}+C`)
      await dmWindow.keyboard.press(`${mod}+V`)
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(4)

      await expect(dmWindow.getByTestId('button-undo')).toBeEnabled()
      await dmWindow.getByTestId('button-undo').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(2)

      await expect(dmWindow.getByTestId('button-redo')).toBeEnabled()
      await dmWindow.getByTestId('button-redo').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId))
        .toHaveLength(4)
    } finally {
      await close()
    }
  })
})

async function roomFogAlphaAtCenter(page: Parameters<typeof canvasPoint>[0], mapId: number, room: any): Promise<number> {
  return page.evaluate(async ({ id, candidate }) => {
    const points = JSON.parse(candidate.polygon) as Array<{ x: number; y: number }>
    const x = Math.round(points.reduce((sum, p) => sum + p.x, 0) / points.length)
    const y = Math.round(points.reduce((sum, p) => sum + p.y, 0) / points.length)
    const fog = await (window as any).electronAPI.fog.get(id)
    if (!fog.fogBitmap) return 0

    return await new Promise<number>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(0)
          return
        }
        ctx.drawImage(img, 0, 0)
        resolve(ctx.getImageData(x, y, 1, 1).data[3])
      }
      img.onerror = () => reject(new Error('Unable to decode fog bitmap'))
      img.src = fog.fogBitmap
    })
  }, { id: mapId, candidate: room })
}
