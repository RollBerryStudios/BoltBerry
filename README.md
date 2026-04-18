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
  <img alt="Version" src="https://img.shields.io/badge/version-0.19.20-blue.svg">
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
- **SQLite-basiert** – alle Kampagnendaten lokal gespeichert, keine Cloud-Abhängigkeit
- **Mehrsprachig** – Benutzeroberfläche auf Deutsch und Englisch (DE/EN-Toggle in der Toolbar)

Gebaut mit Electron, React, TypeScript und SQLite. Läuft auf macOS, Windows und Linux.

### Features

| Kategorie | Funktion |
|---|---|
| **Karten** | Bilder oder PDFs importieren; Quadrat-/Hex-Raster; Drehung; Kamerasync pro Karte |
| **Fog of War** | Rechteck-, Polygon-, Pinsel- und Zudecken-Werkzeuge; Delta-basierte Sync zum Spieler-Bildschirm |
| **Sichtlinie (LOS)** | Ray-Casting-Algorithmus: Token mit Lichtradius enthüllen beim Ziehen automatisch den Nebel entsprechend der Wandgeometrie |
| **Wände & Türen** | Linien-Werkzeug für Sichtlinienblocker; Türen und Fenster öffenbar/schließbar |
| **Beleuchtung** | Pro-Token Lichtradius und Lichtfarbe; Beleuchtungsebene auf DM- und Spieler-Fenster |
| **Token** | Drag & Drop; TP-Leiste; AC; Statuseffekte; Markierungsringe; Sichtbarkeits-Toggle; Sperren; Fraktionen |
| **Charakterbögen** | Vollständiger D&D-5e-Charakterbogen pro Kampagne: Eigenschaftswerte, Rettungswürfe, Fertigkeiten, Angriffe, Ausrüstung, Persönlichkeit, Hintergeschichte |
| **Initiative** | Sortierbarer Tracker mit Effekttimern; überträgt aktuellen Zug an Spieler-Overlay |
| **Begegnungen** | Wiederverwendbare Spawn-Templates mit Formationen und Schwierigkeitsgraden |
| **Räume** | Semantische Kartenbereiche mit Sichtbarkeit und Atmosphäre-Hinweis |
| **Zeichnungen** | Freihand, Rechteck, Kreis und Text; werden auf DM- und Spieler-Fenster angezeigt |
| **GM-Pins** | DM-only Kartenanmerkungen (nur im DM-Fenster sichtbar) |
| **Notizen** | Pro-Kampagne und pro-Karte |
| **Handouts** | Bilder oder Textkarten direkt an den Spieler-Bildschirm senden |
| **Audio** | Playlist-Manager für Hintergrundmusik (MP3/OGG/WAV): Play/Pause/Stop, Vor-/Zurück-Navigation, Seek-Leiste, Lautstärke, Schleifenmodus, Titel hinzufügen/entfernen |
| **Würfelsystem** | Schnelles Würfeln mit Verlauf, Vor-/Nachteil für d20 |
| **Wetter-FX** | Regen, Schnee, Wind und Nebel-Overlays auf dem Spieler-Bildschirm |
| **Overlays** | Titel-/Untertitel-Textoverlays für dramatische Momente |
| **Atmosphäre** | Vollbild-Bildmodus zwischen Begegnungen |
| **Undo/Redo** | Vollständige Undo-History für Fog-of-War-Operationen und Token-Bewegungen |
| **Spieler-Vorschau** | DM-seitiger Player-Eye-Modus zum Prüfen der Spieler-Perspektive |

### Schnellstart

**Voraussetzungen:** Node.js 20+, npm 10+

```bash
git clone https://github.com/RollBerry-Studios/BoltBerry.git
cd BoltBerry
npm install
npm run dev
```

### Builds erstellen

```bash
npm run build          # Nur kompilieren
npm run dist           # Installer für aktuelle Plattform
npm run dist:mac       # macOS .dmg
npm run dist:win       # Windows .exe (NSIS)
npm run dist:linux     # Linux .AppImage + .deb
```

