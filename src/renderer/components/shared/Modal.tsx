import { useEffect, useRef } from 'react'
import type { ReactNode, CSSProperties } from 'react'

interface ModalProps {
  /** Fired on ESC, backdrop click, or the modal's own close control. */
  onClose: () => void
  /** Accessible dialog label (announced by screen readers). */
  ariaLabel: string
  /** Optional labelledby for cases where a visible heading already describes the dialog. */
  ariaLabelledBy?: string
  /** Backdrop is clickable by default; set to `false` for destructive dialogs. */
  closeOnBackdrop?: boolean
  children: ReactNode
  /** Additional styles to merge onto the dialog container (inside the backdrop). */
  style?: CSSProperties
  /** Extra CSS class appended to the dialog container. */
  className?: string
}

/**
 * Focus-trapped, ESC-closeable, role="dialog" container.
 *
 * Centralises modal scaffolding so every BoltBerry dialog gets the same
 * keyboard + assistive-tech behaviour:
 *
 *  - Tab / Shift-Tab cycle focus within the dialog.
 *  - ESC fires `onClose`.
 *  - Backdrop click fires `onClose` (unless `closeOnBackdrop={false}`).
 *  - On mount, focus moves to the first focusable child.
 *  - On unmount, focus returns to the element that was active before
 *    the modal opened.
 *
 * Addresses audit findings #27 (focus trap), #18 / #39 (backdrop
 * dismiss with keyboard parity).
 */
export function Modal({
  onClose,
  ariaLabel,
  ariaLabelledBy,
  closeOnBackdrop = true,
  children,
  style,
  className,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    // Focus the first focusable descendant on mount. Falling back to the
    // container itself guarantees a defined initial focus (prevents
    // screen readers from reading outside the dialog).
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
      if (e.key === 'Tab') {
        trapFocus(e, container)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      previouslyFocusedRef.current?.focus({ preventScroll: true })
    }
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
      }}
      onClick={(e) => {
        if (!closeOnBackdrop) return
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={className}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          outline: 'none',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  )
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
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    // Skip elements whose rects are zero — they're display:none / detached.
    return el.offsetParent !== null || el === document.activeElement
  })
}

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
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
