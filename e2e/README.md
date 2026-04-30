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

# 4. Run all E2E tests
npm run test:e2e

# 5. Run with interactive UI / headed / debug modes
npm run test:e2e:ui
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:report

# 6. Run a specific group
npx playwright test --project=smoke
npx playwright test --project=regression
npx playwright test --project=critical-path
```

## Directory Structure

```
e2e/
├── global-setup.ts              # Verifies build artefacts exist
├── helpers/
│   ├── electron-launch.ts       # App launch factory + window helpers
│   ├── page-objects.ts          # Page Object Models (StartScreen, etc.)
│   └── dialog-helpers.ts        # Native dialog mocking
├── smoke/
│   ├── app-launch.spec.ts       # App starts, windows, security settings
│   └── start-screen.spec.ts     # StartScreen rendering
├── regression/
│   ├── campaigns.spec.ts        # Campaign CRUD (create/rename/delete/duplicate)
│   ├── keyboard-shortcuts.spec.ts # ? / F1 / Escape overlays
│   ├── ipc-bridge.spec.ts       # IPC channel correctness + SQL injection guard
│   ├── accessibility.spec.ts    # Axe serious/critical accessibility baseline
│   └── menu-actions.spec.ts     # Registered Electron menu actions
└── critical-path/
    ├── canvas-workflows.spec.ts  # Canvas open, token, fog, undo/redo
    ├── campaign-lifecycle.spec.ts # Full DM flow: create → view → export
    ├── file-workflows.spec.ts    # Negative file/archive cases
    ├── persistence.spec.ts       # Real restart persistence
    ├── player-window.spec.ts      # Player window open/close/security
    ├── settings.spec.ts           # SetupWizard + data folder switching
    └── export-import.spec.ts      # Export → import round-trip
```

## Test Groups

| Group | Purpose | When to run |
|---|---|---|
| `smoke` | App starts, windows render, security | Every commit |
| `regression` | CRUD flows, shortcuts, IPC bridge | Every PR |
| `critical-path` | Full user journeys, export/import | Before every release |

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

## Menu Actions

Menu coverage invokes registered menu items through Electron's `Menu.getApplicationMenu()` and verifies the renderer flow that each menu item dispatches. OS-level visual menu traversal is intentionally not used because it is platform-dependent under Playwright/Electron.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BOLTBERRY_APP_PATH` | `'.'` | Override Electron entry point |
| `CI` | — | If set, enables 2 retries per test |

## CI Integration

The repository workflow runs E2E as a gate with `npm run build` followed by `xvfb-run ... npm run test:e2e`. A representative setup is:

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
