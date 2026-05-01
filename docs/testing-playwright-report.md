# Playwright E2E Test Implementation Report

## Summary

Implemented and stabilized a production-oriented Playwright Electron E2E suite for BoltBerry. The suite now launches the built Electron app with isolated test profiles, uses stable selectors for critical UI flows, exercises real IPC/file/persistence workflows, and passes across all configured Playwright projects.

Verification completed:

```bash
npm test
npm run build
npm run lint
npm run check:i18n
npm run check:bundle
npm run test:e2e
npm run test:e2e:visual
npm run test:e2e:nightly
```

Results after the latest verified pass: 269 unit tests passed; the default E2E gate reported 141 passed and 1 intentionally skipped packaged-app smoke; 4 visual-regression tests passed; and 2 nightly stress tests passed. The local LFS asset pull was also verified so token/compendium assets are real files rather than pointer stubs before release packaging.

## Follow-up Implementation Status

Completed the documented follow-up items from the Playwright report:

- CI E2E is now a required gate: `.github/workflows/ci.yml` no longer uses `continue-on-error: true` on the `e2e` job. The job still builds the app and runs Playwright under `xvfb-run`.
- Restart persistence coverage now uses real Electron closes/relaunches against the same temporary `userData` directory via `launchAppWithUserDataDir()` and `relaunchApp()`.
- New critical-path suites cover persistence, canvas workflows, and file-workflow negative cases.
- New regression suites cover serious/critical Axe accessibility checks and native menu action dispatch.
- Additional follow-up suites now cover deep workspace panels, real canvas pointer interactions, panel focus reachability, keyboard accessibility, menu accelerator contracts, canvas edge cases, panel destructive/filtering paths, and broader performance/stability smoke paths.
- Recent regression coverage now includes room-based fog fill/clear behavior, DM/player synchronization visibility checks, menu/context-menu accessibility, and responsive layout edge cases for dense toolbar, notes, and character-sheet surfaces.
- A deterministic visual-test mode is available through `launchApp({ visualTestMode: true })`, `BOLTBERRY_E2E_VISUAL=1`, and the dedicated `visual` Playwright project. It stabilizes the viewport, CSS timing, caret visibility, live regions, and seeded visual data.
- Visual baselines now cover the empty dashboard, seeded campaign workspace, seeded DM canvas, and synchronized player view under `e2e/__screenshots__/visual/`.
- CI now includes an optional, non-blocking macOS/Windows smoke matrix for early cross-platform signal while Linux remains the required full E2E gate.
- CI now includes a scheduled/manual Linux nightly stress job for large canvas/audio-library scenarios, kept outside the PR gate.
- The launch helper now supports `BOLTBERRY_APP_PATH` for alternate app roots and `BOLTBERRY_E2E_EXECUTABLE_PATH` for optional packaged executable smoke tests.
- Fault-recovery coverage now exercises unicode/space-heavy file paths, corrupt audio imports, symlink-safe audio folder scanning, and missing referenced map assets.
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
  - `e2e/critical-path/canvas-edge-cases.spec.ts`
  - `e2e/critical-path/deep-panel-workflows.spec.ts`
  - `e2e/critical-path/file-workflows.spec.ts`
  - `e2e/helpers/test-data.ts`
  - `e2e/regression/accessibility.spec.ts`
  - `e2e/regression/accessibility-keyboard.spec.ts`
  - `e2e/regression/accessibility-panels.spec.ts`
  - `e2e/regression/fault-recovery.spec.ts`
  - `e2e/regression/menu-accelerators.spec.ts`
  - `e2e/regression/menu-actions.spec.ts`
  - `e2e/regression/panel-depth.spec.ts`
  - `e2e/regression/performance-smoke.spec.ts`
  - `e2e/regression/performance-stability.spec.ts`
  - `e2e/visual/core-surfaces.visual.spec.ts`
  - `e2e/nightly/large-data.stress.spec.ts`
  - `e2e/smoke/packaged-app.spec.ts`
  - `e2e/__screenshots__/visual/**`
  - `e2e/testcontent/**`
  - `e2e/QA_UI_ACTION_COVERAGE.md`

## Modified Files

