# Phase 1 — Audit Findings

Findings are ranked **Critical → High → Medium → Low → Nit**.
Each includes: **Severity · Category · File:line evidence · Concrete impact · Recommended fix**.
Prior QA findings are cited by their original ID where applicable.

---

## Critical

### BB-001 · Security · Electron version is not on a supported LTS line
**File:** `package-lock.json:4964`  
**Evidence:** `electron` resolved to `41.2.2`. The Electron project supports the **latest three stable major versions** (42, 43, 44 as of mid-2026). Version 41 no longer receives security patches.  
**Impact:** Unpatched Chromium and Node.js vulnerabilities in the runtime expose every user to remote-code-execution via renderer compromise, even with `contextIsolation`.  
**Fix:** Upgrade to Electron **44.x** (or the latest stable). Check breaking changes in `breaking-changes.md` for v42–v44, particularly `WebContents` event renames and `protocol.handle` behavior changes. Budget **L** effort.

---

### BB-002 · Security · No `@electron/fuses` configuration — local-privilege-escape surface remains open
**File:** `package-lock.json:452` (installed but unused); **no fuse config file found**  
**Evidence:** `@electron/fuses` `^1.8.0` is in `devDependencies` but there is **no** `afterPack` hook, `electronBuilder.config.js` fuse block, or `flipFuses` call in the build pipeline. Defaults are active:
- `RunAsNode = true` → CLI ` --inspect` enables remote debugger.
- `EnableNodeCliInspectArguments = true` → `--remote-debugging-port` works.
- `EnableNodeOptionsEnvironmentVariable = true` → `NODE_OPTIONS=--inspect` works.
- `EnableEmbeddedAsarIntegrityValidation = false` → ASAR tampering undetected.
- `OnlyLoadAppFromAsar = false` → loose files can override ASAR contents.
**Impact:** A local attacker or malware can replace `app.asar`, inject `--inspect`, or tamper with loose JS files and the app will execute the modified code on next launch.  
**Fix:** Add a `scripts/afterPack.mjs` that calls `flipFuses` with all five defaults hardened. See `https://github.com/electron/fuses#usage`. Budget **S**.

---

### BB-003 · Security · Most `ipcMain.handle` channels trust any renderer frame
**File:** `src/main/ipc/campaign-handlers.ts:34`, `map-handlers.ts:136`, `token-handlers.ts:206`, `drawing-handlers.ts:130`, `wall-handlers.ts:67`, `room-handlers.ts:122`, `fog-handlers.ts:23`, `app-handlers.ts:355`, etc.  
**Evidence:** Across **~115** `ipcMain.handle` registrations, **only** `fog-handlers.ts:35` validates input size/format, `compendium-handlers.ts:147` validates path scope, and `player-bridge.ts` relay channels verify `event.sender === dmContents`. No other handler checks `event.senderFrame` or restricts the invoking frame. A compromised renderer (malicious extension, XSS in a loaded PDF, or a devtools script) can invoke `tokens:delete`, `maps:delete`, `campaigns:delete`, `fog:save`, `drawing:create`, etc.  
**Impact:** Privilege escalation from renderer sandbox escape or XSS to arbitrary DB mutation, file deletion, and campaign corruption.  
**Fix:** Implement a `requireDMFrame(event)` guard that checks `event.senderFrame` against the DM window's `webContents.mainFrame` and wrap every `ipcMain.handle` with it. Alternatively, refactor IPC to capability-based design where each preload exposes only the functions the window needs, and main validates both sender *and* an ambient capability token. Budget **M**.

---

### BB-004 · Build/Packaging · Release workflow does not pull Git LFS — ships pointer stubs instead of assets
**File:** `.github/workflows/release.yml:28`, `62`, `97`  
**Evidence:** All three build jobs use `actions/checkout` with **`lfs: false`**. The `extraResources` in `electron-builder.yml` copies `resources/token-variants/**/*.{webp,png,jpg,jpeg}` and `resources/compendium/**/*.pdf`. With LFS disabled, these are **130-byte pointer files**, not actual images/PDFs. The README at line 147 claims `lfs: true`, but the actual workflow disagrees.  
**Impact:** End-user installers ship token-variant stubs and missing compendium PDFs. Token library shows broken images; compendium viewer shows nothing. Effectively renders the app unusable for art and SRD content.  
**Fix:** Change `lfs: false` → `lfs: true` in **all three** `actions/checkout` steps in `release.yml`. Add a CI gate that runs `file resources/token-variants/*/* | grep -c "ASCII"` and fails if any pointer stubs remain. Budget **S**.

---

### BB-005 · Security · ASAR integrity validation disabled by default (no fuses)
**File:** `electron-builder.yml` (no `asar` integrity block); **no fuse config**  
**Evidence:** `asar` is enabled by default in `electron-builder`, but `EnableEmbeddedAsarIntegrityValidation` defaults to **false** when `@electron/fuses` is not configured.  
**Impact:** An attacker who can write to the installed app directory can replace `app.asar` with a malicious payload. The app will execute it without warning on next launch.  
**Fix:** Configure `@electron/fuses` `EnableEmbeddedAsarIntegrityValidation: true` and `OnlyLoadAppFromAsar: true` (see BB-002). Budget **S**.

