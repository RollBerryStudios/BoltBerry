# BoltBerry E2E Test Suite

End-to-end GUI tests for BoltBerry, built with **Playwright** and its built-in Electron support.

## Quick Start

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Install Playwright browsers (first time only)
npx playwright install

# 3. Build the app (required before every test run)
npm run build

# 4. Run the default E2E gate (smoke, regression, critical-path)
npm run test:e2e

# 5. Run visual regression separately
npm run test:e2e:visual

# 6. Update visual baselines intentionally
npm run test:e2e:visual:update

# 7. Run opt-in nightly stress checks
npm run test:e2e:nightly

# 8. Process-smoke a hardened packaged executable
BOLTBERRY_E2E_EXECUTABLE_PATH=/path/to/BoltBerry npm run test:e2e:packaged

# 9. Run with interactive UI / headed / debug modes
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report

# 10. Run a specific group
npx playwright test --project=smoke
npx playwright test --project=regression
npx playwright test --project=critical-path
npm run test:e2e:visual
```

## Directory Structure

```
e2e/
├── global-setup.ts              # Verifies build artefacts exist
├── helpers/
│   ├── electron-launch.ts       # App launch factory + window helpers
│   ├── test-data.ts             # Shared deterministic fixture/seed helpers
│   ├── page-objects.ts          # Page Object Models (StartScreen, etc.)
│   └── dialog-helpers.ts        # Native dialog mocking
├── smoke/
│   ├── app-launch.spec.ts       # App starts, windows, security settings
│   ├── packaged-app.spec.ts     # Optional packaged executable smoke
│   └── start-screen.spec.ts     # StartScreen rendering
├── regression/
│   ├── campaigns.spec.ts        # Campaign CRUD (create/rename/delete/duplicate)
│   ├── keyboard-shortcuts.spec.ts # ? / F1 / Escape overlays
│   ├── ipc-bridge.spec.ts       # IPC channel correctness + SQL injection guard
│   ├── accessibility.spec.ts    # Axe serious/critical accessibility baseline
│   ├── accessibility-keyboard.spec.ts # Keyboard/focus behavior
│   ├── accessibility-panels.spec.ts # Panel/tool focus reachability
│   ├── fault-recovery.spec.ts   # Corrupt media, path, and missing asset recovery
│   ├── menu-accelerators.spec.ts # Menu accelerator contracts
│   ├── menu-actions.spec.ts     # Registered Electron menu actions
│   ├── canvas-context-actions.spec.ts # Canvas context submenu actions
│   ├── panel-depth.spec.ts      # Deeper panel edit/delete/filter flows
│   ├── remaining-depth-deltas.spec.ts # Character/wiki/compendium depth deltas
│   ├── performance-smoke.spec.ts # Dashboard responsiveness with many campaigns
│   └── performance-stability.spec.ts # Large canvas/audio/reconnect guards
├── critical-path/
│   ├── canvas-edge-cases.spec.ts # Canvas layer/multi-select/brush/zoom cases
│   ├── canvas-workflows.spec.ts  # Canvas open, token, fog, undo/redo
│   ├── canvas-pointer-workflows.spec.ts # Pointer-driven token/wall/drawing/room flows
│   ├── campaign-lifecycle.spec.ts # Full DM flow: create → view → export
│   ├── deep-panel-workflows.spec.ts # Notes, handouts, sheets, audio, tokens, initiative
│   ├── encounter-workflows.spec.ts # Encounter save/spawn/export/import lifecycle
│   ├── file-workflows.spec.ts    # Negative file/archive cases
│   ├── player-panel-broadcasts.spec.ts # Handout + initiative panel sync to player
│   ├── persistence.spec.ts       # Real restart persistence
│   ├── player-window.spec.ts      # Player window open/close/security
│   ├── scene-grid-workflows.spec.ts # Grid settings and DM/player scene rotation
│   ├── settings.spec.ts           # SetupWizard + data folder switching
│   └── export-import.spec.ts      # Export → import round-trip
├── visual/
│   └── core-surfaces.visual.spec.ts # Dashboard/workspace/canvas/player baselines
└── nightly/
    └── large-data.stress.spec.ts # Opt-in large canvas/audio stress guards
