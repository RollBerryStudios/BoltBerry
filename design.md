# RollBerry Suite Design

Status: verbindliche Umsetzungsvorgabe
Geltungsbereich: BardBerry, NoteBerry, CharBerry, BoltBerry
Datum: 2026-05-06

Diese Datei definiert das gemeinsame Designsystem und den konkreten Umsetzungsplan für alle RollBerry-Apps. Sie ist keine Ideensammlung. Alle Punkte in diesem Dokument sind Entscheidungen.

## Zielbild

Alle vier Apps sollen sich wie Mitglieder einer professionellen RollBerry-Suite anfühlen: gleiche Bedienlogik, gleiche Grundstruktur, gleiche Settings, gleiche Typografie, gleiche Abstände, gleiche Zustände. Unterschiede zwischen den Apps sind nur Logo, Akzentpalette, Fachworkflow und app-spezifische Inhalte.

Die Gestaltung orientiert sich stark an Apples Human Interface Guidelines, ohne macOS blind zu kopieren. Die Apps bleiben Electron-Apps mit eigenständigem RollBerry-Charakter. HIG wird als Qualitätsstandard für Klarheit, Hierarchie, Feedback, Accessibility, Sidebars, Toolbars und konsistente Controls verwendet.

Verbindliche Referenzen:

- Apple HIG: https://developer.apple.com/design/human-interface-guidelines
- Toolbars: https://developer.apple.com/design/human-interface-guidelines/toolbars
- Sidebars: https://developer.apple.com/design/human-interface-guidelines/sidebars
- Color: https://developer.apple.com/design/human-interface-guidelines/color
- Typography: https://developer.apple.com/design/human-interface-guidelines/typography
- Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Feedback: https://developer.apple.com/design/human-interface-guidelines/feedback
- Buttons: https://developer.apple.com/design/human-interface-guidelines/buttons

## Nicht Verhandelbar

1. Deutsch ist die Standardsprache.
2. Dark Mode ist der Standardmodus.
3. Jede App hat oben rechts einen Settings-Button mit Zahnrad-Icon.
4. Settings enthalten immer Sprache, Theme, GitHub-Link, RollBerry Studios, Kontaktmail `kontakt@rollberry.de`.
5. Jede App zeigt nur ein eigenes Logo und eine eigene Akzentpalette. Das Grundlayout bleibt suite-einheitlich.
6. UI-Controls verwenden bekannte Symbole oder Lucide-Icons. Textbuttons sind nur für klare Befehle erlaubt.
7. Kategorie-Emojis sind nur für Notizkategorien, NoteBerry-Templates und BoltBerry-Notizmarker erlaubt. Sie ersetzen keine Toolbar- oder Settings-Icons.
8. Keine dekorativen Gradient-Orbs, Bokeh-Flächen, übergroßen Marketing-Heroes oder Karten-in-Karten.
9. Keine negativen Letter-Spacings. Schriftgrößen skalieren nicht mit der Viewport-Breite.
10. Keine UI darf bei 390 px, 700 px, 900 px, 1280 px oder 1440 px Breite überlaufen, verdecken oder unlesbar werden.
11. Alle Iconbuttons haben `aria-label`, `title` und sichtbaren Fokus.
12. Bestehende Nutzerdaten, lokale Datenbanken und gespeicherte Projekte dürfen durch den Design-Rollout nicht migriert oder verändert werden.
13. Geschäftslogik bleibt unverändert, außer eine UI-Korrektur benötigt eine minimale, getestete Adapterfunktion.
14. Public macOS Go-live ist erst erlaubt, wenn Code Signing und Notarization gelöst sind. Designfreigabe ersetzt keine Release-Signaturfreigabe.

## Gemeinsame Struktur

Jede App bekommt dieselbe Produktarchitektur:

- Titlebar: Logo, App-Name, aktueller Kontext, Settings.
- Primary Toolbar: globale Aktionen und Modi.
- Sidebar links: Navigation, Listen, Bibliotheken oder Kategorien.
- Content Area: Hauptworkflow.
- Inspector rechts: Details, Eigenschaften, Kontextaktionen. Nur anzeigen, wenn sinnvoll.
- Modal/Popover Layer: Settings, Template-Auswahl, Import, Bestätigung.
- Status/Feedback: Toasts, Inline-Fehler, leere Zustände.

