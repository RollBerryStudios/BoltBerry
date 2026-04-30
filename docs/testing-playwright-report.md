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

Results after the latest follow-up pass: 14 smoke tests passed, 35 regression tests passed, 56 critical-path tests passed.

## Follow-up Implementation Status

Completed the documented follow-up items from the Playwright report:

- CI E2E is now a required gate: `.github/workflows/ci.yml` no longer uses `continue-on-error: true` on the `e2e` job. The job still builds the app and runs Playwright under `xvfb-run`.
- Restart persistence coverage now uses real Electron closes/relaunches against the same temporary `userData` directory via `launchAppWithUserDataDir()` and `relaunchApp()`.
- New critical-path suites cover persistence, canvas workflows, and file-workflow negative cases.
- New regression suites cover serious/critical Axe accessibility checks and native menu action dispatch.
- Additional follow-up suites now cover deep workspace panels, real canvas pointer interactions, panel focus reachability, and a dashboard performance smoke path.
- Deeper panel and canvas selectors now use stable domain-oriented `data-testid`s for notes, handouts, character sheets, token library, initiative, audio/music, token panel, toolbar, and canvas docks.
- Right sidebar dock controls now expose stable IDs for focus and panel reachability checks.
- Minimal product fixes were made where tests exposed real behavior issues: fog redo now reapplies the redone operation, the UI theme store initializes from persisted `localStorage.theme`, settings folder buttons have distinct test IDs, and two low-contrast setup texts were raised to the existing secondary text color.

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
  - `e2e/critical-path/persistence.spec.ts`
  - `e2e/critical-path/canvas-workflows.spec.ts`
  - `e2e/critical-path/canvas-pointer-workflows.spec.ts`
  - `e2e/critical-path/deep-panel-workflows.spec.ts`
  - `e2e/critical-path/file-workflows.spec.ts`
  - `e2e/regression/accessibility.spec.ts`
  - `e2e/regression/accessibility-panels.spec.ts`
  - `e2e/regression/menu-actions.spec.ts`
  - `e2e/regression/performance-smoke.spec.ts`
  - `e2e/testcontent/**`
  - `e2e/QA_UI_ACTION_COVERAGE.md`

## Modified Files

- `package.json`: added `test:e2e:ui`, `test:e2e:headed`, `test:e2e:debug`, and `test:e2e:report`.
- `playwright.config.ts`: existing Electron Playwright configuration retained.
- `e2e/helpers/electron-launch.ts`: uses current settings storage, initializes test data folder via IPC, cleans temp profiles, replaces polling sleep with `app.waitForEvent('window')`, and supports relaunching against an explicit reusable `userData` directory.
- `e2e/helpers/dialog-helpers.ts`: includes open/save/message dialog mocks, including save-cancel coverage.
- `e2e/helpers/page-objects.ts`: moved core selectors to stable `data-testid` hooks.
- `e2e/helpers/onboarding-helpers.ts`: uses stable setup/dashboard test IDs.
- `e2e/regression/campaigns.spec.ts`: stabilized campaign CRUD tests and fixed rename locators.
- `e2e/critical-path/map-management-actions.spec.ts`: uses stable map selectors and the correct browser dialog handling for `window.confirm`.
- `e2e/smoke/app-launch.spec.ts`: removed a fixed wait in favor of a UI readiness assertion.
- `src/renderer/components/SetupWizard.tsx`: added test IDs to setup screen, input, and buttons.
- `src/renderer/components/Welcome.tsx`: added test IDs to dashboard screen, campaign modal, list rows, and campaign actions.
- `src/renderer/components/CampaignView.tsx`: added test IDs to workspace, navigation, workspace tabs, map list, map actions, and play/import controls.
- `src/renderer/components/toolbar/Toolbar.tsx`: added test IDs for toolbar readiness, undo/redo, session toggle, and player-window toggle.
- `src/renderer/components/sidebar/panels/*.tsx`: added stable selectors for notes, handouts, character sheets, token library, token list, initiative, and audio/music controls.
- `src/renderer/components/sidebar/RightSidebar.tsx`: added stable selectors for the right sidebar, dock strip, dock buttons, accordion, and sidebar tabs.
- `src/renderer/components/canvas/*.tsx`: added stable selectors for the canvas area, canvas tool dock, layer dock, and tool buttons.
- `src/renderer/stores/uiStore.ts`: initializes theme from persisted storage so restart persistence does not overwrite the saved theme.
- `src/renderer/components/canvas/FogLayer.tsx`: fixes fog redo to apply the operation returned by `redo()`.

Some E2E files were already modified in the working tree before this pass; those changes were preserved and validated rather than reverted.

## Test Coverage by Area