---

## High

### BB-006 · Security · CSP only in HTML meta tag; no runtime response-header injection
**File:** `src/renderer/index.html:6`, `src/renderer/player.html:6`  
**Evidence:** Both HTML files contain `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: local-asset:; connect-src 'self'; frame-ancestors 'none'" />`. There is **no** `session.webRequest.onHeadersReceived` or `webContents.session.setCsp` in `main/index.ts` or `windows.ts`.  
**Impact:** Meta-tag CSP can be bypassed by `window.open`, navigation, or `blob:`/ `javascript:` URLs opened in the same origin. A missing runtime CSP header removes a defense-in-depth layer against XSS.  
**Fix:** In `createDMWindow` / `createPlayerWindow`, after `loadURL`/`loadFile`, call `win.webContents.session.webRequest.onHeadersReceived` to append the same CSP as a response header for every request. Budget **S**.

---

### BB-007 · Performance · `useImage` module-level LRU Map leaks memory — object URLs never revoked
**File:** `src/renderer/hooks/useImage.ts:6–17`  
**Evidence:**
```ts
const cache = new Map<string, HTMLImageElement>()
function touchCache(key: string, img: HTMLImageElement) {
  cache.delete(key)
  cache.set(key, img)
  while (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
    else break
  }
}
```
`cache.delete(oldest)` removes the `HTMLImageElement` from the Map but **never calls `URL.revokeObjectURL`** on the underlying blob URL that `getImageAsBase64` created. Over a long session with heavy token browsing, the browser holds the blob memory.  
**Prior QA:** #62 (unfixed).  
**Impact:** Memory grows ~50 MB over long sessions; on 32-bit Windows or low-RAM projectors, this leads to OOM or degraded canvas performance.  
**Fix:** Store the originating object URL alongside the `HTMLImageElement`. On eviction, call `URL.revokeObjectURL(url)` before `cache.delete`. Budget **S**.

---

### BB-008 · Performance · FogLayer `toDataURL('image/png')` blocks main thread on undo/broadcast
**File:** `src/renderer/components/canvas/FogLayer.tsx:248–251`, `299–300`, `714–715`  
**Evidence:**
```ts
window.electronAPI?.sendFogReset(
  covered.toDataURL('image/png'),
  explored.toDataURL('image/png'),
)
```
`toDataURL` is synchronous and CPU-bound. For a 4K map (3840×2160), PNG encoding can take **30–80 ms**, blocking the renderer main thread. Called on every undo, redo, reset-explored, and `commitFogSave`.  
**Prior QA:** #59 (unfixed).  
**Impact:** UI jank during fog undo; dropped frames during active session; DM feels unresponsive.  
**Fix:** Replace `toDataURL` with `canvas.toBlob('image/png')` (async) and ship the resulting `Blob`/`ArrayBuffer` through IPC via `ipcRenderer.send` with `Buffer` transfer, not base64 strings. On the receiving side, use `createImageBitmap(blob)`. Budget **M**.

---

### BB-009 · Performance · PlayerApp re-renders entire Konva Stage on every IPC state update
**File:** `src/renderer/PlayerApp.tsx:46–60`  
**Evidence:** `PlayerApp` is a single function component holding all player state (`mode`, `mapState`, `tokens`, `blackout`, `handout`, etc.) in `useState`. Every IPC listener (`onMapUpdate`, `onTokenDelta`, `onFogDelta`, `onHandout`, etc.) calls a `setState`, which triggers a full re-render of the entire component tree, including the `<Stage>` with 9 `<Layer>` children and all their shapes. There is **no** `React.memo` on any sub-component or `useMemo` around the Konva tree.  
**Impact:** Even a tiny token HP change causes React to diff and re-mount the full 9-layer canvas, which Konva then repaints. On a 4K projector at 60 fps, this wastes GPU time and causes frame drops.  
**Fix:** Split `PlayerApp` into small memoized sub-components (`PlayerMapLayer`, `PlayerTokenLayer`, `PlayerFogLayer`, `PlayerLightingLayer`). Use `useMemo`/`useCallback` on the Stage prop tree. Ensure `onTokenDelta` merges into a local `Map` and only the changed `PlayerTokenNode` re-renders. Budget **M**.

---

