import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../renderer/stores/appStore'

beforeEach(() => {
  useAppStore.setState({ saveState: 'idle', lastSaved: null })
})

describe('appStore', () => {
  it('initial state is idle with no lastSaved', () => {
    const s = useAppStore.getState()
    expect(s.saveState).toBe('idle')
    expect(s.lastSaved).toBeNull()
  })

  it('setSaving transitions to saving state', () => {
    useAppStore.getState().setSaving()
    expect(useAppStore.getState().saveState).toBe('saving')
  })

  it('setSaved transitions to saved and records timestamp', () => {
    const before = Date.now()
    useAppStore.getState().setSaved()
    const s = useAppStore.getState()
    expect(s.saveState).toBe('saved')
    expect(s.lastSaved).not.toBeNull()
    expect(s.lastSaved!.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('setSaveError transitions to error state', () => {
    useAppStore.getState().setSaveError()
    expect(useAppStore.getState().saveState).toBe('error')
  })

  it('save state transitions: idle → saving → saved', () => {
    useAppStore.getState().setSaving()
    expect(useAppStore.getState().saveState).toBe('saving')
    useAppStore.getState().setSaved()
    expect(useAppStore.getState().saveState).toBe('saved')
  })

  it('save state transitions: saving → error', () => {
    useAppStore.getState().setSaving()
    useAppStore.getState().setSaveError()
    expect(useAppStore.getState().saveState).toBe('error')
  })

  it('setSaved updates lastSaved on repeated calls', () => {
    useAppStore.getState().setSaved()
    const first = useAppStore.getState().lastSaved!.getTime()
    useAppStore.getState().setSaved()
    const second = useAppStore.getState().lastSaved!.getTime()
    expect(second).toBeGreaterThanOrEqual(first)
  })
})
