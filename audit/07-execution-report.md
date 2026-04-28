# Phase 7 — Execution Report

What landed on `claude/audit-analysis-action-plan-Oc24L`, what was
verified as already-fixed in the tree, and what remains.

## Commits

| Commit | Milestone | Findings closed |
|---|---|---|
| `8f339874` | **M1** ship-blocker hardening | BB-002, BB-004, BB-005, BB-039, BB-041, BB-042, BB-043, BB-055 |
| `4b9bcc70` | **M3** IPC trust boundary + CSP | BB-003, BB-006, BB-017 |
| `c92bf0b2` | **M4** correctness fixes | BB-026, BB-027, BB-028, BB-033, BB-037, BB-046 |
| `6b906566` | **M5** observability scaffolding | Principle #10 (foundation for M6 measurements) |
| `f055e691` | **M6** safe perf refactors | BB-007, BB-013, BB-014, BB-019, BB-032 |
| `963e8c8f` | **M9** polish | BB-044, BB-047, BB-051 |

## Findings status

### Closed (24)

BB-002, BB-003, BB-004, BB-005, BB-006, BB-007, BB-013, BB-014, BB-017,
BB-019, BB-026, BB-027, BB-028, BB-032, BB-033, BB-037, BB-039, BB-041,
BB-042, BB-043, BB-044, BB-046, BB-047, BB-051, BB-055.

### Verified as false positives in the audit (7)

The audit text was wrong; the tree already implemented the desired
behaviour. Verified by reading the file *and* the existing test where
applicable; new tests added to pin invariants.

| ID | Audit claim | Reality |
|---|---|---|
| BB-020 | Bestiary search lacks debounce | All three tabs already use `useDebouncedValue(query, 200)` |
| BB-029 | Fog history cap off-by-one (~51 entries) | `[...slice(-49), op]` gives at most 50; existing test pins it |
| BB-030 | Initiative timer decrements early on mid-round start | `nextTurn` only decrements on cursor wrap; new test added |
| BB-036 | Portrait path not remapped on import | `remapPaths()` already covers `cs.portraitPath` (export-import.ts:764) |
| BB-038 | Autosave touches DB every 60 s when idle | Already gated on `dirtySinceLastSave` flag (useAutoSave.ts:42) |
| BB-040 | `AboutDialog` may bypass `<Modal>` | Uses `useDialogA11y` hook, same focus/escape/restore semantics |
| BB-053 | `releaseCanvas` may leave ghost pixels | `acquireCanvas` already calls `clearRect` before handing out |

### Not executed in this session (24 findings + architecture)

Reasons grouped:

#### Needs a runnable env / multi-OS E2E (skipped autonomously)

- **BB-001** Electron 41 → 44 upgrade. M2 in the plan. High-risk, two
  majors of breaking changes, requires three-OS E2E. Recommend dedicated
  branch, full E2E + manual two-window smoke before merge.
- **BB-023** Two-window Playwright project. M8. Authoring belongs with
  somebody who can run `playwright test` locally to iterate selectors.
- **BB-024** `electron-rebuild` `postinstall` wiring. Touches install
  semantics; verify on macOS arm64 + Windows arm64.

#### Larger refactors that benefit from measurement first (M5 scaffolding now in place)

- **BB-008** fog `toDataURL` → `toBlob` + binary IPC + SQLite BLOB
  column. M effort. Two-step migration on the persistence side; needs
  M5 numbers (F-05) before committing.
- **BB-009** Split `PlayerApp` into memoised sub-components. M effort.
- **BB-010** `tokenBroadcast` per-token diff (skip full-roster scan).
  S effort but couples to BB-009; do them together.
- **BB-011** Serve images via `local-asset://` instead of base64 IPC.
  M effort, ties to M2 since `protocol.handle` semantics may shift.
- **BB-012** Memoise LOS visibility polygons by `(token.id, x, y,
  wallStore.version)`. M effort; the M5 `los.compute` mark will tell
  us how much it actually wins.
