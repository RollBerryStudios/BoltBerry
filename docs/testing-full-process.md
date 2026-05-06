# BoltBerry Full Testing Process

Last audited: 2026-05-03

This document is the canonical testing process for BoltBerry. It combines a code-based feature inventory with the current Playwright E2E suite and turns that into coverage ratings, gates, and the next highest-value test backlog.

## Current Automated Baseline

Latest verified local baseline from the current suite:

| Command | Result |
| --- | --- |
| `npm test` | 269 passed |
| `npm run lint` | 0 errors, existing warnings |
| `npm run check:i18n` | passed, 738 keys |
| `npm run check:bundle` | passed |
| `npm run build` | passed, existing Vite warnings |
| `npm run test:e2e` | 150 passed, 1 intentional packaged-app skip |
| `npm run test:e2e:visual` | 4 passed |
| `npm run test:e2e:nightly` | 2 passed |
| `npx playwright test --list` | 157 tests in 41 files |
| `npm run test:e2e:packaged` | passed against local mac-arm64 `--dir` package when `BOLTBERRY_E2E_EXECUTABLE_PATH` is set; skips intentionally without it; Linux packaged smoke is enforced in CI |
| `git lfs pull` + asset pointer check | passed locally; Monster token files, `resources/token-variants`, and `resources/compendium` contain no LFS pointer stubs |

Primary E2E groups:

| Group | Scope |
| --- | --- |
| `smoke` | app launch, setup/start screen, optional packaged app smoke |
| `regression` | campaign CRUD, IPC bridge, menu actions, keyboard/a11y, recovery, performance smoke |
| `critical-path` | onboarding, campaign lifecycle, map/canvas/scene workflows, panels/player sync, settings, export/import |
| `visual` | dashboard, campaign workspace, DM canvas, player window baselines |
| `nightly` | larger data and longer-running stress coverage |

## Coverage Rating Scale

| Rating | Meaning |
| --- | --- |
| 5 - Excellent | Critical and negative flows are automated, with persistence or security assertions where relevant. |
| 4 - Strong | Main user journeys are automated and regression-safe; some edge cases remain. |
| 3 - Moderate | Basic reachability or core CRUD exists, but important variants are not covered. |
| 2 - Low | Only smoke, partial, or indirect coverage exists. |
| 1 - Missing | No meaningful automated E2E coverage found. |

## Feature And Use-Case Coverage Matrix

