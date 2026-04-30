# BoltBerry UI-/Action-Coverage-Matrix

Ziel: Jede produktionsrelevante, sichtbare Aktion bekommt mindestens einen automatisierten Guard. “Alles getestet” bedeutet hier: alle UI-Flächen sind inventarisiert, jede Aktion hat eine Zielklasse, und kritische Aktionen werden per Playwright über die echte Electron-UI ausgeführt.

## Aktueller automatisierter Stand

- E2E: `npm run test:e2e` ist grün (`74 passed`, Stand: 2026-04-30).
- Neuer Release-Guard: `e2e/critical-path/first-run-onboarding.spec.ts` prüft den echten Erststart bis in den Workspace.
- Neuer Demo-Guard: `e2e/critical-path/demo-production-session.spec.ts` prüft reale Demo-Map, reales Audio, Spielerfenster, Live-Session, Track-Zuweisung und Export.
- Neuer Map-Aktions-Guard: `e2e/critical-path/map-management-actions.spec.ts` prüft Karte hinzufügen, umbenennen, sortieren, Delete-Cancel, Delete-Confirm und Öffnen.
- Neuer UI-Aktions-Guard: `e2e/critical-path/top-level-actions.spec.ts` prüft Welcome, Referenzansichten, Settings, Kompendium-Cancel, Kampagnen-Workspace und Tab-Wechsel.
- Legacy-Tests wurden auf aktuelle semantische IPC-APIs migriert; die entfernte Raw-SQL-Bridge (`dbRun`, `dbQuery`, `dbRunBatch`) wird jetzt als nicht exponiert geprüft.

## Coverage-Matrix

| Bereich | Aktionen | Release-Priorität | Automatisierung |
| --- | --- | --- | --- |
| Erststart / Setup | Datenordner wählen, Weiter, Persistenz, DB-Anlage | P0 | `first-run-onboarding.spec.ts` |
| Welcome / Kampagnenliste | Profil, Wiki, Kompendium, Neue Kampagne, Import-Cancel, About, Settings, Kampagne öffnen | P0 | `first-run-onboarding.spec.ts`, `top-level-actions.spec.ts` |
| Kampagne erstellen | leerer Name deaktiviert, Whitespace, Max-Length, Escape, Enter, Trim | P0 | `first-run-onboarding.spec.ts` |
| Kampagnenzeile | Öffnen, Umbenennen, Duplizieren, Löschen/Cancel/Confirm | P0 | `campaigns.spec.ts` |
| Workspace top bar | Zurück, erste Karte importieren/cancel, Kompendium, Settings | P0 | `top-level-actions.spec.ts` |
| Workspace Tabs | Karten, Charaktere, NSC, Audio, SFX, Handouts, Notizen | P0 | `top-level-actions.spec.ts` |
| Kartenmanagement | Import, Öffnen, Umbenennen, Reihenfolge, Löschen, Cancel/Confirm | P0 | `map-management-actions.spec.ts`, `demo-production-session.spec.ts` |
| Canvas / Toolbar | Werkzeuge, Zoom, Grid, Fog, Draw, Measure, Token, Rooms, Undo/Redo | P0 | Bestehende Tests prüfen, danach UI-driven Spec ergänzen |
| Player Window | Öffnen, Sync, Karte/Token/Fog/Handout-Anzeige, Schließen | P0 | `player-window.spec.ts`, `two-window-sync.spec.ts`, `demo-production-session.spec.ts` |
| Wiki / Bestiarium | Monster/Gegenstände/Zauber Tabs, Suche, Filter, Detail, Clone/Edit/Delete, Export/Import-Cancel | P1 | Top-Level-Tabs abgedeckt, CRUD folgt |
| Kompendium | Öffnen, Suche, PDF-Liste, Import-Cancel, Folder-Button, About, Settings, PDF-Navigation | P1 | Einstieg/Cancel abgedeckt, PDF-Navigation folgt |
| Globale Einstellungen | Speicher, Darstellung, Profil, Datei, Über, Theme, Sprache, Toggles, Datenordner-Cancel | P0/P1 | Sektionen abgedeckt, Eingaben/Toggles folgen |
| Audio / SFX | Audio-Ordner importieren, Track-Zuweisung, Board anlegen, Slot belegen, Preview, Hotkeys | P1 | Audio-Ordner/Zuweisung in `demo-production-session.spec.ts`; SFX-Board/Slot folgt |
| Handouts / Notizen | CRUD, Markdown, Senden an Player, Löschen | P1 | Reachability abgedeckt, Funktionsspec folgt |
| Charaktere / NSC | Erstellen, Editieren, Wiki-Auswahl, Speichern, Löschen | P1 | Reachability abgedeckt, Funktionsspec folgt |
| Responsiveness / UI/UX | Desktop 1100x700, weitere Breakpoints, kein Text-Overlap, Modalfokus | P0/P1 | Manuelle Sichtprüfung begonnen, Playwright-Screenshots folgen |
| Packaging / Release | LFS Pointer, Fuses, notarization/signing, asset completeness | P0 | Pack/Fuses geprüft; LFS-Check muss erweitert werden |

## Noch nicht vollständig automatisiert

- SFX-Board: Board anlegen, Slot importieren, Slot abspielen, Hotkeys.
- Charaktere/NSC: Charakterbogen erstellen, editieren, löschen; NSC aus Wiki übernehmen.
- Handouts: Bild/Text-Handout erstellen, an Spieler senden, Broadcast stoppen, löschen.
- Notizen: CRUD, Markdown, Tags/Suche.
- Kompendium-PDF: echtes PDF importieren, Suche, Seitenwechsel, Zoom, Send-to-player.
- Responsiveness/Visual QA: Desktop- und kleinere Viewports mit Screenshot-Vergleich und Overlap-Checks.
- Accessibility: mehrere Icon-Buttons haben weiterhin nur `title` oder Symboltext statt robuste `aria-label`s.

## Produktionsrisiken, die noch geschlossen werden müssen

- “Alle Aktionen” ist noch nicht erreicht; die P0-Flows sind automatisiert, mehrere P1/P2-Featurepanels brauchen noch dedizierte Specs.
- Release-Asset-Integrität sollte weiter über LFS-/Magic-Byte-/Bundle-Checks abgesichert werden.
