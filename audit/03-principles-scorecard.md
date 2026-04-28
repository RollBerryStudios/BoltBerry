# Phase 3 — Principles Scorecard

## Legend: ✅ Followed · ⚠️ Partial · ❌ Violated

---

### 1. Process model discipline — "main is the kernel, renderer is the UI"
**Verdict:** ❌ Violated  
**Evidence:** Heavy compute (LOS ray-cast `losEngine.ts`, image decoding `useImage.ts`, PDF rasterization `CompendiumPdfViewer.tsx`, grid FFT `gridDetect.ts`) all run on the renderer main thread. No `utilityProcess`, `Worker`, or `MessageChannel` offload exists.  
**File:** `src/renderer/components/canvas/LightingLayer.tsx`, `src/renderer/utils/losEngine.ts:79`, `src/renderer/hooks/useImage.ts`, `src/renderer/components/CompendiumPdfViewer.tsx`.

---

### 2. Capability-based IPC — channels are capabilities; preload exposes *functions*, not *channels*
**Verdict:** ❌ Violated  
**Evidence:** `preload-dm.ts` exposes `dmApi` as a flat object of **channel wrappers**: `tokens.listByMap: () => ipcRenderer.invoke(IPC.TOKENS_LIST_BY_MAP, ...)`. The renderer can enumerate every channel name by inspecting `window.electronAPI`. There is no capability token or runtime schema validation on the main side for most handles.  
**File:** `src/preload/preload-dm.ts:5`, `src/main/ipc/campaign-handlers.ts:34`, `map-handlers.ts:136` (no sender/schema checks).

---

### 3. Single source of truth for cross-window state — main owns it, both renderers subscribe
**Verdict:** ⚠️ Partial  
**Evidence:** Main owns the SQLite DB, but transient live state (token positions, fog, camera) lives in the DM renderer's Zustand stores. The player is a passive subscriber with no two-way sync or conflict resolution. If the DM renderer crashes and restarts, it re-hydrates from DB, but the player may hold stale state until a manual resync.  
**File:** `src/renderer/stores/tokenStore.ts`, `src/renderer/stores/fogStore.ts`, `src/main/ipc/player-bridge.ts:82`.

---

### 4. Immutable command pattern for undo/redo — operations are values, applied and inverted by the same engine
**Verdict:** ⚠️ Partial  
**Evidence:** Fog undo stores `FogOperation` values, but the undo engine (`undoStore.ts`) stores callbacks (`undo: () => { ... }`) rather than pure invertible commands. Fog undo replays the full history stack (`rebuildFog`) instead of applying an inverse delta. Token undo is not audited in detail but likely similar.  
**File:** `src/renderer/stores/undoStore.ts`, `src/renderer/components/canvas/FogLayer.tsx:225–252`.

---

### 5. CQRS-lite for the canvas — read model vs. command model cleanly separated
**Verdict:** ❌ Violated  
**Evidence:** The DM renderer's Zustand stores are both the command model (mutated by user actions) and the read model (rendered by Konva). There is no separate read-optimized view. Player window receives the same flat state and derives its own read model independently.  
**File:** `src/renderer/stores/*Store.ts`, `src/renderer/components/canvas/*Layer.tsx`.

---

### 6. Backpressure on hot streams — coalesce/throttle at the boundary
**Verdict:** ❌ Violated  
**Evidence:** Fog brush sends one IPC `sendFogDelta` per interpolated circle (`FogLayer.tsx:436`). Token drag sends `sendTokenDelta` per drag tick via RAF, but diffing is not frame-coalesced. No `requestAnimationFrame` queue flush or max-per-second cap on IPC.  
**File:** `src/renderer/components/canvas/FogLayer.tsx:415`, `src/renderer/utils/tokenBroadcast.ts:68`.

---

### 7. Spatial indexing for O(n) geometric queries per frame
**Verdict:** ⚠️ Partial  
**Evidence:** `wallIndex.ts` exists and is used by `losEngine.ts` when passed, but it is **optional** and not always provided. Token layer hit-testing and wall-ray-casting still fall back to brute-force loops in some paths. No spatial index for tokens.  
**File:** `src/renderer/utils/wallIndex.ts`, `src/renderer/utils/losEngine.ts:79–172`.

---

### 8. Lazy / streaming asset loading — never block first paint on the wiki dataset
**Verdict:** ⚠️ Partial  
**Evidence:** SRD monster seeding is deferred (`seedSrdMonstersDeferred()` runs via `setImmediate` after `app.whenReady()`), so first paint is not blocked. However, bestiary detail view loads the full `monster.json` synchronously. Token variants list `readdirSync` on first access.  
**File:** `src/main/db/database.ts:301–310`, `src/main/ipc/data-handlers.ts`.

---

### 9. Defense in depth — sandbox + contextIsolation + CSP + fuses, not any one alone
**Verdict:** ⚠️ Partial  
**Evidence:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` are present. CSP meta tag exists. **Missing:** runtime CSP header, `@electron/fuses` configuration, `will-attach-webview` handler, `nodeIntegrationInWorker: false`, `experimentalFeatures: false`.
  
**File:** `src/main/windows.ts`, `src/renderer/index.html:6`.

---

### 10. Determinism + observability — structured logs, IPC trace toggle, perf marks
**Verdict:** ❌ Violated  
**Evidence:** `logger.ts` exists but is a basic wrapper around `console`. No structured JSON logging. No IPC trace toggle. No `performance.mark` on hot paths (LOS, fog broadcast, token diff). No telemetry-free perf log as suggested in QA action plan.  
**File:** `src/main/logger.ts`.

---

### 11. Type-driven boundaries — `src/shared/` types are the contract; no `any` crossing the preload
**Verdict:** ❌ Violated  
**Evidence:** `src/shared/ipc-types.ts` defines strict types, but the preload (`preload-dm.ts`) exposes a large `dmApi` object whose internal methods take `any`-typed payloads in practice because the renderer can pass whatever `invoke` accepts. The `.eslintrc` allows `any` at warning level.  
**File:** `.eslintrc.cjs:27`, `src/preload/index.ts`.

---

*(End of Phase 3 — 11 principles evaluated)*
