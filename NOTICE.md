# Third-Party Notices

BoltBerry's **application code** is MIT-licensed (see [`LICENSE`](LICENSE)).
Some bundled content and data originate from third parties under separate
licenses and require attribution.

## D&D 5e System Reference Document 5.2.1 (SRD 5.2.1)

The required CC-BY-4.0 attribution string for any work derived from the
SRD 5.2.1, in the form Wizards of the Coast LLC publishes:

> This work includes material taken from the System Reference Document
> 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
> <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under the
> Creative Commons Attribution 4.0 International License (available at
> <https://creativecommons.org/licenses/by/4.0/legalcode>).

The same paragraph in German (used as in-app text):

> Dieses Werk enthält Material aus dem Systemreferenzdokument 5.2.1
> („SRD 5.2.1") von Wizards of the Coast LLC, verfügbar unter
> <https://www.dndbeyond.com/srd>. Das SRD 5.2.1 ist lizenziert gemäß
> Creative Commons Namensnennung 4.0 International Public License
> (verfügbar unter <https://creativecommons.org/licenses/by/4.0/legalcode.de>).

### Modification notice (CC-BY-4.0 §3(a)(1)(B))

The SRD 5.2.1 material has been translated into German and condensed for
in-app display. It surfaces in two places:

1. **Bestiarium / Token Library** — 45 creature stat blocks seeded into
   the `token_templates` table with `source = 'srd'`. Ability scores, HP,
   AC, speed, CR, creature type, 1–3 signature attacks, and salient
   traits are preserved; flavor text and non-mechanical prose are
   omitted.
2. **Kompendium** — the official SRD 5.2.1 PDFs (`srd-de-5.2.1.pdf` /
   `srd-en-5.2.1.pdf`) are bundled verbatim in `resources/compendium/`.

If you fork or redistribute BoltBerry, the in-app About dialog and the
short attribution strips above the Bestiarium and Compendium views must
remain visible — those carry the required attribution string at runtime.

## Token artwork

Creature token variants under `resources/token-variants/` come from
[`IsThisMyRealName/too-many-tokens-dnd`](https://github.com/IsThisMyRealName/too-many-tokens-dnd),
released by the upstream maintainer as license-free (Bing Image Creator
generated, explicitly placed in the public pool — *"Free to use: All
tokens are created with the Bing Image creator and totaly license free.
Save them, share them, put them in a stew. They belong to anyone."*).
No CC-BY-4.0 attribution is required, but we credit the collection
in-app (About dialog) and in
[`resources/token-variants/README.md`](resources/token-variants/README.md)
for traceability.

## Fonts

BoltBerry uses Inter (SIL OFL), JetBrains Mono (Apache 2.0), and Fraunces
(SIL OFL) via system fallback when the named face isn't installed. None
of these fonts are bundled into the repo — they render through Electron's
system font stack or the user's browser.

---

Questions about attribution or licensing: open an issue at
<https://github.com/RollBerry-Studios/BoltBerry>.