| ID | Area | Main features and use cases | Current E2E evidence | Rating | Highest-value gaps | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | App boot, sandbox, preload bridge | Launch Electron, expose DM API only to DM window, expose player API only to player window, protect bridge surface, handle app menus and lifecycle. | `app-launch.spec.ts`, `ipc-bridge.spec.ts`, `player-window.spec.ts`, `menu-actions.spec.ts`, CI packaged Linux smoke | 5 | Cross-platform installer launch remains release-only. | PR and release |
| F02 | First-run onboarding | Choose or create data folder, complete setup, persist setup state, resume into dashboard. | `first-run-onboarding.spec.ts`, `start-screen.spec.ts`, `settings.spec.ts`, `persistence.spec.ts` | 5 | Permission-denied and invalid-folder recovery. | PR |
| F03 | Dashboard and campaign list | Empty state, create campaign, rename, duplicate, delete confirm/cancel, reopen campaigns, recently used campaign stats, profile/settings/about/wiki/compendium entry points. | `campaigns.spec.ts`, `campaign-lifecycle.spec.ts`, `start-screen.spec.ts`, `top-level-actions.spec.ts`, visual dashboard baseline | 5 | Dashboard command palette search and edge-state sorting. | PR |
| F04 | Campaign workspace shell | Open campaign, switch workspace tabs, return dashboard, open compendium/settings/player controls, handle empty tab states. | `campaign-lifecycle.spec.ts`, `top-level-actions.spec.ts`, `deep-panel-workflows.spec.ts`, visual campaign baseline | 4 | Per-tab empty states and tab-specific summary counters. | PR |
| F05 | Map management | Add maps from image/PDF, rename, reorder, delete confirm/cancel, open maps, import first map, map metadata. | `map-management-actions.spec.ts`, `canvas-workflows.spec.ts`, `file-workflows.spec.ts` | 4 | Real PDF map render/import assertions, failed image decode, map reorder persistence across restart. | PR |
| F06 | Grid and scene settings | Grid type, grid size, feet per unit, offsets, display style, auto-detect grid, rotation for DM/player, ambient track and volume. | `scene-grid-workflows.spec.ts`, indirect coverage in `canvas-workflows.spec.ts`, `settings.spec.ts` | 4 | Grid auto-detect result quality, offsets, and ambient channel behavior. | PR for canvas changes |
| F07 | Canvas navigation and tools | Pan/zoom/fit, minimap, selection, snap, player preview, tool switching, pointer, measurement, drawing, fog, walls, rooms, tokens. | `canvas-workflows.spec.ts`, `canvas-pointer-workflows.spec.ts`, `canvas-edge-cases.spec.ts`, `canvas-context-actions.spec.ts`, visual canvas baseline | 4 | Marquee selection, edit-mode vertices, complex undo/redo stacks, GM pins, player viewport mode, measurement variants. | PR for canvas changes |
| F08 | Tokens on map | Create token, drag/update/delete, select and multi-select, copy/paste, visibility, token metadata, bulk actions, token-to-player sync. | `canvas-workflows.spec.ts`, `canvas-edge-cases.spec.ts`, `two-window-sync.spec.ts` | 4 | Bulk visibility/delete, token editor field-level coverage, status markers, large token counts. | PR |
| F09 | Fog of war | Cover/reveal with rectangle, polygon, brush, cover brush, room fill/clear actions, undo/redo, reset/delta sync to player. | `canvas-workflows.spec.ts`, `canvas-edge-cases.spec.ts`, `player-window.spec.ts`, `two-window-sync.spec.ts` | 4 | Brush precision, polygon edit failures, undo/redo across map switches and reloads. | PR |
| F10 | Walls, doors, rooms | Draw walls and doors, create rooms, fill/clear room fog, edit visibility/details, delete room data, sync blocking geometry to player. | `canvas-workflows.spec.ts`, `canvas-edge-cases.spec.ts`, `two-window-sync.spec.ts` | 4 | Door toggles, deeper room panel details, room notes/visibility sync, wall editing and deletion variants. | PR |
| F11 | Drawings and annotations | Freehand, rectangle, circle, text, erase, persist drawings, player broadcast. | `canvas-workflows.spec.ts`, `two-window-sync.spec.ts` | 3 | Text editing, erase precision, drawing style controls, replay after reload. | PR |
| F12 | Player window and sync | Open/close/reuse player window, sync map/fog/tokens/blackout/atmosphere/pointer/viewport/handout/overlay/initiative/weather/measurement/drawings/walls, report player size. | `player-window.spec.ts`, `two-window-sync.spec.ts`, `player-render-workflows.spec.ts`, visual player baseline, `demo-production-session.spec.ts` | 5 | Pixel-level visual assertions for complex player scenes. | PR and release |
| F13 | Notes panel | Create, edit, search/filter, tag, delete, persist notes, map/campaign note contexts. | `deep-panel-workflows.spec.ts`, `panel-depth.spec.ts` | 4 | Tag/category combinations, markdown/body formatting, validation and map-scoped notes. | PR |
| F14 | Handouts panel | Create text/image handouts, send/show/clear handout to player, delete, handle missing assets. | `deep-panel-workflows.spec.ts`, `panel-depth.spec.ts`, `player-panel-broadcasts.spec.ts`, `player-window.spec.ts` | 4 | Image handout import, broken asset recovery, and markdown preview edge cases. | PR for handout/player changes |
| F15 | Characters and sheets | Create/edit/delete characters, import/export sheets, portrait/assets, party workflow, open sheet from campaign. | `deep-panel-workflows.spec.ts`, `panel-depth.spec.ts`, `remaining-depth-deltas.spec.ts` | 4 | Portrait flow, party stats, richer field validation. | PR |
| F16 | Token library and NPC templates | Create/edit/duplicate/delete token templates, search/filter/sort, insert on map, clone from monster/NPC. | `deep-panel-workflows.spec.ts`, `panel-depth.spec.ts` | 3 | Editor field coverage, filters/sort, bestiary clone, variants folder workflow, NPC wizard branches. | PR |
| F17 | Initiative tracker | Add entries, reorder, advance turns, update/delete entries, sync visible initiative to player. | `deep-panel-workflows.spec.ts`, `panel-depth.spec.ts`, `player-panel-broadcasts.spec.ts` | 4 | Drag reorder, timers/status effects, and linked-token HP edge cases. | PR |
| F18 | Encounters | Create/edit/delete encounters, templates, import/export, link monsters/tokens, use encounter in scene. | `encounter-workflows.spec.ts`, panel reachability in `panel-depth.spec.ts` | 4 | Bestiary picker branches, larger encounter templates, and import validation variants. | PR for encounter changes |
| F19 | Music library and ambient audio | Import tracks/folders, list/filter/delete tracks, assign map channels, preview/play, soundtrack import/export, corrupt folder handling. | `file-workflows.spec.ts`, `performance-stability.spec.ts`, `deep-panel-workflows.spec.ts` | 4 | Actual preview/play controls, soundtrack import/export, channel clearing, unsupported audio variants. | PR |
| F20 | Professional SFX board | Boards, SFX slots, audio/icon import, emoji/icon picker, map-context hotkeys, loop, volume, preview, trigger, clear slot. | `sfx-board-workflows.spec.ts`, top-level tab coverage | 4 | Broader hotkey matrix, unsupported icon/audio variants, board rename/delete edge cases. | PR for SFX changes |
| F21 | Bestiary and wiki | Monsters/items/spells tabs, search/filter/detail, user monster/item/spell CRUD, duplicate/edit/export/import, clone to NPC/token, spawn/send actions. | `reference-workflows.spec.ts`, `remaining-depth-deltas.spec.ts`, top-level reachability, indirect token/template coverage | 4 | NPC clone wizard branches, token variants, item/spell send variants, malformed import validation. | PR for bestiary changes |
| F22 | Compendium and PDFs | Import/open PDFs, SRD language matching, PDF viewer, folder access, global PDF text search, jump to page. | `reference-workflows.spec.ts`, `remaining-depth-deltas.spec.ts`, top-level reachability and import cancellation in existing workflows | 4 | Language filter switching, multi-PDF sidebar persistence, malformed but partially-readable PDF variants. | PR for compendium changes |
| F23 | Native menu and accelerators | File/Edit/View/Session/Help actions, shortcuts, theme/language, player/session controls, devtools/fullscreen, context-sensitive enablement. | `menu-actions.spec.ts`, `menu-accelerators.spec.ts`, `keyboard-shortcuts.spec.ts`, `menu-context-a11y.spec.ts` | 4 | OS-native visual menu traversal and remaining session/view item assertions. | PR |
| F24 | Settings | Storage folder validation, appearance theme, language, profile, file import/export, about, dry-run and destructive asset cleanup. | `settings.spec.ts`, `persistence.spec.ts`, `top-level-actions.spec.ts` | 5 | Profile-field validation and settings file import/export depth. | PR |
| F25 | File import/export and data safety | Campaign export/import, quick backup, asset import validation, symlink/path traversal protection, local asset protocol, database persistence. | `file-workflows.spec.ts`, `export-import.spec.ts`, `fault-recovery.spec.ts`, `ipc-bridge.spec.ts` | 4 | Disk-full simulation, corrupt DB migration, oversized asset warning path, more malicious file variants. | PR and release |
| F26 | Accessibility and keyboard | Axe serious/critical checks, focus movement, keyboard shortcuts, panel keyboard access. | `accessibility.spec.ts`, `accessibility-keyboard.spec.ts`, `accessibility-panels.spec.ts` | 3 | Full keyboard-only session flow, screen reader contracts, moderate axe issue budget, modal focus traps. | PR |
| F27 | Visual regression | Dashboard, campaign workspace, DM canvas, player window screenshots, manual screenshot sweeps for dense panels and responsive menu states. | `core-surfaces.visual.spec.ts`, manual UI reports under `release/manual-ui-layout-*` | 4 | Light theme, settings/modals, per-OS baseline policy, broader localized screenshot sweep. | UI PR and release |
| F28 | Performance and stability | Launch/runtime smoke, large data stress, panel depth, many maps/notes/tracks, no obvious UI lockups. | `performance-smoke.spec.ts`, `performance-stability.spec.ts`, `large-data.stress.spec.ts` | 3 | Long soak, memory delta thresholds, export/import stress with large assets, canvas with very high object counts. | Nightly and release |
| F29 | Localization and i18n | Translation key completeness, language switching, menu labels, UI text persistence. | `check:i18n`, `settings.spec.ts`, `menu-actions.spec.ts` | 3 | Full German/English UI screenshot sweep and text-overflow checks. | PR for text/UI |
| F30 | Packaging and release | Electron build, bundle sanity, LFS asset validation, CI Linux packaged smoke, signed/distributed artifact readiness, GitHub Hosted Runner release builds. | `build`, `check:bundle`, CI `packaged-smoke-linux`, `packaged-app.spec.ts`, `release.yml` LFS pointer gate | 4 | Installer launch, signing/notarization/update channel validation, packaged smoke on every release OS. | Release |

