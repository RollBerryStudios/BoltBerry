# UI/Menu UX Fix Plan - 2026-04-30

## Vorher-Stand

Aus den UI/UX- und Menue-Audits bleiben folgende Findings zu schliessen:

- Dashboard, Workspace und Canvas haben einzelne kleine Buttons, Text-Overflows und teils schwache Kontraste.
- Command-Palette und native Menues bieten Aktionen an, die im aktuellen Kontext nicht immer sinnvoll sind.
- Wiki-Context-Menue funktioniert, nutzt aber nicht dieselbe Tastatur-/ARIA-Qualitaet wie das zentrale Canvas-Context-Menue.
- Token-Context-Menue ist ein Legacy-Sonderweg und dadurch schwerer konsistent zu testen.
- SFX-Emoji-Picker ist visuell brauchbar, aber semantisch schwach und ohne Tastatur-Grid.
- Canvas-Layer-Menue ist klar lesbar, aber semantisch kein echtes Menue/Popup.
- E2E-Abdeckung fuer Menues, Dropdowns, Context-Menues und Picker soll erweitert werden.

## Phasen

1. Menue-System vereinheitlichen und Accessibility-Basics schliessen.
2. Kontext-sensitive Actions in Command-Palette und nativen Menues verbessern.
3. UI/UX-Polish fuer Buttons, Picker, Layer-Menue, Kontrast und Text-Overflows.
4. E2E-/A11y-Abdeckung fuer alle betroffenen Menue- und Picker-Flaechen ergaenzen.
5. Finale Verifikation und Abschlussdokumentation.

## Fortschritt

- 2026-04-30: Vorher-Stand dokumentiert. Umsetzung startet mit Phase 1.
- 2026-04-30: Phase 1 in Arbeit. Erste A11y-/Semantik-Patches fuer Wiki-Context-Menue, SFX-Emoji-Picker, Canvas-Layer-Menue, Canvas-Tool-Popover und gemeinsames ContextMenu umgesetzt.
- 2026-04-30: Phase 2 umgesetzt. Renderer sendet Kontextzustand an den Main-Prozess; native Menuepunkte werden anhand von Kampagnen-/Map-/Session-Kontext aktiviert oder deaktiviert. Command-Palette filtert kontextlose Aktionen; native Menueaktionen werden im Renderer zusaetzlich geguarded. Veraltete Kamera-Follow/One-shot-Eintraege aus dem nativen Session-Menue entfernt.
- 2026-04-30: Phase 3 in Arbeit. Notes-Kontrast, sichtbare Notiz-Actions, PDF/SFX-Touch-Targets und lange Titel/HUD-Ellipsen verbessert.
- 2026-04-30: Phase 4 umgesetzt. Neue Playwright-Regressionen fuer native Menue-Kontexte, Command-Palette-Filter, Wiki-Menue-A11y, SFX-Emoji-Grid und Canvas-Layer-Menue ergaenzt.
- 2026-04-30: Token-Context-Menue bleibt aus Stabilitaetsgruenden im bestehenden Renderer-Pfad, bekommt aber Rollen fuer Hauptmenue, Submenues, Menuitems sowie Radio-/Checkbox-Zustaende.
- 2026-04-30: Phase 5 gestartet. Build-, Typecheck-, i18n-, Regression-, Unit- und Lint-Pruefungen laufen als Abschlussverifikation.
- 2026-04-30: Manuelle Screenshot-Abnahme neu gestartet. Findings aus dem ersten Durchlauf: Notizen ohne Workspace-Header, zu kleine Notes-Controls; Charaktere mit zu dunklem Empty-State, zu kompakten Eingaben/Tabs/Icon-Actions und unsichtbaren Row-Actions.
- 2026-04-30: Restluecken fuer Notizen und Charaktere geschlossen. Notizen bekommen PanelHeader, groessere Suche/Tabs/Preview/Tags-Flächen; Charaktere bekommen kontrastreichere Empty-States, groessere Inputs/Tabs/Icon-Actions, sichtbare Export/Delete-Row-Actions sowie groessere Todesrettungs- und Attack-Actions.
- 2026-04-30: Finale Nachmessung der manuellen Screenshot-Abnahme unter `test-results/manual-ui-abnahme-2026-04-30-after-final/` erzeugt. `manual-ui-report.json` enthaelt keine Findings mehr fuer den geprueften Notizen-/Charaktere-Scope.

## Abschluss

Abgeschlossen am 2026-04-30.

Umgesetzt:

- Menue-/Popup-Semantik fuer Wiki-Menue, Canvas-Layer-Menue und Token-Context-Menue ergaenzt.
- Tastaturbedienung fuer gemeinsames ContextMenu, Wiki-Menue und SFX-Emoji-Picker verbessert.
- Native App-Menues, Command-Palette und Renderer-Menueaktionen kontextsensitiv gemacht.
- UI/UX-Polish fuer Notes-Panel, lange Dashboard-/Workspace-Titel, PDF-Toolbar, SFX-Picker und Canvas-HUD umgesetzt.
- UI/UX-Polish fuer Charakterbogen-Panel und Notes-Panel nach manueller Screenshot-Abnahme nachgezogen.
- Neue E2E-Regressionen fuer Menue-Kontext, Command-Palette, Wiki-Kontextmenue, SFX-Emoji-Grid und Canvas-Layer-Popup hinzugefuegt.

Verifikation:

- `npm run build:main`: bestanden.
- `npm run typecheck:preload`: bestanden.
- `npm run build:preload`: bestanden.
- `npm run build:renderer -- --mode production`: bestanden.
- `npm run check:i18n`: bestanden, 738 Keys.
- `npx playwright test e2e/regression/menu-context-a11y.spec.ts --project=regression`: bestanden, 5/5 Tests.
- `npm test`: bestanden, 269/269 Tests.
- `npm run build`: bestanden.
- `npm run lint`: bestanden mit 181 bestehenden Warnungen.
- Manuelle Screenshot-Abnahme Notizen/Charaktere: bestanden, finale Nachmessung ohne Findings.
- `npm run check:all`: bestanden.
- `npm run test:e2e`: bestanden, 139/139 ausgefuehrte Tests, 1 Skip.
- `npm run test:e2e:visual`: bestanden, 4/4 Tests.
- `npm run pack`: bestanden.
- `BOLTBERRY_E2E_EXECUTABLE_PATH=... npm run test:e2e:packaged`: bestanden.

Resthinweis:

- `npm run lint` meldet weiterhin Warnungen im bestehenden Codebestand. Die Abschlusspruefung blockiert nicht, weil der Befehl mit Exitcode 0 beendet wurde.
