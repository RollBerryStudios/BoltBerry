import { create } from 'zustand'
import type { BardBoard, BardBoardSlot, BardTrack, ChannelId } from '../preload/preload'

const FADE_MS = 300
const SFX_POOL_SIZE = 16
const DUCK_RESTORE_MS = 150

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function pathToUrl(path: string): string {
  const rel = path.startsWith('/') ? path.slice(1) : path
  return `local-asset://${rel}`
}

function fadeTo(el: HTMLAudioElement, target: number, onDone?: () => void): () => void {
  const start = el.volume
  const startTime = performance.now()
  let rafId = 0
  let cancelled = false
  function tick(now: number) {
    if (cancelled) return
    const t = Math.min((now - startTime) / FADE_MS, 1)
    el.volume = Math.max(0, Math.min(1, start + (target - start) * easeInOut(t)))
    if (t < 1) rafId = requestAnimationFrame(tick)
    else {
      el.volume = target
      onDone?.()
    }
  }
  rafId = requestAnimationFrame(tick)
  return () => { cancelled = true; cancelAnimationFrame(rafId) }
}

export interface ChannelState {
  filePath: string | null
  fileName: string | null
  volume: number
  playing: boolean
  loop: boolean
  currentTime: number
  duration: number
  playlist: BardTrack[]
}

interface FrozenChannel {
  currentTime: number
  volume: number
  wasPlaying: boolean
}

interface AudioState {
  track1: ChannelState
  track2: ChannelState
  combat: ChannelState
  masterVolume: number
  sfxVolume: number
  combatActive: boolean
  boards: BardBoard[]
  activeBoardId: string | null
  loadChannel: (ch: ChannelId, track: BardTrack) => void
  playChannel: (ch: ChannelId) => void
  stopChannel: (ch: ChannelId) => void
  seekChannel: (ch: ChannelId, time: number) => void
  setChannelVolume: (ch: ChannelId, volume: number) => void
  setMasterVolume: (volume: number) => void
  setSfxVolume: (volume: number) => void
  toggleLoop: (ch: ChannelId) => void
  activateCombat: () => void
  deactivateCombat: () => void
  triggerSfx: (slot: BardBoardSlot) => void
  setPlaylists: (tracks: BardTrack[]) => void
  setBoards: (boards: BardBoard[], activeBoardId: string | null) => void
}

function defaultChannel(volume: number): ChannelState {
  return { filePath: null, fileName: null, volume, playing: false, loop: true, currentTime: 0, duration: 0, playlist: [] }
}

class BardAudioEngine {
  readonly channels: Record<ChannelId, HTMLAudioElement>
  private readonly sfxPool: HTMLAudioElement[]
  private sfxPoolIndex = 0
  private duckCount = 0
  private duckRestoreTimer: ReturnType<typeof setTimeout> | null = null
  private frozenTrack1: FrozenChannel | null = null
  private frozenTrack2: FrozenChannel | null = null
  private readonly activeFades: Partial<Record<ChannelId, () => void>> = {}

  constructor() {
    this.channels = { track1: new Audio(), track2: new Audio(), combat: new Audio() }
    this.channels.track1.loop = true
    this.channels.track2.loop = true
    this.channels.combat.loop = true
    this.sfxPool = Array.from({ length: SFX_POOL_SIZE }, () => new Audio())
  }