Die genaue Anordnung pro App:

| App | Primärer Workflow | Linke Fläche | Hauptfläche | Rechte Fläche |
| --- | --- | --- | --- | --- |
| BardBerry | Audio, Ambience, SFX | Szenen, Presets, Bibliothek | Mixer und aktive Soundlandschaft | Details, Metadaten, Export/Import |
| NoteBerry | DnD-Notizen | Kategorien und Notizliste | Editor | Preview, Template-Info, Verknüpfungen |
| CharBerry | Charakterverwaltung | Charakterliste | Charakterbogen | Kontext: Ausrüstung, Zauber, Notizen |
| BoltBerry | VTT-Spielleitung | Kampagne, Assets, Notes, Encounter | Canvas | Kontextpanel: Auswahl, Token, Map, Audio |

## Dateistruktur

Da die Apps aktuell getrennte Repos sind, gibt es zunächst kein gemeinsames Package. Stattdessen bekommt jede App dieselbe lokale Designsystem-Datei.

Zielpfade:

- BardBerry: `src/renderer/styles/rollberry-tokens.css`, importiert am Anfang von `src/renderer/styles.css`
- NoteBerry: `src/renderer/styles/rollberry-tokens.css`, importiert am Anfang von `src/renderer/styles.css`
- CharBerry: `src/renderer/styles/rollberry-tokens.css`, importiert am Anfang von `src/renderer/styles.css`
- BoltBerry: `src/renderer/styles/rollberry-tokens.css`, importiert am Anfang von `src/renderer/styles/globals.css`

Bestehende CSS-Dateien bleiben zuerst erhalten. Der Rollout ersetzt alte Werte schrittweise durch Tokens. Nach Abschluss dürfen alte ungenutzte Variablen entfernt werden.

Gemeinsame Klassen bekommen das Prefix `rb-`.

Pflichtklassen:

- `rb-app-shell`
- `rb-titlebar`
- `rb-toolbar`
- `rb-sidebar`
- `rb-inspector`
- `rb-content`
- `rb-button`
- `rb-icon-button`
- `rb-segmented`
- `rb-list`
- `rb-list-row`
- `rb-field`
- `rb-input`
- `rb-select`
- `rb-textarea`
- `rb-modal`
- `rb-popover`
- `rb-empty-state`
- `rb-template-picker`
- `rb-settings`

App-spezifische Klassen dürfen bleiben, müssen aber auf die gemeinsamen Tokens referenzieren.

## Design Tokens

Diese Variablen sind die gemeinsame Basis. Namen dürfen nicht pro App verändert werden.

```css
:root {
  color-scheme: dark;

  --rb-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --rb-font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;

  --rb-bg: #0b0c0f;
  --rb-surface: #14161b;
  --rb-surface-2: #1c2027;
  --rb-surface-3: #252a33;
  --rb-overlay: rgba(20, 22, 27, 0.94);
  --rb-line: #343a46;
  --rb-line-soft: rgba(255, 255, 255, 0.10);

  --rb-text: #f5f5f7;
  --rb-text-2: #c7c7cc;
  --rb-text-3: #8e8e93;
  --rb-text-inverse: #0b0c0f;

  --rb-focus: var(--rb-app-focus);
  --rb-accent: var(--rb-app-accent);
  --rb-accent-2: var(--rb-app-accent-2);
  --rb-accent-soft: color-mix(in srgb, var(--rb-app-accent) 18%, transparent);

  --rb-success: #34c759;
  --rb-warning: #ffb340;
  --rb-danger: #ff453a;
  --rb-info: #64d2ff;

  --rb-space-1: 4px;
  --rb-space-2: 8px;
  --rb-space-3: 12px;
  --rb-space-4: 16px;
  --rb-space-5: 20px;
  --rb-space-6: 24px;
  --rb-space-8: 32px;

  --rb-radius-sm: 4px;
  --rb-radius: 6px;
  --rb-radius-lg: 8px;

  --rb-titlebar-h: 52px;
  --rb-toolbar-h: 44px;
  --rb-control-h: 34px;
  --rb-icon-button: 34px;
  --rb-row-h: 40px;

  --rb-shadow-popover: 0 18px 48px rgba(0, 0, 0, 0.38);
  --rb-shadow-modal: 0 28px 80px rgba(0, 0, 0, 0.48);
  --rb-transition: 150ms ease;
}

[data-theme="light"] {
  color-scheme: light;

  --rb-bg: #f5f5f7;
  --rb-surface: #ffffff;
  --rb-surface-2: #f0f1f4;
  --rb-surface-3: #e6e8ed;
  --rb-overlay: rgba(255, 255, 255, 0.94);
  --rb-line: #d6d8df;
  --rb-line-soft: rgba(0, 0, 0, 0.10);

  --rb-text: #1d1d1f;
  --rb-text-2: #515154;
  --rb-text-3: #6e6e73;
  --rb-text-inverse: #ffffff;
}
```

