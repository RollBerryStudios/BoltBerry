# Phase 11 — UX QA Review (Tools, Shortcuts, Layout, Logic)

Status: **proposal** — no code touched yet. Approve / amend before I implement.

This is a full pass over every interactive surface that ships today, cross-checked against the three reference VTTs (Roll20, FoundryVTT, Owlbear Rodeo) and Nielsen Norman Group guidance on shortcuts and accelerators. Goal: find every place where the app diverges from established convention or where two parts of the app contradict each other.

What's covered:

- **§1** Tool palette (LeftToolDock) — mapping, ordering, sub-tools
- **§2** Keyboard shortcuts — every binding, conflicts, missing entries
- **§3** Mouse / pointer gestures per entity
- **§4** Layout (sidebars, top toolbar, floating dock, modals)
- **§5** Context menus
- **§6** Drag & drop and clipboard
- **§7** Discoverability (overlay, tooltips, hints)
- **§8** Accessibility & focus
- **§9** Prioritised findings (Critical / Moderate / Minor) with proposed fixes

Sources cited inline; competitor table summarised in Appendix A.

---

## §1 Tool palette (LeftToolDock)

Defined in `LeftToolDock.tsx:38–110`. Four sections, top-to-bottom:

| Section | Group | Primary | Variants | Default key |
|---|---|---|---|---|
| view | select | ↖ Select | — | **V** |
| view | pointer | 👆 Pointer | — | **W** |
| view | measure | 📏 Line | Circle, Cone | **M** |
| combat | token | ⬤ Token (place) | — | **T** |
| reveal | fog | 🖌 Brush | Brush-Cover, Rect, Polygon, Cover | **B** (X / F / P / C) |
| world | environment | 🧱 Wall | Door, Room | **G** (J / R) |
| world | draw | ✏️ Freehand | Rect, Circle, Text, Erase | **D** |

### §1.1 Findings

**(C-1) Wall key advertised as `G`, but plain `G` is hijacked by Grid toggle.**
`useKeyboardShortcuts.ts:325–339` reassigned plain `G` to "toggle grid + arm chord", and moved wall-draw to **Shift+G**. The dock (`LeftToolDock.tsx:86`) and the help overlay (`ShortcutOverlay.tsx:31`) still advertise `G` for walls. Whichever a user trusts, the other lies. Fix in §9 C-1.

