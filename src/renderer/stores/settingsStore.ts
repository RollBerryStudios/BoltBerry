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
  /** DM display name; shown in Welcome greetings + future Anwesenheit-Pins. */
  displayName: string
  /** HSL hue (0–360) for the avatar tile; deterministic fallback: hashed name. */
  avatarHue: number | null
  setUserDataFolder: (folder: string) => void
  setIsSetupComplete: (complete: boolean) => void
  setDisplayName: (name: string) => void
  setAvatarHue: (hue: number | null) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  userDataFolder: readLocal('boltberry-data-folder') ?? '',
  isSetupComplete: readLocal('boltberry-setup-complete') === '1',
  displayName: readLocal('boltberry-display-name') ?? '',
  avatarHue: (() => {
    const raw = readLocal('boltberry-avatar-hue')
    if (raw === null) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  })(),

  setUserDataFolder: (folder) => {
    writeLocal('boltberry-data-folder', folder)
    set({ userDataFolder: folder })
  },
  setIsSetupComplete: (complete) => {
    if (complete) writeLocal('boltberry-setup-complete', '1')
    else removeLocal('boltberry-setup-complete')
    set({ isSetupComplete: complete })
  },
  setDisplayName: (name) => {
    const trimmed = name.trim().slice(0, 40)
    if (trimmed) writeLocal('boltberry-display-name', trimmed)
    else removeLocal('boltberry-display-name')
    set({ displayName: trimmed })
  },
  setAvatarHue: (hue) => {
    if (hue === null) removeLocal('boltberry-avatar-hue')
    else writeLocal('boltberry-avatar-hue', String(hue))
    set({ avatarHue: hue })
  },
}))