## Risk-Based Test Strategy

BoltBerry should use a layered strategy. Fast checks catch local regressions, E2E protects the actual Electron workflows, and release/nightly jobs cover slower risks.

| Layer | Purpose | When it runs | Examples |
| --- | --- | --- | --- |
| Unit tests | Validate pure logic, stores, schema migrations, file/security validators, helper functions. | Every commit and PR. | `npm test` |
| Static checks | Catch type, bundle, i18n, and packaging configuration drift. | Every commit and PR. | `npm run lint`, `npm run check:i18n`, `npm run check:bundle`, `npm run build` |
| Smoke E2E | Verify the app launches and the first screens are usable. | Every PR. | `npm run test:e2e -- --project=smoke` |
| Regression E2E | Protect recurring app behaviors: campaign CRUD, menus, keyboard, recovery, IPC. | Every PR. | default `npm run test:e2e` |
| Critical-path E2E | Protect session workflows: onboarding, campaign/map/canvas/player/file/settings. | Every PR, mandatory before merge. | default `npm run test:e2e` |
| Visual E2E | Detect layout and rendering regressions on core surfaces. | UI PRs and release candidates. | `npm run test:e2e:visual` |
| Nightly stress | Catch performance, size, and long-running stability problems. | Nightly or before release. | `npm run test:e2e:nightly` |
| Packaged process smoke | Verify the hardened built app launches outside dev mode, survives startup, and accepts clean shutdown with Electron fuses flipped. | Release branches and release candidates. | `BOLTBERRY_E2E_EXECUTABLE_PATH=... npm run test:e2e:packaged` |
| Packaged UI smoke | Verify packaged DM shell and preload bridge in a Playwright-controllable artifact. Hardened release binaries with `RunAsNode` disabled cannot be driven by `_electron.launch()`. | Release candidates using the unfused QA artifact, otherwise manual signoff. | `npm run pack:qa:unfused` then `BOLTBERRY_E2E_EXECUTABLE_PATH=... npx playwright test e2e/smoke/packaged-app.spec.ts --project=smoke` |
| Manual exploratory | Validate things automation cannot fully prove: real audio output, native dialogs, tactile canvas feel, OS installers. | Release candidate. | Manual checklist below |

