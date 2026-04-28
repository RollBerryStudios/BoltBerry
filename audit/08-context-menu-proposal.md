# Phase 8 — Context Menu Proposal

A holistic redesign for BoltBerry's right-click surface. Sources: a full audit of the renderer codebase + competitor research (Foundry VTT, Roll20, Owlbear Rodeo, Nielsen Norman Group).

---

## A. Executive verdict

The current setup has **four different render paths** (native Electron `Menu.popup`, react-konva-utils `<Html>` portal with custom React tree, a separate `WikiListMenu` HTML overlay, plain `preventDefault` traps), no shared model for "what's under the cursor", and **two entity types with no menu at all** (rooms, drawings). The cumulative effect is exactly what the user reported: it feels undurchdacht.

The fix is not "add more items everywhere." It's a single small architectural piece — **a target-aware context-menu engine** — and a tight, opinionated catalog of per-entity menus that follow well-established VTT and OS patterns.

---

## B. What's there now (audit summary)

| Surface | Trigger | Render path | Items |
|---|---|---|---|
| Token | TokenLayer Group `onContextMenu` | react-konva-utils `<Html>` overlay | rich (rename, HP, AC, status, advantage, focus, light, vis, copy/paste, lock, marker, z-order, delete + batch) |
| Canvas (background) | Stage `onContextMenu` (bails on token-root / pin-root / wall-root) | Native Electron `Menu.popup` | center, rotate 0/90/180/270, fog reveal/cover/reveal-tokens/reset-explored, switch tool, ping, clear drawings |
| Wall | `<Line>` `onContextMenu` (only when wall tool active) | react-konva-utils `<Html>` overlay | toggle type, toggle door state, delete |
| GM Pin | Group `onContextMenu` | Native Electron `Menu.popup` | delete, edit label |
| Map list row | Sidebar `<div>` | Native Electron `Menu.popup` | rename, delete |
| Bestiary row | List `<button>` | Custom HTML overlay (WikiListMenu) | clone, NPC wizard, export, edit, delete |
| Room polygon | — | **no menu** | — |
| Drawing shape | — | **no menu** | — |
| Music channel / SFX slot | div | not a menu (toggles state) | — |
| ShortcutOverlay | trapped | `preventDefault` only | — |

**Inconsistencies:**
- Three render paths for what users perceive as the same affordance.
- Only the token menu is multi-selection aware.
- The native canvas menu is **always the same**, regardless of what's under the cursor (only entity-bail). It doesn't surface "rotate this map" when right-clicking on the map image either — the user has to know "right-click empty pixels."
- Wall menu lacks viewport clamping (token + bestiary menus have it).
- Allowlist (`ALLOWED_CONTEXT_MENU_ACTIONS`) is partial — token actions never go through it because they bypass the native menu entirely.

**Gaps:**
- No room context menu (delete / rename / change visibility / change colour / send a player to it).
- No drawing context menu (delete a single stroke; only "clear all" exists).
- No nested awareness — right-clicking a token *inside a room* never offers room actions.
- No music/SFX right-click actions (mute, remove from channel, set ambient, loop).
- No multi-selection on walls / pins.

---

## C. Lessons from competitors + UX research

**Foundry VTT.** Sparing default menu; rich context comes from sidebar HUD and modules. Double-right-click on an actor's prototype token is a common shortcut. Modules like *RTS Controls* show that some users want right-click to **move** rather than open a menu — worth supporting as a setting later, not the default.

**Roll20 (Jumpgate redesign).** The most directly-comparable competitor. Right-click on a token shows a deep menu: bring/send Z-order, lock-in-place, advanced transform (group, ungroup, enumerate, disable grid snap), define party, character sheet, add-to-turn-tracker. Multi-select toggles vision in one shot. Their explicit redesign goal: "smarter about what you need at your fingertips."

**Owlbear Rodeo.** The cleanest model architecturally: a **predicate-filter API** for menu items. Each item declares filters (`{ layer: 'CHARACTER' }`, `{ minSelection: 2 }`, `{ role: 'GM' }`) and the engine evaluates them against the current context to decide visibility. Extension-friendly; trivially extensible.

