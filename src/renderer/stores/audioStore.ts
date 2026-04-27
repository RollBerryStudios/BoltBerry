/**
 * audioStore.ts — Three-channel audio engine with SFX pool
 *
 * Channels
 *  track1   — primary background loop
 *  track2   — ambient layer (can run simultaneously with track1)
 *  combat   — override channel; activating freezes track1+track2 and fades
 *             them out; deactivating restores them to the exact timestamp
 *
 * SFX pool  — 10 round-robin one-shot HTMLAudioElements
 * Ducking   — while any SFX is active all music drops to 50 %; restores
 *             after a 150 ms grace period once all SFX have finished
 * Fading    — all play/stop events use a 300 ms ease-in/out rAF fade;
 *             fade duration is fixed and not user-configurable
 */

import { create } from 'zustand'
import type { AudioBoardSlot, AudioBoardRecord } from '@shared/ipc-types'

export type { AudioBoardSlot }
export type AudioBoard = AudioBoardRecord

// ─── Fade utility ─────────────────────────────────────────────────────────────

const FADE_MS = 300

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
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
    if (t < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      el.volume = target
      onDone?.()
    }
  }
  rafId = requestAnimationFrame(tick)
  return () => { cancelled = true; cancelAnimationFrame(rafId) }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChannelId = 'track1' | 'track2' | 'combat'

export interface ChannelState {
  filePath: string | null
  fileName: string | null
  volume: number        // 0–1, the user-set level (before ducking)
  playing: boolean
  loop: boolean         // mirrors HTMLAudioElement.loop so the UI can reflect it
  currentTime: number
  duration: number
  /** Pre-assigned tracks the DM can swap between via right-click on the
   *  channel strip. Persisted per campaign in `channel_playlist`. The
   *  currently-playing track's path is tracked separately via
   *  `filePath`; entries here may or may not match that path. */
  playlist: PlaylistEntry[]
}

export interface PlaylistEntry {
  id: number
  path: string
  fileName: string
}

interface FrozenChannel {
  filePath: string
  currentTime: number
  volume: number
  wasPlaying: boolean
}

interface AudioState {
  // ── Channels ──
  track1: ChannelState
  track2: ChannelState
  combat: ChannelState
  masterVolume: number
  combatActive: boolean

  // ── SFX ──
  sfxVolume: number
  activeBoardIndex: number
  boards: AudioBoard[]

  // ── Actions: channels ──
  loadChannel:       (ch: ChannelId, path: string) => void
  playChannel:       (ch: ChannelId) => void
  stopChannel:       (ch: ChannelId) => void
  setChannelVolume:  (ch: ChannelId, vol: number) => void
  seekChannel:       (ch: ChannelId, time: number) => void
  toggleLoop:        (ch: ChannelId) => void

  // ── Actions: combat ──
  activateCombat:    () => void
  deactivateCombat:  () => void

  // ── Actions: playlist (pre-assigned tracks per channel) ──
  setChannelPlaylist:  (ch: ChannelId, entries: PlaylistEntry[]) => void
  addPlaylistEntry:    (ch: ChannelId, entry: PlaylistEntry, activate?: boolean) => void
  removePlaylistEntry: (ch: ChannelId, id: number) => void
  clearAllPlaylists:   () => void

  // ── Actions: SFX ──
  /** Trigger a one-shot (or looped) sound effect. `slotVolume` and
   *  `loop` mirror the per-slot fields persisted on
   *  `audio_board_slots`; default values keep the engine compatible
   *  with old call sites (e.g. keyboard 0–9 shortcuts that don't
   *  thread slot config). */
  triggerSfx:        (audioPath: string, slotVolume?: number, loop?: boolean) => void
  setSfxVolume:      (vol: number) => void
  setActiveBoardIndex: (i: number) => void

  // ── Actions: master ──
  setMasterVolume:   (vol: number) => void