## Standard Gates

### Local before pushing

Run the smallest useful set first:

```bash
npm test
npm run check:i18n
npm run check:bundle
npm run build
```

Then run targeted E2E based on touched areas:

| Change type | Minimum targeted E2E |
| --- | --- |
| Dashboard/campaigns | `npx playwright test e2e/regression/campaigns.spec.ts e2e/critical-path/campaign-lifecycle.spec.ts` |
| Onboarding/settings/storage | `npx playwright test e2e/critical-path/first-run-onboarding.spec.ts e2e/critical-path/settings.spec.ts e2e/critical-path/persistence.spec.ts` |
| Main/preload/IPC/security | `npx playwright test e2e/regression/ipc-bridge.spec.ts e2e/critical-path/file-workflows.spec.ts e2e/regression/fault-recovery.spec.ts` |
| Canvas/map/token/fog/walls | `npx playwright test e2e/critical-path/canvas-workflows.spec.ts e2e/critical-path/canvas-edge-cases.spec.ts e2e/critical-path/two-window-sync.spec.ts` |
| Player sync | `npx playwright test e2e/critical-path/player-window.spec.ts e2e/critical-path/two-window-sync.spec.ts e2e/critical-path/demo-production-session.spec.ts` |
| Panels | `npx playwright test e2e/critical-path/deep-panel-workflows.spec.ts e2e/regression/panel-depth.spec.ts` |
| Menus/shortcuts | `npx playwright test e2e/regression/menu-actions.spec.ts e2e/regression/menu-accelerators.spec.ts e2e/regression/keyboard-shortcuts.spec.ts` |
| Accessibility | `npx playwright test e2e/regression/accessibility.spec.ts e2e/regression/accessibility-keyboard.spec.ts e2e/regression/accessibility-panels.spec.ts` |
| Visual UI work | `npm run test:e2e:visual` |
| Performance-sensitive work | `npx playwright test e2e/regression/performance-smoke.spec.ts e2e/regression/performance-stability.spec.ts` |
| Release/package work | `npm run test:e2e:packaged` with `BOLTBERRY_E2E_EXECUTABLE_PATH` set |
| Token/compendium asset work | `git lfs pull` plus the `release.yml` LFS pointer gate command against `resources/token-variants` and `resources/compendium` |

