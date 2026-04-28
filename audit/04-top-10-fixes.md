# Phase 4 — Top 10 Fixes

Ordered by **(severity × ease)**. Each maps to Phase 1 finding IDs.

---

## 1. Enable `@electron/fuses` — harden ASAR and disable CLI inspect flags
**Finding IDs:** BB-002, BB-005  
**Severity:** Critical  
**Effort:** S (≤ 0.5 day)  
**Plan:** Add `scripts/afterPack.mjs` that calls `flipFuses` from `@electron/fuses` with `RunAsNode: false`, `EnableNodeCliInspectArguments: false`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableEmbeddedAsarIntegrityValidation: true`, `OnlyLoadAppFromAsar: true`. Wire it into `electron-builder.yml` `afterPack: scripts/afterPack.mjs`. Add a CI smoke test checking `node -e "require('electron').app.quit()"` fails with fuses enabled.

---

## 2. Fix release workflow `lfs: false` → `lfs: true`
**Finding IDs:** BB-004  
**Severity:** Critical  
**Effort:** S  
**Plan:** Edit `.github/workflows/release.yml` lines 28, 62, 97: `lfs: true`. Add a CI step after build that runs `file resources/token-variants/*/* | grep -c "ASCII"` and fails if > 0 (pointer stubs present). Verify `extraResources` paths match actual files in the artifact.

---

## 3. Upgrade Electron to latest stable LTS (v44.x)
**Finding IDs:** BB-001  
**Severity:** Critical  
**Effort:** L (2–5 days)  
**Plan:** Bump `electron` in `package.json` to `^44.0.0`. Run `npm install`. Address breaking changes:
- `protocol.handle` behavior changes (verify `local-asset` still works).
- `webPreferences` defaults may shift; explicitly pin all security flags.
- Test two-window flow, PDF viewer, audio playback on Windows/macOS/Linux.
- Run full E2E suite.

---

## 4. Add sender-frame validation to all `ipcMain.handle` channels
**Finding IDs:** BB-003  
**Severity:** Critical  
**Effort:** M (0.5–2 days)  
**Plan:** Implement `requireDMFrame(event)` in `validators.ts` using `event.senderFrame === getDMWindow()?.webContents.mainFrame`. Wrap every `ipcMain.handle(...)` call across 25+ handler files. Start with destructive channels (`delete`, `set`, `save`). For read-only channels, a lighter `event.sender` origin check is acceptable but still required.

---

## 5. Ship images via `local-asset://` protocol instead of `getImageAsBase64` IPC
**Finding IDs:** BB-011  
**Severity:** High  
**Effort:** M  
**Plan:** In `useImage.ts`, change the `effective` branch that calls `getImageAsBase64` to instead construct `local-asset://` URLs and set them directly on `img.src`. The protocol handler in `main/index.ts:57–103` already supports streaming. Remove `getImageAsBase64` from preload and main. Benefit: eliminates base64 memory bloat and IPC latency.

---

## 6. Replace fog `toDataURL` with async `toBlob` + binary IPC
**Finding IDs:** BB-008  
**Severity:** High  
**Effort:** M  
**Plan:** In `FogLayer.tsx`, change `commitFogSave` to use `covered.toBlob('image/png', blob => { ... })`. Serialize the `Blob` to `ArrayBuffer` and send via `ipcRenderer.send` with a `Buffer` transfer object. In main, receive the buffer and write directly to SQLite `BLOB` (change `fog_state` columns from TEXT/BLOB-holding-base64 to raw BLOB). On the player side, use `createImageBitmap(blob)` to avoid base64 decode.

---

## 7. Memoize LOS polygons and skip recompute on unchanged walls/tokens
**Finding IDs:** BB-012  
**Severity:** High  
**Effort:** M  
**Plan:** Add a `Map<number, CachedVisibility>` ref in `LightingLayer.tsx` keyed by token id. Invalidate only when `token.x`, `token.y`, or `wallStore.version` changes. Reuse the cached flat polygon array in the Konva `sceneFunc`. This alone should cut LOS CPU by 80%+ during idle frames.

---

## 8. Batch fog brush ops into a single IPC per frame
**Finding IDs:** BB-018  
**Severity:** High  
**Effort:** M  
**Plan:** In `FogLayer.tsx`, replace per-circle `sendFogDelta` with a ref accumulator `pendingOps: FogOperation[]`. In `requestAnimationFrame`, flush the array as a single `sendFogDeltaBatch(pendingOps)` IPC. Clear the array. This eliminates IPC flooding and removes backpressure risk.

---

## 9. Split `PlayerApp` into memoized sub-components
**Finding IDs:** BB-009  
**Severity:** High  
**Effort:** M  
**Plan:** Extract `PlayerMapLayer`, `PlayerTokenLayer`, `PlayerFogLayer`, `PlayerLightingLayer`, `PlayerHandoutOverlay` from `PlayerApp.tsx`. Wrap each in `React.memo`. Use `useMemo` for the Stage children array. Ensure `onTokenDelta` merges into a local `Map` and only the changed token node re-renders.

---

## 10. Add `useShallow` + narrow selectors to Toolbar and remaining over-subscribed components
**Finding IDs:** BB-034, BB-035, BB-010  
**Severity:** Medium  
**Effort:** S  
**Plan:** Convert `Toolbar.tsx` from `const ui = useUIStore()` to narrow `useUIStore(useShallow(s => ({ activeTool: s.activeTool, ... })))`. Same for `CharacterSheetPanel.tsx` and any other component reading the whole store. Add a `tokenBroadcast.ts` optimization to diff only the changed token, not the full roster.

---

*(End of Phase 4 — 10 highest-leverage fixes)*
