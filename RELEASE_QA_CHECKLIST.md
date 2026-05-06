# BoltBerry Release QA Checklist

Use this document as the release-candidate gate before shipping BoltBerry to real users. A release candidate is shippable only when all P0 gates pass, all P1 gates are either passed or explicitly accepted, and every known release risk has an owner.

## Release Candidate

| Field | Value |
| --- | --- |
| Version | |
| Build / commit | |
| Date | |
| QA owner | |
| Release owner | |
| Target OS builds | macOS / Windows / Linux |
| Test data folder | |
| Packaged artifact path(s) | |

## Decision Rules

| Severity | Rule |
| --- | --- |
| P0 blocker | Do not release. Fix and rerun affected P0/P1 gates. |
| P1 major | Release only with explicit owner approval and documented workaround. |
| P2 polish | May release if documented and scheduled. |
| Unknown data-loss risk | Treat as P0 until proven otherwise. |
| Player-window live-session regression | Treat as P0. |

## Evidence Folder

Create one tracked evidence folder per release candidate, for example:

```bash
docs/qa/v0.20.xx-rc1/
```

Store:

- Playwright HTML report or trace bundle.
- Screenshots for manual visual checks.
- Packaged smoke notes per OS.
- Manual session notes.
- Export/import roundtrip artifact names.
- List of accepted P1/P2 issues.

## P0 Automated Gates

Run from a clean working tree or record any intentional local changes.

| Status | Gate | Command | Pass criteria |
| --- | --- | --- | --- |
| [ ] | Unit and store logic | `npm test` | All tests pass. |
| [ ] | Full production build | `npm run build` | Main, preload, renderer build pass. Existing Vite chunk warnings are acceptable. |
| [ ] | Player bundle isolation | `npm run check:bundle` | Player bundle contains no DM-only symbols. |
| [ ] | i18n completeness | `npm run check:i18n` | German and English keys complete. |
| [ ] | Default Electron E2E gate | `npm run test:e2e` | Smoke, regression, and critical-path projects pass. |
| [ ] | Visual baseline gate | `npm run test:e2e:visual` | Core visual surfaces pass or snapshots are intentionally reviewed/updated. |
| [ ] | Nightly/stress gate | `npm run test:e2e:nightly` | Stress tests pass. |
| [ ] | Packaged executable process smoke | `BOLTBERRY_E2E_EXECUTABLE_PATH=/absolute/path/to/BoltBerry npm run test:e2e:packaged` | Hardened packaged app starts, stays alive for the smoke window, and accepts clean shutdown. |
| [ ] | Unfused packaged QA build | `npm run pack:qa:unfused` | QA-only package is built under `release/qa-unfused/`. Do not distribute this artifact. |
| [ ] | Packaged UI smoke | `BOLTBERRY_E2E_EXECUTABLE_PATH=/absolute/path/to/release/qa-unfused/.../BoltBerry npx playwright test e2e/smoke/packaged-app.spec.ts --project=smoke` or manual packaged signoff | Preload bridge and DM shell verified. Hardened release artifacts with `RunAsNode` disabled cannot be driven by Playwright `_electron.launch()`; use the unfused QA artifact or manual signoff. |

## P0 Targeted Live-Session Gates

Run these when touching player sync, canvas, maps, fog, tokens, preload, main IPC, windows, or release packaging.

| Status | Area | Command | Pass criteria |
| --- | --- | --- | --- |
| [ ] | Player lifecycle and security | `npx playwright test e2e/critical-path/player-window.spec.ts --project=critical-path` | Open/close/reuse player window; player has `playerAPI`, no `electronAPI`. |
| [ ] | DM-player sync bridge | `npx playwright test e2e/critical-path/two-window-sync.spec.ts --project=critical-path` | Full-sync, token delta, blackout, reconnect, broadcast matrix pass. |
| [ ] | Player render workflows | `npx playwright test e2e/critical-path/player-render-workflows.spec.ts --project=critical-path` | Player window renders real session state, not just callback payloads. |
| [ ] | Fog, rotation, reconnect regression | `npx playwright test e2e/regression/player-ui-regressions.spec.ts --project=regression -g "player fog survives"` | Fog survives live player rotation and hard player-window reconnect. |
| [ ] | Scene and rotation controls | `npx playwright test e2e/critical-path/scene-grid-workflows.spec.ts --project=critical-path` | DM/player rotations and grid settings persist. |
| [ ] | Canvas/fog context actions | `npx playwright test e2e/regression/canvas-context-actions.spec.ts --project=regression` | Context rotate/fog flows pass. |

## P0 Manual Live-Session Script

Use the packaged app, not the dev server. Run with a real second display if possible.

