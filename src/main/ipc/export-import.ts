import { ipcMain, dialog, app } from 'electron'
import path from 'path'
import {
  existsSync, mkdirSync, createWriteStream,
  createReadStream, copyFileSync, readdirSync, readFileSync, rmSync,
  renameSync, lstatSync, unlinkSync,
} from 'fs'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { IPC } from '../../shared/ipc-types'
import { getDb, getCustomUserDataPath } from '../db/database'
import { validateMagicBytes } from '../utils/magic-bytes'

const EXPORT_VERSION = 9

const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB cumulative uncompressed
const MAX_IMPORT_ENTRIES = 50_000

function getEffectiveUserDataPath(): string {
  return getCustomUserDataPath() || app.getPath('userData')
}

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

  // ── Quick Backup (no dialog, auto-path) ───────────────────────────────────
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

    const backupDir = path.join(getEffectiveUserDataPath(), 'backups')
    mkdirSync(backupDir, { recursive: true })
    const tmpPath = path.join(backupDir, `${filename}.tmp`)
    const finalPath = path.join(backupDir, filename)

    const result = await buildZip(campaignId, db, tmpPath)
    if (result.success) {
      renameSync(tmpPath, finalPath)
    } else {
      try { rmSync(tmpPath, { force: true }) } catch { /* best-effort */ }
    }
    return { ...result, filePath: finalPath }
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
    const userData = getEffectiveUserDataPath()
    const importDir = path.join(userData, 'imports', `import_${Date.now()}`)
    mkdirSync(importDir, { recursive: true })

    let cumulativeBytes = 0
    let entryCount = 0

    try {
      await new Promise<void>((resolve, reject) => {
        createReadStream(zipPath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            entryCount++
            if (entryCount > MAX_IMPORT_ENTRIES) {
              entry.autodrain()
              reject(new Error(`Archive exceeds max entry count (${MAX_IMPORT_ENTRIES})`))
              return
            }

            const entryPath: string = entry.path

            if (entryPath.includes('..') || entryPath.startsWith('/') || /^[a-zA-Z]:/.test(entryPath)) {
              entry.autodrain()
              return
            }

            const dest = path.resolve(importDir, entryPath)
            const realImportDir = path.resolve(importDir)
            if (!dest.startsWith(realImportDir + path.sep) && dest !== realImportDir) {
              entry.autodrain()
              return
            }

            if (entry.type === 'Directory') {
              mkdirSync(dest, { recursive: true })
              entry.autodrain()
            } else {
              mkdirSync(path.dirname(dest), { recursive: true })
              const ws = createWriteStream(dest)
              entry.on('data', (chunk: Buffer) => {
                cumulativeBytes += chunk.length
                if (cumulativeBytes > MAX_IMPORT_BYTES) {
                  ws.destroy()
                  entry.autodrain()
                  reject(new Error(`Archive exceeds max uncompressed size (${MAX_IMPORT_BYTES / (1024 * 1024 * 1024)} GB)`))
                }
              })
              entry.pipe(ws)
            }
          })
          .on('close', resolve)
          .on('error', reject)
      })
    } catch (err: any) {
      rmSync(importDir, { recursive: true, force: true })
      return { success: false, error: err.message || 'ZIP-Extraktion fehlgeschlagen' }
    }

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

    if (!campaignData?.campaign?.name || !Array.isArray(campaignData.maps)) {
      rmSync(importDir, { recursive: true, force: true })
      return { success: false, error: 'Ungültige Kampagnendaten: Pflichtfelder fehlen' }
    }

    const dataVersion = campaignData.version ?? 1
    if (dataVersion > EXPORT_VERSION) {
      rmSync(importDir, { recursive: true, force: true })
      return { success: false, error: `Diese Kampagne wurde mit einer neueren App-Version exportiert (v${dataVersion}). Bitte aktualisiere BoltBerry.` }
    }

    const assetsDir = path.join(importDir, 'assets')
    const destAssetsDir = path.join(userData, 'assets', 'imported')
    mkdirSync(destAssetsDir, { recursive: true })

    const pathMap = new Map<string, string>()
    // Track every file copied into destAssetsDir so we can roll them back if
    // insertCampaignData throws partway through. Without this, a failed
    // import leaves orphaned blobs in assets/imported/ that the user can
    // never reclaim through the UI.
    const copiedFiles: string[] = []

    if (existsSync(assetsDir)) {
      // Magic-byte check mirrors IMPORT_FILE: a third-party ZIP can't smuggle
      // a disguised .exe by naming it .png. Unknown extensions are rejected
      // under strict mode so only the known asset types (image/audio) make
      // it into the campaign folder.
      const rejected: string[] = []
      const walkDir = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const srcPath = path.join(dir, entry.name)
          if (entry.isSymbolicLink()) continue
          const entryKey = prefix ? `${prefix}/${entry.name}` : entry.name
          if (entry.isDirectory()) {
            walkDir(srcPath, entryKey)
          } else {
            const ext = path.extname(entry.name)
            if (!validateMagicBytes(srcPath, ext, /* strict */ true)) {
              rejected.push(entryKey)
              continue
            }
            const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
            const dest = path.join(destAssetsDir, destName)
            copyFileSync(srcPath, dest)
            copiedFiles.push(dest)
            const relDest = path.relative(userData, dest).split(path.sep).join('/')
            pathMap.set(`assets/${entryKey}`, relDest)
          }
        }
      }
      walkDir(assetsDir, '')
      if (rejected.length > 0) {
        console.warn('[export-import] IMPORT_CAMPAIGN rejected disguised files:', rejected)
      }
    }

    remapPaths(campaignData, pathMap)

    const db = getDb()
    let newCampaignId: number
    try {
      newCampaignId = insertCampaignData(campaignData, db)
    } catch (err) {
      // Roll back the extracted asset blobs — the DB transaction inside
      // insertCampaignData already reverted itself, but the file copies on
      // disk would otherwise leak. Best-effort unlink; ignore individual
      // failures so we never throw a different error from the rollback path.
      for (const f of copiedFiles) {
        try { unlinkSync(f) } catch { /* ignore */ }
      }
      rmSync(importDir, { recursive: true, force: true })
      throw err
    }

    rmSync(importDir, { recursive: true, force: true })

    return { success: true, campaignId: newCampaignId }
  })
}