```

## Test Groups

| Group | Purpose | When to run |
|---|---|---|
| `smoke` | App starts, windows render, security | Every commit |
| `regression` | CRUD flows, shortcuts, IPC bridge | Every PR |
| `critical-path` | Full user journeys, export/import | Before every release |
| `visual` | Screenshot baselines for core surfaces | Optional gate / intentional updates |
| `nightly` | Larger stress scenarios | Scheduled/manual only |

## Isolation Strategy

Each test call to `launchApp()` creates a fresh **temporary directory** for `userData`.  This ensures:
- No shared SQLite database between tests.
- No shared assets or settings.
- Tests can run in any order.

The `SetupWizard` is bypassed by default by setting the same setup-complete and data-folder `localStorage` keys used by the renderer. Tests that specifically test the wizard use `launchApp({ skipSetupWizard: false })`.

Restart persistence tests use:

```typescript
const launch = await launchAppWithUserDataDir(userDataDir, { cleanupUserDataDir: false })
const relaunched = await relaunchApp(launch)
```

These helpers reuse the same Electron `--user-data-dir`; cleanup is left to the test after the final relaunch.

Shared fixture helpers in `e2e/helpers/test-data.ts` create deterministic campaigns, maps, canvas entities, workspace panel content, and fixture asset paths for critical-path, regression, and visual tests.

`BOLTBERRY_APP_PATH` can point the launch helper at an alternate unpacked app root. `BOLTBERRY_E2E_EXECUTABLE_PATH` launches a packaged executable directly and makes global setup verify that executable instead of repo build artifacts. Playwright-controlled packaged UI tests require an executable that still allows Electron's automation launch path; hardened release binaries with `RunAsNode` disabled by Electron fuses are expected to time out under `_electron.launch()`.

## Visual Regression

Visual coverage lives in `e2e/visual/core-surfaces.visual.spec.ts` and is intentionally separated from the default E2E gate. It runs only when requested:

```bash
npm run test:e2e:visual
npm run test:e2e:visual:update
```

Visual mode uses `launchApp({ visualTestMode: true })`, fixed window sizing, seeded data, disabled CSS animation/transition timing, hidden caret/live-region noise, and deterministic dashboard atmosphere particles. Baselines are stored under `e2e/__screenshots__/visual/`.

Current baselines cover:
- Empty dashboard.
- Seeded campaign workspace.
- Seeded DM canvas with map, tokens, fog, walls, rooms, and drawings.
- Synchronized player view.

## Mocking Native Dialogs

BoltBerry uses Electron's `dialog` module for file pickers and confirmation dialogs.  These are intercepted at the main-process level using `app.evaluate()`:

```typescript
import { mockConfirmDialog, mockSaveDialog, mockOpenDialog } from './helpers/dialog-helpers'