**Nielsen Norman Group.** Five rules that matter here:
1. Group logically related options; separate destructive actions at the bottom.
2. Keep options small (Hick's law); a context menu with 18 first-level items is a sign you should prune or split.
3. Avoid submenus when you can — they're easy to dismiss accidentally on shaky-hand users.
4. Same options regardless of how the menu was opened (so a token menu reachable from the canvas, the panel, or the initiative bar should look the same).
5. Destructive actions (delete) at the end with a separator and a danger style.

Sources:
- [Roll20 Help Center — Right Click Menu](https://help.roll20.net/hc/en-us/articles/35999226799127-Right-Click-Menu)
- [Roll20 Wiki — Token Features](https://wiki.roll20.net/Token_Features)
- [Roll20 Jumpgate blog — Redo, Context, and Touch](https://blog.roll20.net/posts/roll20-jumpgate-redo-context-and-touch/)
- [Foundry VTT — Tokens article](https://foundryvtt.com/article/tokens/)
- [Foundry VTT — Game Controls](https://foundryvtt.com/article/controls/)
- [Owlbear Rodeo — Context Menu API](https://docs.owlbear.rodeo/extensions/apis/context-menu/)
- [Owlbear Rodeo — Filters](https://docs.owlbear.rodeo/extensions/reference/filters/)
- [NN/g — Designing Effective Contextual Menus](https://www.nngroup.com/articles/contextual-menus-guidelines/)
- [NN/g — Contextual Menus: Delivering Relevant Tools](https://www.nngroup.com/articles/contextual-menus/)
- [Height — Building like it's 1984: A guide to context menus](https://height.app/blog/guide-to-build-context-menus)

---

## D. Proposed architecture

### D.1. Single entry point

One hook, `useContextMenuEngine`, mounted once at the Stage level. It:
1. Captures `contextmenu` on the stage container DOM (one DOM listener, not Konva-bubbled).
2. Builds a **ContextTarget** by hit-testing all layers in z-order:
    ```ts
    type ContextTarget =
      | { kind: 'token'; token: TokenRecord; selection: number[] }
      | { kind: 'wall';  wall: WallRecord }
      | { kind: 'pin';   pin: GMPinRecord }
      | { kind: 'room';  room: RoomRecord }
      | { kind: 'drawing'; drawing: DrawingRecord }
      | { kind: 'map'; map: MapRecord; pos: { x: number; y: number } }
    type ContextEnvelope = {
      primary: ContextTarget          // foreground entity
      under?: ContextTarget[]         // deeper entities at same point (rooms, etc.)
      pos: { x: number; y: number }   // map-space click
      scenePos: { x: number; y: number } // screen-space click
    }
    ```
3. Resolves a **menu spec** for the primary target by passing the envelope to a registry of `MenuSection[]`.
4. Renders **one** menu, in **one** rendering style (HTML overlay), using a single component (`<ContextMenu>`).

This replaces the current four code paths.

### D.2. Predicate-driven menu spec (Owlbear-style)

```ts
interface MenuItem {
  id: string                     // stable for analytics + i18n key
  labelKey: string               // i18next key
  icon?: string
  shortcut?: string              // displayed only, not bound here
  danger?: boolean               // styled red + placed under separator
  show?: (env: ContextEnvelope) => boolean
  enabled?: (env: ContextEnvelope) => boolean
  run: (env: ContextEnvelope) => void | Promise<void>
}

interface MenuSection {
  id: string
  show?: (env: ContextEnvelope) => boolean
  items: MenuItem[]
}
```

Authors register sections under a target kind; the engine concatenates sections whose `show` evaluates true, drops items whose `show` evaluates false, dims items whose `enabled` evaluates false, and inserts separators between sections. **Predicates are pure** — no IPC, no async — so the menu builds in O(items) per right-click.

### D.3. Single rendering primitive

Replace the three React/HTML overlays (TokenLayer's, WallLayer's, WikiListMenu) plus the native `Menu.popup` with one shared `<ContextMenu>` component built on the existing `Modal` a11y hook. It must support:

- Keyboard nav: ↑/↓, Enter, Esc, type-to-search.
- Viewport clamping.
- Submenu (one level only, NN/g rule 3 — no nesting beyond that).
- Multi-selection rows (e.g., "Delete N Tokens").
- A "More" overflow when the section length exceeds a threshold (12 items per NN/g radial guideline carried over to linear).

Native Electron `Menu.popup` is reserved for places where the OS is the right choice (the App menu, the tray) — **not** for in-canvas menus. This kills the visual inconsistency and gives us full keyboard + i18n + DevTools support.

### D.4. Layered menu (the user's specific request)

When right-clicking a token *inside a room*:

```
─ Token (primary) ─
  Edit name…
  HP / AC…
  Status effects ▶
  Visibility, light, marker
  …
  Copy / Paste
─ ────────────────
  Delete token

─ In Room: "Crypt" ─       ← only present if envelope.under has a room
  Reveal room to players
  Hide room
  Send all party to room
  Open room settings…
─ ────────────────
  Delete room
```

The under-section is collapsible (default expanded for GM-typical actions; user setting can flip the default). Implementation: when the engine collects the envelope, deeper layers are added to `under`; the renderer concatenates "in-room/in-X" sections following the primary entity's sections.

### D.5. IPC allowlist alignment

Drop `ALLOWED_CONTEXT_MENU_ACTIONS` (the partial allowlist in `dialog-handlers.ts`). With everything rendering in-renderer there's no main-process verb to police; the IPC guard from M3 + per-domain validators already gate the underlying mutations. Dialog handlers retain confirm-only flows (delete confirmations, etc.).

---

## E. Per-target catalog

A first cut. Order: high-frequency → mid → infrequent → destructive. Bold = new vs. today.

### Token (single)

1. Rename · Edit HP · Edit AC
2. **Open character sheet** (if linked) · **Open in Wiki** (if bestiary-linked)
3. Status effects ▶
4. Marker ▶ · Faction ▶
5. Visibility (👁/🙈) · Light source toggle · Show name on player
6. **Bring forward / Send back / To front / To back** (today buried in submenu)
7. Lock / Unlock
8. Copy · Paste here · **Duplicate**
9. **Add to initiative** (if not already in tracker)
10. — separator —
11. Delete (danger)

### Token (multi-selection, ≥ 2)

1. **Show all to players · Hide all from players**
2. **Lock all · Unlock all**
3. **Set faction ▶**
4. **Add all to initiative**
5. **Group (formation) ▶** — cluster / line / circle / V (re-using existing formation code)
6. Copy · **Duplicate (offset)**
7. — separator —
8. **Delete N tokens** (danger)

### Room (new)

1. Rename
2. **Visibility ▶**: hidden / dimmed / revealed
3. **Reveal fog inside room · Cover fog inside room** — reuses the existing `fog:action` revealRect / coverRect bus
4. **Send selected token(s) here** (centre selection on the room's centroid)
5. Edit colour · Edit polygon
6. — separator —
7. Delete

### Wall (single, in wall tool)

1. **Toggle type ▶**: wall · door · window · transparent
2. Toggle door state (open / closed)
3. **Disconnect from adjacent walls** (split shared endpoint into two)
4. — separator —
5. Delete

### Wall (multi-selection)

Today nothing exists; add: select-all-along-segment, set-all-as-doors, delete N walls.

### GM Pin (single)

1. Edit label
2. Edit colour / icon
3. **Send to player as pointer ping**
4. — separator —
5. Delete

### Drawing (new)

1. Edit text (text drawings only)
2. **Hide from players · Show to players** (the `synced` flag)
3. Bring forward / Send back
4. — separator —
5. Delete

### Canvas / Map (no entity under cursor)

1. **Fit to screen · 100% zoom**
2. Rotate ▶ (0/90/180/270 — this rotates *both* DM + player, matching the just-merged fix)
3. **Add token here from Wiki…** (opens BestiaryPicker with click-to-place at this exact point)
4. **Add GM pin here**
5. **Drop drawing pin / measure here**
6. Fog ▶: reveal all · cover all · reveal under tokens · reset explored
7. Tool ▶: select · pointer · measure · draw · fog brush · fog rect · wall · room
8. Ping here

(The existing top-level "tool-measure / tool-draw / tool-fog-brush / tool-fog-rect" pollutes the menu — pulling them into a "Tool" submenu drops 4 first-level entries down to 1.)

### Sidebar list rows (maps, bestiary, character sheets)

Same predicate model, target = `{ kind: 'list-row', entity: ... }`. Items:

- Maps: Rename · Duplicate · Move up · Move down · — · Delete
- Bestiary: Open · Spawn on map (click-to-place) · Send handout to player · Duplicate · Edit · — · Delete (user-owned only)
- Characters: Open sheet · Send portrait to players · Duplicate · — · Delete

The list-row menus reuse the same `<ContextMenu>` component for visual consistency.

---

## F. Interaction rules

1. **One render path** — HTML overlay component. Native `Menu.popup` only for the macOS app menu / system tray.
2. **Keyboard support** mandatory (NN/g 4 + WCAG): Esc, Enter, ↑/↓, type-to-search, → opens submenu, ← closes it.
3. **Right-click selects** (only when not already selected) — Roll20 + Foundry + every OS file manager. The current code already does this for tokens; extend to walls / pins / rooms / drawings.
4. **Right-click respects existing multi-selection** — clicking on one of N selected tokens shows the multi-token menu. Clicking outside the selection on a single target switches to single-token semantics.
5. **Destructive actions**: separator-above, danger style, Enter requires the row to actually be focused (no "press right-click then immediately Enter" misclick on Delete).
6. **Submenus**: max one level. If a section needs a third level, promote it to the sidebar.
7. **Layered menu**: the primary entity's menu is always first. "In ⟨Room⟩" / "On ⟨Map⟩" sections are appended below, separated by a header row (style: small caps, dim).
8. **Sticky tools**: do not switch the active tool from a menu unless the user explicitly picks a tool item. Today the canvas menu mixes "rotate map" and "tool: measure" at the same level — the proposed Tool ▶ submenu fixes this.
9. **Cancel everything on outside click** + Esc + canvas pan/zoom (already done for tokens; generalise).
10. **i18n**: every label goes through `t()`. Today's hardcoded German labels in TokenLayer's menu (`'Spawn ${name}'`, etc.) should move into locale files.

---

## G. Implementation roadmap

Phased so each step ships value without breaking the rest.

### Phase 1 — Engine + canvas menu rewrite (~1–2 days, S/M)
- Add `useContextMenuEngine` + `ContextTarget` types in `src/renderer/hooks/`.
- Add `<ContextMenu>` component in `src/renderer/components/shared/` reusing `useDialogA11y`.
- Migrate the canvas-level menu (`useCanvasContextMenu`) to the engine. Reorganise items per §E (Tool ▶, Fog ▶, etc.).
- Add the "Add token here from Wiki…" entry (click-to-place at the right-click position — the click-to-place state already exists from the latest fix).

### Phase 2 — Migrate existing entity menus (~1 day, S)
- Token, wall, GM pin, sidebar map row → migrate to engine. Drop the four parallel render paths. Delete native `Menu.popup` for in-canvas menus.
- Drop `ALLOWED_CONTEXT_MENU_ACTIONS`.

### Phase 3 — Fill the gaps (~1 day, S)
- Room polygon menu (§E.Room).
- Drawing shape menu (§E.Drawing).
- Multi-selection on walls / pins (§E).

### Phase 4 — Layered ("In Room") menu (~0.5 day, S)
- Engine collects `under` array; renderer composes sections with section headers.

### Phase 5 — Polish (~0.5 day, S)
- Type-to-search.
- Right-arrow / left-arrow submenu nav.
- All hardcoded labels through i18n.
- Visual: separator handling, danger style, kbd hints.

**Total: 4–5 days.** No architectural risk — the engine is local-only; the rendering primitive replaces existing code one surface at a time. Each phase is shippable on its own.

---

## H. What this fixes for the user

- **"Brauche raumoptionen wenn token in raum"** → §D.4 + §E.Room. The token menu auto-appends "In Room: ⟨name⟩" with the four most useful room actions.
- **"Token braucht kontextmenü mit üblichen punkten"** → §E.Token already covers this; phase 1 reorganises ordering per NN/g + Roll20 patterns.
- **"Gesamtkonstrukt zu undurchdacht"** → §D collapses four render paths into one and gives every right-click a single, deterministic target-resolution flow.

---

*(End of Phase 8 — context menu proposal.)*
