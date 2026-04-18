/**
 * Static analysis tests for the campaign export/import system.
 *
 * export-import.ts can't be imported directly (it imports electron), so these
 * tests read the source text and verify structural invariants:
 *
 *  1. EXPORT_VERSION reflects the schema version that introduced audio+chars
 *  2. CampaignExport interface covers every significant DB table
 *  3. buildCampaignExport queries every table that CampaignExport covers
 *  4. insertCampaignData inserts into every table it should
 *  5. collectAssetPaths handles all path-bearing fields (maps, tokens, audio)
 *  6. remapPaths updates all path-bearing fields
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = readFileSync(
  resolve(__dirname, '../main/ipc/export-import.ts'),
  'utf-8'
)

describe('CampaignExport interface', () => {
  const tables = [
    'maps',
    'tokens',
    'walls',
    'gmPins',
    'drawings',
    'fogBitmap',
    'initiative',
    'notes',
    'rooms',
    'handouts',
    'encounters',
    'characterSheets',
    'audioBoards',
  ]

  it.each(tables)('interface contains "%s" field', (field) => {
    // The interface is defined between 'interface CampaignExport' and the closing brace
    // We just check the identifier appears in source (could be in interface or inline type)
    expect(SRC).toContain(field)
  })

  it('EXPORT_VERSION is 9 (schema v9 with encounter-id remap + rotation_player + pin notes)', () => {
    expect(SRC).toMatch(/const EXPORT_VERSION\s*=\s*9/)
  })
})

describe('buildCampaignExport', () => {
  const queries = [
    // map-level tables
    ['walls',           "FROM walls"],
    ['gm_pins',         "FROM gm_pins"],
    ['drawings',        "FROM drawings"],
    ['fog_state',       "FROM fog_state"],
    ['initiative',      "FROM initiative"],
    ['notes',           "FROM notes"],
    ['rooms',           "FROM rooms"],
    // campaign-level tables
    ['handouts',        "FROM handouts"],
    ['encounters',      "FROM encounters"],
    ['character_sheets',"FROM character_sheets"],
    ['audio_boards',    "FROM audio_boards"],
    ['audio_board_slots',"FROM audio_board_slots"],
  ]

  it.each(queries)('queries %s table', (_table, fragment) => {
    expect(SRC).toContain(fragment)
  })

  it('maps ambient_track_path into export', () => {
    expect(SRC).toContain('ambient_track_path')
    expect(SRC).toContain('ambientTrackPath')
  })

  it('maps track volume columns into export', () => {
    expect(SRC).toContain('track1_volume')
    expect(SRC).toContain('track2_volume')
    expect(SRC).toContain('combat_volume')
  })

  it('maps token light columns into export', () => {
    expect(SRC).toContain('light_radius')
    expect(SRC).toContain('light_color')
  })

  it('maps drawing text column into export', () => {
    // drawings query should select "text"
    expect(SRC).toMatch(/drawings.*text|text.*drawings/s)
  })
})

describe('insertCampaignData', () => {
  const inserts = [
    ['campaigns',         "INSERT INTO campaigns"],
    ['maps',              "INSERT INTO maps"],
    ['tokens',            "INSERT INTO tokens"],
    ['walls',             "INSERT INTO walls"],
    ['gm_pins',           "INSERT INTO gm_pins"],
    ['drawings',          "INSERT INTO drawings"],
    ['fog_state',         "INSERT INTO fog_state"],
    ['initiative',        "INSERT INTO initiative"],
    ['notes',             "INSERT INTO notes"],
    ['rooms',             "INSERT INTO rooms"],
    ['handouts',          "INSERT INTO handouts"],
    ['encounters',        "INSERT INTO encounters"],
    ['character_sheets',  "INSERT INTO character_sheets"],
    ['audio_boards',      "INSERT INTO audio_boards"],
    ['audio_board_slots', "INSERT INTO audio_board_slots"],
  ]

  it.each(inserts)('inserts into %s', (_table, fragment) => {
    expect(SRC).toContain(fragment)
  })

  it('remaps token_id foreign keys for character_sheets on import', () => {
    // The token id mapping must be applied before inserting character sheets
    expect(SRC).toContain('globalTokenIdMap')
    expect(SRC).toContain('remappedTokenId')
  })

  it('wraps all inserts in a transaction', () => {
    expect(SRC).toMatch(/db\.transaction\s*\(/)
  })

  it('inserts all audio map columns', () => {
    expect(SRC).toContain('ambient_track_path, track1_volume, track2_volume, combat_volume')
  })

  it('round-trips the v32 grid style columns', () => {
    // Without these the export path drops gridVisible / gridThickness /
    // gridColor on re-import, resetting every map back to the default
    // white/thin/visible grid even if the DM customised them.
    expect(SRC).toMatch(/grid_visible/)
    expect(SRC).toMatch(/grid_thickness/)
    expect(SRC).toMatch(/grid_color/)
    // Also on the readback side the export builder must emit typed
    // booleans, not 0/1, so the receiver can import into a strict DB.
    expect(SRC).toMatch(/gridVisible:\s*\(m\.grid_visible\s*\?\?\s*1\)\s*!==\s*0/)
  })
})

describe('collectAssetPaths', () => {
  it('includes map image paths', () => {
    // Should push m.imagePath
    expect(SRC).toMatch(/m\.imagePath/)
  })

  it('includes ambient track paths', () => {
    expect(SRC).toMatch(/ambientTrackPath/)
  })

  it('includes token image paths', () => {
    expect(SRC).toMatch(/t\.imagePath/)
  })

  it('includes handout image paths', () => {
    expect(SRC).toMatch(/h\.imagePath/)
  })

  it('includes audio board slot paths', () => {
    expect(SRC).toMatch(/s\.audioPath/)
  })
})

describe('remapPaths', () => {
  it('remaps map imagePath', () => {
    expect(SRC).toMatch(/m\.imagePath\s*=\s*pathMap\.get/)
  })

  it('remaps map ambientTrackPath', () => {
    expect(SRC).toMatch(/m\.ambientTrackPath\s*=\s*pathMap\.get/)
  })

  it('remaps token imagePaths', () => {
    expect(SRC).toMatch(/t\.imagePath\s*=\s*pathMap\.get/)
  })

  it('remaps handout imagePaths', () => {
    expect(SRC).toMatch(/h\.imagePath\s*=\s*pathMap\.get/)
  })

  it('remaps audio board slot audioPaths', () => {
    expect(SRC).toMatch(/s\.audioPath\s*=\s*pathMap\.get/)
  })
})

describe('path-traversal protection in ZIP import', () => {
  it('validates extracted paths against canonicalised importDir boundary', () => {
    // Post-audit (blocker #3) the guard canonicalises via realpathSync
    // so a symlinked parent can't redirect writes outside the import
    // dir. Assertion name tracks the variable name.
    expect(SRC).toContain('dest.startsWith(canonicalImportDir')
    expect(SRC).toContain('realpathSync(importDir)')
  })

  it('rejects entries with a ".." path segment', () => {
    // Segment-level check (not substring) — legitimate filenames like
    // "a..b.txt" must still unpack.
    expect(SRC).toMatch(/segments\.includes\(['"]\.\.['"]\)/)
  })
})

describe('getEffectiveUserDataPath helper', () => {
  it('is used in both buildZip and IMPORT_CAMPAIGN handler', () => {
    const occurrences = (SRC.match(/getEffectiveUserDataPath/g) ?? []).length
    // declaration + at least 2 call sites
    expect(occurrences).toBeGreaterThanOrEqual(3)
  })
})
