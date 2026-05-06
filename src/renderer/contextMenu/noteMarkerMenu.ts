import type { MenuResolver } from './types'
import { registerMenu } from './registry'

const noteMarkerResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'noteMarker') return []
  const note = env.primary.note
  return [
    {
      id: 'note-marker',
      items: [
        {
          id: 'edit-note-marker',
          labelKey: 'contextMenu.noteMarker.edit',
          icon: '✏',
          run: () => window.dispatchEvent(new CustomEvent('note-marker:edit', { detail: { id: note.id } })),
        },
        {
          id: 'delete-note-marker',
          labelKey: 'contextMenu.noteMarker.delete',
          icon: '🗑',
          danger: true,
          run: () => window.dispatchEvent(new CustomEvent('note-marker:delete', { detail: { id: note.id } })),
        },
      ],
    },
  ]
}

let registered = false
export function registerNoteMarkerMenu(): void {
  if (registered) return
  registered = true
  registerMenu('noteMarker', noteMarkerResolver)
}
