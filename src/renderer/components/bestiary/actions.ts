import type {
  ItemRecord,
  L10n,
  MonsterRecord,
  NamedText,
  PlayerHandout,
  SpellRecord,
} from '@shared/ipc-types'
import type { AppLanguage } from '../../stores/uiStore'
import { useTokenStore } from '../../stores/tokenStore'
import { useUndoStore, nextCommandId } from '../../stores/undoStore'
import { localized, localizedArray, pickName, tokenTint } from './util'

/* Cross-cutting actions shared by every bestiary detail view + the four
   integration surfaces (encounter builder, character sheet, token context
   menu, initiative panel).

   Keeping the spawn / handout / lookup logic here means each consumer
   stays a thin shell over data and uiStore, and a future migration of
   token storage (e.g. a `template_slug` column) only touches one file. */

// ───────── Spawn a Bestiarium monster onto the active map ─────────────

/** Inserts a single token row derived from a Bestiarium MonsterRecord.
 *  Returns true on success, false if the necessary context (active map,
 *  electronAPI) is missing. The token is named in the active language so
 *  the player window's name plate matches the DM's UI. */
export async function spawnMonsterOnMap(opts: {
  monster: MonsterRecord
  /** Preferred token filename (e.g. "AbolethEel (2).webp") when the spawn
   *  should pin to a specific variant. Optional — when omitted we fall
   *  back to the monster's default token via the compact bestiary:// URL
   *  scheme, which keeps tokens.image_path tiny instead of storing
   *  30–50 KB of base64 per row. */
  tokenFile?: string | null
  mapId: number
  /** Map camera centre — used as the spawn anchor. Caller passes the
   *  values from the active MapRecord. */
  cameraX: number | null
  cameraY: number | null
  language: AppLanguage
  /** Per-token offset for bulk-spawn formations (cluster, line, …). */
  dx?: number
  dy?: number
  /** When `true`, the spawn defaults to enemy faction + a tint matching
   *  the creature type. Pass `false` for ally/companion spawns. */
  hostile?: boolean
}): Promise<boolean> {
  const api = window.electronAPI
  if (!api) return false
  const m = opts.monster
  const cx = (opts.cameraX ?? 0) + (opts.dx ?? 0)
  const cy = (opts.cameraY ?? 0) + (opts.dy ?? 0)
  const name = pickName(m, opts.language)
  const tint = tokenTint(m.type.en)
  const hp = parseLeadingInt(localized(m.hp, opts.language)) ?? 10
  const ac = parseLeadingInt(localized(m.ac, opts.language)) ?? 10
  const size = gridSizeFromLabel(m.size.en)
  const faction = opts.hostile === false ? 'neutral' : 'enemy'

  // Compose the compact bestiary:// reference from the chosen variant or
  // the monster's shipped primary. Image loaders (useImage /
  // useImageUrl) resolve this to a data URL on demand; both the DM and
  // the player window understand the scheme.
  const variant = opts.tokenFile ?? m.token?.file ?? m.tokens?.[0]?.file ?? null
  const imagePath = variant ? `bestiary://${m.slug}/${variant}` : null

  const createPatch = {
    mapId: opts.mapId,
    name,
    imagePath,
    x: cx,
    y: cy,
    size,
    hpCurrent: hp,
    hpMax: hp,
    markerColor: tint,
    ac,
    faction,
    lightColor: '#ffffff',
  }

  const newToken = await api.tokens.create(createPatch)

  // Keep the Zustand tokens store in sync with the DB write so the new
  // token paints on the canvas immediately, without waiting for the next
  // full map reload.
  useTokenStore.getState().addToken(newToken)

  // Register a command so Ctrl+Z rolls back a Wiki / encounter /
  // initiative / encounter-picker spawn the same way drag-drop
  // spawns from CanvasArea already do. Closure-locals capture the
  // id + restored row so redo re-inserts with matching contents.
  let currentId: number = newToken.id
  useUndoStore.getState().pushCommand({
    id: nextCommandId(),
    label: `Spawn ${name}`,
    action: { type: 'token.place', payload: { token: newToken } },
    undo: async () => {
      await api.tokens.delete(currentId)
      useTokenStore.getState().removeToken(currentId)
    },
    redo: async () => {
      const r = await api.tokens.create(createPatch)
      if (!r) return
      currentId = r.id
      useTokenStore.getState().addToken(r)
    },
  })

  return true
}

// ───────── "Send to player" handouts for the three entity types ───────

