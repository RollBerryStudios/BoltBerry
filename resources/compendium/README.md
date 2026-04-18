# Compendium PDFs

PDFs in this folder ship with the installer and appear in the app's
**Kompendium** tab as read-only references.

## Bundled PDFs

| File | Source | License |
|---|---|---|
| `srd-de-5.2.1.pdf` | [D&D Beyond — SRD CC 5.2.1 (DE)](https://media.dndbeyond.com/compendium-images/srd/5.2/DE_SRD_CC_v5.2.1.pdf) | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) — © Wizards of the Coast LLC, SRD 5.2 |
| `srd-en-5.2.1.pdf` | [D&D Beyond — SRD CC 5.2.1 (EN)](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf) | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) — © Wizards of the Coast LLC, SRD 5.2 |

Both PDFs are committed directly to the repo — the CC-BY-4.0 license
explicitly allows redistribution as long as the attribution (see
[`NOTICE.md`](../../NOTICE.md) at repo root and the in-app Kompendium
header strip) is preserved. The `extraResources` rule in
[`electron-builder.yml`](../../electron-builder.yml) ships them inside
the installer.

End users can add their own PDFs through the in-app "PDF importieren"
button — those land in `<userDataFolder>/compendium/` and are merged
with the bundled set at runtime.

## Adding a new bundled PDF

1. Drop the file here.
2. List it in the table above with its source + license.
3. **Confirm the license permits redistribution** before committing.
4. If the license differs from CC-BY-4.0 on a per-file basis, also
   update `NOTICE.md` at the repo root.
