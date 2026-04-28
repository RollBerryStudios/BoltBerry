# Phase 6 — Action Plan

Synthesises Phases 0–5 into a sequenced, executable plan. Each work item maps back to one or more `BB-###` finding IDs. Effort buckets: **S** ≤ 0.5 day · **M** 0.5–2 days · **L** 2–5 days.

---

## A. Evaluation of the audit

**Scope coverage:** Strong. Phase 0 ground-truth is concrete (versions, IPC channel counts, layer counts) and 55 findings in Phase 1 are evidence-backed with file:line references. Phases 2–3 corroborate the picture against external sources and design principles.

**Confidence by finding type:**
- **High confidence (act now):** Build/release config (BB-001, BB-002, BB-004, BB-005), security flags (BB-003, BB-039, BB-041–43), CSP (BB-006), prior-QA carryovers (BB-029, BB-030, BB-033, BB-036, BB-037).
- **Medium confidence (verify, then act):** Performance findings tied to behaviour (BB-007, BB-008, BB-011, BB-012, BB-018, BB-019). These are credible but should be confirmed with `performance.mark` before invasive refactors — see Phase 5 followups.
- **Inferred (read flagged file before fixing):** BB-031, BB-034, BB-035, BB-040, BB-053, BB-054 are tagged "inferred from earlier analysis." Open the file first to confirm the symptom still matches.

**What the audit does not cover:** No runtime measurements, no actual dependency CVE scan output (`npm audit` not run), no Konva docs (404), no X / Twitter signal. BB-055 is explicitly hypothetical. F-01 through F-10 in Phase 5 are unmeasured.

**Verified live against the repo (2026-04-28):** `release.yml` still has `lfs: false` on all three jobs; no `afterPack` / fuse script exists; zero `senderFrame` references in `src/main`. The three highest-leverage criticals are real and unfixed.

---

## B. Findings by severity

| Severity | Count | Cumulative effort (rough) |
|---|---|---|
| Critical | 5 | 1 L + 4 S/M ≈ 5–8 days |
| High | 15 | mostly M ≈ 12–18 days |
| Medium | 20 | mix S/M ≈ 8–12 days |
| Low | 10 | mostly S ≈ 3–5 days |
| Nit | 5 | S ≈ 1–2 days |
| **Total** | **55** | **~30–45 dev-days** |

Plus ~5 days of measurement work to validate Phase 5 hypotheses before committing to the M-sized perf refactors.

---

## C. Sequenced milestones

Designed so each milestone is independently shippable and de-risks the next. **Do not parallelise M1 and M2** — both touch the build pipeline and would conflict.

### M1 — Ship-blocker hardening (week 1, ~3 days)

Goal: stop shipping broken/insecure installers. Pure config changes; no app-code risk.

| # | Task | Findings | Effort | Verification |
|---|---|---|---|---|
| 1 | Flip `lfs: true` in `release.yml` (3 jobs) | BB-004 | S | Add CI step `file resources/token-variants/*/* \| grep -c ASCII` returns 0 |
| 2 | Add `scripts/afterPack.mjs` calling `flipFuses` (RunAsNode off, NodeCli off, NodeOptions off, AsarIntegrity on, OnlyLoadAppFromAsar on); wire `afterPack` in `electron-builder.yml` | BB-002, BB-005 | S | Smoke test: built binary refuses `--inspect` |
| 3 | Tighten `webPreferences` on both windows: `nodeIntegrationInWorker: false`, `experimentalFeatures: false`, `allowRunningInsecureContent: false`; add no-op `will-attach-webview` | BB-041, BB-042, BB-043 | S | Read-only audit pass |
| 4 | Drop `secure: true` on `local-asset` scheme | BB-039 | S | Smoke: app still loads images |
| 5 | Run `npm audit --production`; record output; fix or accept each finding | BB-055 | S | Output committed to `audit/npm-audit-baseline.txt` |

