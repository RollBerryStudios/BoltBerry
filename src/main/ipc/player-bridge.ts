import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import { getPlayerWindow, getDMWindow } from '../windows'
import type {
  PlayerMapState,
  PlayerTokenState,
  PlayerTokenDelta,
  FogDelta,
  PlayerFullState,
  PlayerPointer,
  PlayerViewport,
  PlayerHandout,
  PlayerOverlay,
  PlayerInitiativeEntry,
  PlayerMeasureState,
  WeatherType,
  PlayerWallState,
} from '../../shared/ipc-types'

let registered = false

/**
 * Validates that a DM-originated message actually comes from the DM window.
 * Returns false (and the handler should return early) if the sender is unexpected.
 */
function isFromDM(event: Electron.IpcMainEvent): boolean {
  const dmContents = getDMWindow()?.webContents
  return !!dmContents && event.sender === dmContents
}

/**
 * Validates that a Player-originated message actually comes from the Player window.
 */
function isFromPlayer(event: Electron.IpcMainEvent): boolean {
  const playerContents = getPlayerWindow()?.webContents
  return !!playerContents && event.sender === playerContents
}

/**
 * Guarded send helper. The window reference may be stale or the
 * underlying webContents may already be destroyed (renderer crashed,
 * window being torn down, user closed mid-broadcast). Calling `.send`
 * in those states throws and kills the currently-handled IPC event.
 */
function safeSendToPlayer(channel: string, payload: unknown): void {
  const win = getPlayerWindow()
  if (!win || win.isDestroyed()) return
  const wc = win.webContents
  if (!wc || wc.isDestroyed()) return
  try {
    wc.send(channel, payload)
  } catch (err) {
    console.warn(`[player-bridge] safeSendToPlayer(${channel}) failed:`, err)
  }
}

function safeSendToDM(channel: string, payload?: unknown): void {
  const win = getDMWindow()
  if (!win || win.isDestroyed()) return
  const wc = win.webContents
  if (!wc || wc.isDestroyed()) return
  try {
    wc.send(channel, payload)
  } catch (err) {
    console.warn(`[player-bridge] safeSendToDM(${channel}) failed:`, err)
  }
}

/**
 * Registers IPC handlers that relay DM -> Player updates.
 * The DM renderer sends these via ipcRenderer.send();
 * main process forwards them to the player window.
 *
 * Idempotent: safe to call multiple times — `ipcMain.on` would otherwise
 * stack duplicate listeners each time, causing duplicate broadcasts.
 */
export function registerPlayerBridgeHandlers(): void {
  if (registered) return
  registered = true

  // Full state sync (on player window open / reconnect) — DM -> Player
  ipcMain.on(IPC.PLAYER_FULL_SYNC, (event, state: PlayerFullState) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_FULL_SYNC, state)
  })

  // Player -> DM: request sync
  ipcMain.on(IPC.PLAYER_REQUEST_SYNC, (event) => {
    if (!isFromPlayer(event)) return
    // Ask DM to broadcast its current full state
    safeSendToDM(IPC.DM_REQUEST_FULL_SYNC)
  })

  // Map update — DM -> Player
  ipcMain.on(IPC.PLAYER_MAP_UPDATE, (event, state: PlayerMapState) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_MAP_UPDATE, state)
  })

  // Fog delta (only changed regions -> low bandwidth) — DM -> Player
  ipcMain.on(IPC.PLAYER_FOG_DELTA, (event, delta: FogDelta) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_FOG_DELTA, delta)
  })

  // Fog full reset (after undo — sends both bitmaps) — DM -> Player
  ipcMain.on(IPC.PLAYER_FOG_RESET, (event, payload: { fogBitmap: string; exploredBitmap: string }) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_FOG_RESET, payload)
  })

  // Token update (only player-visible tokens) — DM -> Player
  ipcMain.on(IPC.PLAYER_TOKEN_UPDATE, (event, tokens: PlayerTokenState[]) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_TOKEN_UPDATE, tokens)
  })

  // Per-token delta (replaces the "full roster on every mutation" pattern)
  // — DM -> Player. Snapshot path above is still used for full-sync /
  // resync handshakes.
  ipcMain.on(IPC.PLAYER_TOKEN_DELTA, (event, delta: PlayerTokenDelta) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_TOKEN_DELTA, delta)
  })

  // Blackout toggle — DM -> Player
  ipcMain.on(IPC.PLAYER_BLACKOUT, (event, active: boolean) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_BLACKOUT, active)
  })

  // Atmosphere image — DM -> Player
  ipcMain.on(IPC.PLAYER_ATMOSPHERE, (event, imagePath: string | null) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_ATMOSPHERE, imagePath)
  })

  // Pointer ping — DM -> Player
  ipcMain.on(IPC.PLAYER_POINTER, (event, pointer: PlayerPointer) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_POINTER, pointer)
  })

  // Player Control Mode viewport — DM -> Player. Nullable payload
  // lets the DM exit the mode without inventing a magic value.
  ipcMain.on(IPC.PLAYER_VIEWPORT, (event, viewport: PlayerViewport | null) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_VIEWPORT, viewport)
  })

  // Handout display — DM -> Player
  ipcMain.on(IPC.PLAYER_HANDOUT, (event, handout: PlayerHandout | null) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_HANDOUT, handout)
  })

  // Presentation overlay — DM -> Player
  ipcMain.on(IPC.PLAYER_OVERLAY, (event, overlay: PlayerOverlay | null) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_OVERLAY, overlay)
  })

  // Initiative list sync — DM -> Player
  ipcMain.on(IPC.PLAYER_INITIATIVE, (event, entries: PlayerInitiativeEntry[]) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_INITIATIVE, entries)
  })

  // Weather overlay — DM -> Player
  ipcMain.on(IPC.PLAYER_WEATHER, (event, type: WeatherType) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_WEATHER, type)
  })

  // Measurement overlay — DM -> Player
  ipcMain.on(IPC.PLAYER_MEASURE, (event, measure: PlayerMeasureState | null) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_MEASURE, measure)
  })

  // Drawing data — DM -> Player
  ipcMain.on(IPC.PLAYER_DRAWING, (event, drawing: unknown) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_DRAWING, drawing)
  })

  // Wall list for LOS — DM -> Player
  ipcMain.on(IPC.PLAYER_WALLS, (event, walls: PlayerWallState[]) => {
    if (!isFromDM(event)) return
    safeSendToPlayer(IPC.PLAYER_WALLS, walls)
  })
}
