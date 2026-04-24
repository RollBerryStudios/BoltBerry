# BoltBerry — QA Remediation Action Plan

**Companion to:** `QA_REPORT_2026-04-23.md` (82 findings)
**Branch:** `claude/full-qa-testing-6gOCb`
**Date:** 2026-04-23

This plan groups the 82 findings into **13 workstreams** so related fixes
ship together, share regression tests and minimise merge conflicts. Each
workstream lists: scope, addressed findings (numbered per the QA report),
files touched, technical approach, acceptance criteria and effort estimate.

Effort scale: **S** ≤ 0.5 day · **M** 0.5–2 days · **L** 2–5 days · **XL** > 5 days.

---

## Roadmap (suggested order)

| # | Workstream | Priority | Effort | Findings closed |
|---|---|---|---|---|
| 1 | Token sync & IPC delta | P0 | L | #54, #55, #74 |
| 2 | LOS / wall spatial index | P0 | M | #56, #70 |
| 3 | Token-layer virtualisation | P0 | L | #57, #58, #61, #67 |
| 4 | Module-scoped state cleanup | P0 | S | #1, #2, #73 |
| 5 | IPC input hardening | P0 | M | #5, #8, #10, #14 |
| 6 | i18n completion | P0 | M | #17, #21–24 |
| 7 | Fog pipeline rewrite | P1 | L | #59, #60, #62 (img), #63, #66, #71 |
| 8 | Accessibility pass | P1 | L | #25–34, #36–47 |
| 9 | Image & asset cache lifecycle | P1 | S | #62, #65, #80 |
| 10 | Initiative & import correctness | P1 | M | #4, #9, #12, #15 |
| 11 | Player-bridge & sync robustness | P1 | M | #3, #6, #69 |
| 12 | Misc data integrity | P2 | M | #11, #13, #18, #19, #20 |
| 13 | Performance polish & DX | P2 | M | #64, #68, #72, #75–82 |

---

## WS-1 · Token sync & IPC delta protocol  *(P0 · L)*

**Closes:** #54 (10 Hz full-roster drag broadcast), #55 (full-roster on every
mutation), #74 (filter+map allocations).

**Problem.** `broadcastTokens` ships the full visible-token list on every
drag tick (10 Hz) and every mutation (HP, status, visibility). On dense
maps this saturates IPC and forces the player window to re-render the full
roster.

**Approach.**
1. Define a delta protocol in `src/shared/ipc-types.ts`:
   ```ts
   type TokenDelta =
     | { kind: 'upsert'; tokens: PlayerTokenView[] }
     | { kind: 'remove'; ids: number[] }
     | { kind: 'snapshot'; tokens: PlayerTokenView[] }   // initial / resync
   ```
2. Add `src/renderer/utils/tokenDiff.ts` — pure diff between previous and
   current visible-token snapshots; emits `upsert` only for changed fields.
3. Replace every `broadcastTokens(...)` call in
   `src/renderer/components/canvas/TokenLayer.tsx` and
   `src/renderer/components/canvas/CanvasArea.tsx` with `broadcastTokenDelta`.
4. Drag broadcasts: switch from `setTimeout`/100 ms throttle to a
   `requestAnimationFrame`-bound coalescer that flushes at most once per
   frame and only for the currently-dragged token id.
5. On player side (`PlayerApp.tsx`) merge upserts into the local map, drop
   removed ids, and treat `snapshot` as an authoritative reset.

**Files.** `src/shared/ipc-types.ts`, `src/preload/preload-dm.ts`,
`src/preload/preload-player.ts`, `src/main/ipc/player-bridge.ts`,
`src/renderer/components/canvas/TokenLayer.tsx`,
`src/renderer/components/canvas/CanvasArea.tsx`,
`src/renderer/PlayerApp.tsx`, new `src/renderer/utils/tokenDiff.ts`.

**Tests.**
- Unit: `tokenDiff` covers add / remove / move / no-op.
- Integration (vitest): simulate 50 tokens, drag one, assert exactly one
  `upsert` per RAF tick and zero broadcasts for unchanged tokens.