**DoD:** Tagged release artifact contains real LFS assets, fuses are flipped, security flags are explicit. No code paths changed.

---

### M2 — Electron 44 upgrade (week 2, ~3–5 days)

Single L task, high blast radius — do it on its own branch.

| # | Task | Findings | Effort |
|---|---|---|---|
| 6 | Bump `electron` to `^44.0.0`; review v42/43/44 breaking changes; run full E2E + manual two-window smoke on macOS/Windows/Linux | BB-001 | L |

**Risks:** `protocol.handle` semantics may shift (affects `local-asset`); `webPreferences` defaults may change; `better-sqlite3` ABI may need rebuild.

**Sequencing note:** M2 first because subsequent IPC and CSP work should target the supported runtime. Don't refactor on top of an EOL Electron.

**DoD:** Two-window flow, PDF viewer, audio playback, fog/token sync all green on three OSes. E2E suite passes.

---

### M3 — IPC trust boundary (week 3, ~3–4 days)

The single biggest security gap after the build hardening.

| # | Task | Findings | Effort |
|---|---|---|---|
| 7 | Implement `requireDMFrame(event)` in `src/main/ipc/validators.ts`; verify against `getDMWindow()?.webContents.mainFrame` | BB-003 | S |
| 8 | Wrap every `ipcMain.handle` across 25+ handler files; start with destructive verbs (`delete`, `set`, `save`); minimum sender check on read-only handlers | BB-003 | M |
| 9 | Replace raw `throw new Error` in token coercers with `IpcValidationError`; return `{ ok: false, reason }` to renderer | BB-017 | S |
| 10 | Add runtime CSP via `session.webRequest.onHeadersReceived` for both windows (mirror the existing meta tag) | BB-006 | S |

**DoD:** Renderer DevTools console cannot invoke `tokens:delete` against the main process. Lint rule or codemod prevents new `ipcMain.handle` registrations without the guard.

---

### M4 — Quick-win correctness fixes (week 3–4, ~2 days)

All the prior-QA carryovers that are S-effort and well-isolated. Bundle into one PR.

