/**
 * Static analysis of the migration chain.
 *
 * These tests import only schema.ts (no electron dependency) and verify:
 *  1. Every migration SQL contains the correct `UPDATE schema_version SET version = N`
 *  2. Version numbers increment monotonically from 2 to SCHEMA_VERSION
 *  3. No column is added more than once across the entire migration chain
 *  4. database.ts imports every migration constant and applies it in order
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  SCHEMA_VERSION,
  CREATE_TABLES_SQL,
  CREATE_POST_MIGRATION_INDEXES_SQL,
  MIGRATE_V1_TO_V2,
  MIGRATE_V2_TO_V3,
  MIGRATE_V3_TO_V4,
  MIGRATE_V4_TO_V5,
  MIGRATE_V5_TO_V6,
  MIGRATE_V6_TO_V7,
  MIGRATE_V7_TO_V8,
  MIGRATE_V8_TO_V9,
  MIGRATE_V9_TO_V10,
  MIGRATE_V10_TO_V11,
  MIGRATE_V11_TO_V12,
  MIGRATE_V12_TO_V13,
  MIGRATE_V13_TO_V14,
  MIGRATE_V14_TO_V15,
  MIGRATE_V15_TO_V16,
  MIGRATE_V16_TO_V17,
  MIGRATE_V17_TO_V18,
  MIGRATE_V18_TO_V19,
  MIGRATE_V19_TO_V20,
  MIGRATE_V20_TO_V21,
  MIGRATE_V21_TO_V22,
  MIGRATE_V22_TO_V23,
  MIGRATE_V23_TO_V24,
  MIGRATE_V24_TO_V25,
  MIGRATE_V25_TO_V26,
  MIGRATE_V26_TO_V27,
  MIGRATE_V27_TO_V28,
  MIGRATE_V28_TO_V29,
  MIGRATE_V29_TO_V30,
  MIGRATE_V30_TO_V31,
  MIGRATE_V31_TO_V32,
  MIGRATE_V32_TO_V33,
  MIGRATE_V33_TO_V34,
  MIGRATE_V34_TO_V35,
} from '../main/db/schema'

// Ordered table of all migrations: [from, to, sql]
const CHAIN: Array<{ from: number; to: number; sql: string; name: string }> = [
  { from: 1,  to: 2,  sql: MIGRATE_V1_TO_V2,   name: 'V1→V2'  },
  { from: 2,  to: 3,  sql: MIGRATE_V2_TO_V3,   name: 'V2→V3'  },
  { from: 3,  to: 4,  sql: MIGRATE_V3_TO_V4,   name: 'V3→V4'  },
  { from: 4,  to: 5,  sql: MIGRATE_V4_TO_V5,   name: 'V4→V5'  },
  { from: 5,  to: 6,  sql: MIGRATE_V5_TO_V6,   name: 'V5→V6'  },
  { from: 6,  to: 7,  sql: MIGRATE_V6_TO_V7,   name: 'V6→V7'  },
  { from: 7,  to: 8,  sql: MIGRATE_V7_TO_V8,   name: 'V7→V8'  },
  { from: 8,  to: 9,  sql: MIGRATE_V8_TO_V9,   name: 'V8→V9'  },
  { from: 9,  to: 10, sql: MIGRATE_V9_TO_V10,  name: 'V9→V10' },
  { from: 10, to: 11, sql: MIGRATE_V10_TO_V11, name: 'V10→V11'},
  { from: 11, to: 12, sql: MIGRATE_V11_TO_V12, name: 'V11→V12'},
  { from: 12, to: 13, sql: MIGRATE_V12_TO_V13, name: 'V12→V13'},
  { from: 13, to: 14, sql: MIGRATE_V13_TO_V14, name: 'V13→V14'},
  { from: 14, to: 15, sql: MIGRATE_V14_TO_V15, name: 'V14→V15'},
  { from: 15, to: 16, sql: MIGRATE_V15_TO_V16, name: 'V15→V16'},
  { from: 16, to: 17, sql: MIGRATE_V16_TO_V17, name: 'V16→V17'},
  { from: 17, to: 18, sql: MIGRATE_V17_TO_V18, name: 'V17→V18'},
  { from: 18, to: 19, sql: MIGRATE_V18_TO_V19, name: 'V18→V19'},
  { from: 19, to: 20, sql: MIGRATE_V19_TO_V20, name: 'V19→V20'},
  { from: 20, to: 21, sql: MIGRATE_V20_TO_V21, name: 'V20→V21'},
  { from: 21, to: 22, sql: MIGRATE_V21_TO_V22, name: 'V21→V22'},
  { from: 22, to: 23, sql: MIGRATE_V22_TO_V23, name: 'V22→V23'},
  { from: 23, to: 24, sql: MIGRATE_V23_TO_V24, name: 'V23→V24'},
  { from: 24, to: 25, sql: MIGRATE_V24_TO_V25, name: 'V24→V25'},
  { from: 25, to: 26, sql: MIGRATE_V25_TO_V26, name: 'V25→V26'},
  { from: 26, to: 27, sql: MIGRATE_V26_TO_V27, name: 'V26→V27'},
  { from: 27, to: 28, sql: MIGRATE_V27_TO_V28, name: 'V27→V28'},
  { from: 28, to: 29, sql: MIGRATE_V28_TO_V29, name: 'V28→V29'},
  { from: 29, to: 30, sql: MIGRATE_V29_TO_V30, name: 'V29→V30'},
  { from: 30, to: 31, sql: MIGRATE_V30_TO_V31, name: 'V30→V31'},
  { from: 31, to: 32, sql: MIGRATE_V31_TO_V32, name: 'V31→V32'},
  { from: 32, to: 33, sql: MIGRATE_V32_TO_V33, name: 'V32→V33'},
  { from: 33, to: 34, sql: MIGRATE_V33_TO_V34, name: 'V33→V34'},
  { from: 34, to: 35, sql: MIGRATE_V34_TO_V35, name: 'V34→V35'},
]

describe('Migration chain', () => {
  it('SCHEMA_VERSION matches the last migration target', () => {
    const last = CHAIN[CHAIN.length - 1]
    expect(SCHEMA_VERSION).toBe(last.to)
  })

  it('chain has no gaps or duplicates in version numbers', () => {
    for (let i = 0; i < CHAIN.length; i++) {
      const m = CHAIN[i]
      expect(m.to).toBe(m.from + 1)
      if (i > 0) {
        expect(m.from).toBe(CHAIN[i - 1].to)
      }
    }
  })

  it.each(CHAIN)('$name: SQL contains correct version bump', ({ to, sql }) => {
    const pattern = new RegExp(`UPDATE\\s+schema_version\\s+SET\\s+version\\s*=\\s*${to}`, 'i')
    expect(sql).toMatch(pattern)
  })

  it('no duplicate ADD COLUMN across migration chain', () => {
    // Collect all "ADD COLUMN col_name" occurrences per table
    // Pattern: ALTER TABLE <table> ADD COLUMN <col>
    const seen = new Map<string, string>() // "table.col" → migration name

    for (const { sql, name } of CHAIN) {
      const addColRe = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi
      let match: RegExpExecArray | null
      while ((match = addColRe.exec(sql)) !== null) {
        const key = `${match[1].toLowerCase()}.${match[2].toLowerCase()}`
        if (seen.has(key)) {
          throw new Error(
            `Duplicate ADD COLUMN detected: "${key}" in both "${seen.get(key)}" and "${name}"`
          )
        }
        seen.set(key, name)
      }
    }

    // If we reach here, no duplicates
    expect(seen.size).toBeGreaterThan(0)
  })

  it('database.ts imports every migration constant', () => {
    const dbSource = readFileSync(
      resolve(__dirname, '../main/db/database.ts'),
      'utf8'
    )

    for (const { name } of CHAIN) {
      // Convert "V1→V2" → "MIGRATE_V1_TO_V2"
      const exportName = `MIGRATE_${name.replace('→', '_TO_')}`
      expect(dbSource, `database.ts should import ${exportName}`).toContain(exportName)
    }
  })

  // ── Bootstrap-order regression test ──────────────────────────────────────
  // The pin_y bug (a1f7c2b) happened because CREATE_TABLES_SQL — which runs
  // unconditionally before migrations on every init — contained partial
  // indexes whose WHERE clauses referenced columns added in a later
  // migration (v23→v24). That broke init for every legacy DB.
  //
  // Lock in the architectural rule: any DDL that depends on a column added
  // by a later migration MUST live in CREATE_POST_MIGRATION_INDEXES_SQL,
  // not in CREATE_TABLES_SQL. This test fails fast if anyone adds another
  // partial index referencing a late-added column to the wrong block.
  describe('CREATE_TABLES_SQL must not depend on post-migration columns', () => {
    // Column → migration that introduced it. Extend whenever a new column
    // is added by an ALTER TABLE migration AND becomes referenced by an
    // index/trigger that we want to bootstrap on fresh installs.
    const POST_BOOTSTRAP_COLUMNS: Array<[string, string]> = [
      ['pin_x',      'V23→V24'],
      ['pin_y',      'V23→V24'],
      ['sort_order', 'V21→V22'],
    ]

    it.each(POST_BOOTSTRAP_COLUMNS)(
      '%s (added in %s) is not referenced in CREATE_TABLES_SQL',
      (col) => {
        // Only flag the column when used in a clause that would evaluate
        // immediately on existing tables (WHERE, partial-index predicate,
        // CHECK). A bare CREATE TABLE column declaration is fine.
        const dangerousRe = new RegExp(`(WHERE|CHECK)\\b[^;]*\\b${col}\\b`, 'i')
        expect(
          CREATE_TABLES_SQL,
          `${col} is referenced in a WHERE/CHECK clause inside CREATE_TABLES_SQL — this will fail on legacy DBs whose notes table predates the v24 migration. Move the index/check into CREATE_POST_MIGRATION_INDEXES_SQL.`
        ).not.toMatch(dangerousRe)
      }
    )

    it('CREATE_POST_MIGRATION_INDEXES_SQL uses IF NOT EXISTS so it stays idempotent across launches', () => {
      // The post-migration block runs every init (both fresh and migrated),
      // so each statement must be safely re-runnable.
      const stmts = CREATE_POST_MIGRATION_INDEXES_SQL
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'))
      for (const stmt of stmts) {
        if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(stmt)) {
          expect(stmt, `Statement is not idempotent: ${stmt}`).toMatch(/IF\s+NOT\s+EXISTS/i)
        }
      }
    })
  })

  it('V31→V32 adds grid_visible / grid_thickness / grid_color to maps', () => {
    // Guards against accidentally dropping one of the three columns the
    // renderer now requires (src/shared/ipc-types.ts MapRecord).
    const sql = MIGRATE_V31_TO_V32
    expect(sql).toMatch(/ALTER\s+TABLE\s+maps\s+ADD\s+COLUMN\s+grid_visible/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+maps\s+ADD\s+COLUMN\s+grid_thickness/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+maps\s+ADD\s+COLUMN\s+grid_color/i)
    // Defaults must stay so legacy rows satisfy NOT NULL without a backfill.
    expect(sql).toMatch(/grid_visible\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1/i)
    expect(sql).toMatch(/grid_thickness\s+REAL\s+NOT\s+NULL\s+DEFAULT\s+1\.0/i)
    expect(sql).toMatch(/grid_color\s+TEXT\s+NOT\s+NULL\s+DEFAULT/i)
  })

  it('CREATE_TABLES_SQL for a fresh install ships the v32 grid columns', () => {
    // Fresh installs skip the migration chain and run CREATE_TABLES_SQL;
    // if that forgets the new columns, only upgraders get them.
    expect(CREATE_TABLES_SQL).toMatch(/maps[\s\S]*grid_visible/i)
    expect(CREATE_TABLES_SQL).toMatch(/maps[\s\S]*grid_thickness/i)
    expect(CREATE_TABLES_SQL).toMatch(/maps[\s\S]*grid_color/i)
  })

  it('database.ts applies migrations in ascending order', () => {
    const dbSource = readFileSync(
      resolve(__dirname, '../main/db/database.ts'),
      'utf8'
    )

    // Find positions of each "if (version < N) migrate(MIGRATE_VX_TO_VY)" call
    const positions: number[] = []
    for (const { to, name } of CHAIN) {
      const exportName = `MIGRATE_${name.replace('→', '_TO_')}`
      const idx = dbSource.indexOf(exportName)
      expect(idx, `${exportName} not found in database.ts`).toBeGreaterThan(-1)
      positions.push(idx)
    }

    // Positions should be strictly increasing
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })
})