### Required PR gate

Every PR should pass:

```bash
npm test
npm run lint
npm run check:i18n
npm run check:bundle
npm run build
npm run test:e2e
```

If the PR changes visible UI, also run:

```bash
npm run test:e2e:visual
```

If the PR changes release packaging, build config, Electron main startup, or native file handling, also run packaged smoke against the built executable:

```bash
BOLTBERRY_E2E_EXECUTABLE_PATH=/absolute/path/to/BoltBerry npm run test:e2e:packaged
```

### Nightly gate

Nightly should run:

```bash
npm run test:e2e
npm run test:e2e:visual
npm run test:e2e:nightly
```

Recommended additions:

- Run at least one packaged smoke build nightly on the primary release OS.
- Store Playwright traces, screenshots, and HTML reports as artifacts.
- Track test duration and flag large increases.

### Release candidate gate

Release candidate must pass:

```bash
git lfs pull
npm test
npm run lint
npm run check:i18n
npm run check:bundle
npm run build
npm run test:e2e
npm run test:e2e:visual
npm run test:e2e:nightly
```

Then build the release artifact and run packaged smoke:

```bash
BOLTBERRY_E2E_EXECUTABLE_PATH=/absolute/path/to/BoltBerry npm run test:e2e:packaged
```

Before tagging, verify that the token and compendium assets are real files, not LFS pointer stubs. The GitHub Hosted Runner release workflow performs the same class of check before packaging.

