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

We ship the first 5 alphabetical variants per creature (23 of the 25
seeded SRD creatures — Beholder and Lich have no entries in the upstream
repo and fall back to the deterministic-hue initial tile).

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
