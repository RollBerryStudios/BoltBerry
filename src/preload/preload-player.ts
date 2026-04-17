import { contextBridge } from 'electron'
import { playerApi } from './index'

// Exposes only the player surface. Used as the preload for the Player BrowserWindow.
contextBridge.exposeInMainWorld('playerAPI', playerApi)