// ── Shared ZIP builder ────────────────────────────────────────────────────────

function buildZip(
  campaignId: number,
  db: ReturnType<typeof getDb>,
  filePath: string,
): Promise<{ success: boolean; error?: string; missingAssets?: string[]; filePath?: string }> {
  return new Promise((resolve) => {
    const output = createWriteStream(filePath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', () => resolve({ success: true, filePath, missingAssets: missing.length ? missing : undefined }))
    archive.on('error', (err) => resolve({ success: false, error: err.message, filePath, missingAssets: missing.length ? missing : undefined }))
    archive.pipe(output)

    const campaignData = buildCampaignExport(campaignId, db)
    archive.append(JSON.stringify(campaignData, null, 2), { name: 'campaign.json' })

    const userData = getEffectiveUserDataPath()
    const assetPaths = collectAssetPaths(campaignData)
    const added = new Set<string>()
    const missing: string[] = []
    for (const p of assetPaths) {
      if (!p) continue
      const absPath = path.resolve(userData, p)
      if (!absPath.startsWith(userData + path.sep) && absPath !== userData) continue
      try {
        const stat = lstatSync(absPath)
        if (stat.isSymbolicLink()) continue
      } catch {
        missing.push(p)
        continue
      }
      if (!added.has(p)) {
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
    name: string; imagePath: string; gridType: string; gridSize: number; orderIndex: number
    rotation: number; rotationPlayer: number; ftPerUnit: number
    gridOffsetX: number; gridOffsetY: number; ambientBrightness: number
    ambientTrackPath: string | null; track1Volume: number; track2Volume: number; combatVolume: number
    tokens: Array<{
      id: number; name: string; imagePath: string | null; x: number; y: number; size: number
      hpCurrent: number; hpMax: number; visibleToPlayers: number
      rotation: number; locked: number; zIndex: number; markerColor: string | null
      ac: number | null; notes: string | null; statusEffects: string | null
      faction: string; showName: number; lightRadius: number; lightColor: string
    }>
    walls: Array<{
      x1: number; y1: number; x2: number; y2: number; wallType: string; doorState: string
    }>
    gmPins: Array<{
      x: number; y: number; label: string; icon: string; color: string
    }>
    drawings: Array<{
      type: string; points: string; color: string; width: number; synced: number; text: string | null
    }>
    fogBitmap: string | null
    exploredBitmap: string | null
    initiative: Array<{ combatantName: string; roll: number; currentTurn: number; tokenId: number | null; effectTimers: string | null; sortOrder: number }>
    notes: string
    pinNotes: Array<{ title: string; content: string; pinX: number; pinY: number; category: string }>
    rooms: Array<{
      name: string; description: string; polygon: string; visibility: string
      encounterId: number | null; atmosphereHint: string | null; notes: string | null; color: string; createdAt: string
    }>
  }>
  campaignNote: string
  handouts: Array<{
    title: string; imagePath: string | null; textContent: string | null
  }>
  encounters: Array<{
    id: number; name: string; templateData: string; notes: string | null; createdAt: string
  }>
  characterSheets: Array<{
    tokenId: number | null; name: string; race: string; className: string; subclass: string; level: number
    background: string; alignment: string; experience: number
    str: number; dex: number; con: number; intScore: number; wis: number; cha: number
    hpMax: number; hpCurrent: number; hpTemp: number; ac: number; speed: number
    initiativeBonus: number; proficiencyBonus: number; hitDice: string
    deathSavesSuccess: number; deathSavesFailure: number
    savingThrows: string; skills: string; languages: string; proficiencies: string
    features: string; equipment: string; attacks: string; spells: string; spellSlots: string
    personality: string; ideals: string; bonds: string; flaws: string
    backstory: string; notes: string; inspiration: number; passivePerception: number
    createdAt: string; updatedAt: string
  }>
  audioBoards: Array<{
    name: string; sortOrder: number
    slots: Array<{
      slotNumber: number; emoji: string | null; title: string | null; audioPath: string | null
    }>
  }>
}

function buildCampaignExport(campaignId: number, db: ReturnType<typeof getDb>): CampaignExport {
  const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as { name: string } | undefined
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)
  const maps = db.prepare('SELECT * FROM maps WHERE campaign_id = ? ORDER BY order_index').all(campaignId) as any[]
  const campaignNote = (db.prepare(
    'SELECT content FROM notes WHERE campaign_id = ? AND map_id IS NULL AND pin_x IS NULL LIMIT 1'
  ).get(campaignId) as { content: string } | undefined)?.content ?? ''

  const mapIds = maps.map((m) => m.id)
  const ph = mapIds.map(() => '?').join(',')

  const allTokens = mapIds.length > 0
    ? db.prepare(`SELECT * FROM tokens WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []
  const allFog = mapIds.length > 0
    ? db.prepare(`SELECT map_id, fog_bitmap, explored_bitmap FROM fog_state WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []
  const allInitiative = mapIds.length > 0
    ? db.prepare(`SELECT * FROM initiative WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []
  const allGmPins = mapIds.length > 0
    ? db.prepare(`SELECT map_id, x, y, label, icon, color FROM gm_pins WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []
  const allDrawings = mapIds.length > 0
    ? db.prepare(`SELECT map_id, type, points, color, width, synced, text FROM drawings WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []
  const allNotes = mapIds.length > 0
    ? db.prepare(`SELECT map_id, content FROM notes WHERE campaign_id = ? AND map_id IN (${ph}) AND pin_x IS NULL`).all(campaignId, ...mapIds) as any[]
    : []
  const allPinNotes = mapIds.length > 0
    ? db.prepare(`SELECT map_id, title, content, pin_x, pin_y, category FROM notes WHERE campaign_id = ? AND map_id IN (${ph}) AND pin_x IS NOT NULL`).all(campaignId, ...mapIds) as any[]
    : []
  const allRooms = mapIds.length > 0
    ? db.prepare(`SELECT map_id, name, description, polygon, visibility, encounter_id, atmosphere_hint, notes, color, created_at FROM rooms WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []
  const allWalls = mapIds.length > 0
    ? db.prepare(`SELECT map_id, x1, y1, x2, y2, wall_type, door_state FROM walls WHERE map_id IN (${ph})`).all(...mapIds) as any[]
    : []

  const tokensByMap = groupBy(allTokens, 'map_id')
  const fogByMap = new Map(allFog.map((f: any) => [f.map_id, f]))
  const initByMap = groupBy(allInitiative, 'map_id')
  const pinsByMap = groupBy(allGmPins, 'map_id')
  const drawingsByMap = groupBy(allDrawings, 'map_id')
  const notesByMap = new Map(allNotes.map((n: any) => [n.map_id, n.content]))
  const pinNotesByMap = groupBy(allPinNotes, 'map_id')
  const roomsByMap = groupBy(allRooms, 'map_id')
  const wallsByMap = groupBy(allWalls, 'map_id')

  const encounters = (db.prepare('SELECT id, name, template_data, notes, created_at FROM encounters WHERE campaign_id = ?').all(campaignId) as any[]).map((e) => ({
    id: e.id as number,
    name: e.name,
    templateData: e.template_data,
    notes: e.notes,
    createdAt: e.created_at,
  }))

  const characterSheets = (db.prepare(
    `SELECT * FROM character_sheets WHERE campaign_id = ?`
  ).all(campaignId) as any[]).map((cs) => ({
    tokenId:           cs.token_id ?? null,
    name:              cs.name,
    race:              cs.race,
    className:         cs.class_name,
    subclass:          cs.subclass,
    level:             cs.level,
    background:        cs.background,
    alignment:         cs.alignment,
    experience:        cs.experience,
    str: cs.str, dex: cs.dex, con: cs.con, intScore: cs.int_score, wis: cs.wis, cha: cs.cha,
    hpMax: cs.hp_max, hpCurrent: cs.hp_current, hpTemp: cs.hp_temp,
    ac: cs.ac, speed: cs.speed,
    initiativeBonus: cs.initiative_bonus, proficiencyBonus: cs.proficiency_bonus,
    hitDice: cs.hit_dice,
    deathSavesSuccess: cs.death_saves_success, deathSavesFailure: cs.death_saves_failure,
    savingThrows: cs.saving_throws, skills: cs.skills,
    languages: cs.languages, proficiencies: cs.proficiencies,
    features: cs.features, equipment: cs.equipment,
    attacks: cs.attacks, spells: cs.spells, spellSlots: cs.spell_slots,
    personality: cs.personality, ideals: cs.ideals, bonds: cs.bonds, flaws: cs.flaws,
    backstory: cs.backstory, notes: cs.notes,
    inspiration: cs.inspiration, passivePerception: cs.passive_perception,
    createdAt: cs.created_at, updatedAt: cs.updated_at,
  }))

  const boardRows = (db.prepare(`SELECT * FROM audio_boards WHERE campaign_id = ? ORDER BY sort_order`).all(campaignId) as any[])
  const audioBoards = boardRows.map((b: any) => {
    const slots = (db.prepare(`SELECT slot_number, emoji, title, audio_path FROM audio_board_slots WHERE board_id = ? ORDER BY slot_number`).all(b.id) as any[]).map((s: any) => ({
      slotNumber: s.slot_number,
      emoji:      s.emoji ?? null,
      title:      s.title ?? null,
      audioPath:  s.audio_path ?? null,
    }))
    return { name: b.name, sortOrder: b.sort_order, slots }
  })

  return {
    version: EXPORT_VERSION,
    campaign: { name: campaign.name },
    campaignNote,
    maps: maps.map((m) => {
      const tokens = tokensByMap.get(m.id) ?? []
      const fog = fogByMap.get(m.id) ?? null
      const initiative = initByMap.get(m.id) ?? []
      const gmPins = pinsByMap.get(m.id) ?? []
      const drawings = drawingsByMap.get(m.id) ?? []
      const note = notesByMap.get(m.id) ?? ''
      const pinNotes = pinNotesByMap.get(m.id) ?? []
      const rooms = roomsByMap.get(m.id) ?? []
      const walls = wallsByMap.get(m.id) ?? []
      return {
        name: m.name,
        imagePath: m.image_path,
        gridType: m.grid_type,
        gridSize: m.grid_size,
        orderIndex: m.order_index,
        rotation: m.rotation ?? 0,
        rotationPlayer: m.rotation_player ?? 0,
        ftPerUnit: m.ft_per_unit ?? 5,
        gridOffsetX: m.grid_offset_x ?? 0,
        gridOffsetY: m.grid_offset_y ?? 0,
        ambientBrightness: m.ambient_brightness ?? 100,
        ambientTrackPath: m.ambient_track_path ?? null,
        track1Volume: m.track1_volume ?? 1,
        track2Volume: m.track2_volume ?? 1,
        combatVolume: m.combat_volume ?? 1,
        tokens: tokens.map((t: any) => ({
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
          lightRadius: t.light_radius ?? 0,
          lightColor: t.light_color ?? '#ffcc44',
        })),
        walls: walls.map((w: any) => ({
          x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
          wallType: w.wall_type, doorState: w.door_state,
        })),
        gmPins: gmPins.map((p: any) => ({
          x: p.x, y: p.y, label: p.label, icon: p.icon, color: p.color,
        })),
        drawings: drawings.map((d: any) => ({
          type: d.type, points: d.points, color: d.color, width: d.width, synced: d.synced, text: d.text ?? null,
        })),
        fogBitmap: fog?.fog_bitmap ?? null,
        exploredBitmap: fog?.explored_bitmap ?? null,
        initiative: initiative.map((i: any) => ({
          combatantName: i.combatant_name, roll: i.roll, currentTurn: i.current_turn,
          tokenId: i.token_id ?? null,
          effectTimers: i.effect_timers ?? null,
          sortOrder: i.sort_order ?? 0,
        })),
        notes: note,
        pinNotes: pinNotes.map((pn: any) => ({
          title: pn.title ?? '',
          content: pn.content ?? '',
          pinX: pn.pin_x,
          pinY: pn.pin_y,
          category: pn.category ?? 'Allgemein',
        })),
        rooms: rooms.map((r: any) => ({
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
    encounters,
    characterSheets,
    audioBoards,
  }
}

function groupBy(rows: any[], key: string): Map<number, any[]> {
  const map = new Map<number, any[]>()
  for (const row of rows) {
    const k = row[key]
    const arr = map.get(k)
    if (arr) arr.push(row)
    else map.set(k, [row])
  }
  return map
}

function collectAssetPaths(data: CampaignExport): string[] {
  const paths: string[] = []
  for (const m of data.maps) {
    paths.push(m.imagePath)
    if (m.ambientTrackPath) paths.push(m.ambientTrackPath)
    for (const t of m.tokens) if (t.imagePath) paths.push(t.imagePath)
  }
  for (const h of data.handouts) if (h.imagePath) paths.push(h.imagePath)
  for (const b of data.audioBoards ?? []) {
    for (const s of b.slots) if (s.audioPath) paths.push(s.audioPath)
  }
  return paths
}

function remapPaths(data: CampaignExport, pathMap: Map<string, string>) {
  for (const m of data.maps) {
    m.imagePath = pathMap.get(m.imagePath) ?? m.imagePath
    if (m.ambientTrackPath) m.ambientTrackPath = pathMap.get(m.ambientTrackPath) ?? m.ambientTrackPath
    for (const t of m.tokens) {
      if (t.imagePath) t.imagePath = pathMap.get(t.imagePath) ?? t.imagePath
    }
  }
  for (const h of data.handouts) {
    if (h.imagePath) h.imagePath = pathMap.get(h.imagePath) ?? h.imagePath
  }
  for (const b of data.audioBoards ?? []) {
    for (const s of b.slots) {
      if (s.audioPath) s.audioPath = pathMap.get(s.audioPath) ?? s.audioPath
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

    // Insert encounters first and build id remap so rooms can reference them
    const encounterIdMap = new Map<number, number>()
    for (const e of data.encounters ?? []) {
      const result = db.prepare(
        `INSERT INTO encounters (campaign_id, name, template_data, notes, created_at) VALUES (?, ?, ?, ?, ?)`
      ).run(campaignId, e.name, e.templateData, e.notes, e.createdAt ?? new Date().toISOString())
      if (e.id != null) encounterIdMap.set(e.id, Number(result.lastInsertRowid))
    }

    const globalTokenIdMap = new Map<number, number>()

    for (const m of data.maps) {
      const mapResult = db.prepare(
        `INSERT INTO maps (campaign_id, name, image_path, grid_type, grid_size, order_index, rotation, rotation_player, ft_per_unit, grid_offset_x, grid_offset_y, ambient_brightness, ambient_track_path, track1_volume, track2_volume, combat_volume)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        campaignId, m.name, m.imagePath, m.gridType, m.gridSize, m.orderIndex,
        m.rotation ?? 0, m.rotationPlayer ?? 0, m.ftPerUnit ?? 5,
        m.gridOffsetX ?? 0, m.gridOffsetY ?? 0, m.ambientBrightness ?? 100,
        m.ambientTrackPath ?? null, m.track1Volume ?? 1, m.track2Volume ?? 1, m.combatVolume ?? 1,
      )
      const mapId = Number(mapResult.lastInsertRowid)

      for (const t of m.tokens) {
        const result = db.prepare(
          `INSERT INTO tokens (map_id, name, image_path, x, y, size, hp_current, hp_max, visible_to_players, rotation, locked, z_index, marker_color, ac, notes, status_effects, faction, show_name, light_radius, light_color)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          mapId, t.name, t.imagePath, t.x, t.y, t.size, t.hpCurrent, t.hpMax, t.visibleToPlayers,
          t.rotation ?? 0, t.locked ?? 0, t.zIndex ?? 0, t.markerColor ?? null, t.ac ?? null,
          t.notes ?? null, t.statusEffects ?? null, t.faction ?? 'party', t.showName ?? 1,
          t.lightRadius ?? 0, t.lightColor ?? '#ffcc44',
        )
        globalTokenIdMap.set(t.id, Number(result.lastInsertRowid))
      }

      if (m.fogBitmap) {
        db.prepare(
          `INSERT INTO fog_state (map_id, fog_bitmap, explored_bitmap) VALUES (?, ?, ?)`
        ).run(mapId, m.fogBitmap, m.exploredBitmap ?? null)
      }

      for (const w of m.walls ?? []) {
        db.prepare(
          `INSERT INTO walls (map_id, x1, y1, x2, y2, wall_type, door_state) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(mapId, w.x1, w.y1, w.x2, w.y2, w.wallType, w.doorState)
      }

      for (const p of m.gmPins ?? []) {
        db.prepare(
          `INSERT INTO gm_pins (map_id, x, y, label, icon, color) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(mapId, p.x, p.y, p.label, p.icon, p.color)
      }

      for (const d of m.drawings ?? []) {
        db.prepare(
          `INSERT INTO drawings (map_id, type, points, color, width, synced, text) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(mapId, d.type, d.points, d.color, d.width, d.synced, d.text ?? null)
      }

      for (const i of m.initiative) {
        const mappedTokenId = i.tokenId != null ? (globalTokenIdMap.get(i.tokenId) ?? null) : null
        db.prepare(`INSERT INTO initiative (map_id, combatant_name, roll, current_turn, token_id, effect_timers, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(mapId, i.combatantName, i.roll, i.currentTurn, mappedTokenId, i.effectTimers ?? null, i.sortOrder ?? 0)
      }

      if (m.notes) {
        db.prepare(`INSERT INTO notes (campaign_id, map_id, content) VALUES (?, ?, ?)`).run(campaignId, mapId, m.notes)
      }

      for (const pn of m.pinNotes ?? []) {
        db.prepare(
          `INSERT INTO notes (campaign_id, map_id, title, content, pin_x, pin_y, category) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(campaignId, mapId, pn.title, pn.content, pn.pinX, pn.pinY, pn.category ?? 'Allgemein')
      }

      for (const r of m.rooms ?? []) {
        const remappedEncId = r.encounterId != null ? (encounterIdMap.get(r.encounterId) ?? null) : null
        db.prepare(
          `INSERT INTO rooms (map_id, name, description, polygon, visibility, encounter_id, atmosphere_hint, notes, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(mapId, r.name, r.description, r.polygon, r.visibility, remappedEncId, r.atmosphereHint, r.notes, r.color, r.createdAt ?? new Date().toISOString())
      }
    }

    for (const h of data.handouts ?? []) {
      db.prepare(
        `INSERT INTO handouts (campaign_id, title, image_path, text_content) VALUES (?, ?, ?, ?)`
      ).run(campaignId, h.title, h.imagePath, h.textContent)
    }

    for (const cs of data.characterSheets ?? []) {
      const remappedTokenId = cs.tokenId != null ? (globalTokenIdMap.get(cs.tokenId) ?? null) : null
      db.prepare(
        `INSERT INTO character_sheets
         (campaign_id, token_id, name, race, class_name, subclass, level, background, alignment, experience,
          str, dex, con, int_score, wis, cha, hp_max, hp_current, hp_temp, ac, speed,
          initiative_bonus, proficiency_bonus, hit_dice, death_saves_success, death_saves_failure,
          saving_throws, skills, languages, proficiencies, features, equipment, attacks, spells, spell_slots,
          personality, ideals, bonds, flaws, backstory, notes, inspiration, passive_perception, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        campaignId, remappedTokenId, cs.name, cs.race, cs.className, cs.subclass, cs.level,
        cs.background, cs.alignment, cs.experience,
        cs.str, cs.dex, cs.con, cs.intScore, cs.wis, cs.cha,
        cs.hpMax, cs.hpCurrent, cs.hpTemp, cs.ac, cs.speed,
        cs.initiativeBonus, cs.proficiencyBonus, cs.hitDice,
        cs.deathSavesSuccess, cs.deathSavesFailure,
        cs.savingThrows, cs.skills, cs.languages, cs.proficiencies,
        cs.features, cs.equipment, cs.attacks, cs.spells, cs.spellSlots,
        cs.personality, cs.ideals, cs.bonds, cs.flaws,
        cs.backstory, cs.notes, cs.inspiration, cs.passivePerception,
        cs.createdAt ?? new Date().toISOString(), cs.updatedAt ?? new Date().toISOString(),
      )
    }

    for (const b of data.audioBoards ?? []) {
      const boardResult = db.prepare(
        `INSERT INTO audio_boards (campaign_id, name, sort_order) VALUES (?, ?, ?)`
      ).run(campaignId, b.name, b.sortOrder ?? 0)
      const boardId = Number(boardResult.lastInsertRowid)
      for (const s of b.slots ?? []) {
        db.prepare(
          `INSERT INTO audio_board_slots (board_id, slot_number, emoji, title, audio_path) VALUES (?, ?, ?, ?, ?)`
        ).run(boardId, s.slotNumber, s.emoji ?? null, s.title ?? null, s.audioPath ?? null)
      }
    }

    return campaignId
  })()
}
