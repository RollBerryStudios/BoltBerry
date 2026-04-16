import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc-types'

// Resolve preload path relative to the app root (works in both dev and packaged)
function preloadPath(): string {
  return join(app.getAppPath(), 'dist/preload/preload/index.js')
}

const isDev = process.env.NODE_ENV === 'development'
const RENDERER_URL = 'http://localhost:5173'

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

  // Block navigation to external URLs
  dmWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(RENDERER_URL) && !url.startsWith('file://')) e.preventDefault()
  })
  dmWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  dmWindow.on('closed', () => {
    dmWindow = null
    playerWindow?.close()
    playerWindow = null
  })

  return dmWindow
}

// ─── Player Window ───────────────────────────────────────────────────────────────────
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
    fullscreen: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ['--boltberry-window-type=player'],
    },
  })

  if (isDev) {
    playerWindow.loadURL(`${RENDERER_URL}/player.html`)
  } else {
    playerWindow.loadFile(join(app.getAppPath(), 'dist/renderer/player.html'))
  }

  // Block navigation to external URLs
  playerWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(RENDERER_URL) && !url.startsWith('file://')) e.preventDefault()
  })
  playerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  playerWindow.on('closed', () => {
    playerWindow = null
    getDMWindow()?.webContents.send(IPC.DM_PLAYER_WINDOW_CLOSED)
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
