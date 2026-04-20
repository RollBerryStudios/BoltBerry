import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-types'
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
  PlayerMeasureState,
  WeatherType,
  PlayerDrawingState,
  PlayerWallState,
  CompendiumFile,
  TokenVariant,
  MonsterIndexEntry,
  MonsterRecord,
  ItemIndexEntry,
  ItemRecord,
  SpellIndexEntry,
  SpellRecord,
} from '../shared/ipc-types'

// ─── DM Window API (exposed to renderer via window.electronAPI) ───────────────
export const dmApi = {
  // Monitor management
  getMonitors: () => ipcRenderer.invoke('app:get-monitors'),
  setPlayerMonitor: (displayId: number) =>
    ipcRenderer.invoke('app:set-player-monitor', displayId),
  openPlayerWindow: () => ipcRenderer.invoke('app:open-player-window'),
  closePlayerWindow: () => ipcRenderer.invoke('app:close-player-window'),
  getDefaultUserDataFolder: () => ipcRenderer.invoke('app:get-default-user-data-folder'),
  chooseFolder: () => ipcRenderer.invoke('app:choose-folder'),
  setUserDataFolder: (path: string) => ipcRenderer.invoke('app:set-user-data-folder', path),
  openContentFolder: () => ipcRenderer.invoke('app:open-content-folder'),
  getImageAsBase64: (path: string) => ipcRenderer.invoke('app:get-image-as-base64', path),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  rescanContentFolder: (campaignId: number) => ipcRenderer.invoke('app:rescan-content-folder', campaignId),
  showContextMenu: (items: Array<{ label: string; action: string; danger?: boolean } | { separator: true }>) =>
    ipcRenderer.invoke('app:show-context-menu', items),
  deleteMapConfirm: (mapName: string) => ipcRenderer.invoke('app:delete-map-confirm', mapName),
  deleteTokenConfirm: (tokenName: string) => ipcRenderer.invoke('app:delete-token-confirm', tokenName),
  confirmDialog: (message: string, detail?: string) =>
    ipcRenderer.invoke('app:confirm-dialog', message, detail),

  // File operations
  importFile: (type: 'map' | 'token' | 'atmosphere' | 'handout' | 'audio', campaignId?: number) =>
    ipcRenderer.invoke('app:import-file', type, campaignId),
  importPdf: (campaignId: number) =>
    ipcRenderer.invoke('app:import-pdf', campaignId),
  saveAssetImage: (args: { dataUrl: string; originalName: string; type: 'map' | 'token'; campaignId: number }) =>
    ipcRenderer.invoke('app:save-asset-image', args),
  exportCampaign: (campaignId: number) =>
    ipcRenderer.invoke('app:export-campaign', campaignId),
  importCampaign: () => ipcRenderer.invoke('app:import-campaign'),
  duplicateCampaign: (campaignId: number) =>
    ipcRenderer.invoke('app:duplicate-campaign', campaignId),
  quickBackup: (campaignId: number) =>
    ipcRenderer.invoke('app:quick-backup', campaignId),
  saveNow: () => ipcRenderer.invoke('app:save-now'),

  // Player state broadcasting
  sendMapUpdate: (state: PlayerMapState) =>
    ipcRenderer.send('player:map-update', state),
  sendFogDelta: (delta: FogDelta) =>
    ipcRenderer.send('player:fog-delta', delta),
  sendFogReset: (fogBitmap: string, exploredBitmap: string) =>
    ipcRenderer.send('player:fog-reset', { fogBitmap, exploredBitmap }),
  sendTokenUpdate: (tokens: PlayerTokenState[]) =>
    ipcRenderer.send('player:token-update', tokens),
  sendBlackout: (active: boolean) =>
    ipcRenderer.send('player:blackout', active),
  sendAtmosphere: (imagePath: string | null) =>
    ipcRenderer.send('player:atmosphere', imagePath),
  sendFullSync: (state: PlayerFullState) =>
    ipcRenderer.send('player:full-sync', state),
  sendPointer: (pointer: PlayerPointer) =>
    ipcRenderer.send('player:pointer', pointer),
  sendCameraView: (camera: PlayerCamera) =>
    ipcRenderer.send('player:camera', camera),
  sendHandout: (handout: PlayerHandout | null) =>
    ipcRenderer.send('player:handout', handout),
  sendOverlay: (overlay: PlayerOverlay | null) =>
    ipcRenderer.send('player:overlay', overlay),
  sendInitiative: (entries: PlayerInitiativeEntry[]) =>
    ipcRenderer.send('player:initiative', entries),
  sendWeather: (type: WeatherType) =>
    ipcRenderer.send('player:weather', type),
  sendMeasure: (measure: PlayerMeasureState | null) =>
    ipcRenderer.send('player:measure', measure),
  sendDrawing: (drawing: unknown) =>
    ipcRenderer.send('player:drawing', drawing),
  sendWalls: (walls: PlayerWallState[]) =>
    ipcRenderer.send('player:walls', walls),

  // DB operations
  dbQuery: <T>(sql: string, params?: unknown[]): Promise<T[]> =>
    ipcRenderer.invoke('db:query', sql, params),
  dbRun: (sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }> =>
    ipcRenderer.invoke('db:run', sql, params),
  dbRunBatch: (statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> =>
    ipcRenderer.invoke('db:run-batch', statements),

  // Listen for main → DM: player window was closed
  onPlayerWindowClosed: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('dm:player-window-closed', handler)
    return () => { ipcRenderer.removeListener('dm:player-window-closed', handler) }
  },

  // Listen for main → DM: player window requested a full state sync
  onRequestFullSync: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('dm:request-full-sync', handler)
    return () => ipcRenderer.removeListener('dm:request-full-sync', handler)
  },

  // Compendium (SRD + user-supplied PDFs)
  listCompendium: (): Promise<CompendiumFile[]> =>
    ipcRenderer.invoke(IPC.COMPENDIUM_LIST),
  readCompendiumPdf: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.COMPENDIUM_READ, filePath),
  importCompendiumPdf: (): Promise<{ success: true; path: string; name: string } | { success: false; error: string }> =>
    ipcRenderer.invoke(IPC.COMPENDIUM_IMPORT),
  openCompendiumFolder: (): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPENDIUM_OPEN_FOLDER),

  // Token variants (artwork per creature slug)
  listTokenVariants: (slug: string): Promise<TokenVariant[]> =>
    ipcRenderer.invoke(IPC.TOKEN_VARIANTS_LIST, slug),
  importTokenVariants: (slug: string): Promise<
    | { success: true; paths: string[] }
    | { success: false; error: string }
  > => ipcRenderer.invoke(IPC.TOKEN_VARIANTS_IMPORT, slug),
  openTokenVariantsFolder: (slug?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TOKEN_VARIANTS_OPEN_FOLDER, slug),

  // Bestiarium data (SRD 5.1 monsters, items, spells)
  listMonsters: (): Promise<MonsterIndexEntry[]> =>
    ipcRenderer.invoke(IPC.DATA_LIST_MONSTERS),
  getMonster: (slug: string): Promise<(MonsterRecord & {
    tokenDefaultUrl: string | null
    userDefaultFile: string | null
  }) | null> =>
    ipcRenderer.invoke(IPC.DATA_GET_MONSTER, slug),
  getMonsterTokenUrl: (slug: string, file: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DATA_GET_MONSTER_TOKEN, slug, file),
  /** Persist or clear the DM's preferred portrait for a creature. Pass
   *  null as `file` to reset to the dataset's default. */
  setMonsterDefault: (slug: string, file: string | null): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.DATA_SET_MONSTER_DEFAULT, slug, file),
  listItems: (): Promise<ItemIndexEntry[]> =>
    ipcRenderer.invoke(IPC.DATA_LIST_ITEMS),
  getItem: (slug: string): Promise<ItemRecord | null> =>
    ipcRenderer.invoke(IPC.DATA_GET_ITEM, slug),
  listSpells: (): Promise<SpellIndexEntry[]> =>
    ipcRenderer.invoke(IPC.DATA_LIST_SPELLS),
  getSpell: (slug: string): Promise<SpellRecord | null> =>
    ipcRenderer.invoke(IPC.DATA_GET_SPELL, slug),

  // Native application menu bridge
  setMenuLanguage: (lang: 'de' | 'en') =>
    ipcRenderer.invoke(IPC.SET_MENU_LANGUAGE, lang),
  onMenuAction: (cb: (action: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: string) => cb(action)
    ipcRenderer.on(IPC.MENU_ACTION, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_ACTION, handler)
  },
}

