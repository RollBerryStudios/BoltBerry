import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, session } from 'electron'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, extname, join, relative, resolve, sep } from 'path'
import { pathToFileURL } from 'url'

type ChannelId = 'track1' | 'track2' | 'combat'

interface BardTrack {
  id: string
  path: string
  fileName: string
  collection: string | null
  assignments: ChannelId[]
  createdAt: string
}

interface BardBoardSlot {
  slotNumber: number
  emoji: string
  title: string
  audioPath: string | null
  iconPath: string | null
  volume: number
  isLoop: boolean
}

interface BardBoard {
  id: string
  name: string
  sortOrder: number
  slots: BardBoardSlot[]
}

interface BardLibrary {
  version: 1
  tracks: BardTrack[]
  boards: BardBoard[]
  activeBoardId: string | null
  masterVolume: number
  sfxVolume: number
  channelVolumes: Record<ChannelId, number>
}

const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MAX_ASSET_SIZE = 300 * 1024 * 1024
const isDev = process.env.NODE_ENV === 'development'
const RENDERER_URL = 'http://localhost:5174'
function appRoot(): string {
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'dist/renderer')) || existsSync(join(cwd, 'package.json'))) {
    return cwd
  }
  return app.getAppPath()
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { stream: true, supportFetchAPI: true, standard: false, secure: false } },
])

app.setName('BardBerry')
if (process.env.BARDBERRY_E2E_USER_DATA) {
  app.setPath('userData', resolve(process.env.BARDBERRY_E2E_USER_DATA))
}

let mainWindow: BrowserWindow | null = null

function userDataPath(): string {
  return app.getPath('userData')
}

function assetsDir(kind: 'audio' | 'icons'): string {
  const dir = join(userDataPath(), 'assets', kind)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function libraryPath(): string {
  const dir = join(userDataPath(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'bardberry-library.json')
}

function defaultLibrary(): BardLibrary {
  return {
    version: 1,
    tracks: [],
    boards: [{ id: makeId(), name: 'Main Board', sortOrder: 0, slots: [] }],
    activeBoardId: null,
    masterVolume: 1,
    sfxVolume: 0.8,
    channelVolumes: { track1: 1, track2: 0.85, combat: 1 },
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function validateMagicBytes(filePath: string, ext: string, strict = false): boolean {
  const buf = readFileSync(filePath, { flag: 'r' }).subarray(0, 16)
  switch (ext.toLowerCase()) {
    case '.png': return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    case '.jpg':
    case '.jpeg': return buf[0] === 0xff && buf[1] === 0xd8
    case '.webp': return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    case '.mp3': return (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) || (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33)
    case '.wav': return buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
    case '.ogg': return buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53
    case '.m4a': return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
    default: return !strict
  }
}

function loadLibrary(): BardLibrary {
  const path = libraryPath()
  if (!existsSync(path)) return defaultLibrary()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as BardLibrary
    if (!parsed || parsed.version !== 1) return defaultLibrary()
    return {
      ...defaultLibrary(),
      ...parsed,
      channelVolumes: { ...defaultLibrary().channelVolumes, ...(parsed.channelVolumes ?? {}) },
      boards: Array.isArray(parsed.boards) && parsed.boards.length > 0 ? parsed.boards : defaultLibrary().boards,
      tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
    }
  } catch {
    return defaultLibrary()
  }
}

function saveLibrary(library: BardLibrary): void {
  writeFileSync(libraryPath(), JSON.stringify(library, null, 2), 'utf8')
}

function importPaths(srcPaths: string[], kind: 'audio' | 'icons', collection: string | null = null): BardTrack[] {
  const exts = kind === 'audio' ? AUDIO_EXT : IMAGE_EXT
  const destDir = assetsDir(kind)
  const imported: BardTrack[] = []
  for (const srcPath of srcPaths) {
    const ext = extname(srcPath).toLowerCase()
    if (!exts.has(ext)) continue
    const originalName = basename(srcPath)
    const destName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    const destPath = join(destDir, destName)
    try {
      copyFileSync(srcPath, destPath)
      if (!validateMagicBytes(destPath, ext)) {
        unlinkSync(destPath)
        continue
      }
      if (statSync(destPath).size > MAX_ASSET_SIZE) {
        unlinkSync(destPath)
        continue
      }
      if (kind === 'audio') {
        imported.push({
          id: makeId(),
          path: relative(userDataPath(), destPath),
          fileName: originalName,
          collection,
          assignments: [],
          createdAt: new Date().toISOString(),
        })
      }
    } catch {
      try { if (existsSync(destPath)) unlinkSync(destPath) } catch { /* best effort */ }
    }
  }
  return imported
}

function scanAudioFiles(folder: string, limit = 1000): string[] {
  const out: string[] = []
  const stack = [folder]
  const rootReal = realpathSync(folder)
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const lst = lstatSync(full)
      if (lst.isSymbolicLink()) continue
      if (lst.isDirectory()) {
        const real = realpathSync(full)
        if (real.startsWith(rootReal + sep)) stack.push(full)
        continue
      }
      if (lst.isFile() && AUDIO_EXT.has(extname(full).toLowerCase())) out.push(full)
      if (out.length >= limit) break
    }
  }
  return out
}

function installRuntimeCsp(): void {
  const dev = "default-src 'self' http://localhost:5174 ws://localhost:5174; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5174; style-src 'self' 'unsafe-inline' http://localhost:5174; img-src 'self' data: local-asset: http://localhost:5174; media-src 'self' local-asset: blob:; font-src 'self' data:; connect-src 'self' local-asset: ws://localhost:5174 http://localhost:5174; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
  const prod = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: local-asset:; media-src 'self' local-asset: blob:; font-src 'self' data:; connect-src 'self' local-asset:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders ?? {}),
        'Content-Security-Policy': [isDev ? dev : prod],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    })
  })
}

