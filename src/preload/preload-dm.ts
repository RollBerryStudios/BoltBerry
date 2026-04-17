import { contextBridge } from 'electron'
import { dmApi } from './index'

// Exposes only the DM surface. Used as the preload for the DM BrowserWindow.
contextBridge.exposeInMainWorld('electronAPI', dmApi)
