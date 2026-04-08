import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-types'
import { getPlayerWindow, getDMWindow } from '../windows'
import type {
  PlayerMapState,
  PlayerTokenState,
  FogDelta,
  PlayerFullState,
  PlayerPointer,
  PlayerCamera,
  PlayerHandout,
  PlayerOverlay,
  PlayerInitiativeEntry,
  PlayerMeasureState,
  WeatherType,
} from '../../shared/ipc-types'

/**
 * Registers IPC handlers that relay DM → Player updates.
 * The DM renderer sends these via ipcRenderer.send();
 * main process forwards them to the player window.
 */
export function registerPlayerBridgeHandlers(): void {
  // Full state sync (on player window open / reconnect)
  ipcMain.on(IPC.PLAYER_FULL_SYNC, (_event, state: PlayerFullState) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_FULL_SYNC, state)
  })

  ipcMain.on('player:request-sync', () => {
    // Ask DM to broadcast its current full state
    getDMWindow()?.webContents.send('dm:request-full-sync')
  })

  // Map update
  ipcMain.on(IPC.PLAYER_MAP_UPDATE, (_event, state: PlayerMapState) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_MAP_UPDATE, state)
  })

  // Fog delta (only changed regions → low bandwidth)
  ipcMain.on(IPC.PLAYER_FOG_DELTA, (_event, delta: FogDelta) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_FOG_DELTA, delta)
  })

  // Token update (only player-visible tokens)
  ipcMain.on(IPC.PLAYER_TOKEN_UPDATE, (_event, tokens: PlayerTokenState[]) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_TOKEN_UPDATE, tokens)
  })

  // Blackout toggle
  ipcMain.on(IPC.PLAYER_BLACKOUT, (_event, active: boolean) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_BLACKOUT, active)
  })

  // Atmosphere image
  ipcMain.on(IPC.PLAYER_ATMOSPHERE, (_event, imagePath: string | null) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_ATMOSPHERE, imagePath)
  })

  // Pointer ping
  ipcMain.on(IPC.PLAYER_POINTER, (_event, pointer: PlayerPointer) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_POINTER, pointer)
  })

  // Camera viewport sync
  ipcMain.on(IPC.PLAYER_CAMERA, (_event, camera: PlayerCamera) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_CAMERA, camera)
  })

  // Handout display
  ipcMain.on(IPC.PLAYER_HANDOUT, (_event, handout: PlayerHandout | null) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_HANDOUT, handout)
  })

  // Presentation overlay
  ipcMain.on(IPC.PLAYER_OVERLAY, (_event, overlay: PlayerOverlay | null) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_OVERLAY, overlay)
  })

  // Initiative list sync
  ipcMain.on(IPC.PLAYER_INITIATIVE, (_event, entries: PlayerInitiativeEntry[]) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_INITIATIVE, entries)
  })

  // Weather overlay
  ipcMain.on(IPC.PLAYER_WEATHER, (_event, type: WeatherType) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_WEATHER, type)
  })

  // Measurement overlay
  ipcMain.on(IPC.PLAYER_MEASURE, (_event, measure: PlayerMeasureState | null) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_MEASURE, measure)
  })

  // Drawing data
  ipcMain.on(IPC.PLAYER_DRAWING, (_event, drawing: unknown) => {
    getPlayerWindow()?.webContents.send(IPC.PLAYER_DRAWING, drawing)
  })
}
