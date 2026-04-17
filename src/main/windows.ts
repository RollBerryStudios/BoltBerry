import { BrowserWindow, screen, app, session } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '../shared/ipc-types'

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

const isDev = process.env.NODE_ENV === 'development'
const RENDERER_URL = 'http://localhost:5173'
const ALLOWED_FILE_PREFIX = pathToFileURL(join(app.getAppPath(), 'dist/renderer/')).href

let dmWindow: BrowserWindow | null = null
let playerWindow: BrowserWindow | null = null
let playerDisplayId: number | null = null

// ─── DM Window ───────────────────────────────────────────────────────────────────────
export function createDMWindow(): BrowserWindow {
  dmWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'BoltBerry – DM',
    backgroundColor: '#121722',
    show: false,
    webPreferences: {
      preload: dmPreloadPath(),
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
      preload: playerPreloadPath(),
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
