import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'
import { createCampaign, importMapAndOpenCanvas } from '../helpers/test-data'

async function menuItemState(app: ElectronApplication, label: RegExp): Promise<{ enabled: boolean; visible: boolean } | null> {
  return app.evaluate(({ Menu }, source) => {
    const menu = Menu.getApplicationMenu()
    const re = new RegExp(source, 'i')
    const walk = (items: any[]): any | null => {
      for (const item of items) {
        if (item.label && re.test(item.label)) return { enabled: item.enabled, visible: item.visible }
        const found = item.submenu ? walk(item.submenu.items) : null
        if (found) return found
      }
      return null
    }
    return menu ? walk(menu.items) : null
  }, label.source)
}

async function openCommandPalette(page: Page) {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+K`)
  await expect(page.getByRole('dialog', { name: /Befehl|Command/i })).toBeVisible()
}

test.describe('Menu context and accessibility contracts', () => {
  test.describe.configure({ timeout: 90_000 })

  test('native menu items are enabled only in the matching app context', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible()
      await expect.poll(() => menuItemState(app, /Speichern|Save/)).toMatchObject({ enabled: false })
      await expect.poll(() => menuItemState(app, /Kampagne exportieren|Export Campaign/)).toMatchObject({ enabled: false })
      await expect.poll(() => menuItemState(app, /Vergrößern|Zoom In/)).toMatchObject({ enabled: false })

      await createCampaign(dmWindow, `Menu Context ${Date.now()}`)
      await expect.poll(() => menuItemState(app, /Speichern|Save/)).toMatchObject({ enabled: true })
      await expect.poll(() => menuItemState(app, /Kampagne exportieren|Export Campaign/)).toMatchObject({ enabled: true })
      await expect.poll(() => menuItemState(app, /Vergrößern|Zoom In/)).toMatchObject({ enabled: false })

      await importMapAndOpenCanvas(dmWindow, app)
      await expect.poll(() => menuItemState(app, /Vergrößern|Zoom In/)).toMatchObject({ enabled: true })
      await expect.poll(() => menuItemState(app, /Minimap/)).toMatchObject({ enabled: true })
    } finally {
      await close()
    }
  })

  test('command palette hides campaign and canvas commands until context exists', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await openCommandPalette(dmWindow)
      await expect(dmWindow.getByRole('option', { name: /Sitzung starten|Start Session/i })).toHaveCount(0)
      await expect(dmWindow.getByRole('option', { name: /Vergrößern|Zoom In/i })).toHaveCount(0)
      await expect(dmWindow.getByRole('option', { name: /Kompendium|Compendium/i })).toBeVisible()
      await dmWindow.keyboard.press('Escape')

      await createCampaign(dmWindow, `Palette Context ${Date.now()}`)
      await openCommandPalette(dmWindow)
      await expect(dmWindow.getByRole('option', { name: /Sitzung starten|Start Session/i })).toBeVisible()
      await expect(dmWindow.getByRole('option', { name: /Vergrößern|Zoom In/i })).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('wiki right-click menu exposes menuitem roles and keyboard dismissal', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await dmWindow.getByTestId('nav-bestiary').click()
      const row = dmWindow.getByTestId('list-item-bestiary-monster').first()
      await expect(row).toBeVisible({ timeout: 15_000 })
      await row.click({ button: 'right' })
      const menu = dmWindow.getByRole('menu')
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('menuitem')).toHaveCount(3)
      await dmWindow.keyboard.press('ArrowDown')
      await dmWindow.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('sidebar map context menu becomes visible after clamping', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Map Menu ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app)

      const mapRow = dmWindow.locator('.sidebar-left [role="button"]').first()
      await expect(mapRow).toBeVisible()
      await mapRow.click({ button: 'right' })

      const menu = dmWindow.locator('[data-context-menu]').first()
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: /Umbenennen/i })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: /Löschen/i })).toBeVisible()

      await dmWindow.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('sfx emoji picker supports grid keyboard selection', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `SFX A11y ${Date.now()}`)
      await dmWindow.getByTestId('nav-workspace-sfx').click()
      await dmWindow.getByTestId('button-add-sfx-board-empty').click()
      await dmWindow.getByTestId('list-item-sfx-slot').first().click()
      await dmWindow.getByTestId('button-open-sfx-emoji-picker').click()
      await expect(dmWindow.getByRole('grid', { name: /Emoji/ })).toBeVisible()
      await dmWindow.keyboard.press('ArrowRight')
      await dmWindow.keyboard.press('Enter')
      await expect(dmWindow.getByTestId('input-sfx-slot-emoji')).toHaveValue('💥')
    } finally {
      await close()
    }
  })

  test('canvas layer popup exposes menu checkbox state', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Layer A11y ${Date.now()}`)
      await importMapAndOpenCanvas(dmWindow, app)
      await dmWindow.getByTestId('button-canvas-layers').click()
      await expect(dmWindow.getByRole('menu', { name: /Ebenen/i })).toBeVisible()
      const tokens = dmWindow.getByTestId('button-canvas-layer-tokens')
      await expect(tokens).toHaveAttribute('role', 'menuitemcheckbox')
      await expect(tokens).toHaveAttribute('aria-checked', 'true')
      await tokens.click()
      await expect(tokens).toHaveAttribute('aria-checked', 'false')
    } finally {
      await close()
    }
  })
})