  wire(onTime: (ch: ChannelId, t: number) => void, onDuration: (ch: ChannelId, d: number) => void, onEnded: (ch: ChannelId) => void): void {
    for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
      let lastUpdate = 0
      const el = this.channels[ch]
      el.ontimeupdate = () => {
        const now = Date.now()
        if (now - lastUpdate < 400) return
        lastUpdate = now
        onTime(ch, el.currentTime)
      }
      el.onloadedmetadata = () => onDuration(ch, el.duration)
      el.onended = () => onEnded(ch)
    }
  }

  private effective(userVol: number, master: number): number {
    return userVol * master * (this.duckCount > 0 ? 0.5 : 1)
  }

  load(ch: ChannelId, path: string): void {
    const el = this.channels[ch]
    this.activeFades[ch]?.()
    el.pause()
    el.src = pathToUrl(path)
    el.load()
    el.volume = 0
  }

  play(ch: ChannelId, userVol: number, master: number): void {
    const el = this.channels[ch]
    if (!el.src || el.src === window.location.href) return
    el.play().catch(() => {})
    this.activeFades[ch]?.()
    this.activeFades[ch] = fadeTo(el, this.effective(userVol, master))
  }

  stop(ch: ChannelId): void {
    const el = this.channels[ch]
    this.activeFades[ch]?.()
    this.activeFades[ch] = fadeTo(el, 0, () => {
      el.pause()
      el.currentTime = 0
    })
  }

  seek(ch: ChannelId, time: number): void {
    this.channels[ch].currentTime = time
  }

  setLoop(ch: ChannelId, loop: boolean): void {
    this.channels[ch].loop = loop
  }

  applyChannelVolume(ch: ChannelId, userVol: number, master: number): void {
    this.channels[ch].volume = this.effective(userVol, master)
  }

  applyMaster(volumes: Record<ChannelId, number>, master: number, sfxVolume: number): void {
    for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
      this.channels[ch].volume = this.effective(volumes[ch], master)
    }
    for (const el of this.sfxPool) el.volume = Math.max(0, Math.min(1, sfxVolume * master))
  }

  activate(state: { track1: ChannelState; track2: ChannelState; combat: ChannelState; masterVolume: number }): boolean {
    this.frozenTrack1 = { currentTime: this.channels.track1.currentTime, volume: state.track1.volume, wasPlaying: state.track1.playing }
    this.frozenTrack2 = { currentTime: this.channels.track2.currentTime, volume: state.track2.volume, wasPlaying: state.track2.playing }
    this.activeFades.track1?.()
    this.activeFades.track1 = fadeTo(this.channels.track1, 0, () => this.channels.track1.pause())
    this.activeFades.track2?.()
    this.activeFades.track2 = fadeTo(this.channels.track2, 0, () => this.channels.track2.pause())
    if (!state.combat.filePath) return false
    this.channels.combat.volume = 0
    this.channels.combat.play().catch(() => {})
    this.activeFades.combat?.()
    this.activeFades.combat = fadeTo(this.channels.combat, this.effective(state.combat.volume, state.masterVolume))
    return true
  }

  deactivate(master: number): { track1: boolean; track2: boolean } {
    this.activeFades.combat?.()
    this.activeFades.combat = fadeTo(this.channels.combat, 0, () => {
      this.channels.combat.pause()
      this.channels.combat.currentTime = 0
    })
    const restored = { track1: this.restore('track1', this.frozenTrack1, master), track2: this.restore('track2', this.frozenTrack2, master) }
    this.frozenTrack1 = null
    this.frozenTrack2 = null
    return restored
  }

  private restore(ch: 'track1' | 'track2', frozen: FrozenChannel | null, master: number): boolean {
    if (!frozen) return false
    const el = this.channels[ch]
    el.currentTime = frozen.currentTime
    if (!frozen.wasPlaying) return false
    el.play().catch(() => {})
    this.activeFades[ch]?.()
    this.activeFades[ch] = fadeTo(el, this.effective(frozen.volume, master))
    return true
  }

  triggerSfx(path: string, slotVolume: number, loop: boolean, sfxVolume: number, master: number, channelVolumes: Record<ChannelId, number>): void {
    const el = this.sfxPool[this.sfxPoolIndex % SFX_POOL_SIZE]
    this.sfxPoolIndex = (this.sfxPoolIndex + 1) % SFX_POOL_SIZE
    el.pause()
    el.src = pathToUrl(path)
    el.loop = loop
    el.volume = Math.max(0, Math.min(1, sfxVolume * master * slotVolume))
    this.startDuck(channelVolumes, master)
    el.onended = () => this.endDuck(channelVolumes, master)
    el.onerror = () => this.endDuck(channelVolumes, master)
    el.onpause = loop ? () => this.endDuck(channelVolumes, master) : null
    el.play().catch(() => this.endDuck(channelVolumes, master))
  }

  private startDuck(channelVolumes: Record<ChannelId, number>, master: number): void {
    if (this.duckRestoreTimer) clearTimeout(this.duckRestoreTimer)
    this.duckRestoreTimer = null
    this.duckCount++
    for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
      this.activeFades[ch]?.()
      this.activeFades[ch] = fadeTo(this.channels[ch], channelVolumes[ch] * master * 0.5)
    }
  }

  private endDuck(channelVolumes: Record<ChannelId, number>, master: number): void {
    this.duckCount = Math.max(0, this.duckCount - 1)
    if (this.duckCount > 0) return
    if (this.duckRestoreTimer) clearTimeout(this.duckRestoreTimer)
    this.duckRestoreTimer = setTimeout(() => {
      if (this.duckCount > 0) return
      for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
        this.activeFades[ch]?.()
        this.activeFades[ch] = fadeTo(this.channels[ch], channelVolumes[ch] * master)
      }
    }, DUCK_RESTORE_MS)
  }
}

