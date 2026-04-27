import { useEffect } from 'react'
import { useAudioStore } from '../stores/audioStore'
import { useUIStore } from '../stores/uiStore'
import { useCampaignStore } from '../stores/campaignStore'

/**
 * Global keyboard hotkeys 1–9 / 0 → trigger the corresponding slot
 * on the active SFX board. Mirrors the design-spec convention: the
 * digit's visual label on the SFX grid (1–9 across the top row,
 * 0 in the last position) maps directly to the keystroke.
 *
 * Gating
 *   - No input / textarea / select / contenteditable focused
 *   - No modal dialog open (aria-modal="true") — keeps text-entry
 *     fields inside dialogs from accidentally firing SFX
 *   - No floating utility popover open — the audio popover hosts
 *     a number input on the volume slider; pressing 0–9 there
 *     should adjust the slider, not blast the room
 *   - Only when a campaign + map is active (Map view) — no point
 *     triggering board sounds on the campaign-list screen
 *   - Plain digit only: ignored when any modifier is held
 *     (Ctrl/Cmd/Alt/Shift) so existing palette / OS shortcuts
 *     keep working as-is
 *
 * Slot lookup uses the audioStore's currently-active board and the
 * per-slot volume + loop fields persisted in v38. A slot with no
 * audioPath is silently skipped — pressing the corresponding key
 * is a no-op.
 */
export function useSfxHotkeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Modifier keys = not a hotkey for us.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      // 1-9 / 0 only.
      const key = e.key
      if (!/^[0-9]$/.test(key)) return

      // Input-focus guard.
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target?.isContentEditable) return

      // Modal guard. A second-class screen owns the keyboard while
      // it's open — palette, dialogs, the wiki entry form, …
      if (document.querySelector('[aria-modal="true"]')) return

      // Floating-popover guard (audio panel, dice roller, overlay).
      // The popover has its own number controls.
      if (useUIStore.getState().floatingPanel !== null) return

      // Map-view guard. No active campaign + map → nothing to play
      // against. Avoids triggering SFX while the DM is on the
      // welcome / campaign-list screens.
      const { activeCampaignId, activeMapId } = useCampaignStore.getState()
      if (!activeCampaignId || !activeMapId) return

      // Resolve the slot. Visual labels: '1'..'9' = slots 0..8; '0' = slot 9.
      const slotNumber = key === '0' ? 9 : Number(key) - 1

      const audio = useAudioStore.getState()
      const board = audio.boards[audio.activeBoardIndex]
      if (!board) return
      const slot = board.slots.find((s) => s.slotNumber === slotNumber)
      if (!slot?.audioPath) return

      // Prevent the digit from also bleeding into other handlers
      // (e.g. an unfocused canvas catching keystrokes).
      e.preventDefault()
      audio.triggerSfx(slot.audioPath, slot.volume ?? 1, slot.isLoop ?? false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