// ─── Player Window API ────────────────────────────────────────────────────────
export const playerApi = {
  // Image loading — player window does not get electronAPI, but still needs images
  getImageAsBase64: (path: string) => ipcRenderer.invoke('app:get-image-as-base64', path),
  /** Resolve a bestiary token reference (bestiary://<slug>/<file>) to a
   *  data URL. Exposed on the player window too so broadcast tokens that
   *  reference the shipped dataset render without the DM window. */
  getMonsterTokenUrl: (slug: string, file: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DATA_GET_MONSTER_TOKEN, slug, file),

  onFullSync: (cb: (state: PlayerFullState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: PlayerFullState) => cb(state)
    ipcRenderer.on('player:full-sync', handler)
    return () => ipcRenderer.removeListener('player:full-sync', handler)
  },
  onMapUpdate: (cb: (state: PlayerMapState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: PlayerMapState) => cb(state)
    ipcRenderer.on('player:map-update', handler)
    return () => ipcRenderer.removeListener('player:map-update', handler)
  },
  onFogDelta: (cb: (delta: FogDelta) => void) => {
    const handler = (_: Electron.IpcRendererEvent, delta: FogDelta) => cb(delta)
    ipcRenderer.on('player:fog-delta', handler)
    return () => ipcRenderer.removeListener('player:fog-delta', handler)
  },
  onFogReset: (cb: (payload: { fogBitmap: string; exploredBitmap: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { fogBitmap: string; exploredBitmap: string }) => cb(payload)
    ipcRenderer.on('player:fog-reset', handler)
    return () => ipcRenderer.removeListener('player:fog-reset', handler)
  },
  onTokenUpdate: (cb: (tokens: PlayerTokenState[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, tokens: PlayerTokenState[]) => cb(tokens)
    ipcRenderer.on('player:token-update', handler)
    return () => ipcRenderer.removeListener('player:token-update', handler)
  },
  onBlackout: (cb: (active: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, active: boolean) => cb(active)
    ipcRenderer.on('player:blackout', handler)
    return () => ipcRenderer.removeListener('player:blackout', handler)
  },
  onAtmosphere: (cb: (imagePath: string | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, imagePath: string | null) => cb(imagePath)
    ipcRenderer.on('player:atmosphere', handler)
    return () => ipcRenderer.removeListener('player:atmosphere', handler)
  },
  requestFullSync: () => ipcRenderer.send('player:request-sync'),
  closeSelf: () => ipcRenderer.invoke('app:close-player-window'),
  onPointer: (cb: (pointer: PlayerPointer) => void) => {
    const handler = (_: Electron.IpcRendererEvent, pointer: PlayerPointer) => cb(pointer)
    ipcRenderer.on('player:pointer', handler)
    return () => ipcRenderer.removeListener('player:pointer', handler)
  },
  onCameraView: (cb: (camera: PlayerCamera) => void) => {
    const handler = (_: Electron.IpcRendererEvent, camera: PlayerCamera) => cb(camera)
    ipcRenderer.on('player:camera', handler)
    return () => ipcRenderer.removeListener('player:camera', handler)
  },
  onHandout: (cb: (handout: PlayerHandout | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, handout: PlayerHandout | null) => cb(handout)
    ipcRenderer.on('player:handout', handler)
    return () => ipcRenderer.removeListener('player:handout', handler)
  },
  onOverlay: (cb: (overlay: PlayerOverlay | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, overlay: PlayerOverlay | null) => cb(overlay)
    ipcRenderer.on('player:overlay', handler)
    return () => ipcRenderer.removeListener('player:overlay', handler)
  },
  onInitiative: (cb: (entries: PlayerInitiativeEntry[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, entries: PlayerInitiativeEntry[]) => cb(entries)
    ipcRenderer.on('player:initiative', handler)
    return () => ipcRenderer.removeListener('player:initiative', handler)
  },
  onWeather: (cb: (type: WeatherType) => void) => {
    const handler = (_: Electron.IpcRendererEvent, type: WeatherType) => cb(type)
    ipcRenderer.on('player:weather', handler)
    return () => ipcRenderer.removeListener('player:weather', handler)
  },
  onMeasure: (cb: (measure: PlayerMeasureState | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, measure: PlayerMeasureState | null) => cb(measure)
    ipcRenderer.on('player:measure', handler)
    return () => ipcRenderer.removeListener('player:measure', handler)
  },
  onDrawing: (cb: (drawing: PlayerDrawingState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, drawing: PlayerDrawingState) => cb(drawing)
    ipcRenderer.on('player:drawing', handler)
    return () => ipcRenderer.removeListener('player:drawing', handler)
  },
  onWalls: (cb: (walls: PlayerWallState[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, walls: PlayerWallState[]) => cb(walls)
    ipcRenderer.on('player:walls', handler)
    return () => ipcRenderer.removeListener('player:walls', handler)
  },
}


// Compatibility shim: the main process no longer targets this file as a
// preload — it uses preload-dm.ts / preload-player.ts instead, which import
// `dmApi` / `playerApi` from here and expose only their relevant surface.
// We intentionally do NOT call `contextBridge.exposeInMainWorld` from this
// file anymore so that importing it is a pure, side-effect-free operation.

// Type declarations for renderer TypeScript
export type ElectronAPI = typeof dmApi
export type PlayerAPI = typeof playerApi
