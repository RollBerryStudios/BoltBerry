# Compendium PDFs

PDFs in this folder ship with the installer and appear in the app's
**Kompendium** tab as read-only references.

## Bundled PDFs

| File | Source | License |
|---|---|---|
| `srd-de-5.2.1.pdf` | [D&D Beyond — SRD CC 5.2.1 (DE)](https://media.dndbeyond.com/compendium-images/srd/5.2/DE_SRD_CC_v5.2.1.pdf) | Creative Commons (CC-BY-4.0) — Wizards of the Coast SRD 5.2 |

The SRD PDF is **not committed** to the repo to keep checkout sizes small.
Download it once and drop it here before running `npm run dist`:

```bash
curl -L -o resources/compendium/srd-de-5.2.1.pdf \
  https://media.dndbeyond.com/compendium-images/srd/5.2/DE_SRD_CC_v5.2.1.pdf
```

The build process picks up any `*.pdf` file in this folder via
`extraResources` in `electron-builder.yml`. End users can add their own
PDFs through the in-app "Eigene PDF hinzufügen" button — those land in
`<userDataFolder>/compendium/` and are merged with the bundled set at
runtime.

## Adding a new bundled PDF

1. Drop the file here.
2. List it in the table above with its source + license.
3. Confirm the license permits redistribution.