- Manual: open DM + player on same machine, drag a token in a 50-token
  encounter; verify player tracks within one frame.

**Acceptance.** IPC traffic during a 5-second drag drops by ≥ 90 %; player
view position lag ≤ 1 frame.

---

## WS-2 · LOS / wall spatial index  *(P0 · M)*

**Closes:** #56 (O(angles × walls)), #70 (no early-exit).

**Problem.** `losEngine.computeVisibilityPolygon` ray-casts every angle
against every wall segment. ~20 angles × 100+ walls = 2 000 ray tests per
visibility build, run on every lit-token move.

**Approach.**
1. Add `src/renderer/utils/wallIndex.ts` — uniform grid (cell ≈ 4 × grid
   size). On wall-store change, rebuild buckets keyed by cell. Each cell
   stores segment indices that overlap it.
2. In `losEngine.ts`, replace the inner `for (const seg of allSegs)` loop
   with a DDA traversal that visits only cells along the ray and tests
   only segments registered to those cells.
3. Memoise the index in the wall store via Zustand `subscribe`; expose a
   `getWallIndex()` selector.
4. Early-exit: once a hit at distance `t < cellTraversalRemaining` is
   found, skip remaining cells along the ray.

**Files.** new `src/renderer/utils/wallIndex.ts`,
`src/renderer/utils/losEngine.ts`,
`src/renderer/stores/wallStore.ts`,
`src/__tests__/losEngine.test.ts` (extend with index parity tests).

**Tests.**
- Property test: random wall configurations + random rays; index-based
  result matches brute-force result.
- Bench: existing `losEngine.test.ts` + a 200-wall scenario; assert ≥ 5×
  speed-up on a fixed seed.

**Acceptance.** Visibility polygon for 200 walls computes in < 2 ms on
reference hardware; no behaviour regressions in `losEngine.test.ts`.

---

## WS-3 · Token-layer virtualisation & subscription hygiene  *(P0 · L)*

**Closes:** #57 (no virtualisation), #58 (Zustand over-subscription), #61
(`sortedTokens` re-sort), #67 (clone-then-sort).

**Approach.**
1. Compute a `viewportRect` from `mapTransformStore` (offset + scale +
   stage size) memoised with `useMemo`.
2. In `TokenLayer.tsx` derive `visibleTokens` by filtering on viewport
   intersection (token bbox vs. rect with a 1-token margin).
3. Replace separate selectors with a single `shallow`-equality selector:
   ```ts
   const ui = useUIStore(useShallow((s) => ({
     selectedTokenIds: s.selectedTokenIds,
     activeTool: s.activeTool,
     gridSnap: s.gridSnap,
   })))
   ```
4. Cache `sortedTokens` keyed on `tokens` reference *and* a `zVersion`
   counter bumped only on z-index mutations; for non-z mutations reuse
   the previous sorted array via a stable id-keyed merge.
5. Wrap `TokenNode` in `React.memo` with explicit equality (compare
   props that actually drive paint: x, y, scale, selected, hp, statusEffects
   length, marker, locked, visibleToPlayers).

**Files.** `src/renderer/components/canvas/TokenLayer.tsx`,
`src/renderer/stores/tokenStore.ts` (add `zVersion`),
`src/renderer/stores/uiStore.ts` (no change — confirm shape).

**Tests.**
- Vitest with `@testing-library/react`: render 200 tokens, assert
  `TokenNode` paint count == viewport-intersecting count.
- Manual: pan/zoom on a 200-token map; FPS ≥ 55.

**Acceptance.** Pan/zoom on 200-token map stays at monitor refresh rate;
React profiler shows `TokenNode` re-renders only when its own props change.

---

## WS-4 · Module-scoped state → store/ref refactor  *(P0 · S)*

**Closes:** #1 (`appStore.savedTimer`), #2 (`undoStore.warnedFull`),
#73 (`FogLayer.saveTimer`).

