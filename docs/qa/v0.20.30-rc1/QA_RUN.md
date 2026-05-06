# BoltBerry QA Run v0.20.30-rc1

Date: 2026-05-06

Scope: Release candidate QA for the current working tree, including the Player Control / Fog / reconnect fixes and the new release QA checklist.

## Current Working Tree

Status at start: dirty working tree with intentional release-candidate fixes.

Changed areas:

- PlayerApp player map-update and fog handling.
- Fog save flushing and reconnect full-sync behavior.
- Player Control Mode rotation display.
- Player map state identity (`mapId`).
- Regression coverage for live fog rotation and hard player-window reconnect.
- Release QA checklist.

## P0 Automated Gates

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| Unit and store logic | `npm test` | Passed | 17 files, 269 tests. Existing stderr warnings: initiativeStore unknown-id guard, preload dead-code report for `getUserDataPath` / `getTokenVariantSeedStatus`. |
| Full production build | `npm run build` | Passed | Re-run after context-menu hardening. Vite emitted existing dynamic/static import and chunk-size warnings; no build errors. |
| Player bundle isolation | `npm run check:bundle` | Passed | Re-run after final packaged QA build. `player-DrLyO04d.js` contains no DM-only symbols. |
| i18n completeness | `npm run check:i18n` | Passed | 738 keys verified in English and German. |
| Default Electron E2E gate | `npm run test:e2e` | Passed | Final re-run after context-menu fix: 154 passed, 1 skipped. Skipped test is the packaged app smoke gate, which requires `BOLTBERRY_E2E_EXECUTABLE_PATH`; covered separately below. |
| Visual baseline gate | `npm run test:e2e:visual` | Passed | Final re-run after context-menu fix: 4 visual tests passed: dashboard, workspace, canvas with fog/walls/rooms/drawings, synchronized player view. |
| Nightly/stress gate | `npm run test:e2e:nightly` | Passed | 2 stress tests passed: large map state with hundreds of tokens/geometry rows, large audio library filtering. |
| Packaged executable smoke | `BOLTBERRY_E2E_EXECUTABLE_PATH=... npm run test:e2e:packaged` | Passed | `npm run pack` produced `/Users/pdietric/GitHub/BoltBerry/release/mac-arm64/BoltBerry.app/Contents/MacOS/BoltBerry`. Smoke stayed alive for 8000 ms and accepted clean shutdown. Packaging warning: macOS code signing skipped because identity is null. |
| Lint | `npm run lint` | Passed with warnings | 0 errors, 180 existing warnings. Treat warning baseline as a P1 cleanup item before public release polish. |
| Hardened packaged Playwright attach | `BOLTBERRY_E2E_EXECUTABLE_PATH=... npx playwright test ...` | Blocked by harness | Hardened fuses disable `RunAsNode`, `NODE_OPTIONS`, and CLI inspect flags. Direct spawn smoke works, but Playwright `_electron.launch()` times out before creating a controllable app. This is expected for the hardened artifact and should be covered by manual packaged signoff or a separate unfused QA artifact. |
| Packaged fuse verification | `npx @electron/fuses read --app .../BoltBerry` | Passed | `RunAsNode` disabled, `NODE_OPTIONS` disabled, Node CLI inspect disabled, ASAR integrity enabled, OnlyLoadAppFromAsar enabled, cookie encryption enabled. |
| Unfused packaged QA build | `npm run pack:qa:unfused` | Passed | Built Playwright-controllable QA package under `/Users/pdietric/GitHub/BoltBerry/release/qa-unfused/mac-arm64/BoltBerry.app`. Fuse read confirms it is unfused as intended. This artifact is explicitly not for distribution. |
| Unfused packaged UI smoke | `BOLTBERRY_E2E_EXECUTABLE_PATH=/Users/pdietric/GitHub/BoltBerry/release/qa-unfused/mac-arm64/BoltBerry.app/Contents/MacOS/BoltBerry npx playwright test e2e/smoke/packaged-app.spec.ts --project=smoke --timeout=60000` | Passed | 1 passed. Verifies packaged DM shell and preload bridge. |
| Unfused packaged targeted live-session suite | `BOLTBERRY_E2E_EXECUTABLE_PATH=/Users/pdietric/GitHub/BoltBerry/release/qa-unfused/mac-arm64/BoltBerry.app/Contents/MacOS/BoltBerry npx playwright test e2e/critical-path/player-window.spec.ts e2e/critical-path/two-window-sync.spec.ts e2e/critical-path/player-render-workflows.spec.ts e2e/regression/player-ui-regressions.spec.ts e2e/critical-path/scene-grid-workflows.spec.ts e2e/regression/canvas-context-actions.spec.ts --project=critical-path --project=regression` | Passed | 21 passed. Packaged QA coverage for player lifecycle/security, full-sync, `rotationPlayer`, reconnect, blackout, session broadcasts, scene rotation, fog context actions, and hard player-window reconnect. |