App-Paletten:

```css
/* BardBerry */
:root {
  --rb-app-accent: #69d786;
  --rb-app-accent-2: #f0b64a;
  --rb-app-focus: #68c7c3;
}

/* NoteBerry */
:root {
  --rb-app-accent: #3f9f6b;
  --rb-app-accent-2: #4f7db8;
  --rb-app-focus: #4f7db8;
}

/* CharBerry */
:root {
  --rb-app-accent: #d85d69;
  --rb-app-accent-2: #d7b45f;
  --rb-app-focus: #6fb7c8;
}

/* BoltBerry */
:root {
  --rb-app-accent: #ffc62e;
  --rb-app-accent-2: #2f6bff;
  --rb-app-focus: #2f6bff;
}
```

## Control-Regeln

Buttons:

- Primärbutton: eine Hauptaktion pro Panel.
- Sekundärbutton: neutrale Aktion.
- Ghostbutton: leise Aktion.
- Dangerbutton: destruktive Aktion, immer mit Bestätigung, wenn Daten verloren gehen.
- Iconbutton: quadratisch, `34px`, Icon zentriert, kein Text.

Segmented Controls:

- Theme, Sprache, Modi, Tabs und Filtergruppen verwenden Segmented Controls.
- Keine Selectbox für zwei Optionen.

Formulare:

- Labels stehen über Inputs.
- Hilfetext steht unter dem Label, nicht als Placeholder.
- Placeholder ist Beispieltext, keine Erklärung.
- Inline-Fehler stehen direkt unter dem Feld.

Listen:

- Listenreihen haben feste Mindesthöhe.
- Aktive Reihe hat Akzentindikator links oder ruhigen Akzenthintergrund.
- Sekundärinfos sind einzeilig mit Ellipsis.
- Rechtsbündige Actions erscheinen nur, wenn der Row-Hover oder Fokus aktiv ist.

Modals:

- Maximalbreite: `640px`, außer Settings.
- Settings verwenden Split-View: links Sections, rechts Inhalt.
- Escape schließt Modal, außer bei destruktivem Confirm.
- Fokus bleibt im Modal gefangen.

## Notizen Und Templates

NoteBerry und BoltBerry verwenden dieselbe Kategorie- und Template-Sprache.

Pflichtkategorien:

| Kategorie | Emoji | Zweck |
| --- | --- | --- |
| Allgemein | 📜 | Sessionlog, freie Kampagnennotiz |
| NSCs | 🧑 | Personen, Stimmen, Motive, Geheimnisse |
| Orte | 🗺️ | Locations, Räume, Eindrücke, Hinweise |
| Quests | ⚔️ | Ziele, Stakes, Fristen, Belohnungen |
| Gegenstände | 🎒 | Magische Items, Artefakte, Hinweise |
| Lore | 📜 | Weltwissen, Gerüchte, Wahrheiten |
| Regeln | 🎲 | Tischentscheidungen, Hausregeln |
| Handouts | 📣 | Spielertexte, Briefe, Fundstücke |
| Sonstiges | 📌 | Alles, was bewusst keine Kategorie braucht |

