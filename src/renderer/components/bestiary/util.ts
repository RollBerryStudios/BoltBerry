import type { L10n, L10nArray, MonsterIndexEntry } from '@shared/ipc-types'
import type { AppLanguage } from '../../stores/uiStore'

/** Returns the string for the active UI language, falling back to the
 *  other locale if the active one is missing. Handles both `L10n` and a
 *  bare string (some legacy fields in the dataset aren't bilingual yet). */
export function localized(value: L10n | string | undefined, lang: AppLanguage): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[lang] ?? value.en ?? value.de ?? ''
}

export function localizedArray(value: L10nArray | string[] | undefined, lang: AppLanguage): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  return value[lang] ?? value.en ?? value.de ?? []
}

/** Best-available name for the current UI locale. Falls back to the
 *  English name because every dataset entry has at least `name`. */
export function pickName(
  entry: { name: string; nameDe?: string },
  lang: AppLanguage,
): string {
  if (lang === 'de' && entry.nameDe) return entry.nameDe
  return entry.name
}

/** Localised human label for a creature type. Prefers the pretty German
 *  variants that ship in the dataset; falls back to the English slug. */
export function typeLabel(
  typeEn: string,
  lang: AppLanguage,
  index: MonsterIndexEntry[] | null,
): string {
  if (!index) return typeEn
  const match = index.find((m) => m.type.en === typeEn)
  if (!match) return typeEn
  return localized(match.type, lang)
}

/** Marker tint for a creature type. Mirrors the palette used by the DB
 *  seeder so list + workspace share the same visual language. */
export function tokenTint(typeEn: string): string {
  const t = (typeEn ?? '').toLowerCase()
  if (t.includes('undead')) return '#a78bfa'
  if (t.includes('fiend')) return '#991b1b'
  if (t.includes('dragon')) return '#dc2626'
  if (t.includes('beast')) return '#b45309'
  if (t.includes('elemental')) return '#f59e0b'
  if (t.includes('plant')) return '#22c55e'
  if (t.includes('construct')) return '#64748b'
  if (t.includes('celestial')) return '#f4f6fa'
  if (t.includes('fey')) return '#ec4899'
  if (t.includes('aberration')) return '#7c3aed'
  if (t.includes('giant')) return '#78350f'
  if (t.includes('ooze')) return '#06b6d4'
  if (t.includes('humanoid')) return '#3b82f6'
  return '#ef4444'
}

/** Renders an ability modifier with the conventional +/- sign. */
export function formatMod(score: number, mod?: number): string {
  const m = typeof mod === 'number' ? mod : Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

/** Capitalises the first letter. Used to normalise bilingual enum labels
 *  (e.g. "conjuration" → "Conjuration") without touching the dataset. */
export function titleCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
