import { app, BrowserWindow, dialog, net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync, realpathSync, lstatSync } from 'fs'
import { resolve, join, sep } from 'path'
import { initDatabase, closeDatabase, getCustomUserDataPath } from './db/database'
import { logger } from './logger'
import { createDMWindow, getDMWindow } from './windows'
import { registerPlayerBridgeHandlers } from './ipc/player-bridge'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerDataHandlers } from './ipc/data-handlers'
import { registerDbHandlers } from './ipc/db-handlers'
import { registerCampaignHandlers } from './ipc/campaign-handlers'
import { registerMapHandlers } from './ipc/map-handlers'
import { registerTokenHandlers } from './ipc/token-handlers'
import { registerInitiativeHandlers } from './ipc/initiative-handlers'
import { registerWallHandlers } from './ipc/wall-handlers'
import { registerRoomHandlers } from './ipc/room-handlers'
import { registerDrawingHandlers } from './ipc/drawing-handlers'
import { registerEncounterHandlers } from './ipc/encounter-handlers'
import { registerFogHandlers } from './ipc/fog-handlers'
import { registerGMPinHandlers } from './ipc/gm-pin-handlers'
import { registerNoteHandlers } from './ipc/note-handlers'
import { registerHandoutHandlers } from './ipc/handout-handlers'
import { registerCharacterSheetHandlers } from './ipc/character-sheet-handlers'
import { registerAssetHandlers } from './ipc/asset-handlers'
import { registerSessionHandlers } from './ipc/session-handlers'
import { registerTokenTemplateHandlers } from './ipc/token-template-handlers'
import { registerAudioBoardHandlers } from './ipc/audio-board-handlers'
import { registerExportImportHandlers } from './ipc/export-import'
import { buildAppMenu } from './menu'
import { initAutoUpdater } from './updater'
import { loadPrefs } from './prefs'

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { stream: true, supportFetchAPI: true, standard: false, secure: true } },
])

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.exit(0)
}

app.on('second-instance', () => {
  const dmWin = getDMWindow()
  if (dmWin && !dmWin.isDestroyed()) {
    if (dmWin.isMinimized()) dmWin.restore()
    dmWin.focus()
  }
})

// ─── App Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Register custom protocol for serving local assets (images, audio)
  const MAX_ASSET_SIZE = 200 * 1024 * 1024 // 200 MB

  protocol.handle('local-asset', (request) => {
    try {
      const url = new URL(request.url)
      const rawPath = decodeURIComponent(url.pathname)

      const userDataPath = resolve(getCustomUserDataPath() || app.getPath('userData'))
      // Always resolve relative to userData; reject absolute paths and traversal
      const fullPath = resolve(userDataPath, rawPath)
      if (!fullPath.startsWith(userDataPath + sep) && fullPath !== userDataPath) {
        return new Response('Forbidden', { status: 403 })
      }
      if (!existsSync(fullPath)) {
        return new Response('Not found', { status: 404 })
      }

      // Resolve symlinks and re-verify the real path is still under userData
      const realPath = realpathSync(fullPath)
      const realUserDataPath = realpathSync(userDataPath)
      if (!realPath.startsWith(realUserDataPath + sep) && realPath !== realUserDataPath) {
        return new Response('Forbidden', { status: 403 })
      }

      // Use lstatSync to reject symlinks and check size
      const lstat = lstatSync(fullPath)
      if (lstat.isSymbolicLink()) {
        return new Response('Forbidden', { status: 403 })
      }
      if (lstat.size > MAX_ASSET_SIZE) {
        return new Response('Too large', { status: 413 })
      }

      return net.fetch(pathToFileURL(realPath).href)
    } catch (err) {
      return new Response('Error', { status: 500 })
    }
  })

  try {
    initDatabase()
  } catch (err: any) {
    logger.error('Database initialization failed', err)
    dialog.showErrorBox(
      'BoltBerry — Datenbankfehler',
      `Die Datenbank konnte nicht geöffnet werden.\n\n${err.message || String(err)}`,
    )
    app.exit(1)
    return
  }

  registerPlayerBridgeHandlers()
  registerAppHandlers()
  registerDataHandlers()
  registerDbHandlers()
  registerCampaignHandlers()
  registerMapHandlers()
  registerTokenHandlers()
  registerInitiativeHandlers()
  registerWallHandlers()
  registerRoomHandlers()
  registerDrawingHandlers()
  registerEncounterHandlers()
  registerFogHandlers()
  registerGMPinHandlers()
  registerNoteHandlers()
  registerHandoutHandlers()
  registerCharacterSheetHandlers()
  registerAssetHandlers()
  registerSessionHandlers()
  registerTokenTemplateHandlers()
  registerAudioBoardHandlers()
  registerExportImportHandlers()

  buildAppMenu(loadPrefs().menuLanguage)

  createDMWindow()

  // Start background update check (no-ops in dev)
  initAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDMWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error)
  dialog.showErrorBox?.('BoltBerry — Unerwarteter Fehler', error.message || String(error))
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', reason instanceof Error ? reason : String(reason))
})