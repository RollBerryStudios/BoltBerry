export interface NoteCategoryMeta {
  key: string
  id: string
  icon: string
  color: string
}

export const NOTE_CATEGORIES: NoteCategoryMeta[] = [
  { key: 'general', id: 'Allgemein', icon: '📜', color: '#f59e0b' },
  { key: 'npcs', id: 'NSCs', icon: '🧑', color: '#22c55e' },
  { key: 'locations', id: 'Orte', icon: '🗺️', color: '#3b82f6' },
  { key: 'quests', id: 'Quests', icon: '⚔️', color: '#ef4444' },
  { key: 'items', id: 'Gegenstände', icon: '🎒', color: '#a855f7' },
  { key: 'misc', id: 'Sonstiges', icon: '📌', color: '#64748b' },
]

export function noteCategoryMeta(category: string): NoteCategoryMeta {
  return NOTE_CATEGORIES.find((item) => item.id === category) ?? NOTE_CATEGORIES[0]
}

export function normalizeNoteIcon(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = Array.from(value.trim()).slice(0, 4).join('')
  return clean.length > 0 ? clean : null
}

export function noteMarkerIcon(category: string, customIcon?: string | null): string {
  return normalizeNoteIcon(customIcon) ?? noteCategoryMeta(category).icon
}