export function monsterHandout(m: MonsterRecord, lang: AppLanguage, imageDataUrl: string | null): PlayerHandout {
  const L = HANDOUT_LABELS[lang]
  const subtitle = `${localized(m.size, lang)} · ${localized(m.type, lang)} · ${localized(m.alignment, lang)}`
  const lines: string[] = [
    subtitle,
    '',
    `${L.cr} ${m.challenge}    XP ${m.xp.toLocaleString()}`,
    `${L.ac} ${stripParens(localized(m.ac, lang))}    ${L.hp} ${stripParens(localized(m.hp, lang))}`,
    `STR ${m.str}  DEX ${m.dex}  CON ${m.con}  INT ${m.int}  WIS ${m.wis}  CHA ${m.cha}`,
  ]
  const senses = localizedArray(m.senses, lang).join(', ')
  if (senses) lines.push('', `${L.senses}: ${senses}`)
  const langs = localizedArray(m.languages, lang).join(', ')
  if (langs) lines.push(`${L.languages}: ${langs}`)

  appendNamedSection(lines, L.traits, getNamed(m.traits, lang))
  appendNamedSection(lines, L.actions, getNamed(m.actions, lang))
  appendNamedSection(lines, L.legendary, getNamed(m.legendaryActions, lang))
  appendNamedSection(lines, L.reactions, getNamed(m.reactions, lang))

  return {
    title: pickName(m, lang),
    imagePath: imageDataUrl,
    textContent: lines.join('\n'),
  }
}

// Bilingual labels for handout body composition. Kept inline rather than
// going through i18next because PlayerHandout.textContent is plain text
// destined for the player window, where re-pulling i18n adds no value
// (the player sees the DM's chosen language for the card body anyway).
const HANDOUT_LABELS: Record<AppLanguage, {
  cr: string; ac: string; hp: string
  senses: string; languages: string
  traits: string; actions: string; legendary: string; reactions: string
  cost: string; weight: string; type: string; ac2: string; damage: string; properties: string
  castingTime: string; range: string; duration: string; components: string; classes: string
  higherLevels: string
}> = {
  en: {
    cr: 'CR', ac: 'AC', hp: 'HP',
    senses: 'Senses', languages: 'Languages',
    traits: 'Traits', actions: 'Actions',
    legendary: 'Legendary Actions', reactions: 'Reactions',
    cost: 'Cost', weight: 'Weight', type: 'Type', ac2: 'AC',
    damage: 'Damage', properties: 'Properties',
    castingTime: 'Casting time', range: 'Range', duration: 'Duration',
    components: 'Components', classes: 'Classes',
    higherLevels: 'At higher levels',
  },
  de: {
    cr: 'HG', ac: 'RK', hp: 'TP',
    senses: 'Sinne', languages: 'Sprachen',
    traits: 'Merkmale', actions: 'Aktionen',
    legendary: 'Legendäre Aktionen', reactions: 'Reaktionen',
    cost: 'Kosten', weight: 'Gewicht', type: 'Art', ac2: 'RK',
    damage: 'Schaden', properties: 'Eigenschaften',
    castingTime: 'Zeitaufwand', range: 'Reichweite', duration: 'Wirkungsdauer',
    components: 'Komponenten', classes: 'Klassen',
    higherLevels: 'Auf höheren Graden',
  },
}

export function itemHandout(it: ItemRecord, lang: AppLanguage): PlayerHandout {
  const L = HANDOUT_LABELS[lang]
  const lines: string[] = [
    `${localized(it.category, lang)} · ${localized(it.rarity, lang)}`,
    '',
  ]
  if (it.cost != null) lines.push(`${L.cost}: ${it.cost} gp`)
  if (it.weight != null) lines.push(`${L.weight}: ${it.weight} lb`)
  if (it.classification) lines.push(`${L.type}: ${localized(it.classification, lang)}`)
  if (it.ac) lines.push(`${L.ac2}: ${localized(it.ac, lang)}`)
  if (it.damageType) lines.push(`${L.damage}: ${localized(it.damageType, lang)}`)
  const props = normaliseProperties(it.properties, lang)
  if (props) lines.push(`${L.properties}: ${props}`)
  const desc = localized(it.description, lang)
  if (desc) {
    lines.push('', desc)
  }
  return {
    title: pickName(it, lang),
    imagePath: null,
    textContent: lines.join('\n'),
  }
}

