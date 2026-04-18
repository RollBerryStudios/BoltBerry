/**
 * Source-contract tests for the shared NumberStepper component.
 *
 * The real behavioural tests would use @testing-library/react, but this
 * project currently runs vitest in a `node` environment without jsdom
 * and without RTL installed. Rather than inflate the toolchain just for
 * one component, we assert the source-level contract so a future refactor
 * can't silently drop the UX affordances the user specifically asked for
 * (arrow keys, Shift±5, wheel, hold-to-repeat).
 *
 * If we ever add jsdom + RTL, this file should grow into real rendering
 * tests and the string-matching below can be deleted.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = readFileSync(
  resolve(__dirname, '../renderer/components/shared/NumberStepper.tsx'),
  'utf8',
)

describe('NumberStepper contract', () => {
  it('exposes +/- button handlers with hold-to-repeat', () => {
    // Pointer-down arms the repeat, pointer-up/cancel/leave stops it.
    expect(SRC).toMatch(/onPointerDown/)
    expect(SRC).toMatch(/onPointerUp/)
    expect(SRC).toMatch(/onPointerCancel/)
    expect(SRC).toMatch(/onPointerLeave/)
    // setInterval + initial setTimeout = delay-then-repeat pattern.
    expect(SRC).toMatch(/setTimeout/)
    expect(SRC).toMatch(/setInterval/)
  })

  it('clears both repeat timers on unmount to avoid leaks', () => {
    // useEffect with a cleanup that kills both refs.
    expect(SRC).toMatch(/clearTimeout\s*\(\s*repeatTimerRef\.current/)
    expect(SRC).toMatch(/clearInterval\s*\(\s*repeatIntervalRef\.current/)
  })

  it('binds ArrowUp / ArrowDown to step, with Shift for bigStep', () => {
    expect(SRC).toMatch(/e\.key\s*===\s*['"]ArrowUp['"]/)
    expect(SRC).toMatch(/e\.key\s*===\s*['"]ArrowDown['"]/)
    // bigStep must be picked when shiftKey is held (either arrows OR wheel).
    expect(SRC).toMatch(/e\.shiftKey\s*\?\s*bigStep/)
  })

  it('commits on Enter and blurs', () => {
    // Enter commits the typed value + removes focus so the parent sees
    // the final value without needing the user to click elsewhere.
    expect(SRC).toMatch(/e\.key\s*===\s*['"]Enter['"]/)
    expect(SRC).toMatch(/\.blur\s*\(\s*\)/)
  })

  it('only reacts to wheel when the input is focused', () => {
    // Otherwise scrolling the sidebar over a stepper would mangle HP.
    expect(SRC).toMatch(/document\.activeElement\s*!==\s*e\.currentTarget/)
  })

  it('clamps values against min / max', () => {
    expect(SRC).toMatch(/function clamp/)
    expect(SRC).toMatch(/if\s*\(n\s*<\s*min\)/)
    expect(SRC).toMatch(/if\s*\(n\s*>\s*max\)/)
  })

  it('prevents browser spinner arrows (webkit + moz) via CSS', () => {
    // Visual parity — the custom +/- buttons replace the native spinners.
    // Check source contains the appearance reset (global.css-driven) or
    // at least type="number" with our class.
    expect(SRC).toMatch(/type="number"/)
    expect(SRC).toMatch(/number-stepper-input/)
  })

  it('disables buttons at the edges', () => {
    // Prevent the user from over-stepping min/max via button mashing.
    expect(SRC).toMatch(/disabled\s*\|\|\s*value\s*<=\s*min/)
    expect(SRC).toMatch(/disabled\s*\|\|\s*value\s*>=\s*max/)
  })
})
