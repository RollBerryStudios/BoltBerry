# Playwright Electron Test Plan

## Repository Findings

BoltBerry is an Electron desktop app with a TypeScript main process, sandboxed preload bundles, and a React/Vite renderer. The production entry point is `dist/main/index.js`; Playwright launches the app through Electron after `npm run build` has produced `dist/main`, `dist/preload`, and `dist/renderer`.

Key structure:

| Area | Files |
|---|---|
| Electron main | `src/main/index.ts`, `src/main/windows.ts` |
| Preload bridge | `src/preload/index.ts`, `src/preload/preload-dm.ts`, `src/preload/preload-player.ts` |
| Renderer shell | `src/renderer/App.tsx`, `src/renderer/components/Welcome.tsx`, `src/renderer/components/CampaignView.tsx`, `src/renderer/components/AppLayout.tsx` |
| Persistence | `src/main/db/database.ts`, `src/main/db/schema.ts` |
| IPC | `src/main/ipc/*.ts`, `src/shared/ipc-types.ts` |
| Unit tests | `src/__tests__/*.test.ts` via Vitest |
| E2E tests | `e2e/**/*.spec.ts` via Playwright Electron |
| CI | `.github/workflows/ci.yml` |

The app is offline-first and stores campaign data in SQLite under the selected user data folder. Assets are copied under `assets/`, exports/backups are ZIP archives, and player-window state is synced through IPC and preload APIs.

## Test Goals

- Verify the Electron app starts from built artifacts with a single DM window.
- Verify preload APIs are available only where intended.
- Validate main user flows: onboarding, campaign CRUD, map import/manage/open, player window lifecycle, export/import, settings, shortcuts, top-level navigation, and DM-to-player sync.
- Keep tests deterministic through isolated temporary user data folders and mocked native dialogs.
- Exercise real Electron IPC instead of bypassing behavior with test-only main-process hooks.
- Prefer stable `data-testid` selectors for core UI surfaces and use accessible roles where they are already reliable.

## Test Matrix

| Priority | Area | Coverage |
|---|---|---|
| P1 | App startup | Window count, title, renderer load, console errors, preload shape |
| P1 | Onboarding | First-run data folder selection, setup completion, initial campaign creation |
| P1 | Campaign CRUD | Create, validation, trim/max length, list, rename, duplicate, delete/cancel |
| P1 | Persistence/SQLite | Real Electron restart with shared temp profile, campaign/map/settings persistence, user data folder switching, backup/export/import |
| P1 | Electron security | contextIsolation, no Node globals, no raw ipcRenderer, player API separation, local-asset traversal rejection |
| P1 | Player window | Open, close, reuse existing window, player preload, blackout/full-sync/token delta |
| P2 | Map workflows | Import real image files, add second map, rename, reorder, cancel delete, confirm delete, open map canvas |
| P2 | Top-level navigation | Profile/settings, Wiki, Compendium, workspace tabs, native picker cancel paths |
| P2 | File workflows | Campaign export/import/backup, invalid archive, canceled import, real map/audio imports, invalid file and malformed ZIP cases |
| P3 | Accessibility basics | Keyboard shortcuts, Escape handling, roles/names, Axe serious/critical checks on core surfaces, panel/tool focus reachability |
| P3 | Performance/stability smoke | Dashboard responsiveness, large token canvas, large audio library filtering, player reconnect, renderer memory guard |
| P3 | Visual regression | Dedicated optional visual project with deterministic baselines for dashboard, workspace, DM canvas, and player view |
| P3 | Cross-platform smoke | Optional non-blocking macOS/Windows smoke matrix in CI |

## Planned/Current Test Files