- `package.json`: added targeted E2E scripts, including default non-visual gate projects, all-project runs, visual snapshot/update commands, nightly stress runs, and optional packaged executable smoke runs.
- `playwright.config.ts`: adds dedicated `visual` and `nightly` projects and snapshot path template while keeping the default smoke/regression/critical-path gate separate.
- `.github/workflows/ci.yml`: keeps Linux full E2E required, adds optional non-blocking macOS/Windows smoke jobs, and adds scheduled/manual Linux nightly stress coverage.
- `e2e/helpers/electron-launch.ts`: uses current settings storage, initializes test data folder via IPC, cleans temp profiles, replaces polling sleep with `app.waitForEvent('window')`, supports relaunching against an explicit reusable `userData` directory, supports deterministic visual/window sizing mode, and can launch alternate app roots or packaged executables via environment variables.
- `e2e/global-setup.ts`: verifies packaged executables when `BOLTBERRY_E2E_EXECUTABLE_PATH` is set instead of requiring repo build artifacts.
- `e2e/helpers/test-data.ts`: centralizes seeded campaign, map, canvas, panel, and asset fixtures for repeatable critical-path, regression, and visual tests.
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
| File Workflows | High | Map/audio import with fixtures, campaign export/import, backup, invalid/canceled imports, invalid map images, missing paths, malformed ZIPs, unicode/space-heavy paths |
| Settings | Medium | First-run setup and global settings sections covered |
| Error Handling | Medium | Invalid campaign names, missing campaign export/duplicate, invalid/canceled imports |
| Accessibility | Medium | Axe serious/critical checks for setup, dashboard, campaign workspace, and settings modal plus focus checks for panel/tool entry points |
| Electron Security | High | Node globals, raw IPC, DM/player preload split, local-asset traversal, player window restrictions |
| Visual Regression | Medium | Deterministic baselines for dashboard, seeded workspace, seeded DM canvas, and synchronized player view |
| Fault Recovery | Medium | Corrupt audio import, unsupported/symlinked folder scans, missing referenced assets, unicode/space-heavy import/export paths |
| Performance | Medium | Dashboard, large token canvas, large audio library filtering, player reconnect, renderer memory smoke thresholds, and optional nightly stress coverage |
| Packaging | Low | Optional packaged executable smoke when `BOLTBERRY_E2E_EXECUTABLE_PATH` is provided |

## Created Test Suites

- Smoke suites verify the app starts, the dashboard renders, the preload bridge exists, and fatal renderer errors are absent.
- Regression suites cover campaign CRUD, validation, delete confirmations, duplicate behavior, IPC bridge behavior, and keyboard shortcuts.
- Critical-path suites cover first-run onboarding, export/import, campaign lifecycle, map management with real assets, player window lifecycle/security, top-level navigation, and two-window sync.
- Persistence suite covers campaign create/rename/delete, map import, and settings across real Electron restarts with one shared temporary profile.
- Canvas workflow suite covers map open, canvas/tool visibility, token create/delete with DB checks, fog cover state, fog undo/redo, and return to campaign map listing.
- Canvas pointer workflow suite covers real pointer-driven token drag persistence plus wall, freehand drawing, and room creation through the canvas tools.
- Canvas edge-case suite covers editing/deleting seeded wall/room/drawing records through canvas action paths, room fog fill/clear, fog brush reveal/cover variants, layer visibility toggles, multi-select controls, zoom, pan, and fit controls.
- Deep panel workflow suite covers notes, handouts, character sheets, audio folder import/track assignment, token-library insertion, and initiative entries with DB assertions.
- File workflow suite covers invalid image import, missing import paths, export cancel, ZIP without `campaign.json`, and ZIP with invalid JSON.
- Accessibility suite uses `axe-core` injection in the Electron renderer. `@axe-core/playwright` is installed, but its `AxeBuilder` cannot create a normal browser page in this Electron context, so the test injects `axe-core` directly and fails only `serious`/`critical` violations.
- Accessibility panel suite covers keyboard-focusable entry points for workspace panels, canvas toolbar, canvas area, and right sidebar tabs.
- Accessibility keyboard suite covers keyboard entry/cancel/focus return for dashboard create flows, settings modal keyboard access, toolbar arrow movement, labelled icon controls, canvas focus, and shortcut overlay dismissal.
- Fault-recovery suite covers unicode/space-heavy map import and campaign export paths, corrupt audio files, unsupported files and symlinked folders during audio folder scans, and missing referenced map assets.
- Menu actions suite invokes registered Electron menu items through `Menu.getApplicationMenu()` and verifies the renderer flows they dispatch. Menu accelerator suite verifies accelerator registration and renderer keyboard accelerator behavior.
- Menu/context regression coverage exercises context-sensitive native menu enablement, command-palette filtering, Wiki/context menu keyboard semantics, SFX emoji picker behavior, canvas layer popups, and clamped map context menus.
- Panel-depth regression suite covers note search/edit/delete, handout and character-sheet destructive cancel/confirm paths, audio empty-folder/filter/assignment/delete paths, and token-template filter/duplicate/delete paths.
- Performance smoke/stability suites create many campaigns, large token rosters, large audio libraries, repeat player reconnects, and check renderer memory where Chromium exposes heap metrics.
- Visual suite captures deterministic screenshot baselines for the empty dashboard, seeded workspace, seeded DM canvas, and synchronized player view.
- Packaged-app smoke suite is skipped by default and validates an already packaged executable when `BOLTBERRY_E2E_EXECUTABLE_PATH` is set.
- Nightly stress suite is skipped by default and runs only through `npm run test:e2e:nightly`, covering hundreds of tokens/geometry rows and a larger audio library.