**Approach.**
1. `appStore.ts`: move `savedTimer` into store state; clear and re-arm via
   `set((s) => ({ savedTimer: ... }))`. Use `getState()` in `setSaved` to
   check the latest timer reference before clearing.
2. `undoStore.ts`: hoist `warnedFull` into store state; reset via
   `clearHistory()` and explicit user toast acknowledgement.
3. `FogLayer.tsx`: replace module-level `let saveTimer` with a
   `useRef<ReturnType<typeof setTimeout> | null>(null)` cleared in the
   effect cleanup.

**Tests.** Extend `__tests__/appStore.test.ts` to cover rapid
`setSaving`/`setSaved` interleaving; add a vitest for `undoStore` warning
re-emission across mount/unmount.

**Acceptance.** No module-level `let` timers in `src/renderer/**` (enforce
with a custom ESLint rule or grep test in CI).

---

## WS-5 · IPC input hardening  *(P0 · M)*

**Closes:** #5 (FOG_SAVE no validation), #8 (non-integer coercion),
#10 (compendium path traversal), #14 (markerColor not validated).

**Approach.**
1. Introduce `src/main/ipc/validators.ts` with reusable schemas:
   - `coerceInt(value, { min?, max? })` — rejects non-integers and out-of-range.
   - `coerceHexColor(value)` — accepts `#RGB`, `#RRGGBB`, `#RRGGBBAA`; rejects
     URLs, expressions, overlong strings.
   - `assertWithinRoot(absPath, root)` — `path.resolve` + `path.relative`
     check; throws `IpcValidationError` if path escapes root.
2. `fog-handlers.ts` `FOG_SAVE`: cap incoming data URL at e.g. 8 MiB; verify
   `data:image/png;base64,` prefix; wrap upsert in `try/catch` and reply
   `{ ok: false, reason }` on failure.
3. `token-handlers.ts`: replace `coerceNumber` with `coerceInt` for
   `size`, `hp_current`, `hp_max`, `zIndex`. Replace `markerColor` cast
   with `coerceHexColor`.
4. `compendium-handlers.ts` `COMPENDIUM_READ`: resolve `filePath` against
   the compendium root *before* opening; reject if `assertWithinRoot` fails.

**Tests.** Extend `__tests__/ipc-channel-coverage.test.ts` and add a new
`validators.test.ts` covering rejection cases (oversize blob, `1.5`, bad
hex, `../etc/passwd`).

**Acceptance.** All four handlers reject malformed input with structured
errors; renderer surfaces them via toast.

---

## WS-6 · i18n completion  *(P0 · M)*

**Closes:** #17 (German toast in `undoStore`), #21 (`fallbackLng: de`),
#22 (`SessionStartModal` strings), #23 (`SetupWizard` strings),
#24 (`ShortcutOverlay` labels).

**Approach.**
1. `src/renderer/i18n/index.ts`: change `fallbackLng` from `'de'` to
   `'en'`; add `returnEmptyString: false` so missing keys log a warning.
2. Extract every hardcoded German string from the four affected files into
   `src/renderer/i18n/locales/{de,en}/*.json` under a sensible namespace
   (e.g. `setupWizard.welcome.title`).
3. Replace literals with `t('namespace.key')`.
4. Strengthen `scripts/check-i18n.mjs`:
   - Fail CI if any key exists in only one locale.
   - Walk `src/renderer/**/*.tsx`, flag string literals containing
     non-ASCII letters (heuristic for missed German strings).
5. Add a new test `__tests__/i18n-symmetry.test.ts` invoking the script.

**Files.** `src/renderer/i18n/index.ts`, locale JSONs,
`src/renderer/components/SessionStartModal.tsx`,
`src/renderer/components/SetupWizard.tsx`,
`src/renderer/components/ShortcutOverlay.tsx`,
`src/renderer/stores/undoStore.ts`, `scripts/check-i18n.mjs`.

**Acceptance.** `npm run check:i18n` passes; switching the UI to English
yields zero German strings in those four surfaces.

---

## WS-7 · Fog pipeline rewrite  *(P1 · L)*