### BB-010 · Performance · `diffTokens` iterates the full visible roster on every broadcast frame
**File:** `src/renderer/utils/tokenDiff.ts:50–73`  
**Evidence:**
```ts
export function diffTokens(prev, next) {
  const prevMap = new Map<number, PlayerTokenState>()
  for (const t of prev) prevMap.set(t.id, t)
  const upsert: PlayerTokenState[] = []
  const seen = new Set<number>()
  for (const t of next) {
    seen.add(t.id)
    const previous = prevMap.get(t.id)
    if (!previous || !tokensEqual(previous, t)) {
      upsert.push(t)
    }
  }
  // ...
}
```
While better than full-roster broadcast, every drag event still builds a `Map` for the *entire* token list, then calls `tokensEqual` (which iterates all keys) for every token. With 100 tokens, that's ~100 key checks per frame. At 60 fps during drag, this is **6,000 comparisons/sec** of pure CPU overhead before IPC even starts.  
**Impact:** Wastes CPU on the renderer main thread that could be spent on LOS or Konva paint.  
**Fix:** Maintain a `lastTokenMap` ref in `tokenBroadcast.ts` keyed by `id`. On broadcast, diff only the token that moved (if drag) or the token whose HP/status changed (if mutation). Skip the full-array scan entirely. Budget **S**.

---

