# Playwright E2E Test Implementation Report

## Summary

Implemented and stabilized a production-oriented Playwright Electron E2E suite for BoltBerry. The suite now launches the built Electron app with isolated test profiles, uses stable selectors for critical UI flows, exercises real IPC/file/persistence workflows, and passes across all configured Playwright projects.

Verification completed:

```bash
npm run build
npm run test:e2e -- --project=smoke
npm run test:e2e -- --project=regression
npm run test:e2e -- --project=critical-path
```

Results: 14 smoke tests passed, 24 regression tests passed, 36 critical-path tests passed.

## Repository Findings

BoltBerry is an Electron + React + Vite desktop app. The main process initializes SQLite, registers guarded IPC handlers, configures a custom `local-asset` protocol, builds the native menu, creates the DM window, and can create a separate player window. The renderer is split into first-run setup, dashboard/welcome, campaign workspace, map/canvas layout, Wiki/Bestiary, Compendium, settings, and player surfaces.

Important technical details:

- Main entry: `dist/main/index.js`, source in `src/main/index.ts`.
- BrowserWindow setup: `src/main/windows.ts`.
- DM/player preload isolation: `dist/preload/preload-dm.js` and `dist/preload/preload-player.js`.
- Persistence: SQLite database under selected user data folder at `data/rollberry.db`.
- Core domain: campaigns, maps, tokens, fog, walls, rooms, notes, handouts, character sheets, compendium, encounters, sessions, audio.
- File workflows: map/token/audio/handout import, PDF import, campaign ZIP export/import, quick backup.
- Security posture: context isolation, sandbox, nodeIntegration disabled, webview disabled, navigation/window-open restrictions, IPC sender guard, local asset path validation.

## Test Setup

The Playwright config uses Electron support from `@playwright/test`, one worker for predictable Electron execution, retries only in CI, HTML/list reporters, failure screenshots/videos/traces, and a global setup that verifies built app artifacts exist.

The launch fixture:

- creates an isolated temp user data directory per app launch;
- launches Electron against the app root;
- sets test environment values;
- optionally bypasses onboarding through the same persisted settings shape the renderer expects;
- initializes the main-process data folder through `setUserDataFolder`;
- removes the temp profile on close.

Native dialogs are mocked through one-shot main-process overrides for `showOpenDialog`, `showSaveDialog`, and `showMessageBox`.

## Added Files

- `docs/testing-playwright-plan.md`
- `docs/testing-playwright-report.md`
- Existing current-suite additions in this working tree include:
  - `e2e/helpers/onboarding-helpers.ts`
  - `e2e/critical-path/first-run-onboarding.spec.ts`
  - `e2e/critical-path/map-management-actions.spec.ts`
  - `e2e/critical-path/top-level-actions.spec.ts`
  - `e2e/critical-path/demo-production-session.spec.ts`
  - `e2e/testcontent/**`
  - `e2e/QA_UI_ACTION_COVERAGE.md`

## Modified Files

- `package.json`: added `test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug`, and `test:e2e:report`.
- `playwright.config.ts`: existing Electron Playwright configuration retained.
- `e2e/helpers/electron-launch.ts`: uses current settings storage, initializes test data folder via IPC, cleans temp profiles, replaces polling sleep with `app.waitForEvent('window')`.
- `e2e/helpers/page-objects.ts`: moved core selectors to stable `data-testid` hooks.
- `e2e/helpers/onboarding-helpers.ts`: uses stable setup/dashboard test IDs.
- `e2e/regression/campaigns.spec.ts`: stabilized campaign CRUD tests and fixed rename locators.
- `e2e/critical-path/map-management-actions.spec.ts`: uses stable map selectors and the correct browser dialog handling for `window.confirm`.
- `e2e/smoke/app-launch.spec.ts`: removed a fixed wait in favor of a UI readiness assertion.
- `src/renderer/components/SetupWizard.tsx`: added test IDs to setup screen, input, and buttons.
- `src/renderer/components/Welcome.tsx`: added test IDs to dashboard screen, campaign modal, list rows, and campaign actions.
- `src/renderer/components/CampaignView.tsx`: added test IDs to workspace, navigation, workspace tabs, map list, map actions, and play/import controls.
- `src/renderer/components/toolbar/Toolbar.tsx`: added test IDs for toolbar readiness, session toggle, and player-window toggle.