## Found Issues

- Test issue fixed: campaign rename tests used a row locator filtered by visible text. Once the row entered edit mode, the name moved into an input value and was no longer normal text content, so the locator reevaluated to no element.
- Test issue fixed: map deletion in `CampaignView` uses `window.confirm`, not Electron `dialog.showMessageBox`; the test now handles it as a browser dialog.
- Product issue fixed: fog redo used a stale Zustand snapshot after `fs.redo()`, so the DB/UI did not return to the redone fog bitmap.
- Product issue fixed: persisted light theme was overwritten at restart because the UI store initialized `theme` to `dark` before App persisted it again.
- Testability issue fixed: settings storage buttons had an ambiguous/misplaced data-testid; open-folder and change-folder now have distinct IDs.
- Accessibility issue fixed: SetupWizard helper text on overlay background did not meet Axe's contrast threshold.

## Remaining Gaps

- Canvas pointer and edge coverage now includes token drag, wall/drawing/room creation, seeded entity update/delete paths, room fog fill/clear, brush-size reveal/cover variants, multi-select controls, layer toggles, and zoom/pan/fit checks. Remaining canvas gaps are full pointer-driven edit-mode geometry manipulation, marquee selection with real pointer drag, and broader pixel assertions beyond the current core visual baselines.
- Deep panels now have happy-path and selected destructive/filtering coverage for notes, handouts, character sheets, token library, initiative, and audio. Remaining gaps are richer editor states, bulk operations, malformed media/library edge cases, and exhaustive validation rules.
- Visual regression is enabled for core surfaces in a dedicated optional project. It is not part of the default `npm run test:e2e` gate yet, and baselines are currently Linux/local-renderer oriented rather than per-OS.
- Native menu tests invoke Electron's registered menu items directly. This avoids OS menu automation differences across macOS/Linux/Windows; visual native menu traversal remains intentionally out of scope.
- Performance coverage is still smoke-level. It covers larger UI data sets and reconnect/memory guards, but it does not replace profiling, long-running soak tests, or very large map/library stress runs.
- Nightly stress coverage provides larger data guards but is not exhaustive soak testing and is not part of the PR gate.
- Cross-platform coverage is optional smoke-level on macOS/Windows; full regression and critical-path coverage remain Linux-gated in CI.
- Packaged-app coverage requires a caller-provided packaged executable path; the CI workflow still builds and tests the repo app by default.

## How to Run

```bash
npm run build
npm run test:e2e
npm run test:e2e:all
npm run test:e2e:visual
npm run test:e2e:visual:update
npm run test:e2e:nightly
npm run test:e2e:packaged
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
npm run test:e2e:visual
BOLTBERRY_RUN_NIGHTLY=1 npm run test:e2e:nightly
BOLTBERRY_E2E_EXECUTABLE_PATH=/path/to/BoltBerry npm run test:e2e:packaged
```

## Recommended Next Steps

1. Decide when the `visual` project should become a CI gate instead of an explicitly run optional project, and whether baselines should be split per OS.
2. Add real pointer-driven edit-mode geometry manipulation for walls, rooms, drawings, and marquee selection.
3. Expand accessibility checks beyond serious/critical baseline once existing UI contrast and labeling debt is intentionally budgeted.
4. Add a packaging CI job that builds an unpacked app per platform and feeds its executable into `npm run test:e2e:packaged`.
5. Extend nightly stress into longer session soak tests with memory deltas across repeated player sync and export/import cycles.