| Status | Step | Expected result | Evidence |
| --- | --- | --- | --- |
| [ ] | Fresh install/start on each target OS. | App launches, no setup/preload errors. | Screenshot: dashboard/setup. |
| [ ] | Complete first-run setup with a fresh data folder. | Data folder persists after restart. | Notes. |
| [ ] | Create campaign and import a real battle map. | Map appears in workspace and canvas. | Screenshot: DM canvas. |
| [ ] | Open player window on target display. | Player window opens fullscreen/frameless and DM shows connected state. | Screenshot/photo. |
| [ ] | Start live session. | Player sees correct map, not stale splash/previous map. | Screenshot: player map. |
| [ ] | Enable Player Control Mode. | Blue frame appears on DM canvas and player is framed to the same area. | Screenshot pair. |
| [ ] | Resize/move Player Control rect with Ctrl-drag/Ctrl-wheel. | Player view follows without jitter or stale frame. | Notes/video optional. |
| [ ] | Rotate player view to 0/90/180/270. | Player map, grid, tokens, fog, drawings, walls remain aligned. | Screenshots. |
| [ ] | Cover all fog. | Player becomes fully opaque black, not dim/transparent. | Screenshot: covered. |
| [ ] | Reveal all fog. | Player map returns visibly; no old fog remains. | Screenshot: revealed. |
| [ ] | Cover all, immediately hard-close player window, immediately reopen. | Reopened player receives current fog via full-sync. | Screenshot: reconnected covered. |
| [ ] | Add visible and hidden tokens. | Visible token appears to players; hidden token does not. | Screenshot/notes. |
| [ ] | Move, rotate, rename, and damage a visible token. | Player updates without manual resync. | Notes. |
| [ ] | Draw walls/doors and toggle a door. | LOS/lighting behavior remains stable after reconnect. | Screenshot/notes. |
| [ ] | Send handout, overlay, initiative, weather, measurement, and drawing. | Player receives each and can clear/replace where applicable. | Notes/screenshots. |
| [ ] | Toggle blackout on/off. | Player switches to black and back correctly. | Notes. |
| [ ] | Live -> Prep -> Live. | Player clears to idle in prep and resyncs cleanly on live. | Notes. |
| [ ] | Close/reopen app. | Campaign, map, fog, tokens, walls, settings persist. | Notes. |
| [ ] | Export campaign and import into a new data folder. | Imported campaign opens with map/fog/tokens/assets intact. | Export filename. |

## P1 Functional Coverage

| Status | Area | What to verify |
| --- | --- | --- |
| [ ] | Campaigns | Create, rename, duplicate, delete cancel/confirm, reopen recent campaign. |
| [ ] | Maps | Add image map, add PDF map, rename, reorder, delete, switch maps during live session. |
| [ ] | Grid | Square/hex/none, grid size, feet/unit, thickness, color, offset, clipping. |
| [ ] | Tokens | Library insert, token panel fields, visibility, copy/paste, multi-select, status markers. |
| [ ] | Fog tools | Rect, polygon, reveal brush, cover brush, reset, undo/redo, room reveal/cover. |
| [ ] | Walls/rooms | Draw, edit, delete, door open/closed, room visibility and fog actions. |
| [ ] | Drawings | Freehand, rect, circle, text, erase, player broadcast, persistence after reload. |
| [ ] | Initiative/combat | Add/reorder entries, current turn, timers/effects if used, player overlay. |
| [ ] | Handouts | Text, image, wiki/bestiary cards, resend, stop broadcast, missing asset recovery. |
| [ ] | Compendium | Open SRD/PDF, search, send page to player, stop broadcast, corrupt PDF recovery. |
| [ ] | Bestiary/wiki | Search, detail views, clone/spawn/send, user entry import/export. |
| [ ] | Audio/SFX | Import files/folders, corrupt files, play/pause, volume, loops, SFX board trigger. |
| [ ] | Settings | Data folder, theme, language, profile/settings persistence. |
| [ ] | Shortcuts/menus | Native menu accelerators, command palette, keyboard shortcuts ignored in inputs. |
| [ ] | Accessibility | Keyboard focus through core workflows; dialogs close with Escape; axe serious/critical clear. |

## P1 Visual And UX Review

Review at 1100x700, 1440x900, 1920x1080, and one high-DPI or external-display setup.

| Status | Surface | Pass criteria |
| --- | --- | --- |
| [ ] | Dashboard | No broken empty states, clipped names, or overlapping controls. |
| [ ] | Campaign workspace | Maps/panels readable; no stale disabled state. |
| [ ] | DM canvas | Toolbar, sidebars, docks, context menus, bottom HUDs do not overlap. |
| [ ] | Player window | No DM-only UI leaks; map is centered/framed; black bars are expected only outside rotated fit. |
| [ ] | Modals/dialogs | Fit on minimum window size; focus and buttons visible. |
| [ ] | German UI | No clipped German labels in toolbar/sidebar/panels. |
| [ ] | English UI | No missing keys or fallback German where English is expected. |

## P1 Performance And Stability

| Status | Scenario | Pass criteria |
| --- | --- | --- |
| [ ] | 100+ tokens on a large map. | Canvas remains responsive; token move sync still works. |
| [ ] | Heavy fog brush strokes for 2 minutes. | No visible lag spiral; save/reconnect remains correct. |
| [ ] | Player window open/close 20 times. | No crashes, stale connected state, or memory runaway. |
| [ ] | Large audio library filtering. | Search/filter remains responsive. |
| [ ] | 60-120 minute live-session soak. | No renderer crash, sync desync, data loss, or audio/player-window failure. |

## P2 Polish Review

| Status | Area | Notes |
| --- | --- | --- |
| [ ] | Copy and terminology | German/English labels consistent. |
| [ ] | Empty states | Helpful but not noisy. |
| [ ] | Error messages | Actionable and non-technical where user-facing. |
| [ ] | Loading states | No confusing frozen states during import/export/PDF/audio. |
| [ ] | Visual consistency | Icons, colors, panels, and focus states feel coherent. |

## Release Sign-Off

| Role | Name | Decision | Notes |
| --- | --- | --- | --- |
| QA | | Go / No-Go | |
| Engineering | | Go / No-Go | |
| Product | | Go / No-Go | |
| Release | | Go / No-Go | |

## Accepted Issues

| ID | Severity | Area | Description | Workaround | Owner | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Final Go/No-Go

| Question | Answer |
| --- | --- |
| All P0 gates pass? | |
| Any accepted P1 issues? | |
| Backups/export-import verified? | |
| Packaged app verified on target OSes? | |
| Evidence folder complete? | |
| Final decision | Go / No-Go |
