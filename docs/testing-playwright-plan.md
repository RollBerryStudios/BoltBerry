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
| P1 | Persistence/SQLite | App restart via reload and IPC-created data, user data folder switching, backup/export/import |
| P1 | Electron security | contextIsolation, no Node globals, no raw ipcRenderer, player API separation, local-asset traversal rejection |
| P1 | Player window | Open, close, reuse existing window, player preload, blackout/full-sync/token delta |
| P2 | Map workflows | Import real image files, add second map, rename, reorder, cancel delete, confirm delete, open map canvas |
| P2 | Top-level navigation | Profile/settings, Wiki, Compendium, workspace tabs, native picker cancel paths |
| P2 | File workflows | Campaign export/import/backup, invalid archive, canceled import, real map/audio imports |
| P3 | Accessibility basics | Keyboard shortcuts, Escape handling, roles/names on main dialogs and navigation |
| P3 | Visual regression | Not enabled; current UI has animation/dynamic canvas state, so screenshots are limited to failure diagnostics |

## Planned/Current Test Files

- `e2e/smoke/app-launch.spec.ts`: app launch, security basics, preload API surface, console errors.
- `e2e/smoke/start-screen.spec.ts`: dashboard/start screen rendering and create modal basics.
- `e2e/regression/campaigns.spec.ts`: campaign CRUD and form validation.
- `e2e/regression/ipc-bridge.spec.ts`: semantic IPC APIs and local-asset security behavior.
- `e2e/regression/keyboard-shortcuts.spec.ts`: shortcut overlay and input-focus behavior.
- `e2e/critical-path/first-run-onboarding.spec.ts`: first-run setup and first campaign flow.
- `e2e/critical-path/campaign-lifecycle.spec.ts`: campaign creation, open, backup, export, duplicate, error responses.
- `e2e/critical-path/export-import.spec.ts`: ZIP round trip, quick backup, invalid/canceled imports.
- `e2e/critical-path/map-management-actions.spec.ts`: real map import and workspace map actions.
- `e2e/critical-path/player-window.spec.ts`: player window lifecycle and security.
- `e2e/critical-path/two-window-sync.spec.ts`: DM/player state sync regression coverage.
- `e2e/critical-path/top-level-actions.spec.ts`: reference views, settings sections, workspace tabs.
- `e2e/critical-path/demo-production-session.spec.ts`: production-like setup with bundled map/audio content.

## Test Data Strategy

- Each `launchApp()` call creates a unique `boltberry-e2e-*` temporary user data directory.
- The helper passes `--user-data-dir`, sets `NODE_ENV=production`, and configures app storage through the same `setUserDataFolder` IPC flow used by onboarding.
- Temporary user data directories are removed in the fixture `close()` function.
- File tests use deterministic bundled assets under `e2e/testcontent/`.
- Native open/save/message dialogs are mocked in the Electron main process with one-shot helpers.
- Tests do not read or write a developer's real BoltBerry profile.

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
- `button-session-toggle`
- `button-toggle-player-window`

Accessible roles remain useful for dialogs, headings, tabs, and controls where user-facing labels are stable and part of the UX contract.

## Electron-Specific Notes

- DM and player windows use separate preload bundles.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webviewTag: false` are verified from renderer-observable behavior.
- Player window must expose `window.playerAPI` and must not expose `window.electronAPI`.
- `local-asset://` protocol traversal is tested via renderer fetch.
- Native dialogs are controlled through main-process monkeypatches for deterministic tests.
- `window.confirm` is still used for workspace map deletion and is tested as a browser dialog.

## CI Notes

The existing CI workflow already has an `e2e` job using `xvfb-run`, `npm run build`, and `npm run test:e2e`. The job is currently `continue-on-error: true`; once the suite is considered release-gating, remove that flag so E2E failures block merges.

## Known Boundaries

- Full visual regression is intentionally not enabled because map canvas rendering, weather effects, PDF rendering, and animations need additional determinism work.
- Deep accessibility auditing with axe-core is not added yet; current coverage is keyboard/role/name oriented.
- Some workflows are covered through IPC-level E2E tests where UI automation would require extensive native file picker or canvas interaction.
- A few deeper panel assertions still use component classes for repeated dynamic rows or canvas internals; these are documented follow-up targets for the next selector hardening pass.
