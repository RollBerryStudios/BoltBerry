# Phase 9 — Followups Action Plan

The Phase 8 context-menu rollout shipped 5 phases but deferred 4 polish items. The earlier Phase 6 plan also has open milestones (M2 Electron upgrade, M6 large-effort perf items, M7 lint tightening, M8 two-window E2E, M10 architecture). This is a single sequenced plan covering both buckets, so the next cycle has one source of truth.

Effort buckets: **S** ≤ 0.5 day · **M** 0.5–2 days · **L** 2–5 days.

---

## A. Phase 8 context-menu followups

### A.1 Sidebar map-row → engine
**Effort:** S · **Risk:** 🟢 Low · **Depends on:** none

Last `showContextMenu` IPC caller. Easiest item; ships full retirement of the native popup path for in-app menus.

**Approach.** Add a `list-row` resolver pattern: each list registers its menu spec at module load, the engine looks it up by `payload.entity`. LeftSidebar map row passes `{ kind: 'list-row', entity: 'map', payload: { mapId } }`; the resolver returns rename + delete sections.

Rip out the `showContextMenu` IPC + `ALLOWED_CONTEXT_MENU_ACTIONS` allowlist + the corresponding handler in `dialog-handlers.ts` once no caller remains. Net code drop: ~80 LOC across main + preload + renderer.

### A.2 Drawing right-click from any tool (JS hit-test)
**Effort:** M · **Risk:** 🟡 Medium · **Depends on:** none

Today the drawing menu only fires from the erase tool because `DrawingLayer` is non-listening for select / fog / wall / room tools. Rooms have the same situation, solved by point-in-polygon in `CanvasArea`. Drawings are heterogeneous (freehand strokes, rects, circles, text), so each shape needs its own predicate:

- **Freehand:** distance-to-polyline ≤ `width / 2 + 4px` (the +4 matches the Konva `hitStrokeWidth` we use in erase mode).
- **Rect:** point-in-rect with stroke tolerance.
- **Circle:** `|distance(point, centre) − radius| ≤ width / 2 + 4px`.
- **Text:** point-in-bounding-box (text is drawn at fixed font size).

Add a helper `hitTestDrawing(d, mapPos): boolean` and iterate on right-click in `CanvasArea`. Same envelope mechanism as rooms — push a `{ kind: 'drawing', drawing }` target if a hit, fall through otherwise.

**Risk note:** with many drawings the per-right-click iteration is O(n) but n is usually small (<100 per map). If profiling shows this matters later, add a spatial index keyed by bounding box.

### A.3 Token menu full migration
**Effort:** L · **Risk:** 🟡 Medium · **Depends on:** Phase 8 engine (done)

The current inline menu has three things that don't fit a flat menu:
1. **HP chips** (−5 / −1 / +1 / +5 buttons in a row).
2. **Status effect grid** with toggles.
3. **Marker colour grid** (6 swatches).

These are richer than what a `MenuItem.submenu` can express. The clean path is to extend the engine with **inline render slots**:

```ts
interface MenuItem {
  // … existing
  /** Custom React renderer instead of a plain row. The engine still
   *  handles positioning, dismissal, and keyboard nav; the renderer
   *  owns the visual + click semantics inside its row. */
  render?: (env: ContextEnvelope) => React.ReactNode
}
```

Then port the token menu section by section:
- **Identity** (rename, edit HP modal trigger): plain rows.
- **HP chips:** `render: () => <HpChips token={...} />`.
- **Status / Marker / Faction:** submenus with `submenu: [...]` of plain items.
- **Z-order, vis, light, copy / paste:** plain rows.
- **Delete:** danger row.

Once migrated, drop TokenLayer's ~315-line inline menu JSX entirely. The "In Room" footer block (Phase 4) becomes automatic — the engine already appends under-target sections.

**Why it's L:** lots of small affordances to test per row, plus the inline-edit flows (rename, HP, AC) that currently use `setEditingId / setEditingHpId / setEditingAcId` need a clear new home. Recommend pulling those into a separate `<TokenInlineEditPopover>` triggered by the menu's "Rename" / "Edit HP" rows so the menu itself stays composable.

### A.4 Multi-select on walls / pins
**Effort:** L · **Risk:** 🟡 Medium · **Depends on:** Phase 8 engine (done) for the menu surface

