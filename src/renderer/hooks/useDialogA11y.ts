import { useEffect, useRef } from 'react'

interface Options {
  /** Fired on Escape. */
  onClose: () => void
  /** Set to `false` to disable the focus trap (default: true). */
  trapFocus?: boolean
}

/**
 * Shared a11y behaviour for custom-styled dialogs that can't adopt the
 * shared `<Modal>` primitive (e.g. `AboutDialog` which has its own CSS
 * class layout). Attach the returned ref to the dialog's root element.
 *
 *  - Escape invokes `onClose`.
 *  - Tab / Shift+Tab cycle inside the dialog (focus trap).
 *  - On mount, focus moves to the first focusable child.
 *  - On unmount, focus restores to whatever was focused before the
 *    dialog opened.
 *
 * Use this when `Modal` isn't a clean drop-in; otherwise prefer `Modal`.
 */
export function useDialogA11y<T extends HTMLElement>({
  onClose,
  trapFocus = true,
}: Options) {
  const containerRef = useRef<T | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const container = containerRef.current
    if (container) {
      const first = getFocusable(container)[0] ?? container
      first.focus({ preventScroll: true })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (trapFocus && e.key === 'Tab') trap(e, container)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      previouslyFocusedRef.current?.focus({ preventScroll: true })
    }
  }, [onClose, trapFocus])

  return containerRef
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

function trap(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const items = getFocusable(container)
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      e.preventDefault()
      last.focus({ preventScroll: true })
    }
  } else {
    if (active === last) {
      e.preventDefault()
      first.focus({ preventScroll: true })
    }
  }
}
