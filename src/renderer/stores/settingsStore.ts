import { create } from 'zustand'

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch {}
}
function removeLocal(key: string): void {
  try { localStorage.removeItem(key) } catch {}
}

interface SettingsState {
  userDataFolder: string
  isSetupComplete: boolean
  setUserDataFolder: (folder: string) => void
  setIsSetupComplete: (complete: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  userDataFolder: readLocal('boltberry-data-folder') ?? '',
  isSetupComplete: readLocal('boltberry-setup-complete') === '1',

  setUserDataFolder: (folder) => {
    writeLocal('boltberry-data-folder', folder)
    set({ userDataFolder: folder })
  },
  setIsSetupComplete: (complete) => {
    if (complete) writeLocal('boltberry-setup-complete', '1')
    else removeLocal('boltberry-setup-complete')
    set({ isSetupComplete: complete })
  },
}))