**Closes:** #59 (`toDataURL` blocks main thread), #60 (context re-acquired
per op), #63 (unconditional fog deltas), #66 (undo replays full history),
#71 (canvas churn per map).

**Problem.** Fog operations re-acquire 2D contexts, snapshot via
synchronous `toDataURL` and broadcast to a possibly-absent player window;
undo replays the full history; each map switch allocates four fresh
canvases.

**Approach.**
1. **Cached contexts.** In `FogLayer.tsx`, capture
   `exploredCtxRef = useRef<CanvasRenderingContext2D | null>(null)` and
   `coveredCtxRef` once when canvases are created; reuse across `applyOp`,
   `rebuildFog`, `clearRect`.
2. **Inverse-delta undo.** Store the painted region's `ImageData` (or a
   compact RLE) before each op. Undo applies the inverse `ImageData`
   instead of replaying history. Drop history-replay path; keep only the
   delta stack (cap = 50).
3. **Replace `toDataURL` snapshots** at session boundaries with binary
   `canvas.toBlob('image/png')` (async, off-main-thread). Persist via
   `arrayBuffer` IPC instead of base64 strings (≈ 33 % smaller, no UTF-8
   re-encode).
4. **Gate fog broadcasts.** Add `playerConnected` selector to
   `sessionStore`; in `FogLayer.tsx` skip `sendFogDelta` when
   `playerConnected === false`. On (re)connect, send a `snapshot` op so the
   player rebuilds.
5. **Canvas pool.** Add `src/renderer/utils/canvasPool.ts` keyed by
   `${w}x${h}`; `acquire(w,h)` returns a cleared `<canvas>` from the pool
   or creates one; `release(canvas)` returns it. Use for the four fog
   canvases. Keep at most 8 canvases in pool.

**Files.** `src/renderer/components/canvas/FogLayer.tsx`, new
`src/renderer/utils/canvasPool.ts`, `src/renderer/stores/fogStore.ts`,
`src/renderer/stores/sessionStore.ts`,
`src/main/ipc/fog-handlers.ts`, `src/preload/preload-dm.ts`.

**Tests.**
- `__tests__/fogStore.test.ts` extended with inverse-delta undo round-trip.
- New vitest: `canvasPool` acquire/release reuses instances and clears
  pixels.
- Manual: undo of a 50-op fog history completes in < 50 ms; rapid map
  switching does not increase Chromium task-manager memory.

**Acceptance.** Undo / redo on full 50-op stack ≤ 50 ms; no
`toDataURL` calls in fog hot paths; map switches reuse pooled canvases.

---

## WS-8 · Accessibility & UX pass  *(P1 · L)*

**Closes:** #25 (undo discoverability), #26 (disabled state), #27 (modal
focus traps), #28 (HP colour-only), #29 (small chevrons), #30 (label
association), #31 (silent error toasts), #32 (no drop-zone feedback),
#33 (tab role/state), #34 (inline form errors), #36–47 (medium UX/a11y
items).

**Approach.**

A. **Modal infrastructure.** Add `src/renderer/components/shared/Modal.tsx`
that wraps content in a focus-trapped, ESC-closeable, role="dialog"
container. Migrate `SessionStartModal`, `MonitorDialog`, `AboutDialog`,
`SetupWizard` step screens.

B. **Form primitives.** Add `src/renderer/components/shared/Field.tsx`:
`<Field label="…" hint="…" error="…">` automatically wires `htmlFor`,
`id`, `aria-describedby`. Refactor `NpcCloneWizard`, `WikiEntryForm`,
`CharacterSheetPanel` form fields, `TokenLibraryPanel` text inputs.

C. **Tab primitives.** Add `Tabs`/`TabPanel` components with
`role="tab" / role="tabpanel" / aria-selected / aria-controls`; raise
active-tab contrast via a 2 px underline + bold text. Migrate right
sidebar tabs and TokenLibraryPanel tabs.

