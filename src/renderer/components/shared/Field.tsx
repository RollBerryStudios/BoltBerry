import { useId } from 'react'
import type { ReactNode, CSSProperties } from 'react'

interface FieldProps {
  /** Visible label rendered above the control. */
  label: string
  /** Optional helper text rendered beneath the label in muted colour. */
  hint?: string
  /** Error message; when present, rendered in `--error` colour + announced via aria-describedby. */
  error?: string | null
  /** Render prop so the child receives the generated `id`. */
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode
  /** Additional styles to merge onto the wrapper. */
  style?: CSSProperties
}

/**
 * Form-field primitive that wires `<label htmlFor>` ↔ `<input id>` ↔
 * `aria-describedby` for hint / error without the caller having to
 * juggle `useId` manually.
 *
 * Addresses audit findings #30 (unlinked labels) and #34 (inline form
 * errors) — the hint and error content flow through
 * `aria-describedby` so screen readers announce them on focus.
 *
 * Usage:
 *
 * ```tsx
 * <Field label="Name" hint="Shown to players" error={err}>
 *   {({ inputId, describedBy }) => (
 *     <input id={inputId} aria-describedby={describedBy} />
 *   )}
 * </Field>
 * ```
 */
export function Field({ label, hint, error, children, style }: FieldProps) {
  const autoId = useId()
  const inputId = `${autoId}-input`
  const hintId = `${autoId}-hint`
  const errorId = `${autoId}-err`
  const describedByParts = [
    hint ? hintId : undefined,
    error ? errorId : undefined,
  ].filter((x): x is string => Boolean(x))
  const describedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', ...style }}>
      <label
        htmlFor={inputId}
        style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}
      >
        {label}
      </label>
      {hint && (
        <div id={hintId} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
      {children({ inputId, describedBy })}
      {error && (
        <div
          id={errorId}
          role="alert"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
