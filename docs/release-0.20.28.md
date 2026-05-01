# BoltBerry 0.20.28 Release Notes

Date: 2026-05-01

## Scope

This release packages the completed UI/UX, menu, context-menu, fog-of-war, and DM/player synchronization hardening work.

## Product Changes

- Fixed responsive toolbar overflow by hiding secondary toolbar labels/actions earlier on compact widths.
- Improved notes layout in narrow panels so the list and editor remain readable instead of crowding each other.
- Fixed clamped context-menu rendering so map/sidebar context menus become visible immediately after repositioning.
- Kept room-based fog-of-war fill and clear workflows covered through the canvas action paths.

## Test And QA Evidence

- `git lfs pull` completed locally after installing Git LFS.
- Local asset validation found no remaining LFS pointer stubs in Monster token files, `resources/token-variants`, or `resources/compendium`.
- `npm run check:all` passed with 269 unit tests, bundle check, and i18n check.
- `npm run test:e2e` passed with 141 tests and 1 intentional skip.
- `npm run test:e2e:visual` passed with 4 visual baselines.
- The GitHub `Release` workflow builds on GitHub Hosted Runners and repeats the LFS pointer-stub guard before packaging.

## Release Procedure

1. Push the `0.20.28` version and documentation commit to `main`.
2. Trigger the GitHub `Release` workflow with tag `v0.20.28`.
3. Confirm Windows, Linux, and macOS jobs finish and publish artifacts to the GitHub Release.
