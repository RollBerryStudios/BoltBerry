<p align="center">
  <img src="src/renderer/assets/boltberry-logo-wide.png" alt="BoltBerry Logo" width="300">
</p>

<h1 align="center">BoltBerry</h1>

<p align="center">
  <strong>Lokales Virtual Tabletop für Pen-&amp;-Paper-Runden</strong><br>
  <em>Local-first Virtual Tabletop for tabletop RPG sessions</em>
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-yellow.svg">
  <img alt="Version" src="https://img.shields.io/badge/version-0.20.28-blue.svg">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-32-47848F?logo=electron&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white">
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg">
</p>

<p align="center">
  <a href="#deutsch">🇩🇪 Deutsch</a> &nbsp;·&nbsp; <a href="#english">🇬🇧 English</a>
</p>

---

## Deutsch

BoltBerry ist ein **kostenloser, quelloffener Virtual Tabletop (VTT)**, der vollständig lokal auf deinem Rechner läuft – ohne Konto, ohne Abo, ohne Internetverbindung.

- **DM-Fenster** – vollständige Steuerung für den Spielleiter
- **Spieler-Fenster** – überträgt Karte, Token, Handouts und Effekte in Echtzeit auf einen zweiten Bildschirm
- **Wiki** – bilinguale SRD-5.1-Referenz mit 263 Monstern, 203 Gegenständen und 313 Zaubern, die direkt mit Karte, Initiative und Charakterbögen verdrahtet ist
- **SQLite-basiert** – alle Kampagnendaten lokal gespeichert, keine Cloud-Abhängigkeit
- **Mehrsprachig** – Benutzeroberfläche, Wiki-Inhalte und Spieler-Karten auf Deutsch und Englisch (DE/EN-Toggle in der Toolbar)

Gebaut mit Electron, React, TypeScript und SQLite. Läuft auf macOS, Windows und Linux.

### Aktueller Release-Stand

Version `0.20.28` enthält die zuletzt abgeschlossenen UI-/UX-Korrekturen für Toolbar, Notizen, Charaktere, Menüs, Dropdowns und Context-Menüs sowie zusätzliche Playwright-Abdeckung für Fog-of-War-Raumaktionen, DM-/Player-Synchronisierung und responsive Layout-Randfälle.

### Features

