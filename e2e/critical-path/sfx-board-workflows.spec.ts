import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog } from '../helpers/dialog-helpers'
import { createCampaign, importMapAndOpenCanvas } from '../helpers/test-data'

const TEST_SFX = resolve(__dirname, '../testcontent/sfx1/08 - spell.mp3')

test.describe('Professional SFX board workflows', () => {
  test.describe.configure({ timeout: 90_000 })

  test('board, slot audio, emoji, volume, loop, trigger, and clear are persisted', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      expect(existsSync(TEST_SFX), `Missing SFX fixture at ${TEST_SFX}`).toBe(true)
      const campaignId = await createCampaign(dmWindow, `SFX Board ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app)
      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne|Back to campaign/i }).click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible()

      await dmWindow.getByTestId('nav-workspace-sfx').click()
      await expect(dmWindow.getByTestId('panel-sfx')).toBeVisible()
      await dmWindow.getByTestId('button-add-sfx-board-empty').click()
      await expect(dmWindow.getByTestId('list-item-sfx-slot')).toHaveCount(10)

      const slot = dmWindow.getByTestId('list-item-sfx-slot').first()
      await slot.click()
      await dmWindow.getByTestId('input-sfx-slot-title').fill('Arcane Burst')
      await dmWindow.getByTestId('button-open-sfx-emoji-picker').click()
      await dmWindow.getByTestId('button-sfx-emoji').filter({ hasText: '💥' }).first().click()
      await mockOpenDialog(app, [TEST_SFX])
      await dmWindow.getByTestId('button-pick-sfx-audio').click()
      await dmWindow.getByTestId('input-sfx-slot-volume').fill('0.42')
      await dmWindow.getByTestId('checkbox-sfx-slot-loop').check()
      await dmWindow.getByTestId('button-save-sfx-slot').click()

      await expect.poll(async () => {
        const boards = await dmWindow.evaluate((id) => (window as any).electronAPI.audioBoards.listByCampaign(id), campaignId)
        return boards[0]?.slots?.[0]
      }).toMatchObject({
        slotNumber: 0,
        title: 'Arcane Burst',
        emoji: '💥',
        isLoop: true,
      })

      const saved = await dmWindow.evaluate((id) => (window as any).electronAPI.audioBoards.listByCampaign(id), campaignId)
      expect(saved[0].slots[0].audioPath).toBeTruthy()
      expect(saved[0].slots[0].volume).toBeCloseTo(0.42, 2)

      await dmWindow.evaluate(() => {
        ;(window as any).__sfxPlayCalls = []
        const proto = HTMLMediaElement.prototype as HTMLMediaElement & {
          __boltberryE2ePatched?: boolean
          play: () => Promise<void>
        }
        if (!proto.__boltberryE2ePatched) {
          const originalPause = proto.pause
          proto.play = function patchedPlay(this: HTMLMediaElement) {
            ;((window as any).__sfxPlayCalls ??= []).push({
              src: this.currentSrc || this.src,
              loop: this.loop,
              volume: this.volume,
            })
            return Promise.resolve()
          }
          proto.pause = function patchedPause(this: HTMLMediaElement) {
            return originalPause.call(this)
          }
          proto.__boltberryE2ePatched = true
        }
      })

      await slot.click()
      await expect.poll(() => dmWindow.evaluate(() => (window as any).__sfxPlayCalls?.length ?? 0))
        .toBeGreaterThan(0)
      const playCalls = await dmWindow.evaluate(() => (window as any).__sfxPlayCalls)
      expect(playCalls.at(-1).loop).toBe(true)
      expect(playCalls.at(-1).volume).toBeGreaterThan(0)
      expect(playCalls.at(-1).volume).toBeLessThanOrEqual(saved[0].slots[0].volume)

      await dmWindow.getByTestId('nav-workspace-maps').click()
      await dmWindow.getByTestId('button-open-map').first().click()
      await expect(dmWindow.getByTestId('canvas-area')).toBeVisible({ timeout: 15_000 })
      await dmWindow.evaluate(() => { ;(window as any).__sfxPlayCalls = [] })
      await dmWindow.getByTestId('button-floating-audio').click()
      await expect(dmWindow.locator('.floating-utility-popover')).toBeVisible()
      await dmWindow.keyboard.press('1')
      await expect.poll(() => dmWindow.evaluate(() => (window as any).__sfxPlayCalls?.length ?? 0))
        .toBeGreaterThan(0)

      await dmWindow.getByRole('button', { name: /Zurück zur Kampagne|Back to campaign/i }).click()
      await expect(dmWindow.getByTestId('screen-campaign-workspace')).toBeVisible()
      await dmWindow.getByTestId('nav-workspace-sfx').click()
      await expect(dmWindow.getByTestId('panel-sfx')).toBeVisible()
      await slot.click()
      await dmWindow.getByTestId('button-clear-sfx-slot').click()
      await expect.poll(async () => {
        const boards = await dmWindow.evaluate((id) => (window as any).electronAPI.audioBoards.listByCampaign(id), campaignId)
        return boards[0]?.slots?.length ?? 0
      }).toBe(0)
    } finally {
      await close()
    }
  })
})
