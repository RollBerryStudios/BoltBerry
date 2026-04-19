# Token Variants

Token artwork bundled with the installer. Shipped to the user on first run
(copied into `<userDataFolder>/token-variants/<slug>/`) so the existing
asset reader can serve them without special-casing bundled paths.

## Source

[`IsThisMyRealName/too-many-tokens-dnd`](https://github.com/IsThisMyRealName/too-many-tokens-dnd)
— all tokens generated via Bing Image Creator and explicitly released
license-free by the maintainer: *"Free to use: All tokens are created
with the Bing Image creator and totaly license free. Save them, share
them, put them in a stew. They belong to anyone."*

We ship the first 5 alphabetical variants per creature. These act as the
drag-to-map seeds for a subset of SRD creatures that existed before the
v33 switch to the full 263-creature bilingual dataset.

The full token artwork — including dozens of additional variants per
creature — lives alongside the stat blocks in `resources/data/monsters/
<slug>/tokens/` and is surfaced in the Bestiarium browser, not this
seed folder.

Only creatures present in the SRD 5.2.1 (CC-BY-4.0) are seeded; any
older seed rows that pre-date the Bestiarium dataset are wiped by
migration v33 before the Bestiarium-backed seed fills `token_templates`.

## Layout

```
resources/token-variants/
  <slug>/
    01.webp
    02.webp
    03.webp
    04.webp
    05.webp
```

The `<slug>` matches the slug column in `token_templates`, which is
seeded from `resources/data/index.json` at startup. Users can drop
additional variants into `<userDataFolder>/token-variants/<slug>/` at
any time — they show up alongside the bundled ones in the token
library.

## Adding a new bundled creature

1. Add the creature to `resources/data/monsters/<slug>/monster.json`
   and the matching entry in `resources/data/index.json`.
2. Optionally drop legacy 2-digit-prefixed variants (`01.webp` …
   `05.webp`) into this folder under the same slug for the drag-to-map
   seed behaviour. The full variant set is served from
   `resources/data/monsters/<slug>/tokens/`.
3. Restart the app — the seed picks up the new slug.
