# BoltBerry UI And Action Coverage

The canonical current feature inventory, E2E coverage rating, and full testing process now lives in:

`docs/testing-full-process.md`

This file is kept as a short pointer from the E2E folder so older links still lead to the current process.

## Current Baseline

Latest verified baseline:

| Command | Result |
| --- | --- |
| `npm test` | 269 passed |
| `npm run build` | passed |
| `npm run lint` | 0 errors, existing warnings |
| `npm run check:i18n` | passed, 738 keys |
| `npm run check:bundle` | passed |
| `npm run test:e2e` | 154 passed, 1 intentional packaged-app skip |
| `npm run test:e2e:visual` | 4 passed |
| `npm run test:e2e:nightly` | 2 passed |
| `npx playwright test --list` | 157 tests in 41 files |
| `npm run test:e2e:packaged` | process smoke passed against local hardened mac-arm64 `--dir` package when `BOLTBERRY_E2E_EXECUTABLE_PATH` is set; Playwright UI attach requires an unfused QA artifact |

## Highest-Value Remaining E2E Work

1. Advanced canvas editing suite.
2. Character-sheet portraits, validation, and party-stat edge cases.
3. Bestiary/wiki secondary branches: NPC clone wizard, token variants, malformed imports.
4. Compendium language switching and multi-PDF sidebar persistence.
5. SFX board rename/delete, unsupported media variants, broader hotkey matrix.
6. Expanded visual coverage.
7. Long soak and memory tracking.
8. Localization screenshot and text-overflow sweep.
9. Cross-platform release OS verification.
