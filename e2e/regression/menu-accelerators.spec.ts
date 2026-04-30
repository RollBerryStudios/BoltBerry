import { test, expect } from '@playwright/test'
import { launchApp } from '../helpers/electron-launch'

test.describe('Menu accelerators and platform boundary', () => {
  test.describe.configure({ timeout: 60_000 })

  test('registered menu exposes expected accelerator contract', async () => {
    const { app, close } = await launchApp()
    try {
      const items = await app.evaluate(({ Menu }) => {
        const menu = Menu.getApplicationMenu()
        const out: Array<{ label: string; accelerator: string | null; role: string | null }> = []
        const walk = (rows: any[]) => {
          for (const row of rows) {
            if (row.label) out.push({ label: row.label, accelerator: row.accelerator ?? null, role: row.role ?? null })
            if (row.submenu) walk(row.submenu.items)
          }
        }
        if (menu) walk(menu.items)
        return out
      })

      expect(items.some((item) => /Neue Kampagne|New Campaign/i.test(item.label) && item.accelerator === 'CmdOrCtrl+N')).toBe(true)
      expect(items.some((item) => /Einstellungen|Settings/i.test(item.label) && item.accelerator === 'CmdOrCtrl+,')).toBe(true)
      expect(items.some((item) => /Spielerfenster|Player Window/i.test(item.label) && item.accelerator === 'CmdOrCtrl+P')).toBe(true)
      expect(items.some((item) => /Shortcuts|Tastatur/i.test(item.label) && item.accelerator === 'F1')).toBe(true)
    } finally {
      await close()
    }
  })

  test('renderer-level keyboard accelerators dispatch expected flows', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
      await dmWindow.keyboard.press(`${mod}+,`)
      await expect(dmWindow.getByRole('dialog', { name: /Einstellungen|Settings/i })).toBeVisible()
      await dmWindow.keyboard.press('Escape')

      await dmWindow.keyboard.press('F1')
      await expect(dmWindow.getByRole('dialog')).toBeVisible()
      await dmWindow.keyboard.press('Escape')
    } finally {
      await close()
    }
  })
})
