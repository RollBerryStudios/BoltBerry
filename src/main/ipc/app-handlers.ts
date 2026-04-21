import { ipcMain, dialog, app, Menu, BrowserWindow } from 'electron'
import { join, extname, relative, resolve, isAbsolute, sep } from 'path'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync, readFileSync, unlinkSync, realpathSync, readdirSync, lstatSync } from 'fs'
import { readFile } from 'fs/promises'
import { IPC } from '../../shared/ipc-types'
import { validateMagicBytes } from '../utils/magic-bytes'
import {
  createPlayerWindow,
  getPlayerWindow,
  getAvailableDisplays,
  setPlayerDisplayId,
} from '../windows'
import { getDb, getCustomUserDataPath, setCustomUserDataPath, closeDatabase, initDatabase } from '../db/database'
import { setMenuLanguage, getMenuLanguage, type MenuLanguage } from '../menu'

const ASSET_EXTENSIONS = {
  map: ['.png', '.jpg', '.jpeg', '.webp'],
  token: ['.png', '.jpg', '.jpeg', '.webp'],
  atmosphere: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  handout: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  audio: ['.mp3', '.ogg', '.wav', '.m4a'],
}

function getAssetDir(type: string): string {
  const userDataPath = getCustomUserDataPath() || app.getPath('userData')
  const dir = join(userDataPath, 'assets', type)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Guard for DB-stored relative asset paths before we resolve + unlink
 * them. Rejects absolute paths, parent-dir traversal, and data-URL /
 * unrelated strings — the column could in principle contain a legacy
 * data URL (pre-R3 portraits) or be blank, and we don't want to treat
 * either as a file-deletion target.
 */
function isSafeAssetPath(p: string): boolean {
  if (!p || typeof p !== 'string') return false
  if (p.startsWith('data:')) return false
  if (isAbsolute(p)) return false
  if (p.includes('..')) return false
  // Everything we persist lives under `assets/<type>/` so a strict
  // prefix rules out random user-supplied strings.
  return p.startsWith('assets/')
}

// Action names the renderer is allowed to route through SHOW_CONTEXT_MENU.
// Derived from grep of `showContextMenu` callers in the renderer.
const ALLOWED_CONTEXT_MENU_ACTIONS = new Set<string>([
  // Sidebar / list items
  'delete', 'duplicate', 'hide-player', 'show-player', 'edit', 'rename',
  'cut', 'copy', 'paste',
  'move-to-top', 'move-up', 'move-down', 'move-to-bottom',
  // Note layer
  'open', 'remove-pin',
  // Canvas
  'center-camera',
  'rotate-0', 'rotate-90', 'rotate-180', 'rotate-270',
  'fog-reveal-all', 'fog-cover-all', 'fog-reveal-tokens', 'fog-reset-explored',
  'tool-measure', 'tool-draw', 'tool-fog-brush', 'tool-fog-rect',
  'add-gm-pin', 'clear-drawings',
])

// ── Token variants (artwork per creature slug) ──────────────────────────
// Bundled art ships via electron-builder's extraResources rule. On first run
// we copy it into the user folder so the existing getImageAsBase64 reader,
// which is userData-scoped, can serve it without special-casing bundled
// paths. The copy is idempotent: existing files are never overwritten (so
// user-added variants with the same name win) and user deletions stay
// deleted across restarts.
function getTokenVariantDirs(): { bundled: string; user: string } {
  const resourcesBase = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), 'resources')
  const bundled = join(resourcesBase, 'token-variants')
  const userDataPath = getCustomUserDataPath() || app.getPath('userData')
  const user = join(userDataPath, 'token-variants')
  if (!existsSync(user)) {
    try { mkdirSync(user, { recursive: true }) } catch { /* ignore */ }
  }
  return { bundled, user }
}

// Avoid clobbering an existing file by appending " (2)", " (3)", … before
// the extension until the name is free.
function uniqueFileName(dir: string, fileName: string): string {
  if (!existsSync(join(dir, fileName))) return fileName
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!existsSync(join(dir, candidate))) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

function ensureTokenVariantsSeeded(): void {
  const { bundled, user } = getTokenVariantDirs()
  if (!existsSync(bundled)) return
  try {
    for (const slugDir of readdirSync(bundled, { withFileTypes: true })) {
      if (!slugDir.isDirectory()) continue
      const src = join(bundled, slugDir.name)
      const dst = join(user, slugDir.name)
      if (!existsSync(dst)) mkdirSync(dst, { recursive: true })
      for (const file of readdirSync(src)) {
        const srcPath = join(src, file)
        const dstPath = join(dst, file)
        if (existsSync(dstPath)) continue
        try {
          // COPYFILE_EXCL doubles as a guard if two processes race.
          copyFileSync(srcPath, dstPath, 1 /* COPYFILE_EXCL */)
        } catch {
          // File got created between our existsSync and copyFileSync — fine.
        }
      }
    }
  } catch (err) {
    console.warn('[AppHandlers] token variants seed failed:', err)
  }
}

