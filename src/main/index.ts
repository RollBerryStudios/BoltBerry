import { app, BrowserWindow, dialog, net, protocol, session } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync, realpathSync, lstatSync } from 'fs'
import { resolve, join, sep } from 'path'
import { initDatabase, closeDatabase, getCustomUserDataPath, seedSrdMonstersDeferred, IntegrityCheckAbortError } from './db/database'
import { logger } from './logger'
import { createDMWindow, getDMWindow } from './windows'
import { registerPlayerBridgeHandlers } from './ipc/player-bridge'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerDialogHandlers } from './ipc/dialog-handlers'
import { registerCompendiumHandlers } from './ipc/compendium-handlers'
import { registerDataHandlers } from './ipc/data-handlers'
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
import { installIpcGuard } from './ipc/validators'
import { buildAppMenu } from './menu'
import { initAutoUpdater } from './updater'
import { loadPrefs } from './prefs'

// Must be called before app.whenReady().
// Note: secure:false (BB-039). The app is offline-first and does not need
// service-worker / SharedArrayBuffer privileges on the local-asset origin;
// granting them would let a compromised renderer register a service worker
// to intercept asset requests.
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { stream: true, supportFetchAPI: true, standard: false, secure: false } },
])

// E2E launches provide a per-test userData path through the environment so
// Chromium storage, Electron prefs, and the SQLite data folder stay isolated
// even on runners that ignore app-arg-style --user-data-dir placement.
if (process.env.ELECTRON_USER_DATA) {
  app.setPath('userData', resolve(process.env.ELECTRON_USER_DATA))
}

if (process.env.BOLTBERRY_E2E_LANG) {
  app.commandLine.appendSwitch('lang', process.env.BOLTBERRY_E2E_LANG)
}

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

// BB-006: runtime CSP via response header. Mirrors the <meta> tag in
// index.html / player.html so navigations, blob: URLs, and same-origin
// window.open cannot bypass it. In dev we additionally allow the Vite
// HMR websocket and inline scripts injected by the dev server.
function installRuntimeCSP(): void {
  const isDevMode = process.env.NODE_ENV === 'development'
  const cspProd =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: local-asset:; " +
    "media-src 'self' local-asset: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' local-asset:; " +
    "worker-src 'self' blob:; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'none'; " +
    "frame-ancestors 'none'"
  const cspDev =
    "default-src 'self' http://localhost:5173 ws://localhost:5173; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; " +
    "style-src 'self' 'unsafe-inline' http://localhost:5173; " +
    "img-src 'self' data: local-asset: http://localhost:5173; " +
    "media-src 'self' local-asset: blob:; " +
    "font-src 'self' data: http://localhost:5173; " +
    "connect-src 'self' local-asset: ws://localhost:5173 http://localhost:5173; " +
    "worker-src 'self' blob:; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'none'; " +
    "frame-ancestors 'none'"
  const csp = isDevMode ? cspDev : cspProd

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {}
    headers['Content-Security-Policy'] = [csp]
    headers['X-Content-Type-Options'] = ['nosniff']
    headers['X-Frame-Options'] = ['DENY']
    headers['Referrer-Policy'] = ['no-referrer']
    callback({ responseHeaders: headers })
  })
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  installRuntimeCSP()

  // Register custom protocol for serving local assets (images, audio)
  const MAX_ASSET_SIZE = 200 * 1024 * 1024 // 200 MB

  protocol.handle('local-asset', (request) => {
    try {
      const url = new URL(request.url)
      const rawPath = decodeURIComponent(url.pathname)

      // Explicit reject for empty / root-only paths (audit SR-4). An
      // empty rawPath slips through `resolve(userDataPath, '')` →
      // userData root, which could serve directory listings to a
      // compromised renderer. Also covers bare '/' which resolves the
      // same way after path normalisation.
      if (!rawPath || rawPath === '/' || rawPath === '\\') {
        return new Response('Forbidden', { status: 403 })
      }

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
    if (err instanceof IntegrityCheckAbortError) {
      // BB-026: the integrity-check dialog already gave the user the
      // message and the choice; just exit cleanly without a second box.
      logger.warn(`[Main] Integrity-check abort: ${err.action}`)
      app.exit(0)
      return
    }
    logger.error('Database initialization failed', err)
    dialog.showErrorBox(
      'BoltBerry — Datenbankfehler',
      `Die Datenbank konnte nicht geöffnet werden.\n\n${err.message || String(err)}`,
    )
    app.exit(1)
    return
  }

  // BB-003: install the sender-frame guard before any handlers register.
  // Every subsequent ipcMain.handle is automatically wrapped so it only
  // accepts invocations from the DM frame (or the explicit player allowlist
  // in validators.ts). player-bridge.ts uses ipcMain.on for relay channels
  // and applies its own isFromDM/isFromPlayer checks.
  installIpcGuard()

  registerPlayerBridgeHandlers()
  registerAppHandlers()
  registerDialogHandlers()
  registerCompendiumHandlers()
  registerDataHandlers()
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

  // Seed the SRD 5.1 bestiary after the DM window starts loading.
  // Deferred off the boot path so initDatabase() no longer blocks on
  // a 263-row INSERT transaction — the window paints faster, and the
  // seed runs on the background queue.
  seedSrdMonstersDeferred()

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
