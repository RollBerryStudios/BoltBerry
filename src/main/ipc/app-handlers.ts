import { ipcMain, dialog, app } from 'electron'
import { join, extname } from 'path'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync, readFileSync } from 'fs'
import { IPC } from '../../shared/ipc-types'
import {
  createPlayerWindow,
  getPlayerWindow,
  getAvailableDisplays,
  setPlayerDisplayId,
} from '../windows'
import { getDb } from '../db/database'

const ASSET_EXTENSIONS = {
  map: ['.png', '.jpg', '.jpeg', '.webp'],
  token: ['.png', '.jpg', '.jpeg', '.webp'],
  atmosphere: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  audio: ['.mp3', '.ogg', '.wav', '.m4a'],
}

function getAssetDir(type: string): string {
  const dir = join(app.getPath('userData'), 'assets', type)
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

    // Register in assets table
    const db = getDb()
    const stmt = db.prepare(
      `INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)`
    )
    const result2 = stmt.run(srcPath.split(/[\\/]/).pop()!, destPath, type, campaignId ?? null)

    return { id: result2.lastInsertRowid, path: destPath }
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
    const db = getDb()
    const row = db.prepare(
      `INSERT INTO assets (original_name, stored_path, type, campaign_id) VALUES (?, ?, ?, ?)`
    ).run(originalName, destPath, type, campaignId)
    return { id: row.lastInsertRowid, path: destPath }
  })

  // Save now (autosave trigger)
  ipcMain.handle(IPC.SAVE_NOW, () => {
    return true
  })
}
