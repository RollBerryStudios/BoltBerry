import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { launchApp, waitForPlayerWindow } from '../helpers/electron-launch'
import { mockConfirmDialog, mockOpenDialog, mockSaveDialog } from '../helpers/dialog-helpers'
import { createCampaign, importMapAndOpenCanvas } from '../helpers/test-data'

const EN_SRD_PDF = resolve(__dirname, '../../resources/compendium/srd-en-5.2.1.pdf')

async function reopenFirstCampaign(page: Page): Promise<void> {
  await page.reload()
  await expect(page.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('list-item-campaign').first().click()
  await expect(page.getByTestId('screen-campaign-workspace')).toBeVisible({ timeout: 15_000 })
}

async function openBestiary(page: Page): Promise<void> {
  const nav = page.getByTestId('nav-bestiary')
  if (await nav.isVisible().catch(() => false)) {
    await nav.click()
  } else {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${mod}+K`)
    const palette = page.getByRole('dialog', { name: /Befehl|Command/i })
    await expect(palette).toBeVisible()
    await palette.getByRole('textbox').fill('Wiki')
    await palette.getByRole('option', { name: /Datei\s+Wiki öffnen|File\s+Open wiki/i }).click()
  }
  await expect(page.getByTestId('screen-bestiary')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('tab-bestiary-monsters').click()
  await expect(page.getByTestId('panel-bestiary-monsters')).toBeVisible()
}

async function expectFormValue(page: Page, expected: string | RegExp): Promise<void> {
  await expect.poll(async () => {
    return page.locator('input, textarea').evaluateAll((els, wanted) => {
      const values = els.map((el) => (el as HTMLInputElement | HTMLTextAreaElement).value)
      if (typeof wanted === 'string') return values.some((value) => value === wanted)
      return values.some((value) => new RegExp(wanted.source, wanted.flags).test(value))
    }, expected)
  }).toBe(true)
}

async function openCompendium(page: Page): Promise<void> {
  await page.getByTestId('nav-compendium').click()
  await expect(page.getByTestId('screen-compendium')).toBeVisible({ timeout: 15_000 })
}

async function startSession(page: Page): Promise<void> {
  await page.getByTestId('button-session-toggle').click()
  const sessionDialog = page.getByRole('dialog', { name: /Session starten/i })
  await expect(sessionDialog).toBeVisible()
  await sessionDialog.getByRole('button', { name: /Jetzt live gehen/i }).click()
  const continueButton = sessionDialog.getByRole('button', { name: /Trotzdem fortfahren/i })
  if (await continueButton.count()) await continueButton.click()
  await expect(page.getByRole('button', { name: /LIVE/i })).toBeVisible({ timeout: 10_000 })
}

test.describe('Remaining depth deltas', () => {
  test.describe.configure({ timeout: 150_000 })

  test('character sheets preserve dense fields through UI export and import', async () => {
    const { app, dmWindow, userDataDir, close } = await launchApp()
    try {
      const campaignId = await createCampaign(dmWindow, `Character Depth ${Date.now()}`)
      await dmWindow.getByTestId('nav-workspace-characters').click()
      await dmWindow.getByTestId('button-create-character-sheet').click()
      await dmWindow.getByTestId('input-character-name').fill('Mira Fielddepth')

      const sheetId = await dmWindow.evaluate(async (id) => {
        const api = (window as any).electronAPI
        const [sheet] = await api.characterSheets.listByCampaign(id)
        await api.characterSheets.update(sheet.id, {
          name: 'Mira Fielddepth',
          race: 'Elf',
          className: 'Wizard',
          subclass: 'Divination',
          level: 7,
          background: 'Sage',
          alignment: 'Neutral Good',
          experience: 23_000,
          str: 8,
          dex: 16,
          con: 14,
          intScore: 18,
          wis: 12,
          cha: 10,
          hpMax: 44,
          hpCurrent: 37,
          hpTemp: 5,
          ac: 15,
          speed: 30,
          initiativeBonus: 3,
          proficiencyBonus: 3,
          hitDice: '7d6',
          deathSavesSuccess: 2,
          savingThrows: { str: false, dex: false, con: false, int: true, wis: true, cha: false },
          skills: { arcana: true, history: true, investigation: true, perception: true },
          languages: 'Common, Elvish, Draconic',
          proficiencies: 'Daggers, quarterstaffs',
          features: 'Portent and ritual casting.',
          equipment: 'Spellbook\nArcane focus',
          attacks: [
            { name: 'Fire Bolt', bonus: '+7', damage: '2d10', damageType: 'fire', range: '120 ft', notes: 'cantrip' },
          ],
          spells: { 0: ['Mage Hand'], 1: ['Shield'], 3: ['Fireball'] },
          personality: 'Always annotates ruins.',
          ideals: 'Knowledge should be shared.',
          bonds: 'Protects the old library.',
          flaws: 'Trusts maps too much.',
          backstory: 'Raised among star charts.',
          notes: 'Has a coded journal.',
          inspiration: 1,
          passivePerception: 14,
        })
        return sheet.id
      }, campaignId)

      await reopenFirstCampaign(dmWindow)
      await dmWindow.getByTestId('nav-workspace-characters').click()
      await dmWindow.getByTestId('list-item-character-sheet').filter({ hasText: 'Mira Fielddepth' }).click()
      await expect(dmWindow.getByTestId('input-character-name')).toHaveValue('Mira Fielddepth')
      await expectFormValue(dmWindow, 'Elf')
      await expectFormValue(dmWindow, 'Wizard')
      await dmWindow.getByTestId('tab-character-sheet-inventory').click()
      await expectFormValue(dmWindow, /Spellbook/)
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId)
        return rows[0]?.spells?.[3]?.includes('Fireball')
      }).toBe(true)
      await dmWindow.getByTestId('tab-character-sheet-bio').click()
      await expectFormValue(dmWindow, 'Portent and ritual casting.')
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId)
        return rows[0]?.notes
      }).toBe('Has a coded journal.')

      const exportPath = resolve(userDataDir, 'mira-fielddepth.character.json')
      const row = dmWindow.getByTestId('list-item-character-sheet').filter({ hasText: 'Mira Fielddepth' })
      await row.hover()
      await mockSaveDialog(app, exportPath)
      await row.getByTestId('button-export-character-sheet').click()
      await expect.poll(() => existsSync(exportPath)).toBe(true)
      expect(JSON.parse(readFileSync(exportPath, 'utf8')).sheet.attacks[0].name).toBe('Fire Bolt')

      await mockConfirmDialog(app, true)
      await row.hover()
      await row.getByTestId('button-delete-character-sheet').click()
      await expect.poll(() => dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId))
        .toHaveLength(0)

      await mockOpenDialog(app, [exportPath])
      await dmWindow.getByTestId('button-import-character-sheet').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId)
        return rows.find((sheet: any) => sheet.name === 'Mira Fielddepth')
      }, { timeout: 10_000 }).toMatchObject({
        race: 'Elf',
        className: 'Wizard',
        level: 7,
        equipment: expect.stringContaining('Spellbook'),
        notes: 'Has a coded journal.',
      })
      const imported = await dmWindow.evaluate((id) => (window as any).electronAPI.characterSheets.listByCampaign(id), campaignId)
      expect(imported[0].id).not.toBe(sheetId)
    } finally {
      await close()
    }
  })

  test('bestiary monster actions spawn to map, broadcast, export, delete, and import', async () => {
    const { app, dmWindow, userDataDir, close } = await launchApp()
    try {
      await createCampaign(dmWindow, `Bestiary Depth ${Date.now()}`)
      const mapId = await importMapAndOpenCanvas(dmWindow, app)
      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')
      await startSession(dmWindow)

      const seed = await dmWindow.evaluate(async () => {
        const monsters = await (window as any).electronAPI.listMonsters()
        return monsters.find((m: any) => m.nameDe || m.name)
      })
      expect(seed).toBeTruthy()
      const displayName = seed.nameDe ?? seed.name

      await openBestiary(dmWindow)
      await dmWindow.getByTestId('input-bestiary-search').fill(displayName)
      await dmWindow.getByTestId('list-item-bestiary-monster').filter({ hasText: displayName }).first().click()

      await dmWindow.getByTestId('button-bestiary-spawn-monster').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate((id) => (window as any).electronAPI.tokens.listByMap(id), mapId)
        return rows.some((token: any) => token.name === displayName)
      }, { timeout: 10_000 }).toBe(true)

      await dmWindow.getByTestId('button-bestiary-send-monster').click()
      await expect(playerWindow.getByTestId('player-handout-title')).toContainText(displayName, { timeout: 10_000 })

      await dmWindow.getByTestId('button-wiki-monster-clone').click()
      const cloned = await expect.poll(async () => {
        const rows = await dmWindow.evaluate(() => (window as any).electronAPI.listMonsters())
        return rows.find((m: any) => m.userOwned && ((m.nameDe ?? m.name) || '').includes('(Kopie)')) ?? null
      }, { timeout: 10_000 }).not.toBeNull()

      const clonedName = await dmWindow.evaluate(() => {
        return (window as any).electronAPI.listMonsters()
          .then((rows: any[]) => {
            const row = rows.find((m: any) => m.userOwned && ((m.nameDe ?? m.name) || '').includes('(Kopie)'))
            return row?.nameDe ?? row?.name
          })
      })
      expect(clonedName).toBeTruthy()
      await dmWindow.getByTestId('input-bestiary-search').fill(clonedName)
      const clonedRow = dmWindow.getByTestId('list-item-bestiary-monster').filter({ hasText: clonedName }).first()
      await clonedRow.click({ button: 'right' })
      const exportPath = resolve(userDataDir, 'wiki-monster-export.json')
      await mockSaveDialog(app, exportPath)
      await dmWindow.getByTestId('button-wiki-menu-monster-export').click()
      await expect.poll(() => existsSync(exportPath)).toBe(true)
      expect(JSON.parse(readFileSync(exportPath, 'utf8')).kind).toBe('boltberry-wiki-entry')

      await clonedRow.click({ button: 'right' })
      dmWindow.once('dialog', (dialog) => dialog.accept())
      await dmWindow.getByTestId('button-wiki-menu-monster-delete').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate(() => (window as any).electronAPI.listMonsters())
        return rows.some((m: any) => m.userOwned && ((m.nameDe ?? m.name) === clonedName))
      }, { timeout: 10_000 }).toBe(false)

      await mockOpenDialog(app, [exportPath])
      await dmWindow.getByTestId('button-import-wiki-monster').click()
      await expect.poll(async () => {
        const rows = await dmWindow.evaluate(() => (window as any).electronAPI.listMonsters())
        return rows.some((m: any) => m.userOwned && ((m.nameDe ?? m.name) === clonedName))
      }, { timeout: 10_000 }).toBe(true)

      void cloned
    } finally {
      await dmWindow.evaluate(() =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {}),
      ).catch(() => {})
      await close()
    }
  })

  test('compendium broadcasts real pages, stops broadcast, and reports corrupt PDFs', async () => {
    const { app, dmWindow, userDataDir, close } = await launchApp()
    try {
      expect(existsSync(EN_SRD_PDF), `Missing SRD PDF fixture at ${EN_SRD_PDF}`).toBe(true)
      await dmWindow.evaluate(() => {
        localStorage.setItem('boltberry-language', 'en')
        localStorage.setItem('boltberry-lang', 'en')
      })
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await openCompendium(dmWindow)
      await expect(dmWindow.getByTestId('compendium-pdf-viewer')).toBeVisible({ timeout: 30_000 })

      await dmWindow.evaluate(() => (window as any).electronAPI.openPlayerWindow())
      const playerWindow = await waitForPlayerWindow(app, 8_000)
      await playerWindow.waitForLoadState('domcontentloaded')
      await expect(dmWindow.getByTestId('button-compendium-pdf-send')).toBeEnabled({ timeout: 10_000 })
      await dmWindow.getByTestId('button-compendium-pdf-send').click()
      await expect(playerWindow.getByTestId('player-handout')).toBeVisible({ timeout: 10_000 })
      await expect(playerWindow.getByTestId('player-handout-title')).toContainText(/srd-en-5\.2\.1\.pdf/i)
      await dmWindow.getByTestId('button-compendium-pdf-stop-send').click()
      await expect(playerWindow.getByTestId('player-handout')).toHaveCount(0)

      const corruptPdf = resolve(userDataDir, 'corrupt-compendium.pdf')
      writeFileSync(corruptPdf, '%PDF-1.7\nthis is not a valid xref table\n%%EOF\n')
      await mockOpenDialog(app, [corruptPdf])
      await dmWindow.getByTestId('button-import-compendium-pdf').click()
      await expect(dmWindow.getByTestId('compendium-pdf-loading')).toContainText('⚠️', { timeout: 30_000 })
      await expect.poll(async () => {
        const files = await dmWindow.evaluate(() => (window as any).electronAPI.listCompendium())
        return files.some((file: any) => file.name === 'corrupt-compendium.pdf' && file.source === 'user')
      }).toBe(true)
    } finally {
      await dmWindow.evaluate(() =>
        (window as any).electronAPI.closePlayerWindow().catch(() => {}),
      ).catch(() => {})
      await close()
    }
  })
})
