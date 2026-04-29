# Phase 10 — Pan + Token Menu Length Proposal

Two QA issues from this round:

1. **"Richtiges Pan geht immer noch nicht auf der Karte"** — the user is asking why panning the map feels broken. After looking at the code: the only ways to pan today are middle-mouse drag, **Alt**+left-drag, or **Space**+left-drag. None of those is the obvious gesture a new user reaches for, and a plain left-drag on empty space currently triggers rubber-band selection (because the select tool's `handleLayerMouseDown` arms it).

2. **"Kontextmenü bei Token viel zu lang"** — the TokenLayer's inline menu expands its submenus **downwards inside the main list**, so opening "Zustände" (~22 status effects) pushes the menu height ~400px past the viewport. The user wants submenus to extend **to the right**, like every other right-click menu in the app already does (Phase 8 engine).

This doc is the proposal — not the implementation. Approve / amend before I touch code.

---

## A. Pan investigation

### A.1 Current pan triggers (`MapLayer.handleMouseDown`)

```ts
const isMiddle  = e.evt.button === 1
const isAltLeft = e.evt.button === 0 && e.evt.altKey
const isSpacePan = e.evt.button === 0 && spaceHeld.current
if (!isMiddle && !isAltLeft && !isSpacePan) return
```

So today: **middle-click drag**, **Alt+left-drag**, **Space+left-drag**. Three options, all needing either a special button (middle-click is laptop-hostile) or a modifier key. No discoverable gesture.

A plain right-click currently does **only** open the context menu — it never pans, even on drag.

### A.2 What competitors do

| App | Default pan |
|---|---|
| **Roll20** | Spacebar+drag, or left-drag on empty space (no token under cursor) |
| **FoundryVTT** | Left-drag empty space, *or* right-click drag, *or* middle-click drag |
| **Owlbear Rodeo** | Right-click drag is the universal pan method |
| **Photoshop / Figma** | Spacebar+drag (pro standard) |

Common thread: every modern tool has at least **one no-modifier gesture** that pans.

### A.3 Recommendation

Add **right-click drag = pan** alongside the existing modifier-based gestures. Click-vs-drag is differentiated by movement threshold:

- Right-mousedown → record start position, do not open menu yet.
- Right-mousemove → if movement exceeds 5px, enter pan mode; from this point intercept further mousemoves to update the camera offset.
- Right-mouseup:
  - If pan mode was entered → suppress the next `contextmenu` event (the browser would otherwise still fire it).
  - If pan mode was *not* entered → let `contextmenu` fire normally and the engine opens the menu.

This is the most natural addition because:
- No modifier needed → discoverable.
- Doesn't conflict with rubber-band (left-drag) or token drag (left-drag on a token).
- Works regardless of active tool.
- Matches Owlbear Rodeo + FoundryVTT idiom.

**Optional secondary improvement (left as-is for now):** allow left-drag on empty stage to pan when the select tool is active *and* the click missed every shape. Today that path arms rubber-band; the trade-off is small and rubber-band selection is useful, so I'd leave it. The right-click-drag pan covers the discoverability gap on its own.

### A.4 Implementation sketch (~80 LOC, 1 hour)

Edit `MapLayer.tsx`:

```ts
const rightPanState = useRef<{ active: boolean; startX: number; startY: number } | null>(null)
const SUPPRESS_CONTEXT_THRESHOLD = 5  // px

function handleMouseDown(e) {
  // … existing isMiddle / isAltLeft / isSpacePan path …

  // Right-click: arm potential pan; defer the click-vs-drag decision
  // until mousemove or mouseup.
  if (e.evt.button === 2) {
    rightPanState.current = { active: false, startX: e.evt.clientX, startY: e.evt.clientY }
    // Do NOT preventDefault here — we still want contextmenu to fire
    // on a click-without-drag.
    return
  }
  // … rest of existing handler
}

function handleMouseMove(e) {
  // If a right-pan is armed and we've moved past the threshold,
  // commit to pan mode.
  if (rightPanState.current) {
    const dx = Math.abs(e.evt.clientX - rightPanState.current.startX)
    const dy = Math.abs(e.evt.clientY - rightPanState.current.startY)
    if (!rightPanState.current.active && dx + dy > SUPPRESS_CONTEXT_THRESHOLD) {
      rightPanState.current.active = true
      isPanning.current = true
      lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
      stageRef.current?.container().style.setProperty('cursor', 'grabbing')
    }
  }
  // … existing pan-update path
}

function handleMouseUp(e) {
  if (rightPanState.current?.active) {
    // We panned — block the next contextmenu so the menu doesn't open
    // on top of our just-completed drag.
    const block = (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      window.removeEventListener('contextmenu', block, { capture: true })
    }
    window.addEventListener('contextmenu', block, { capture: true })
  }
  rightPanState.current = null
  // … existing release path
}
```

The `block` listener is one-shot capture-phase, so it fires before CanvasArea's stage-level `onContextMenu` and prevents the menu without affecting any other right-click.

---

## B. Token menu length

### B.1 Current state

`TokenLayer.tsx` lines 1054–1335 build a flat `menuItems[]` array; the renderer maps over it and expands submenus **inline**:

```jsx
{isSubOpen && isStatus && (
  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
    {STATUS_EFFECTS.map((eff) => <button …>)}
  </div>
)}
```

So clicking "Zustände" expands a 200px-max sub-list **inside the main menu's vertical list**, after the "Zustände" row. With 22 status effects, that adds 22×30px ≈ 660px before the inner scroll engages. On a 768p screen the Markierung / Faction / Delete rows then sit below the viewport.

### B.2 Why the engine submenus already solve this

The Phase 8 engine's `<ContextMenu>` renders submenus as a sibling popover positioned `left: 100%` (lines 282–315 of `ContextMenu.tsx`). Hover or right-arrow opens, click selects. This is what every other entity menu in the app already uses — and it's exactly what the user wants for tokens.

### B.3 Recommendation

Migrate the **list-based** parts of the token menu to engine-style submenus, keeping the **rich** parts (HP chips, inline rename, AC / notes editing) as the engine's `customRender` slot landed in commit `ece55ee8`.

| Token menu section | Today | Proposed |
|---|---|---|
| Edit name / HP / AC / notes | Inline editor (custom widgets) | Stay as `customRender` block (top of menu) |
| Visibility / lock / light toggle | Plain rows | Plain rows (no change) |
| **Zustände** (~22 entries) | Inline expanding sub-list | **Engine submenu →** |
| **Markierung** (~7 swatches) | Inline expanding sub-list | **Engine submenu →** |
| **Fraktion** (4 options) | Inline expanding sub-list | **Engine submenu →** |
| Z-order (4 options) | Inline rows | **Submenu →** (collapses 4 rows to 1) |
| Copy / paste / duplicate / delete | Plain rows | Plain rows (no change) |

Result: the main menu drops to about **10 rows + 1 customRender block**, and submenus open to the right of the main panel. The Zustände submenu can keep its 200px inner scroll for the rare 22-entry case.

### B.4 Implementation sketch (~250 LOC, 0.5–1 day)

1. Create `src/renderer/contextMenu/tokenMenu.ts` with one resolver registered for kind `'token'`. Returns:
   - **Section "edit"** — single MenuItem with `customRender: (env) => <TokenInlineHeader token={env.primary.token} />`. The custom React component renders the existing HP chips + edit affordances. Lift the inline editing state (`editingId / editName / editHpCurrent / editAc`) into this component or a sibling popover.
   - **Section "view"** — Visibility, Lock, Light, Show name (plain MenuItems with `enabled` predicates).
   - **Section "categorise"** — Fraktion ▶, Markierung ▶, Zustände ▶ (each a MenuItem with `submenu: [...]`).
   - **Section "zorder"** — Z-order ▶ submenu with 4 entries.
   - **Section "clipboard"** — Copy / Paste / Duplicate / "+ Initiative".
   - **Section "destructive"** — Delete (danger).
2. CanvasArea's right-click dispatcher gains a `token-root` branch (mirrors wall/pin already there) — drops TokenLayer's per-Group `onContextMenu`.
3. Drop TokenLayer's inline menu render block (`{contextMenu.visible && (...)}` — about 320 lines).
4. Phase 4's "Im Raum: …" footer becomes automatic — the engine already appends under-target sections when CanvasArea passes them in (which it does for walls/pins; just extend to tokens).

**Risk note.** The inline editors (rename / HP / AC / notes) are tightly coupled with TokenLayer's local state. Moving them into a `customRender` body that lives inside the engine's overlay is the only non-trivial part. Two approaches:

- **(a)** Lift the edit state to a Zustand store (`useTokenInlineEditStore`) and have both TokenLayer and the new TokenInlineHeader read it. Cleanest.
- **(b)** Keep the edit state in TokenLayer; the menu's customRender block sees nothing of it and instead uses callbacks (`onStartRename`, `onStartHpEdit`, …) passed via the engine envelope. Simpler diff, slightly uglier prop chain.

I'd default to **(a)** — small new store, no prop chain, isolates a piece of state that should never have lived in TokenLayer's render anyway.

---

## C. Sequencing

Both fixes are independent:

```
Pan fix  (~1 hour, low risk, small diff)        → ship first
Token menu migration (~0.5 day, moderate diff)  → ship second
```

Pan goes first because it's the user's bigger annoyance ("nicht funktioniert"), the diff is contained to MapLayer, and it doesn't need any visual QA across the menu surface.

Token-menu migration second; it'll need a hands-on pass to confirm:
- HP chips behave the same (−5 / −1 / +1 / +5 with mouse and keyboard)
- Inline rename trigger, commit on Enter / blur, cancel on Esc
- All 22 status effects still toggle independently
- Marker swatches preserve current selection visual
- Multi-token batch ("X Tokens ausgewählt") header still appears
- Keyboard nav (arrow keys, type-to-search) works inside the submenus

---

## D. What I need from you

Pick from:

- **(1) Approve both fixes as proposed.** I implement A.4 + B.4, ship two commits.
- **(2) Approve pan only; defer token migration.** A.4 ships now, B is parked.
- **(3) Different gesture for pan.** E.g. plain left-drag on empty stage — possible, just say so.
- **(4) Token migration with approach (b) instead of (a).** Smaller diff, slightly uglier. Tell me if you'd rather avoid the new store.

---

*(End of Phase 10 — pan + token menu proposal)*