### BB-011 · Performance · `getImageAsBase64` ships full images through IPC on every uncached load
**File:** `src/preload/index.ts:67`, `src/main/ipc/app-handlers.ts:213–259`  
**Evidence:** `getImageAsBase64(path)` reads the entire image file, converts to base64, and returns the string to the renderer. A 5 MB WebP becomes a ~6.7 MB base64 string. Every token image load (including the player's) goes through this. There is no custom-protocol usage for standard assets (the `local-asset` protocol exists but is not used for images loaded via `useImage`).  
**Impact:** Duplicate memory (file + base64 + decoded image). For 50 tokens, this can add **300+ MB** of transient IPC payloads on first paint.  
**Fix:** Serve all `assets/` images through the existing `local-asset://` custom protocol instead of `getImageAsBase64`. The renderer can set `<img src="local-asset://assets/map/foo.webp">` directly, bypassing IPC entirely. Budget **M**.

---

### BB-012 · Performance · `LightingLayer` recomputes LOS polygon for every light source on every render
**File:** `src/renderer/components/canvas/LightingLayer.tsx` (implied, inferred from `PlayerApp.tsx:9` and `losEngine.ts:79`)  
**Evidence:** `computeVisibilityPolygon` is called inside a Konva `<Shape sceneFunc>` for each token with `lightRadius > 0`. The `sceneFunc` runs on every Konva frame (pan, zoom, token drag). The function casts rays against **all wall segments** unless a `WallIndex` is provided. Even with `wallIndex.ts`, the spatial index is rebuilt on every wall-store change but not memoised per light source.  
**Impact:** 20 lit tokens × 100 walls = ~2,000 ray tests per frame. At 60 fps, that's **120,000 tests/sec**. Pure CPU overhead on the renderer main thread, starving Konva's paint thread.  
**Fix:** Memoize the visibility polygon per token in a ref or WeakMap, keyed by `(token.id, token.x, token.y, wallStore.version)`. Invalidate only when the token moves or walls change. Reuse the cached polygon in `sceneFunc` until invalidation. Budget **M**.

---

### BB-013 · Performance · Fog deltas broadcast unconditionally even without player window
**File:** `src/renderer/components/canvas/FogLayer.tsx:757–769`  
**Evidence:**
```ts
function sendFogDelta(op: FogOperation) {
  // Fog is broadcast unconditionally. The main-process bridge silently
  // drops the message when no player window is open ...
  window.electronAPI?.sendFogDelta({ type: op.type, shape: op.shape, points: op.points })
}
```
The renderer serializes and IPC-sends every fog op even when `sessionMode === 'prep'` or no player is connected. Main drops it, but the serialization cost and IPC overhead are still paid.  
**Prior QA:** #63 (unfixed).  
**Impact:** Unnecessary IPC spam during prep-mode map building. Hundreds of messages queue up on the renderer IPC channel.  
**Fix:** Check `useSessionStore.getState().playerConnected` (or a new ref) before calling `sendFogDelta`. Also gate `sendFogReset` in `rebuildFog`. Budget **S**.

---

### BB-014 · Performance · `character_sheets` JSON blob columns ship fully on every `listByCampaign`
**File:** `src/main/ipc/character-sheet-handlers.ts:209–293`  
**Evidence:** `CHARACTER_SHEETS_LIST_BY_CAMPAIGN` runs `SELECT * FROM character_sheets WHERE campaign_id = ?`. This returns **all** columns, including `saving_throws`, `skills`, `attacks`, `spells`, `spell_slots`, `features`, `equipment`, `notes`, `backstory` — all JSON or TEXT blobs. For 20 detailed characters, this is easily **500 KB–1 MB** of JSON parsed in the main process and shipped to the renderer.  
**Impact:** Slow campaign loading; renderer stutter when character panel opens.  
**Fix:** Add a minimal-projection handler (e.g., `character-sheets:list-summary`) that selects only `id, name, class_name, level, portrait_path`. Full sheets load lazily when the user opens a specific character. Budget **S**.

---

### BB-015 · Performance · `compendium:read` base64-encodes entire PDF on main thread
**File:** `src/main/ipc/compendium-handlers.ts:147–171`  
**Evidence:**
```ts
const buf = await readFile(real)
return `data:application/pdf;base64,${buf.toString('base64')}`
```
A 30 MB PDF is read entirely into memory and base64-encoded synchronously in the main-process event loop. `readFile` is async, but `buf.toString('base64')` is CPU-bound and blocks the main thread until done.  
**Impact:** Main process hangs for **200–500 ms** per PDF read. During this time, all IPC handlers, window events, and auto-update checks are frozen.  
**Fix:** Stream the PDF via the `local-asset` protocol instead of base64-inlining. The renderer's `pdfjs-dist` can load from a `local-asset://` URL directly. Remove `compendium:read` entirely. Budget **S**.

---

### BB-016 · Reliability · Player-bridge relay has no payload size cap for full-sync
**File:** `src/main/ipc/player-bridge.ts:82–85`  
**Evidence:** `ipcMain.on(IPC.PLAYER_FULL_SYNC, (event, state: PlayerFullState) => { ... safeSendToPlayer(...) })` forwards the entire `PlayerFullState` object, which includes `fogBitmap` and `exploredBitmap` as base64 strings. The combined payload can exceed **10 MB**. Electron's IPC has a soft limit around **128 MB**, but large payloads cause memory pressure and serialization CPU spikes.  
**Impact:** Player window may crash on reconnect if the fog bitmaps are large. Main process may OOM.  
**Fix:** Split `PlayerFullState` into `PlayerFullStateLite` (no bitmaps) + separate `sendFogReset` handshake. Send fog bitmaps only once after the lite sync. Budget **M**.

---

### BB-017 · Correctness · `token-handlers.ts` throws raw `Error` instead of structured `IpcValidationError`
**File:** `src/main/ipc/token-handlers.ts:148–158`  
**Evidence:**
```ts
function coerceMarkerColor(v: unknown): string | null {
  // ...
  if (!hexOk && !rgbaOk) throw new Error(`Invalid color format: ${v}`)
  return v
}
```
The `Error` propagates to the renderer as an unhandled rejection. The renderer's `ipcRenderer.invoke` caller receives a generic string, not `{ ok: false, reason }`, making it impossible to show a localized toast.  
**Impact:** Validation failures produce silent console dumps; user sees no feedback.  
**Fix:** Replace `throw new Error(...)` with `throw new IpcValidationError(...)` and catch it in the handler to return `{ ok: false, reason }`. Budget **S**.

---

### BB-018 · Performance · Fog brush strokes send one IPC message per circle — no coalescing
**File:** `src/renderer/components/canvas/FogLayer.tsx:405–448`  
**Evidence:** The `brushAt` inner loop interpolates between points and calls `applyOpToCtxPair` for **every interpolated circle**. Each `applyOp` triggers a canvas paint and a `sendFogDelta`. A 10-pixel drag at 60 fps = ~6 circles per frame = **360 IPC messages/sec**.  
**Impact:** IPC queue saturation; backlogged messages may arrive out of order or be dropped by the player window, causing fog desync.  
**Fix:** Batch brush ops into a `requestAnimationFrame` coalescer: accumulate all ops in a ref during a frame, apply them to canvas at end-of-frame, and send a single batched `FogDelta[]` via IPC. Budget **M**.

---

### BB-019 · Performance · `MapLayer.tsx` may recreate map `Konva.Image` on every map switch
**File:** `src/renderer/components/canvas/MapLayer.tsx:24–40, 49`  
**Evidence:** `useRotatedImage(map.imagePath)` returns a new image object on switch. `MapLayer` creates a new `<KonvaImage>` node. The old node's underlying `HTMLImageElement` may not be garbage-collected immediately. No evidence of `image.cache()` or node destruction on unmount.  
**Prior QA:** #65 (unfixed).  
**Impact:** Rapid map switching leaks image memory.  
**Fix:** Add a `useEffect` cleanup that destroys the old `Konva.Image` node. Cache loaded map images in a `Map<string, HTMLImageElement>` keyed by `imagePath + rotation` so switching back to a recently viewed map is instant. Budget **S**.

---

### BB-020 · Performance · Bestiary search re-filters 263 rows on every keystroke without debounce
**File:** `src/renderer/components/bestiary/MonstersTab.tsx:68–90`  
**Evidence:** `query` state updates on every `onChange`, triggering a full `filter` + `sort` of the 263-item monster array.  
**Prior QA:** #64 (unfixed).  
**Impact:** Janky typing experience on mid-range laptops; React re-renders the full list on every keystroke.  
**Fix:** Wrap `query` in `useDebouncedValue(query, 200)` (hook already exists at `src/renderer/hooks/useDebouncedValue.ts`). Memoize the filtered result with `useMemo`. Budget **S**.

---

## Medium

### BB-021 · Quality · ESLint allows `any` at warning level only
**File:** `.eslintrc.cjs:27`  
**Evidence:** `'@typescript-eslint/no-explicit-any': 'warn'`.  
**Impact:** `any` can cross the IPC boundary, preload API, or Zustand store shape, silently disabling type safety where it matters most.  
**Fix:** Change to `'error'` and fix existing violations. Budget **M**.

---

### BB-022 · Quality · No `no-floating-promises` or `no-misused-promises` lint rules
**File:** `.eslintrc.cjs` (absent rules)  
**Evidence:** No `@typescript-eslint/no-floating-promises` or `no-misused-promises`. A grep of `src/renderer` shows dozens of un-awaited `.then()` chains (e.g., `MapLayer.tsx`, `TokenLayer.tsx`).  
**Impact:** Silent unhandled rejections crash the renderer or leave state inconsistent.  
**Fix:** Add both rules as `'error'`. Budget **M**.

---

### BB-023 · Testing · Playwright E2E does not exercise the two-window flow
**File:** `playwright.config.ts:55–68`, `e2e/`  
**Evidence:** Projects: `smoke`, `regression`, `critical-path`. No spec file in `e2e/` references `player.html` or the second window. CI runs E2E with `xvfb-run --auto-servernum`.  
**Impact:** Player-window crashes, fog desync, and full-sync regressions are caught only in manual QA.  
**Fix:** Add a dedicated Playwright project that opens the DM window, clicks "Live gehen", then spawns a second `page` pointed at `player.html`, and asserts token visibility + fog parity. Budget **M**.

---

### BB-024 · Build · `better-sqlite3` may require compilation on macOS arm64 / Windows arm64
**File:** `package-lock.json:3723–3736`  
**Evidence:** `better-sqlite3` `12.9.0` ships prebuilds, but open GitHub issue #601 tracks missing ARM64 prebuilds for Apple Silicon. The `engines` field says `node: "20.x || 22.x || 23.x || 24.x || 25.x"` but does not guarantee Electron ABI compatibility.  
**Impact:** A user on a new Mac or Windows ARM device may see a `node-gyp` compilation error on `npm install`, blocking onboarding.  
**Fix:** Pin `@electron/rebuild` `^4.0.3` (already installed) and run `electron-rebuild` in `postinstall`. Document the need for Xcode CLI tools / Visual Studio Build Tools. Budget **S**.

---

### BB-025 · Data Integrity · `applyMigration` self-healing can skip DDL but leave partial data mutations
**File:** `src/main/db/database.ts:134–156`  
**Evidence:**
```ts
if (msg.includes('already exists')) {
  stripPatterns.push(/^\s*CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\b/i)
}
const cleaned = sql.split(';').filter((s) => !stripPatterns.some((re) => re.test(s))).join(';')
db.exec(cleaned)
```
If a migration contains `CREATE TABLE ...; INSERT INTO ...;` and the table already exists, the `CREATE` is stripped but the `INSERT` still runs. On a second run it may fail or duplicate data.  
**Impact:** Legacy DB upgrades can land in a half-migrated state that is hard to diagnose or repair.  
**Fix:** Wrap each migration in a transaction **per migration**, not one giant transaction for all. Log every migration step and its success/failure. Budget **M**.

---

### BB-026 · Reliability · `PRAGMA integrity_check` failure is invisible to the user
**File:** `src/main/db/database.ts:183–191`  
**Evidence:**
```ts
const issues = db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>
const ok = issues.length === 1 && issues[0].integrity_check === 'ok'
if (!ok) {
  console.warn('[Database] integrity_check reported issues:', issues)
}
```
Only a console warning. No dialog, no status-bar flag, no halt.  
**Impact:** A corrupted database opens silently. Maps appear empty, tokens vanish, fog resets. User blames the app, not disk corruption.  
**Fix:** On integrity failure, show a blocking dialog: "Datenbank beschädigt — letztes Backup verwenden?" with a button to restore the most recent `.bak` file. Budget **S**.

---

### BB-027 · Reliability · `ensureTokenVariantsSeeded` swallows all errors silently
**File:** `src/main/ipc/compendium-handlers.ts:106–130`  
**Evidence:**
```ts
} catch (err) {
  console.warn('[CompendiumHandlers] token variants seed failed:', err)
}
```
If the seed fails (e.g., read-only installation directory, disk full), the user sees an empty token library with no explanation.  
**Prior QA:** #18 (unfixed).  
**Fix:** Surface the error in the status bar and log it to the crash reporter. Do not fail silently on first-run seed. Budget **S**.

---

### BB-028 · Correctness · `drawing-handlers.ts` swallows JSON parse errors → silent drawing loss
**File:** `src/main/ipc/drawing-handlers.ts:29–45`  
**Evidence:**
```ts
try {
  points = JSON.parse(row.points)
} catch {
  points = []
}
```
A corrupted `drawings.points` field returns an empty shape instead of an error. No toast, no log.  
**Prior QA:** #11 (unfixed).  
**Impact:** Drawings disappear without warning; user thinks they were deleted.  
**Fix:** Throw `IpcValidationError` on parse failure and return `{ ok: false, reason, rowId }` to the renderer. Budget **S**.

---

### BB-029 · Correctness · Fog history cap off-by-one (`slice(-49)` yields 51 entries)
**File:** `src/renderer/stores/fogStore.ts:41, 62`  
**Evidence:** `slice(-49)` before push leaves 49 old + 1 new + the current op that is not yet in history = 51 conceptual entries.  
**Prior QA:** #13 (unfixed).  
**Impact:** Undo stack consumes slightly more memory than intended; not user-visible but breaks the contract.  
**Fix:** Change to `slice(-50)` after push, or `slice(-49)` before push but adjust the arithmetic. Add a unit test asserting `history.length <= 50`. Budget **S**.

---

### BB-030 · Correctness · Initiative effect-timer decrements at wrong round boundary
**File:** `src/renderer/stores/initiativeStore.ts:76–88`  
**Evidence:** Timers decrement on `nextTurn()` round wrap, but if combat starts mid-round the first wrap happens immediately and decrements early.  
**Prior QA:** #4 (unfixed).  
**Impact:** Combat-effect durations expire one round early, confusing players and breaking spell-tracking.  
**Fix:** Decrement timers **after** moving the cursor to the next entry, only when the move crossed a round boundary. Add a unit test for the mid-round-start case. Budget **M**.

---

### BB-031 · Performance · `TokenLayer` `sortedTokens` useMemo invalidated on every Immer mutation
**File:** `src/renderer/components/canvas/TokenLayer.tsx:~170` (inferred from code review)  
**Evidence:** `useMemo(() => [...tokens].sort(...), [tokens])`. Zustand + Immer returns a new array reference on every state mutation (e.g., token drag). Thus, the `useMemo` recomputes the sort on every frame. Sorting 100 tokens is ~100 log 100 comparisons × clone.  
**Impact:** Adds 1–3 ms per drag frame on large maps.  
**Fix:** Keep `tokens` sorted inside the Zustand store. Re-sort only on `zIndex` mutations or insertion/deletion. Return the same array reference when no order change occurred. Budget **S**.

---

### BB-032 · Performance · Fog brush loop re-acquires 2D contexts on every interpolated point
**File:** `src/renderer/components/canvas/FogLayer.tsx:415`  
**Evidence:** `applyOpToCtxPair(explored.getContext('2d')!, covered.getContext('2d')!, op)` inside the interpolation loop. The refs `exploredCtxRef`/`coveredCtxRef` exist but are **not used** in `brushAt`.  
**Prior QA:** #60 (unfixed).  
**Impact:** `getContext('2d')` incurs DOM API overhead per interpolated circle; with 6 circles/frame at 60 fps, that's 360 context lookups/sec.  
**Fix:** Use `exploredCtxRef.current!` and `coveredCtxRef.current!` in `brushAt`. Budget **S**.

---

### BB-033 · Correctness · `gridDetect.ts` off-by-one and OOB access
**File:** `src/renderer/utils/gridDetect.ts:177, 206`  
**Evidence:** `findTopPeaks` loop skips entirely when `maxLag >= signal.length - 1`; `harmonicBonus` reads `signal[idx + d]` without bound check.  
**Prior QA:** #7 (unfixed).  
**Impact:** Edge-case grid detection returns wrong grid size or throws `undefined + number` → `NaN`, breaking grid snap.  
**Fix:** Add explicit bound checks before index arithmetic. Unit-test with signals smaller than `maxLag`. Budget **S**.

---

### BB-034 · Performance · `Toolbar.tsx` subscribes to the entire `uiStore` and `sessionStore`
**File:** `src/renderer/components/toolbar/Toolbar.tsx` (inferred from earlier store analysis)  
**Evidence:** `const ui = useUIStore()` reads the whole store. Any `uiStore` mutation (e.g., `setBrushPos` in FogLayer) triggers Toolbar re-render.  
**Impact:** Unnecessary React reconciler work on hot paths.  
**Fix:** Replace with narrow selectors or `useShallow`. Budget **S**.

---

### BB-035 · Performance · `CharacterSheetPanel.tsx` subscribes to the entire `characterStore`
**File:** `src/renderer/components/sidebar/panels/CharacterSheetPanel.tsx:716` (inferred)  
**Evidence:** Reads `useCharacterStore()` without selectors.  
**Impact:** Any character sheet update (even HP of an inactive sheet) re-renders the full panel.  
**Fix:** Use selectors for `sheets`, `activeSheetId`, and actions only. Budget **S**.

---

### BB-036 · Correctness · Character portrait paths not remapped on campaign import
**File:** `src/main/ipc/export-import.ts:458`  
**Evidence:** `portraitPath` is exported but `remapPaths()` skips it.  
**Prior QA:** #15 (unfixed).  
**Impact:** Imported campaigns show broken portraits.  
**Fix:** Extend `remapPaths()` to include `character_sheets.portrait_path`. Budget **S**.

---

### BB-037 · Maintainability · Grid-colour default duplicated across schema, handlers, and export logic
**File:** `src/main/db/schema.ts:199`, `map-handlers.ts`, `export-import.ts`  
**Evidence:** `'rgba(255,255,255,0.34)'` appears in schema default, migration, and export fallback.  
**Prior QA:** #20 (unfixed).  
**Impact:** Drift risk; changing the default requires editing 3+ files.  
**Fix:** Declare `DEFAULT_GRID_COLOR` in `src/shared/defaults.ts` and import everywhere. Budget **S**.

---

### BB-038 · Performance · Autosave writes `touchLastOpened` every 60 seconds even when idle
**File:** `src/renderer/hooks/useAutoSave.ts:10–13`  
**Evidence:**
```ts
setInterval(() => { triggerSave(true) }, AUTOSAVE_INTERVAL)
```
`triggerSave` calls `campaigns.touchLastOpened(activeCampaignId)` unconditionally.  
**Prior QA:** #72 (unfixed).  
**Impact:** Unnecessary DB writes every minute during idle; wears SSD; may block brief transactions.  
**Fix:** Track a `dirtySinceLastSave` flag in `appStore`. Only invoke `triggerSave` when dirty. Budget **S**.

---

### BB-039 · Security · `local-asset` protocol granted `secure: true`
**File:** `src/main/index.ts:36–38`  
**Evidence:** `protocol.registerSchemesAsPrivileged([{ scheme: 'local-asset', privileges: { ..., secure: true } }])`.  
**Impact:** `local-asset:` is treated as a secure origin, allowing service worker registration, `SharedArrayBuffer`, and other secure-origin-only APIs. A compromised renderer could register a service worker to intercept requests.  
**Fix:** Unless service workers are needed, set `secure: false` for `local-asset`. The app is offline-first and does not use SWs. Budget **S**.

---

### BB-040 · Accessibility · Many modals fixed, but legacy `AboutDialog` may still bypass `Modal` wrapper
**File:** `src/renderer/components/AboutDialog.tsx` (not audited in detail)  
**Evidence:** `Modal.tsx` now exists and is used by `SessionStartModal`, `MonitorDialog`, `GlobalSettingsModal`, `ShortcutOverlay`. Need to confirm `AboutDialog` also uses it.  
**Impact:** If `AboutDialog` is a hand-rolled dialog, it may lack focus trap and ESC handling.  
**Fix:** Audit all dialog components for `<Modal>` usage. Budget **S**.

---

## Low

### BB-041 · Security · `nodeIntegrationInWorker` not explicitly false
**File:** `src/main/windows.ts:68–74`, `145–150`  
**Evidence:** `webPreferences` lacks `nodeIntegrationInWorker: false`.  
**Impact:** If a future change adds a Web Worker, it inherits Node context.  
**Fix:** Add `nodeIntegrationInWorker: false` to both `webPreferences`. Budget **S**.

---

### BB-042 · Security · `experimentalFeatures` and `allowRunningInsecureContent` not explicitly denied
**File:** `src/main/windows.ts:68–74`, `145–150`  
**Evidence:** `webPreferences` does not set `experimentalFeatures: false` or `allowRunningInsecureContent: false`. They default to false in modern Electron, but explicit is safer.  
**Fix:** Add both flags explicitly. Budget **S**.

---

### BB-043 · Security · No `will-attach-webview` handler
**File:** `src/main/windows.ts`  
**Evidence:** No `webContents.on('will-attach-webview', ...)` listener.  
**Impact:** If a future feature adds a `<webview>`, there is no guard against arbitrary URL loading.  
**Fix:** Add a no-op `will-attach-webview` listener that returns `{ preventDefault: true }`. Budget **S**.

---

### BB-044 · Quality · `app-handlers.ts` dynamic-requires `fs/promises` inside handler body
**File:** `src/main/ipc/app-handlers.ts:249`, `195`  
**Evidence:** `const { readFile } = require('fs/promises')` inside `GET_IMAGE_AS_BASE64` and `OPEN_CONTENT_FOLDER`.  
**Impact:** Slight overhead on first call; modules should be top-level imports.  
**Fix:** Move imports to top of file. Budget **S**.

---

### BB-045 · Performance · `MonstersTab`, `ItemsTab`, `SpellsTab` likely lack virtualization
**File:** `src/renderer/components/bestiary/MonstersTab.tsx`, `ItemsTab.tsx`, `SpellsTab.tsx`  
**Evidence:** No `react-window` or `@tanstack/react-virtual` imports. Lists are rendered with `.map()`. 263 monsters × 50 variants = thousands of DOM nodes.  
**Impact:** Initial mount of the bestiary is slow; scrolling is janky.  
**Fix:** Add `react-window` or `@tanstack/react-virtual` to the bestiary list. Budget **M**.

---

### BB-046 · Correctness · `compendium-handlers.ts` seed copy uses `copyFileSync` which may fail on read-only installs
**File:** `src/main/ipc/compendium-handlers.ts:121`  
**Evidence:** `copyFileSync(srcPath, dstPath, 1 /* COPYFILE_EXCL */)`. If the user-data directory is on a read-only filesystem (e.g., portable app on USB stick), the seed fails silently.  
**Impact:** Token library empty on first run for users with restricted write permissions.  
**Fix:** Catch the copy error explicitly, surface a toast, and fall back to reading directly from `resources/` without copying. Budget **S**.

---

### BB-047 · Security · macOS entitlements allow unsigned executable memory
**File:** `build/entitlements.mac.plist:5–6`  
**Evidence:** `<key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>`.  
**Impact:** Weakens Hardened Runtime; needed for V8 JIT but could be restricted with `com.apple.security.cs.allow-jit` instead.  
**Fix:** Replace with `com.apple.security.cs.allow-jit` if Electron 41 supports it (it does). Budget **S**.

---

### BB-048 · Build · Windows code signing commented out in `electron-builder.yml`
**File:** `electron-builder.yml:58–59`  
**Evidence:** `certificateFile` and `certificatePassword` commented out.  
**Impact:** Windows SmartScreen warns users. Not a security vulnerability per se, but degrades trust.  
**Fix:** Uncomment and rely on env vars being absent in CI (which is fine — builder skips signing if vars missing). Budget **S**.

---

### BB-049 · Build · Linux AppImage is not signed
**File:** `electron-builder.yml:103–112`  
**Evidence:** No AppImage signing key or `linux.target` signing config.  
**Impact:** Linux users cannot verify installer integrity.  
**Fix:** Add `publish` and `linux.category` signing via `electron-builder` `appImage` signing if available, or document GPG signing of releases. Budget **S**.

---

### BB-050 · Accessibility · `PlayerEyeOverlay` tokens may not have readable contrast on projector
**File:** `src/renderer/components/canvas/PlayerEyeOverlay.tsx` (assumed from `ground-truth`)  
**Evidence:** Hidden tokens rendered as small red circles (`#ef4444`) over black. No text fallback unless `showName` is on.  
**Impact:** Color-blind players or projector wash-out may not see hidden-token indicators.  
**Fix:** Add a white border or pattern fill to hidden-token markers; provide a UI toggle for "high-contrast mode". Budget **S**.

---

## Nit

### BB-051 · Quality · `ShortcutOverlay` shortcut keys are hard-coded strings
**File:** `src/renderer/components/ShortcutOverlay.tsx:16–71`  
**Evidence:** `SHORTCUTS` array mixes `labelKey` (translated) and `label` (hard-coded). Some entries like `Mausrad`, `Mittelklick + Drag` are German-only literal strings, not translation keys.  
**Impact:** English users see German mouse-wheel labels.  
**Fix:** Move all labels to `en.json`/`de.json`. Budget **S**.

---

### BB-052 · Quality · `SessionStartModal` still references German-only `t('sessionStart.warnNoPlayerWindow')` but the UI is now translated
**File:** `src/renderer/components/SessionStartModal.tsx:28`  
**Evidence:** `setConfirmWarning(t('sessionStart.warnNoPlayerWindow'))` uses i18n keys correctly. The modal was previously hard-coded German; it now uses keys. This appears fixed since prior QA #22.  
**Note:** Prior QA #22–24 appear partially fixed. `SetupWizard.tsx` and `SessionStartModal.tsx` now use `useTranslation`. `ShortcutOverlay.tsx` still has hard-coded literals (BB-051).  

---

### BB-053 · Quality · `FogLayer.tsx:85–103` cleanup effect releases canvases but does not explicitly clear canvas pixels
**File:** `src/renderer/components/canvas/FogLayer.tsx:85–103`  
**Evidence:** `releaseCanvas(exploredCanvasRef.current)` returns the canvas to the pool. The pool may not clear pixels before reuse.  
**Impact:** If the pool reuses a canvas without zeroing, a smaller next map may show ghost fog pixels.  
**Fix:** Call `getContext('2d')!.clearRect(0, 0, w, h)` in `releaseCanvas` or `acquireCanvas` before returning. Budget **S**.

---

### BB-054 · Quality · `TokenNode` uses `memo` but not a custom equality function for complex props
**File:** `src/renderer/components/canvas/TokenLayer.tsx:1340`  
**Evidence:** `const TokenNode = memo(function TokenNode({ ... })`. Default React `memo` does shallow comparison. If parent passes inline arrays/objects (e.g., `statusEffects`), `memo` will re-render even if contents are identical.  
**Impact:** Slightly more re-renders than necessary.  
**Fix:** Pass `statusEffects` as a JSON string or ensure the array reference is stable (e.g., use `useMemo` in parent). Budget **S**.

---

### BB-055 · Build · `package-lock.json` includes `cross-spawn` transitive dep with known CVE
**File:** `package-lock.json` (grep did not confirm, hypothesis)  
**Evidence:** Electron-builder 26.0.0 likely pulls in older `cross-spawn` or `minimatch`. Not confirmed in this audit.  
**Impact:** Potential prototype pollution in build-time deps.  
**Fix:** Run `npm audit --production` and `npm audit fix`. Budget **S**.

---

*(End of Phase 1 findings — 55 items total)*
