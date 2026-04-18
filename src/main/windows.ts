import { BrowserWindow, dialog, screen, app, session } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '../shared/ipc-types'
import { logger } from './logger'

// Preload paths resolved relative to the app root (works in dev + packaged).
// DM and Player use separate preload bundles so each window only receives the
// API surface it actually needs — previously keyed on `process.argv` which was
// fragile and easy to break when window options changed.
function dmPreloadPath(): string {
  return join(app.getAppPath(), 'dist/preload/preload-dm.js')
}

function playerPreloadPath(): string {
  return join(app.getAppPath(), 'dist/preload/preload-player.js')
}

/**
 * Fail loudly when a preload bundle is missing instead of letting Electron
 * silently drop it and ship a renderer with no IPC surface. That produced
 * the confusing "Datenbankverbindung nicht verfügbar — App wurde möglicher-
 * weise nicht korrekt installiert" banner from the dashboard without any hint
 * of the real cause (running `electron .` before `npm run build:preload`,
 * or a stale packaged build). Returns the path if present, else aborts.
 */
function requirePreload(path: string, label: string): string {
  if (!existsSync(path)) {
    const msg = `Preload bundle missing: ${path}\n\nRun \`npm run build\` before starting Electron, or rebuild the installer.`
    logger.error(`[windows] ${label} preload not found at ${path}`)
    dialog.showErrorBox('BoltBerry — Preload fehlt', msg)
    app.exit(1)
    throw new Error(msg)
  }
  return path
}

const isDev = process.env.NODE_ENV === 'development'
const RENDERER_URL = 'http://localhost:5173'
const ALLOWED_FILE_PREFIX = pathToFileURL(join(app.getAppPath(), 'dist/renderer/')).href

let dmWindow: BrowserWindow | null = null
let playerWindow: BrowserWindow | null = null
let playerDisplayId: number | null = null

// ─── DM Window ───────────────────────────────────────────────────────────────────────
export function createDMWindow(): BrowserWindow {
  // Frameless with a platform-aware title-bar strategy so the in-app custom
  // TitleBar can render its own breadcrumb + broadcast pill + lang toggle.
  // macOS keeps its native traffic lights (hiddenInset); Windows/Linux get
  // native minimise/maximise/close controls painted by titleBarOverlay so
  // we don't need custom buttons.
  const isDarwin = process.platform === 'darwin'
  dmWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'BoltBerry – DM',
    backgroundColor: '#121722',
    show: false,
    frame: false,
    titleBarStyle: isDarwin ? 'hiddenInset' : 'hidden',
    ...(isDarwin
      ? {}
      : { titleBarOverlay: { color: '#121722', symbolColor: '#94a0b2', height: 36 } }),
    webPreferences: {
      preload: requirePreload(dmPreloadPath(), 'DM'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  dmWindow.maximize()

  dmWindow.once('ready-to-show', () => {
    dmWindow?.show()
  })

  if (isDev) {
    dmWindow.loadURL(RENDERER_URL)
    dmWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    dmWindow.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'))
  }

  // Block navigation to external URLs — only allow the dev server or the specific renderer build path
  dmWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(RENDERER_URL) && !url.startsWith(ALLOWED_FILE_PREFIX)) e.preventDefault()
  })
  dmWindow.webContents.on('will-redirect', (e, url) => {
    if (!url.startsWith(RENDERER_URL) && !url.startsWith(ALLOWED_FILE_PREFIX)) e.preventDefault()
  })
  dmWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Deny all permission requests (camera, microphone, geolocation, etc.)
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  dmWindow.on('closed', () => {
    dmWindow = null
    // Guard against the race where the player window was already torn down
    // (e.g. user closed it manually) — calling .close() on a destroyed
    // BrowserWindow throws "Object has been destroyed".
    if (playerWindow && !playerWindow.isDestroyed()) {
      playerWindow.close()
    }
    playerWindow = null
  })

  return dmWindow
}

// ─── Player Window ───────────────────────────────────────────────────────────────────
export function createPlayerWindow(): BrowserWindow | null {
  // If a player window is already open, focus it instead of creating a new one.
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.focus()
    return playerWindow
  }

  const displays = screen.getAllDisplays()

  // Pick the target display (non-primary if not set)
  let targetDisplay = displays.find(d => d.id === playerDisplayId)
  if (!targetDisplay) {
    targetDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id)
  }
  if (!targetDisplay) {
    targetDisplay = screen.getPrimaryDisplay()
  }

  const { x, y, width, height } = targetDisplay.bounds

  playerWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: 'BoltBerry – Spieler',
    backgroundColor: '#000000',
    frame: false,
    fullscreen: true,
    webPreferences: {
      preload: requirePreload(playerPreloadPath(), 'Player'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    playerWindow.loadURL(`${RENDERER_URL}/player.html`)
  } else {
    playerWindow.loadFile(join(app.getAppPath(), 'dist/renderer/player.html'))
  }

  // Block navigation to external URLs — only allow the dev server or the specific renderer build path
  playerWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(RENDERER_URL) && !url.startsWith(ALLOWED_FILE_PREFIX)) e.preventDefault()
  })
  playerWindow.webContents.on('will-redirect', (e, url) => {
    if (!url.startsWith(RENDERER_URL) && !url.startsWith(ALLOWED_FILE_PREFIX)) e.preventDefault()
  })
  playerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  playerWindow.on('closed', () => {
    playerWindow = null
    // The DM window may have been closed first (which cascades into closing
    // the player). Guard before posting back so we don't crash on shutdown.
    const dm = getDMWindow()
    if (dm && !dm.isDestroyed()) {
      dm.webContents.send(IPC.DM_PLAYER_WINDOW_CLOSED)
    }
  })

  return playerWindow
}

// ─── Accessors ───────────────────────────────────────────────────────────────────────
export function getDMWindow() {
  return dmWindow
}

export function getPlayerWindow() {
  return playerWindow
}

export function setPlayerDisplayId(displayId: number) {
  playerDisplayId = displayId
}

export function getAvailableDisplays() {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: `Display ${d.id}${d.id === screen.getPrimaryDisplay().id ? ' (Primär)' : ''}`,
    bounds: d.bounds,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }))
}
