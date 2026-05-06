import { describe, expect, it } from 'vitest'
import { noteCategoryMeta, normalizeNoteIcon, noteMarkerIcon } from '../renderer/notes/categories'

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
})
