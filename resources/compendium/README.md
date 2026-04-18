# Compendium PDFs

PDFs in this folder ship with the installer and appear in the app's
**Kompendium** tab as read-only references.

## Bundled PDFs

| File | Source | License |
|---|---|---|
| `srd-de-5.2.1.pdf` | <https://www.dndbeyond.com/srd> | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode.de) |
| `srd-en-5.2.1.pdf` | <https://www.dndbeyond.com/srd> | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |

The full required attribution string is in [`NOTICE.md`](../../NOTICE.md)
and rendered in-app in the "About BoltBerry" dialog and as a clickable
short-credit strip above the Compendium PDF list.

The `extraResources` rule in
[`electron-builder.yml`](../../electron-builder.yml) bundles every
`*.pdf` in this folder into the installer.

End users can add their own PDFs through the in-app "PDF importieren"
button — those land in `<userDataFolder>/compendium/` and are merged
with the bundled set at runtime.

## Adding a new bundled PDF

1. Drop the file here.
2. List it in the table above with its source + license.
3. **Confirm the license permits redistribution** before committing.
4. If the license differs from CC-BY-4.0 on a per-file basis, also
   update `NOTICE.md` at the repo root.