Pflichttemplates:

1. Blank Note: leere Notiz ohne Inhalt, erstes Template in jeder Auswahl.
2. Sitzung: Prep-Snapshot, Laufzettel, Während des Spiels, Nach dem Spiel.
3. NSC: Erscheinung, Avatar-Bild, Stimme, Motiv, Geheimnis, Beziehung.
4. Ort: erster Eindruck, Sinne, fantastische Aspekte, Gefahren, Schätze, Ausgänge.
5. Quest: Aufhänger, Ziel, Einsatz, Frist, Hinweise, Komplikation, Belohnung.
6. Gegenstand: Erscheinung, Avatar-Bild, Mechanik, Limits, Fluch/Preis, Ursprung.
7. Lore: Wahrheit, falscher Glaube, Quelle, Enthüllung, Konsequenz.
8. Regel: Situation, Tischentscheidung, Kurzfassung, Sonderfälle, Review-Datum.
9. Handout: Spielertext zuerst, danach SL-Notizen und Verknüpfungen.

Anzeige:

- Template-Auswahl ist kompakt, nicht kartenlastig.
- Jedes Template zeigt Emoji, Label und maximal eine kurze Hint-Zeile.
- Blank Note ist visuell neutral und immer zuerst.
- Neue Notiz übernimmt Kategorie, Emoji und Tags aus dem Template.
- BoltBerry-Map-Marker nutzen standardmäßig das Emoji der Kategorie.
- BoltBerry-Map-Marker erlauben optional ein eigenes Symbol, ohne die Kategorie zu ändern.
- NoteBerry und BoltBerry müssen dieselben deutschen Begriffe verwenden.

## App-Spezifische Vorgaben

### BardBerry

BardBerry ist ein Audio-Arbeitsplatz. Die Oberfläche muss ruhig, scanbar und live-tauglich sein.

Pflichtänderungen:

- Titlebar auf RollBerry-Standard bringen.
- Mixer in klare Kanalreihen mit einheitlichen Slidern umbauen.
- SFX als kompakte Pads, nicht als dekorative Kartenfläche.
- Library mit Suchfeld, Filterchips und Listenreihen.
- Live/Preview-Zustände deutlich, aber nicht grell markieren.
- Keine großen Hintergrundtexturen hinter Audio-Controls.

Akzentnutzung:

- Grün für aktive/spielende Zustände.
- Gold nur für primäre Aktionen oder besondere Presets.
- Cyan nur für Fokus oder technische Auswahl.

### NoteBerry

NoteBerry ist die Referenz für die minimalistische Notiz-UX.

Pflichtänderungen:

- Drei-Flächen-Logik: Kategorien/Notizliste, Editor, Preview/Inspector.
- Mobile und schmale Breiten wechseln zu Tabs oder Drawer.
- Neuer-Notiz-Flow startet mit Kategorie und Template, Blank Note ist immer sichtbar.
- Editor bleibt ruhig: keine Card-Umrahmung um den Schreibbereich.
- Preview ist optional und darf den Editor nicht verdrängen.
- Notizkategorien zeigen Emojis konsequent in Liste, Picker und Template.

### CharBerry

CharBerry ist ein formularlastiger Charakterbogen. Es muss wie ein ruhiges, präzises Arbeitsformular wirken.

Pflichtänderungen:

- Linke Roster-Sidebar vereinheitlichen.
- Charakterkopf kompakter machen: Name, Klasse, Level, Status, wichtigste Aktionen.
- Attribute, Skills, Saves, Kampfwerte in dichten, stabilen Modulen.
- Inputs, Steppers, Selects und Toggles auf gemeinsame Control-Regeln bringen.
- Tabs für große Bereiche verwenden, keine tief verschachtelten Karten.
- Notizen und Backstory als Schreibbereiche, nicht als dekorative Panels.

### BoltBerry

