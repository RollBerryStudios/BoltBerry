import { test, expect, type Page } from '@playwright/test'
import { inflateSync } from 'zlib'
import { launchApp, waitForPlayerWindow } from '../helpers/electron-launch'
import {
  canvasPoint,
  createCampaign,
  importMapAndOpenCanvas,
  seedWorkspacePanels,
  TEST_MAPS,
} from '../helpers/test-data'

test.describe('Player view and UI regressions', () => {
  test.describe.configure({ timeout: 120_000 })

  test('workspace symbols and bottom utility rail stay user-facing', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `UI Symbols ${Date.now()}`)
      await seedWorkspacePanels(dmWindow, campaignId)

      await expect(dmWindow.getByTestId('nav-workspace-characters').locator('.bb-ws-tab-icon')).toHaveText('👤')
      await expect(dmWindow.getByTestId('nav-workspace-notes').locator('.bb-ws-tab-icon')).toHaveText('📝')

      await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.bridge)
      await expect(dmWindow.getByTestId('button-floating-combat')).toBeVisible()
      const dockLayout = await dmWindow.evaluate(() => {
        const rail = document.querySelector<HTMLElement>('[data-testid="floating-utility-rail"]')
        const sidebar = document.querySelector<HTMLElement>('[data-testid="sidebar-right"]')
        if (!rail || !sidebar) throw new Error('Missing floating rail or right sidebar')
        const railRect = rail.getBoundingClientRect()
        const sidebarRect = sidebar.getBoundingClientRect()
        return { railRight: railRect.right, sidebarLeft: sidebarRect.left }
      })
      expect(dockLayout.railRight).toBeLessThanOrEqual(dockLayout.sidebarLeft - 4)
      await expect(dmWindow.locator('.audio-strip')).toHaveCount(0)
      await dmWindow.getByTestId('button-floating-combat').click()
      await expect(dmWindow.getByTestId('button-floating-combat')).toHaveAttribute('aria-pressed', 'true')
    } finally {
      await close()
    }
  })

  test('canvas context submenus are visible outside the parent menu', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Context Visibility ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.cave)

      const p = await canvasPoint(dmWindow, 0.12, 0.18)
      await dmWindow.mouse.click(p.x, p.y, { button: 'right' })
      await expect(dmWindow.getByRole('menu').first()).toBeVisible()
      await dmWindow.getByRole('menuitem', { name: /Nebel|Fog/i }).hover()
      await dmWindow.keyboard.press('ArrowRight')

      await expect(dmWindow.getByRole('menuitem', { name: /Alles (?:zu|ver)decken|Cover All/i })).toBeVisible()
      const boxes = await dmWindow.evaluate(() => {
        const menus = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]'))
        return menus.map((el) => {
          const r = el.getBoundingClientRect()
          const style = getComputedStyle(el)
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: style.overflow }
        })
      })
      expect(boxes.length).toBeGreaterThanOrEqual(2)
      expect(boxes[0].overflow).toBe('visible')
      const viewport = await dmWindow.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
      expect(boxes[1].right).toBeLessThanOrEqual(viewport.width + 1)
      expect(boxes[1].bottom).toBeLessThanOrEqual(viewport.height + 1)
      expect(boxes[1].left).toBeGreaterThanOrEqual(0)
    } finally {
      await close()
    }
  })

  test('grid strokes are clipped to the map image bounds', async () => {
    const { app, dmWindow, close } = await launchApp({ visualTestMode: true, windowSize: { width: 1440, height: 900 } })
    try {
      await createCampaign(dmWindow, `Grid Clip ${Date.now()}`)
      const mapId = await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.bridge)
      await dmWindow.evaluate((id) =>
        (window as any).electronAPI.maps.patchGridDisplay(id, {
          gridColor: '#ff00ff',
          gridThickness: 3,
          gridSize: 48,
        }),
      mapId)
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('list-item-campaign').first().click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
      await dmWindow.getByTestId('button-open-map').first().click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })

      const boundsAttr = await expect.poll(async () => {
        const attr = await dmWindow.getByTestId('canvas-area').getAttribute('data-map-screen-bounds')
        const [l, t, r, b] = (attr ?? '').split(',').map(Number)
        return Number.isFinite(l) && Number.isFinite(t) && r > l && b > t ? attr : ''
      }, { timeout: 15_000 }).not.toBe('')
        .then(() => dmWindow.getByTestId('canvas-area').getAttribute('data-map-screen-bounds'))
      expect(boundsAttr).toBeTruthy()
      const [left, top, right, bottom] = boundsAttr!.split(',').map(Number)
      const area = await dmWindow.getByTestId('canvas-area').boundingBox()
      expect(area).not.toBeNull()
      const pageBounds = {
        left: area!.x + left,
        top: area!.y + top,
        right: area!.x + right,
        bottom: area!.y + bottom,
      }
      const png = decodePng(await dmWindow.screenshot())
      const insideGridRatio = magentaRatio(png, {
        x: pageBounds.left + 20,
        y: pageBounds.top + 20,
        width: Math.min(360, Math.max(1, pageBounds.right - pageBounds.left - 40)),
        height: Math.min(260, Math.max(1, pageBounds.bottom - pageBounds.top - 40)),
      })
      expect(insideGridRatio).toBeGreaterThan(0.001)

      const outsideRegions = [
        { x: pageBounds.right + 2, y: pageBounds.top + 8, width: 96, height: pageBounds.bottom - pageBounds.top - 16 },
        { x: pageBounds.left + 8, y: pageBounds.bottom + 2, width: pageBounds.right - pageBounds.left - 16, height: 56 },
      ]
      for (const region of outsideRegions) {
        const ratio = magentaRatio(png, region)
        expect(ratio).toBeLessThan(0.0005)
      }
    } finally {
      await close()
    }
  })

  test('player fog is opaque after cover/reveal and viewport control follows map rotation', async ({}, testInfo) => {
      const { app, dmWindow, close } = await launchApp({ visualTestMode: true, windowSize: { width: 1440, height: 900 } })
    try {
      await createCampaign(dmWindow, `Player Fog ${Date.now()}`)
      const mapId = await importMapAndOpenCanvas(dmWindow, app, TEST_MAPS.bridge)

      const playerWait = waitForPlayerWindow(app, 15_000)
      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await playerWait
      await playerWindow.setViewportSize({ width: 1280, height: 720 }).catch(() => {})

      await startSession(dmWindow)
      await expect(playerWindow.getByTestId('player-map-root')).toBeVisible({ timeout: 15_000 })
      const initialFogVersion = Number(await playerWindow.getByTestId('player-map-root').getAttribute('data-fog-version'))

      const beforeCover = await opaqueBlackScreenshotRatio(playerWindow)
      await dmWindow.evaluate(() => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))
      })
      await expect.poll(async () => {
        const fog = await dmWindow.evaluate((id) => (window as any).electronAPI.fog.get(id), mapId)
        return !!fog.fogBitmap
      }, { timeout: 10_000 }).toBe(true)
      await expect.poll(async () => {
        return Number(await playerWindow.getByTestId('player-map-root').getAttribute('data-fog-version'))
      }, { timeout: 10_000 }).toBeGreaterThan(initialFogVersion)
      await expect.poll(() => opaqueBlackScreenshotRatio(playerWindow), { timeout: 10_000 })
        .toBeGreaterThan(Math.max(0.25, beforeCover + 0.2))
      await playerWindow.screenshot({ path: testInfo.outputPath('player-fog-covered.png') })

      await dmWindow.evaluate(() => {
        window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealAll' } }))
      })
      await expect.poll(() => opaqueBlackScreenshotRatio(playerWindow), { timeout: 10_000 })
        .toBeLessThan(beforeCover + 0.08)
      await playerWindow.screenshot({ path: testInfo.outputPath('player-fog-revealed.png') })

      await dmWindow.getByTestId('button-toggle-player-viewport').click()
      await expect(dmWindow.getByTestId('canvas-area')).toHaveAttribute('data-player-viewport-visual-rotation', '0')
      await dmWindow.getByTestId('button-dm-rotation-90').click()
      await expect(dmWindow.getByTestId('canvas-area')).toHaveAttribute('data-player-viewport-visual-rotation', '90')
      await dmWindow.screenshot({ path: testInfo.outputPath('dm-player-viewport-rotated.png') })
    } finally {
      await dmWindow.evaluate(() =>
        (window as any).electronAPI?.closePlayerWindow?.().catch(() => {}),
      ).catch(() => {})
      await close()
    }
  })
})

