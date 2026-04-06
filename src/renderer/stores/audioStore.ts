import { create } from 'zustand'

// Module-level Audio instance — not serializable, lives outside store state
let audioInstance: HTMLAudioElement | null = null

interface AudioState {
  filePath: string | null
  fileName: string | null
  isPlaying: boolean
  volume: number
  loop: boolean

  loadFile: (path: string) => void
  play: () => void
  pause: () => void
  stop: () => void
  setVolume: (v: number) => void
  toggleLoop: () => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  filePath: null,
  fileName: null,
  isPlaying: false,
  volume: 0.7,
  loop: true,

  loadFile: (path: string) => {
    if (audioInstance) {
      audioInstance.pause()
      audioInstance = null
    }
    audioInstance = new Audio(`file://${path}`)
    audioInstance.loop = get().loop
    audioInstance.volume = get().volume
    audioInstance.onended = () => {
      if (!get().loop) set({ isPlaying: false })
    }
    const fileName = path.split(/[\\/]/).pop() ?? path
    set({ filePath: path, fileName, isPlaying: false })
  },

  play: () => {
    if (!audioInstance) return
    audioInstance.play().catch(() => {})
    set({ isPlaying: true })
  },

  pause: () => {
    if (!audioInstance) return
    audioInstance.pause()
    set({ isPlaying: false })
  },

  stop: () => {
    if (!audioInstance) return
    audioInstance.pause()
    audioInstance.currentTime = 0
    set({ isPlaying: false })
  },

  setVolume: (volume: number) => {
    if (audioInstance) audioInstance.volume = volume
    set({ volume })
  },

  toggleLoop: () => {
    const loop = !get().loop
    if (audioInstance) audioInstance.loop = loop
    set({ loop })
  },
}))