BoltBerry ist eine DM-Workbench. Die Canvas ist das Produktzentrum und darf nicht durch Chrome verdrängt werden.

Pflichtänderungen:

- Bestehenden Canvas-Fokus erhalten.
- Titlebar, Settings und globale Controls auf RollBerry-Standard bringen.
- Top-Toolbar weiter reduzieren: nur Navigation, Session, View und globale Aktionen.
- Linkes Tooldock behalten, aber Icons, aktive Zustände, Tooltips und Abstände vereinheitlichen.
- Linke Sidebar für Quellen/Listen, rechte Sidebar für Kontext/Inspector verwenden.
- Notizen mit NoteBerry harmonisieren.
- Notizmarker übernehmen Kategorie-Emoji als Default.
- Player View bleibt eigenständig und immersiv. Dort keine RollBerry-App-Shell einführen.

Akzentnutzung:

- Gelb ist Primary Action und Energie, maximal sparsam einsetzen.
- Blau ist Auswahl, Fokus und Struktur.
- HP, Faktion, Gefahr und Initiative verwenden semantische Farben, nicht die Brandfarben.

## Responsiveness

Pflicht-Breakpoints:

| Breite | Verhalten |
| --- | --- |
| ab 1280 px | volle Desktop-Struktur mit Sidebars |
| 900 bis 1279 px | kompakte Sidebars, Icons priorisieren, Labels kürzen |
| 700 bis 899 px | rechte Inspector-Fläche wird Drawer oder Tab |
| unter 700 px | einspaltige Hauptansicht, Navigation als Drawer/Sheet |
| 390 px | keine horizontalen Überläufe, keine abgeschnittenen Buttons |

Zu prüfen sind mindestens:

- 1440 x 900
- 1280 x 720
- 900 x 700
- 700 x 900
- 390 x 844

Für BoltBerry zusätzlich:

- Canvas darf bei Sidebar-Wechsel nicht springen.
- Tooldock darf weder Token noch Marker dauerhaft verdecken.
- HUDs dürfen einander nicht überlagern.

## Accessibility

Akzeptanzkriterien:

- Textkontrast mindestens 4.5:1.
- UI-Grenzen und Fokus mindestens 3:1.
- Jede Aktion ist per Tastatur erreichbar.
- Fokusreihenfolge folgt visueller Reihenfolge.
- Toolbars nutzen sinnvolle `role="toolbar"` und `aria-label`.
- Iconbuttons haben `aria-label` und `title`.
- Inputs haben sichtbare Labels.
- Modals haben `role="dialog"`, `aria-modal="true"` und Fokusfalle.
- Keine Information wird nur über Farbe vermittelt.
- Hover-Zustände haben immer Fokus-Äquivalent.
- `prefers-reduced-motion` deaktiviert nicht notwendige Animation.

## Actionplan

Der Rollout erfolgt streng phasenweise. Eine Phase gilt erst als abgeschlossen, wenn alle Gates dieser Phase erfüllt sind.

### Phase 0: Baseline Sichern

1. In jedem Repo `git status --short` prüfen.
2. Keine fremden Änderungen überschreiben.
3. Branch pro Repo anlegen: `codex/rollberry-design-system`.
4. Aktuelle Screenshots erstellen:
   - BardBerry: Desktop DE dark, responsive DE dark, Settings.
   - NoteBerry: Desktop DE dark, Template-Auswahl, responsive Editor, Settings.
   - CharBerry: Desktop DE dark, Charakterbogen, responsive Tabs, Settings.
   - BoltBerry: Campaign View, Canvas mit Sidebars, Notes Panel, Settings, Player View.
5. Ergebnisse unter `/Users/pdietric/GitHub/rollberry-qa-artifacts/YYYY-MM-DD-design-baseline/` speichern.
6. Baseline-Tests ausführen.

Baseline-Kommandos:

```bash
# BardBerry, NoteBerry, CharBerry
npm run typecheck
npm run quality
npm run pack

# BoltBerry
npm run lint
npm run check:all
npm run build
npm run test:e2e
npm run test:e2e:visual
npm run pack
```

