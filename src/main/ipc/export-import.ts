import { ipcMain, dialog, app } from 'electron'
import path from 'path'
import {
  existsSync, mkdirSync, createWriteStream,
  createReadStream, copyFileSync, readdirSync, readFileSync, rmSync,
} from 'fs'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { IPC } from '../../shared/ipc-types'
import { getDb, closeDatabase, initDatabase } from '../db/database'

export function registerExportImportHandlers(): void {
  // ── Duplicate Campaign ─────────────────────────────────────────────────────────
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

  // ── Export Campaign ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.EXPORT_CAMPAIGN, async (_event, campaignId: number) => {
    const db = getDb()

    const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as
      | { name: string } | undefined
    if (!campaign) return { success: false, error: 'Kampagne nicht gefunden' }

    const safeName = campaign.name.replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df\-_ ]/gi, '_').trim()
    const defaultPath = `BoltBerry_${safeName}_${new Date().toISOString().slice(0, 10)}.zip`

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Kampagne exportieren',
      defaultPath,
      filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    return buildZip(campaignId, db, filePath)
  })

  // ── Quick Backup (no dialog, auto-path) ───────────────────────────────────────
  ipcMain.handle(IPC.QUICK_BACKUP, async (_event, campaignId: number) => {
    const db = getDb()

    const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as
      | { name: string } | undefined
    if (!campaign) return { success: false, error: 'Kampagne nicht gefunden' }

    const safeName = campaign.name.replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df\-_ ]/gi, '_').trim()
    const ts = new Date()
    const isoDate = ts.toISOString().slice(0, 10)
    const stamp = ts.getTime()
    const filename = `BoltBerry_${safeName}_${isoDate}_${stamp}.zip`

    const backupDir = path.join(app.getPath('documents'), 'BoltBerry-Backups')
    mkdirSync(backupDir, { recursive: true })
    const filePath = path.join(backupDir, filename)

    const result = await buildZip(campaignId, db, filePath)
    return { ...result, filePath }
  })

  // ── Import Campaign ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.IMPORT_CAMPAIGN, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Kampagne importieren',
      filters: [{ name: 'ZIP-Archiv', extensions: ['zip'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths[0]) return { success: false, canceled: true }

    const zipPath = filePaths[0]
    const userData = app.getPath('userData')
    const importDir = path.join(userData, 'imports', `import_${Date.now()}`)
    mkdirSync(importDir, { recursive: true })

    // Extract with path-traversal protection using unzipper.Parse
    await new Promise<void>((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry: unzipper.Entry) => {
          const entryPath: string = entry.path
          // Normalize and validate: must not escape importDir
          const dest = path.resolve(importDir, entryPath)
          if (!dest.startsWith(importDir + path.sep) && dest !== importDir) {
            entry.autodrain()
            return
          }
          if (entry.type === 'Directory') {
            mkdirSync(dest, { recursive: true })
            entry.autodrain()
          } else {
            mkdirSync(path.dirname(dest), { recursive: true })
            entry.pipe(createWriteStream(dest))
          }
        })
        .on('close', resolve)
        .on('error', reject)
    })

    const campaignJsonPath = path.join(importDir, 'campaign.json')
    if (!existsSync(campaignJsonPath)) {
      rmSync(importDir, { recursive: true, force: true })
      return { success: false, error: 'Ung\u00fcltige Kampagnen-Datei (campaign.json fehlt)' }
    }

    let campaignData: CampaignExport
    try {
      campaignData = JSON.parse(readFileSync(campaignJsonPath, 'utf-8')) as CampaignExport
    } catch {
      rmSync(importDir, { recursive: true, force: true })
      return { success: false, error: 'campaign.json konnte nicht gelesen werden' }
    }

    const assetsDir = path.join(importDir, 'assets')
    const destAssetsDir = path.join(userData, 'assets', 'imported')
    mkdirSync(destAssetsDir, { recursive: true })

    const pathMap = new Map<string, string>()

    if (existsSync(assetsDir)) {
      const importAssetsDir = path.join(importDir, 'assets')
      const walkDir = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const srcPath = path.join(dir, entry.name)
          const entryKey = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.isDirectory()) {
            walkDir(srcPath, entryKey)
          } else {
            const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(entry.name)}`
            const dest = path.join(destAssetsDir, destName)
            copyFileSync(srcPath, dest)
            pathMap.set(`assets/${entryKey}`, path.relative(userData, dest))
          }
        }
      }
      walkDir(importAssetsDir, '')
    }

    remapPaths(campaignData, pathMap)

    const db = getDb()
    const newCampaignId = insertCampaignData(campaignData, db)

    // Clean up the temporary extraction directory
    rmSync(importDir, { recursive: true, force: true })

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

    const userData = app.getPath('userData')
    const paths = collectAssetPaths(campaignData)
    const added = new Set<string>()
    for (const p of paths) {
      if (!p) continue
      const absPath = path.resolve(userData, p)
      // Security: ensure path stays within userData
      if (!absPath.startsWith(userData + path.sep) && absPath !== userData) continue
      if (existsSync(absPath) && !added.has(p)) {
        archive.file(absPath, { name: p })
        added.add(p)
      }
    }

    archive.finalize()
  })
}

// ── Export data structures ─────────────────────────────────────────────────────

interface CampaignExport {
  version: number
  campaign: { name: string }
  maps: Array<{
    name: string; imagePath: string; gridType: string; gridSize: number; orderIndex: number; rotation: number; ftPerUnit: number; gridOffsetX: number; gridOffsetY: number; ambientBrightness: number
    tokens: Array<{
      id: number; name: string; imagePath: string | null; x: number; y: number; size: number
      hpCurrent: number; hpMax: number; visibleToPlayers: number
      rotation: number; locked: number; zIndex: number; markerColor: string | null
      ac: number | null; notes: string | null; statusEffects: string | null
      faction: string; showName: number
    }>
    gmPins: Array<{
      x: number; y: number; label: string; icon: string; color: string
    }>
    drawings: Array<{
      type: string; points: string; color: string; width: number; synced: number
    }>
    fogBitmap: string | null
    exploredBitmap: string | null
    initiative: Array<{ combatantName: string; roll: number; currentTurn: number; tokenId: number | null; effectTimers: string | null }>
    notes: string
    rooms: Array<{
      name: string; description: string; polygon: string; visibility: string; encounterId: number | null; atmosphereHint: string | null; notes: string | null; color: string; createdAt: string
    }>
  }>
  campaignNote: string
  handouts: Array<{
    title: string; imagePath: string | null; textContent: string | null
  }>
  encounters: Array<{
    name: string; templateData: string; notes: string | null; createdAt: string
  }>
}

function buildCampaignExport(campaignId: number, db: ReturnType<typeof getDb>): CampaignExport {
  const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as { name: string } | undefined
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)
  const maps = db.prepare('SELECT * FROM maps WHERE campaign_id = ? ORDER BY order_index').all(campaignId) as any[]
  const campaignNote = (db.prepare(
    'SELECT content FROM notes WHERE campaign_id = ? AND map_id IS NULL'
  ).get(campaignId) as { content: string } | undefined)?.content ?? ''

  return {
    version: 7,
    campaign: { name: campaign.name },
    campaignNote,
    maps: maps.map((m) => {
      const tokens = db.prepare('SELECT * FROM tokens WHERE map_id = ?').all(m.id) as any[]
      const fog = (db.prepare('SELECT fog_bitmap, explored_bitmap FROM fog_state WHERE map_id = ?').get(m.id) as any) ?? null
      const initiative = db.prepare('SELECT * FROM initiative WHERE map_id = ?').all(m.id) as any[]
      const gmPins = db.prepare('SELECT x, y, label, icon, color FROM gm_pins WHERE map_id = ?').all(m.id) as any[]
      const drawings = db.prepare('SELECT type, points, color, width, synced FROM drawings WHERE map_id = ?').all(m.id) as any[]
      const note = (db.prepare('SELECT content FROM notes WHERE campaign_id = ? AND map_id = ?').get(campaignId, m.id) as any)?.content ?? ''
      return {
        name: m.name,
        imagePath: m.image_path,
        gridType: m.grid_type,
        gridSize: m.grid_size,
        orderIndex: m.order_index,
        rotation: m.rotation ?? 0,
        ftPerUnit: m.ft_per_unit ?? 5,
        gridOffsetX: m.grid_offset_x ?? 0,
        gridOffsetY: m.grid_offset_y ?? 0,
        ambientBrightness: m.ambient_brightness ?? 100,
        tokens: tokens.map((t) => ({
          id: t.id,
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
          faction: t.faction ?? 'party',
          showName: t.show_name ?? 1,
        })),
        gmPins: gmPins.map((p) => ({
          x: p.x, y: p.y, label: p.label, icon: p.icon, color: p.color,
        })),
        drawings: drawings.map((d) => ({
          type: d.type, points: d.points, color: d.color, width: d.width, synced: d.synced,
        })),
        fogBitmap: fog?.fog_bitmap ?? null,
        exploredBitmap: fog?.explored_bitmap ?? null,
        initiative: initiative.map((i) => ({
          combatantName: i.combatant_name, roll: i.roll, currentTurn: i.current_turn, tokenId: i.token_id ?? null,
          effectTimers: i.effect_timers ?? null,
        })),
        notes: note,
        rooms: (db.prepare('SELECT name, description, polygon, visibility, encounter_id, atmosphere_hint, notes, color, created_at FROM rooms WHERE map_id = ?').all(m.id) as any[]).map((r) => ({
          name: r.name,
          description: r.description,
          polygon: r.polygon,
          visibility: r.visibility,
          encounterId: r.encounter_id,
          atmosphereHint: r.atmosphere_hint,
          notes: r.notes,
          color: r.color,
          createdAt: r.created_at,
        })),
      }
    }),
    handouts: (db.prepare('SELECT title, image_path, text_content FROM handouts WHERE campaign_id = ?').all(campaignId) as any[]).map((h) => ({
      title: h.title,
      imagePath: h.image_path,
      textContent: h.text_content,
    })),
    encounters: (db.prepare('SELECT name, template_data, notes, created_at FROM encounters WHERE campaign_id = ?').all(campaignId) as any[]).map((e) => ({
      name: e.name,
      templateData: e.template_data,
      notes: e.notes,
      createdAt: e.created_at,
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
    m.imagePath = findRemap(m.imagePath, map)
    for (const t of m.tokens) {
      if (t.imagePath) t.imagePath = findRemap(t.imagePath, map)
    }
  }
  for (const h of data.handouts) {
    if (h.imagePath) h.imagePath = findRemap(h.imagePath, map)
  }
}

function findRemap(imagePath: string, map: Map<string, string>): string {
  for (const [key, val] of map) {
    if (imagePath.endsWith(key.replace(/^\/assets\//, '')) || imagePath === key) {
      return val
    }
  }
  return imagePath
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
        `INSERT INTO maps (campaign_id, name, image_path, grid_type, grid_size, order_index, rotation, ft_per_unit, grid_offset_x, grid_offset_y, ambient_brightness)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(campaignId, m.name, m.imagePath, m.gridType, m.gridSize, m.orderIndex, m.rotation ?? 0, m.ftPerUnit ?? 5, m.gridOffsetX ?? 0, m.gridOffsetY ?? 0, m.ambientBrightness ?? 100)
      const mapId = Number(mapResult.lastInsertRowid)

      const tokenIdMap = new Map<number, number>()

      for (const t of m.tokens) {
        const result = db.prepare(
          `INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(mapId, t.name, t.imagePath, t.x, t.y, t.size, t.hpCurrent, t.hpMax, t.visibleToPlayers,
          t.rotation ?? 0, t.locked ?? 0, t.zIndex ?? 0, t.markerColor ?? null, t.ac ?? null, t.notes ?? null, t.statusEffects ?? null,
          t.faction ?? 'party', t.showName ?? 1)
        tokenIdMap.set(t.id, Number(result.lastInsertRowid))
      }

      if (m.fogBitmap) {
        db.prepare(
          `INSERT INTO fog_state (map_id, fog_bitmap, explored_bitmap) VALUES (?, ?, ?)`
        ).run(mapId, m.fogBitmap, m.exploredBitmap ?? null)
      }

      for (const p of m.gmPins ?? []) {
        db.prepare(
          `INSERT INTO gm_pins (map_id, x, y, label, icon, color) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(mapId, p.x, p.y, p.label, p.icon, p.color)
      }

      for (const d of m.drawings ?? []) {
        db.prepare(
          `INSERT INTO drawings (map_id, type, points, color, width, synced) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(mapId, d.type, d.points, d.color, d.width, d.synced)
      }

      for (const i of m.initiative) {
        const mappedTokenId = i.tokenId != null ? (tokenIdMap.get(i.tokenId) ?? null) : null
        db.prepare(`INSERT INTO initiative (map_id, combatant_name, roll, current_turn, token_id, effect_timers) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(mapId, i.combatantName, i.roll, i.currentTurn, mappedTokenId, i.effectTimers ?? null)
      }

      if (m.notes) {
        db.prepare(`INSERT INTO notes (campaign_id, map_id, content) VALUES (?, ?, ?)`).run(campaignId, mapId, m.notes)
      }

      for (const r of m.rooms ?? []) {
        db.prepare(
          `INSERT INTO rooms (map_id, name, description, polygon, visibility, encounter_id, atmosphere_hint, notes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(mapId, r.name, r.description, r.polygon, r.visibility, r.encounterId, r.atmosphereHint, r.notes, r.color, r.createdAt ?? new Date().toISOString())
      }
    }

    for (const h of data.handouts ?? []) {
      db.prepare(
        `INSERT INTO handouts (campaign_id, title, image_path, text_content) VALUES (?, ?, ?, ?)`
      ).run(campaignId, h.title, h.imagePath, h.textContent)
    }

    for (const e of data.encounters ?? []) {
      db.prepare(
        `INSERT INTO encounters (campaign_id, name, template_data, notes, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(campaignId, e.name, e.templateData, e.notes, e.createdAt ?? new Date().toISOString())
    }

    return campaignId
  })()
}
