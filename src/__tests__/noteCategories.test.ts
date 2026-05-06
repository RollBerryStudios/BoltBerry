import { describe, expect, it } from 'vitest'
import { noteCategoryMeta, normalizeNoteIcon, noteMarkerIcon } from '../renderer/notes/categories'
import { NOTE_TEMPLATES, blankTemplateForCategory, templateForCategory } from '../renderer/notes/templates'

describe('note marker category metadata', () => {
  it('uses the category emoji as the default marker icon', () => {
    expect(noteMarkerIcon('NSCs', null)).toBe('🧑')
    expect(noteMarkerIcon('Orte', '')).toBe('🗺️')
    expect(noteCategoryMeta('Gegenstände').color).toBe('#a855f7')
  })

  it('keeps a short custom icon override and falls back for unknown categories', () => {
    expect(normalizeNoteIcon('⭐️ extra')).toBe('⭐️ e')
    expect(noteMarkerIcon('Unbekannt', '❗')).toBe('❗')
    expect(noteMarkerIcon('Unbekannt', null)).toBe('📜')
  })

  it('ships compact D&D templates plus an explicit blank option', () => {
    expect(NOTE_TEMPLATES.map((template) => template.category)).toEqual([
      'Allgemein',
      'NSCs',
      'Orte',
      'Quests',
      'Gegenstände',
      'Lore',
      'Regeln',
      'Handouts',
    ])
    expect(templateForCategory('NSCs').content).toContain('## Motivation')
    expect(templateForCategory('Orte').content).toContain('## Fantastische Aspekte')
    expect(blankTemplateForCategory('Quests')).toMatchObject({ category: 'Quests', content: '', tags: [] })
  })
})