### Phase 1: Tokens Einführen

1. `rollberry-tokens.css` in allen Apps anlegen.
2. Token-Datei in die bestehende globale CSS-Datei importieren.
3. App-Palette je App setzen.
4. Alte Variablen auf neue Tokens mappen.
5. Noch keine Layoutstruktur ändern.
6. Tests ausführen.
7. Screenshots mit Baseline vergleichen.
8. Commit pro Repo: `Add RollBerry design tokens`.

Gate:

- App startet.
- Theme bleibt Dark per Default.
- Sprache bleibt Deutsch per Default.
- Keine offensichtlichen Farbkontrastregressionen.
- Keine visuellen Verschiebungen größer als reine Farb-/Tokenänderungen.

### Phase 2: Gemeinsame Controls

1. Buttons, Iconbuttons, Inputs, Selects, Textareas, Segmented Controls vereinheitlichen.
2. Fokuszustände und Disabled-Zustände vereinheitlichen.
3. Settings-Button und Settings-Modal auf gemeinsame Struktur bringen.
4. GitHub, RollBerry Studios und `kontakt@rollberry.de` in Settings prüfen.
5. Modals und Popovers auf gemeinsame Schatten, Radius und Fokusfalle bringen.
6. Tests und Screenshots ausführen.
7. Commit pro Repo: `Unify RollBerry controls`.

Gate:

- Keine Buttontexte laufen über.
- Iconbuttons sind quadratisch.
- Settings ist per Maus und Tastatur vollständig bedienbar.
- Externe Links sind allowlisted und öffnen nicht unkontrolliert fremde URLs.

### Phase 3: App-Shell Vereinheitlichen

Reihenfolge:

1. NoteBerry
2. CharBerry
3. BardBerry
4. BoltBerry

Begründung:

- NoteBerry liefert die minimalistische Notizreferenz.
- CharBerry validiert formularlastige Controls.
- BardBerry validiert dichte Mediensteuerung.
- BoltBerry kommt zuletzt, weil Canvas, Sidebars, Player View und Tooldock den größten Regression-Radius haben.

Arbeitsschritte je App:

1. Titlebar auf RollBerry-Standard.
2. Toolbar auf globale Aktionsgruppen reduzieren.
3. Sidebar/Content/Inspector-Struktur angleichen.
4. Empty States und Toasts vereinheitlichen.
5. Responsive Breakpoints umsetzen.
6. Playwright-Screenshots neu erstellen.
7. Tests ausführen.
8. Commit pro App: `Apply RollBerry app shell`.

Gate:

- Kein Workflow braucht mehr Klicks als vorher, außer ein alter unklarer Schritt wird bewusst durch eine explizite Auswahl ersetzt.
- Wichtigste Aktion pro Screen ist innerhalb von zwei Sekunden visuell erkennbar.
- Keine UI-Fläche wirkt wie eine Landingpage.
- Keine verschachtelten Karten.

### Phase 4: Notizsystem Harmonisieren

Betroffene Apps:

- NoteBerry
- BoltBerry

Arbeitsschritte:

1. Kategorienliste exakt synchronisieren.
2. Template-Inhalte exakt synchronisieren.
3. Blank Note als erste Option prüfen.
4. Kategorie-Emojis in Kategorie-Picker, Notizliste, Template-Picker anzeigen.
5. BoltBerry-Map-Marker: Kategorie-Emoji als Default setzen.
6. BoltBerry-Map-Marker: Custom-Symbol als Override erhalten.
7. Tests für Template-Erzeugung und Marker-Icon ergänzen oder aktualisieren.
8. Commit: `Harmonize RollBerry note templates`.

Gate:

- Eine neue NSC-Notiz enthält Erscheinung, Avatar-Bild, Stimme, Motivation und Geheimnis.
- Eine neue Quest-Notiz enthält Ziel, Einsatz, Frist, Hinweise und Belohnung.
- Eine Blank Note ist wirklich leer.
- BoltBerry-Marker zeigen ohne Custom Icon das Kategorie-Emoji.
- Custom Icon überschreibt nur die Anzeige, nicht die Kategorie.