function registerLocalAssetProtocol(): void {
  protocol.handle('local-asset', (request) => {
    try {
      const rawPath = decodeURIComponent(new URL(request.url).pathname)
      if (!rawPath || rawPath === '/' || rawPath === '\\') return new Response('Forbidden', { status: 403 })
      const root = resolve(userDataPath())
      const full = resolve(root, rawPath)
      if (!full.startsWith(root + sep) && full !== root) return new Response('Forbidden', { status: 403 })
      if (!existsSync(full)) return new Response('Not found', { status: 404 })
      const real = realpathSync(full)
      const realRoot = realpathSync(root)
      if (!real.startsWith(realRoot + sep) && real !== realRoot) return new Response('Forbidden', { status: 403 })
      const lst = lstatSync(full)
      if (lst.isSymbolicLink()) return new Response('Forbidden', { status: 403 })
      if (lst.size > MAX_ASSET_SIZE) return new Response('Too large', { status: 413 })
      return net.fetch(pathToFileURL(real).href)
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle('bardberry:library-load', () => loadLibrary())
  ipcMain.handle('bardberry:library-save', (_event, library: BardLibrary) => {
    saveLibrary({ ...library, version: 1 })
    return true
  })
  ipcMain.handle('bardberry:import-audio-files', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Audio files importieren',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a'] }],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    return importPaths(result.filePaths, 'audio')
  })
  ipcMain.handle('bardberry:import-audio-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Audio-Ordner importieren',
      properties: ['openDirectory'],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const folder = result.filePaths[0]
    return { folderName: basename(folder), tracks: importPaths(scanAudioFiles(folder), 'audio', basename(folder)) }
  })
  ipcMain.handle('bardberry:import-icon', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Slot-Icon importieren',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const before = new Set(readdirSync(assetsDir('icons')))
    importPaths([result.filePaths[0]], 'icons')
    const after = readdirSync(assetsDir('icons')).filter((f) => !before.has(f))
    return after[0] ? relative(userDataPath(), join(assetsDir('icons'), after[0])) : null
  })
  ipcMain.handle('bardberry:export-library', async (event, library: BardLibrary) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.SaveDialogOptions = {
      title: 'BardBerry Library exportieren',
      defaultPath: 'bardberry-library.json',
      filters: [{ name: 'BardBerry Library', extensions: ['json'] }],
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    writeFileSync(result.filePath, JSON.stringify(library, null, 2), 'utf8')
    return { success: true, filePath: result.filePath }
  })
  ipcMain.handle('bardberry:import-library', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'BardBerry Library importieren',
      properties: ['openFile'],
      filters: [{ name: 'BardBerry Library', extensions: ['json'] }],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const parsed = JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as BardLibrary
    if (parsed.version !== 1) throw new Error('Unsupported BardBerry library version')
    saveLibrary(parsed)
    return parsed
  })
  ipcMain.handle('bardberry:reveal-data', async () => shell.openPath(userDataPath()))
  ipcMain.handle('bardberry:confirm', async (event, message: string, detail?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      title: 'BardBerry',
      message,
      detail,
      buttons: ['Abbrechen', 'OK'],
      defaultId: 1,
      cancelId: 0,
    }
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return response === 1
  })
}

function createMainWindow(): void {
  const isDarwin = process.platform === 'darwin'
  const preload = join(appRoot(), 'dist/preload/preload.js')
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: 'BardBerry',
    backgroundColor: '#10131a',
    show: false,
    frame: false,
    titleBarStyle: isDarwin ? 'hiddenInset' : 'hidden',
    ...(isDarwin ? {} : { titleBarOverlay: { color: '#10131a', symbolColor: '#d2b35b', height: 36 } }),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: false,
    },
  })
  mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  if (isDev) mainWindow.loadURL(RENDERER_URL)
  else mainWindow.loadFile(join(appRoot(), 'dist/renderer/index.html'))
  mainWindow.on('closed', () => { mainWindow = null })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.exit(0)
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  installRuntimeCsp()
  registerLocalAssetProtocol()
  registerIpc()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
