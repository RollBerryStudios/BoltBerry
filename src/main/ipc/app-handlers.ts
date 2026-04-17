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
import { setMenuLanguage, type MenuLanguage } from '../menu'

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
  'fog-reveal-all', 'fog-cover-all', 'fog-reveal-tokens', 'fog-reset-explored',
  'tool-measure', 'tool-draw', 'tool-fog-brush', 'tool-fog-rect',
  'add-gm-pin', 'clear-drawings',
])

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
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Gro\u00dfe Datei',
        message: `Die Datei ist ${sizeMB} MB gro\u00df (empfohlen: max. ${maxMB} MB).`,
        detail: 'Gro\u00dfe Dateien k\u00f6nnen die Performance beeintr\u00e4chtigen. Trotzdem importieren?',
        buttons: ['Importieren', 'Abbrechen'],
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
