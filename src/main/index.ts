import { app, BrowserWindow } from 'electron'
import { initDatabase, closeDatabase } from './db/database'
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
  // Focus existing window if a second instance is launched
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    const dmWin = wins[0]
    if (dmWin.isMinimized()) dmWin.restore()
    dmWin.focus()
  }
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
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
    // macOS: re-create window when dock icon is clicked
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
  console.error('[RollBerry] Uncaught Exception:', error)
  // In production: log to file in userData
})

process.on('unhandledRejection', (reason) => {
  console.error('[RollBerry] Unhandled Rejection:', reason)
})
