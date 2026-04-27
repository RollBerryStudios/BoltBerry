import type { TrackRecord } from '@shared/ipc-types'

const SOUNDTRACK_FILE_VERSION = 1
export const SOUNDTRACK_FILE_KIND = 'boltberry-soundtrack'

export interface SoundtrackTrackEntry {
  fileName: string
  durationS: number | null
  assignments: TrackRecord['assignments']
}

export interface SoundtrackFile {
  kind: typeof SOUNDTRACK_FILE_KIND
  version: number
  exportedAt: string
  /** Tag name as the user wrote it (e.g. "Combat", "Wald-Ambient").
   *  When null the file holds tracks the user hadn't tagged yet. */
  soundtrack: string | null
  /** Manifest only — audio files are NOT bundled. The receiving DM
   *  needs the same files locally; matching is by `fileName`. This
   *  keeps the export under a kilobyte even for hour-long playlists. */
  tracks: SoundtrackTrackEntry[]
}

export function buildSoundtrackFile(
  soundtrack: string | null,
  tracks: ReadonlyArray<TrackRecord>,
): SoundtrackFile {
  return {
    kind: SOUNDTRACK_FILE_KIND,
    version: SOUNDTRACK_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    soundtrack,
    tracks: tracks.map((t) => ({
      fileName: t.fileName,
      durationS: t.durationS,
      assignments: [...t.assignments],
    })),
  }
}

export function suggestedSoundtrackFilename(soundtrack: string | null): string {
  const base = soundtrack ?? 'untagged'
  const safe = base
    .normalize('NFKD')
    .replace(/[^\wäöüß-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  const stem = safe || 'soundtrack'
  return `BoltBerry_Soundtrack_${stem}_${new Date().toISOString().slice(0, 10)}.json`
}

export function parseSoundtrackFile(json: string): SoundtrackFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Datei ist kein gültiges JSON.')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Datei-Inhalt ist kein Objekt.')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.kind !== SOUNDTRACK_FILE_KIND) {
    throw new Error('Datei ist kein BoltBerry-Soundtrack-Export.')
  }
  if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > SOUNDTRACK_FILE_VERSION) {
    throw new Error(`Unbekannte Datei-Version (${obj.version}). BoltBerry aktualisieren?`)
  }
  if (!Array.isArray(obj.tracks)) {
    throw new Error('Datei enthält keine Track-Liste.')
  }
  const tracks = obj.tracks as Array<Record<string, unknown>>
  for (const t of tracks) {
    if (typeof t.fileName !== 'string' || !t.fileName.trim()) {
      throw new Error('Track-Dateiname fehlt.')
    }
  }
  return obj as unknown as SoundtrackFile
}