Some E2E files were already modified in the working tree before this pass; those changes were preserved and validated rather than reverted.

## Test Coverage by Area

| Area | Coverage | Notes |
|---|---:|---|
| App Startup | High | Launch, window count/title, renderer readiness, console errors, preload API shape |
| Navigation | Medium | Dashboard, campaign workspace, settings, Wiki, Compendium, workspace tabs |
| Main User Flows | High | Onboarding, campaign CRUD, map import/manage/open, production demo session |
| Persistence | Medium | SQLite-backed campaign/map data, folder switching, backup/export/import; full app relaunch persistence can be expanded |
| IPC | High | Semantic campaign/map APIs, app handlers, player sync, preload exposure checks |
| File Workflows | High | Map/audio import with fixtures, campaign export/import, backup, invalid/canceled imports |
| Settings | Medium | First-run setup and global settings sections covered |
| Error Handling | Medium | Invalid campaign names, missing campaign export/duplicate, invalid/canceled imports |
| Accessibility | Low | Role/name and keyboard shortcut basics; axe-core not integrated |
| Electron Security | High | Node globals, raw IPC, DM/player preload split, local-asset traversal, player window restrictions |

## Created Test Suites

- Smoke suites verify the app starts, the dashboard renders, the preload bridge exists, and fatal renderer errors are absent.
- Regression suites cover campaign CRUD, validation, delete confirmations, duplicate behavior, IPC bridge behavior, and keyboard shortcuts.
- Critical-path suites cover first-run onboarding, export/import, campaign lifecycle, map management with real assets, player window lifecycle/security, top-level navigation, and two-window sync.

## Found Issues

- Test issue fixed: campaign rename tests used a row locator filtered by visible text. Once the row entered edit mode, the name moved into an input value and was no longer normal text content, so the locator reevaluated to no element.
- Test issue fixed: map deletion in `CampaignView` uses `window.confirm`, not Electron `dialog.showMessageBox`; the test now handles it as a browser dialog.
- Testability gap: some secondary UI surfaces still rely on titles/classes for selectors. Core flows now have `data-testid`, but deeper panels should receive IDs as their E2E coverage expands.
- CI gap: `.github/workflows/ci.yml` has `continue-on-error: true` for E2E, so failures currently do not fail the workflow.

No product bug was confirmed during the final verification run.

## Remaining Gaps

- Full restart persistence is partly covered through reloads and fresh DB reads, but should be expanded with a helper that closes and relaunches against the same temporary profile before cleanup.
- Canvas interactions are mostly verified through import/open/sync behavior; drawing, fog brushing, wall editing, room editing, and token drag interactions need focused canvas automation.
- Axe-based accessibility checks are not yet integrated.
- Visual regression is not enabled because animated/dynamic surfaces need deterministic visual modes.
- Native menu items are indirectly covered through renderer/menu IPC behavior, but not exhaustively exercised through menu automation.

## How to Run

```bash
npm run build
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report
```

Targeted runs:

```bash
npm run test:e2e -- --project=smoke
npm run test:e2e -- --project=regression
npm run test:e2e -- --project=critical-path
```

## Recommended Next Steps

1. Remove `continue-on-error: true` from the CI E2E job once the team is ready to make E2E release-gating.
2. Add a `relaunchAppWithUserDataDir` helper to explicitly test close/reopen persistence for campaigns, maps, settings, and player/session state.
3. Add stable test IDs to deeper panel workflows: notes, handouts, character sheets, token library, initiative, audio boards, and canvas toolbar controls.
4. Add focused canvas automation for token placement, fog, walls, drawings, and undo/redo.
5. Add a small axe-core pass for dashboard, setup, workspace, and settings dialogs.
6. Consider a deterministic visual mode before adding screenshot snapshots for dashboard/workspace/canvas.
