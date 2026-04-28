# Phase 5 — Followups / Hypotheses Requiring Measurement

These are things I **suspect** but cannot confirm without running the app or adding instrumentation.

---

## F-01 · Memory leak in `pdfjs-dist` worker lifecycle
**Hypothesis:** `CompendiumPdfViewer.tsx` creates a new `pdfjsLib.getDocument` worker on every PDF open but never calls `.destroy()` or `renderTask.cancel()` on zoom/page changes. Over a long session with frequent compendium browsing, detached workers accumulate in the renderer process.
**What to measure:** Attach Chromium DevTools → Memory → Take heap snapshots before/after opening 10 PDF pages. Look for `PDFWorker` or `Stream` objects that survive GC.

---

## F-02 · Konva `Stage` memory not released on map switch
**Hypothesis:** `CanvasArea.tsx` keeps the same `Stage` instance but replaces all `Layer` children. Konva's internal cache (`_cache`, `sceneFunc` closures) may retain references to old `Image` nodes, causing a slow leak during rapid map switching.
**What to measure:** Record Performance profile during 50 map switches. Check `Performance.memory.usedJSHeapSize`. If it climbs monotonically, inspect retained objects for `Konva.Image` instances.

---

## F-03 · `local-asset` protocol serves files faster than `getImageAsBase64` in practice
**Hypothesis:** Switching to `local-asset://` URLs (BB-011) will reduce first-paint time for large maps by 50% and cut transient memory by ~40%. This is a performance claim that needs A/B measurement.
**What to measure:** Use Electron `performance.mark` around `useImage` loads. Compare `getImageAsBase64` path vs. `local-asset://img.src` path for a 10 MB WebP map.

---

## F-04 · `applyMigration` self-heal may leave partial data mutations on re-run
**Hypothesis:** When `applyMigration` strips `CREATE TABLE`/`CREATE INDEX` on re-run, `INSERT OR IGNORE` or `UPDATE` statements in the same migration still execute, potentially duplicating seeded rows or partially backfilling data. This has not been observed because QA test databases are usually fresh.
**What to measure:** Write a Vitest that simulates a v1 DB, runs migrations, then simulates a crash mid-migration and re-runs. Assert idempotency: row counts and schema version must match the first successful run.

---

## F-05 · `FogLayer` `toDataURL` PNG compression time scales non-linearly with map size
**Hypothesis:** A 4K map fog PNG takes >50 ms to encode. A 8K map (e.g., scanned battlemap) may take >200 ms, causing visible UI freezes during undo.
**What to measure:** Instrument `commitFogSave` with `performance.mark` and `measure`. Test with maps of increasing resolution (1080p → 4K → 8K).

---

## F-06 · `diffTokens` dominates CPU during token drag at high token counts
**Hypothesis:** At 100+ tokens, `diffTokens` scanning the full roster on every drag tick adds >2 ms per frame. Combined with LOS recompute, this may drop the DM window below 55 fps.
**What to measure:** Add React Profiler to `TokenLayer`. Record a 5-second drag of one token in a 100-token scene. Check "Render duration" for `TokenLayer` and "Scripting" time for `diffTokens`.

---

## F-07 · Player window FPS drops below 30 during large fog reset broadcast
**Hypothesis:** `PlayerApp.tsx` re-renders the entire Stage when a `fog-reset` arrives. If the fog bitmap is 4K PNG, the image decode + Stage paint may exceed 16 ms, causing frame drops and visible stutter on the projector.
**What to measure:** Instrument `onFogReset` in `PlayerApp.tsx` with `performance.mark`. Use Chrome DevTools FPS meter in the player window. Observe frame timing during fog undo.

---

## F-08 · `audioStore` DOM event wiring leaks `<audio>` elements on board switch
**Hypothesis:** `audioStore.ts` creates `<audio>` elements for tracks but may not remove them when the campaign switches or the board is deleted. This would leak DOM nodes and audio decoder threads.
**What to measure:** Count `document.querySelectorAll('audio')` before/after switching campaigns 10 times. If count grows, there is a leak.

---

## F-09 · `wallIndex.ts` rebuild time is O(n²) on dense wall maps
**Hypothesis:** Building the uniform grid for 500+ walls on a complex map may take >100 ms, blocking the renderer during wall import.
**What to measure:** Add `performance.mark` around `buildWallIndex` call. Test with a map containing 0, 100, 500, and 1000 walls.

---

## F-10 · Windows SmartScreen triggers on unsigned installer
**Hypothesis:** Because `certificateFile` is commented out in `electron-builder.yml`, the NSIS installer is unsigned. Windows Defender / SmartScreen may flag it as "unknown publisher" on first run, scaring users.
**What to measure:** Build the installer on a clean Windows VM. Observe SmartScreen warning. This is a UX issue, not a code bug, but it affects distribution.

---

*(End of Phase 5 — 10 followup hypotheses)*