D. **HP redundancy.** In the canvas `TokenNode`, add a numeric HP label
(e.g. `12/30`) toggled via a per-token visibility prop and a global
"Show HP numbers" toolbar setting. Default to *on* for accessibility.

E. **Drag-drop affordance.** In `CanvasArea.tsx`, on `dragenter`, set a
`isDropTarget` state and render an inset 2 px dashed accent border on the
stage. Reset on `dragleave/drop`.

F. **Visible button labels.** Replace icon-only undo/redo with
icon + short text (e.g. `↶ Undo`); show last-action label inline when
present (e.g. `↶ Undo · move token`).

G. **Error surfacing.** Add `useErrorToast` hook that wraps any async
action; replace ad-hoc `.catch(console.error)` in
`TokenLibraryPanel.tsx:286`, `AssetBrowser.tsx:72` etc. with
`reportError(t('errors.tokenInsertFailed'), err)`.

H. **Touch targets.** Enforce a 24 × 24 px minimum on icon buttons via a
shared `IconButton` component; bump the chevron in `LeftToolDock.tsx:296`
to 24 × 24 with internal 12 × 12 glyph.

I. **Contrast.** Bump `--text-muted` from `#50607A` to `#7388A6`
(meets ≥ 4.5:1 on `--bg-base`) and audit usage with a Storybook contrast
checker (or a CI script using `wcag-contrast`).

J. **Standardise shortcut notation.** Replace symbol-only `⇧` etc. with
`Shift`/`Ctrl`/`Alt`/`⌘` (the latter only on macOS via
`navigator.platform`).

K. **Multi-select discovery.** Add a one-time tooltip "Shift-click to
select multiple" surfaced after the first single token-selection of the
session.

L. **Prep-mode banner.** Add a slim top banner when
`sessionMode === 'prep'`: "Prep Mode — no broadcast to players".

**Tests.**
- Vitest + `@testing-library/react`: focus trap traps Tab cycling within
  the modal; ESC fires `onCancel`.
- Snapshot: `Field` renders correct `htmlFor`/`id` pairs.
- Manual: keyboard-only walk-through (Tab through every primary surface);
  axe-core run via `@axe-core/playwright` in `e2e/`.

**Acceptance.** No `axe-core` violations on launch screens, Setup Wizard,
DM main view, command palette and About dialog; all forms keyboard-fillable.

---

## WS-9 · Image & asset cache lifecycle  *(P1 · S)*

**Closes:** #62 (LRU leaks blob URLs), #65 (no map-image memo across
switches), #80 (no retry on image error).

**Approach.**
1. In `src/renderer/hooks/useImage.ts`, store both the `HTMLImageElement`
   and the originating `objectUrl` (if any). On LRU eviction, call
   `URL.revokeObjectURL(objectUrl)` before deleting from the Map.
2. Add a separate `mapImageCache` keyed by absolute path + rotation,
   capped at 4 entries (covers a few maps in rotation). `useRotatedImage`
   reads/writes through it.
3. Add `useImage` retry: on `error`, schedule one retry after 500 ms;
   second failure surfaces a placeholder + `errors.imageLoad` toast.

**Tests.** Vitest with mocked `Image` constructor: simulate eviction,
assert `revokeObjectURL` is called; simulate error, assert retry happens
once.

**Acceptance.** Long-session memory growth (manual: 30 min token-library
scrolling) bounded; previously-loaded maps reload instantly.

---

## WS-10 · Initiative & import correctness  *(P1 · M)*

**Closes:** #4 (effect timer decrement), #9 (export version migration),
#12 (`updateEntry` silent miss), #15 (portrait remap on import).

**Approach.**
1. **Effect timers.** Refactor `nextTurn` in `initiativeStore.ts:76-88` so
   timers decrement *after* moving the cursor to the next entry, only when
   the move crossed a round boundary detected via comparing pre/post
   indices and round counter. Add explicit unit tests for the start-mid-round
   case.
