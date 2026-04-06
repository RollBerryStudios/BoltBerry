import { contextBridge, ipcRenderer } from 'electron'
import type {
  PlayerFullState,
  FogDelta,
  PlayerMapState,
  PlayerTokenState,
  PlayerPointer,
  PlayerCamera,
  PlayerHandout,
  PlayerOverlay,
  PlayerInitiativeEntry,
  WeatherType,
} from '../shared/ipc-types'
import { IPC } from '../shared/ipc-types'

// ─── DM Window API (exposed to renderer via window.electronAPI) ───────────────
const dmApi = {
  // Monitor management
  getMonitors: () => ipcRenderer.invoke(IPC.GET_MONITORS),
  setPlayerMonitor: (displayId: number) =>
    ipcRenderer.invoke(IPC.SET_PLAYER_MONITOR, displayId),
  openPlayerWindow: () => ipcRenderer.invoke(IPC.OPEN_PLAYER_WINDOW),

  // File operations
  importFile: (type: 'map' | 'token' | 'atmosphere' | 'audio', campaignId?: number) =>
    ipcRenderer.invoke(IPC.IMPORT_FILE, type, campaignId),
  importPdf: (campaignId: number) =>
    ipcRenderer.invoke(IPC.IMPORT_PDF, campaignId),
  saveAssetImage: (args: { dataUrl: string; originalName: string; type: 'map' | 'token'; campaignId: number }) =>
    ipcRenderer.invoke(IPC.SAVE_ASSET_IMAGE, args),
  exportCampaign: (campaignId: number) =>
    ipcRenderer.invoke(IPC.EXPORT_CAMPAIGN, campaignId),
  importCampaign: () => ipcRenderer.invoke(IPC.IMPORT_CAMPAIGN),
  duplicateCampaign: (campaignId: number) =>
    ipcRenderer.invoke(IPC.DUPLICATE_CAMPAIGN, campaignId),
  quickBackup: (campaignId: number) =>
    ipcRenderer.invoke(IPC.QUICK_BACKUP, campaignId),
  saveNow: () => ipcRenderer.invoke(IPC.SAVE_NOW),

  // Player state broadcasting
  sendMapUpdate: (state: PlayerMapState) =>
    ipcRenderer.send(IPC.PLAYER_MAP_UPDATE, state),
  sendFogDelta: (delta: FogDelta) =>
    ipcRenderer.send(IPC.PLAYER_FOG_DELTA, delta),
  sendTokenUpdate: (tokens: PlayerTokenState[]) =>
    ipcRenderer.send(IPC.PLAYER_TOKEN_UPDATE, tokens),
  sendBlackout: (active: boolean) =>
    ipcRenderer.send(IPC.PLAYER_BLACKOUT, active),
  sendAtmosphere: (imagePath: string | null) =>
    ipcRenderer.send(IPC.PLAYER_ATMOSPHERE, imagePath),
  sendFullSync: (state: PlayerFullState) =>
    ipcRenderer.send(IPC.PLAYER_FULL_SYNC, state),
  sendPointer: (pointer: PlayerPointer) =>
    ipcRenderer.send(IPC.PLAYER_POINTER, pointer),
  sendCameraView: (camera: PlayerCamera) =>
    ipcRenderer.send(IPC.PLAYER_CAMERA, camera),
  sendHandout: (handout: PlayerHandout | null) =>
    ipcRenderer.send(IPC.PLAYER_HANDOUT, handout),
  sendOverlay: (overlay: PlayerOverlay | null) =>
    ipcRenderer.send(IPC.PLAYER_OVERLAY, overlay),
  sendInitiative: (entries: PlayerInitiativeEntry[]) =>
    ipcRenderer.send(IPC.PLAYER_INITIATIVE, entries),
  sendWeather: (type: WeatherType) =>
    ipcRenderer.send(IPC.PLAYER_WEATHER, type),

  // DB operations
  dbQuery: <T>(sql: string, params?: unknown[]): Promise<T[]> =>
    ipcRenderer.invoke(IPC.DB_QUERY, sql, params),
  dbRun: (sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }> =>
    ipcRenderer.invoke(IPC.DB_RUN, sql, params),

  // Listen for main → DM: player window requested a full state sync
  onRequestFullSync: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('dm:request-full-sync', handler)
    return () => ipcRenderer.removeListener('dm:request-full-sync', handler)
  },
}

