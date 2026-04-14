/// <reference types="vite/client" />
import type { ElectronAPI, PlayerAPI } from '../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
    playerAPI: PlayerAPI
  }
}

// Static asset imports (Vite handles these at build time)
declare module '*.png' { const url: string; export default url }
declare module '*.jpg' { const url: string; export default url }
declare module '*.svg' { const url: string; export default url }
declare module '*.webp' { const url: string; export default url }