- `e2e/smoke/app-launch.spec.ts`: app launch, security basics, preload API surface, console errors.
- `e2e/smoke/start-screen.spec.ts`: dashboard/start screen rendering and create modal basics.
- `e2e/regression/campaigns.spec.ts`: campaign CRUD and form validation.
- `e2e/regression/ipc-bridge.spec.ts`: semantic IPC APIs and local-asset security behavior.
- `e2e/regression/keyboard-shortcuts.spec.ts`: shortcut overlay and input-focus behavior.
- `e2e/regression/accessibility.spec.ts`: Axe serious/critical checks for setup, dashboard, campaign workspace, settings modal.
- `e2e/regression/accessibility-panels.spec.ts`: focus reachability for workspace panels, canvas toolbar, canvas area, and right sidebar tabs.
- `e2e/regression/accessibility-keyboard.spec.ts`: keyboard entry, Escape/focus return, settings modal keyboard access, toolbar arrow movement, labelled controls, and canvas focus behavior.
- `e2e/regression/menu-actions.spec.ts`: registered Electron menu actions for new campaign, settings, about, export.
- `e2e/regression/menu-accelerators.spec.ts`: registered menu accelerator contract and renderer keyboard accelerator flows.
- `e2e/regression/panel-depth.spec.ts`: note search/edit/delete, handout and character-sheet destructive paths, audio filtering/assignment/deletion, token-template filter/duplicate/delete.
- `e2e/regression/performance-smoke.spec.ts`: dashboard responsiveness with many campaigns in an isolated profile.
- `e2e/regression/performance-stability.spec.ts`: large token canvas responsiveness, large audio library filtering, player reconnect, and optional renderer memory smoke threshold.
- `e2e/critical-path/first-run-onboarding.spec.ts`: first-run setup and first campaign flow.
- `e2e/critical-path/campaign-lifecycle.spec.ts`: campaign creation, open, backup, export, duplicate, error responses.
- `e2e/critical-path/export-import.spec.ts`: ZIP round trip, quick backup, invalid/canceled imports.
- `e2e/critical-path/file-workflows.spec.ts`: invalid map import, missing import file, export cancel, malformed campaign ZIPs.
- `e2e/critical-path/map-management-actions.spec.ts`: real map import and workspace map actions.
- `e2e/critical-path/persistence.spec.ts`: real close/relaunch persistence for campaigns, maps, theme, language, data folder.
- `e2e/critical-path/canvas-workflows.spec.ts`: canvas visibility, token create/delete, fog cover/undo/redo, return to campaign.
- `e2e/critical-path/canvas-pointer-workflows.spec.ts`: real pointer-driven token drag, wall creation, drawing creation, and room creation.
- `e2e/critical-path/canvas-edge-cases.spec.ts`: seeded wall/room/drawing update/delete paths, fog brush variants, layer toggles, multi-select controls, zoom, pan, and fit.
- `e2e/critical-path/deep-panel-workflows.spec.ts`: notes, handouts, character sheets, audio assignment, token library insertion, and initiative entries.
- `e2e/critical-path/player-window.spec.ts`: player window lifecycle and security.
- `e2e/critical-path/two-window-sync.spec.ts`: DM/player state sync regression coverage.
- `e2e/critical-path/top-level-actions.spec.ts`: reference views, settings sections, workspace tabs.
- `e2e/critical-path/demo-production-session.spec.ts`: production-like setup with bundled map/audio content.
- `e2e/visual/core-surfaces.visual.spec.ts`: deterministic screenshot baselines for empty dashboard, seeded workspace, seeded DM canvas, and synchronized player view.

## Test Data Strategy

- Each `launchApp()` call creates a unique `boltberry-e2e-*` temporary user data directory.
- `launchAppWithUserDataDir(userDataDir, options)` and `relaunchApp(current, options)` reuse the same explicit profile for true restart persistence tests. Cleanup is caller-controlled and happens after the final relaunch.
- The helper passes `--user-data-dir`, sets `NODE_ENV=production`, and configures app storage through the same `setUserDataFolder` IPC flow used by onboarding.
- Temporary user data directories are removed in the fixture `close()` function.
- File tests use deterministic bundled assets under `e2e/testcontent/`.
- Shared data helpers in `e2e/helpers/test-data.ts` seed repeatable campaigns, maps, canvas entities, workspace panels, and fixture asset paths.
- Native open/save/message dialogs are mocked in the Electron main process with one-shot helpers.
- Tests do not read or write a developer's real BoltBerry profile.
- Visual tests use `launchApp({ visualTestMode: true })`, fixed window sizing, deterministic dashboard atmosphere values, hidden live regions/caret, disabled animation timing, and seeded fixture data.

## Selector Strategy

Stable test IDs are used for the main screen and critical controls:

