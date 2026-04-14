import { ipcMain, dialog, app, Menu, BrowserWindow } from 'electron'
import { join, extname, relative, resolve, isAbsolute, sep } from 'path'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { IPC } from '../../shared/ipc-types'
import {
  createPlayerWindow,
  getPlayerWindow,
  getAvailableDisplays,
  setPlayerDisplayId,
} from '../windows'
import { getDb, getCustomUserDataPath, setCustomUserDataPath, closeDatabase, initDatabase } from '../db/database'

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

export function registerAppHandlers(): void {
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
    const opts = {
      title: 'Datenordner wählen',
      defaultPath: join(app.getPath('documents'), 'BoltBerry'),
      properties: ['openDirectory', 'createDirectory'] as const,
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // Set custom user data folder
  ipcMain.handle(IPC.SET_USER_DATA_FOLDER, (_event, dataPath: string) => {
    const previousPath = getCustomUserDataPath()
    setCustomUserDataPath(dataPath)
    try {
      closeDatabase()
      initDatabase()
      return { success: true }
    } catch (err) {
      console.error('[AppHandlers] Failed to reinitialize database at new path, reverting:', err)
      // Revert to previous path so the DB stays open
      setCustomUserDataPath(previousPath ?? '')
      try { initDatabase() } catch { /* best-effort revert */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Open content folder
  ipcMain.handle(IPC.OPEN_CONTENT_FOLDER, async () => {
    const { shell } = await import('electron')
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const contentPath = join(userDataPath, 'assets')
    return shell.openPath(contentPath)
  })

  // Get image as base64 for direct embedding (e.g. PDF-to-canvas rendering)
  ipcMain.handle(IPC.GET_IMAGE_AS_BASE64, async (_event, imagePath: string) => {
    try {
      let cleanPath = imagePath
      if (imagePath.startsWith('file://')) {
        cleanPath = imagePath.substring(7)
      }
      const userDataPath = resolve(getCustomUserDataPath() || app.getPath('userData'))
      const fullPath = resolve(userDataPath, cleanPath)
      if (!fullPath.startsWith(userDataPath + sep) && fullPath !== userDataPath) {
        return null
      }
      const stat = statSync(fullPath)
      if (stat.size > 200 * 1024 * 1024) {
        console.warn('[AppHandlers] GET_IMAGE_AS_BASE64: file too large, refusing', fullPath)
        return null
      }
      const { readFile } = require('fs/promises')
      const imageBuffer = await readFile(fullPath)
      const base64 = imageBuffer.toString('base64')
      const extension = fullPath.toLowerCase().split('.').pop() || 'png'
      const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' :
                       extension === 'webp' ? 'image/webp' : 'image/png'
      return `data:${mimeType};base64,${base64}`
    } catch (err) {
      return null
    }
  })

  // Rescan content folder to synchronize files with database (scoped to active campaign)
  ipcMain.handle(IPC.RESCAN_CONTENT_FOLDER, async (_event, campaignId: number) => {
    const { readdir } = require('fs').promises

    try {
      const userDataPath = getCustomUserDataPath() || app.getPath('userData')
      const assetsPath = join(userDataPath, 'assets', 'map')

      let files: string[] = []
      try {
        files = await readdir(assetsPath)
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

      const existingFilePaths = new Set(imageFiles.map((f: string) => `assets/map/${f}`))

      let removedCount = 0
      for (const map of maps) {
        if (!existingFilePaths.has(map.image_path)) {
          db.prepare('DELETE FROM maps WHERE id = ? AND campaign_id = ?').run(map.id, campaignId)
          db.prepare('DELETE FROM assets WHERE stored_path = ? AND campaign_id = ?').run(map.image_path, campaignId)
          removedCount++
        }
      }

      const existingMapPaths = new Set(maps.map((m: { image_path: string }) => m.image_path))

      let addedCount = 0
      for (const file of imageFiles) {
        const filePath = `assets/map/${file}`
        if (!existingMapPaths.has(filePath)) {
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
      data = readFileSync(srcPath)
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
    // Validate data URL format before processing
    const match = dataUrl.match(/^data:image\/[\w+.-]+;base64,(.+)$/)
    if (!match) {
      console.error('[AppHandlers] Invalid data URL format')
      return null
    }
    const base64 = match[1]
    const destDir = getAssetDir(type)
    const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}.png`
    const destPath = join(destDir, destName)
    try {
      writeFileSync(destPath, Buffer.from(base64, 'base64'))
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

  // Context menu: renderer sends menu items, main process shows native menu and returns selected action
  ipcMain.handle(IPC.SHOW_CONTEXT_MENU, async (event, items: { label: string; action: string; danger?: boolean }[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    return new Promise<string | null>((resolve) => {
      let resolved = false
      const safeResolve = (value: string | null) => {
        if (!resolved) {
          resolved = true
          resolve(value)
        }
      }

      const menuItems = items.map((item) => ({
        label: item.label,
        click: () => safeResolve(item.action),
      }))

      const menu = Menu.buildFromTemplate(menuItems)

      menu.once('menu-will-close', () => {
        // Small delay to let click handler fire first if an item was selected
        setTimeout(() => safeResolve(null), 50)
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
