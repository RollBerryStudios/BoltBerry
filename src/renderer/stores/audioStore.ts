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

export interface AudioBoardSlot {
  slotNumber: number   // 0–9
  emoji: string
  title: string
  audioPath: string | null
}

export interface AudioBoard {
  id: number
  campaignId: number
  name: string
  sortOrder: number
  slots: AudioBoardSlot[]
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
  triggerSfx:        (audioPath: string) => void
  setSfxVolume:      (vol: number) => void
  setActiveBoardIndex: (i: number) => void

  // ── Actions: master ──
  setMasterVolume:   (vol: number) => void

  // ── Actions: boards (called from AudioPanel after DB ops) ──
  setBoards:         (boards: AudioBoard[]) => void
  updateBoardName:   (id: number, name: string) => void
  setSlots:          (boardId: number, slots: AudioBoardSlot[]) => void
}

// ─── Module-level audio objects (not in Zustand — no serialisation needed) ───

const CH: Record<ChannelId, HTMLAudioElement> = {
  track1: new Audio(),
  track2: new Audio(),
  combat: new Audio(),
}
CH.track1.loop = true
CH.track2.loop = true
CH.combat.loop = true

// SFX pool — 10 pre-allocated elements, round-robin
const SFX_POOL_SIZE = 10
const sfxPool: HTMLAudioElement[] = Array.from({ length: SFX_POOL_SIZE }, () => new Audio())
let sfxPoolIndex = 0

// Duck state
let duckCount = 0
let duckRestoreTimer: ReturnType<typeof setTimeout> | null = null

// Combat frozen state
let frozenTrack1: FrozenChannel | null = null
let frozenTrack2: FrozenChannel | null = null

// Active fades (cancel on re-trigger)
const activeFades: Partial<Record<ChannelId, () => void>> = {}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function effectiveVolume(userVol: number, master: number, ducked: boolean): number {
  return userVol * master * (ducked ? 0.5 : 1)
}

function applyVolume(ch: ChannelId) {
  const { track1, track2, combat, masterVolume } = useAudioStore.getState()
  const state: Record<ChannelId, ChannelState> = { track1, track2, combat }
  const ducked = duckCount > 0
  CH[ch].volume = effectiveVolume(state[ch].volume, masterVolume, ducked)
}

function startDuck() {
  if (duckRestoreTimer) { clearTimeout(duckRestoreTimer); duckRestoreTimer = null }
  duckCount++
  const { track1, track2, combat, masterVolume } = useAudioStore.getState()
  const master = masterVolume
  for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
    const vol = ch === 'track1' ? track1.volume : ch === 'track2' ? track2.volume : combat.volume
    activeFades[ch]?.()
    activeFades[ch] = fadeTo(CH[ch], vol * master * 0.5)
  }
}

function endDuck() {
  duckCount = Math.max(0, duckCount - 1)
  if (duckCount > 0) return
  if (duckRestoreTimer) clearTimeout(duckRestoreTimer)
  duckRestoreTimer = setTimeout(() => {
    if (duckCount > 0) return
    const { track1, track2, combat, masterVolume } = useAudioStore.getState()
    const master = masterVolume
    for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
      const vol = ch === 'track1' ? track1.volume : ch === 'track2' ? track2.volume : combat.volume
      activeFades[ch]?.()
      activeFades[ch] = fadeTo(CH[ch], vol * master)
    }
  }, 150)
}

function makeDefaultChannel(volume = 1): ChannelState {
  return { filePath: null, fileName: null, volume, playing: false, currentTime: 0, duration: 0, playlist: [] }
}

