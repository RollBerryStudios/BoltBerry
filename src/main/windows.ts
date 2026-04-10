import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'

// Resolve preload path relative to the app root (works in both dev and packaged)
function preloadPath(): string {
  return join(app.getAppPath(), 'dist/preload/preload/index.js')
}

const isDev = process.env.NODE_ENV === 'development'
const RENDERER_URL = 'http://localhost:5173'

let dmWindow: BrowserWindow | null = null
let playerWindow: BrowserWindow | null = null
let playerDisplayId: number | null = null

// ─── DM Window ────────────────────────────────────────────────────────────────────
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
      preload: preloadPath(),
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

  dmWindow.on('closed', () => {
    dmWindow = null
    playerWindow?.close()
    playerWindow = null
  })

  return dmWindow
}

// ─── Player Window ─────────────────────────────────────────────────────────────────
export function createPlayerWindow(): BrowserWindow | null {
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
    alwaysOnTop: false,
    fullscreen: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // ESC key exits fullscreen on player window
  if (isDev) {
    playerWindow.loadURL(`${RENDERER_URL}/player.html`)
  } else {
    playerWindow.loadFile(join(app.getAppPath(), 'dist/renderer/player.html'))
  }

  playerWindow.on('closed', () => {
    playerWindow = null
    getDMWindow()?.webContents.send('dm:player-window-closed')
  })

  return playerWindow
}

// ─── Accessors ────────────────────────────────────────────────────────────────────
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