### Phase 5: Visuelle QA

Für jede App mit Playwright:

1. Screenshots für alle Pflicht-Breakpoints erzeugen.
2. Deutsch/Dark prüfen.
3. Settings öffnen und prüfen.
4. Theme auf Light wechseln und zurück.
5. Sprache auf EN wechseln und zurück.
6. Wichtigsten Workflow einmal durchspielen.
7. Screenshot-Review manuell durchführen.
8. Findings sofort fixen, dann Screenshots wiederholen.

Screenshot-Pfad:

```text
/Users/pdietric/GitHub/rollberry-qa-artifacts/YYYY-MM-DD-rollberry-design/
```

Benennung:

```text
appname-01-desktop-dark-de.png
appname-02-settings-dark-de.png
appname-03-responsive-900.png
appname-04-mobile-390.png
appname-05-light-en.png
```

BoltBerry zusätzlich:

```text
boltberry-06-canvas-sidebars.png
boltberry-07-notes-marker.png
boltberry-08-player-view.png
```

### Phase 6: Release-Gate

Vor Live-Freigabe müssen alle Punkte grün sein:

1. BardBerry: `npm run typecheck`, `npm run quality`, `npm run pack`.
2. NoteBerry: `npm run typecheck`, `npm run quality`, `npm run pack`.
3. CharBerry: `npm run typecheck`, `npm run quality`, `npm run pack`.
4. BoltBerry: `npm run lint`, `npm run check:all`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:visual`, `npm run pack`.
5. Keine kritischen oder hohen `npm audit` Findings.
6. Keine Console-Errors im Hauptworkflow.
7. Keine ungewollten Datenmigrationen.
8. Keine visuellen Überläufe in Pflicht-Breakpoints.
9. Kontaktmail ist überall `kontakt@rollberry.de`.
10. GitHub-Links zeigen auf `https://github.com/RollBerryStudios`.
11. macOS Signing und Notarization sind aktiv, wenn öffentlich ausgeliefert wird.

Bekannte Ausnahme:

- Falls BoltBerry weiterhin moderate Dev-Dependency-Audit-Warnings aus Vite/Vitest/esbuild zeigt, werden diese separat als Dependency-Upgrade behandelt und blockieren nur dann den Design-Rollout, wenn produktiver Code oder Build-Artefakte betroffen sind.

## Commit-Strategie

Commits erfolgen klein und nachvollziehbar.

Pflichtreihenfolge:

1. `Add RollBerry suite design plan`
2. `Add RollBerry design tokens`
3. `Unify RollBerry controls`
4. `Apply RollBerry app shell`
5. `Harmonize RollBerry note templates`
6. `Fix RollBerry design QA findings`

Nicht erlaubt:

- Ein Monstercommit über alle Phasen.
- Snapshot-Updates ohne vorherige manuelle Prüfung.
- Refactors ohne sichtbaren Bezug zu diesem Dokument.
- Dependency-Upgrades im Design-Rollout, außer sie sind zwingend erforderlich und separat begründet.

## Definition Of Done

Der Design-Rollout ist erst fertig, wenn:

- Alle vier Apps denselben Grundaufbau haben.
- Alle vier Apps Deutsch und Dark Mode als Default verwenden.
- Alle vier Apps denselben Settings-Aufbau haben.
- Alle vier Apps RollBerry Studios, GitHub und `kontakt@rollberry.de` zeigen.
- NoteBerry und BoltBerry dieselbe Notiz-Template-Logik verwenden.
- BoltBerry-Notizmarker Kategorie-Emojis korrekt verwenden.
- Alle Pflichtscreenshots geprüft sind.
- Alle Tests grün sind oder eine dokumentierte, nicht produktive Ausnahme besteht.
- Builds und Packaged Smoke Checks grün sind.
- Keine öffentlichen macOS-Artefakte ohne Signing/Notarization ausgeliefert werden.

Wenn ein Punkt nicht erfüllt ist, ist der Rollout nicht live-ready.