function pathToUrl(path: string): string {
  const rel = path.startsWith('/') ? path.substring(1) : path
  return `local-asset://${rel}`
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAudioStore = create<AudioState>((set, get) => {
  // Wire up timeupdate on all channels (throttled to avoid excessive store updates)
  for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
    let lastUpdate = 0
    CH[ch].ontimeupdate = () => {
      const now = Date.now()
      if (now - lastUpdate < 500) return
      lastUpdate = now
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, currentTime: CH[ch].currentTime } }))
    }
    CH[ch].onloadedmetadata = () => {
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, duration: CH[ch].duration } }))
    }
    CH[ch].onended = () => {
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, playing: false } }))
    }
  }

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
      const el = CH[ch]
      activeFades[ch]?.()
      el.pause()
      el.src = pathToUrl(path)
      el.load()
      el.volume = 0
      const fileName = path.split(/[\\/]/).pop() ?? path
      set((s) => ({
        [ch]: { ...s[ch as keyof typeof s] as ChannelState, filePath: path, fileName, playing: false, currentTime: 0, duration: 0 },
      }))
    },

    // ── Channel: play ──────────────────────────────────────────────
    playChannel: (ch) => {
      const el = CH[ch]
      if (!el.src || el.src === window.location.href) return
      const { masterVolume, combatActive } = get()
      const state = get()[ch]
      // combat stays silent while inactive if not the combat channel
      if (combatActive && ch !== 'combat') return
      const targetVol = effectiveVolume(state.volume, masterVolume, duckCount > 0)
      el.play().catch(() => {})
      activeFades[ch]?.()
      activeFades[ch] = fadeTo(el, targetVol)
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, playing: true } }))
    },

    // ── Channel: stop ──────────────────────────────────────────────
    stopChannel: (ch) => {
      const el = CH[ch]
      activeFades[ch]?.()
      activeFades[ch] = fadeTo(el, 0, () => {
        el.pause()
        el.currentTime = 0
      })
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, playing: false, currentTime: 0 } }))
    },

    // ── Channel: volume ────────────────────────────────────────────
    setChannelVolume: (ch, vol) => {
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, volume: vol } }))
      applyVolume(ch)
    },

    // ── Channel: seek ──────────────────────────────────────────────
    seekChannel: (ch, time) => {
      CH[ch].currentTime = time
      set((s) => ({ [ch]: { ...s[ch as keyof typeof s] as ChannelState, currentTime: time } }))
    },

    // ── Channel: loop ──────────────────────────────────────────────
    toggleLoop: (ch) => {
      CH[ch].loop = !CH[ch].loop
    },

    // ── Combat: activate ──────────────────────────────────────────
    activateCombat: () => {
      const { track1, track2, combat, masterVolume } = get()
      // Freeze track1 & track2
      frozenTrack1 = { filePath: track1.filePath ?? '', currentTime: CH.track1.currentTime, volume: track1.volume, wasPlaying: track1.playing }
      frozenTrack2 = { filePath: track2.filePath ?? '', currentTime: CH.track2.currentTime, volume: track2.volume, wasPlaying: track2.playing }
      // Fade out both music channels
      activeFades.track1?.()
      activeFades.track1 = fadeTo(CH.track1, 0, () => CH.track1.pause())
      activeFades.track2?.()
      activeFades.track2 = fadeTo(CH.track2, 0, () => CH.track2.pause())
      set((s) => ({
        combatActive: true,
        track1: { ...s.track1, playing: false },
        track2: { ...s.track2, playing: false },
      }))
      // Fade in combat
      if (combat.filePath) {
        const targetVol = effectiveVolume(combat.volume, masterVolume, duckCount > 0)
        CH.combat.volume = 0
        CH.combat.play().catch(() => {})
        activeFades.combat?.()
        activeFades.combat = fadeTo(CH.combat, targetVol)
        set((s) => ({ combat: { ...s.combat, playing: true } }))
      }
    },

    // ── Combat: deactivate ─────────────────────────────────────────
    deactivateCombat: () => {
      const { masterVolume } = get()
      // Fade out combat
      activeFades.combat?.()
      activeFades.combat = fadeTo(CH.combat, 0, () => {
        CH.combat.pause()
        CH.combat.currentTime = 0
      })
      set((s) => ({ combatActive: false, combat: { ...s.combat, playing: false } }))
      // Restore track1
      if (frozenTrack1?.filePath) {
        const f1 = frozenTrack1
        CH.track1.currentTime = f1.currentTime
        if (f1.wasPlaying) {
          const targetVol = effectiveVolume(f1.volume, masterVolume, duckCount > 0)
          CH.track1.play().catch(() => {})
          activeFades.track1?.()
          activeFades.track1 = fadeTo(CH.track1, targetVol)
        }
        set((s) => ({ track1: { ...s.track1, volume: f1.volume, playing: f1.wasPlaying } }))
      }
      // Restore track2
      if (frozenTrack2?.filePath) {
        const f2 = frozenTrack2
        CH.track2.currentTime = f2.currentTime
        if (f2.wasPlaying) {
          const targetVol = effectiveVolume(f2.volume, masterVolume, duckCount > 0)
          CH.track2.play().catch(() => {})
          activeFades.track2?.()
          activeFades.track2 = fadeTo(CH.track2, targetVol)
        }
        set((s) => ({ track2: { ...s.track2, volume: f2.volume, playing: f2.wasPlaying } }))
      }
      frozenTrack1 = null
      frozenTrack2 = null
    },

    // ── SFX ──────────────────────────────────────────────────────
    triggerSfx: (audioPath) => {
      const { sfxVolume, masterVolume } = get()
      const el = sfxPool[sfxPoolIndex % SFX_POOL_SIZE]
      sfxPoolIndex = (sfxPoolIndex + 1) % SFX_POOL_SIZE
      el.pause()
      el.src = pathToUrl(audioPath)
      el.volume = Math.max(0, Math.min(1, sfxVolume * masterVolume))
      el.loop = false
      startDuck()
      el.onended = () => endDuck()
      el.onerror = () => endDuck()
      el.play().catch(() => endDuck())
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
      const { track1, track2, combat } = get()
      const ducked = duckCount > 0
      for (const ch of ['track1', 'track2', 'combat'] as ChannelId[]) {
        const chVol = ch === 'track1' ? track1.volume : ch === 'track2' ? track2.volume : combat.volume
        CH[ch].volume = effectiveVolume(chVol, vol, ducked)
      }
      sfxPool.forEach((el) => { el.volume = Math.max(0, Math.min(1, get().sfxVolume * vol)) })
    },

    // ── Boards ───────────────────────────────────────────────────
    setBoards: (boards) => set({ boards }),
    updateBoardName: (id, name) =>
      set((s) => ({ boards: s.boards.map((b) => b.id === id ? { ...b, name } : b) })),
    setSlots: (boardId, slots) =>
      set((s) => ({ boards: s.boards.map((b) => b.id === boardId ? { ...b, slots } : b) })),
  }
})

// ─── Expose CH for useAutoAmbient ─────────────────────────────────────────────
export { CH as audioCH }