| # | Task | Findings | Effort |
|---|---|---|---|
| 11 | Initiative timer: decrement after cursor move only when crossing round boundary; add unit test for mid-round start | BB-030 (#4) | M |
| 12 | Fog history cap: change to keep `<= 50`; add unit test | BB-029 (#13) | S |
| 13 | `gridDetect.ts`: bound checks in `findTopPeaks` and `harmonicBonus`; unit test with `signal.length < maxLag` | BB-033 (#7) | S |
| 14 | `drawing-handlers.ts`: throw `IpcValidationError` on JSON parse failure; surface toast | BB-028 (#11) | S |
| 15 | `remapPaths()`: include `character_sheets.portrait_path` | BB-036 (#15) | S |
| 16 | Extract `DEFAULT_GRID_COLOR` to `src/shared/defaults.ts` and import everywhere | BB-037 (#20) | S |
| 17 | `useAutoSave`: gate `triggerSave` on a `dirtySinceLastSave` flag | BB-038 (#72) | S |
| 18 | Promote integrity-check failure to a blocking dialog with "restore last `.bak`" action | BB-026 | S |
| 19 | Surface token-variant seed errors in status bar instead of swallowing | BB-027 (#18) | S |

**DoD:** Each fix has a regression test where reasonable. Prior-QA findings #4, #7, #11, #13, #15, #18, #20, #72 close.

---

### M5 — Measurement scaffolding (week 4, ~2 days)

Before doing the M-sized perf refactors, install the instrumentation Phase 5 asks for. Cheap, and prevents premature optimisation.

| # | Task | Findings / Followups | Effort |
|---|---|---|---|
| 20 | Add `performance.mark`/`measure` helpers (no-ops in prod) wrapping: LOS compute, fog `commitFogSave`, `useImage` load, `diffTokens`, `wallIndex` rebuild | F-03, F-05, F-06, F-09 | S |
| 21 | Add structured-JSON path to `logger.ts`; debug toggle for IPC trace | Principle #10 | S |
| 22 | Run the Phase 5 hypothesis tests; record numbers in `audit/measurements.md` | F-01..F-09 | M |

**DoD:** Each F-### hypothesis has a confirmed/refuted verdict with a number attached. Drop the refactors that don't move the needle.

---

### M6 — High-impact performance refactors (week 5–6, ~5–8 days)

Order chosen so each refactor stands alone and the early ones unblock later ones (e.g., fog binary IPC requires the storage column changes).

| # | Task | Findings | Effort |
|---|---|---|---|
| 23 | Serve renderer images via `local-asset://`; remove `getImageAsBase64` and base64 IPC roundtrip | BB-011 | M |
| 24 | `useImage` LRU: track originating object URL, call `URL.revokeObjectURL` on eviction | BB-007 (#62) | S |
| 25 | LOS visibility cache keyed by `(token.id, x, y, wallStore.version)` | BB-012 | M |
| 26 | Fog `toDataURL` → `toBlob` + `ArrayBuffer` IPC; SQLite column to raw `BLOB`; player uses `createImageBitmap` | BB-008 (#59), BB-016 | M |
| 27 | Coalesce fog brush ops into one batched IPC per `requestAnimationFrame` | BB-018 | M |
| 28 | Reuse `exploredCtxRef` / `coveredCtxRef` in fog brush loop (drop `getContext` calls) | BB-032 (#60) | S |
| 29 | Gate `sendFogDelta` / `sendFogReset` on `playerConnected` | BB-013 (#63) | S |
| 30 | `tokenBroadcast`: maintain `lastTokenMap` ref; diff only the changed token | BB-010 | S |
| 31 | Split `PlayerApp` into memoised `PlayerMapLayer` / `PlayerTokenLayer` / `PlayerFogLayer` / `PlayerLightingLayer` / `PlayerHandoutOverlay` | BB-009 | M |
| 32 | Narrow selectors / `useShallow` on `Toolbar`, `CharacterSheetPanel`, and any other whole-store readers | BB-034, BB-035 | S |
| 33 | Stable token sort: re-sort only on `zIndex` mutations; keep array reference when order unchanged | BB-031 | S |
| 34 | `MapLayer`: destroy old `Konva.Image` on unmount; cache by `imagePath+rotation` | BB-019 (#65) | S |
| 35 | Add `useDebouncedValue(query, 200)` + `useMemo` to bestiary search | BB-020 (#64) | S |
| 36 | Add `react-window` to `MonstersTab` / `ItemsTab` / `SpellsTab` | BB-045 (#57) | M |
| 37 | New `character-sheets:list-summary` minimal-projection handler; lazy-load full sheet on open | BB-014 | S |
| 38 | Replace `compendium:read` base64 path with streaming via `local-asset://` | BB-015 | S |

**DoD:** Phase 5 measurements re-run, regressions caught, all changes individually reverted-able. P50 frame time on the DM window with 100 tokens & lit characters stays at ≥ 55 fps during drag.

---

### M7 — Lint / type / data-integrity tightening (week 6, ~2–3 days)

| # | Task | Findings | Effort |
|---|---|---|---|
| 39 | `@typescript-eslint/no-explicit-any`: `warn` → `error`; fix violations | BB-021 | M |
| 40 | Add `no-floating-promises` and `no-misused-promises`; fix violations | BB-022 | M |
| 41 | Per-migration transactions in `applyMigration`; log step status; idempotency test | BB-025, F-04 | M |
| 42 | Wire `electron-rebuild` into `postinstall`; document Xcode CLI / VS Build Tools requirement | BB-024 | S |
| 43 | Top-level `import` for `fs/promises` in `app-handlers.ts` | BB-044 | S |
| 44 | Catch + surface `copyFileSync` failures in token-variant seed | BB-046 | S |

**DoD:** CI fails on `any` and floating promises. Migrations are individually transactional and idempotent under simulated mid-flight crash.

---

### M8 — Two-window E2E + observability (week 7, ~3 days)

| # | Task | Findings | Effort |
|---|---|---|---|
| 45 | New Playwright project: opens DM window → "Live gehen" → spawns player → asserts token visibility, fog parity, full-sync after disconnect | BB-023 | M |
| 46 | IPC trace toggle (env var or DM-only debug menu); structured JSON log option | Principle #10 | S |

**DoD:** Two-window regressions caught in CI rather than manual QA.

---

### M9 — Polish / accessibility / build trust (week 7–8, ~2 days)

| # | Task | Findings | Effort |
|---|---|---|---|
| 47 | Audit all dialog components for `<Modal>` wrapper usage; convert `AboutDialog` if needed | BB-040 | S |
| 48 | High-contrast option for `PlayerEyeOverlay` hidden-token markers | BB-050 | S |
| 49 | Move all `ShortcutOverlay` literals into `en.json` / `de.json` | BB-051 | S |
| 50 | `releaseCanvas` clears pixels before pool reuse | BB-053 | S |
| 51 | `TokenNode` memo: stabilise `statusEffects` reference in parent | BB-054 | S |
| 52 | macOS entitlement: switch `allow-unsigned-executable-memory` → `allow-jit` | BB-047 | S |
| 53 | Re-enable Windows `certificateFile` (no-op when env var absent); document Linux GPG signing path | BB-048, BB-049 | S |

---

### M10 — Architecture work (out of scope for this cycle)

Track but do not commit yet. These are the principles-scorecard violations that need design-doc-level discussion before any code lands.

- Move heavy compute (LOS, image decode, PDF rasterisation, FFT grid detect) off the renderer main thread (`utilityProcess` or `Worker`). Principle #1.
- Capability-based preload (functions, not channel wrappers) with runtime schema validation. Principle #2.
- Pure invertible-command undo engine; replace callback-based `undoStore`. Principle #4.
- CQRS-lite split between command and read models on the canvas. Principle #5.

Recommend a short design doc per item before scheduling.

---

## D. Critical path

```
M1 ──► M2 ──► M3 ──► M5 ──► M6 ──► M8
            │
            ├──► M4 (parallel)
            └──► M7 (parallel after M3)
M9 can run in parallel from week 4.
```

M1 must ship first because every release before it is broken (LFS) and exploitable (fuses). M2 second because everything below targets a supported runtime. M3 third because the IPC audit protects the surface that M6's perf changes will touch. M5 before M6 to avoid speculative refactors.

---

## E. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Electron 44 upgrade breaks `local-asset` protocol | M | H | Land M2 on a feature branch; full E2E + manual two-window before merging |
| Sender-frame guard (M3) breaks an unanticipated relay path | M | M | Roll out per-handler-file in stages; keep a per-channel allowlist for one release |
| Fog binary-IPC change (item 26) corrupts existing `.bb` campaign DBs | L | H | Migration that keeps reading legacy base64 column for one release; write-side only flipped after backfill |
| Performance refactors hide regressions | M | M | M5 instrumentation lands first; each M6 task ships with before/after numbers |
| `no-explicit-any` flip (item 39) creates a multi-day fix backlog | H | L | Allow per-file `eslint-disable` opt-out with TODO comment, tracked separately |

---

## F. Definition of done (whole programme)

- All 5 Critical findings closed.
- All High findings either closed or measurement-refuted.
- Prior-QA carryovers (#4, #7, #11, #13, #15, #18, #20, #57, #59, #60, #62, #63, #64, #65, #72) closed.
- CI gates: LFS-pointer detection, `npm audit` baseline, two-window E2E, `no-floating-promises`, `no-explicit-any`.
- Phase 5 hypotheses each have a verdict with a number.
- Architecture items in M10 have at least a written design doc.

---

*(End of Phase 6 — action plan)*