  // ── Actions: boards (called from ProfessionalSfxPanel after DB ops) ──
  setBoards:         (boards: AudioBoard[]) => void
  updateBoardName:   (id: number, name: string) => void
  setSlots:          (boardId: number, slots: AudioBoardSlot[]) => void
}

function pathToUrl(path: string): string {
  const rel = path.startsWith('/') ? path.substring(1) : path
  return `local-asset://${rel}`
}

function makeDefaultChannel(volume = 1): ChannelState {
  // Matches `engine.channels[ch].loop = true` in the AudioEngine
  // constructor so the reactive mirror starts in sync with the DOM.
  return { filePath: null, fileName: null, volume, playing: false, loop: true, currentTime: 0, duration: 0, playlist: [] }
}

// ─── Audio engine (owns every DOM node + fade/duck/freeze state) ─────────────
//
// Before this class existed the same concerns were spread across ~10
// module-level `let`s and `const`s at the top of the file (CH, sfxPool,
// duckCount, frozenTrack1/2, activeFades, …) and every store action
// poked them directly. The audit called this out: "State ownership is
// split between DOM and store, making unit testing impossible."
//
// The extraction is mechanical — same semantics, same timing, same
// public surface — but the singleton now has one clear home and the
// store below is a thin reactive mirror that calls engine methods.
// `audioCH` remains exported for useAutoAmbient's direct-element peek.

const SFX_POOL_SIZE = 10
const DUCK_RESTORE_MS = 150

class AudioEngine {
  readonly channels: Record<ChannelId, HTMLAudioElement>
  private readonly sfxPool: HTMLAudioElement[]
  private sfxPoolIndex = 0
  private duckCount = 0
  private duckRestoreTimer: ReturnType<typeof setTimeout> | null = null
  private frozenTrack1: FrozenChannel | null = null
  private frozenTrack2: FrozenChannel | null = null
  private readonly activeFades: Partial<Record<ChannelId, () => void>> = {}

  constructor() {
    this.channels = {
      track1: new Audio(),
      track2: new Audio(),
      combat: new Audio(),
    }
    this.channels.track1.loop = true
    this.channels.track2.loop = true
    this.channels.combat.loop = true
    this.sfxPool = Array.from({ length: SFX_POOL_SIZE }, () => new Audio())
  }