| Kategorie | Funktion |
|---|---|
| **Karten** | Bilder oder PDFs importieren; Quadrat-/Hex-Raster; Drehung; Kamerasync pro Karte; automatische Raster-Erkennung |
| **Fog of War** | Rechteck-, Polygon-, Pinsel- und Zudecken-Werkzeuge; Delta-basierte Sync zum Spieler-Bildschirm |
| **Sichtlinie (LOS)** | Ray-Casting-Algorithmus: Token mit Lichtradius enthüllen beim Ziehen automatisch den Nebel entsprechend der Wandgeometrie |
| **Wände & Türen** | Linien-Werkzeug für Sichtlinienblocker; Türen und Fenster öffenbar/schließbar |
| **Beleuchtung** | Pro-Token Lichtradius und Lichtfarbe; Beleuchtungsebene auf DM- und Spieler-Fenster |
| **Token** | Drag & Drop; TP-Leiste; AC; Statuseffekte; Markierungsringe; Sichtbarkeits-Toggle; Sperren; Fraktionen |
| **Wiki** | Bilinguale SRD-5.1-Referenz mit **263 Monstern, 203 Gegenständen und 313 Zaubern**; pro Kreatur mehrere Token-Varianten (über 13.000 insgesamt); Suche, Filter und Sortierung pro Kategorie |
| **Bevorzugtes Portrait** | Im Wiki die Lieblingsvariante pro Monster als Standard markieren — wird überall (Hero-Bild, Token-Bibliothek, Encounter-Spawn, Karte) konsistent verwendet |
| **Token-Bibliothek** | DM-Sidebar-Panel mit allen Monstern + eigenen Templates (CR / Typ / Größe); Drag-to-Map mit Formationen |
| **Wiki ↔ Gameplay** | Aus dem Wiki Monster direkt auf die Karte setzen, als Handout ans Spielerfenster senden; am Token Rechtsklick → „Im Wiki öffnen"; Initiative-Einträge haben eine Stat-Block-Schaltfläche |
| **Encounter-Builder** | Monster aus dem Wiki hinzufügen oder die aktuellen Karten-Token als wiederverwendbares Encounter speichern; Formationen und Schwierigkeitsgrade |
| **Charakterbögen** | Vollständiger D&D-5e-Charakterbogen pro Kampagne: Eigenschaftswerte, Rettungswürfe, Fertigkeiten, Angriffe, Ausrüstung, Zauberbuch (mit Wiki-Picker), Persönlichkeit, Hintergeschichte |
| **Initiative** | Sortierbarer Tracker mit Effekttimern; überträgt aktuellen Zug an Spieler-Overlay |
| **Räume** | Semantische Kartenbereiche mit Sichtbarkeit und Atmosphäre-Hinweis |
| **Zeichnungen** | Freihand, Rechteck, Kreis und Text; werden auf DM- und Spieler-Fenster angezeigt |
| **GM-Pins** | DM-only Kartenanmerkungen (nur im DM-Fenster sichtbar) |
| **Notizen** | Pro-Kampagne und pro-Karte; direkt auf die Karte anheftbar |
| **Handouts** | Bilder oder Textkarten — inkl. Wiki-Kreaturkarten, Gegenstände und Zauber — direkt ans Spielerfenster senden |
| **Kompendium** | Integrierter PDF-Viewer mit SRD 5.2.1 (DE + EN automatisch sprachgewählt), Volltextsuche, Seite zum Spielerfenster broadcasten mit zoom-synchronem Re-Send |
| **Audio** | Drei-Kanal-Mixer (Musik, Combat, SFX), Per-Map-Ambient-Track, Soundboards mit Slot-Grid, Master-Lautstärke |
| **Würfelsystem** | Schnelles Würfeln mit Verlauf, Vor-/Nachteil für d20 |
| **Wetter-FX** | Regen, Schnee, Wind und Nebel-Overlays; auf DM- und Spieler-Bildschirm sichtbar |
| **Overlays** | Titel-/Untertitel-Textoverlays für dramatische Momente |
| **Atmosphäre** | Vollbild-Bildmodus zwischen Begegnungen |
| **Undo/Redo** | Vollständige Undo-History für Fog-of-War-Operationen und Token-Bewegungen |
| **Spieler-Vorschau** | DM-seitiger Player-Eye-Modus zum Prüfen der Spieler-Perspektive |
| **Werkzeugleiste (v1 Conservative)** | Frei schwebende Left-Rail mit fünf Werkzeuggruppen, kontextbezogene Sub-Tool-Strip für aktive Tool-Optionen, kompakter Audio-Strip links unten, Novice-Beschriftungen und Auto-Hide einstellbar |
| **Befehlspalette** | Cmd/Ctrl+K für schnelle Aktionen ohne Maus |
| **Mehrsprachig** | Vollständig bilingual (DE/EN) — UI, Wiki-Inhalte, an Spieler gesendete Karten folgen der aktiven Sprache |

### Schnellstart

