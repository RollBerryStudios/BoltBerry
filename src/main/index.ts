import { app, BrowserWindow, net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync, statSync } from 'fs'
import { resolve, join, sep } from 'path'
import { initDatabase, closeDatabase, getCustomUserDataPath } from './db/database'
import { createDMWindow } from './windows'
import { registerPlayerBridgeHandlers } from './ipc/player-bridge'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerDbHandlers } from './ipc/db-handlers'
import { registerExportImportHandlers } from './ipc/export-import'

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { stream: true, supportFetchAPI: true, standard: false, secure: true } },
])

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  const { getDMWindow } = require('./windows')
  const dmWin = getDMWindow()
  if (dmWin && !dmWin.isDestroyed()) {
    if (dmWin.isMinimized()) dmWin.restore()
    dmWin.focus()
  }
})

// ─── App Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Register custom protocol for serving local assets (images, audio)
  protocol.handle('local-asset', (request) => {
    try {
      const rawPath = decodeURIComponent(request.url.replace('local-asset://', ''))
      const userDataPath = resolve(getCustomUserDataPath() || app.getPath('userData'))
      // Always resolve relative to userData; reject absolute paths and traversal
      const fullPath = resolve(userDataPath, rawPath)
      if (!fullPath.startsWith(userDataPath + sep) && fullPath !== userDataPath) {
        return new Response('Forbidden', { status: 403 })
      }
      if (!existsSync(fullPath)) {
        return new Response('Not found', { status: 404 })
      }
      const stat = statSync(fullPath)
      if (stat.size > 200 * 1024 * 1024) {
        return new Response('Too large', { status: 413 })
      }
      return net.fetch(pathToFileURL(fullPath).href)
    } catch (err) {
      return new Response('Error', { status: 500 })
    }
  })

  // Init DB first
  initDatabase()

  // Register all IPC handlers
  registerPlayerBridgeHandlers()
  registerAppHandlers()
  registerDbHandlers()
  registerExportImportHandlers()

  // Open DM window
  createDMWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDMWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase()
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  console.error('[BoltBerry] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[BoltBerry] Unhandled Rejection:', reason)
})