  /** Wire `timeupdate`, `loadedmetadata`, and `ended` on the three
   *  channels so the store can mirror playback state back into Zustand.
   *  Called once from the store factory — the handlers are set after
   *  the store exists because they need `useAudioStore.setState`. */
  wireChannelEvents(onTimeUpdate: (ch: ChannelId, t: number) => void,
                    onDuration:  (ch: ChannelId, d: number) => void,
                    onEnded:     (ch: ChannelId) => void): void {
    for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
      let lastUpdate = 0
      const el = this.channels[ch]
      el.ontimeupdate = () => {
        const now = Date.now()
        if (now - lastUpdate < 500) return
        lastUpdate = now
        onTimeUpdate(ch, el.currentTime)
      }
      el.onloadedmetadata = () => onDuration(ch, el.duration)
      el.onended = () => onEnded(ch)
    }
  }

  private get ducked(): boolean { return this.duckCount > 0 }

  effectiveVolume(userVol: number, master: number): number {
    return userVol * master * (this.ducked ? 0.5 : 1)
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
    const targetVol = this.effectiveVolume(userVol, master)
    el.play().catch(() => {})
    this.activeFades[ch]?.()
    this.activeFades[ch] = fadeTo(el, targetVol)
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
    this.channels[ch].volume = this.effectiveVolume(userVol, master)
  }

  applyMasterVolume(
    volumes: Record<ChannelId, number>,
    master: number,
    sfxVolume: number,
  ): void {
    for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
      this.channels[ch].volume = this.effectiveVolume(volumes[ch], master)
    }
    const sfxEff = Math.max(0, Math.min(1, sfxVolume * master))
    for (const el of this.sfxPool) el.volume = sfxEff
  }

  /**
   * Combat: activate. Freezes track1 + track2 (records their current
   * time / volume / playing state) and fades them silent, then fades
   * in the combat channel. Returns the target pair so the store can
   * mirror the new playing state.
   */
  activateCombat(
    state: { track1: ChannelState; track2: ChannelState; combat: ChannelState; masterVolume: number },
  ): { combatPlaying: boolean } {
    const { track1, track2, combat, masterVolume } = state
    this.frozenTrack1 = {
      filePath: track1.filePath ?? '',
      currentTime: this.channels.track1.currentTime,
      volume: track1.volume,
      wasPlaying: track1.playing,
    }
    this.frozenTrack2 = {
      filePath: track2.filePath ?? '',
      currentTime: this.channels.track2.currentTime,
      volume: track2.volume,
      wasPlaying: track2.playing,
    }
    this.activeFades.track1?.()
    this.activeFades.track1 = fadeTo(this.channels.track1, 0, () => this.channels.track1.pause())
    this.activeFades.track2?.()
    this.activeFades.track2 = fadeTo(this.channels.track2, 0, () => this.channels.track2.pause())

    let combatPlaying = false
    if (combat.filePath) {
      const targetVol = this.effectiveVolume(combat.volume, masterVolume)
      this.channels.combat.volume = 0
      this.channels.combat.play().catch(() => {})
      this.activeFades.combat?.()
      this.activeFades.combat = fadeTo(this.channels.combat, targetVol)
      combatPlaying = true
    }
    return { combatPlaying }
  }

  /**
   * Combat: deactivate. Fades out combat, then for each music channel
   * restores currentTime from its frozen snapshot and resumes playback
   * if it was playing before the freeze. The store gets told which
   * channels ended up playing + at which volume so it can refresh
   * the mirror.
   */
  deactivateCombat(masterVolume: number): {
    track1: { volume: number; playing: boolean } | null
    track2: { volume: number; playing: boolean } | null
  } {
    this.activeFades.combat?.()
    this.activeFades.combat = fadeTo(this.channels.combat, 0, () => {
      this.channels.combat.pause()
      this.channels.combat.currentTime = 0
    })

    const t1Result = this.restoreFrozen('track1', this.frozenTrack1, masterVolume)
    const t2Result = this.restoreFrozen('track2', this.frozenTrack2, masterVolume)
    this.frozenTrack1 = null
    this.frozenTrack2 = null
    return { track1: t1Result, track2: t2Result }
  }

  private restoreFrozen(
    ch: 'track1' | 'track2',
    frozen: FrozenChannel | null,
    masterVolume: number,
  ): { volume: number; playing: boolean } | null {
    if (!frozen?.filePath) return null
    const el = this.channels[ch]
    el.currentTime = frozen.currentTime
    if (frozen.wasPlaying) {
      const targetVol = this.effectiveVolume(frozen.volume, masterVolume)
      el.play().catch(() => {})
      this.activeFades[ch]?.()
      this.activeFades[ch] = fadeTo(el, targetVol)
    }
    return { volume: frozen.volume, playing: frozen.wasPlaying }
  }

  /**
   * SFX: round-robin through the pool and play one-shot with ducking.
   * Ducking drops every music channel to 50 % while any SFX is active
   * (counted via `duckCount`) and restores after a 150 ms grace period
   * once every SFX has finished — so rapid-fire triggers don't cause
   * ping-pong fade-in-out.
   */
  triggerSfx(
    audioPath: string,
    sfxVolume: number,
    masterVolume: number,
    channelVolumes: Record<ChannelId, number>,
    /** Per-slot multiplier (v38). Defaults to 1 so old call sites
     *  that don't pass it behave identically to before. */
    slotVolume = 1,
    /** Per-slot loop flag (v38). When true the SFX repeats until the
     *  user explicitly retriggers/stops it. */
    loop = false,
  ): void {
    const el = this.sfxPool[this.sfxPoolIndex % SFX_POOL_SIZE]
    this.sfxPoolIndex = (this.sfxPoolIndex + 1) % SFX_POOL_SIZE
    el.pause()
    el.src = pathToUrl(audioPath)
    el.volume = Math.max(0, Math.min(1, sfxVolume * masterVolume * slotVolume))
    el.loop = loop
    this.startDuck(channelVolumes, masterVolume)
    // A looping SFX ducks the music for as long as it plays. We end
    // the duck when the user re-triggers / stops, not on `ended`
    // (which never fires for `loop=true`). Hooked via an `onpause`
    // listener that the caller can use as the stop signal.
    el.onended = () => this.endDuck(channelVolumes, masterVolume)
    el.onerror = () => this.endDuck(channelVolumes, masterVolume)
    if (loop) {
      // Replace any previous pause-handler so concurrent looping SFX
      // pool entries don't double-call endDuck.
      el.onpause = () => this.endDuck(channelVolumes, masterVolume)
    } else {
      el.onpause = null
    }
    el.play().catch(() => this.endDuck(channelVolumes, masterVolume))
  }

  private startDuck(channelVolumes: Record<ChannelId, number>, master: number): void {
    if (this.duckRestoreTimer) {
      clearTimeout(this.duckRestoreTimer)
      this.duckRestoreTimer = null
    }
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

const engine = new AudioEngine()

/** Exported so `useAutoAmbient` can peek at the raw element to read
 *  `src` and `pause()` directly. Preserved verbatim from the pre-
 *  extraction API — the hook's two call sites still work unchanged. */
export const audioCH = engine.channels

// ─── Store ────────────────────────────────────────────────────────────────────
//
// The store keeps ONE job: hold the reactive mirror of what the engine
// is doing so UI can render. Every action routes through `engine.*` —
// no more poking module globals.

function channelVolumes(get: () => AudioState): Record<ChannelId, number> {
  const s = get()
  return { track1: s.track1.volume, track2: s.track2.volume, combat: s.combat.volume }
}

export const useAudioStore = create<AudioState>((set, get) => {
  engine.wireChannelEvents(
    (ch, currentTime) =>
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, currentTime } })),
    (ch, duration) =>
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, duration } })),
    (ch) =>
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, playing: false } })),
  )

  return {
    track1:      makeDefaultChannel(1),
    track2:      makeDefaultChannel(1),
    combat:      makeDefaultChannel(1),
    masterVolume: 1,
    combatActive: false,
    sfxVolume:   0.8,
    activeBoardIndex: 0,
    boards: [],

    // ── Channel: load ──────────────────────────────────────────────
    loadChannel: (ch, path) => {
      engine.load(ch, path)
      const fileName = path.split(/[\\/]/).pop() ?? path
      set((s) => ({
        [ch]: { ...s[ch as keyof typeof s] as ChannelState, filePath: path, fileName, playing: false, currentTime: 0, duration: 0 },
      }))
    },

    // ── Channel: play ──────────────────────────────────────────────
    playChannel: (ch) => {
      const state = get()
      // combat stays silent while inactive if not the combat channel
      if (state.combatActive && ch !== 'combat') return
      engine.play(ch, state[ch].volume, state.masterVolume)
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, playing: true } }))
    },

    // ── Channel: stop ──────────────────────────────────────────────
    stopChannel: (ch) => {
      engine.stop(ch)
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, playing: false, currentTime: 0 } }))
    },

    // ── Channel: volume ────────────────────────────────────────────
    setChannelVolume: (ch, vol) => {
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, volume: vol } }))
      engine.applyChannelVolume(ch, vol, get().masterVolume)
    },

    // ── Channel: seek ──────────────────────────────────────────────
    seekChannel: (ch, time) => {
      engine.seek(ch, time)
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, currentTime: time } }))
    },

    // ── Channel: loop ──────────────────────────────────────────────
    toggleLoop: (ch) => {
      const next = !engine.channels[ch].loop
      engine.setLoop(ch, next)
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, loop: next } }))
    },

    // ── Combat: activate ──────────────────────────────────────────
    activateCombat: () => {
      const state = get()
      const { combatPlaying } = engine.activateCombat(state)
      set((s) => ({
        combatActive: true,
        track1: { ...s.track1, playing: false },
        track2: { ...s.track2, playing: false },
        combat: { ...s.combat, playing: combatPlaying || s.combat.playing },
      }))
    },

    // ── Combat: deactivate ─────────────────────────────────────────
    deactivateCombat: () => {
      const result = engine.deactivateCombat(get().masterVolume)
      set((s) => {
        const patch: Partial<AudioState> = { combatActive: false, combat: { ...s.combat, playing: false } }
        if (result.track1) {
          patch.track1 = { ...s.track1, volume: result.track1.volume, playing: result.track1.playing }
        }
        if (result.track2) {
          patch.track2 = { ...s.track2, volume: result.track2.volume, playing: result.track2.playing }
        }
        return patch
      })
    },

    // ── SFX ──────────────────────────────────────────────────────
    triggerSfx: (audioPath, slotVolume = 1, loop = false) => {
      const { sfxVolume, masterVolume } = get()
      engine.triggerSfx(audioPath, sfxVolume, masterVolume, channelVolumes(get), slotVolume, loop)
    },

    setSfxVolume: (vol) => set({ sfxVolume: vol }),

    setActiveBoardIndex: (i) => set({ activeBoardIndex: i }),

    // ── Per-channel playlists ─────────────────────────────────────
    setChannelPlaylist: (ch, entries) =>
      set((s) => ({ [ch]: { ...s[ch], playlist: entries } }) as Partial<AudioState>),

    addPlaylistEntry: (ch, entry, activate) =>
      set((s) => {
        const nextPlaylist = [...s[ch].playlist, entry]
        // If this is the first track ever added, or the caller asked
        // to activate, we also point filePath at it so the ▶ button
        // has something to play without needing a second right-click.
        const shouldActivate = activate ?? nextPlaylist.length === 1
        const next: Partial<ChannelState> = { playlist: nextPlaylist }
        if (shouldActivate) { next.filePath = entry.path; next.fileName = entry.fileName }
        return { [ch]: { ...s[ch], ...next } } as Partial<AudioState>
      }),

    removePlaylistEntry: (ch, id) =>
      set((s) => {
        const removed = s[ch].playlist.find((e) => e.id === id)
        const nextPlaylist = s[ch].playlist.filter((e) => e.id !== id)
        const next: Partial<ChannelState> = { playlist: nextPlaylist }
        // If the removed track was the active one, pick the next
        // playlist entry (if any) or clear the channel. We intentionally
        // don't restart playback — removal is a curation action, not a
        // "skip to next track" gesture.
        if (removed && s[ch].filePath === removed.path) {
          const fallback = nextPlaylist[0]
          next.filePath = fallback?.path ?? null
          next.fileName = fallback?.fileName ?? null
          next.playing = false
          next.currentTime = 0
          next.duration = 0
        }
        return { [ch]: { ...s[ch], ...next } } as Partial<AudioState>
      }),

    clearAllPlaylists: () =>
      set((s) => ({
        track1: { ...s.track1, playlist: [] },
        track2: { ...s.track2, playlist: [] },
        combat: { ...s.combat, playlist: [] },
      })),

    // ── Master volume ─────────────────────────────────────────────
    setMasterVolume: (vol) => {
      set({ masterVolume: vol })
      engine.applyMasterVolume(channelVolumes(get), vol, get().sfxVolume)
    },

    // ── Boards ───────────────────────────────────────────────────
    setBoards: (boards) => set({ boards }),
    updateBoardName: (id, name) =>
      set((s) => ({ boards: s.boards.map((b) => b.id === id ? { ...b, name } : b) })),
    setSlots: (boardId, slots) =>
      set((s) => ({ boards: s.boards.map((b) => b.id === boardId ? { ...b, slots } : b) })),
  }
})