**Voraussetzungen:** Node.js 20+, npm 10+, **[Git LFS](https://git-lfs.com)** (für die ~13.000 Token-WebPs des Wikis)

```bash
git lfs install                                    # einmalig pro Account
git clone https://github.com/RollBerryStudios/BoltBerry.git
cd BoltBerry
git lfs pull                                       # holt die Token-Bilder
npm install
npm run dev
```

> **Hinweis:** Ohne `git lfs pull` ersetzt LFS die WebP-Dateien durch
> Pointer-Stubs. Die App erkennt das und blendet im Wiki einen Hinweis
> ein — die Stat-Blocks funktionieren trotzdem, nur die Token-Bilder
> bleiben leer.

### Builds erstellen

```bash
git lfs pull           # Token-WebPs müssen lokal vorhanden sein —
                       # electron-builder bündelt sie via extraResources
npm run build          # Nur kompilieren
npm run dist           # Installer für aktuelle Plattform
npm run dist:mac       # macOS .dmg
npm run dist:win       # Windows .exe (NSIS)
npm run dist:linux     # Linux .AppImage + .deb
```

> **Hinweis:** Ohne `git lfs pull` packt `npm run dist` 130-Byte
> Pointer-Stubs anstelle der echten WebPs in den Installer — die App
> würde im Wiki dauerhaft den „Token nicht geladen"-Hinweis zeigen.
> Der Datensatz ist nach `git lfs pull` ca. 400 MB groß.

Fertige Builds liegen in `release/` und werden automatisch als [GitHub Releases](https://github.com/RollBerryStudios/BoltBerry/releases) veröffentlicht.

### Projektstruktur

```
src/
  main/          Electron Main-Prozess (IPC, Datenbank, Fenster)
    db/          SQLite-Schema (v34) und Migrationskette
    ipc/         IPC-Handler (App, DB, Player-Bridge, Wiki-Daten)
  preload/       Context Bridge (electronAPI / playerAPI)
  renderer/      React-App (DM-Ansicht)
    components/  UI-Komponenten (Canvas-Ebenen, Sidebar-Panels, Wiki)
    stores/      Zustand-Stores (Token, Fog, Walls, Characters, …)
    utils/       Hilfsfunktionen (losEngine, fogUtils, …)
    i18n/        Übersetzungen (DE/EN)
  shared/        Gemeinsame TypeScript-Typen und IPC-Konstanten
resources/
  compendium/    SRD 5.2.1 PDFs (DE + EN)
  data/          Wiki-Datensatz: 263 Monster, 203 Gegenstände, 313 Zauber + Token-Artwork
  token-variants/  Zusätzliche Token-Varianten für die Token-Bibliothek
  icon.*         App-Icons (ICNS, ICO, PNG)
scripts/         Deployment-Hilfsskripte (Proxmox Runner-Setup, i18n-Check)
```

### Tech-Stack

| Technologie | Verwendung |
|---|---|
| Electron 32 | Desktop-Shell (cross-platform) |
| React 18 + TypeScript 5 | Benutzeroberfläche |
| Vite 5 | Renderer-Bundler |
| Zustand 5 | State-Management |
| better-sqlite3 | Lokale Datenbank (SQLite, Schema v34) |
| Konva / react-konva | Canvas-Rendering |
| i18next / react-i18next | Mehrsprachigkeit (DE/EN) |
| pdfjs-dist | PDF-Import für Karten |

### CI/CD & Releases

Builds werden vollautomatisch per GitHub Actions erstellt. Ein neues Tag (`v*.*.*`) oder ein manueller `release.yml`-Dispatch mit Tag löst den Build für alle Plattformen auf GitHub Hosted Runners aus und erstellt ein GitHub Release mit allen Installer-Dateien. Die Plattform-Builds checken mit `lfs: true` aus und verifizieren, dass keine LFS-Pointer-Stubs in den gebündelten Token-/Kompendium-Assets landen. Forks brauchen für eigene CI-Builds eigenes LFS-Bandwidth-Budget.

### Mitwirken

Beiträge sind willkommen. Bitte lies [CONTRIBUTING.md](CONTRIBUTING.md) vor dem ersten PR.

### Lizenz

App-Code: [MIT](LICENSE) © 2026 RollBerry Studios.
Gebündelte Drittanbieter-Inhalte (SRD 5.2.1 + Pflicht-Attribution + Token-
Artwork-Credits): siehe [NOTICE.md](NOTICE.md). Vollständige
Pflicht-Attribution für SRD 5.2.1 ist im App-Dialog "Über BoltBerry"
sichtbar.

---

## English

BoltBerry is a **free, open-source, offline-first Virtual Tabletop (VTT)** for tabletop RPG game masters. Runs entirely on your local machine — no accounts, no subscriptions, no internet required.

- **DM Window** — full control panel for the game master
- **Player Window** — sends map, tokens, handouts and effects to a second screen in real time
- **Wiki** — bilingual SRD 5.1 reference with 263 monsters, 203 items, and 313 spells, wired directly into the canvas, initiative, and character sheets
- **SQLite-backed** — all campaign data stored locally, no cloud dependencies
- **Multilingual** — UI, Wiki content, and cards pushed to the player follow the active language (DE/EN toggle in the toolbar)

Built with Electron, React, TypeScript and SQLite. Runs on macOS, Windows and Linux.

### Current Release State

Version `0.20.28` includes the latest UI/UX fixes for the toolbar, notes, character sheets, menus, dropdowns, and context menus, plus expanded Playwright coverage for room-based fog-of-war actions, DM/player synchronization, and responsive layout edge cases.

### Features

| Category | What you get |
|---|---|
| **Maps** | Import images or PDFs; square/hex grid; rotation; per-map camera sync; automatic grid detection |
| **Fog of War** | Rectangle, polygon, brush, and cover tools; delta-based sync to player screen |
| **Line of Sight (LOS)** | Ray-casting algorithm: tokens with a light radius automatically reveal fog on drag, clipped to wall geometry |
| **Walls & Doors** | Draw line-of-sight blockers; doors and windows can be opened/closed |
| **Lighting** | Per-token light radius and colour; lighting layer rendered on both DM and player windows |
| **Tokens** | Drag & drop; HP bar; AC; status effects; marker rings; visibility toggle; lock; factions |
| **Wiki** | Bilingual SRD 5.1 reference with **263 monsters, 203 items, and 313 spells**; multiple token variants per creature (13,000+ in total); per-category search, filters, and sort |
| **Preferred Portrait** | Mark any variant as a monster's default from the Wiki — every surface (hero image, Token Library, encounter spawn, canvas) picks the same art |
| **Token Library** | DM-sidebar panel of every monster + your own templates (CR / type / size); drag-to-map with formations |
| **Wiki ↔ Gameplay** | Spawn a monster onto the active map straight from the Wiki, push a creature/item/spell card to the player window, right-click any token → "Open in Wiki", initiative rows carry a quick stat-block button |
| **Encounter Builder** | Add monsters via the Wiki picker or save the current enemy tokens as a reusable encounter; formations and difficulty tiers |
| **Character Sheets** | Full D&D 5e sheet per campaign: ability scores, saving throws, skills, attacks, equipment, spellbook (with Wiki picker), personality, backstory |
| **Initiative** | Sortable tracker with effect timers; broadcasts current turn to player overlay |
| **Rooms** | Semantic map areas with visibility state and atmosphere hints |
| **Drawings** | Freehand, rectangle, circle and text; synced to player window |
| **GM Pins** | DM-only map annotations (never shown on player screen) |
| **Notes** | Per-campaign and per-map; pinnable directly onto the map |
| **Handouts** | Push images or text cards — including Wiki creature, item, and spell cards — directly to the player screen |
| **Compendium** | Built-in PDF viewer with SRD 5.2.1 (auto-selects DE or EN), full-text search, and live broadcast of the current page to the player window with zoom-synced re-send |
| **Audio** | Three-channel mixer (music, combat, SFX), per-map ambient track, soundboards with slot grid, master volume |
| **Dice Roller** | Quick rolls with history, advantage/disadvantage for d20 |
| **Weather FX** | Rain, snow, wind and fog overlays; visible on DM + player screens |
| **Overlays** | Title/subtitle text overlays for dramatic moments |
| **Atmosphere** | Full-screen image mode between encounters |
| **Undo/Redo** | Full undo history for fog operations and token moves |
| **Player Preview** | DM-side player-eye mode to check the player's perspective |
| **Toolbar (v1 Conservative)** | Floating left rail with five tool groups, contextual sub-tool strip for the active tool's options, compact audio strip bottom-left, optional novice labels + auto-hide |
| **Command Palette** | Cmd/Ctrl+K for fast keyboard-only actions |
| **Multilingual** | Fully bilingual (DE/EN) — UI, Wiki content, and cards sent to the player follow the active language |

### Getting Started

**Prerequisites:** Node.js 20+, npm 10+, **[Git LFS](https://git-lfs.com)** (for the ~13,000 token webps that ship with the Wiki)

```bash
git lfs install                                    # one-time per account
git clone https://github.com/RollBerryStudios/BoltBerry.git
cd BoltBerry
git lfs pull                                       # fetches the token artwork
npm install
npm run dev
```

> **Heads up:** Without `git lfs pull` the webp files in
> `resources/data/` are LFS pointer stubs. The app detects this and
> shows a one-line hint inside the Wiki — stat blocks still work, only
> the token artwork stays blank.

### Building

```bash
git lfs pull           # token webps must be local — electron-builder
                       # bundles them via extraResources
npm run build          # Compile only
npm run dist           # Package for current platform
npm run dist:mac       # macOS .dmg
npm run dist:win       # Windows .exe (NSIS)
npm run dist:linux     # Linux .AppImage + .deb
```

> **Heads up:** without `git lfs pull` the installer ships 130-byte
> pointer stubs instead of the real webps and the Wiki shows the
> "token artwork not downloaded" hint forever. The dataset is ~400 MB
> after `git lfs pull`.

Packaged output goes to `release/`. Binaries are published automatically as [GitHub Releases](https://github.com/RollBerryStudios/BoltBerry/releases).

### Project Structure

```
src/
  main/          Electron main process (IPC, database, windows)
    db/          SQLite schema (v34) and migration chain
    ipc/         IPC handlers (app, database, player bridge, wiki data)
  preload/       Context bridge (electronAPI / playerAPI)
  renderer/      React app (DM view)
    components/  UI components (canvas layers, sidebar panels, wiki)
    stores/      Zustand stores (tokens, fog, walls, characters, …)
    utils/       Utilities (losEngine, fogUtils, …)
    i18n/        Translations (DE/EN)
  shared/        Shared TypeScript types and IPC constants
resources/
  compendium/    SRD 5.2.1 PDFs (DE + EN)
  data/          Wiki dataset: 263 monsters, 203 items, 313 spells + token artwork
  token-variants/  Extra token variants for the Token Library
  icon.*         App icons (ICNS, ICO, PNG)
scripts/         Deployment helpers (Proxmox runner setup, i18n check)
```

### Tech Stack

| Technology | Usage |
|---|---|
| Electron 32 | Cross-platform desktop shell |
| React 18 + TypeScript 5 | UI |
| Vite 5 | Renderer bundler |
| Zustand 5 | State management |
| better-sqlite3 | Embedded database (SQLite, schema v34) |
| Konva / react-konva | Canvas rendering |
| i18next / react-i18next | Internationalisation (DE/EN) |
| pdfjs-dist | PDF → PNG for map import |

### CI/CD & Releases

Builds are fully automated via GitHub Actions. Pushing a tag (`v*.*.*`) or manually dispatching `release.yml` with a tag triggers platform builds on GitHub Hosted Runners and creates a GitHub Release. The platform build jobs check out with `lfs: true` and verify that bundled token/compendium assets are real files rather than LFS pointer stubs. Forks running their own CI need their own LFS bandwidth budget.

### Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

### License

App code: [MIT](LICENSE) © 2026 RollBerry Studios.
Bundled third-party content (SRD 5.2.1 + required attribution + token
artwork credits): see [NOTICE.md](NOTICE.md). The full required SRD
5.2.1 attribution is visible in the app's "About BoltBerry" dialog.
