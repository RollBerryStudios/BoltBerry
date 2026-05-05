/// <reference types="vite/client" />
import type { BardBerryAPI } from '../preload/preload'

declare global {
  interface Window {
    bardberry: BardBerryAPI
  }
}

declare module '*.svg' { const url: string; export default url }
