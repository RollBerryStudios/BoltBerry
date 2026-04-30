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
| `npm run check:i18n` | passed, 732 keys |
| `npm run check:bundle` | passed |
| `npm run test:e2e` | 134 passed, 1 intentional skip |
| `npm run test:e2e:visual` | 4 passed |
| `npm run test:e2e:nightly` | 2 passed |
| `npm run test:e2e:packaged` | passed against local mac-arm64 `--dir` package when `BOLTBERRY_E2E_EXECUTABLE_PATH` is set; skips intentionally without it; Linux packaged smoke is enforced in CI |

## Highest-Value Remaining E2E Work

1. Advanced canvas editing suite.
2. Bestiary/wiki action depth: import/export, clone/spawn/send.
3. Compendium resilience: corrupt PDFs, language switching, send/stop-to-player.
4. SFX depth: multi-board switching, icon upload, preview stop behavior.
5. Settings/profile depth and settings import/export roundtrip.
6. Expanded visual coverage.
7. Long soak and memory tracking.
8. Localization screenshot and text-overflow sweep.
9. Cross-platform release OS verification.