| Area | Coverage | Notes |
|---|---:|---|
| App Startup | High | Launch, window count/title, renderer readiness, console errors, preload API shape |
| Navigation | Medium | Dashboard, campaign workspace, settings, Wiki, Compendium, workspace tabs |
| Main User Flows | High | Onboarding, campaign CRUD, map import/manage/open, production demo session |
| Persistence | High | Real Electron relaunch with shared profile for campaign create/rename/delete, map import, theme, language, and data folder |
| IPC | High | Semantic campaign/map APIs, app handlers, player sync, preload exposure checks |
| File Workflows | High | Map/audio import with fixtures, campaign export/import, backup, invalid/canceled imports, invalid map images, missing paths, malformed ZIPs |
| Settings | Medium | First-run setup and global settings sections covered |
| Error Handling | Medium | Invalid campaign names, missing campaign export/duplicate, invalid/canceled imports |
| Accessibility | Medium | Axe serious/critical checks for setup, dashboard, campaign workspace, and settings modal plus focus checks for panel/tool entry points |
| Electron Security | High | Node globals, raw IPC, DM/player preload split, local-asset traversal, player window restrictions |
| Performance | Low | Dashboard smoke with many isolated campaigns |

## Created Test Suites

- Smoke suites verify the app starts, the dashboard renders, the preload bridge exists, and fatal renderer errors are absent.
- Regression suites cover campaign CRUD, validation, delete confirmations, duplicate behavior, IPC bridge behavior, and keyboard shortcuts.
- Critical-path suites cover first-run onboarding, export/import, campaign lifecycle, map management with real assets, player window lifecycle/security, top-level navigation, and two-window sync.
- Persistence suite covers campaign create/rename/delete, map import, and settings across real Electron restarts with one shared temporary profile.
- Canvas workflow suite covers map open, canvas/tool visibility, token create/delete with DB checks, fog cover state, fog undo/redo, and return to campaign map listing.
- Canvas pointer workflow suite covers real pointer-driven token drag persistence plus wall, freehand drawing, and room creation through the canvas tools.
- Deep panel workflow suite covers notes, handouts, character sheets, audio folder import/track assignment, token-library insertion, and initiative entries with DB assertions.
- File workflow suite covers invalid image import, missing import paths, export cancel, ZIP without `campaign.json`, and ZIP with invalid JSON.
- Accessibility suite uses `axe-core` injection in the Electron renderer. `@axe-core/playwright` is installed, but its `AxeBuilder` cannot create a normal browser page in this Electron context, so the test injects `axe-core` directly and fails only `serious`/`critical` violations.
- Accessibility panel suite covers keyboard-focusable entry points for workspace panels, canvas toolbar, canvas area, and right sidebar tabs.
- Menu actions suite invokes registered Electron menu items through `Menu.getApplicationMenu()` and verifies the renderer flows they dispatch.
- Performance smoke suite creates many isolated campaigns through IPC and verifies the dashboard remains responsive within the configured threshold.

## Found Issues

- Test issue fixed: campaign rename tests used a row locator filtered by visible text. Once the row entered edit mode, the name moved into an input value and was no longer normal text content, so the locator reevaluated to no element.
- Test issue fixed: map deletion in `CampaignView` uses `window.confirm`, not Electron `dialog.showMessageBox`; the test now handles it as a browser dialog.
- Product issue fixed: fog redo used a stale Zustand snapshot after `fs.redo()`, so the DB/UI did not return to the redone fog bitmap.
- Product issue fixed: persisted light theme was overwritten at restart because the UI store initialized `theme` to `dark` before App persisted it again.
- Testability issue fixed: settings storage buttons had an ambiguous/misplaced data-testid; open-folder and change-folder now have distinct IDs.
- Accessibility issue fixed: SetupWizard helper text on overlay background did not meet Axe's contrast threshold.

## Remaining Gaps

- Canvas pointer coverage now includes token drag, wall creation, drawing creation, and room creation. Remaining canvas gaps are edit-mode pointer flows, brush-size variants, selection marquee edge cases, and pixel-level visual assertions.
- Deep panels now have happy-path coverage for core create/insert/assign actions. Remaining gaps are richer editor states, destructive actions inside those panels, bulk operations, and malformed media/library edge cases.
- Visual regression is not enabled because animated/dynamic surfaces need deterministic visual modes.
- Native menu tests invoke Electron's registered menu items directly. This avoids OS menu automation differences across macOS/Linux/Windows; visual native menu traversal remains intentionally out of scope.
- Performance coverage is a smoke check only; it does not yet measure canvas stress, very large libraries, or long-running session memory behavior.

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

1. Add deterministic coverage for canvas edit modes, fog brush variants, marquee selection, and layer visibility interactions.
2. Expand accessibility checks beyond serious/critical baseline once existing UI contrast and labeling debt is intentionally budgeted.
3. Add a deterministic visual mode before introducing screenshot snapshots for dashboard/workspace/canvas.
4. Add performance scenarios for large maps, large token libraries, and long-running sessions.