async function startSession(page: Page): Promise<void> {
  await page.getByTestId('button-session-toggle').click()
  const sessionDialog = page.getByRole('dialog', { name: /Session starten/i })
  await expect(sessionDialog).toBeVisible()
  await sessionDialog.getByRole('button', { name: /Jetzt live gehen/i }).click()
  const continueButton = sessionDialog.getByRole('button', { name: /Trotzdem fortfahren/i })
  if (await continueButton.count()) await continueButton.click()
  await expect(page.getByRole('button', { name: /LIVE/i })).toBeVisible({ timeout: 10_000 })
}

async function opaqueBlackScreenshotRatio(page: Page): Promise<number> {
  const png = decodePng(await page.screenshot())
  let black = 0
  let sampled = 0
  const step = Math.max(1, Math.floor(Math.sqrt((png.width * png.height) / 8000)))
  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const i = (y * png.width + x) * 4
      sampled += 1
      if (png.data[i + 3] > 240 && png.data[i] < 8 && png.data[i + 1] < 8 && png.data[i + 2] < 8) {
        black += 1
      }
    }
  }
  return sampled > 0 ? black / sampled : 0
}

function magentaRatio(
  png: { width: number; height: number; data: Uint8Array },
  region: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.max(0, Math.floor(region.x))
  const y0 = Math.max(0, Math.floor(region.y))
  const x1 = Math.min(png.width, Math.ceil(region.x + region.width))
  const y1 = Math.min(png.height, Math.ceil(region.y + region.height))
  if (x1 <= x0 || y1 <= y0) return 0
  let magenta = 0
  let sampled = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4
      sampled += 1
      if (png.data[i + 3] > 180 && png.data[i] > 160 && png.data[i + 1] < 100 && png.data[i + 2] > 160) {
        magenta += 1
      }
    }
  }
  return sampled > 0 ? magenta / sampled : 0
}

