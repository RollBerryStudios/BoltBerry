# Phase 5 — Measurements

Verdicts on each F-### hypothesis from `audit/05-followups.md`. To
populate the numbers below: open the relevant feature in the DM window,
set `localStorage.setItem('boltberry:perf', '1')` (and optionally
`'boltberry:perf-log', '1'`) in DevTools, then exercise the path. The
`perfStart` helper in `src/renderer/utils/perfMark.ts` posts measures to
the User Timing track in DevTools → Performance.

For main-process timing, set `BOLTBERRY_LOG_JSON=1` and
`BOLTBERRY_IPC_TRACE=1` before launching to get structured JSON logs
including the IPC fan-out trace.

| ID | Hypothesis | Measurement entry point | Verdict | Notes |
|---|---|---|---|---|
| F-01 | pdfjs-dist worker leak on PDF reopen | DevTools → Memory snapshots before/after 10 PDF opens | TBD | Look for `PDFWorker` / `Stream` retainers |
| F-02 | Konva Stage memory not released on map switch | DevTools → Memory snapshot diff over 50 map switches | TBD | |
| F-03 | local-asset:// vs base64 IPC for image load | `perfStart('useImage.load')` (added in M6 item 23) | TBD | Compare per-image first-paint time |
| F-04 | applyMigration mid-flight crash idempotency | new vitest in `migration-chain.test.ts` | TBD | Simulate v1 DB, crash, re-run |
| F-05 | FogLayer toDataURL on large maps | `perfStart('fog.commitFogSave')` (added in M6 item 26) | TBD | 1080p / 4K / 8K |
| F-06 | diffTokens at high token count | `perfStart('tokenDiff')` (already wired) | TBD | Drag in a 100-token scene |
| F-07 | Player FPS during fog reset broadcast | DevTools FPS meter on player window | TBD | |
| F-08 | audioStore element leak across campaign switch | `document.querySelectorAll('audio').length` over 10 switches | TBD | |
| F-09 | wallIndex.build O(n²) on dense maps | `perfStart('wallIndex.build')` (already wired) | TBD | 0 / 100 / 500 / 1000 walls |
| F-10 | Windows SmartScreen on unsigned installer | clean Win VM install run | TBD | UX, not code |

## How to read the timeline

After exercising the path:

```js
// In DevTools console:
performance.getEntriesByName('los.compute').slice(-50).map(e => e.duration)
performance.getEntriesByName('tokenDiff').slice(-50).map(e => e.duration)
performance.getEntriesByName('wallIndex.build').slice(-10)
```

A regression means the p95 drifts upward against this baseline — record
the numbers below and update them when the perf refactors in M6 land.
