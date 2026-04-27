import { ipcMain, dialog, app, BrowserWindow } from 'electron'
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
import { getDb, getCustomUserDataPath, setCustomUserDataPath, initDatabase } from '../db/database'
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

/**
 * Import a list of source-side audio file paths into the campaign's
 * audio asset folder. Each file is copied with a unique destination
 * name, magic-byte-validated, and registered in `assets`. Returns the
 * list of accepted files (originalName + relativePath); rejected
 * files are silently skipped — their absence in the result tells the
 * caller they didn't make it.
 *
 * Deliberately does NOT insert into `tracks` here — that's the
 * renderer's job (it owns the soundtrack-tag and duration cache).
 * Splitting concerns this way means the same primitive can later be
 * reused by drag-and-drop or other entry points without duplicating
 * the file-copy logic.
 */
function importAudioPaths(
  srcPaths: ReadonlyArray<string>,
  campaignId: number | null | undefined,
): Array<{ originalName: string; relativePath: string }> {
  if (srcPaths.length === 0) return []
  const audioExt = new Set(ASSET_EXTENSIONS.audio.map((e: string) => e.toLowerCase()))
  const destDir = getAssetDir('audio')
  const userDataPath = getCustomUserDataPath() || app.getPath('userData')
  const out: Array<{ originalName: string; relativePath: string }> = []
  const cId = Number.isInteger(campaignId) ? campaignId : null
  const insertAsset = getDb().prepare(
    `INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)`
  )
  for (const srcPath of srcPaths) {
    const ext = extname(srcPath).toLowerCase()
    if (!audioExt.has(ext)) continue
    const originalName = srcPath.split(/[\\/]/).pop() ?? srcPath
    const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    const destPath = join(destDir, destName)
    try {
      copyFileSync(srcPath, destPath)
    } catch (err) {
      console.warn('[importAudioPaths] copy failed:', originalName, err)
      continue
    }
    try {
      if (!validateMagicBytes(destPath, ext)) {
        try { unlinkSync(destPath) } catch { /* unreachable cleanup */ }
        console.warn('[importAudioPaths] magic-byte rejection:', originalName)
        continue
      }
    } catch (err) {
      try { unlinkSync(destPath) } catch { /* unreachable cleanup */ }
      console.warn('[importAudioPaths] magic-byte validation failed:', originalName, err)
      continue
    }
    const relativePath = relative(userDataPath, destPath)
    try {
      insertAsset.run(originalName, relativePath, 'audio', cId)
    } catch (err) {
      console.warn('[importAudioPaths] DB insert failed:', originalName, err)
      try { unlinkSync(destPath) } catch { /* unreachable cleanup */ }
      continue
    }
    out.push({ originalName, relativePath })
  }
  return out
}

export function registerAppHandlers(): void {
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

    // setCustomUserDataPath closes the current handle, so the old DB is
    // released before we try to open the new one. If the new path fails
    // to initialize, the revert path re-opens at the previous location.
    try {
      setCustomUserDataPath(dataPath)
      initDatabase()
    } catch (err) {
      console.error('[AppHandlers] Failed to reinitialize database at new path, reverting:', err)
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
      // Tightened from 200 MB to 20 MB per audit PB-3. Real-world token
      // / map / portrait files top out at 5 MB; anything larger is
      // almost certainly a mis-import and pegs the main process while
      // the base64 string is built. The hard cap beats a silent freeze.
      if (stat.size > 20 * 1024 * 1024) {
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

  // Multi-select audio import. Each selected file goes through the
  // same copy + magic-byte validation as IMPORT_FILE; failures are
  // skipped (silent on the per-file level \u2014 caller sees them as
  // missing entries in the returned array). Cancellation returns [].
  ipcMain.handle(
    IPC.IMPORT_AUDIO_FILES,
    async (_event, campaignId: number) => {
      const result = await dialog.showOpenDialog({
        title: 'Audio-Dateien importieren',
        filters: [{ name: 'Audio', extensions: ASSET_EXTENSIONS.audio.map((e: string) => e.slice(1)) }],
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled || result.filePaths.length === 0) return []
      return importAudioPaths(result.filePaths, campaignId)
    },
  )

  // Folder import. Recursively scans the picked directory for audio
  // files (matching ASSET_EXTENSIONS.audio) and runs each through the
  // same copy + validate pipeline. Returns the source folder name so
  // the caller can use it as the auto-soundtrack tag. Returns null on
  // cancellation, or an object with possibly-empty `files` if the
  // folder contained no audio.
  ipcMain.handle(
    IPC.IMPORT_AUDIO_FOLDER,
    async (_event, campaignId: number) => {
      const result = await dialog.showOpenDialog({
        title: 'Audio-Ordner importieren',
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) return null
      const root = result.filePaths[0]
      const folderName = root.split(/[\\/]/).filter(Boolean).pop() ?? 'Soundtrack'
      const files: string[] = []
      const stack: string[] = [root]
      const audioExt = new Set(ASSET_EXTENSIONS.audio.map((e: string) => e.toLowerCase()))
      while (stack.length > 0) {
        const dir = stack.pop()!
        let entries: string[] = []
        try { entries = readdirSync(dir) } catch { continue }
        for (const name of entries) {
          const full = join(dir, name)
          let stat
          try { stat = lstatSync(full) } catch { continue }
          if (stat.isSymbolicLink()) continue
          if (stat.isDirectory()) {
            stack.push(full)
            continue
          }
          if (audioExt.has(extname(name).toLowerCase())) files.push(full)
        }
      }
      const imported = importAudioPaths(files, campaignId)
      return { folderName, files: imported }
    },
  )

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
    // Deliberately do NOT return the absolute `srcPath` — a compromised
    // renderer would learn the user's filesystem layout (audit SR-2).
    // The renderer only needs the bytes + a display name.
    return {
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
      // userData. Per audit SR-3, also cap recursion depth and total
      // entries so a deeply-nested tree (accidental `.git` clone, a
      // malicious chain of directories) can't pin the main process.
      const WALK_MAX_DEPTH = 5
      const WALK_MAX_ENTRIES = 5000
      const allFiles: string[] = []
      let walkedEntries = 0
      let depthOverflow = false
      const walk = (dir: string, relPrefix: string, depth: number) => {
        if (depth > WALK_MAX_DEPTH) {
          depthOverflow = true
          return
        }
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (walkedEntries >= WALK_MAX_ENTRIES) return
          walkedEntries++
          if (entry.isSymbolicLink()) continue
          const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
          const abs = join(dir, entry.name)
          if (entry.isDirectory()) walk(abs, rel, depth + 1)
          else if (entry.isFile()) allFiles.push(`assets/${rel}`)
        }
      }
      walk(assetRoot, '', 0)
      if (depthOverflow || walkedEntries >= WALK_MAX_ENTRIES) {
        console.warn(
          `[AppHandlers] ASSET_CLEANUP: walk truncated at depth=${WALK_MAX_DEPTH} or ${WALK_MAX_ENTRIES} entries`,
        )
      }

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
      pushRefs(db.prepare('SELECT path AS p FROM tracks').all() as Array<{ p: string | null }>)
      pushRefs(db.prepare('SELECT icon_path AS p FROM audio_board_slots').all() as Array<{ p: string | null }>)
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

  // Get Electron's userData path
  ipcMain.handle(IPC.GET_USER_DATA_PATH, () => {
    return app.getPath('userData')
  })

  // Compendium, token variants, context menus, and confirm dialogs live
  // in `compendium-handlers.ts` + `dialog-handlers.ts` — registered
  // directly from `main/index.ts`, not through this module.
}

