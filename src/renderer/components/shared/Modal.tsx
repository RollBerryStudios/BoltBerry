import type { ReactNode, CSSProperties } from 'react'
import { useDialogA11y } from '../../hooks/useDialogA11y'

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
  // Escape handler, focus trap, and focus restoration live in a shared
  // hook so `AboutDialog` (custom CSS layout) gets the same guarantees.
  const containerRef = useDialogA11y<HTMLDivElement>({ onClose })

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