## P0 Targeted Live-Session Gates

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| Player lifecycle and security | `npx playwright test e2e/critical-path/player-window.spec.ts --project=critical-path` | Passed | Covered by targeted 21-test live-session run. Player window lifecycle, `playerAPI`, no `electronAPI`, context isolation, no node integration. |
| DM-player sync bridge | `npx playwright test e2e/critical-path/two-window-sync.spec.ts --project=critical-path` | Passed | Covered by targeted 21-test live-session run. Token full-sync, `rotationPlayer`, token delta, reconnect full-sync, blackout, session broadcast matrix. |
| Player render workflows | `npx playwright test e2e/critical-path/player-render-workflows.spec.ts --project=critical-path` | Passed | Covered by targeted 21-test live-session run. Player renders session broadcasts, not only bridge callbacks. |
| Fog, rotation, reconnect regression | `npx playwright test e2e/regression/player-ui-regressions.spec.ts --project=regression -g "player fog survives"` | Passed | Covered by targeted 21-test live-session run. Screenshots copied into this QA evidence folder. |
| Scene and rotation controls | `npx playwright test e2e/critical-path/scene-grid-workflows.spec.ts --project=critical-path` | Passed | Covered by targeted 21-test live-session run. DM/player rotation controls persist from scene panel. |
| Canvas/fog context actions | `npx playwright test e2e/regression/canvas-context-actions.spec.ts --project=regression` | Passed after fix | Targeted first run exposed submenu detach/click interception. Context menu now has submenu close grace period and click-to-open parent behavior; re-run passed. |

## Screenshots

Screenshots copied into `docs/qa/v0.20.30-rc1/screenshots/`:

- `dm-player-viewport-rotated.png` (1440 x 900): DM view shows the blue player viewport rotated with the player-side map orientation.
- `player-fog-covered.png` (1280 x 720): player view is fully covered before reveal.
- `player-fog-revealed.png` (1280 x 720): player view remains visible after reveal, live rotation, hard player-window close, and reconnect.

## Findings During This Run

- Targeted live-session run found a context-menu submenu timing issue: the rotation submenu could detach while selecting `90`, producing click interception from the page root. Fixed in `ContextMenu` by adding a short submenu close grace period and explicit click-to-open behavior for submenu parents. The same targeted run passed after the fix.
- Lint has no errors but reports 180 warnings across the codebase. This is not introduced by the current targeted change, but it should become a release-quality cleanup track so warning noise does not hide future regressions.
- Attempted the critical 21-test live-session suite against the hardened packaged executable. The run timed out before UI assertions because Playwright cannot attach to a binary with the hardened Electron fuses flipped (`RunAsNode` disabled). Verified fuses with `npx @electron/fuses read`.
- Added `npm run pack:qa:unfused` so packaged UI and live-session workflows can be verified with Playwright against a QA-only artifact while the release artifact remains hardened.

## Manual Signoff Script

Run this on the packaged app before release signoff:

1. Start `/Users/pdietric/GitHub/BoltBerry/release/mac-arm64/BoltBerry.app` from Finder or terminal.
2. Complete first-run setup in a fresh profile, create a campaign, import a real battle map, and open it in the canvas.
3. Open the player window, enter live mode, cover all fog, rotate DM view and player view independently, reveal a region, then hard-close the player window via the window control.
4. Reopen the player window and verify the player map, fog coverage/revealed area, token state, blackout/broadcast state, and player viewport rectangle are all still correct.
5. Exercise context menus with mouse movement between parent item and submenu: Rotate, Fog, Tool, token context menu, map list context menu.
6. Export the campaign, quit the app, relaunch, import/open the exported campaign, and verify map/fog/token/player state persists.

## Open Items

- Manual packaged-app live-session script still recommended on the hardened release artifact because Playwright attach is intentionally blocked by Electron fuses. Automated packaged UI/live-session coverage is now available through the unfused QA artifact.
- Release signing/notarization remains outside this local QA run; `npm run pack` intentionally produced an unsigned directory build.
- Consider adding CI coverage for `npm run pack:qa:unfused` plus the targeted packaged UI/live-session suite on release branches.