**(C-2) `T` plain vs `T` capital is a load-bearing distinction.**
`useKeyboardShortcuts.ts:349–354`: lowercase `t` switches to the **token-place tool**, uppercase `T` opens the **Tokens sidebar tab**. Reaching the second one requires Shift, but neither dock label nor overlay says so — the overlay (line 23) renders both as the same uppercase `T`. NN/g calls this a violation of *consistency and standards* (heuristic #4) — same key, two meanings, no signal. Fix in §9 C-2.

**(M-3) Measure variants Circle / Cone have no shortcut.**
Only `M` (line). To switch shape the user must mouse to the dock variant flyout or the SubToolStrip. Foundry binds the entire ruler group to one key and rotates shape via context. Roll20 uses `f r` chord. Recommend either rotate-on-repeat-`M` or `M`/`Shift+M`/`Ctrl+M`. Fix in §9 M-3.

**(M-4) Erase tool (`draw-erase`) has no shortcut.**
Sits as a sub-tool variant of Freehand (`LeftToolDock.tsx:101`). Photoshop / Figma / OBR all give the eraser its own key — `E` is the universal default. We use `E` for `togglePlayerEye` (see §2). Either: assign `Shift+E` to eraser, or move Player-Eye to a less conventional key. Fix in §9 M-4.

**(m-5) Pointer (`W`) ordering is off.**
The dock places `Select (V)` above `Pointer (W)`. Fine in isolation. But Foundry & Owlbear Rodeo treat the pointer / pen / ping as a **transient** tool (one-shot), not a persistent mode. Our pointer is persistent — once active, every left-click pings. New DMs reach for the pointer to "show players where I'm looking", get stuck in pointer mode, and call it broken. Recommend: ping should auto-revert to the previous tool after one use, like Spacebar in Photoshop. Fix in §9 m-5.

**(m-6) Token-place tool (`T`) is destination-only — it does not auto-return.**
Same pattern: after placing one token the tool stays armed and every click drops another. Roll20 / Foundry token-create returns to Select after placement. Fix in §9 m-6.

**(m-7) Atmosphere tool was removed but its `ActiveTool` enum value is still referenced.**
Comment at `LeftToolDock.tsx:106–109` says it was relocated to the top toolbar. The string `'atmosphere'` is still a valid `ActiveTool` (used as a render-mode discriminant). Dead surface — clean up or remove. Fix in §9 m-7.

---

## §2 Keyboard shortcuts

The canonical map is **`useKeyboardShortcuts.ts`** (300+ lines, single global keydown). Secondary handlers live in `App.tsx` (palette + settings + help), `CanvasArea.tsx` (`L` for layer panel), `useSfxHotkeys.ts` (1-9/0 for SFX board), `RoomLayer.tsx` (Esc / Enter inside polygon), various modal Esc traps. The user-facing reference is `ShortcutOverlay.tsx:19–74`.

### §2.1 Documented vs implemented (drift table)

| Category | Key | Overlay says | Code does | Drift? |
|---|---|---|---|---|
| Tool | V | Select | Select | ✓ |
| Tool | W | Pointer | Pointer | ✓ |
| Tool | M | Measure | Measure-line | ✓ |
| Tool | T | Token tab | Token tool *(plain `t`)* + Token tab *(Shift+T)* | **✗** overlay merges two |
| Tool | B / X / F / P / C | Fog tools | Fog tools | ✓ |
| Tool | D | Draw | Draw freehand | ✓ |
| Tool | **G** | **Wall** | **Grid toggle + chord** *(wall on Shift+G)* | **✗ critical** |
| Tool | J | Door | Door | ✓ |
| Tool | R | Room | Room | ✓ |
| Tool | E | Player view (eye) | Player view (eye) | ✓ |
| Tool | — | (eraser) | unbound | **✗** missing |
| Tool | — | (rect / circle / cone / cover-brush variant) | unbound | **✗** missing |
| Layer | **L** | not listed | toggle layer-visibility panel | **✗** missing from overlay |
| Pan | Alt+Drag / Middle / Space | listed | also right-click drag, also plain-left-drag-on-empty (select tool) | **✗** overlay stale |
| Map | 1–5 | switch map | switch map | ✓ |
| Map | 0 | Fit to screen | Fit to screen | ✓ |
| Sidebar | Ctrl+1..6 | not listed | sidebar tab N | **✗** missing |
| Floating | Ctrl+7..9 | not listed | overlay / audio / dice panel | **✗** missing |
| Combat | N | Next fighter | Next fighter (broadcasts) | ✓ |
| Audio | 1–9 / 0 | not listed | SFX slot trigger (when audio panel open) | **✗** missing |
| Audio | ß / `-` | not listed | next SFX board | **✗** missing |
| Player ctrl | Ctrl+Arrow | rotate viewport | rotate viewport (5°, Shift→15°) | ✓ |
| Help | ? / F1 | this overlay | this overlay | ✓ |
| Help | — | not listed | Cmd/Ctrl+, opens settings | **✗** missing |
| Grid | — | not listed | G then `+` / `-` chord resizes grid | **✗ hidden feature** |
| Undo | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | listed (Z only) | all three work | partial |

Eight rows of drift. Six of them are "feature exists, overlay doesn't say so" — pure documentation debt.

### §2.2 Conflicts and ambiguities

**(C-8) `1`–`5` does double duty: switch map *and* SFX slot trigger.**
`useKeyboardShortcuts.ts:271–294` checks `floatingPanel === 'audio'` first and steals the digit; `useSfxHotkeys.ts:52` runs only when `floatingPanel === null`. So when the audio panel is *open*, digits trigger SFX *and* the same handler returns before the map-switch case at line 452 is reached. Logic is consistent today, but two hooks racing on the same digit is fragile — a future floating panel that uses digits will silently break SFX. Fix in §9 C-8.

**(C-9) `useSfxHotkeys` and `useKeyboardShortcuts`'s audio branch contradict each other.**
`useSfxHotkeys.ts:50–52` says: "Floating-popover guard — the popover has its own number controls, return". I.e. when audio popover is open, *don't* fire SFX. `useKeyboardShortcuts.ts:271` says: when audio popover is open, *do* fire SFX. Both claim to be authoritative. Today the second wins (registered later on the same `keydown`), but the comment in the first is now a lie. One of the two should be deleted. Fix in §9 C-9.

**(M-10) Plain `1`–`5` switch maps without confirmation.**
A DM with five maps loaded who's typing in a non-input element (e.g. has clicked on the canvas) will jump maps on every digit press. Roll20 requires `Ctrl+Shift+M` for layer-equivalent moves. Foundry has no plain-digit map switch. Recommend `Ctrl+1..5` for map switch, free up `1..5` for future per-tool params. Fix in §9 M-10.

**(M-11) `+` / `-` zoom collides with grid-resize chord.**
`useKeyboardShortcuts.ts:67–87` arms a 900 ms chord window after pressing `G`. Inside the window, `+` and `-` resize the grid; outside, they zoom. A user who misses the chord by 901 ms gets a zoom and assumes nothing happened. NN/g recommends *visible feedback* for chord arming — we have none. Fix in §9 M-11.

**(M-12) `E` for "toggle player eye" is fragile.**
Single-letter, non-modifier, no on-screen affordance. Users reaching for "e" expecting eraser get the player-eye. Recommend remap `E` → eraser (matches every paint app), move player-eye to `Y` or `O` (icon-driven; no convention). Fix in §9 M-12.

**(M-13) `N` (Next fighter) fires globally even when initiative panel is closed.**
`useKeyboardShortcuts.ts:355–372`: pressing `N` advances initiative regardless of whether the user has the panel open or even has any combat going. Risk: in middle of a session a stray `N` keystroke jumps the round. Foundry gates round-advance behind the active-control selection. Fix in §9 M-13.

**(m-14) `Escape` clears token selection AND switches to Select tool AND clears fog pending points — all three at once.**
`useKeyboardShortcuts.ts:374–378`. Heavy-handed. If the user is mid-fog-polygon and presses Escape to cancel just the polygon, the active tool also flips back to select. Recommend a ladder: 1st Esc cancels in-flight gesture (polygon, drag, draw), 2nd Esc clears selection, 3rd Esc returns to Select tool. Standard model in Figma / Photoshop. Fix in §9 m-14.

**(m-15) `Delete` / `Backspace` opens a confirm dialog every time.**
`useKeyboardShortcuts.ts:380–440`. Roll20 and Foundry delete tokens silently with native undo as the safety net. Our undo *is* implemented; the confirm is friction. Recommend: drop the confirm for ≤3 selected tokens, keep it for batch-delete >3. Fix in §9 m-15.

---

## §3 Mouse / pointer gestures

### §3.1 Pan triggers (today)

`MapLayer.tsx:162–181` accepts:

1. **Middle-mouse drag** (button === 1) — universal but laptop-hostile
2. **Alt+Left-drag** (button === 0 + altKey) — power-user
3. **Space+Left-drag** (button === 0 + spaceHeld) — Photoshop / Figma idiom

All three require either a special button or a held modifier. There is **no plain-left-drag pan** and **no right-click drag pan** in code today. Phase 10 (`audit/10-pan-and-token-menu-proposal.md`) proposed adding right-click drag pan + plain-left-drag pan on empty stage; per the file inspection above, neither has shipped yet.

### §3.2 Competitor reference

| App | Plain-left-drag (empty) | Right-click drag | Middle drag | Space+drag |
|---|---|---|---|---|
| Roll20 | ✓ pans | ✗ context menu | ✓ | ✓ |
| FoundryVTT | ✓ pans | ✓ pans | ✓ | (per binding) |
| Owlbear Rodeo | ✓ pans | ✓ pans (universal) | ✓ | (Spacebar viewport) |
| Photoshop / Figma | (tool-dependent) | (tool-dependent) | ✗ | ✓ pro standard |
| **BoltBerry** | **✗** rubber-band selection | **✗** opens menu | ✓ | ✓ |

Two zero-modifier gestures (left-drag-empty + right-drag) are universal across competitor VTTs — we have **none**. Discoverability for new users is poor: every QA round so far has surfaced the same complaint ("pan doesn't work").

### §3.3 Other gesture conflicts

**(C-16) Right-click on empty stage — only opens the context menu, never pans.**
This is the gesture every Foundry / Owlbear user reaches for first. We treat it as menu-only. Phase 10 §A.3 proposed click-vs-drag threshold (5 px) to add right-pan without losing right-click menu. **Still unimplemented.** Fix in §9 C-16.

**(C-17) `Shift+Click` on stage = ping; left-click on stage = nothing.**
`MapLayer.tsx:607` — Shift+Click on the stage triggers a ping ("share view"). The overlay calls this `shortcuts.keyPing` (line 39). Roll20 uses Shift+L-click for the same — match. But: the overlay also says left-drag-on-empty does nothing; we currently arm rubber-band, contradicting the doc.

**(M-18) Wheel-zoom centres on cursor, but trackpad pinch (ctrl+wheel) is also wheel-zoom.**
`MapLayer.tsx:258–259`. Pinch zoom on macOS arrives with `ctrlKey=true` and small deltaY; a user on Windows holding Ctrl and scrolling for a fast zoom hits the same path. OK in practice, but Player-Control mode reuses Ctrl+Wheel for viewport resize — which is why `handleWheelNative` checks `playerViewportMode` first. The check works, but the dual meaning of "Ctrl+Wheel" is opaque. Fix in §9 M-18 (just document it).

**(m-19) Click on token ≠ click on token-name label.**
TokenLayer renders the token-image as the click target *and* a Text label below it that's also listening. Clicking the label currently selects the token via the same `onClick` (good), but the rubber-band / pan / drag click-vs-drag thresholds use the token bounds, not the label bounds. Edge case: dragging from the label causes a small drift before the drag arms. Low priority. Fix in §9 m-19.

**(m-20) `Shift+Click` token = multi-select.** ✓ matches every VTT.

**(m-21) `Ctrl+Click` token — currently unhandled.** Foundry uses Ctrl+Click for "select-add" (different from Shift). Roll20 uses Ctrl+Click for "select to top". We do nothing — adding it is a freebie. Fix in §9 m-21.

---

## §4 Layout

### §4.1 Top-level chrome

- **TitleBar** (custom) — drag region, traffic lights, app menu
- **Toolbar** (`Toolbar.tsx`) — top horizontal: campaign / map name, Player Cluster (player-window, blackout, atmosphere, player-control), session-mode chip, language picker, settings cog
- **LeftToolDock** (`LeftToolDock.tsx`) — vertical icon rail, see §1
- **SubToolStrip** (`SubToolStrip.tsx`) — context-sensitive horizontal pills for the active group's variants
- **CanvasArea** — Konva stage
- **Right sidebar** — scene dock (Tokens / Initiative / Encounters / Rooms) + content dock (Notes / Handouts / Characters)
- **FloatingUtilityDock** — bottom-right popovers: Overlay (weather/blackout), Audio, Dice
- **Status / footer** — minimap + zoom chip overlaid on canvas

### §4.2 Findings

**(M-22) Two sidebars conflict on Ctrl+\\ vs Ctrl+Shift+\\.**
Overlay says `Ctrl+\\` toggles left sidebar, `Ctrl+Shift+\\` toggles right sidebar. Fine. But VS Code uses `Ctrl+B` for the primary sidebar; we use `Ctrl+B` for blackout. Muscle memory clash for any user who lives in VS Code. Recommend: move blackout to `Ctrl+Shift+B`, free up `Ctrl+B` for left-sidebar toggle. Fix in §9 M-22.

**(M-23) Floating dock has no keyboard discovery.**
The Audio / Dice / Overlay popovers open via `Ctrl+8 / Ctrl+9 / Ctrl+7`. They're not labelled with the shortcut on hover. Fix in §9 M-23 (just add `[Ctrl+8]` to the tooltip, matches the dock-rail pattern in §1).

**(M-24) Top toolbar's "Player Cluster" buttons have no shortcut on hover.**
Atmosphere has none at all (was relocated from the dock per §1 m-7). Player-window has Ctrl+P (works), Blackout has Ctrl+B (works), Player-Control toggle has none. Should match the dock pattern. Fix in §9 M-24.

**(m-25) SubToolStrip variants are not keyboard-reachable from the strip itself.**
The strip is a row of `<Pill>` buttons (`SubToolStrip.tsx:75–96`). Tab-traversal works via DOM focus, but there's no Arrow-Left/Right between siblings, no `role="toolbar"` wrapper, no `aria-pressed`. WAI-ARIA toolbar pattern recommends Arrow-keys to move + Enter/Space to activate. Fix in §9 m-25.

**(m-26) RoomLayer keydown listener uses capture-phase Esc.**
`RoomLayer.tsx:107–125` swallows Escape during a polygon draw to prevent the global Esc handler from leaving the Room tool. Correct for the in-flight case but means Esc in *any* Room-tool state (even after the polygon is complete) suppresses other listeners. Low priority but worth tightening to `if (drawingPoints.length > 0)` only. Fix in §9 m-26.

**(m-27) Floating audio panel and SFX hotkeys both grab focus.**
When the audio panel opens, its keyboard mode wins (number triggers slot). When it closes, those numbers fall through to map-switch. There's no on-screen indicator telling the user which mode they're in. Fix in §9 m-27.

---

## §5 Context menus

Two render paths today (after Phase 8):

1. **Engine path** — `contextMenu/registry.ts` + `shared/ContextMenu.tsx`. Wall, pin, room, drawing, generic canvas, list-row use this. Submenus extend right (correct).
2. **Token path** — `TokenLayer.tsx` legacy inline menu, ~320 lines. Submenus open via custom anchored portals (post-Phase 10 fix).

### §5.1 Findings

**(C-28) Two context-menu render paths still coexist.**
Phase 10 §B proposed migrating the token menu to the engine. Status: not done. Result is duplicated code (keyboard nav, escape handling, outside-click, viewport clamping), divergent visual styling, and per-fix friction. Fix in §9 C-28.

**(M-29) Token menu's "Im Raum: …" footer does not appear for engine-path entities.**
`TokenLayer.tsx` appends a footer when the token sits inside a room polygon. The engine already supports `under` targets — wall and pin under-room would work the same way for free. Today it's only token-aware. Fix in §9 M-29.

**(M-30) Right-click on a non-selected entity narrows selection to that one.**
`CanvasArea.tsx:248–254` (wall), :268–273 (pin) — matches OS file-manager and Foundry. Token does the same in TokenLayer. Good. ✓

**(m-31) Type-to-search inside a context menu is not discoverable.**
The shared `ContextMenu.tsx` supports it. No hint in the UI. Fix in §9 m-31.

**(m-32) Context menu does not close on resize / window blur.**
`shared/ContextMenu.tsx:116` only listens for keydown + outside-mousedown. Dragging the window or resizing leaves the menu hovering at stale screen coords. Fix in §9 m-32.

**(m-33) Submenu open-on-hover delay is 0 ms.**
`shared/ContextMenu.tsx` opens the right-extending submenu instantly on mouseenter. Foundry uses ~400 ms hover-intent. Without it, mousing diagonally across the menu can flash the wrong submenu open. Fix in §9 m-33.

---

## §6 Drag & drop, clipboard

### §6.1 Inventory

| Source | Target | Effect |
|---|---|---|
| Asset panel item | Canvas | Drop image as token (or map background, depending on type) |
| Token Library entry | Canvas | Spawn token at drop point |
| Bestiary monster | Canvas | Spawn monster as token |
| Map list row | Canvas tab strip | Re-order |
| Initiative entry | Initiative list | Re-order combat order |
| File from OS | Canvas | (no handler) |
| File from OS | Asset panel | Import asset |

`Ctrl+C` / `Ctrl+V` on tokens — paste anchors at visible map centre (`useKeyboardShortcuts.ts:147–263`). Multi-token paste preserves relative offsets (good).

### §6.2 Findings

**(M-34) `Ctrl+V` paste lands at map centre, not cursor.**
Roll20 / Foundry paste at cursor. Our paste re-anchors to viewport centre. For a DM mid-encounter who copied tokens to spawn elsewhere, this is one extra drag every paste. Fix in §9 M-34.

**(M-35) No paste preview.**
Compare with Figma: paste shows a dashed ghost the user can place. We commit DB rows immediately. Fix is non-trivial; tracking as M-35 for backlog.

**(m-36) `Ctrl+D` not bound for "duplicate".**
Standard in every visual editor. We have right-click "Duplicate" but no key. Fix in §9 m-36.

**(m-37) Drop-on-canvas creates token at cursor, but token-tool click also creates a token at cursor.**
Two paths to the same outcome — fine, but the drop path debounces image load and shows a placeholder; the click path doesn't. Inconsistent feedback. Fix in §9 m-37.

**(m-38) Initiative drag handle has no keyboard alternative.**
The list is reorderable by mouse only. WAI-ARIA listbox pattern allows Alt+Up/Down for reorder. Fix in §9 m-38.

---

## §7 Discoverability

NN/g: *"Common shortcuts should be visible and easily accessible in the interface, styled in a way that differentiates them from the corresponding GUI-command label, for example by right-aligning shortcuts next to the corresponding action."*

### §7.1 What we do well

- LeftToolDock primary buttons show `[V]`, `[T]`, `[M]` etc. on hover (`LeftToolDock.tsx:267`, :322).
- Shortcut overlay reachable via `?` or `F1` from anywhere.
- Command palette (`Ctrl+K`) lists every action.

### §7.2 Findings

**(C-39) ShortcutOverlay is partially out of date** — see §2.1 drift table. Eight rows out of date. Top user-facing reference should not lie. Fix in §9 C-39.

**(M-40) No keybind editor.**
Foundry's "Configure Controls" panel is a major selling point — every keystroke is rebindable. We have hardcoded keys. Hard to add later if we don't design for it from the start. Fix in §9 M-40 (design + implement).

**(M-41) Grid chord is hidden.**
`G then +/-` resizes grid. Discoverable only by reading source. Fix in §9 M-41 (overlay entry + visible toast on G to advertise).

**(M-42) No visible tooltip on top-toolbar buttons.**
Atmosphere / Player-Window / Blackout / Player-Control buttons have aria-labels but no `<title>` or hovertip. Fix in §9 M-42.

**(m-43) Sub-tool strip lacks shortcut hints.**
Each Pill renders a label only — no `[F]` / `[P]` / `[C]` hint. The dock has them; the strip doesn't. Fix in §9 m-43.

---

## §8 Accessibility & focus

### §8.1 Existing affordances

- Modal trap via `useDialogA11y.ts` — Tab cycle, Esc close, restore focus on close.
- Toolbar root has `role="toolbar"` + `aria-label`.
- `aria-modal="true"` on dialogs (used by SFX hotkey gating).

### §8.2 Findings

**(M-44) Canvas surface is not keyboard reachable.**
You cannot Tab to the canvas, Tab between tokens, or activate a token without a mouse. OBR 2.1 added Tab/Enter/Arrow nav in 2024. Without this, screen-reader and motor-impaired users cannot use any canvas feature. Fix in §9 M-44.

**(M-45) Toolbar pattern not fully implemented.**
Per WAI-ARIA, `role="toolbar"` requires Arrow-key navigation between buttons + roving tabindex. We have the role but not the keys. Fix in §9 M-45.

**(m-46) No skip-link to canvas / no landmark roles.**
`<main>` / `<nav>` / `<aside>` landmarks not consistently applied. Fix in §9 m-46.

**(m-47) Focus-visible styling is absent on many custom buttons.**
`.btn-ghost` and Pill components rely on default browser outline; in dark theme that outline is barely visible. Fix in §9 m-47.

**(m-48) No live-region for toast / undo / round-changed announcements.**
Screen readers miss every system event. Fix in §9 m-48.

---

## §9 Prioritised findings & proposed fixes

Severity scale:
- **C** — Critical: contradicts itself, breaks user expectation, or matches a real complaint we already received
- **M** — Moderate: friction, divergence from convention, missing-but-present-elsewhere
- **m** — Minor: polish

Estimates are LOC and time including testing.

### Critical (8) — fix first

| ID | Finding | Proposed fix | Est. |
|---|---|---|---|
| **C-1** | `G` is grid-toggle in code but wall-draw in dock + overlay | **Pick one.** Recommend: revert wall to `G` (matches dock + overlay + competitor convention); move grid-toggle to `Shift+G`; chord becomes `Shift+G` then `+/-`. Update `useKeyboardShortcuts.ts:325–339`. | 30 LOC, 30 min |
| **C-2** | `t` vs `T` does two different things | Use `T` for **token tool** (matches dock); move "open tokens tab" to `Ctrl+1` (which it already is). Drop the `case 'T':` branch at `useKeyboardShortcuts.ts:352–354`. Update overlay. | 10 LOC, 15 min |
| **C-8** | `1`–`5` map-switch races SFX hotkey when audio panel open | Delete the audio-branch in `useKeyboardShortcuts.ts:271–294`; let `useSfxHotkeys` own digits unconditionally; gate map-switch on `floatingPanel === null`. | 30 LOC, 20 min |
| **C-9** | `useSfxHotkeys` floating-popover guard contradicts `useKeyboardShortcuts` audio branch | Same fix as C-8 — delete the duplicate. | (in C-8) |
| **C-16** | Right-click drag does not pan; only middle / Alt / Space pan | Implement Phase 10 §A.4: button===2 mousedown arms, threshold 5 px, mouseup blocks next contextmenu via one-shot capture-phase listener. | 80 LOC, 1 hr |
| **C-17** | Plain-left-drag on empty stage rubber-bands instead of panning when select tool active | Implement Phase 10 §A "secondary improvement": gate rubber-band on `Shift`; bare left-drag pans when target is Stage and select tool active. | 30 LOC, 30 min |
| **C-28** | Two context-menu render paths (engine + token-legacy) | Implement Phase 10 §B.4: migrate token menu to engine with `customRender` for HP/AC/notes block. | 250 LOC, 0.5–1 day |
| **C-39** | ShortcutOverlay drift (8 rows) | Add missing entries: `L`, right-pan, plain-left-pan, Ctrl+1..9 panels, `Ctrl+,` settings, `G` grid+chord, audio digits, audio `ß`. Fix `T` row. | 60 LOC, 30 min |

**Total Critical effort:** ~1 day.

### Moderate (15) — fix second

| ID | Finding | Proposed fix | Est. |
|---|---|---|---|
| **M-3** | Measure shape variants have no shortcut | Bind `M`/`Shift+M`/`Alt+M` to line/circle/cone, OR rotate shape on repeat-`M`. | 25 LOC, 20 min |
| **M-4** | Erase tool unbound | Bind `Shift+E` to `draw-erase` (E remains player-eye for now). | 5 LOC, 5 min |
| **M-10** | Plain digits switch maps too easily | Move map-switch to `Ctrl+1..5`; free up bare digits. | 15 LOC, 20 min |
| **M-11** | Grid chord has no visible feedback | Show a small "G… press +/- to resize" toast or HUD chip while chord window is armed. | 40 LOC, 30 min |
| **M-12** | `E` for player-eye conflicts with eraser muscle memory | Move player-eye to `Y` (eYe). Free `E` for future eraser. (After M-4 lands, can swap E↔Shift+E.) | 5 LOC, 5 min |
| **M-13** | `N` advances initiative even if panel closed / no combat | Gate on `useInitiativeStore.entries.length > 0` AND `sessionMode !== 'prep'`. | 5 LOC, 5 min |
| **M-18** | Ctrl+Wheel meaning depends on player-control mode | Already conditional, just document in overlay. | (in C-39) |
| **M-22** | `Ctrl+B` blackout vs VS Code's `Ctrl+B` sidebar | Move blackout to `Ctrl+Shift+B`; bind `Ctrl+B` → toggle left sidebar (replacing `Ctrl+\\` which stays as alias). | 10 LOC, 10 min |
| **M-23** | Floating dock buttons have no shortcut hint | Add `[Ctrl+8]` etc. to titles. | 15 LOC, 15 min |
| **M-24** | Player-Cluster buttons in top toolbar have no shortcut hint | Same — add to `title=`. | 10 LOC, 10 min |
| **M-29** | Engine-path entities (wall/pin) don't show "Im Raum" footer | Use the engine's `under` slot to render a room footer for any kind. | 40 LOC, 30 min |
| **M-34** | Paste lands at map centre, not cursor | Track last cursor map-pos in MapLayer; paste anchors there. | 25 LOC, 20 min |
| **M-40** | No keybind editor | Larger work — design + ship a `useKeybindStore` + Settings UI tab. Park behind C-1/C-2 (rebinding solves them too). | 1.5 days |
| **M-41** | Grid chord hidden | Add to overlay (in C-39). Plus the toast in M-11 makes it discoverable on first use. | (in C-39 + M-11) |
| **M-42** | Top-toolbar tooltips missing | Add `title=` to each button in `Toolbar.tsx`. | 15 LOC, 15 min |
| **M-44** | Canvas not keyboard reachable | Phase work: Tab focusable Stage container, Arrow-key cycle through tokens, Enter to open menu, Esc to deselect. | 1 day |
| **M-45** | Toolbar role without arrow nav | Implement WAI-ARIA toolbar pattern with roving tabindex. | 80 LOC, 0.5 day |

**Total Moderate effort (excl. M-40 + M-44 + M-45 which are bigger):** ~3–4 hr.
With M-40 / M-44 / M-45: +3 days.

### Minor (16) — backlog

m-5 ping auto-revert · m-6 token-tool auto-revert · m-7 atmosphere dead enum · m-14 Esc ladder · m-15 delete confirm threshold · m-19 token label hit drift · m-21 Ctrl+Click token select-add · m-25 SubToolStrip arrow-keys · m-26 RoomLayer Esc gate · m-27 SFX mode HUD · m-31 type-to-search hint · m-32 menu close on blur/resize · m-33 hover-intent submenu delay · m-36 `Ctrl+D` duplicate · m-37 paste-preview consistency · m-38 initiative keyboard reorder · m-43 SubToolStrip shortcut hints · m-46 landmarks · m-47 focus-visible · m-48 live-region

Combined backlog effort: ~1–1.5 days, mostly small.

---

## §10 Recommended sequencing

```
Sprint 1  (1 day)   →  C-1, C-2, C-8/C-9, C-39  (truth-up the keymap + overlay)
Sprint 2  (1 day)   →  C-16, C-17               (pan: ship Phase 10 §A)
Sprint 3  (1 day)   →  C-28                     (token menu: ship Phase 10 §B)
Sprint 4  (1 day)   →  M-3..M-13, M-22..M-29, M-34, M-41..M-42  (moderate batch)
Sprint 5  (3 days)  →  M-40 keybind editor, M-44 canvas keyboard nav, M-45 ARIA toolbar
Backlog   (1.5 day) →  all m-* polish
```

Total ≈ 7–8 dev-days for full closure. Sprints 1–3 alone (≈3 days) clear every Critical and address the top user complaints (G key, T overload, pan, token menu) — recommended **minimum** before next release.

---

## Appendix A — Competitor cross-reference

| Action | Roll20 | FoundryVTT | Owlbear Rodeo | **BoltBerry today** | **Recommended** |
|---|---|---|---|---|---|
| Select tool | T (advanced) / mouse | S | (transform Z) | **V** | V (✓) |
| Pan empty stage | left-drag (no token) | left-drag / right-drag / middle | left-drag / right-drag | **Alt / Space / Middle only** | + plain-left + right-drag |
| Pointer / ping | ping button | (per-tool) | — | **W** | W (✓) — auto-revert (m-5) |
| Walls | (Dynamic Lighting tool) | W | W | **G (Shift+G in code)** | G — revert (C-1) |
| Doors | sub-of-walls | (variant) | (variant) | **J** | J (✓) |
| Rooms | regions extension | regions | (extension) | **R** | R (✓) |
| Fog | menu | T | F | **B / X / F / P / C** | keep cluster |
| Drawing | freehand button | D | D | **D** | D (✓) |
| Erase | (per-tool) | (delete) | (per-tool) | **unbound** | Shift+E (M-4) |
| Measure | Q (advanced) | M / R | M | **M** | M (✓) — cycle on repeat (M-3) |
| Place token | drag from sidebar | drag | drag | **T tool** | drop tool after one place (m-6) |
| Multi-select | shift+click | shift+click | shift+click | **shift+click** | (✓) + Ctrl+Click (m-21) |
| Rubber-band | left-drag empty | left-drag empty | left-drag empty | **left-drag empty** | gate on Shift (C-17) |
| Delete | Del (silent) | Del (silent) | Del (confirm batch only) | **Del (always confirm)** | confirm only ≥3 (m-15) |
| Undo | Ctrl+Z | Ctrl+Z | Ctrl+Z | **Ctrl+Z** | (✓) |
| Redo | Ctrl+Shift+Z | Ctrl+Shift+Z | Ctrl+Shift+Z | **Ctrl+Shift+Z / Ctrl+Y** | (✓) |
| Zoom | wheel / +- | wheel / +- | wheel / +- / Shift+precision | **wheel / +-** | (✓) |
| Fit | (button) | Z (zoom-fit) | (button) | **0** | 0 (✓) |
| Layers | Ctrl+Shift+letter | (per-button) | — | **L (panel)** | L (✓) — list in overlay (C-39) |
| Help | ? | (settings panel) | ? | **? / F1** | (✓) |
| Settings | settings cog | F12 (or button) | (button) | **Ctrl+,** | (✓) |
| Keybind editor | partial | **full editor** | scoped per-extension | **none** | add (M-40) |
| Sidebar toggle | (panel-specific) | C / J / etc. | (per-panel) | **Ctrl+\\ / Ctrl+Shift+\\** | + Ctrl+B left (M-22) |
| Command palette | — | Quick Insert mod | — | **Ctrl+K** | (✓) |
| Player-window | (separate URL) | A/V controls | — | **Ctrl+P** | (✓) |
| Blackout | — | (canvas pause) | (extension) | **Ctrl+B** | move → Ctrl+Shift+B (M-22) |
| Tab nav on canvas | — | partial | **Tab/Enter/Arrows** | **none** | implement (M-44) |

Sources:
- Roll20: [Hotkeys](https://help.roll20.net/hc/en-us/articles/360039675393-Hotkeys), [Advanced Hotkeys](https://help.roll20.net/hc/en-us/articles/360039178974-Advanced-Hotkeys), [Wiki Keyboard Shortcuts](https://wiki.roll20.net/Keyboard_Shortcuts)
- FoundryVTT: [Game Controls](https://foundryvtt.com/article/controls/), [Keybinds](https://foundryvtt.com/article/keybinds/), [Layer Hotkeys](https://foundryvtt.com/packages/layer-hotkeys)
- Owlbear Rodeo: [2.1 Release Notes](https://blog.owlbear.rodeo/owlbear-rodeo-2-1-release-notes/), [Tools docs](https://docs.owlbear.rodeo/extensions/apis/tool/), [Legacy keyboard shortcuts](https://deepwiki.com/owlbear-rodeo/owlbear-rodeo-legacy/8.3-keyboard-shortcuts)
- NN/g: [UI Copy: UX Guidelines for Command Names and Keyboard Shortcuts](https://www.nngroup.com/articles/ui-copy/), [Accelerators Maximize Efficiency in User Interfaces](https://www.nngroup.com/articles/ui-accelerators/), [Flexibility and Efficiency of Use](https://www.nngroup.com/articles/flexibility-efficiency-heuristic/), [Keyboard-Only Navigation](https://www.nngroup.com/articles/keyboard-accessibility/)

---

## Appendix B — Suggested keymap (post-fix)

For reference. Same column count as the overlay; would replace `ShortcutOverlay.tsx:19–74`.

```
TOOLS
  V          Select
  W          Pointer (auto-revert after 1 ping)
  M          Measure-line   (M again → circle → cone)
  T          Token (place); auto-revert after 1 place
  B / X      Fog brush / Fog brush-cover
  F / P / C  Fog rect / polygon / cover
  D          Draw freehand
  Shift+E    Eraser
  G          Wall            ← restored (C-1)
  J          Door
  R          Room
  Y          Player view (eye)   ← moved (M-12)

VIEW & CAMERA
  Wheel              Zoom
  + / -              Zoom in / out
  0                  Fit to screen
  Alt+Drag           Pan
  Space+Drag         Pan
  Middle Drag        Pan
  Right Drag         Pan        ← new (C-16)
  Left Drag (empty)  Pan        ← when select tool active (C-17)
  Shift+L-Drag       Rubber-band selection (was: bare left)

GRID
  Shift+G            Toggle grid               ← moved (C-1)
  Shift+G then +/-   Resize grid (5 px)        ← chord
  L                  Toggle layer panel        ← documented (C-39)

SELECTION
  Click              Select
  Shift+Click        Add to selection
  Ctrl+Click         Toggle in selection       ← new (m-21)
  Esc                Cancel gesture > clear selection > switch to Select
                                               ← Esc ladder (m-14)
  Del / Backspace    Delete (confirm if ≥3)    ← (m-15)

CLIPBOARD
  Ctrl+C / Ctrl+V    Copy / paste (paste at cursor)
  Ctrl+D             Duplicate                 ← new (m-36)

COMBAT
  N                  Next fighter (only when initiative active)

FOG / DRAW
  Double-click       Finish polygon
  Ctrl+Z / Ctrl+Y    Undo / redo
  Ctrl+Shift+Z       Redo (alias)

PANELS
  Ctrl+1..6          Sidebar tab N (incl. Tokens, Initiative, Encounters, Rooms, Notes, Handouts)
  Ctrl+7..9          Floating overlay / audio / dice
  Ctrl+B             Toggle left sidebar       ← moved from blackout (M-22)
  Ctrl+Shift+\       Toggle right sidebar
  Ctrl+Shift+B       Blackout                  ← was Ctrl+B (M-22)

PLAYER CONTROL
  Ctrl+Drag          Move viewport rect
  Ctrl+Wheel         Resize viewport rect
  Ctrl+Arrows        Rotate viewport (Shift = 15°)
  Esc                Exit player-control mode

GLOBAL
  Ctrl+K             Command palette
  Ctrl+P             Open player window
  Ctrl+S             Save now
  Ctrl+,             Global settings
  ? / F1             This overlay

AUDIO (when SFX panel open)
  1..9 / 0           Trigger slot 1..10
  ß / -              Next SFX board
```

---

## §D What I need from you

Pick from:

- **(1) Approve all Critical fixes (C-1..C-39).** I implement Sprints 1–3 (~3 days), ship in batched commits. Deferred: M-40 / M-44 / M-45 (the bigger pieces).
- **(2) Approve Critical + Moderate-batch (Sprints 1–4).** ~4 days, leaves only M-40 / M-44 / M-45 + minors.
- **(3) Full plan including keybind editor + canvas a11y.** ~7–8 days. Recommended if next release is "polish" focused; otherwise Sprint 1–3 first.
- **(4) Cherry-pick.** Tell me which IDs from §9 you want first.

Recommendation: **Option (1)**. Sprints 1–3 close every contradiction the user already complained about (G key, pan, token menu length) plus the docs lie that ShortcutOverlay has been carrying. M-40 (keybind editor) is the right lever to make many Moderate items moot — but it's a bigger design conversation, worth doing as its own pass.

---

*(End of Phase 11 — UX QA review)*
