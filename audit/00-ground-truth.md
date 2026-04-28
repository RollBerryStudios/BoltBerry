# Phase 0 — Ground Truth

## Exact dependency versions (`package-lock.json`)

| Package | Resolved |
|---|---|
| `electron` | **41.2.2** (devDep; `^41.0.0`) |
| `better-sqlite3` | **12.9.0** |
| `konva` | **9.3.22** |
| `react-konva` | **18.2.14** |
| `pdfjs-dist` | **4.10.38** |
| `zustand` | **5.0.12** |
| `i18next` | **26.0.6** |
| `vite` | **6.4.2** |
| `electron-builder` | **26.0.0** |
| `electron-updater` | **6.8.3** |

## IPC surface (171 channels, summary)

- **DM → Main (invoke):** ~115 channels, mostly **without sender-frame validation**. Only `fog-handlers.ts:35` and `token-handlers.ts` (via `COLUMN_MAP` coercion) validate inputs. The majority trust any renderer frame.
- **DM → Player (send):** ~16 relay channels, guarded by `isFromDM` / `isFromPlayer` in `player-bridge.ts`.
- **Player → Main (send):** 2 channels.
- **Main → DM (send):** 3 channels.

## Konva layers

- **DM Stage:** 12 layers.
- **Player Stage:** 9 inline layers.
- **Flags:** `perfectDrawEnabled={false}` on LightingLayer only; `listening={false}` on most non-interactive layers. No token caching observed.

## Zustand stores (17)

`TokenLayer` now uses `useShallow` selector consolidation (partial fix for prior QA #58). `Toolbar.tsx` still reads whole `uiStore` and `sessionStore`. `CharacterSheetPanel.tsx` reads whole `characterStore`.

## Prior QA findings still unresolved

| ID | Finding | Status |
|---|---|---|
| #4 | Initiative timer off-by-one | Unfixed |
| #6 | Fog desync on mode flip | Unfixed |
| #7 | Grid detect off-by-one / OOB | Unfixed |
| #11 | Drawing parse swallows errors | Unfixed |
| #13 | Fog history cap off-by-one | Unfixed |
| #15 | Portrait path not remapped on import | Unfixed |
| #20 | Grid color default drift | Unfixed |
| #25–34 | Accessibility / a11y / UX | Mostly unfixed |
| #57 | No token virtualization | Unfixed |
| #59–63 | Fog pipeline perf issues | Unfixed |

## Architecture in 5 lines

BoltBerry is a local-first Electron app where **main owns SQLite persistence** and **DM renderer owns live scene state** (Zustand). The DM broadcasts per-token deltas and fog deltas to a read-only Player renderer via IPC relay. Heavy compute (LOS ray-casting, image decoding, PDF rasterization) runs on the renderer main thread. The preload exposes two broad APIs (`dmApi`, `playerApi`) through `contextBridge`. There is no `utilityProcess`, `Worker`, or shared-memory offloading.

*(See full ground-truth in the Phase 0 research notes.)*