const engine = new BardAudioEngine()

function volumes(get: () => AudioState): Record<ChannelId, number> {
  const s = get()
  return { track1: s.track1.volume, track2: s.track2.volume, combat: s.combat.volume }
}

export const useBardAudio = create<AudioState>((set, get) => {
  engine.wire(
    (ch, currentTime) => set((s) => ({ [ch]: { ...s[ch], currentTime } }) as Partial<AudioState>),
    (ch, duration) => set((s) => ({ [ch]: { ...s[ch], duration } }) as Partial<AudioState>),
    (ch) => set((s) => ({ [ch]: { ...s[ch], playing: false } }) as Partial<AudioState>),
  )

  return {
    track1: defaultChannel(1),
    track2: defaultChannel(0.85),
    combat: defaultChannel(1),
    masterVolume: 1,
    sfxVolume: 0.8,
    combatActive: false,
    boards: [],
    activeBoardId: null,

    loadChannel: (ch, track) => {
      engine.load(ch, track.path)
      set((s) => ({ [ch]: { ...s[ch], filePath: track.path, fileName: track.fileName, playing: false, currentTime: 0, duration: 0 } }) as Partial<AudioState>)
    },
    playChannel: (ch) => {
      const s = get()
      if (s.combatActive && ch !== 'combat') return
      engine.play(ch, s[ch].volume, s.masterVolume)
      set((state) => ({ [ch]: { ...state[ch], playing: true } }) as Partial<AudioState>)
    },
    stopChannel: (ch) => {
      engine.stop(ch)
      set((s) => ({ [ch]: { ...s[ch], playing: false, currentTime: 0 } }) as Partial<AudioState>)
    },
    seekChannel: (ch, time) => {
      engine.seek(ch, time)
      set((s) => ({ [ch]: { ...s[ch], currentTime: time } }) as Partial<AudioState>)
    },
    setChannelVolume: (ch, volume) => {
      set((s) => ({ [ch]: { ...s[ch], volume } }) as Partial<AudioState>)
      engine.applyChannelVolume(ch, volume, get().masterVolume)
    },
    setMasterVolume: (masterVolume) => {
      set({ masterVolume })
      engine.applyMaster(volumes(get), masterVolume, get().sfxVolume)
    },
    setSfxVolume: (sfxVolume) => {
      set({ sfxVolume })
      engine.applyMaster(volumes(get), get().masterVolume, sfxVolume)
    },
    toggleLoop: (ch) => {
      const next = !engine.channels[ch].loop
      engine.setLoop(ch, next)
      set((s) => ({ [ch]: { ...s[ch], loop: next } }) as Partial<AudioState>)
    },
    activateCombat: () => {
      const s = get()
      const combatPlaying = engine.activate(s)
      set((state) => ({
        combatActive: true,
        track1: { ...state.track1, playing: false },
        track2: { ...state.track2, playing: false },
        combat: { ...state.combat, playing: combatPlaying || state.combat.playing },
      }))
    },
    deactivateCombat: () => {
      const restored = engine.deactivate(get().masterVolume)
      set((s) => ({
        combatActive: false,
        combat: { ...s.combat, playing: false },
        track1: { ...s.track1, playing: restored.track1 },
        track2: { ...s.track2, playing: restored.track2 },
      }))
    },
    triggerSfx: (slot) => {
      if (!slot.audioPath) return
      const s = get()
      engine.triggerSfx(slot.audioPath, slot.volume ?? 1, slot.isLoop ?? false, s.sfxVolume, s.masterVolume, volumes(get))
    },
    setPlaylists: (tracks) => {
      const byChannel: Record<ChannelId, BardTrack[]> = { track1: [], track2: [], combat: [] }
      for (const track of tracks) {
        for (const ch of track.assignments) byChannel[ch].push(track)
      }
      set((s) => ({
        track1: { ...s.track1, playlist: byChannel.track1 },
        track2: { ...s.track2, playlist: byChannel.track2 },
        combat: { ...s.combat, playlist: byChannel.combat },
      }))
    },
    setBoards: (boards, activeBoardId) => set({ boards, activeBoardId }),
  }
})
