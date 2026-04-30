import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { launchApp } from '../helpers/electron-launch'
import { mockOpenDialog } from '../helpers/dialog-helpers'

const EN_SRD_PDF = resolve(__dirname, '../../resources/compendium/srd-en-5.2.1.pdf')

async function openBestiary(page: import('@playwright/test').Page) {
  await page.getByTestId('nav-bestiary').click()
  await expect(page.getByTestId('screen-bestiary')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('tab-bestiary-monsters').click()
  await expect(page.getByTestId('panel-bestiary-monsters')).toBeVisible()
}

async function openCompendium(page: import('@playwright/test').Page) {
  await page.getByTestId('nav-compendium').click()
  await expect(page.getByTestId('screen-compendium')).toBeVisible({ timeout: 15_000 })
}

test.describe('Reference workflows', () => {
  test.describe.configure({ timeout: 120_000 })

  test('bestiary searches monsters, items, spells, and user wiki entries', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const seed = await dmWindow.evaluate(async () => {
        const api = (window as any).electronAPI
        const [monsters, items, spells] = await Promise.all([
          api.listMonsters(),
          api.listItems(),
          api.listSpells(),
        ])
        return {
          monster: monsters.find((m: any) => m.name || m.nameDe),
          item: items.find((i: any) => i.name || i.nameDe),
          spell: spells.find((s: any) => s.name || s.nameDe),
        }
      })
      expect(seed.monster).toBeTruthy()
      expect(seed.item).toBeTruthy()
      expect(seed.spell).toBeTruthy()

      await openBestiary(dmWindow)

      await dmWindow.getByTestId('input-bestiary-search').fill(seed.monster.nameDe ?? seed.monster.name)
      await dmWindow.getByTestId('list-item-bestiary-monster')
        .filter({ hasText: seed.monster.nameDe ?? seed.monster.name })
        .first()
        .click()
      await expect(dmWindow.getByTestId('detail-bestiary-monster')).toContainText(seed.monster.nameDe ?? seed.monster.name)

      await dmWindow.getByTestId('tab-bestiary-items').click()
      await expect(dmWindow.getByTestId('panel-bestiary-items')).toBeVisible()
      await dmWindow.getByTestId('input-bestiary-search').fill(seed.item.nameDe ?? seed.item.name)
      await dmWindow.getByTestId('list-item-bestiary-item')
        .filter({ hasText: seed.item.nameDe ?? seed.item.name })
        .first()
        .click()
      await expect(dmWindow.getByTestId('detail-bestiary-item')).toContainText(seed.item.nameDe ?? seed.item.name)

      await dmWindow.getByTestId('tab-bestiary-spells').click()
      await expect(dmWindow.getByTestId('panel-bestiary-spells')).toBeVisible()
      await dmWindow.getByTestId('input-bestiary-search').fill(seed.spell.nameDe ?? seed.spell.name)
      await dmWindow.getByTestId('list-item-bestiary-spell')
        .filter({ hasText: seed.spell.nameDe ?? seed.spell.name })
        .first()
        .click()
      await expect(dmWindow.getByTestId('detail-bestiary-spell')).toContainText(seed.spell.nameDe ?? seed.spell.name)

      const slug = `e2e-clockwork-beetle-${Date.now()}`
      const name = 'E2E Clockwork Beetle'
      const nameDe = 'E2E Uhrwerkkaefer'
      const upsert = await dmWindow.evaluate(async ({ slug, name, nameDe }) => {
        return (window as any).electronAPI.upsertWikiEntry('monster', slug, {
          id: 900001,
          slug,
          name,
          nameDe,
          source: 'E2E',
          meta: { en: 'Tiny construct, unaligned', de: 'Winziges Konstrukt, gesinnungslos' },
          challenge: '1/8',
          xp: 25,
          ac: '13',
          hp: { en: '7 (2d4 + 2)', de: '7 (2W4 + 2)' },
          str: 4, dex: 14, con: 12, int: 3, wis: 10, cha: 5,
          size: { en: 'Tiny', de: 'Winzig' },
          type: { en: 'Construct', de: 'Konstrukt' },
          alignment: { en: 'unaligned', de: 'gesinnungslos' },
          senses: { en: ['darkvision 30 ft.'], de: ['Dunkelsicht 9 m'] },
          languages: { en: ['understands its creator'], de: ['versteht seinen Erschaffer'] },
          traits: {
            en: [{ name: 'Clockwork Shell', text: 'The beetle has advantage on saves against being charmed.' }],
            de: [{ name: 'Uhrwerkpanzer', text: 'Der Kaefer ist bei Rettungswuerfen gegen bezaubert im Vorteil.' }],
          },
          actions: {
            en: [{ name: 'Spark Bite', text: 'Melee Weapon Attack: +4 to hit, 1 lightning damage.' }],
            de: [{ name: 'Funkenbiss', text: 'Nahkampfwaffenangriff: +4 auf Treffer, 1 Blitzschaden.' }],
          },
          license: 'E2E',
          licenseSource: 'E2E',
        })
      }, { slug, name, nameDe })
      expect(upsert.success).toBe(true)

      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await openBestiary(dmWindow)
      await dmWindow.getByTestId('input-bestiary-search').fill(nameDe)
      await dmWindow.getByTestId('list-item-bestiary-monster').filter({ hasText: nameDe }).click()
      await expect(dmWindow.getByTestId('detail-bestiary-monster')).toContainText(nameDe)

      const deletion = await dmWindow.evaluate((slug) => (window as any).electronAPI.deleteWikiEntry('monster', slug), slug)
      expect(deletion.success).toBe(true)
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await openBestiary(dmWindow)
      await dmWindow.getByTestId('input-bestiary-search').fill(nameDe)
      await expect(dmWindow.getByTestId('list-item-bestiary-monster')).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('bestiary persists user-authored items and spells through search, detail, and delete', async () => {
    const { dmWindow, close } = await launchApp()
    try {
      const suffix = Date.now()
      const itemSlug = `e2e-starlit-lantern-${suffix}`
      const itemName = 'E2E Starlit Lantern'
      const itemNameDe = 'E2E Sternenlaterne'
      const spellSlug = `e2e-silver-mist-${suffix}`
      const spellName = 'E2E Silver Mist'
      const spellNameDe = 'E2E Silbernebel'

      const upserted = await dmWindow.evaluate(async ({ itemSlug, itemName, itemNameDe, spellSlug, spellName, spellNameDe }) => {
        const api = (window as any).electronAPI
        const item = await api.upsertWikiEntry('item', itemSlug, {
          id: 900101,
          slug: itemSlug,
          name: itemName,
          nameDe: itemNameDe,
          category: { en: 'WONDROUS_ITEMS', de: 'Wundersame Gegenstaende' },
          rarity: { en: 'UNCOMMON', de: 'Ungewoehnlich' },
          cost: 125,
          weight: 1,
          description: {
            en: 'A lantern that marks hidden doors with pale starlight.',
            de: 'Eine Laterne, die geheime Tueren mit blassem Sternenlicht markiert.',
          },
          license: 'E2E',
          licenseSource: 'E2E',
        })
        const spell = await api.upsertWikiEntry('spell', spellSlug, {
          id: 900102,
          slug: spellSlug,
          name: spellName,
          nameDe: spellNameDe,
          level: { en: '1', de: '1' },
          school: { en: 'illusion', de: 'Illusion' },
          classes: { en: ['wizard'], de: ['Magier'] },
          castingTime: { en: '1 action', de: '1 Aktion' },
          range: { en: '30 feet', de: '9 Meter' },
          duration: { en: '1 minute', de: '1 Minute' },
          components: { verbal: true, somatic: true, raw: { en: 'V, S', de: 'V, G' } },
          description: {
            en: 'Silver mist lightly obscures a creature until the start of your next turn.',
            de: 'Silberner Nebel verschleiert eine Kreatur bis zum Beginn deines naechsten Zuges.',
          },
          license: 'E2E',
          licenseSource: 'E2E',
        })
        return { item, spell }
      }, { itemSlug, itemName, itemNameDe, spellSlug, spellName, spellNameDe })

      expect(upserted.item.success).toBe(true)
      expect(upserted.spell.success).toBe(true)

      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await openBestiary(dmWindow)

      await dmWindow.getByTestId('tab-bestiary-items').click()
      await expect(dmWindow.getByTestId('panel-bestiary-items')).toBeVisible()
      await dmWindow.getByTestId('input-bestiary-search').fill(itemNameDe)
      await dmWindow.getByTestId('list-item-bestiary-item').filter({ hasText: itemNameDe }).click()
      await expect(dmWindow.getByTestId('detail-bestiary-item')).toContainText(itemNameDe)
      await expect(dmWindow.getByTestId('detail-bestiary-item')).toContainText('Sternenlicht')

      await dmWindow.getByTestId('tab-bestiary-spells').click()
      await expect(dmWindow.getByTestId('panel-bestiary-spells')).toBeVisible()
      await dmWindow.getByTestId('input-bestiary-search').fill(spellNameDe)
      await dmWindow.getByTestId('list-item-bestiary-spell').filter({ hasText: spellNameDe }).click()
      await expect(dmWindow.getByTestId('detail-bestiary-spell')).toContainText(spellNameDe)
      await expect(dmWindow.getByTestId('detail-bestiary-spell')).toContainText('Silberner Nebel')

      const deleted = await dmWindow.evaluate(async ({ itemSlug, spellSlug }) => {
        const api = (window as any).electronAPI
        return {
          item: await api.deleteWikiEntry('item', itemSlug),
          spell: await api.deleteWikiEntry('spell', spellSlug),
        }
      }, { itemSlug, spellSlug })
      expect(deleted.item.success).toBe(true)
      expect(deleted.spell.success).toBe(true)

      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })
      await openBestiary(dmWindow)
      await dmWindow.getByTestId('tab-bestiary-items').click()
      await dmWindow.getByTestId('input-bestiary-search').fill(itemNameDe)
      await expect(dmWindow.getByTestId('list-item-bestiary-item')).toHaveCount(0)
      await dmWindow.getByTestId('tab-bestiary-spells').click()
      await dmWindow.getByTestId('input-bestiary-search').fill(spellNameDe)
      await expect(dmWindow.getByTestId('list-item-bestiary-spell')).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('compendium imports a real PDF and supports page navigation, zoom, and text search', async () => {
    const { app, dmWindow, close } = await launchApp()
    try {
      expect(existsSync(EN_SRD_PDF), `Missing SRD PDF fixture at ${EN_SRD_PDF}`).toBe(true)
      await dmWindow.evaluate(() => {
        localStorage.setItem('boltberry-language', 'en')
      })
      await dmWindow.reload()
      await expect(dmWindow.getByTestId('screen-dashboard')).toBeVisible({ timeout: 15_000 })

      await openCompendium(dmWindow)
      await expect(dmWindow.getByTestId('compendium-pdf-viewer')).toBeVisible({ timeout: 30_000 })
      await expect.poll(async () => {
        return dmWindow.getByTestId('canvas-compendium-pdf-page').evaluate((canvas) => {
          const c = canvas as HTMLCanvasElement
          return c.width * c.height
        })
      }, { timeout: 30_000 }).toBeGreaterThan(0)

      await dmWindow.getByTestId('button-compendium-pdf-next').click()
      await expect(dmWindow.getByTestId('input-compendium-pdf-page')).toHaveValue('2')
      await dmWindow.getByTestId('button-compendium-pdf-zoom-in').click()
      await expect(dmWindow.getByTestId('button-compendium-pdf-zoom-reset')).toContainText('120%')

      await dmWindow.getByTestId('button-compendium-pdf-search').click()
      await dmWindow.getByTestId('input-compendium-pdf-search').fill('the')
      await expect(dmWindow.getByTestId('list-item-compendium-pdf-search-hit').first()).toBeVisible({ timeout: 45_000 })

      await dmWindow.getByTestId('input-compendium-global-search').fill('spell')
      await expect(dmWindow.getByTestId('list-item-compendium-global-search-hit').first()).toBeVisible({ timeout: 60_000 })
      await dmWindow.getByTestId('list-item-compendium-global-search-hit').first().click()
      await expect(dmWindow.getByTestId('input-compendium-global-search')).toHaveValue('')

      await mockOpenDialog(app, [EN_SRD_PDF])
      await dmWindow.getByTestId('button-import-compendium-pdf').click()
      await expect.poll(async () => {
        const files = await dmWindow.evaluate(() => (window as any).electronAPI.listCompendium())
        return files.some((file: any) => file.name === 'srd-en-5.2.1.pdf' && file.source === 'user')
      }, { timeout: 15_000 }).toBe(true)
      await expect(dmWindow.getByTestId('compendium-pdf-viewer')).toBeVisible()
    } finally {
      await close()
    }
  })
})