export function spellHandout(sp: SpellRecord, lang: AppLanguage): PlayerHandout {
  const L = HANDOUT_LABELS[lang]
  const ritualLabel = lang === 'de' ? 'Ritual' : 'ritual'
  const lines: string[] = [
    `${localized(sp.level, lang)} · ${localized(sp.school, lang)}${sp.ritual ? ` (${ritualLabel})` : ''}`,
    '',
  ]
  if (sp.castingTime) lines.push(`${L.castingTime}: ${localized(sp.castingTime, lang)}`)
  if (sp.range) lines.push(`${L.range}: ${localized(sp.range, lang)}`)
  if (sp.duration) lines.push(`${L.duration}: ${localized(sp.duration, lang)}`)
  if (sp.components?.raw) lines.push(`${L.components}: ${localized(sp.components.raw, lang)}`)
  const classes = localizedArray(sp.classes, lang).join(', ')
  if (classes) lines.push(`${L.classes}: ${classes}`)
  const desc = localized(sp.description, lang)
  if (desc) lines.push('', desc)
  const higher = localized(sp.higherLevels, lang)
  if (higher) lines.push('', `${L.higherLevels}: ${higher}`)
  return {
    title: pickName(sp, lang),
    imagePath: null,
    textContent: lines.join('\n'),
  }
}

// ───────── Lookups ────────────────────────────────────────────────────

/** Looks up a bestiary slug by a free-form display name. Used by the
 *  token context-menu + initiative entry → "Open in Bestiarium" hooks
 *  where the only stable handle we have on the gameplay side is the
 *  rendered name. Matches case-insensitively against both EN and DE
 *  names so renaming a token to its German form still resolves. */
export async function findMonsterSlugByName(name: string): Promise<string | null> {
  if (!name || !window.electronAPI) return null
  try {
    const list = await window.electronAPI.listMonsters()
    const needle = name.trim().toLowerCase()
    if (!needle) return null
    const exact = list.find(
      (m) => m.name.toLowerCase() === needle || m.nameDe?.toLowerCase() === needle,
    )
    if (exact) return exact.slug
    // Fall back to a "starts with" match before giving up — DMs commonly
    // suffix names ("Goblin 2", "Dire Wolf #3") and we still want the
    // popup to land on the right entry.
    const prefix = list.find(
      (m) => needle.startsWith(m.name.toLowerCase())
        || (m.nameDe && needle.startsWith(m.nameDe.toLowerCase())),
    )
    return prefix?.slug ?? null
  } catch {
    return null
  }
}

// ───────── Helpers (kept private to this module) ──────────────────────

function getNamed(
  src: { en: Array<NamedText | string>; de: Array<NamedText | string> } | undefined,
  lang: AppLanguage,
): NamedText[] {
  if (!src) return []
  const arr = src[lang] ?? src.en ?? src.de ?? []
  return arr.filter((x): x is NamedText =>
    typeof x === 'object' && x !== null && 'name' in x && 'text' in x,
  )
}

function appendNamedSection(out: string[], heading: string, entries: NamedText[]) {
  if (entries.length === 0) return
  out.push('', `— ${heading} —`)
  for (const e of entries) {
    out.push(`${e.name}. ${e.text}`)
  }
}

// Mirror of ItemsTab.propertiesAsText for the handout body — accepts either
// the L10n object the dataset actually uses or the L10nArray shape we
// originally typed for.
function normaliseProperties(value: unknown, lang: AppLanguage): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return (value as string[]).join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const picked = obj[lang] ?? obj.en ?? obj.de
    if (typeof picked === 'string') return picked
    if (Array.isArray(picked)) return (picked as string[]).join(', ')
  }
  return ''
}

function parseLeadingInt(s: string | undefined): number | null {
  if (!s) return null
  const m = s.match(/-?\d+/)
  return m ? parseInt(m[0], 10) : null
}

function gridSizeFromLabel(label: string): number {
  switch ((label ?? '').toLowerCase()) {
    case 'tiny':
    case 'small':
    case 'medium': return 1
    case 'large': return 2
    case 'huge': return 3
    case 'gargantuan': return 4
    default: return 1
  }
}

function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim() || s
}

// Exposed for tests / future callers that want the name + slug list
// without re-implementing the EN/DE collation.
export function indexMonsterByName(
  monsters: Array<{ slug: string; name: string; nameDe?: string }>,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of monsters) {
    out.set(m.name.toLowerCase(), m.slug)
    if (m.nameDe) out.set(m.nameDe.toLowerCase(), m.slug)
  }
  return out
}

// Re-export for the L10n-handling helpers — keeps consumers from having
// to know the dataset shape.
export type { L10n }
