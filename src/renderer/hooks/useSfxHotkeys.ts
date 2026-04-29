import { useEffect } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useUIStore } from '../stores/uiStore'
import { useCampaignStore } from '../stores/campaignStore'

/**
 * SFX board keyboard hotkeys. Owns digits + board-cycle key whenever
 * the floating audio panel is open. The previous duplicate in
 * useKeyboardShortcuts has been removed (Phase 11 C-8 / C-9).
 *
 *   1–9 → slots 0–8,  0 → slot 9 (visual labels on the SFX grid)
 *   ß / -  → cycle to next board
 *
 * Gating
 *   - Audio panel open (`floatingPanel === 'audio'`) — when the panel is
 *     closed there is no SFX context, so digits fall through to the
 *     map-switch handler in useKeyboardShortcuts
 *   - No input / textarea / select / contenteditable focused — the
 *     volume slider is a number input; typing there must not blast SFX
 *   - No modal dialog open (aria-modal="true")
 *   - Plain key only: ignored when any modifier is held
 *   - Only when a campaign + map is active
 */
export function useSfxHotkeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Modifier keys = not a hotkey for us.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      // Input-focus guard.
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target?.isContentEditable) return

      // Modal guard.
      if (document.querySelector('[aria-modal="true"]')) return

      // Audio panel open is the gate now — outside the panel, digits
      // belong to map-switching and board-cycle has no context.
      if (useUIStore.getState().floatingPanel !== 'audio') return

      // Map-view guard.
      const { activeCampaignId, activeMapId } = useCampaignStore.getState()
      if (!activeCampaignId || !activeMapId) return

      const audio = useAudioStore.getState()
      const board = audio.boards[audio.activeBoardIndex]
      if (!board) return

      // Digit → SFX slot
      if (/^[0-9]$/.test(e.key)) {
        const slotNumber = e.key === '0' ? 9 : Number(e.key) - 1
        const slot = board.slots.find((s) => s.slotNumber === slotNumber)
        if (!slot?.audioPath) return
        e.preventDefault()
        audio.triggerSfx(slot.audioPath, slot.volume ?? 1, slot.isLoop ?? false)
        return
      }

      // ß / - → cycle to next board (was in useKeyboardShortcuts;
      // moved here so all SFX hotkeys live in one hook).
      if ((e.key === 'ß' || e.key === '-') && audio.boards.length > 1) {
        e.preventDefault()
        audio.setActiveBoardIndex((audio.activeBoardIndex + 1) % audio.boards.length)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