export function registerAppHandlers(): void {
  ensureTokenVariantsSeeded()

  // Rebuild the application menu in the given language.
  ipcMain.handle(IPC.SET_MENU_LANGUAGE, (_event, lang: MenuLanguage) => {
    setMenuLanguage(lang)
    return true
  })

  // Monitor list
  ipcMain.handle(IPC.GET_MONITORS, () => getAvailableDisplays())

  // Set target monitor for player window
  ipcMain.handle(IPC.SET_PLAYER_MONITOR, (_event, displayId: number) => {
    setPlayerDisplayId(displayId)
  })

  // Open / re-open player window
  ipcMain.handle(IPC.OPEN_PLAYER_WINDOW, () => {
    const existing = getPlayerWindow()
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return true
    }
    createPlayerWindow()
    return true
  })

  // Close player window
  ipcMain.handle(IPC.CLOSE_PLAYER_WINDOW, () => {
    const existing = getPlayerWindow()
    if (existing && !existing.isDestroyed()) {
      existing.close()
    }
    return true
  })

  // Get default user data folder
  ipcMain.handle(IPC.GET_DEFAULT_USER_DATA_FOLDER, () => {
    return join(app.getPath('documents'), 'BoltBerry')
  })

  // Open native folder picker — returns chosen path or null
  ipcMain.handle(IPC.CHOOSE_FOLDER, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.OpenDialogOptions = {
      title: 'Datenordner wählen',
      defaultPath: join(app.getPath('documents'), 'BoltBerry'),
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // Set custom user data folder
  ipcMain.handle(IPC.SET_USER_DATA_FOLDER, (_event, dataPath: string) => {
    // Validate the path exists and is a directory
    if (!existsSync(dataPath) || !statSync(dataPath).isDirectory()) {
      return { success: false, error: 'Path does not exist or is not a directory' }
    }

    // Reject system directories
    const SYSTEM_PREFIXES_UNIX = ['/etc', '/usr', '/bin', '/sbin', '/lib', '/boot', '/proc', '/sys', '/dev']
    const SYSTEM_PREFIXES_WIN = ['C:\\Windows', 'C:\\windows', 'C:\\WINDOWS']
    const normalizedPath = resolve(dataPath)
    const isSystemDir =
      SYSTEM_PREFIXES_UNIX.some(p => normalizedPath === p || normalizedPath.startsWith(p + '/')) ||
      SYSTEM_PREFIXES_WIN.some(p => normalizedPath.toLowerCase().startsWith(p.toLowerCase() + '\\') || normalizedPath.toLowerCase() === p.toLowerCase())
    if (isSystemDir) {
      return { success: false, error: 'Cannot use a system directory as data path' }
    }

    const previousPath = getCustomUserDataPath()

    // Open the new DB BEFORE closing the old one — only close old on success
    try {
      setCustomUserDataPath(dataPath)
      initDatabase()
      // New DB opened successfully — now close the old one
      // (initDatabase already replaced the db reference, but we close
      // the previous handle if it was separate)
    } catch (err) {
      console.error('[AppHandlers] Failed to reinitialize database at new path, reverting:', err)
      // Revert to previous path so the DB stays open
      setCustomUserDataPath(previousPath ?? '')
      try { initDatabase() } catch { /* best-effort revert */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    return { success: true }
  })

  // Open content folder
  ipcMain.handle(IPC.OPEN_CONTENT_FOLDER, async () => {
    const { shell } = await import('electron')
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const contentPath = join(userDataPath, 'assets')
    // shell.openPath resolves with '' on success, otherwise an error message.
    // Throwing on a non-empty result makes the renderer's catch fire instead
    // of letting the user click "Open folder" and see nothing happen.
    const err = await shell.openPath(contentPath)
    if (err) throw new Error(`Open path failed: ${err}`)
  })

  // Get image as base64 for direct embedding (e.g. PDF-to-canvas rendering)
  ipcMain.handle(IPC.GET_IMAGE_AS_BASE64, async (_event, imagePath: string) => {
    try {
      let cleanPath = imagePath
      if (imagePath.startsWith('file://')) {
        cleanPath = imagePath.substring(7)
      }

      // Strip leading slashes, backslashes, and drive letters from the cleaned path
      cleanPath = cleanPath.replace(/^[/\\]+/, '').replace(/^[A-Za-z]:[/\\]?/, '')

      // Reject paths containing '..' segments
      if (cleanPath.includes('..')) {
        console.warn('[AppHandlers] GET_IMAGE_AS_BASE64: path contains ".." — rejecting', imagePath)
        return null
      }

      const userDataPath = resolve(getCustomUserDataPath() || app.getPath('userData'))
      const fullPath = resolve(userDataPath, cleanPath)

      // Verify using realpathSync to defeat symlink-based traversal
      const realPath = realpathSync(fullPath)
      const realUserDataPath = realpathSync(userDataPath)
      if (!realPath.startsWith(realUserDataPath + sep) && realPath !== realUserDataPath) {
        console.warn('[AppHandlers] GET_IMAGE_AS_BASE64: path escapes userData — rejecting', fullPath)
        return null
      }

      const stat = statSync(realPath)
      if (stat.size > 200 * 1024 * 1024) {
        console.warn('[AppHandlers] GET_IMAGE_AS_BASE64: file too large, refusing', realPath)
        return null
      }
      const { readFile } = require('fs/promises')
      const imageBuffer = await readFile(realPath)
      const base64 = imageBuffer.toString('base64')
      const extension = realPath.toLowerCase().split('.').pop() || 'png'
      const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' :
                       extension === 'webp' ? 'image/webp' : 'image/png'
      return `data:${mimeType};base64,${base64}`
    } catch (err) {
      return null
    }
  })

  // Rescan content folder to synchronize files with database (scoped to active campaign)
  ipcMain.handle(IPC.RESCAN_CONTENT_FOLDER, async (_event, campaignId: number) => {
    try {
      const userDataPath = getCustomUserDataPath() || app.getPath('userData')
      const assetsPath = join(userDataPath, 'assets', 'map')

      let files: string[] = []
      try {
        files = readdirSync(assetsPath)
      } catch {
        mkdirSync(assetsPath, { recursive: true })
        return { scanned: 0, added: 0, removed: 0, message: 'Keine Dateien gefunden' }
      }

      const imageFiles = files.filter((f: string) =>
        f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')
      )

      const db = getDb()

      // Scope entirely to the active campaign — never touch other campaigns' data
      const maps = db.prepare(
        'SELECT id, image_path, name FROM maps WHERE campaign_id = ?'
      ).all(campaignId) as { id: number; image_path: string; name: string }[]

      // Sanity check: if readdir returns 0 files but DB has maps, refuse to
      // delete — the folder may have been moved or the FS is unavailable.
      if (imageFiles.length === 0 && maps.length > 0) {
        return {
          scanned: 0, added: 0, removed: 0,
          message: 'Fehler: Ordner ist leer, aber die Datenbank enthält Karten. Löschung verweigert.',
        }
      }

      // Use case-insensitive comparison on Windows
      const isWin = process.platform === 'win32'
      const normalizePath = (p: string) => isWin ? p.toLowerCase() : p
      const existingFilePaths = new Set(imageFiles.map((f: string) => normalizePath(`assets/map/${f}`)))

      // Wrap destructive operations in a transaction
      const txn = db.transaction(() => {
        let removedCount = 0
        for (const map of maps) {
          if (!existingFilePaths.has(normalizePath(map.image_path))) {
            db.prepare('DELETE FROM maps WHERE id = ? AND campaign_id = ?').run(map.id, campaignId)
            db.prepare('DELETE FROM assets WHERE stored_path = ? AND campaign_id = ?').run(map.image_path, campaignId)
            removedCount++
          }
        }

        const existingMapPaths = new Set(maps.map((m: { image_path: string }) => normalizePath(m.image_path)))

        let addedCount = 0
        for (const file of imageFiles) {
          const filePath = `assets/map/${file}`
          if (!existingMapPaths.has(normalizePath(filePath))) {
            const fileName = file.replace(/\.[^/.]+$/, '') || file

            db.prepare(
              'INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)'
            ).run(fileName, filePath, 'map', campaignId)

            const orderIndex = (db.prepare(
              'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM maps WHERE campaign_id = ?'
            ).get(campaignId) as { next: number }).next
            db.prepare(
              'INSERT INTO maps (campaign_id, name, image_path, order_index, rotation, grid_offset_x, grid_offset_y) VALUES (?, ?, ?, ?, 0, 0, 0)'
            ).run(campaignId, fileName, filePath, orderIndex)

            addedCount++
          }
        }

        return { addedCount, removedCount }
      })

      const { addedCount, removedCount } = txn()

      return {
        scanned: imageFiles.length,
        added: addedCount,
        removed: removedCount,
        message: `Scan abgeschlossen: ${imageFiles.length} Dateien, ${addedCount} hinzugef\u00fcgt, ${removedCount} entfernt`,
      }
    } catch (err) {
      console.error('[AppHandlers] Failed to rescan content folder:', err)
      return {
        scanned: 0, added: 0, removed: 0,
        message: 'Fehler beim Scannen: ' + (err instanceof Error ? err.message : String(err)),
      }
    }
  })

  // Import file dialog \u2192 copy to AppData, return stored path
  ipcMain.handle(IPC.IMPORT_FILE, async (_event, type: 'map' | 'token' | 'atmosphere' | 'handout' | 'audio', campaignId?: number) => {
    const extensions = ASSET_EXTENSIONS[type]
    const titles = { map: 'Karte', token: 'Token', atmosphere: 'Atmosph\u00e4re-Bild', handout: 'Handout-Bild', audio: 'Audio-Datei' }
    const filterNames = { map: 'Bilder', token: 'Bilder', atmosphere: 'Bilder', handout: 'Bilder', audio: 'Audio' }
    const result = await dialog.showOpenDialog({
      title: `${titles[type]} importieren`,
      filters: [
        { name: filterNames[type], extensions: extensions.map((e: string) => e.slice(1)) },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || !result.filePaths[0]) return null

    const srcPath = result.filePaths[0]

    // File size warning for large assets
    const MAX_SIZES: Record<string, number> = {
      map: 20 * 1024 * 1024,
      token: 4 * 1024 * 1024,
      atmosphere: 20 * 1024 * 1024,
      handout: 10 * 1024 * 1024,
      audio: 100 * 1024 * 1024,
    }
    const stats = statSync(srcPath)
    if (stats.size > MAX_SIZES[type]) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
      const maxMB = (MAX_SIZES[type] / (1024 * 1024)).toFixed(0)
      // Respect the DM's current UI language so EN users don't get a
      // German file-size dialog.
      const lang = getMenuLanguage()
      const copy = lang === 'en'
        ? {
            title: 'Large file',
            message: `This file is ${sizeMB} MB (recommended max: ${maxMB} MB).`,
            detail: 'Large files can affect performance. Import anyway?',
            importBtn: 'Import',
            cancelBtn: 'Cancel',
          }
        : {
            title: 'Große Datei',
            message: `Die Datei ist ${sizeMB} MB groß (empfohlen: max. ${maxMB} MB).`,
            detail: 'Große Dateien können die Performance beeinträchtigen. Trotzdem importieren?',
            importBtn: 'Importieren',
            cancelBtn: 'Abbrechen',
          }
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: copy.title,
        message: copy.message,
        detail: copy.detail,
        buttons: [copy.importBtn, copy.cancelBtn],
        defaultId: 0,
        cancelId: 1,
      })
      if (response === 1) return null
    }

    const ext = extname(srcPath).toLowerCase()
    const destDir = getAssetDir(type)
    const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    const destPath = join(destDir, destName)

    try {
      copyFileSync(srcPath, destPath)
    } catch (err) {
      console.error('[AppHandlers] Failed to copy file:', err)
      return null
    }

    // Magic-byte validation: reject files whose contents don't match the extension
    // (defends against corrupted or disguised payloads). Preserve the null|{id,path}
    // contract — renderer callers check `if (!asset) return`. Log server-side so
    // the rejection isn't totally silent.
    try {
      if (!validateMagicBytes(destPath, ext)) {
        try { unlinkSync(destPath) } catch {}
        console.warn('[AppHandlers] IMPORT_FILE rejected — magic bytes do not match extension', { srcPath, ext })
        return null
      }
    } catch (err) {
      console.error('[AppHandlers] Magic-byte validation failed:', err)
      try { unlinkSync(destPath) } catch {}
      return null
    }

    // Store relative path from user data folder
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const relativePath = relative(userDataPath, destPath)

    // Register in assets table — clean up copied file if DB insert fails
    try {
      const db = getDb()
      const stmt = db.prepare(
        `INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)`
      )
      const result2 = stmt.run(srcPath.split(/[\\/]/).pop()!, relativePath, type, campaignId ?? null)
      return { id: result2.lastInsertRowid, path: relativePath }
    } catch (err) {
      console.error('[AppHandlers] DB insert failed, removing orphaned file:', err)
      try { unlinkSync(destPath) } catch {}
      return null
    }
  })

  // Import PDF \u2192 returns file bytes so renderer can render with pdfjs
  ipcMain.handle(IPC.IMPORT_PDF, async (_event, _campaignId: number) => {
    const result = await dialog.showOpenDialog({
      title: 'PDF-Karte importieren',
      filters: [{ name: 'PDF-Dokument', extensions: ['pdf'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const srcPath = result.filePaths[0]
    const MAX_PDF_SIZE = 100 * 1024 * 1024 // 100 MB
    const stats = statSync(srcPath)
    if (stats.size > MAX_PDF_SIZE) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(1)
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Gro\u00dfe PDF-Datei',
        message: `Die PDF-Datei ist ${sizeMB} MB gro\u00df (empfohlen: max. 100 MB).`,
        detail: 'Sehr gro\u00dfe PDFs k\u00f6nnen den Arbeitsspeicher \u00fcberlasten. Trotzdem importieren?',
        buttons: ['Importieren', 'Abbrechen'],
        defaultId: 0,
        cancelId: 1,
      })
      if (response === 1) return null
    }
    let data: Buffer
    try {
      // Use async readFile to avoid blocking the main process on large PDFs.
      data = await readFile(srcPath)
    } catch (err) {
      console.error('[AppHandlers] Failed to read PDF:', err)
      return null
    }
    return {
      path: srcPath,
      originalName: srcPath.split(/[\\/]/).pop()!,
      data: data.toString('base64'),
    }
  })

  // Save rendered image (e.g. from PDF) to assets
  ipcMain.handle(IPC.SAVE_ASSET_IMAGE, async (_event, args: {
    dataUrl: string
    originalName: string
    type: 'map' | 'token'
    campaignId: number
  }) => {
    const { dataUrl, originalName, type, campaignId } = args
    const MAX_SAVE_ASSET_SIZE = 50 * 1024 * 1024 // 50 MB

    // Parse the data URL header properly (MIME must be a supported image subtype)
    const match = dataUrl.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/)
    if (!match) {
      console.error('[AppHandlers] Invalid or unsupported image data URL')
      return { success: false, error: 'Invalid image data URL' }
    }
    const format = match[1]
    const base64 = match[2]

    // Decode and enforce size cap on the decoded buffer
    const buf = Buffer.from(base64, 'base64')
    if (buf.length > MAX_SAVE_ASSET_SIZE) {
      return { success: false, error: 'Image exceeds max size (50 MB)' }
    }

    // Verify magic bytes match the claimed MIME (defends against mislabeled data URLs)
    const magicOK = (() => {
      if (format === 'png')  return buf[0] === 0x89 && buf[1] === 0x50
      if (format === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8
      if (format === 'webp') return buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45
      if (format === 'gif')  return buf[0] === 0x47 && buf[1] === 0x49
      return false
    })()
    if (!magicOK) {
      return { success: false, error: 'Image data does not match declared format' }
    }

    // Use the correct extension for the declared format (not always .png)
    const ext = format === 'jpeg' ? 'jpg' : format
    const destDir = getAssetDir(type)
    const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const destPath = join(destDir, destName)
    try {
      writeFileSync(destPath, buf)
    } catch (err) {
      console.error('[AppHandlers] Failed to write asset image:', err)
      return null
    }

    // Store relative path from user data folder
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const relativePath = relative(userDataPath, destPath)

    const db = getDb()
    const row = db.prepare(
      `INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)`
    ).run(originalName, relativePath, type, campaignId)
    return { id: row.lastInsertRowid, path: relativePath }
  })

// Save now (autosave trigger)
  ipcMain.handle(IPC.SAVE_NOW, () => {
    return true
  })

  // Character portrait — decodes a PNG data URL produced by the
  // CircularCropper and writes it to `userData/assets/portrait/`. Keeps
  // the `character_sheets.portrait_path` column under ~80 bytes (a
  // relative path) instead of 40-60 KB of inline base64, so the DB
  // doesn't balloon once a campaign accumulates a few dozen characters.
  //
  // Path is returned **relative** to userData (matching the existing
  // `assets/...` convention used for maps and tokens) so campaign
  // export / import can bundle the PNG and remap the path, and so
  // moving the user-data folder across machines keeps portraits
  // working.
  //
  // If `oldRelativePath` is provided we unlink it after a successful
  // write, keeping `userData/assets/portrait/` from accreting orphans
  // across edit cycles.
  ipcMain.handle(IPC.SAVE_PORTRAIT, async (
    _event,
    dataUrl: string,
    oldRelativePath: string | null = null,
  ) => {
    const MAX_PORTRAIT_SIZE = 2 * 1024 * 1024  // 2 MB — 256×256 PNG is ~40 KB
    const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)
    if (!match) return { success: false, error: 'invalid-data-url' }
    const format = match[1]
    const buf = Buffer.from(match[2], 'base64')
    if (buf.length > MAX_PORTRAIT_SIZE) {
      return { success: false, error: 'portrait-too-large' }
    }
    // Validate magic bytes so a mislabelled SVG / HTML can't slip in
    const magicOK = (() => {
      if (format === 'png')  return buf[0] === 0x89 && buf[1] === 0x50
      if (format === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8
      if (format === 'webp') return buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45
      return false
    })()
    if (!magicOK) return { success: false, error: 'format-mismatch' }
    const ext = format === 'jpeg' ? 'jpg' : format
    const destDir = getAssetDir('portrait')
    // Random name keeps clone/rapid-edit flows collision-free without
    // needing a DB lookup.
    const rand = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const destPath = join(destDir, `${rand}.${ext}`)
    try {
      writeFileSync(destPath, buf)
    } catch (err) {
      console.error('[AppHandlers] Failed to write portrait:', err)
      return { success: false, error: 'write-failed' }
    }
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const relativePath = relative(userDataPath, destPath).split(sep).join('/')
    // Opportunistic cleanup of the replaced file. Must be an asset-path
    // (rejects absolute paths, `..` traversal, data URLs, random
    // strings) to avoid deleting arbitrary disk files.
    if (oldRelativePath && isSafeAssetPath(oldRelativePath)) {
      try {
        const absOld = join(userDataPath, oldRelativePath)
        if (existsSync(absOld)) unlinkSync(absOld)
      } catch (err) {
        console.warn('[AppHandlers] Failed to unlink old portrait:', err)
      }
    }
    return { success: true, path: relativePath }
  })

  // Delete a portrait file from disk — used when a character is
  // deleted so its portrait doesn't outlive the row forever. Same
  // safety guard as the unlink branch in SAVE_PORTRAIT.
  ipcMain.handle(IPC.DELETE_PORTRAIT, async (_event, relativePath: string) => {
    if (!isSafeAssetPath(relativePath)) return { success: false, error: 'invalid-path' }
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const abs = join(userDataPath, relativePath)
    try {
      if (existsSync(abs)) unlinkSync(abs)
      return { success: true }
    } catch (err) {
      console.warn('[AppHandlers] Failed to unlink portrait:', err)
      return { success: false, error: (err as Error).message }
    }
  })

  // ── Asset orphan GC ──────────────────────────────────────────────────
  // Sweeps userData/assets/** and matches every file against the set of
  // paths still referenced by the DB. Anything unreferenced is an
  // orphan: a file left over after a delete (map, token, handout,
  // character portrait, audio track, …) whose row no longer points
  // at it. Large campaigns + long usage accumulate dozens of MB of
  // these, and without this sweep nothing ever cleans them up.
  //
  // Safety: we ONLY touch files under userData/assets/. Bundled SRD
  // tokens (resources/data/monsters/<slug>/) live outside userData
  // and are never scanned. `dryRun: true` returns the counts without
  // deleting so the UI can preview + confirm.
  ipcMain.handle(IPC.ASSET_CLEANUP, async (_event, dryRun: boolean) => {
    try {
      const userDataPath = getCustomUserDataPath() || app.getPath('userData')
      const assetRoot = join(userDataPath, 'assets')
      if (!existsSync(assetRoot)) {
        return { success: true, count: 0, totalBytes: 0, paths: [] }
      }

      // Enumerate every file under assets/ (recursive). Symlinks
      // ignored as a defensive measure — a malicious asset-folder
      // symlink could otherwise trick us into deleting files outside
      // userData.
      const allFiles: string[] = []
      const walk = (dir: string, relPrefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue
          const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
          const abs = join(dir, entry.name)
          if (entry.isDirectory()) walk(abs, rel)
          else if (entry.isFile()) allFiles.push(`assets/${rel}`)
        }
      }
      walk(assetRoot, '')

      // Collect every path the DB still references. Any column that
      // points at a user-data asset is queried here; if new columns
      // appear in future migrations, add them to the list.
      const db = getDb()
      const referenced = new Set<string>()
      const pushRefs = (rows: Array<{ p: string | null }>) => {
        for (const r of rows) {
          if (r.p && !r.p.startsWith('data:') && !r.p.startsWith('bestiary://') && !r.p.startsWith('http')) {
            // Normalise any accidental leading slash / backslash to
            // the forward-slash relative form we store.
            referenced.add(r.p.replace(/\\/g, '/').replace(/^\/+/, ''))
          }
        }
      }
      pushRefs(db.prepare('SELECT image_path AS p FROM maps').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT image_path AS p FROM tokens').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT image_path AS p FROM token_templates').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT image_path AS p FROM handouts').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT portrait_path AS p FROM character_sheets').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT ambient_track_path AS p FROM maps').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT audio_path AS p FROM audio_board_slots').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT path AS p FROM channel_playlist').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT path AS p FROM assets').all() as Array<{ p: string | null }>)

      const orphans = allFiles.filter((f) => !referenced.has(f))

      let totalBytes = 0
      for (const o of orphans) {
        try { totalBytes += statSync(join(userDataPath, o)).size } catch { /* ignore */ }
      }

      if (!dryRun) {
        for (const o of orphans) {
          try { unlinkSync(join(userDataPath, o)) } catch (err) {
            console.warn('[AppHandlers] Failed to unlink orphan:', o, err)
          }
        }
      }

      return {
        success: true,
        count: orphans.length,
        totalBytes,
        // Cap the preview list so the IPC payload stays small on
        // pathological cases (thousands of orphans).
        paths: orphans.slice(0, 50),
      }
    } catch (err) {
      return { success: false, count: 0, totalBytes: 0, error: (err as Error).message }
    }
  })

  // ── Compendium ────────────────────────────────────────────────────────
  // PDFs live in two folders: bundled (ships with the installer) and user
  // (per-user additions). We merge them at list time; user files override
  // a bundled file with the same name so users can drop in a newer SRD
  // version without editing the repo.

  function getCompendiumDirs(): { bundled: string; user: string } {
    // In packaged builds resources live under process.resourcesPath; in
    // development (tsc + electron .) the build hasn't run so we fall back
    // to the repo-level resources folder.
    const resourcesBase = app.isPackaged
      ? process.resourcesPath
      : join(app.getAppPath(), 'resources')
    const bundled = join(resourcesBase, 'compendium')
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const user = join(userDataPath, 'compendium')
    if (!existsSync(user)) {
      try { mkdirSync(user, { recursive: true }) } catch { /* ignore — will show empty list */ }
    }
    return { bundled, user }
  }

  function listPdfsIn(dir: string, source: 'bundled' | 'user') {
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir)
        .filter((n) => n.toLowerCase().endsWith('.pdf'))
        .map((name) => {
          const full = join(dir, name)
          let size = 0
          try { size = statSync(full).size } catch { /* ignore */ }
          return { name, path: full, source, size }
        })
    } catch {
      return []
    }
  }

  ipcMain.handle(IPC.COMPENDIUM_LIST, () => {
    const { bundled, user } = getCompendiumDirs()
    const bundledFiles = listPdfsIn(bundled, 'bundled')
    const userFiles = listPdfsIn(user, 'user')
    const byName = new Map<string, ReturnType<typeof listPdfsIn>[number]>()
    for (const f of bundledFiles) byName.set(f.name, f)
    for (const f of userFiles) byName.set(f.name, f) // user overrides bundled
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle(IPC.COMPENDIUM_READ, async (_event, filePath: string) => {
    try {
      const { bundled, user } = getCompendiumDirs()
      const realBundled = existsSync(bundled) ? realpathSync(bundled) : null
      const realUser = existsSync(user) ? realpathSync(user) : null
      const real = realpathSync(filePath)
      const inBundled = realBundled && (real === realBundled || real.startsWith(realBundled + sep))
      const inUser = realUser && (real === realUser || real.startsWith(realUser + sep))
      if (!inBundled && !inUser) {
        console.warn('[AppHandlers] COMPENDIUM_READ: path outside compendium dirs — rejecting', filePath)
        return null
      }
      if (!real.toLowerCase().endsWith('.pdf')) return null
      const stat = statSync(real)
      if (stat.size > 200 * 1024 * 1024) {
        console.warn('[AppHandlers] COMPENDIUM_READ: file too large, refusing', real)
        return null
      }
      const buf = await readFile(real)
      return `data:application/pdf;base64,${buf.toString('base64')}`
    } catch (err) {
      console.warn('[AppHandlers] COMPENDIUM_READ failed:', err)
      return null
    }
  })

  ipcMain.handle(IPC.COMPENDIUM_IMPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'no-window' as const }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'PDF importieren',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || filePaths.length === 0) return { success: false, error: 'cancelled' as const }
    const src = filePaths[0]
    const { user } = getCompendiumDirs()
    const fileName = src.split(/[\\/]/).pop() || 'imported.pdf'
    const dest = join(user, fileName)
    try {
      copyFileSync(src, dest)
      return { success: true, path: dest, name: fileName }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.COMPENDIUM_OPEN_FOLDER, async () => {
    const { shell } = await import('electron')
    const { user } = getCompendiumDirs()
    const err = await shell.openPath(user)
    if (err) throw new Error(`Open compendium folder failed: ${err}`)
  })

  // ── Token variants (per-slug artwork) ───────────────────────────────
  // Slug validation guards against a malicious renderer sending paths
  // with traversal segments. Only alphanumerics + single dashes allowed.
  const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
  const VARIANT_EXTS = ['.webp', '.png', '.jpg', '.jpeg']

  ipcMain.handle(IPC.TOKEN_VARIANTS_LIST, (_event, slug: string) => {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return []
    const { user } = getTokenVariantDirs()
    const dir = join(user, slug)
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir)
        .filter((n) => VARIANT_EXTS.some((e) => n.toLowerCase().endsWith(e)))
        .map((name) => {
          const full = join(dir, name)
          let size = 0
          try { size = statSync(full).size } catch { /* ignore */ }
          // Files with 2-digit numeric prefix (01.webp … 05.webp) are the
          // bundled seed — everything else is user-added. This lets us
          // show a subtle badge in the UI without tracking sources in DB.
          const source = /^\d{2}\.[a-z]+$/i.test(name) ? 'bundled' : 'user'
          // Path is userData-relative so the existing getImageAsBase64
          // reader can serve it with the same guard as any other asset.
          const relPath = `token-variants/${slug}/${name}`
          return { path: relPath, name, size, source }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.TOKEN_VARIANTS_IMPORT, async (event, slug: string) => {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      return { success: false, error: 'invalid-slug' as const }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'no-window' as const }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Token-Varianten importieren',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Bilder', extensions: ['webp', 'png', 'jpg', 'jpeg'] }],
    })
    if (canceled || filePaths.length === 0) {
      return { success: false, error: 'cancelled' as const }
    }
    const { user } = getTokenVariantDirs()
    const dir = join(user, slug)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const copied: string[] = []
    for (const src of filePaths) {
      const fileName = src.split(/[\\/]/).pop() || 'token.webp'
      const finalName = uniqueFileName(dir, fileName)
      const dest = join(dir, finalName)
      try {
        copyFileSync(src, dest)
        copied.push(`token-variants/${slug}/${finalName}`)
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
    return { success: true, paths: copied }
  })

  ipcMain.handle(IPC.TOKEN_VARIANTS_OPEN_FOLDER, async (_event, slug?: string) => {
    const { shell } = await import('electron')
    const { user } = getTokenVariantDirs()
    let target = user
    if (typeof slug === 'string' && SLUG_RE.test(slug)) {
      const sub = join(user, slug)
      if (!existsSync(sub)) mkdirSync(sub, { recursive: true })
      target = sub
    }
    const err = await shell.openPath(target)
    if (err) throw new Error(`Open token-variants folder failed: ${err}`)
  })

  // Get Electron's userData path
  ipcMain.handle(IPC.GET_USER_DATA_PATH, () => {
    return app.getPath('userData')
  })

  // Context menu: renderer sends menu items, main process shows native menu and returns selected action.
  // Actions are validated against an allowlist to prevent the renderer from triggering arbitrary strings.
  ipcMain.handle(IPC.SHOW_CONTEXT_MENU, async (event, items: Array<{ label: string; action: string; danger?: boolean } | { separator: true }>) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    // Filter items: drop any non-separator entry whose action is not in the allowlist.
    const validatedItems = items.filter((item) => {
      if ('separator' in item) return true
      if (!ALLOWED_CONTEXT_MENU_ACTIONS.has(item.action)) {
        console.warn('[AppHandlers] SHOW_CONTEXT_MENU: rejected unknown action:', item.action)
        return false
      }
      return true
    })

    return new Promise<string | null>((resolve) => {
      let resolved = false
      const safeResolve = (value: string | null) => {
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }

      const menuItems = validatedItems.map((item) => {
        if ('separator' in item) return { type: 'separator' as const }
        return {
          label: item.label,
          click: () => safeResolve(item.action),
        }
      })

      const menu = Menu.buildFromTemplate(menuItems)

      // Resolve null on menu close, but defer one microtask so any click handler
      // (which fires before `menu-will-close`) has already called safeResolve.
      menu.once('menu-will-close', () => {
        queueMicrotask(() => safeResolve(null))
      })

      menu.popup({ window: win })
    })
  })

  // Generic confirm dialog
  ipcMain.handle(IPC.CONFIRM_DIALOG, async (event, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      title: 'Best\u00e4tigung',
      message,
      detail,
      buttons: ['Abbrechen', 'OK'],
      defaultId: 1,
      cancelId: 0,
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })

  // Delete map (with native confirmation dialog)
  ipcMain.handle(IPC.DELETE_MAP_CONFIRM, async (event, mapName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      title: 'Karte l\u00f6schen',
      message: `Karte "${mapName}" wirklich l\u00f6schen?`,
      detail: 'Diese Aktion kann nicht r\u00fcckg\u00e4ngig gemacht werden.',
      buttons: ['Abbrechen', 'L\u00f6schen'],
      defaultId: 0,
      cancelId: 0,
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })

  // Delete token (with native confirmation dialog)
  ipcMain.handle(IPC.DELETE_TOKEN_CONFIRM, async (event, tokenName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      type: 'warning' as const,
      title: 'Token l\u00f6schen',
      message: `Token "${tokenName}" wirklich l\u00f6schen?`,
      detail: 'Diese Aktion kann nicht r\u00fcckg\u00e4ngig gemacht werden.',
      buttons: ['Abbrechen', 'L\u00f6schen'],
      defaultId: 0,
      cancelId: 0,
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 1
  })
}