2. **Export migrations.** In `src/main/ipc/export-import.ts`, introduce a
   `migrations` table:
   ```ts
   const migrations: Record<number, (data: unknown) => unknown> = {
     8: (d) => ({ ...d, audio_boards: [], grid_color: '#FFFFFF57' }),
     // future: 9: …
   }
   ```
   On import, run sequential migrations until version matches
   `EXPORT_VERSION`. Throw a clear error for forward versions (newer file
   than app).
3. **Silent `updateEntry` miss.** Either log a `console.warn` (DEV only)
   or rely on TypeScript by changing the signature to return `boolean`
   for the test surface; throw in `__tests__` builds.
4. **Portrait remap.** Extend `remapPaths()` in `export-import.ts` to walk
   character sheets and rewrite `portraitPath` using the same asset id →
   new path map used by token images.

**Tests.** Extend `__tests__/initiativeStore.test.ts` with the
mid-round-start case; extend `__tests__/export-import-roundtrip.test.ts`
to round-trip a v8 fixture and verify the upgrade.

**Acceptance.** All new + existing tests pass; loading a v8 archive yields
a v9 in-memory campaign with correct portraits.

---

## WS-11 · Player-bridge & sync robustness  *(P1 · M)*

**Closes:** #3 (player-bridge null race), #6 (fog desync on mode flip),
#69 (pointer timeout cleanup).

**Approach.**
1. **Single send helper.** In `src/main/ipc/player-bridge.ts`, add
   `safeSendToPlayer(channel, payload)` that resolves `getPlayerWindow()`,
   confirms `!isDestroyed()` *and* `!webContents.isDestroyed()` once, then
   sends. Route every send through it. Same for `safeSendToDM`.
2. **Atomic fog version + apply.** In `PlayerApp.tsx:232-241` move the
   fog-version increment inside the same branch that successfully applied
   the delta. If canvases are not ready, queue the delta in a ref
   (`pendingFogOps`) and replay them on canvas-init.
3. **Pointer cleanup.** Store the timeout id in
   `pointerHideTimeoutRef = useRef<number | null>(null)`; on each pointer
   move clear the previous, set new, and clear in the effect cleanup.

**Tests.** Add `__tests__/player-bridge.test.ts` mocking
`BrowserWindow.webContents` lifecycle; assert `safeSendToPlayer` is a
no-op after `destroy`. Add a vitest for the queued-fog replay.

**Acceptance.** Closing the player window mid-broadcast does not throw;
mode-toggle stress test (rapid F12 mode flip while DM paints fog) keeps
fog versions monotonic and canvases consistent.

---

## WS-12 · Misc data integrity  *(P2 · M)*

**Closes:** #11 (drawing JSON parse silent loss), #13 (fog history
off-by-one), #18 (`ensureTokenVariantsSeeded` swallows errors), #19
(character-sheet writes outside transactions), #20 (grid-colour default
drift).

**Approach.**
1. `drawing-handlers.ts:29-45` — on JSON parse error, throw an
   `IpcValidationError`; surface in renderer as a non-blocking toast
   referencing the bad row id, and *do not* return an empty drawing.
2. `fogStore.ts:41, 62` — change `slice(-49)` to `slice(-50)` *after* the
   `push`, or `slice(-49)` *before* push. Add a unit test asserting the
   stack length never exceeds the cap.
3. `compendium-handlers.ts:106-130` — log the full error and re-throw
   on initial seeding (first launch). On subsequent launches, fall back
   to the previous index but raise an `app:variants-seed-failed` IPC
   surfaced in the status bar.
4. `character-sheet-handlers.ts:76-119` — wrap the multi-statement update
   in `db.transaction(() => { … })()` from better-sqlite3.
5. Grid colour default — declare `DEFAULT_GRID_COLOR` in
   `src/shared/defaults.ts` and import wherever schema, handlers and
   exports need it.

**Tests.** Extend `__tests__/migration-chain.test.ts` for the centralised
default; add `fogStore` cap-overflow test; add a transaction failure
simulation for character-sheet writes (mock `db.prepare` to throw).

**Acceptance.** Cap test passes; corrupt drawing rows surface to user;
character-sheet partial writes roll back.

