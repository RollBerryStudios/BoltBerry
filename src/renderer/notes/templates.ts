import { NOTE_CATEGORIES, noteCategoryMeta } from './categories'

export interface NoteTemplate {
  id: string
  category: string
  icon: string
  label: string
  hint: string
  title: string
  content: string
  tags: string[]
}

export const BLANK_NOTE_TEMPLATE: NoteTemplate = {
  id: 'blank',
  category: 'Allgemein',
  icon: '📝',
  label: 'Leer',
  hint: 'Ohne Vorlage',
  title: 'Leere Notiz',
  content: '',
  tags: [],
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: 'session',
    category: 'Allgemein',
    icon: '🗓️',
    label: 'Sitzung',
    hint: 'Prep + Log',
    title: 'Sitzungsnotizen',
    tags: ['session'],
    content: `# Sitzungsnotizen

## Prep-Snapshot
- Datum:
- Gruppenstufe:
- Rückblick:
- Charakterfokus:
- Starker Einstieg:

## Laufzettel
- Szenen:
- Geheimnisse und Hinweise:
- Fantastische Orte:
- Wichtige NSCs:
- Monster / Begegnungen:
- Belohnungen:

## Während des Spiels
- Entscheidungen:
- Enthüllte Hinweise:
- Improvisierte Namen:
- Neue Fragen:

## Nach dem Spiel
- EP oder Meilenstein:
- Fraktionsänderungen:
- Offene Fäden:
`,
  },
  {
    id: 'npc',
    category: 'NSCs',
    icon: '🧑',
    label: 'NSC',
    hint: 'Motiv + Stimme',
    title: 'Neuer NSC',
    tags: ['npc'],
    content: `# NSC

## Auf einen Blick
- Rolle:
- Pronomen:
- Spezies / Klasse:
- Erscheinung:
- Avatar-Bild:
- Stimme oder Eigenart:
- Erster Satz:

## Motivation
- Will:
- Fürchtet:
- Geheimnis:
- Druckmittel:

## Am Tisch
- Weiß:
- Quest-Aufhänger:
- Statblock:
- Beziehung zur Gruppe:
- TODO:
`,
  },
  {
    id: 'location',
    category: 'Orte',
    icon: '🗺️',
    label: 'Ort',
    hint: 'Eindruck + Hinweise',
    title: 'Neuer Ort',
    tags: ['ort'],
    content: `# Ort

## Erster Eindruck
- Anblick:
- Geräusch:
- Geruch:
- Stimmung:
- Karte oder Bild:

## Fantastische Aspekte
- Aspekt 1:
- Aspekt 2:
- Aspekt 3:

## Am Tisch
- Interessante Punkte:
- NSCs:
- Begegnungen:
- Geheimnisse und Hinweise:
- Gefahren:
- Schätze:
- Ausgänge:
`,
  },
  {
    id: 'quest',
    category: 'Quests',
    icon: '⚔️',
    label: 'Quest',
    hint: 'Ziel + Einsatz',
    title: 'Neue Quest',
    tags: ['quest'],
    content: `# Quest

## Aufhänger
- Auftraggeber / Quelle:
- Warum jetzt:
- Was die Gruppe zuerst sieht:

## Ziel
- Aufgabe:
- Einsatz:
- Frist:
- Folge bei Scheitern:

## Hinweis-Pfad
- Hinweis 1:
- Hinweis 2:
- Hinweis 3:
- Komplikation oder Wendung:

## Belohnung
- Gold / Gegenstand:
- Gefallen:
- Neue Spur:
`,
  },
  {
    id: 'item',
    category: 'Gegenstände',
    icon: '🎒',
    label: 'Gegenstand',
    hint: 'Look + Regeln',
    title: 'Neuer Gegenstand',
    tags: ['gegenstand'],
    content: `# Gegenstand

## Erscheinung
- Beschreibung:
- Avatar-Bild:
- Besitzer:
- Wiedererkennungsmerkmal:

## Mechanik
- Seltenheit:
- Einstimmung:
- Effekt:
- Ladungen / Grenzen:
- Fluch oder Preis:

## Geschichte
- Ursprung:
- Wer ihn will:
- Welchen Hinweis er liefert:
`,
  },
  {
    id: 'lore',
    category: 'Lore',
    icon: '📜',
    label: 'Lore',
    hint: 'Geheimnis + Quelle',
    title: 'Neue Lore',
    tags: ['lore'],
    content: `# Lore

## Wahrheit
- Was stimmt:
- Was die Leute glauben:
- Was verborgen ist:
- Warum es wichtig ist:

## Enthüllung
- Hinweis:
- Quelle:
- Verknüpfte Notizen:
- Folge, wenn ignoriert:
`,
  },
  {
    id: 'rules',
    category: 'Regeln',
    icon: '🎲',
    label: 'Regel',
    hint: 'Ruling am Tisch',
    title: 'Neue Regelnotiz',
    tags: ['regel'],
    content: `# Regel / Entscheidung

## Situation
- Auslöser:
- Quelle:
- Tischentscheidung:

## Am Tisch nutzen
- Kurzfassung:
- Sonderfälle:
- Beispiel:
- Nachbesprechen nach:
`,
  },
  {
    id: 'handout',
    category: 'Handouts',
    icon: '📣',
    label: 'Handout',
    hint: 'Spielertext',
    title: 'Neues Handout',
    tags: ['handout'],
    content: `# Handout

## Text für die Spieler


## SL-Notizen
- Übergabe:
- Versteckte Bedeutung:
- Bild oder Requisite:
- Verknüpfte Quest:
- Was sich danach ändert:
`,
  },
]

export function blankTemplateForCategory(category: string): NoteTemplate {
  const meta = noteCategoryMeta(category)
  return {
    ...BLANK_NOTE_TEMPLATE,
    category: meta.id,
    icon: meta.icon,
  }
}

export function templateForCategory(category: string): NoteTemplate {
  return NOTE_TEMPLATES.find((template) => template.category === category) ?? blankTemplateForCategory(category)
}

export function categoryFromTemplate(template: NoteTemplate): string {
  return NOTE_CATEGORIES.some((category) => category.id === template.category)
    ? template.category
    : 'Allgemein'
}