- `screen-dashboard`
- `screen-campaign-workspace`
- `setup-wizard`
- `button-create-campaign`
- `input-campaign-name`
- `list-item-campaign`
- `button-rename-campaign`
- `button-delete-campaign`
- `button-import-first-map`
- `list-item-map`
- `button-add-map`
- `input-map-name`
- `nav-dashboard`
- `workspace-tabs`
- `toolbar`
- `toolbar-zoom-percent`
- `button-session-toggle`
- `button-toggle-player-window`
- `button-zoom-fit`
- `button-toggle-minimap`
- `button-toggle-grid-snap`
- `button-toggle-player-eye`
- `button-toggle-player-preview`
- `panel-notes`, `button-create-note`, `input-note-title`, `textarea-note-body`, `list-item-note`
- `button-delete-note`
- `panel-handouts`, `button-create-handout`, `input-handout-title`, `textarea-handout-body`, `list-item-handout`
- `button-delete-handout`
- `panel-character-sheets`, `button-create-character-sheet`, `input-character-name`, `list-item-character-sheet`
- `button-delete-character-sheet`
- `panel-token-library`, `input-token-search`, `list-item-token-template`, `button-insert-token`
- `button-duplicate-token-template`, `button-delete-token-template`
- `panel-initiative`, `input-initiative-name`, `button-add-initiative`, `list-item-initiative`
- `panel-audio-library`, `button-add-audio-folder`, `list-item-track`, `button-assign-track-1`
- `input-track-search`, `track-actions-menu`, `button-delete-track`
- `sidebar-right`, `sidebar-dock-strip`, `button-sidebar-dock-*`, `sidebar-accordion`, `button-sidebar-tab-*`
- `canvas-area`, `canvas-tool-dock`, `canvas-layer-dock`, `button-canvas-tool-*`, `button-undo`, `button-redo`
- `canvas-subtool-strip`, `button-fog-brush-size-*`, `button-fog-brush-reveal`, `button-fog-brush-cover`
- `button-canvas-layer-*`, `button-canvas-layer-reset`
- `multi-select-bar`, `button-multi-select-visibility`, `button-multi-select-clear`

Accessible roles remain useful for dialogs, headings, tabs, and controls where user-facing labels are stable and part of the UX contract.

## Electron-Specific Notes

- DM and player windows use separate preload bundles.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webviewTag: false` are verified from renderer-observable behavior.
- Player window must expose `window.playerAPI` and must not expose `window.electronAPI`.
- `local-asset://` protocol traversal is tested via renderer fetch.
- Native dialogs are controlled through main-process monkeypatches for deterministic tests.
- `window.confirm` is still used for workspace map deletion and is tested as a browser dialog.

## CI Notes

The CI workflow has an `e2e` job using `npm run build` and `xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" npm run test:e2e`. `continue-on-error: true` has been removed, so Linux E2E failures now fail the workflow.

The default `npm run test:e2e` command runs the `smoke`, `regression`, and `critical-path` projects. `npm run test:e2e:all` runs every configured Playwright project, and visual screenshots are intentionally separated behind `npm run test:e2e:visual` / `npm run test:e2e:visual:update`.

An optional non-blocking `e2e-cross-platform-smoke` matrix runs the smoke project on macOS and Windows for early platform signal.

## Known Boundaries

- Visual regression is enabled for four core surfaces in a dedicated optional project. It is not part of the default PR E2E gate yet, and baselines are not split per OS.
- Accessibility currently gates only `serious` and `critical` Axe violations on representative core surfaces.
- `@axe-core/playwright` is installed, but the Electron runner uses direct `axe-core` injection because `AxeBuilder` tries to create a standard browser page, which is not supported by this Electron launch context.
- Canvas pointer and edge tests now cover representative token drag, wall/drawing/room creation, seeded entity update/delete paths, fog brush variants, layer toggles, multi-select controls, and zoom/pan/fit. More complex pointer-driven edit modes and marquee selection still need additional helpers.
- Some workflows are covered through IPC/action-assisted E2E tests where exact native file picker or platform UI automation would be brittle.
- Native menu coverage invokes registered menu items through Electron APIs; OS-level visual menu traversal remains platform-dependent and out of scope.
- Performance coverage is smoke-level with larger dashboard/canvas/library/reconnect cases. It does not replace profiling, very large stress tests, or long-running soak tests.
- Cross-platform coverage is optional smoke-level on macOS/Windows; full regression/critical coverage remains Linux-gated.
