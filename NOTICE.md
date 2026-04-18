# Third-Party Notices

BoltBerry's **application code** is MIT-licensed (see [`LICENSE`](LICENSE)).
Some bundled content and data originate from third parties under separate
licenses and require attribution.

## D&D 5e System Reference Document 5.2 (SRD 5.2)

This application includes game rules content derived from the Dungeons &
Dragons System Reference Document 5.2 ("SRD 5.2"), licensed under the
[Creative Commons Attribution 4.0 International License (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/legalcode).

- **Creator:** Wizards of the Coast LLC
- **Original source:** <https://dnd.wizards.com/resources/systems-reference-document>
- **License:** CC-BY-4.0 — <https://creativecommons.org/licenses/by/4.0/>

**Where it appears in BoltBerry:**

1. **Bestiarium / Token Library** — 45 creature stat blocks seeded into the
   `token_templates` table with `source = 'srd'`. The German text is a
   translated, condensed adaptation of the original SRD entries: ability
   scores, HP, AC, speed, CR, creature type, and 1–3 signature attacks plus
   salient traits are preserved; flavor text and non-mechanical prose are
   omitted. This is a **derivative work** under CC-BY-4.0.

2. **Kompendium** — the official WotC-published SRD 5.2 PDFs
   (`DE_SRD_CC_v5.2.1.pdf`, English SRD 5.2 PDF) may be bundled verbatim in
   `resources/compendium/` and shipped to users unmodified. These PDFs
   contain WotC's own CC-BY-4.0 license notice on their title page.

**No endorsement:** This project is independent fan work and is not
approved, endorsed, sponsored, or specifically licensed by Wizards of the
Coast LLC.

### Required attribution string

If you fork or redistribute BoltBerry, keep the following attribution
visible somewhere in your product (Bestiarium header does it in the app;
this `NOTICE.md` does it for the repo):

> This product includes material from the Dungeons & Dragons System
> Reference Document 5.2, © Wizards of the Coast LLC, licensed under the
> Creative Commons Attribution 4.0 International License
> (https://creativecommons.org/licenses/by/4.0/). The material has been
> translated into German and condensed for in-app display.

## Token artwork

Creature token variants under `resources/token-variants/` come from
[`IsThisMyRealName/too-many-tokens-dnd`](https://github.com/IsThisMyRealName/too-many-tokens-dnd),
released by the upstream maintainer as license-free (Bing Image Creator
generated, explicitly placed in the public pool — "they belong to anyone").
No CC-BY-4.0 attribution required, but we credit the collection in
[`resources/token-variants/README.md`](resources/token-variants/README.md)
for traceability.

## Fonts

BoltBerry uses Inter (SIL OFL), JetBrains Mono (Apache 2.0), and Fraunces
(SIL OFL) via system fallback when the named face isn't installed. None of
these fonts are bundled into the repo — they render through Electron's
system font stack or the user's browser.

---

Questions about attribution or licensing: open an issue at
<https://github.com/RollBerry-Studios/BoltBerry>.
