import { useEffect, useRef } from 'react'

/**
 * Reusable numeric input with a proper DM-tool UX:
 *
 *   [−]  42  [+]
 *
 *  - Click the `−` / `+` buttons to step by ±1.
 *  - Hold the button to repeat (150 ms delay, then 40 ms interval).
 *  - Arrow keys work inside the input: ArrowUp / ArrowDown = ±1;
 *    Shift + ArrowUp / ArrowDown = ±`bigStep` (default 5) — matches
 *    the Foundry/Owlbear combat-editor feel the user asked for.
 *  - Mouse-wheel over the input = ±1 (Shift = ±bigStep).
 *  - Enter or blur commits. Typing a bad number falls back to the
 *    clamped last-known value on blur.
 *
 * Completely uncontrolled internally — value is owned by the parent
 * so the DB-sync stays in the caller's hands.
 */

interface NumberStepperProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  bigStep?: number
  ariaLabel?: string
  /** Width of the whole control; the inner input stretches. */
  width?: number | string
  /** Visual size preset. */
  size?: 'sm' | 'md'
  /** Optional suffix inside the input, e.g. `px`, `ft`, `%`. */
  suffix?: string
  disabled?: boolean
  /** Hide the +/- buttons; arrows + wheel still work. */
  compact?: boolean
  /** Render a tight horizontal layout with extra top/bottom padding
   *  for touchscreens. */
  className?: string
}

export function NumberStepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  bigStep = 5,
  ariaLabel,
  width,
  size = 'md',
  suffix,
  disabled,
  compact,
  className,
}: NumberStepperProps) {
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Stable ref to the latest value so hold-to-repeat reads fresh state
  // instead of the value captured when the pointerdown handler ran.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    return () => {
      if (repeatTimerRef.current) clearTimeout(repeatTimerRef.current)
      if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current)
    }
  }, [])

  function clamp(n: number): number {
    if (n < min) return min
    if (n > max) return max
    return n
  }

  function bump(delta: number) {
    onChange(clamp(valueRef.current + delta))
  }

  function startRepeat(delta: number) {
    if (disabled) return
    bump(delta)
    // ~150 ms delay before repeat kicks in so a single click doesn't
    // trigger the auto-fire loop. Once armed, 40 ms interval gives the
    // user roughly 25 steps/second — brisk but not runaway.
    repeatTimerRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => bump(delta), 40)
    }, 150)
  }

  function stopRepeat() {
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null }
    if (repeatIntervalRef.current) { clearInterval(repeatIntervalRef.current); repeatIntervalRef.current = null }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const delta = e.shiftKey ? bigStep : step
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      bump(delta)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      bump(-delta)
    } else if (e.key === 'Enter') {
      const parsed = parseFloat(e.currentTarget.value)
      if (Number.isFinite(parsed)) onChange(clamp(parsed))
      e.currentTarget.blur()
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
    // Only act when the input is focused — otherwise a DM scrolling the
    // sidebar would accidentally nudge HP values under the cursor.
    if (document.activeElement !== e.currentTarget) return
    e.preventDefault()
    const delta = (e.shiftKey ? bigStep : step) * (e.deltaY < 0 ? 1 : -1)
    bump(delta)
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const parsed = parseFloat(e.currentTarget.value)
    if (Number.isFinite(parsed) && parsed !== value) onChange(clamp(parsed))
    // Snap display back to the committed value so bad input ("abc")
    // doesn't linger in the field.
    e.currentTarget.value = String(value)
  }

  const btnHeight = size === 'sm' ? 22 : 28
  const inputHeight = btnHeight
  const btnClass = `number-stepper-btn number-stepper-btn-${size}`
  const inputClass = `number-stepper-input number-stepper-input-${size}`

  return (
    <div
      className={`number-stepper${className ? ' ' + className : ''}`}
      style={{ width }}
    >
      {!compact && (
        <button
          type="button"
          className={btnClass}
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
            startRepeat(-(e.shiftKey ? bigStep : step))
          }}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
          onPointerLeave={stopRepeat}
          disabled={disabled || value <= min}
          aria-label="−"
          tabIndex={-1}
          style={{ height: btnHeight }}
        >
          −
        </button>
      )}
      <div className="number-stepper-input-wrap" style={{ height: inputHeight }}>
        <input
          type="number"
          className={inputClass}
          defaultValue={value}
          key={value /* re-sync display when parent updates */}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          onBlur={handleBlur}
          aria-label={ariaLabel}
          disabled={disabled}
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
        />
        {suffix && <span className="number-stepper-suffix">{suffix}</span>}
      </div>
      {!compact && (
        <button
          type="button"
          className={btnClass}
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
            startRepeat(e.shiftKey ? bigStep : step)
          }}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
          onPointerLeave={stopRepeat}
          disabled={disabled || value >= max}
          aria-label="+"
          tabIndex={-1}
          style={{ height: btnHeight }}
        >
          +
        </button>
      )}
    </div>
  )
}
