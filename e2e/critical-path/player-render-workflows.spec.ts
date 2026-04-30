import { test, expect } from '@playwright/test'
import { launchApp, waitForPlayerWindow } from '../helpers/electron-launch'
import { TEST_MAPS } from '../helpers/test-data'

test.describe('Player render workflows', () => {
  test.describe.configure({ timeout: 60_000 })

  test('player window renders session broadcasts, not only bridge callbacks', async () => {
    const { dmWindow, app, close } = await launchApp()
    try {
      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')

      await expect(playerWindow.getByTestId('player-idle-root')).toBeVisible()

      await dmWindow.evaluate((imagePath) => {
        ;(window as any).electronAPI.sendMapUpdate({
          imagePath,
          gridType: 'square',
          gridSize: 50,
          rotation: 0,
          gridVisible: true,
          gridThickness: 1,
          gridColor: '#ffffff',
        })
      }, TEST_MAPS.bridge)
      await expect(playerWindow.getByTestId('player-map-root')).toBeVisible({ timeout: 15_000 })
      await expect.poll(() => playerWindow.locator('canvas').count(), { timeout: 15_000 }).toBeGreaterThan(0)

      await dmWindow.evaluate(() => {
        const api = (window as any).electronAPI
        api.sendWeather('rain')
        api.sendOverlay({ text: 'The storm breaks', position: 'top', style: 'title' })
        api.sendInitiative([
          { name: 'Mira', roll: 18, current: true },
          { name: 'Bandit', roll: 11, current: false },
        ])
        api.sendMeasure({ type: 'cone', startX: 80, startY: 90, endX: 220, endY: 160, distance: 30 })
        api.sendDrawing({ id: 99, type: 'text', points: [140, 150], color: '#f59e0b', width: 2, text: 'X' })
        api.sendWalls([{ x1: 50, y1: 50, x2: 250, y2: 50, wallType: 'door', doorState: 'closed' }])
      })

      const mapRoot = playerWindow.getByTestId('player-map-root')
      await expect(mapRoot).toHaveAttribute('data-weather', 'rain')
      await expect(mapRoot).toHaveAttribute('data-measure-type', 'cone')
      await expect(mapRoot).toHaveAttribute('data-drawing-count', '1')
      await expect(mapRoot).toHaveAttribute('data-wall-count', '1')
      await expect(playerWindow.getByTestId('player-overlay')).toContainText('The storm breaks')
      await expect(playerWindow.getByTestId('player-initiative')).toContainText('Mira')
      await expect(playerWindow.getByTestId('player-initiative')).toContainText('Bandit')

      await dmWindow.evaluate(() => (window as any).electronAPI.sendHandout({
        title: 'Sealed Letter',
        imagePath: null,
        textContent: 'The wax seal is still warm.',
      }))
      await expect(playerWindow.getByTestId('player-handout')).toBeVisible()
      await expect(playerWindow.getByTestId('player-handout-title')).toHaveText('Sealed Letter')
      await expect(playerWindow.getByTestId('player-handout-body')).toContainText('wax seal')

      await dmWindow.evaluate(() => (window as any).electronAPI.sendHandout(null))
      await expect(playerWindow.getByTestId('player-map-root')).toBeVisible()
    } finally {
      await dmWindow.evaluate(() =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {}),
      ).catch(() => {})
      await close()
    }
  })
})
