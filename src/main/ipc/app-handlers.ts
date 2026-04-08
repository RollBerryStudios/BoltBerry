import { ipcMain, dialog, app, Menu, BrowserWindow } from 'electron'
import { join, extname, relative } from 'path'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { IPC } from '../../shared/ipc-types'
import {
  createPlayerWindow,
  getPlayerWindow,
  getAvailableDisplays,
  setPlayerDisplayId,
} from '../windows'
import { getDb, getCustomUserDataPath } from '../db/database'

const ASSET_EXTENSIONS = {
  map: ['.png', '.jpg', '.jpeg', '.webp'],
  token: ['.png', '.jpg', '.jpeg', '.webp'],
  atmosphere: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
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
  ipcMain.handle('GET_DEFAULT_USER_DATA_FOLDER', () => {
    const { app } = require('electron')
    const { join } = require('path')
    return join(app.getPath('documents'), 'BoltBerry')
  })

  // Set custom user data folder
  ipcMain.handle('SET_USER_DATA_FOLDER', (_event, path: string) => {
    const { setCustomUserDataPath, initDatabase } = require('../db/database')
    setCustomUserDataPath(path)
    
    // Reinitialize database with new path
    try {
      initDatabase()
    } catch (err) {
      console.error('[AppHandlers] Failed to reinitialize database:', err)
    }
    
    return true
  })

// Open content folder
  ipcMain.handle('OPEN_CONTENT_FOLDER', () => {
    const { shell } = require('electron')
    const { getCustomUserDataPath } = require('../db/database')
    const { join } = require('path')
    
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const contentPath = join(userDataPath, 'assets')
    
    return shell.openPath(contentPath)
  })

  // Get image as base64 for direct embedding
  ipcMain.handle('GET_IMAGE_AS_BASE64', async (_event, imagePath: string) => {
    const { getCustomUserDataPath } = require('../db/database')
    const { join, isAbsolute } = require('path')
    const { promises: { readFile } } = require('fs')
    
    try {
      // Remove file:// prefix if present
      let cleanPath = imagePath
      if (imagePath.startsWith('file://')) {
        cleanPath = imagePath.substring(7)
      }
      
      let fullPath: string
      if (isAbsolute(cleanPath)) {
        // Already absolute path
        fullPath = cleanPath
      } else {
        // Relative path from user data folder
        const userDataPath = getCustomUserDataPath() || app.getPath('userData')
        fullPath = join(userDataPath, cleanPath)
      }
      
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

  // Rescan content folder to synchronize files with database
  ipcMain.handle('RESCAN_CONTENT_FOLDER', async () => {
    const { getCustomUserDataPath, getDb } = require('../db/database')
    const { join, basename } = require('path')
    const { readdir, stat } = require('fs').promises
    
    try {
      const userDataPath = getCustomUserDataPath() || app.getPath('userData')
      const assetsPath = join(userDataPath, 'assets', 'map')
      
      let files: string[] = []
      try {
        files = await readdir(assetsPath)
      } catch (err) {
        const { mkdirSync } = require('fs')
        mkdirSync(assetsPath, { recursive: true })
        return { scanned: 0, added: 0, removed: 0, message: 'Keine Dateien gefunden' }
      }
      
      const imageFiles = files.filter((f: string) => 
        f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.webp')
      )
      
      const db = getDb()

      const maps = db.prepare('SELECT id, image_path, name FROM maps').all() as { id: number; image_path: string; name: string }[]
      
      const existingFilePaths = new Set(imageFiles.map((f: string) => `assets/map/${f}`))
      
      let removedCount = 0
      for (const map of maps) {
        if (!existingFilePaths.has(map.image_path)) {
          db.prepare('DELETE FROM maps WHERE id = ?').run(map.id)
          db.prepare('DELETE FROM assets WHERE stored_path = ?').run(map.image_path)
          db.prepare('DELETE FROM tokens WHERE map_id = ?').run(map.id)
          removedCount++
        }
      }
      
      const existingMapPaths = new Set(maps.map((m: { image_path: string }) => m.image_path))
      
      let addedCount = 0
      for (const file of imageFiles) {
        const filePath = `assets/map/${file}`
        if (!existingMapPaths.has(filePath)) {
          const fileName = file.replace(/\.[^/.]+$/, "") || file
          
          let campaignId = db.prepare('SELECT id FROM campaigns LIMIT 1').get()?.id
          if (!campaignId) {
            const campaignResult = db.prepare(
              'INSERT INTO campaigns (name, created_at, last_opened) VALUES (?, datetime("now"), datetime("now"))'
            ).run('Standard Kampagne')
            campaignId = campaignResult.lastInsertRowid as number
          }

          db.prepare(
            'INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)'
          ).run(fileName, filePath, 'map', campaignId)
          
          const orderIndex = db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM maps WHERE campaign_id = ?').get(campaignId)!.next
          db.prepare(
            'INSERT INTO maps (campaign_id, name, image_path, order_index, rotation) VALUES (?, ?, ?, ?, 0)'
          ).run(campaignId, fileName, filePath, orderIndex)
          
          addedCount++
        }
      }
      
      return { 
        scanned: imageFiles.length, 
        added: addedCount, 
        removed: removedCount,
        message: `Scan abgeschlossen: ${imageFiles.length} Dateien, ${addedCount} hinzugefügt, ${removedCount} entfernt`
      }
    } catch (err) {
      console.error('[AppHandlers] Failed to rescan content folder:', err)
      return { 
        scanned: 0, added: 0, removed: 0,
        message: 'Fehler beim Scannen: ' + (err instanceof Error ? err.message : String(err))
      }
    }
  })

  // Import file dialog → copy to AppData, return stored path
  ipcMain.handle(IPC.IMPORT_FILE, async (_event, type: 'map' | 'token' | 'atmosphere' | 'audio', campaignId?: number) => {
    const extensions = ASSET_EXTENSIONS[type]
    const titles = { map: 'Karte', token: 'Token', atmosphere: 'Atmosphäre-Bild', audio: 'Audio-Datei' }
    const filterNames = { map: 'Bilder', token: 'Bilder', atmosphere: 'Bilder', audio: 'Audio' }
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
        title: 'Große Datei',
        message: `Die Datei ist ${sizeMB} MB groß (empfohlen: max. ${maxMB} MB).`,
        detail: 'Große Dateien können die Performance beeinträchtigen. Trotzdem importieren?',
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

    copyFileSync(srcPath, destPath)

    // Store relative path from user data folder
    const userDataPath = getCustomUserDataPath() || app.getPath('userData')
    const relativePath = relative(userDataPath, destPath)

    // Register in assets table
    const db = getDb()
    const stmt = db.prepare(
      `INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)`
    )
    const result2 = stmt.run(srcPath.split(/[\\/]/).pop()!, relativePath, type, campaignId ?? null)

    return { id: result2.lastInsertRowid, path: relativePath }
  })

  // Import PDF → returns file bytes so renderer can render with pdfjs
  ipcMain.handle(IPC.IMPORT_PDF, async (_event, _campaignId: number) => {
    const result = await dialog.showOpenDialog({
      title: 'PDF-Karte importieren',
      filters: [{ name: 'PDF-Dokument', extensions: ['pdf'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const srcPath = result.filePaths[0]
    const data = readFileSync(srcPath)
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
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const destDir = getAssetDir(type)
    const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}.png`
    const destPath = join(destDir, destName)
    writeFileSync(destPath, Buffer.from(base64, 'base64'))
    
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
  ipcMain.handle('GET_USER_DATA_PATH', () => {
    const { app } = require('electron')
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

  // Delete map (with native confirmation dialog)
  ipcMain.handle('DELETE_MAP_CONFIRM', async (event, mapName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false

    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Karte löschen',
      message: `Karte "${mapName}" wirklich löschen?`,
      detail: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      buttons: ['Abbrechen', 'Löschen'],
      defaultId: 0,
      cancelId: 0,
    })
    return response === 1
  })
}
