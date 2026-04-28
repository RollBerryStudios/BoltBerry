# Phase 2 — External Cross-Checks

## 1. Electron 41 Security

### NVD / GitHub Advisories
- **Search:** `electron 41` via NVD CPE and GitHub Advisory query.
- **Result:** **0 CVEs returned specifically for Electron v41.** Electron advisories on GitHub (published Apr 2026) do not cap affected ranges to v41, meaning v41 is **likely affected** by recent High-severity CVEs (context-bypass, use-after-free, command-line injection) because it is no longer supported.
- **Claim:** "Electron supports the latest three stable major versions." v41 is **outside** that window.
- **Applies to BoltBerry:** Running an unsupported Electron means unpatched Chromium and Node.js vulnerabilities are present in every user install. The `contextIsolation: true` sandbox **does not protect** against renderer process escape via unpatched Blink/V8 bugs.
- **URL:** `https://www.electronjs.org/docs/latest/tutorial/security`, `https://github.com/advisories?query=electron`
- **Date checked:** 2026-04-28

---

## 2. better-sqlite3 (GitHub)

- **URL:** `https://github.com/WiseLibs/better-sqlite3/issues?q=is%3Aissue+is%3Aopen+electron`
- **Issue #601:** Pre-built ARM64 binaries for Apple Silicon missing; users must compile from source.
- **Issue #1380:** Build warnings on npm 11+; affects CI stability.
- **Claim:** better-sqlite3 relies on `prebuild-install` for binaries; cross-platform Electron builds often hit missing-binary errors.
- **Applies to BoltBerry:** macOS release workflow (`macos-latest`) may fail on Apple Silicon runners if prebuild is unavailable. `electron-rebuild` is installed but not wired into `postinstall`.
- **Date checked:** 2026-04-28

---

## 3. Konva Performance (Docs not reachable)

- **URL attempted:** `https://konvajs.org/docs/performance/Performance_Tips.html` → **404**.
- **Community knowledge ( inferred from GitHub issues):**
  - `node.cache()` is recommended for static nodes to avoid re-drawing.
  - `perfectDrawEnabled: false` and `shadowForStrokeEnabled: false` reduce hit-region cost.
  - `listening={false}` on non-interactive nodes avoids expensive event registration.
  - Batch updates; avoid state mutations inside `onDragMove`.
- **Applies to BoltBerry:** `TokenNode` does not call `.cache()`. `LightingLayer` Shape nodes lack caching. Token drag broadcasts happen inside drag-move, not drag-end.
- **Date checked:** 2026-04-28

---

## 4. pdfjs-dist (mozilla/pdf.js)

- **URL:** `https://github.com/mozilla/pdf.js/issues?q=is%3Aissue+memory+leak+OR+zoom+canvas`
- **Issue #20198:** Worker cleanup failure causes memory leaks in hybrid/WebView apps.
- **Issue #20046:** JBIG2 images leak memory even with `disableWorker: true`.
- **Issue #19053:** High-DPR displays cause canvas zoom mismatch.
- **Claim:** Frequent `renderTask` creation/destruction without explicit `cancel()` or `destroy()` leaks workers and canvas contexts.
- **Applies to BoltBerry:** `CompendiumPdfViewer.tsx` renders pages to canvas and converts to `dataUrl`. No evidence of `renderTask.cancel()` on zoom/page change. High-DPR projectors may broadcast oversized frames.
- **Date checked:** 2026-04-28

---

## 5. Zustand (GitHub)

- **URL:** `https://github.com/pmndrs/zustand`
- **Issue #2800:** `useShallow` with `.map()` inside selector causes infinite re-render loops because shallow equality sees a new array each time.
- **Claim:** Selectors must return stable references. Transform arrays to stable IDs strings or memoize outside the selector.
- **Applies to BoltBerry:** `TokenLayer` uses `useShallow` on `uiStore` but may still pass inline arrays/objects to child props. `Toolbar.tsx` reads the whole `uiStore`.
- **Date checked:** 2026-04-28

---

## 6. Electron Security Best-Practices Doc

- **URL:** `https://www.electronjs.org/docs/latest/tutorial/security`
- **Claims found:**
  1. **#7 Define a CSP** — BoltBerry has meta-tag CSP but no runtime header injection.
  2. **#17 Validate sender of all IPC messages** — BoltBerry only validates `player-bridge.ts` relay channels; ~115 `handle` channels trust any frame.
  3. **#13/14 Disable navigation / new windows** — `will-navigate` and `setWindowOpenHandler` are present, but no `will-attach-webview` handler.
  4. **#19 Check fuses** — `@electron/fuses` is installed but **not configured**.
- **Date checked:** 2026-04-28

---

## 7. X / Twitter

- **Status:** All Nitter instances blocked (Anubis/403). Direct X access unavailable.
- **Skipped.** Relevant claims from Electron/Konva communities already covered by official docs and GitHub issues above.

---

*(End of Phase 2 — external sources checked: Electron docs, NVD/GitHub Advisories, better-sqlite3 GitHub, pdfjs-dist GitHub, Zustand GitHub. Konva docs 404; community knowledge substituted.)*