- **BB-015** Stream PDFs via `local-asset://`. Couples to BB-011.
- **BB-016** Player-bridge full-sync size cap. Couples to BB-008.
- **BB-018** Coalesce fog brush IPCs into one per RAF. M effort, also
  affected by BB-008's binary IPC.
- **BB-031** Stable `tokens` sort inside store. Touches the Zustand
  store contract; better to do alongside BB-009/BB-010.
- **BB-034** Narrow selectors on `Toolbar`. Trivial but wants verification
  that no consumer breaks.
- **BB-035** Narrow selectors on `CharacterSheetPanel`. Same as BB-034.
- **BB-045** Virtualise bestiary lists. Adds `react-window` dep.
- **BB-054** `TokenNode` memo equality / stable `statusEffects` ref.
  Tied to BB-031.

#### Larger correctness work

- **BB-021** Promote `@typescript-eslint/no-explicit-any` to error.
  M effort because the violation backlog needs to be triaged file-by-file.
- **BB-022** Add `no-floating-promises` / `no-misused-promises`. Same
  shape as BB-021; needs `eslint --fix` capability.
- **BB-025** Per-migration transactions in `applyMigration`. M effort,
  must land alongside an idempotency test (F-04).

#### Build / signing

- **BB-048** Re-enable Windows code signing. Trivial config change but
  shouldn't land without a CI smoke that confirms the env-var-absent
  path still produces an unsigned installer rather than failing.
- **BB-049** Linux AppImage signing / GPG releases. Distribution policy
  decision, not a code change.
- **BB-050** High-contrast option for `PlayerEyeOverlay`. UX call; design
  pass.
- **BB-052** Confirms BB-051 fixed the related literal; no work needed.

#### Architecture (M10 — design-doc gated)

- **Principle #1** Move LOS / image decode / PDF rasterisation off the
  renderer main thread (`utilityProcess` or `Worker`).
- **Principle #2** Capability-based preload (functions, not channel
  wrappers) with runtime schema validation.
- **Principle #4** Pure invertible-command undo engine.
- **Principle #5** CQRS-lite split between command and read models on
  the canvas.

## What I did not skip but cannot verify here

- The runtime CSP in M3 lists explicit dev-mode origins. Vite HMR may
  need extra entries on first launch — confirm in DevTools ▸ Console
  with the dev server running before merging.
- The IPC guard (M3) wraps `ipcMain.handle` at registration. Spot-checked
  that `installIpcGuard()` runs before any handler module registers in
  `main/index.ts`, but a runtime smoke (open DM window, exercise a
  delete operation, confirm it succeeds) is the right final gate.
- The fog-broadcast gate (M6.2) flips on `useSessionStore.getState().
  playerConnected`. The flag is reliably maintained by `usePlayerSync`
  per the grep, but a "DM-only prep mode then go-live" smoke confirms
  it.
- The `CharacterSheetSummary` IPC (M6.6) is exposed on the preload but
  no renderer caller uses it yet — the next perf-pass should switch
  the panel from `listByCampaign` to `listSummaryByCampaign` + lazy
  `get` on selection.

## How to keep going

Recommend M2 (Electron 44 upgrade) on a separate branch with full
three-OS E2E before merging anything else. After M2 lands, M6 items
26–31 (fog binary IPC, PlayerApp split, LOS memoisation) are the
highest-leverage perf wins; the M5 perf-mark scaffolding is already in
place to validate each before/after.

For the lint / type tightening (M7) the recommended sequence is:
1. Promote `no-explicit-any` to `error` and let CI list violations.
2. Triage in batches by file; per-file `eslint-disable` for items that
   touch the IPC / preload boundary (those are the ones the rule was
   added to catch).
3. Add `no-floating-promises` after the `any` pass clears.

## Branch state

```
M1 → M3 → M4 → M5 → M6 → M9
on claude/audit-analysis-action-plan-Oc24L
6 commits, ~620 net lines, 0 production-runtime deps changed
```

No new packages were added at runtime; `@electron/fuses` was promoted
from transitive to explicit devDependency.
