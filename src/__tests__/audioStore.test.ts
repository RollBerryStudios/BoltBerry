/**
 * audioStore tests
 *
 * The store creates HTMLAudioElement instances at module-init time, so the
 * MockAudio shim in setup.ts must be loaded first (via vitest setupFiles).
 *
 * Because fadeTo() uses requestAnimationFrame, which we mock to call callbacks
 * synchronously, volume transitions happen instantly in tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'

// Re-import after each test to reset module state.
// We use a dynamic import helper so we can reload the module between describe blocks.
// For simplicity we use a single import and reset store state manually via the
// public API rather than trying to reload module state between tests.

import { useAudioStore } from '@renderer/stores/audioStore'

function resetStore() {
  const s = useAudioStore.getState()
  // Stop all channels
  s.stopChannel('track1')
  s.stopChannel('track2')
  s.stopChannel('combat')
  // Reset volumes to defaults
  s.setChannelVolume('track1', 1)
  s.setChannelVolume('track2', 1)
  s.setChannelVolume('combat', 1)
  s.setMasterVolume(1)
  s.setSfxVolume(0.8)
  // Clear boards
  s.setBoards([])
}

describe('audioStore — initial state', () => {
  it('all channels start with no file loaded', () => {
    const { track1, track2, combat } = useAudioStore.getState()
    expect(track1.filePath).toBeNull()
    expect(track2.filePath).toBeNull()
    expect(combat.filePath).toBeNull()
  })

  it('all channels start not playing', () => {
    const { track1, track2, combat } = useAudioStore.getState()
    expect(track1.playing).toBe(false)
    expect(track2.playing).toBe(false)
    expect(combat.playing).toBe(false)
  })

  it('masterVolume starts at 1', () => {
    expect(useAudioStore.getState().masterVolume).toBe(1)
  })

  it('combatActive starts false', () => {
    expect(useAudioStore.getState().combatActive).toBe(false)
  })

  it('boards starts empty', () => {
    expect(useAudioStore.getState().boards).toEqual([])
  })
})

describe('audioStore — loadChannel', () => {
  beforeEach(resetStore)

  it('sets filePath and fileName', () => {
    useAudioStore.getState().loadChannel('track1', 'assets/audio/forest.mp3')
    const { track1 } = useAudioStore.getState()
    expect(track1.filePath).toBe('assets/audio/forest.mp3')
    expect(track1.fileName).toBe('forest.mp3')
  })

  it('resets playing to false on load', () => {
    // Force playing state first by directly patching state
    useAudioStore.setState((s) => ({ track1: { ...s.track1, playing: true } }))
    useAudioStore.getState().loadChannel('track1', 'assets/audio/new.mp3')
    expect(useAudioStore.getState().track1.playing).toBe(false)
  })

  it('resets currentTime and duration to 0 on load', () => {
    useAudioStore.getState().loadChannel('track2', 'assets/audio/ambient.mp3')
    const { track2 } = useAudioStore.getState()
    expect(track2.currentTime).toBe(0)
    expect(track2.duration).toBe(0)
  })
})

describe('audioStore — setChannelVolume', () => {
  beforeEach(resetStore)

  it('stores user volume in state', () => {
    useAudioStore.getState().setChannelVolume('track1', 0.5)
    expect(useAudioStore.getState().track1.volume).toBe(0.5)
  })

  it('clamps are not applied at state level (raw value stored)', () => {
    useAudioStore.getState().setChannelVolume('track2', 0.75)
    expect(useAudioStore.getState().track2.volume).toBe(0.75)
  })
})

describe('audioStore — setMasterVolume', () => {
  beforeEach(resetStore)

  it('updates masterVolume in state', () => {
    useAudioStore.getState().setMasterVolume(0.6)
    expect(useAudioStore.getState().masterVolume).toBe(0.6)
  })
})

describe('audioStore — combat mode', () => {
  beforeEach(resetStore)

  it('activateCombat sets combatActive to true', () => {
    useAudioStore.getState().activateCombat()
    expect(useAudioStore.getState().combatActive).toBe(true)
  })

  it('activateCombat marks track1 and track2 as not playing', () => {
    // Simulate playing state first
    useAudioStore.setState((s) => ({
      track1: { ...s.track1, playing: true },
      track2: { ...s.track2, playing: true },
    }))
    useAudioStore.getState().activateCombat()
    const { track1, track2 } = useAudioStore.getState()
    expect(track1.playing).toBe(false)
    expect(track2.playing).toBe(false)
  })

  it('deactivateCombat sets combatActive to false', () => {
    useAudioStore.getState().activateCombat()
    useAudioStore.getState().deactivateCombat()
    expect(useAudioStore.getState().combatActive).toBe(false)
  })

  it('deactivateCombat marks combat channel as not playing', () => {
    useAudioStore.getState().activateCombat()
    useAudioStore.getState().deactivateCombat()
    expect(useAudioStore.getState().combat.playing).toBe(false)
  })
})

describe('audioStore — boards', () => {
  beforeEach(resetStore)

  it('setBoards replaces boards list', () => {
    const boards = [
      { id: 1, campaignId: 1, name: 'SFX', sortOrder: 0, slots: [] },
      { id: 2, campaignId: 1, name: 'Music', sortOrder: 1, slots: [] },
    ]
    useAudioStore.getState().setBoards(boards)
    expect(useAudioStore.getState().boards).toHaveLength(2)
    expect(useAudioStore.getState().boards[0].name).toBe('SFX')
  })

  it('updateBoardName changes only the targeted board', () => {
    useAudioStore.getState().setBoards([
      { id: 1, campaignId: 1, name: 'Old Name', sortOrder: 0, slots: [] },
    ])
    useAudioStore.getState().updateBoardName(1, 'New Name')
    expect(useAudioStore.getState().boards[0].name).toBe('New Name')
  })

  it('setSlots updates slots on the targeted board', () => {
    useAudioStore.getState().setBoards([
      { id: 1, campaignId: 1, name: 'SFX', sortOrder: 0, slots: [] },
    ])
    const slots = [
      { slotNumber: 0, emoji: '🔥', title: 'Fire', audioPath: 'assets/audio/fire.mp3' },
    ]
    useAudioStore.getState().setSlots(1, slots)
    expect(useAudioStore.getState().boards[0].slots).toHaveLength(1)
    expect(useAudioStore.getState().boards[0].slots[0].title).toBe('Fire')
  })

  it('setActiveBoardIndex updates activeBoardIndex', () => {
    useAudioStore.getState().setActiveBoardIndex(3)
    expect(useAudioStore.getState().activeBoardIndex).toBe(3)
  })
})

describe('audioStore — setSfxVolume', () => {
  beforeEach(resetStore)

  it('updates sfxVolume', () => {
    useAudioStore.getState().setSfxVolume(0.5)
    expect(useAudioStore.getState().sfxVolume).toBe(0.5)
  })
})

describe('audioStore — stopChannel', () => {
  beforeEach(resetStore)

  it('marks channel as not playing', () => {
    useAudioStore.setState((s) => ({ track1: { ...s.track1, playing: true } }))
    useAudioStore.getState().stopChannel('track1')
    expect(useAudioStore.getState().track1.playing).toBe(false)
  })

  it('resets currentTime to 0', () => {
    useAudioStore.setState((s) => ({ track1: { ...s.track1, currentTime: 42 } }))
    useAudioStore.getState().stopChannel('track1')
    expect(useAudioStore.getState().track1.currentTime).toBe(0)
  })
})
