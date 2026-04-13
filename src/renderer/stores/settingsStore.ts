import { create } from 'zustand'

interface SettingsState {
  userDataFolder: string
  isSetupComplete: boolean
  setUserDataFolder: (folder: string) => void
  setIsSetupComplete: (complete: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  userDataFolder: localStorage.getItem('boltberry-data-folder') ?? '',
  isSetupComplete: localStorage.getItem('boltberry-setup-complete') === '1',

  setUserDataFolder: (folder) => {
    localStorage.setItem('boltberry-data-folder', folder)
    set({ userDataFolder: folder })
  },
  setIsSetupComplete: (complete) => {
    if (complete) localStorage.setItem('boltberry-setup-complete', '1')
    else localStorage.removeItem('boltberry-setup-complete')
    set({ isSetupComplete: complete })
  },
}))