Walls and pins have no multi-selection mechanism today. Adding the selection store + UI surfaces is a feature, not a polish; the menu items are easy once the selection exists.

**Phased approach:**

1. **uiStore additions:** `selectedWallIds: number[]`, `selectedPinIds: number[]`, plus setters / toggle / clear.
2. **WallLayer / GMPinLayer:** rubber-band selection (copy the pattern from TokenLayer's `handleLayerMouseDown` + `handleLayerMouseUp`). Shift-click to add / remove from selection.
3. **Menu items** in `wallMenu.ts` / `pinMenu.ts`:
    - Show "X Wände gewählt" header when `env.primary.kind === 'wall'` and the selection has > 1.
    - Add: set-all-as-doors, set-all-as-walls, delete N.
    - Pins: change colour / icon for all, delete N.
4. **CustomEvents** carry arrays: `wall:update-many`, `wall:delete-many`, `pin:delete-many`.

---

## B. Outstanding from earlier audit (Phase 6 plan)

### B.1 M2 — Electron 41 → 44 upgrade
**Effort:** L · **Risk:** 🔴 High · **Depends on:** dedicated branch + 3-OS E2E

Already deferred in Phase 6. Still the right next big-ticket item — every other security finding (BB-001..005) is closed; the runtime is now the gap.

**Approach.**
1. Bump `electron` in `package.json` to `^44.0.0` on a dedicated branch.
2. Read `breaking-changes.md` for v42, v43, v44 — known hot spots: `protocol.handle` semantics, `webPreferences` defaults, `WebContents` event renames.
3. Verify `local-asset://` still serves images (the protocol handler is sensitive to v44 changes).
4. `npm rebuild` for `better-sqlite3` ABI.
5. Full E2E + manual two-window smoke on **macOS / Windows / Linux**. Test PDF viewer, audio playback, fog sync, token broadcast, save/load.
6. Re-flip fuses verification on the built artifact.

**Risk mitigation.** Keep the branch isolated; only merge after passing all three OSes. The IPC guard from M3 + the runtime CSP are the two pieces most likely to need touch-up under v44.

### B.2 M5 — measurement runs (F-01..F-10)
**Effort:** S · **Risk:** 🟢 Low · **Depends on:** the perf-mark scaffolding from M5 (already shipped)

The instrumentation lives in `src/renderer/utils/perfMark.ts` and the marks are already wired in `losEngine`, `tokenDiff`, `wallIndex`. Just needs someone to run the app, open DevTools → Performance, and record verdicts in `audit/measurements.md`.

**Why this is high-priority despite being small.** The M6 large items (B.3 below) all need M5 numbers to confirm or refute the underlying hypotheses before committing to invasive refactors.

### B.3 M6 — high-impact perf refactors
Reordered by ROI given the M5 numbers will inform sequencing. **Do B.2 first.**

| ID | Item | Effort | Risk | Dep |
|---|---|---|---|---|
| BB-007 / BB-019 | Already done in Phase 6 (useImage dispose, useRotatedImage cleanup) | — | — | — |
| BB-013 / BB-032 | Already done (fog gating, ctx ref reuse) | — | — | — |
| BB-014 | Already done (character-sheets list-summary) | — | — | — |
| **BB-011** | Serve images via `local-asset://` instead of base64 IPC | M | 🟡 | M2 (`protocol.handle` may shift) |
| **BB-012** | Memoise LOS visibility polygons by `(token.id, x, y, wallStore.version)` | M | 🟢 | F-06 verdict |
| **BB-008** | Fog `toDataURL` → `toBlob` + binary IPC + SQLite `BLOB` column | M | 🔴 | F-05 verdict; needs DB migration with one-release backfill |
| **BB-018** | Coalesce fog brush ops into one batched IPC per RAF | M | 🟡 | benefits multiplied if BB-008 lands first |
| **BB-009** | Split `PlayerApp` into memoised sub-components | M | 🟡 | F-07 verdict |
| **BB-010** | `tokenBroadcast` per-token diff (skip full-roster scan) | S | 🟢 | F-06 verdict |
| **BB-015** | Stream PDFs via `local-asset://` | S | 🟢 | depends on BB-011's protocol path |
| **BB-016** | Player-bridge full-sync size cap | M | 🟡 | best after BB-008 (binary IPC for fog) |

**Recommended sequence:** BB-011 (after M2) → BB-015 → BB-010 → BB-012 → BB-008 → BB-018 → BB-016 → BB-009. Each step ships a measurable improvement and de-risks the next.

### B.4 M7 — lint tightening + migration transactions
**Effort:** M (per item) · **Risk:** 🟡 Medium · **Depends on:** none

| Item | Effort | Notes |
|---|---|---|
| Promote `@typescript-eslint/no-explicit-any` from `warn` to `error`; fix violations | M | Allow per-file `eslint-disable` with TODO; track backlog separately. Big win at the IPC / preload boundary. |
| Add `no-floating-promises` + `no-misused-promises`; fix violations | M | Should land after the `any` pass clears so the violation list isn't double-noisy. |
| Per-migration transactions in `applyMigration` (BB-025) | M | Land alongside an idempotency Vitest (F-04) that simulates v1 DB → mid-migration crash → re-run. |

### B.5 M8 — two-window Playwright E2E (BB-023)
**Effort:** M · **Risk:** 🟢 Low · **Depends on:** none

New Playwright project that opens DM window, clicks "Live gehen", spawns a second `page` pointed at `player.html`, asserts:
- Token visibility parity after Live-go.
- Fog parity after a brush stroke.
- Full-sync after the player window reconnects.
- Player rotation reflects the just-set `rotationPlayer` (regression test for the rotation bug we hit).

CI gate: this project must pass before a release tag. Catches the entire class of "feature works on DM but broken on player" bugs that have been the source of every recent QA regression.

### B.6 M9 — remaining polish (low-priority)
**Effort:** S each · **Risk:** 🟢 Low

- **BB-040** AboutDialog already uses `useDialogA11y` (verified Phase 4 of Phase 8 work) — close as resolved.
- **BB-048** Re-enable Windows `certificateFile` (no-op when env var absent). Add a CI smoke that confirms env-absent path produces an unsigned installer rather than failing.
- **BB-049** Linux AppImage signing / GPG releases — distribution policy decision, not a code change.
- **BB-050** High-contrast option for `PlayerEyeOverlay` hidden-token markers.

### B.7 M10 — architecture (design-doc gated)
**Effort:** TBD · **Risk:** 🔴 High

Each item needs a written design doc before code lands. None is shippable in a single sprint.

| Principle | Item | Trigger |
|---|---|---|
| #1 | Move LOS / image decode / PDF rasterisation off the renderer main thread (`utilityProcess` or `Worker`) | F-06 verdict shows LOS dominates frame time |
| #2 | Capability-based preload (functions, not channel wrappers) with runtime schema validation | After M3 sender-frame guard has been live for 1+ release with no incidents |
| #4 | Pure invertible-command undo engine (replace callback-based `undoStore`) | When undo bugs cluster up enough to force the rewrite |
| #5 | CQRS-lite split between command and read models on the canvas | After BB-009 PlayerApp split — that work clarifies the read-model boundary |

---

## C. Recommended sequencing for the next 4 weeks

```
Week 1  ─┬─ A.1 Sidebar map-row → engine (S)
         ├─ A.2 Drawing JS hit-test (M)
         └─ B.2 M5 measurement runs (S, parallel)

Week 2  ─┬─ B.5 Two-window Playwright E2E (M)  ← ships independently of M2
         └─ A.4 Wall / pin multi-select (L, parallel)

Week 3  ─── B.1 M2 Electron 44 upgrade (L, dedicated branch, 3-OS gate)

Week 4  ─┬─ A.3 Token menu full migration (L)
         └─ Begin B.3 perf items in priority order, gated on M5 numbers
```

**Critical path:** B.5 (E2E) before any Week-3 work, so the Electron upgrade has automated regression coverage. A.3 (token menu) intentionally last in this window because it's the lowest-risk item and the inline menu works correctly today — no urgency.

**Out-of-window:** B.4 lint tightening, B.6 polish, B.7 architecture. Each starts when capacity opens or when measurements warrant.

---

## D. Definition of done

- All four Phase 8 deferrals (A.1–A.4) closed.
- M5 measurement table populated with verdicts.
- M2 merged on main with green E2E across three OSes.
- Two-window E2E project gating every release tag.
- M6 perf items either implemented or measurement-refuted with numbers in `audit/measurements.md`.

---

*(End of Phase 9 — followups action plan)*