Fertige Builds liegen in `release/` und werden automatisch als [GitHub Releases](https://github.com/RollBerry-Studios/BoltBerry/releases) veröffentlicht.

### Projektstruktur

```
src/
  main/          Electron Main-Prozess (IPC, Datenbank, Fenster)
    db/          SQLite-Schema (v20) und Migrationskette
    ipc/         IPC-Handler (App, DB, Player-Bridge)
  preload/       Context Bridge (electronAPI / playerAPI)
  renderer/      React-App (DM-Ansicht)
    components/  UI-Komponenten (Canvas-Ebenen, Sidebar-Panels)
    stores/      Zustand-Stores (Token, Fog, Walls, Characters, …)
    utils/       Hilfsfunktionen (losEngine, fogUtils, …)
    i18n/        Übersetzungen (DE/EN)
  shared/        Gemeinsame TypeScript-Typen und IPC-Konstanten
resources/       App-Icons (ICNS, ICO, PNG)
scripts/         Deployment-Hilfsskripte (Proxmox Runner-Setup)
```

### Tech-Stack

| Technologie | Verwendung |
|---|---|
| Electron 32 | Desktop-Shell (cross-platform) |
| React 18 + TypeScript 5 | Benutzeroberfläche |
| Vite 5 | Renderer-Bundler |
| Zustand 5 | State-Management |
| better-sqlite3 | Lokale Datenbank (SQLite, Schema v20) |
| Konva / react-konva | Canvas-Rendering |
| i18next / react-i18next | Mehrsprachigkeit (DE/EN) |
| pdfjs-dist | PDF-Import für Karten |

### CI/CD & Releases

Builds werden vollautomatisch per GitHub Actions erstellt. Ein neues Tag (`v*.*.*`) löst den Build für alle Plattformen aus und erstellt ein GitHub Release mit allen Installer-Dateien. Proxmox-VMs können als Self-Hosted Runners eingebunden werden – Setup-Script: [`scripts/setup-proxmox-runner.sh`](scripts/setup-proxmox-runner.sh).

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
- **SQLite-backed** — all campaign data stored locally, no cloud dependencies
- **Multilingual** — UI available in German and English (DE/EN toggle in the toolbar)

Built with Electron, React, TypeScript and SQLite. Runs on macOS, Windows and Linux.

### Features

| Category | What you get |
|---|---|
| **Maps** | Import images or PDFs; square/hex grid; rotation; per-map camera sync |
| **Fog of War** | Rectangle, polygon, brush, and cover tools; delta-based sync to player screen |
| **Line of Sight (LOS)** | Ray-casting algorithm: tokens with a light radius automatically reveal fog on drag, clipped to wall geometry |
| **Walls & Doors** | Draw line-of-sight blockers; doors and windows can be opened/closed |
| **Lighting** | Per-token light radius and colour; lighting layer rendered on both DM and player windows |
| **Tokens** | Drag & drop; HP bar; AC; status effects; marker rings; visibility toggle; lock; factions |
| **Character Sheets** | Full D&D 5e sheet per campaign: ability scores, saving throws, skills, attacks, equipment, personality, backstory |
| **Initiative** | Sortable tracker with effect timers; broadcasts current turn to player overlay |
| **Encounters** | Reusable spawn templates with formation and difficulty options |
| **Rooms** | Semantic map areas with visibility state and atmosphere hints |
| **Drawings** | Freehand, rectangle, circle and text; synced to player window |
| **GM Pins** | DM-only map annotations (never shown on player screen) |
| **Notes** | Per-campaign and per-map |
| **Handouts** | Send images or text cards to the player screen |
| **Audio** | Playlist manager for background music (MP3/OGG/WAV): play/pause/stop, prev/next, seek bar, volume, loop mode, add/remove tracks |
| **Dice Roller** | Quick rolls with history, advantage/disadvantage for d20 |
| **Weather FX** | Rain, snow, wind and fog overlays on the player screen |
| **Overlays** | Title/subtitle text overlays for dramatic moments |
| **Atmosphere** | Full-screen image mode between encounters |
| **Undo/Redo** | Full undo history for fog operations and token moves |
| **Player Preview** | DM-side player-eye mode to check the player's perspective |

### Getting Started

**Prerequisites:** Node.js 20+, npm 10+

```bash
git clone https://github.com/RollBerry-Studios/BoltBerry.git
cd BoltBerry
npm install
npm run dev
```

### Building

```bash
npm run build          # Compile only
npm run dist           # Package for current platform
npm run dist:mac       # macOS .dmg
npm run dist:win       # Windows .exe (NSIS)
npm run dist:linux     # Linux .AppImage + .deb
```

Packaged output goes to `release/`. Binaries are published automatically as [GitHub Releases](https://github.com/RollBerry-Studios/BoltBerry/releases).

### Project Structure

```
src/
  main/          Electron main process (IPC, database, windows)
    db/          SQLite schema (v20) and migration chain
    ipc/         IPC handlers (app, database, player bridge)
  preload/       Context bridge (electronAPI / playerAPI)
  renderer/      React app (DM view)
    components/  UI components (canvas layers, sidebar panels)
    stores/      Zustand stores (tokens, fog, walls, characters, …)
    utils/       Utilities (losEngine, fogUtils, …)
    i18n/        Translations (DE/EN)
  shared/        Shared TypeScript types and IPC constants
resources/       App icons (ICNS, ICO, PNG)
scripts/         Deployment helpers (Proxmox runner setup)
```

### Tech Stack

| Technology | Usage |
|---|---|
| Electron 32 | Cross-platform desktop shell |
| React 18 + TypeScript 5 | UI |
| Vite 5 | Renderer bundler |
| Zustand 5 | State management |
| better-sqlite3 | Embedded database (SQLite, schema v20) |
| Konva / react-konva | Canvas rendering |
| i18next / react-i18next | Internationalisation (DE/EN) |
| pdfjs-dist | PDF → PNG for map import |

### CI/CD & Releases

Builds are fully automated via GitHub Actions. Pushing a tag (`v*.*.*`) triggers platform builds and creates a GitHub Release. Proxmox VMs can be registered as self-hosted runners — see [`scripts/setup-proxmox-runner.sh`](scripts/setup-proxmox-runner.sh).

### Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

### License

App code: [MIT](LICENSE) © 2026 RollBerry Studios.
Bundled third-party content (SRD 5.2.1 + required attribution + token
artwork credits): see [NOTICE.md](NOTICE.md). The full required SRD
5.2.1 attribution is visible in the app's "About BoltBerry" dialog.
