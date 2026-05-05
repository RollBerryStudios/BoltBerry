import { contextBridge, ipcRenderer } from 'electron'

export type ChannelId = 'track1' | 'track2' | 'combat'

export interface BardTrack {
  id: string
  path: string
  fileName: string
  collection: string | null
  assignments: ChannelId[]
  createdAt: string
}

export interface BardBoardSlot {
  slotNumber: number
  emoji: string
  title: string
  audioPath: string | null
  iconPath: string | null
  volume: number
  isLoop: boolean
}

export interface BardBoard {
  id: string
  name: string
  sortOrder: number
  slots: BardBoardSlot[]
}

export interface BardLibrary {
  version: 1
  tracks: BardTrack[]
  boards: BardBoard[]
  activeBoardId: string | null
  masterVolume: number
  sfxVolume: number
  channelVolumes: Record<ChannelId, number>
}

export interface BardBerryAPI {
  loadLibrary: () => Promise<BardLibrary>
  saveLibrary: (library: BardLibrary) => Promise<boolean>
  importAudioFiles: () => Promise<BardTrack[]>
  importAudioFolder: () => Promise<{ folderName: string; tracks: BardTrack[] } | null>
  importIcon: () => Promise<string | null>
  exportLibrary: (library: BardLibrary) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>
  importLibrary: () => Promise<BardLibrary | null>
  revealData: () => Promise<string>
  confirm: (message: string, detail?: string) => Promise<boolean>
}

const api: BardBerryAPI = {
  loadLibrary: () => ipcRenderer.invoke('bardberry:library-load'),
  saveLibrary: (library) => ipcRenderer.invoke('bardberry:library-save', library),
  importAudioFiles: () => ipcRenderer.invoke('bardberry:import-audio-files'),
  importAudioFolder: () => ipcRenderer.invoke('bardberry:import-audio-folder'),
  importIcon: () => ipcRenderer.invoke('bardberry:import-icon'),
  exportLibrary: (library) => ipcRenderer.invoke('bardberry:export-library', library),
  importLibrary: () => ipcRenderer.invoke('bardberry:import-library'),
  revealData: () => ipcRenderer.invoke('bardberry:reveal-data'),
  confirm: (message, detail) => ipcRenderer.invoke('bardberry:confirm', message, detail),
}

contextBridge.exposeInMainWorld('bardberry', api)
