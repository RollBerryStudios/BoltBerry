import type {
  ItemRecord,
  L10n,
  MonsterRecord,
  NamedText,
  PlayerHandout,
  SpellRecord,
  TokenRecord,
} from '@shared/ipc-types'
import type { AppLanguage } from '../../stores/uiStore'
import { useTokenStore } from '../../stores/tokenStore'
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
  /** Default token image (data URL) — pulled from monster.token in the
   *  caller via getMonster. Falls back to a marker-only token if absent. */
  imageDataUrl: string | null
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

  const res = await api.dbRun(
    `INSERT INTO tokens
       (map_id, name, image_path, x, y, size, hp_current, hp_max,
        visible_to_players, rotation, locked, z_index, marker_color,
        ac, notes, status_effects, faction, show_name, light_radius, light_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?, NULL, ?, 1, 0, '#ffffff')`,
    [
      opts.mapId,
      name,
      opts.imageDataUrl,
      cx, cy,
      size,
      hp, hp,
      tint,
      ac,
      null,                       // notes
      faction,
    ],
  )

  // Keep the Zustand tokens store in sync with the DB write so the new
  // token paints on the canvas immediately, without waiting for the next
  // full map reload. Matches the shape produced by CanvasArea.loadMapData.
  const newToken: TokenRecord = {
    id: res.lastInsertRowid,
    mapId: opts.mapId,
    name,
    imagePath: opts.imageDataUrl,
    x: cx, y: cy,
    size,
    hpCurrent: hp, hpMax: hp,
    visibleToPlayers: true,
    rotation: 0,
    locked: false,
    zIndex: 0,
    markerColor: tint,
    ac,
    notes: null,
    statusEffects: null,
    faction,
    showName: true,
    lightRadius: 0,
    lightColor: '#ffffff',
  }
  useTokenStore.getState().addToken(newToken)
  return true
}

// ───────── "Send to player" handouts for the three entity types ───────

export function monsterHandout(m: MonsterRecord, lang: AppLanguage, imageDataUrl: string | null): PlayerHandout {
  const subtitle = `${localized(m.size, lang)} · ${localized(m.type, lang)} · ${localized(m.alignment, lang)}`
  const lines: string[] = [
    subtitle,
    '',
    `CR ${m.challenge}    XP ${m.xp.toLocaleString()}`,
    `AC ${stripParens(localized(m.ac, lang))}    HP ${stripParens(localized(m.hp, lang))}`,
    `STR ${m.str}  DEX ${m.dex}  CON ${m.con}  INT ${m.int}  WIS ${m.wis}  CHA ${m.cha}`,
  ]
  const senses = localizedArray(m.senses, lang).join(', ')
  if (senses) lines.push('', `Senses: ${senses}`)
  const langs = localizedArray(m.languages, lang).join(', ')
  if (langs) lines.push(`Languages: ${langs}`)

  appendNamedSection(lines, 'Traits', getNamed(m.traits, lang))
  appendNamedSection(lines, 'Actions', getNamed(m.actions, lang))
  appendNamedSection(lines, 'Legendary Actions', getNamed(m.legendaryActions, lang))
  appendNamedSection(lines, 'Reactions', getNamed(m.reactions, lang))

  return {
    title: pickName(m, lang),
    imagePath: imageDataUrl,
    textContent: lines.join('\n'),
  }
}

export function itemHandout(it: ItemRecord, lang: AppLanguage): PlayerHandout {
  const lines: string[] = [
    `${localized(it.category, lang)} · ${localized(it.rarity, lang)}`,
    '',
  ]
  if (it.cost != null) lines.push(`Cost: ${it.cost} gp`)
  if (it.weight != null) lines.push(`Weight: ${it.weight} lb`)
  if (it.classification) lines.push(`Type: ${localized(it.classification, lang)}`)
  if (it.ac) lines.push(`AC: ${it.ac}`)
  if (it.damageType) lines.push(`Damage: ${localized(it.damageType, lang)}`)
  const props = localizedArray(it.properties, lang)
  if (props.length > 0) lines.push(`Properties: ${props.join(', ')}`)
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
  const lines: string[] = [
    `${localized(sp.level, lang)} · ${localized(sp.school, lang)}${sp.ritual ? ' (ritual)' : ''}`,
    '',
  ]
  if (sp.castingTime) lines.push(`Casting time: ${localized(sp.castingTime, lang)}`)
  if (sp.range) lines.push(`Range: ${localized(sp.range, lang)}`)
  if (sp.duration) lines.push(`Duration: ${localized(sp.duration, lang)}`)
  if (sp.components?.raw) lines.push(`Components: ${localized(sp.components.raw, lang)}`)
  const classes = localizedArray(sp.classes, lang).join(', ')
  if (classes) lines.push(`Classes: ${classes}`)
  const desc = localized(sp.description, lang)
  if (desc) lines.push('', desc)
  const higher = localized(sp.higherLevels, lang)
  if (higher) lines.push('', `At higher levels: ${higher}`)
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