---

## WS-13 · Performance polish & DX  *(P2 · M)*

**Closes:** #64 (bestiary search), #68 (grid FFT allocations), #72
(unconditional autosave), #75–82 (low-severity perf items).

**Approach.**
1. **Bestiary search debounce.** In `MonstersTab.tsx`, wrap `query` updates
   in a 200 ms debounce hook (`useDebouncedValue`). Memoise the lower-cased
   query. Same for items / spells tabs (apply uniformly).
2. **Reusable FFT buffers.** In `gridDetect.ts`, allocate row/col scratch
   buffers once at the top of `detectGrid`; reuse across iterations. Add
   a small `Float64Array` pool keyed by power-of-two length.
3. **Conditional autosave.** Track a `dirtySinceLastSave` flag in
   `appStore`; `useAutoSave` only invokes `triggerSave` when the flag is
   set, then clears it.
4. **Status-effect set.** Internally use `Set<string>` for status effect
   computation; convert to array only at IPC / render boundary.
5. **Token name/HP debounce.** Wrap inline edit `onChange` in a 100 ms
   debounce that flushes on blur or Enter.
6. **PDF render task.** Increment a `renderToken` ref per page change;
   ignore `renderTask.promise` resolution if the token mismatches.
7. **Camera-sync throttle.** Coalesce camera saves and other map-level
   saves through a single `saveScheduler` that batches mutations into one
   IPC call per 600 ms.
8. **DrawingLayer math.** Lift `fontSize = 14 * scale` out of the render
   loop into a `useMemo([scale])`.
9. **Custom-menu listeners.** In `useCanvasContextMenu`, track listeners in
   a ref; clean up in the effect's return.
10. **Fog delta compression.** Optional: encode polygon `points` as
    Int16Array via structured-clone IPC to avoid JSON overhead.

**Tests.**
- Add `__tests__/useDebouncedValue.test.ts`.
- Bench gridDetect before/after via vitest `bench` (optional).
- Manual: confirm autosave skipped when idle (status bar stays "Saved",
  no DB write log).

**Acceptance.** Bestiary search feels instant on keystroke; autosave is a
no-op when nothing changed; DrawingLayer pan/zoom remains smooth.

---

## Cross-cutting tasks

- **CI gates.** Extend `npm run check:all` with:
  - `npm run lint` (ensure ESLint is wired into CI — see `.eslintrc.cjs`).
  - The new `i18n-symmetry` test.
  - An axe-core E2E pass via `@axe-core/playwright`.
- **ESLint rules.** Add `no-restricted-syntax` to forbid module-level
  `let` timers in `src/renderer/**`. Add `react/jsx-no-literals` (warn
  level) on the four high-i18n components.
- **Telemetry-free perf log.** Add a `--perf-log` CLI flag that writes a
  per-session summary (FPS, IPC counts, fog op timings) to `userData/`
  for opt-in regression tracking.

---

## Suggested PR breakdown

To keep reviews tractable, ship one PR per workstream, in roadmap order.
Bundle WS-4 + WS-11 (both small, both fix lifecycle bugs) and WS-12 +
WS-13 (data + polish) if reviewer bandwidth is short. Each PR should:

1. Include the QA report finding numbers in the description.
2. Add or update tests covering each closed finding.
3. Update `CHANGELOG.md` under `### Fixed` / `### Performance` /
   `### Accessibility` as appropriate.
4. Run `npm run check:all && npm run test:e2e` locally before push.

---

## Effort summary

| Priority | Effort | Workstreams |
|---|---|---|
| P0 | ~ 8–11 days | WS-1, 2, 3, 4, 5, 6 |
| P1 | ~ 7–10 days | WS-7, 8, 9, 10, 11 |
| P2 | ~ 3–5 days | WS-12, 13 |
| **Total** | **~ 18–26 days** | 13 workstreams, 82 findings |

A two-engineer pairing can close P0 + P1 in roughly three sprints; P2 fits
into a follow-up polish sprint.

