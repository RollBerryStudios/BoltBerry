# BoltBerry 0.20.30 Release Notes

Date: 2026-05-05

## Scope

This release packages the Player View and UI regression fixes verified after the manual Playwright screenshot review.

## Product Changes

- Fixed player fog rendering so covered fog is visible and opaque in the player window.
- Fixed fog reset/delta delivery so DM fog changes reliably repaint the player view.
- Fixed Player Viewport Control rotation after map rotation.
- Fixed context submenu positioning so nested visibility/fog actions remain visible and clickable.
- Moved combat mode into the right floating utility rail with dice, audio, and overlays.
- Repositioned the floating utility rail so it no longer blocks right-sidebar controls.
- Replaced dot placeholders for Characters and Notes in the content workspace with correct symbols.
- Clipped grid strokes to map bounds in DM and player rendering, removing grey line artifacts around maps.

## Playwright Coverage Added

- Player fog cover/reveal screenshot and pixel-level opacity regression.
- DM Player Viewport rotation regression.
- Context submenu overflow/clamping regression.
- Floating utility rail / right-sidebar overlap regression.
- Character and Notes workspace symbol regression.
- Grid clipping regression using screenshot pixel analysis outside map bounds.

## Test And QA Evidence

- `npm run build` passed.
- `npm run lint` passed with 0 errors and the existing warning baseline.
- `npm run check:i18n` passed with 738 keys.
- `npm run check:bundle` passed.
- `npm test` passed with 269 unit tests.
- `npm run test:e2e` passed with 154 tests and 1 intentional packaged-app skip.
- `npm run test:e2e:visual` passed with 4 visual baselines.
- `npx playwright test e2e/regression/performance-stability.spec.ts --project=regression` passed with 3 performance/stability guards.
- `BOLTBERRY_RUN_NIGHTLY=1 npx playwright test e2e/nightly/large-data.stress.spec.ts --project=nightly` passed with 2 large-data stress guards.

## Release Procedure

1. Push the `0.20.30` version and documentation commits to `main`.
2. Tag the release as `v0.20.30` and push the tag.
3. Confirm the GitHub `Release` workflow finishes on Windows, Linux, and macOS hosted runners and publishes artifacts to the GitHub Release.
