import { create } from 'zustand'

interface SettingsState {
  userDataFolder: string
  isSetupComplete: boolean
  setUserDataFolder: (folder: string) => void
  setIsSetupComplete: (complete: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  userDataFolder: '', // Will be set during app initialization
  isSetupComplete: false,
  
  setUserDataFolder: (folder) => set({ userDataFolder: folder }),
  setIsSetupComplete: (complete) => set({ isSetupComplete: complete }),
}))