Manual release checks:

- Fresh install launches and completes first-run setup.
- Existing data folder opens without migration errors.
- Create a campaign, import a map, open player window, reveal fog, move a token.
- Import and play at least one real audio file.
- Send a handout to the player window.
- Switch language and theme, restart, confirm persistence.
- Export a campaign, import it into a fresh data folder, open the imported campaign.
- Launch the packaged app from the installed location, not only from the build folder.
- Confirm the GitHub Actions `Release` workflow for the version tag finishes on Windows, Linux, and macOS hosted runners and publishes artifacts to the GitHub Release.

## Test Authoring Rules

New E2E tests should follow these rules:

- Prefer user-visible workflows over implementation-only assertions.
- Use stable `data-testid` values for durable selectors.
- Keep each test isolated with a fresh user data directory.
- Mock native dialogs through the existing dialog helpers.
- Use deterministic fixtures from `e2e/testcontent`.
- Avoid fixed sleeps; wait for visible UI, app events, or specific state.
- Assert both UI result and persisted/API state when the risk is data loss.
- For security paths, assert the denied operation and the user-visible recovery.
- For player sync, assert both DM and player windows.
- Keep screenshots stable by controlling viewport, theme, campaign data, and clock where possible.
- Add test coverage near the risk: unit tests for pure logic, E2E for actual Electron workflows.

## Backlog: Maximum Effective Coverage

These are the next tests that would buy the most confidence per effort.

| Priority | Test suite to add or expand | Why it matters | Suggested target |
| --- | --- | --- | --- |
| 1 | Canvas advanced editing suite | Canvas remains the highest-risk interactive surface. | Marquee selection, edit vertices, GM pins, measurement circle/cone, drawing text/erase/style controls, complex undo/redo, map switching. |
| 2 | Character-sheet validation and portraits | Dense field persistence and import/export roundtrip are now covered; media and validation remain higher-risk. | Portrait crop/import/export, invalid character JSON, numeric boundary validation, party stats. |
| 3 | Bestiary/wiki secondary branches | Spawn/send/import/export are now covered for monsters; remaining risk is in deeper branch variants. | NPC clone wizard, token variant import/defaults, item/spell send variants, malformed wiki import validation. |
| 4 | Compendium language and multi-PDF depth | Real PDF navigation/search, corrupt import, and send/stop broadcast are covered. | Language switch assertions, multi-PDF sidebar persistence, partially-readable malformed PDF variants. |
| 5 | SFX secondary media and board management | Multi-board switching, icon upload, and preview stop behavior are covered. | Board rename/delete, unsupported icon/audio variants, broader hotkey matrix. |
| 6 | Visual coverage expansion | Core baselines exist, but modal/panel/theme regressions can slip. | Light theme, settings modal, dense panels, mobile-ish narrow viewport where supported. |
| 7 | Long soak and memory tracking | Large campaigns and sessions are likely real-user stress cases. | Nightly memory delta, 60-minute canvas/player session, large asset import/export. |
| 8 | Localization sweep | Text overflow and missing translations affect polish. | English/German screenshots for dashboard, campaign, settings, panels. |
| 9 | Release OS verification | Linux packaged smoke is in CI; distribution risks are OS/vendor-specific. | Installer launch, signing/notarization, update channel validation, packaged smoke on macOS and Windows. |

## Keeping This Matrix Current

Every feature PR should update this document when it adds or materially changes user-visible behavior. The update should include:

- The feature/use case row affected.
- The E2E or unit test that protects the behavior.
- The remaining gap if coverage is intentionally deferred.

Every release audit should compare these three sources:

- `src/preload/index.ts` for externally exposed app capabilities.
- `src/renderer/components` and `src/renderer/stores` for user-facing workflows.
- `e2e/**/*.spec.ts` for actual automated coverage.

If a feature exists in code but has no matching E2E evidence, keep it rated 1 or 2 until a user-visible workflow is automated.
