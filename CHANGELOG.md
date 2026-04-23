# Changelog

All notable changes to BoltBerry are tracked here. The app follows SemVer
once it hits 1.0; until then, 0.x releases may break prior assumptions.

## 0.20.14 — 2026-04-23

### Fixed
- **Comprehensive UTF-8 mojibake cleanup** — fixed double/triple-encoded
  characters across 13+ source files (Wiki detail cards, sidebar panels,
  context menus, initiative, campaign view). Separators now render as
  `·`, arrows as `↗`, and emoji icons (⚔️ 🛡️ ⚠️ ❌ ✏️ ❤️ ⬆️ ⏫ − ⚖️)
  display correctly instead of showing corrupted `â€“` sequences.

## Unreleased

- **Wiki** — bilingual SRD 5.1 reference: 263 monsters, 203 items, 313
  spells, 13k+ token variants. Search, filters, sort, deep-link from
  Welcome / Command Palette / token context-menu.
- **Default-token override** — pin any variant as a creature's
  portrait from the Wiki; persists across sessions and applies to
  every spawn surface (Wiki, encounter picker, Token Library).
- **Wiki ↔ gameplay** — spawn straight onto the active map, push
  monster / item / spell cards to the player window, "Open in Wiki"
  on token right-click and initiative rows.
- **`bestiary://` URL scheme** — replaces the 30–50 KB base64 data URL
  per spawned token with a compact reference; image loaders resolve
  on demand, slashing DB bloat.
- **Top bars** — Wiki + Compendium reserve space for the OS-native
  window controls (72 px on macOS traffic lights, 140 px on
  Windows / Linux caption buttons) so the action buttons aren't
  clipped.
- **Compendium PDF rendering** — switched from `flex + justify-center`
  to `text-align: center` on the canvas wrap; pages wider than the
  viewport now scroll properly instead of clipping the left edge.
- **Git LFS prerequisite** — token webps live in LFS; `.gitattributes`
  now covers `resources/data/**/*.webp` and the app surfaces a hint
  in the Wiki when it detects un-fetched LFS pointers.
- **Schema v34** — adds `monster_defaults` for the portrait override
  and migrates the legacy SRD seed onto the bestiary:// scheme.
- Defensive renderers for `ac` / `savingThrows` / `properties` shape
  drift in the dataset (some monsters store `ac` as plain strings,
  banshee uses an object for `savingThrows`, items use L10n strings
  for `properties` not arrays).

## 0.20.0 — 2026-04-18

First minor release after the v0.19.x stabilisation cycle. Introduces
the full v1 Conservative DM View, per-map grid styling, a shared
NumberStepper, redesigned audio panel, hero-image monster cards,
language-scoped compendium, and ~227 tests — up from 208.

### Added
- Extended grid settings: per-map **visibility** toggle, **thickness**
  multiplier, and **custom colour** (hex / rgba) — stored in schema v32.
- Keyboard shortcuts: `G` toggles the grid on/off; `G +` / `G –` chord
  resizes the grid's cell pixel size. Wall-draw moves to `Shift+G` so
  `G` by itself becomes a grid action without stealing the fog/wall
  flow.
- Reusable `NumberStepper` input for HP / AC / grid size etc. — adds
  +/- buttons, `ArrowUp`/`ArrowDown` bindings, `Shift+Arrow` for ±5,
  mouse-wheel increment, click-and-hold to repeat.
- Grid auto-detection now runs a multi-scale trial pass and falls back
  to the strongest secondary autocorrelation peak when the dominant
  peak is ambiguous. Softer grid lines are picked up via an adaptive
  edge-magnitude threshold instead of the old fixed `> 10` cut-off.
- Canvas **weather overlay** now renders on the DM map, not only the
  player window.
- Compendium broadcast auto-re-sends on page/zoom changes, with a new
  ⏹ Stop button to dismiss the handout from the DM side.
- Monster cards carry a hero image and a full stat-block preview
  dialog; creature-type glyph fallback when no artwork exists.
- Dock preferences: novice-mode labels under tool icons, auto-hide
  when the cursor rests on the map. Both persist in localStorage.

### Fixed
- Map tools (fog, draw, wall, room) fire on empty space again — each
  layer now paints a 1-px-alpha full-canvas hit rect so Konva
  dispatches mouse events where no existing shape sits.
- Left-rail dock no longer swallows clicks along the whole canvas
  height — shrinks to content height and uses the `pointer-events:
  none` + child-opt-in pattern.
- Drawing toolbar duplicate removed (SubToolStrip owns draw presets
  now).
- Character-sheet creation was silently blocked by a shadowed
  `EmptyState` import; shadow removed.
- Memory leak in `FogLayer` — imperative `Konva.Image` nodes now
  destroy on unmount, not only on map change.
- `PlayerTokenState` broadcast carries `lightRadius` / `lightColor`
  everywhere; player window sees token lights again.
- `ErrorBoundary` retry actually remounts the subtree instead of
  re-rendering the same broken tree.
- Zip-import unpacks under `realpathSync(importDir)` with segment-
  level `..` rejection — legitimate filenames like `a..b.txt` are no
  longer rejected, and a symlink in the parent chain can't redirect
  writes.
- Compendium shows only the SRD matching the active UI language; the
  file-list sidebar collapses until the user imports a custom PDF.
- Wind weather overlay is legible on bright maps (brighter colour,
  more particles, longer trails).
- Audio panel re-themed with design-system classes; channel-accent
  colour is driven via a CSS custom property.
- Welcome / Compendium right-pane reserves 150 px for the Windows /
  Linux titleBarOverlay so the window controls no longer overlap the
  chrome buttons.
- File-size warning dialog in main picks DE or EN copy based on the
  DM's current UI language.

### Security
- Extended zip-traversal guard: realpath-canonicalised import dir,
  segment-level `..` filter, non-string-only prefix check.

## 0.19.x

- v0.19.41 — this audit + v1 Conservative DM View (see above).
- Earlier 0.19.x releases: DM left-rail tool dock, SubToolStrip,
  AudioStrip, character-sheet editor, compendium viewer skeleton,
  frameless-window custom title bar.

## Legal

SRD 5.2.1 content is bundled under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
Token artwork from the `too-many-tokens-dnd` community. Full
attribution: see [NOTICE.md](NOTICE.md).
