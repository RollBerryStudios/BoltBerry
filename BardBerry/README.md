# BardBerry

BardBerry is a standalone Electron companion app for local virtual tabletop ambience, music, and sound effects.

It reuses the proven BoltBerry audio interaction model without requiring a campaign:

- three live channels: Music, Ambience, Combat
- combat mode that freezes and fades down Music/Ambience, then restores timestamps afterwards
- master volume, per-channel volumes, loops, seek bars, and track assignment chips
- local audio library with file and recursive folder import
- SFX boards with 10 keyboard-like slots, emoji or custom icons, per-slot volume, loop, and preview/trigger
- portable JSON library import/export
- offline-first local asset storage under the BardBerry user data folder

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run dist
```

The BardBerry package uses `electron-builder.yml` and writes installers to `release/`.