await mockConfirmDialog(app, true)   // auto-accept the next confirm dialog
await mockSaveDialog(app, '/tmp/out.zip')
await mockOpenDialog(app, ['/path/to/file.zip'])
```

`mockSaveDialogCancel(app)` and `mockOpenDialogCancel(app)` cover cancel paths.

## Accessibility

Accessibility coverage lives in `e2e/regression/accessibility.spec.ts`. `@axe-core/playwright` is installed, but the Electron runner injects `axe-core` directly because `AxeBuilder` attempts to create a normal browser page, which Electron Playwright does not support in this launch mode. The baseline fails only `serious` and `critical` violations.

`e2e/regression/accessibility-panels.spec.ts` adds focused keyboard reachability checks for workspace panels, canvas toolbar controls, the canvas itself, and right sidebar tabs.

`e2e/regression/accessibility-keyboard.spec.ts` covers keyboard entry/cancel/focus return for dashboard create flows, settings modal keyboard access and dismissal, toolbar arrow movement, labelled icon controls, canvas focus, and shortcut overlay dismissal.

## Menu Actions

Menu coverage invokes registered menu items through Electron's `Menu.getApplicationMenu()` and verifies the renderer flow that each menu item dispatches. `e2e/regression/menu-accelerators.spec.ts` also verifies expected accelerator registration and renderer-level keyboard accelerator flows. OS-level visual menu traversal is intentionally not used because it is platform-dependent under Playwright/Electron.

## Canvas and Panel Coverage

Canvas coverage is split between action/IPC-backed workflows, real pointer workflows, and seeded edge cases. `canvas-workflows.spec.ts` covers map opening, token create/delete, fog cover/undo/redo, and returning to the campaign. `canvas-pointer-workflows.spec.ts` covers real mouse-driven token drag persistence plus wall, drawing, and room creation. `canvas-edge-cases.spec.ts` covers seeded wall/room/drawing update/delete paths, fog brush reveal/cover variants, layer visibility toggles, multi-select controls, zoom, pan, and fit.

Deep workspace panels are covered in `deep-panel-workflows.spec.ts`: notes, handouts, character sheets, audio folder import and channel assignment, token-library insertion, and initiative entry creation.

`panel-depth.spec.ts` adds regression coverage for note search/edit/delete, handout and character-sheet destructive cancel/confirm paths, audio empty-folder/filter/assignment/delete paths, and token-template filter/duplicate/delete paths.

## Fault Recovery

`e2e/regression/fault-recovery.spec.ts` covers high-value failure boundaries:
- Unicode and space-heavy map import plus campaign export paths.
- Corrupt audio files disguised with valid extensions.
- Audio folder scans with unsupported files and symlinked directories.
- Missing referenced map assets that should not break workspace recovery/removal.

## Performance And Stability

`e2e/regression/performance-smoke.spec.ts` creates many campaigns in an isolated profile and verifies the dashboard remains responsive. This is a smoke guard, not a replacement for large-map or long-session profiling.

`e2e/regression/performance-stability.spec.ts` adds PR-sized guards for a large token roster, large audio library filtering, player reconnects, and renderer heap size when Chromium exposes memory metrics. These remain smoke thresholds, not full profiling or soak tests.

`e2e/nightly/large-data.stress.spec.ts` runs only via `npm run test:e2e:nightly` / `BOLTBERRY_RUN_NIGHTLY=1`. It covers hundreds of tokens, many geometry rows, and a larger audio library without slowing the PR gate.

## Packaged App Smoke

`scripts/smoke-packaged.mjs` process-smokes a hardened packaged executable without Playwright attachment:

```bash
BOLTBERRY_E2E_EXECUTABLE_PATH=/path/to/BoltBerry npm run test:e2e:packaged
```

Use this after `electron-builder --dir` or a platform-specific package build to verify the packaged executable starts, stays alive for the smoke window, and accepts a clean shutdown.

`e2e/smoke/packaged-app.spec.ts` verifies the DM shell and preload bridge through Playwright, but it is only suitable for an unfused QA build. Hardened release builds flip Electron fuses (`RunAsNode`, `NODE_OPTIONS`, and CLI inspect disabled), which prevents Playwright `_electron.launch()` from attaching to the app.

Build that QA-only artifact with:

```bash
npm run pack:qa:unfused
BOLTBERRY_E2E_EXECUTABLE_PATH=release/qa-unfused/<platform>/BoltBerry.app/Contents/MacOS/BoltBerry \
  npx playwright test e2e/smoke/packaged-app.spec.ts --project=smoke
```

Never distribute the unfused QA package; it exists only so Playwright can inspect packaged UI behavior.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BOLTBERRY_APP_PATH` | `'.'` | Override Electron entry point |
| `BOLTBERRY_E2E_EXECUTABLE_PATH` | — | Launch a packaged executable directly |
| `BOLTBERRY_E2E_VISUAL` | — | Enables deterministic visual mode markers |
| `BOLTBERRY_RUN_VISUAL` | — | Allows visual specs to run |
| `BOLTBERRY_RUN_NIGHTLY` | — | Allows nightly stress specs to run |
| `CI` | — | If set, enables 2 retries per test |

## CI Integration

The repository workflow runs Linux E2E as a required gate with `npm run build` followed by `xvfb-run ... npm run test:e2e`. The default script runs `smoke`, `regression`, and `critical-path`; visual tests remain separately invoked. A representative setup is:

```yaml
- name: Build
  run: npm run build

- name: Install Playwright
  run: npx playwright install --with-deps

- name: E2E Tests
  run: npm run test:e2e
  env:
    CI: true

- name: Upload report on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

The workflow also includes a non-blocking macOS/Windows smoke matrix. It is useful platform signal, but full regression and critical-path coverage remain Linux-gated.

On `main`, scheduled runs, and manual dispatch, CI also builds the unfused QA package and runs the packaged UI smoke plus targeted player/fog/sync live-session suite against that packaged executable. This keeps Playwright packaged UI coverage available without weakening the fused release artifact.

A scheduled/manual Linux nightly job runs `npm run test:e2e:nightly` outside the PR gate for larger stress checks.