// ─── Player Window API ────────────────────────────────────────────────────────
const playerApi = {
  onFullSync: (cb: (state: PlayerFullState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: PlayerFullState) => cb(state)
    ipcRenderer.on(IPC.PLAYER_FULL_SYNC, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_FULL_SYNC, handler)
  },
  onMapUpdate: (cb: (state: PlayerMapState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: PlayerMapState) => cb(state)
    ipcRenderer.on(IPC.PLAYER_MAP_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_MAP_UPDATE, handler)
  },
  onFogDelta: (cb: (delta: FogDelta) => void) => {
    const handler = (_: Electron.IpcRendererEvent, delta: FogDelta) => cb(delta)
    ipcRenderer.on(IPC.PLAYER_FOG_DELTA, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_FOG_DELTA, handler)
  },
  onTokenUpdate: (cb: (tokens: PlayerTokenState[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, tokens: PlayerTokenState[]) => cb(tokens)
    ipcRenderer.on(IPC.PLAYER_TOKEN_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_TOKEN_UPDATE, handler)
  },
  onBlackout: (cb: (active: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, active: boolean) => cb(active)
    ipcRenderer.on(IPC.PLAYER_BLACKOUT, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_BLACKOUT, handler)
  },
  onAtmosphere: (cb: (imagePath: string | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, imagePath: string | null) => cb(imagePath)
    ipcRenderer.on(IPC.PLAYER_ATMOSPHERE, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_ATMOSPHERE, handler)
  },
  requestFullSync: () => ipcRenderer.send('player:request-sync'),
  onPointer: (cb: (pointer: PlayerPointer) => void) => {
    const handler = (_: Electron.IpcRendererEvent, pointer: PlayerPointer) => cb(pointer)
    ipcRenderer.on(IPC.PLAYER_POINTER, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_POINTER, handler)
  },
  onCameraView: (cb: (camera: PlayerCamera) => void) => {
    const handler = (_: Electron.IpcRendererEvent, camera: PlayerCamera) => cb(camera)
    ipcRenderer.on(IPC.PLAYER_CAMERA, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_CAMERA, handler)
  },
  onHandout: (cb: (handout: PlayerHandout | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, handout: PlayerHandout | null) => cb(handout)
    ipcRenderer.on(IPC.PLAYER_HANDOUT, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_HANDOUT, handler)
  },
  onOverlay: (cb: (overlay: PlayerOverlay | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, overlay: PlayerOverlay | null) => cb(overlay)
    ipcRenderer.on(IPC.PLAYER_OVERLAY, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_OVERLAY, handler)
  },
  onInitiative: (cb: (entries: PlayerInitiativeEntry[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, entries: PlayerInitiativeEntry[]) => cb(entries)
    ipcRenderer.on(IPC.PLAYER_INITIATIVE, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_INITIATIVE, handler)
  },
  onWeather: (cb: (type: WeatherType) => void) => {
    const handler = (_: Electron.IpcRendererEvent, type: WeatherType) => cb(type)
    ipcRenderer.on(IPC.PLAYER_WEATHER, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYER_WEATHER, handler)
  },
}


// Expose APIs based on which window this preload is running in
// Both APIs are exposed; each window only uses what it needs
contextBridge.exposeInMainWorld('electronAPI', dmApi)
contextBridge.exposeInMainWorld('playerAPI', playerApi)

// Type declarations for renderer TypeScript
export type ElectronAPI = typeof dmApi
export type PlayerAPI = typeof playerApi
