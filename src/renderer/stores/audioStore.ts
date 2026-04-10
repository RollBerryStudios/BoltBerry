import { create } from 'zustand'

let audioInstance: HTMLAudioElement | null = null

interface PlaylistEntry {
  path: string
  name: string
}

interface AudioState {
  filePath: string | null
  fileName: string | null
  isPlaying: boolean
  volume: number
  loop: boolean
  currentTime: number
  duration: number
  playlist: PlaylistEntry[]
  playlistIndex: number

  loadFile: (path: string) => void
  play: () => void
  pause: () => void
  stop: () => void
  setVolume: (v: number) => void
  toggleLoop: () => void
  addToPlaylist: (path: string) => void
  removeFromPlaylist: (index: number) => void
  clearPlaylist: () => void
  playNext: () => void
  playPrev: () => void
  seekTo: (time: number) => void
}

export const useAudioStore = create<AudioState>((set, get) => ({
  filePath: null,
  fileName: null,
  isPlaying: false,
  volume: 0.7,
  loop: true,
  currentTime: 0,
  duration: 0,
  playlist: [],
  playlistIndex: -1,

  loadFile: (path: string) => {
    if (audioInstance) {
      audioInstance.pause()
      audioInstance.removeAttribute('src')
      audioInstance.load()
      audioInstance = null
    }
    const relativePath = path.startsWith('/') ? path.substring(1) : path
    const url = `local-asset://${relativePath}`
    audioInstance = new Audio(url)
    audioInstance.loop = get().loop
    audioInstance.volume = get().volume
    audioInstance.ontimeupdate = () => {
      set({ currentTime: audioInstance?.currentTime ?? 0 })
    }
    audioInstance.onloadedmetadata = () => {
      set({ duration: audioInstance?.duration ?? 0 })
    }
    audioInstance.onended = () => {
      if (get().loop) return
      const { playlist, playlistIndex } = get()
      if (playlistIndex < playlist.length - 1) {
        get().playNext()
      } else {
        set({ isPlaying: false })
      }
    }
    const fileName = path.split(/[\\/]/).pop() ?? path
    set({ filePath: path, fileName, isPlaying: false, currentTime: 0, duration: 0 })
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
    set({ isPlaying: false, currentTime: 0 })
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

  addToPlaylist: (path: string) => {
    const name = path.split(/[\\/]/).pop() ?? path
    const playlist = [...get().playlist, { path, name }]
    set({ playlist })
  },

  removeFromPlaylist: (index: number) => {
    const { playlist, playlistIndex } = get()
    const newPlaylist = playlist.filter((_, i) => i !== index)
    let newIndex: number
    if (index === playlistIndex) {
      newIndex = -1 // removed the currently selected track
    } else if (index < playlistIndex) {
      newIndex = playlistIndex - 1
    } else {
      newIndex = playlistIndex
    }
    set({ playlist: newPlaylist, playlistIndex: newIndex })
  },

  clearPlaylist: () => {
    set({ playlist: [], playlistIndex: -1 })
  },

  playNext: () => {
    const { playlist, playlistIndex } = get()
    const next = playlistIndex + 1
    if (next < playlist.length) {
      set({ playlistIndex: next })
      get().loadFile(playlist[next].path)
      get().play()
    }
  },

  playPrev: () => {
    const { playlist, playlistIndex } = get()
    const prev = playlistIndex - 1
    if (prev >= 0) {
      set({ playlistIndex: prev })
      get().loadFile(playlist[prev].path)
      get().play()
    }
  },

  seekTo: (time: number) => {
    if (audioInstance) {
      audioInstance.currentTime = time
      set({ currentTime: time })
    }
  },
}))