function decodePng(buffer: Buffer): { width: number; height: number; data: Uint8Array } {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error('Not a PNG buffer')

  let offset = 8
  let width = 0
  let height = 0
  let colorType = 6
  const idat: Buffer[] = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      colorType = data[9]
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`)
      }
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  const bpp = colorType === 6 ? 4 : 3
  const scanline = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const rgba = new Uint8Array(width * height * 4)
  let inOffset = 0
  let outOffset = 0
  const prev = new Uint8Array(scanline)
  const cur = new Uint8Array(scanline)

  for (let y = 0; y < height; y++) {
    const filter = raw[inOffset++]
    cur.set(raw.subarray(inOffset, inOffset + scanline))
    inOffset += scanline
    unfilterScanline(cur, prev, filter, bpp)
    for (let x = 0; x < width; x++) {
      const src = x * bpp
      rgba[outOffset++] = cur[src]
      rgba[outOffset++] = cur[src + 1]
      rgba[outOffset++] = cur[src + 2]
      rgba[outOffset++] = colorType === 6 ? cur[src + 3] : 255
    }
    prev.set(cur)
  }
  return { width, height, data: rgba }
}

function unfilterScanline(cur: Uint8Array, prev: Uint8Array, filter: number, bpp: number): void {
  for (let i = 0; i < cur.length; i++) {
    const left = i >= bpp ? cur[i - bpp] : 0
    const up = prev[i] ?? 0
    const upLeft = i >= bpp ? prev[i - bpp] : 0
    if (filter === 1) cur[i] = (cur[i] + left) & 0xff
    else if (filter === 2) cur[i] = (cur[i] + up) & 0xff
    else if (filter === 3) cur[i] = (cur[i] + Math.floor((left + up) / 2)) & 0xff
    else if (filter === 4) cur[i] = (cur[i] + paeth(left, up, upLeft)) & 0xff
    else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`)
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}
