import { app, BrowserWindow, net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync, statSync } from 'fs'
import { initDatabase, closeDatabase, getCustomUserDataPath } from './db/database'
import { createDMWindow } from './windows'
import { registerPlayerBridgeHandlers } from './ipc/player-bridge'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerDbHandlers } from './ipc/db-handlers'
import { registerExportImportHandlers } from './ipc/export-import'

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    const dmWin = wins[0]
    if (dmWin.isMinimized()) dmWin.restore()
    dmWin.focus()
  }
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Register custom protocol for serving local assets (images, audio)
  // This bypasses the file:// CSP restriction in Electron with contextIsolation
  protocol.handle('local-asset', (request) => {
    try {
      const filePath = decodeURIComponent(request.url.replace('local-asset://', ''))
      const userDataPath = getCustomUserDataPath() || app.getPath('userData')
      const fullPath = filePath.startsWith('/') ? filePath : require('path').join(userDataPath, filePath)
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
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})

// ─── Error Handling ───────────────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('[BoltBerry] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[BoltBerry] Unhandled Rejection:', reason)
})
