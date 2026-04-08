import { ipcMain, dialog, app } from 'electron'
import { join, basename, extname } from 'path'
import {
  existsSync, mkdirSync, createWriteStream,
  createReadStream, copyFileSync, readdirSync, readFileSync,
} from 'fs'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { IPC } from '../../shared/ipc-types'
import { getDb, closeDatabase, initDatabase } from '../db/database'

export function registerExportImportHandlers(): void {
  // ── Duplicate Campaign ─────────────────────────────────────────────────────
  ipcMain.handle(IPC.DUPLICATE_CAMPAIGN, async (_event, campaignId: number) => {
    const db = getDb()
    const original = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as
      | { name: string } | undefined
    if (!original) return { success: false, error: 'Kampagne nicht gefunden' }
    const data = buildCampaignExport(campaignId, db)
    data.campaign.name = `${data.campaign.name} (Kopie)`
    const newId = insertCampaignData(data, db)
    const newCampaign = db.prepare('SELECT id, name, created_at, last_opened FROM campaigns WHERE id = ?').get(newId) as any
    return {
      success: true,
      campaign: {
        id: newCampaign.id,
        name: newCampaign.name,
        createdAt: newCampaign.created_at,
        lastOpened: newCampaign.last_opened,
      },
    }
  })

  // ── Export Campaign ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.EXPORT_CAMPAIGN, async (_event, campaignId: number) => {
    const db = getDb()

    const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as
      | { name: string } | undefined
    if (!campaign) return { success: false, error: 'Kampagne nicht gefunden' }

    const safeName = campaign.name.replace(/[^a-z0-9äöüß\-_ ]/gi, '_').trim()
    const defaultPath = `RollBerry_${safeName}_${new Date().toISOString().slice(0, 10)}.zip`

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Kampagne exportieren',
      defaultPath,
      filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    return buildZip(campaignId, db, filePath)
  })

  // ── Quick Backup (no dialog, auto-path) ───────────────────────────────────
  ipcMain.handle(IPC.QUICK_BACKUP, async (_event, campaignId: number) => {
    const db = getDb()

    const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as
      | { name: string } | undefined
    if (!campaign) return { success: false, error: 'Kampagne nicht gefunden' }

    const safeName = campaign.name.replace(/[^a-z0-9äöüß\-_ ]/gi, '_').trim()
    const ts = new Date()
    const isoDate = ts.toISOString().slice(0, 10)
    const stamp = ts.getTime()
    const filename = `RollBerry_${safeName}_${isoDate}_${stamp}.zip`

    const backupDir = join(app.getPath('documents'), 'RollBerry-Backups')
    mkdirSync(backupDir, { recursive: true })
    const filePath = join(backupDir, filename)

    const result = await buildZip(campaignId, db, filePath)
    return { ...result, filePath }
  })

  // ── Import Campaign ────────────────────────────────────────────────────────
  ipcMain.handle(IPC.IMPORT_CAMPAIGN, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Kampagne importieren',
      filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths[0]) return { success: false, canceled: true }

    const zipPath = filePaths[0]
    const userData = app.getPath('userData')
    const importDir = join(userData, 'imports', `import_${Date.now()}`)
    mkdirSync(importDir, { recursive: true })

    await new Promise<void>((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: importDir }))
        .on('close', resolve)
        .on('error', reject)
    })

    const campaignJsonPath = join(importDir, 'campaign.json')
    if (!existsSync(campaignJsonPath)) {
      return { success: false, error: 'Ungültige Kampagnen-Datei (campaign.json fehlt)' }
    }

    const campaignData = JSON.parse(
      readFileSync(campaignJsonPath, 'utf-8')
    ) as CampaignExport

    const assetsDir = join(importDir, 'assets')
    const destAssetsDir = join(userData, 'assets', 'imported')
    mkdirSync(destAssetsDir, { recursive: true })

    const pathMap = new Map<string, string>()

    if (existsSync(assetsDir)) {
      for (const file of readdirSync(assetsDir)) {
        const src = join(assetsDir, file)
        const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${extname(file)}`
        const dest = join(destAssetsDir, destName)
        copyFileSync(src, dest)
        pathMap.set(`assets/${file}`, dest)
      }
    }

    remapPaths(campaignData, pathMap)

    const db = getDb()
    const newCampaignId = insertCampaignData(campaignData, db)

    return { success: true, campaignId: newCampaignId }
  })
}

// ── Shared ZIP builder ────────────────────────────────────────────────────────

function buildZip(
  campaignId: number,
  db: ReturnType<typeof getDb>,
  filePath: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const output = createWriteStream(filePath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', () => resolve({ success: true }))
    archive.on('error', (err) => resolve({ success: false, error: err.message }))
    archive.pipe(output)

    const campaignData = buildCampaignExport(campaignId, db)
    archive.append(JSON.stringify(campaignData, null, 2), { name: 'campaign.json' })

    const paths = collectAssetPaths(campaignData)
    const added = new Set<string>()
    for (const p of paths) {
      if (p && existsSync(p) && !added.has(p)) {
        archive.file(p, { name: `assets/${basename(p)}` })
        added.add(p)
      }
    }

    archive.finalize()
  })
}

// ── Export data structures ───────────────────────────────────────────────────

interface CampaignExport {
  version: number
  campaign: { name: string }
  maps: Array<{
    name: string; imagePath: string; gridType: string; gridSize: number; orderIndex: number; rotation: number; ftPerUnit: number
    tokens: Array<{
      name: string; imagePath: string | null; x: number; y: number; size: number
      hpCurrent: number; hpMax: number; visibleToPlayers: number
      rotation: number; locked: number; zIndex: number; markerColor: string | null
      ac: number | null; notes: string | null; statusEffects: string | null
    }>
    fogBitmap: string | null
    exploredBitmap: string | null
    initiative: Array<{ combatantName: string; roll: number; currentTurn: number }>
    notes: string
  }>
  campaignNote: string
  handouts: Array<{
    title: string; imagePath: string | null; textContent: string | null
  }>
}

function buildCampaignExport(campaignId: number, db: ReturnType<typeof getDb>): CampaignExport {
  const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as { name: string }
  const maps = db.prepare('SELECT * FROM maps WHERE campaign_id = ? ORDER BY order_index').all(campaignId) as any[]
  const campaignNote = (db.prepare(
    'SELECT content FROM notes WHERE campaign_id = ? AND map_id IS NULL'
  ).get(campaignId) as { content: string } | undefined)?.content ?? ''

  return {
    version: 3,
    campaign: { name: campaign.name },
    campaignNote,
    maps: maps.map((m) => {
      const tokens = db.prepare('SELECT * FROM tokens WHERE map_id = ?').all(m.id) as any[]
      const fog = (db.prepare('SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?').get(m.id) as any) ?? null
      const initiative = db.prepare('SELECT * FROM initiative WHERE map_id = ?').all(m.id) as any[]
      const note = (db.prepare('SELECT content FROM notes WHERE campaign_id = ? AND map_id = ?').get(campaignId, m.id) as any)?.content ?? ''
      return {
        name: m.name,
        imagePath: m.image_path,
        gridType: m.grid_type,
        gridSize: m.grid_size,
        orderIndex: m.order_index,
        rotation: m.rotation ?? 0,
        ftPerUnit: m.ft_per_unit ?? 5,
        tokens: tokens.map((t) => ({
          name: t.name,
          imagePath: t.image_path,
          x: t.x, y: t.y, size: t.size,
          hpCurrent: t.hp_current, hpMax: t.hp_max,
          visibleToPlayers: t.visible_to_players,
          rotation: t.rotation ?? 0,
          locked: t.locked ?? 0,
          zIndex: t.z_index ?? 0,
          markerColor: t.marker_color ?? null,
          ac: t.ac ?? null,
          notes: t.notes ?? null,
          statusEffects: t.status_effects ?? null,
        })),
        fogBitmap: fog?.fog_bitmap ?? null,
        exploredBitmap: fog?.explored_bitmap ?? null,
        initiative: initiative.map((i) => ({
          combatantName: i.combatant_name, roll: i.roll, currentTurn: i.current_turn,
        })),
        notes: note,
      }
    }),
    handouts: (db.prepare('SELECT title, image_path, text_content FROM handouts WHERE campaign_id = ?').all(campaignId) as any[]).map((h) => ({
      title: h.title,
      imagePath: h.image_path,
      textContent: h.text_content,
    })),
  }
}

function collectAssetPaths(data: CampaignExport): string[] {
  const paths: string[] = []
  for (const m of data.maps) {
    paths.push(m.imagePath)
    for (const t of m.tokens) if (t.imagePath) paths.push(t.imagePath)
  }
  for (const h of data.handouts) if (h.imagePath) paths.push(h.imagePath)
  return paths
}

function remapPaths(data: CampaignExport, map: Map<string, string>) {
  for (const m of data.maps) {
    const baseName = `assets/${basename(m.imagePath)}`
    if (map.has(baseName)) m.imagePath = map.get(baseName)!
    for (const t of m.tokens) {
      if (t.imagePath) {
        const k = `assets/${basename(t.imagePath)}`
        if (map.has(k)) t.imagePath = map.get(k)!
      }
    }
  }
}

function insertCampaignData(data: CampaignExport, db: ReturnType<typeof getDb>): number {
  return db.transaction(() => {
    const campResult = db.prepare(`INSERT INTO campaigns (name) VALUES (?)`).run(data.campaign.name)
    const campaignId = Number(campResult.lastInsertRowid)

    if (data.campaignNote) {
      db.prepare(`INSERT INTO notes (campaign_id, map_id, content) VALUES (?, NULL, ?)`).run(campaignId, data.campaignNote)
    }

    for (const m of data.maps) {
      const mapResult = db.prepare(
        `INSERT INTO maps (campaign_id, name, image_path, grid_type, grid_size, order_index, rotation, ft_per_unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(campaignId, m.name, m.imagePath, m.gridType, m.gridSize, m.orderIndex, m.rotation ?? 0, m.ftPerUnit ?? 5)
      const mapId = Number(mapResult.lastInsertRowid)

      for (const t of m.tokens) {
        db.prepare(
          `INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(mapId, t.name, t.imagePath, t.x, t.y, t.size, t.hpCurrent, t.hpMax, t.visibleToPlayers,
          t.rotation ?? 0, t.locked ?? 0, t.zIndex ?? 0, t.markerColor ?? null, t.ac ?? null, t.notes ?? null, t.statusEffects ?? null)
      }

      if (m.fogBitmap) {
        db.prepare(
          `INSERT INTO fog_state (map_id, fog_bitmap, explored_bitmap) VALUES (?, ?, ?)`
        ).run(mapId, m.fogBitmap, m.exploredBitmap ?? null)
      }

      for (const i of m.initiative) {
        db.prepare(`INSERT INTO initiative (map_id, combatant_name, roll, current_turn) VALUES (?, ?, ?, ?)`)
          .run(mapId, i.combatantName, i.roll, i.currentTurn)
      }

      if (m.notes) {
        db.prepare(`INSERT INTO notes (campaign_id, map_id, content) VALUES (?, ?, ?)`).run(campaignId, mapId, m.notes)
      }
    }

    for (const h of data.handouts ?? []) {
      db.prepare(
        `INSERT INTO handouts (campaign_id, title, image_path, text_content) VALUES (?, ?, ?, ?)`
      ).run(campaignId, h.title, h.imagePath, h.textContent)
    }

    return campaignId
  })()
}
