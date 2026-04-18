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

We ship the first 5 alphabetical variants per creature. 24 of the 25
seeded SRD creatures have bundled art; Lich has no entry in the upstream
repo and falls back to the deterministic-hue initial tile.

Only creatures present in the D&D 5.2 SRD (CC-BY-4.0) are seeded.
Earlier drafts included two creatures whose names are protected Wizards
of the Coast IP and are **not** in the SRD — they've been replaced with
Fire Giant and Treant (both SRD-legal, both with art in the upstream
repo). The v27 migration removes the old seed rows from existing user
DBs as long as they were untouched.

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

The `<slug>` matches `SrdMonster.slug` in `src/main/db/srd-monsters.ts`
and is seeded into `token_templates.slug`. Users can drop additional
variants into `<userDataFolder>/token-variants/<slug>/` at any time —
they show up alongside the bundled ones in the token library.

## Adding a new bundled creature

1. Drop 5 variants into `resources/token-variants/<new-slug>/` named
   `01.webp` through `05.webp`.
2. Set `slug: '<new-slug>'` on the SRD entry in `srd-monsters.ts`.
3. Restart the app — the seed migration picks up the new slug.
