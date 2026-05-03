# BoltBerry 0.20.29 Release Notes

Date: 2026-05-03

## Scope

This release packages the completed Playwright coverage integration for the remaining highest-value release deltas after the UI/UX, menu, context-menu, fog-of-war, and DM/player synchronization hardening work.

## Product And Testability Changes

- Added stable test selectors for scene/grid controls, initiative roll input, character-sheet tabs, encounter workflows, Wiki/Bestiary actions, and character-sheet import.
- Fixed submenu action behavior in the shared context menu so submenu commands run and close the menu cleanly.
- Expanded SFX workflow coverage for multi-board switching, icon upload, persisted slot metadata, and preview stop behavior.

## Playwright Coverage Added

- Scene/grid settings and DM/player rotation persistence.
- Encounter save, rename, spawn, export, delete, and import lifecycle.
- Panel-driven handout and initiative broadcasts into the player view.
- Canvas context submenu rotation and fog actions.
- Dense character-sheet field persistence through UI export/import.
- Bestiary monster spawn, player broadcast, Wiki export/delete/import action paths.
- Compendium page send/stop broadcast and corrupt-PDF recovery.

## Test And QA Evidence

- `npm run build` passed.
- `npm run lint` passed with 0 errors and the existing warning baseline.
- `npm run check:i18n` passed with 738 keys.
- `npm run check:bundle` passed.
- `npm test` passed with 269 unit tests.
- `npm run test:e2e` passed with 150 tests and 1 intentional packaged-app skip.
- `npm run test:e2e:visual` passed with 4 visual baselines.
- `npm run test:e2e:nightly` passed with 2 stress checks.
- `npx playwright test --list` reports 157 tests in 41 files.

## Release Procedure

1. Push the `0.20.29` version and documentation commits to `main`.
2. Tag the release as `v0.20.29` and push the tag.
3. Confirm the GitHub `Release` workflow finishes on Windows, Linux, and macOS hosted runners and publishes artifacts to the GitHub Release.
4. Delete older GitHub Releases after the new `v0.20.29` release exists.
