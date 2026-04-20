export const SCHEMA_VERSION = 34

// Migration: v1 → v2 — add explored_bitmap column to fog_state
export const MIGRATE_V1_TO_V2 = `
ALTER TABLE fog_state ADD COLUMN explored_bitmap BLOB;
UPDATE schema_version SET version = 2;
`

// Migration: v2 → v3 — add camera columns to maps
export const MIGRATE_V2_TO_V3 = `
ALTER TABLE maps ADD COLUMN camera_x REAL;
ALTER TABLE maps ADD COLUMN camera_y REAL;
ALTER TABLE maps ADD COLUMN camera_scale REAL;
UPDATE schema_version SET version = 3;
`

// Migration: v3 → v4 — add rotation, lock, z_index, marker_color, ac, notes to tokens
export const MIGRATE_V3_TO_V4 = `
ALTER TABLE tokens ADD COLUMN rotation    REAL    NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN locked      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN z_index     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN marker_color TEXT;
ALTER TABLE tokens ADD COLUMN ac          INTEGER;
ALTER TABLE tokens ADD COLUMN notes       TEXT;
UPDATE schema_version SET version = 4;
`

// Migration: v4 → v5 — add handouts table
export const MIGRATE_V4_TO_V5 = `
CREATE TABLE IF NOT EXISTS handouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL DEFAULT 'Handout',
  image_path   TEXT,
  text_content TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
UPDATE schema_version SET version = 5;
`

// Migration: v5 → v6 — add ft_per_unit to maps
export const MIGRATE_V5_TO_V6 = `
ALTER TABLE maps ADD COLUMN ft_per_unit REAL NOT NULL DEFAULT 5;
UPDATE schema_version SET version = 6;
`

// Migration: v6 → v7 — assets.campaign_id, maps.rotation, tokens.status_effects
export const MIGRATE_V6_TO_V7 = `
ALTER TABLE assets ADD COLUMN campaign_id INTEGER REFERENCES campaigns(id);
ALTER TABLE maps ADD COLUMN rotation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN status_effects TEXT;
UPDATE schema_version SET version = 7;
`

// Migration: v7 → v8 — GM pins table
export const MIGRATE_V7_TO_V8 = `
CREATE TABLE IF NOT EXISTS gm_pins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  x          REAL    NOT NULL DEFAULT 0,
  y          REAL    NOT NULL DEFAULT 0,
  label      TEXT    NOT NULL DEFAULT '',
  icon       TEXT    NOT NULL DEFAULT '📌',
  color      TEXT    NOT NULL DEFAULT '#f59e0b'
);
UPDATE schema_version SET version = 8;
`

// Migration: v8 → v9 — drawings table
export const MIGRATE_V8_TO_V9 = `
CREATE TABLE IF NOT EXISTS drawings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL DEFAULT 'freehand',
  points     TEXT    NOT NULL DEFAULT '[]',
  color      TEXT    NOT NULL DEFAULT '#f59e0b',
  width      REAL    NOT NULL DEFAULT 2,
  synced     INTEGER NOT NULL DEFAULT 0
);
UPDATE schema_version SET version = 9;
`

export const MIGRATE_V9_TO_V10 = `
ALTER TABLE maps ADD COLUMN grid_offset_x REAL NOT NULL DEFAULT 0;
ALTER TABLE maps ADD COLUMN grid_offset_y REAL NOT NULL DEFAULT 0;
UPDATE schema_version SET version = 10;
`

export const MIGRATE_V10_TO_V11 = `
ALTER TABLE tokens ADD COLUMN faction TEXT DEFAULT 'party';
ALTER TABLE tokens ADD COLUMN show_name INTEGER NOT NULL DEFAULT 1;
UPDATE schema_version SET version = 11;
`

export const MIGRATE_V11_TO_V12 = `
ALTER TABLE initiative ADD COLUMN token_id INTEGER REFERENCES tokens(id) ON DELETE SET NULL;
UPDATE schema_version SET version = 12;
`

export const MIGRATE_V12_TO_V13 = `
ALTER TABLE initiative ADD COLUMN effect_timers TEXT;
UPDATE schema_version SET version = 13;
`

export const MIGRATE_V13_TO_V14 = `
CREATE TABLE IF NOT EXISTS walls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  x1         REAL NOT NULL DEFAULT 0,
  y1         REAL NOT NULL DEFAULT 0,
  x2         REAL NOT NULL DEFAULT 0,
  y2         REAL NOT NULL DEFAULT 0,
  wall_type  TEXT NOT NULL DEFAULT 'wall',
  door_state TEXT NOT NULL DEFAULT 'closed'
);
ALTER TABLE maps ADD COLUMN ambient_brightness INTEGER NOT NULL DEFAULT 100;
UPDATE schema_version SET version = 14;
`

export const MIGRATE_V14_TO_V15 = `
CREATE TABLE IF NOT EXISTS encounters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL DEFAULT 'Encounter',
  template_data TEXT    NOT NULL DEFAULT '{}',
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
UPDATE schema_version SET version = 15;
`

export const MIGRATE_V15_TO_V16 = `
CREATE TABLE IF NOT EXISTS rooms (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id           INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL DEFAULT 'Neuer Raum',
  description      TEXT    NOT NULL DEFAULT '',
  polygon          TEXT    NOT NULL DEFAULT '[]',
  visibility        TEXT    NOT NULL DEFAULT 'hidden',
  encounter_id     INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
  atmosphere_hint  TEXT,
  notes            TEXT,
  color            TEXT    NOT NULL DEFAULT '#3b82f6',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
UPDATE schema_version SET version = 16;
`

// Migration: v16 → v17 — fix assets FK cascade, add drawings.text column
export const MIGRATE_V16_TO_V17 = `
ALTER TABLE drawings ADD COLUMN text TEXT;
CREATE TABLE IF NOT EXISTS assets_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT    NOT NULL,
  stored_path   TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  campaign_id   INTEGER REFERENCES campaigns(id) ON DELETE CASCADE
);
INSERT INTO assets_new SELECT * FROM assets;
DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;
UPDATE schema_version SET version = 17;
`

export const CREATE_TABLES_SQL = `
-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  cover_path  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_opened TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Maps (belong to a campaign)
CREATE TABLE IF NOT EXISTS maps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  image_path   TEXT    NOT NULL,
  grid_type    TEXT    NOT NULL DEFAULT 'square',
  grid_size    INTEGER NOT NULL DEFAULT 50,
  ft_per_unit  REAL    NOT NULL DEFAULT 5,
  order_index  INTEGER NOT NULL DEFAULT 0,
  camera_x     REAL,
  camera_y     REAL,
  camera_scale REAL,
  rotation     INTEGER NOT NULL DEFAULT 0,
  grid_offset_x REAL    NOT NULL DEFAULT 0,
  grid_offset_y REAL    NOT NULL DEFAULT 0,
  ambient_brightness INTEGER NOT NULL DEFAULT 100,
  ambient_track_path TEXT,
  track1_volume REAL NOT NULL DEFAULT 1.0,
  track2_volume REAL NOT NULL DEFAULT 1.0,
  combat_volume REAL NOT NULL DEFAULT 1.0,
  rotation_player INTEGER NOT NULL DEFAULT 0,
  grid_visible   INTEGER NOT NULL DEFAULT 1,
  grid_thickness REAL    NOT NULL DEFAULT 1.0,
  grid_color     TEXT    NOT NULL DEFAULT 'rgba(255,255,255,0.34)'
);

-- Fog of War bitmaps (one per map)
CREATE TABLE IF NOT EXISTS fog_state (
  map_id          INTEGER PRIMARY KEY REFERENCES maps(id) ON DELETE CASCADE,
  fog_bitmap      BLOB,
  explored_bitmap BLOB
);

-- Tokens
CREATE TABLE IF NOT EXISTS tokens (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id             INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name               TEXT    NOT NULL DEFAULT 'Token',
  image_path         TEXT,
  x                  REAL    NOT NULL DEFAULT 0,
  y                  REAL    NOT NULL DEFAULT 0,
  size               INTEGER NOT NULL DEFAULT 1,
  hp_current         INTEGER NOT NULL DEFAULT 0,
  hp_max             INTEGER NOT NULL DEFAULT 0,
  visible_to_players INTEGER NOT NULL DEFAULT 1,
  rotation           REAL    NOT NULL DEFAULT 0,
  locked             INTEGER NOT NULL DEFAULT 0,
  z_index            INTEGER NOT NULL DEFAULT 0,
  marker_color       TEXT,
  ac                 INTEGER,
  notes              TEXT,
  status_effects     TEXT,
  faction            TEXT    DEFAULT 'party',
  show_name          INTEGER NOT NULL DEFAULT 1,
  light_radius       INTEGER NOT NULL DEFAULT 0,
  light_color        TEXT    NOT NULL DEFAULT '#ffcc44'
);

-- Initiative list
CREATE TABLE IF NOT EXISTS initiative (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id          INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  combatant_name  TEXT    NOT NULL,
  roll            INTEGER NOT NULL DEFAULT 0,
  current_turn    INTEGER NOT NULL DEFAULT 0,
  token_id        INTEGER REFERENCES tokens(id) ON DELETE SET NULL,
  effect_timers   TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Notes (campaign-level with category, or map-level pin)
CREATE TABLE IF NOT EXISTS notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id       INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  category     TEXT    NOT NULL DEFAULT 'Allgemein',
  title        TEXT    NOT NULL DEFAULT '',
  content      TEXT    NOT NULL DEFAULT '',
  pin_x        REAL,
  pin_y        REAL,
  tags         TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Handouts
CREATE TABLE IF NOT EXISTS handouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL DEFAULT 'Handout',
  image_path   TEXT,
  text_content TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- GM Pins (DM-only map annotations)
CREATE TABLE IF NOT EXISTS gm_pins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  x          REAL    NOT NULL DEFAULT 0,
  y          REAL    NOT NULL DEFAULT 0,
  label      TEXT    NOT NULL DEFAULT '',
  icon       TEXT    NOT NULL DEFAULT '📌',
  color      TEXT    NOT NULL DEFAULT '#f59e0b'
);

-- Drawings (visible on both DM and player)
CREATE TABLE IF NOT EXISTS drawings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL DEFAULT 'freehand',
  points     TEXT    NOT NULL DEFAULT '[]',
  color      TEXT    NOT NULL DEFAULT '#f59e0b',
  width      REAL    NOT NULL DEFAULT 2,
  synced     INTEGER NOT NULL DEFAULT 0,
  text       TEXT
);

-- Walls, doors, windows (line-of-sight blockers)
CREATE TABLE IF NOT EXISTS walls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  x1         REAL    NOT NULL DEFAULT 0,
  y1         REAL    NOT NULL DEFAULT 0,
  x2         REAL    NOT NULL DEFAULT 0,
  y2         REAL    NOT NULL DEFAULT 0,
  wall_type  TEXT    NOT NULL DEFAULT 'wall',
  door_state TEXT    NOT NULL DEFAULT 'closed'
);

-- Encounters (reusable spawn templates)
CREATE TABLE IF NOT EXISTS encounters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL DEFAULT 'Encounter',
  template_data TEXT    NOT NULL DEFAULT '{}',
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Rooms (semantic map areas)
CREATE TABLE IF NOT EXISTS rooms (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id           INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL DEFAULT 'Neuer Raum',
  description      TEXT    NOT NULL DEFAULT '',
  polygon          TEXT    NOT NULL DEFAULT '[]',
  visibility        TEXT    NOT NULL DEFAULT 'hidden',
  encounter_id     INTEGER REFERENCES encounters(id) ON DELETE SET NULL,
  atmosphere_hint  TEXT,
  notes            TEXT,
  color            TEXT    NOT NULL DEFAULT '#3b82f6',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Asset registry
CREATE TABLE IF NOT EXISTS assets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT    NOT NULL,
  stored_path   TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  campaign_id   INTEGER REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Character sheets (D&D 5e)
CREATE TABLE IF NOT EXISTS character_sheets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token_id         INTEGER REFERENCES tokens(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL DEFAULT 'Charakter',
  race             TEXT    NOT NULL DEFAULT '',
  class_name       TEXT    NOT NULL DEFAULT '',
  subclass         TEXT    NOT NULL DEFAULT '',
  level            INTEGER NOT NULL DEFAULT 1,
  background       TEXT    NOT NULL DEFAULT '',
  alignment        TEXT    NOT NULL DEFAULT '',
  experience       INTEGER NOT NULL DEFAULT 0,
  str              INTEGER NOT NULL DEFAULT 10,
  dex              INTEGER NOT NULL DEFAULT 10,
  con              INTEGER NOT NULL DEFAULT 10,
  int_score        INTEGER NOT NULL DEFAULT 10,
  wis              INTEGER NOT NULL DEFAULT 10,
  cha              INTEGER NOT NULL DEFAULT 10,
  hp_max           INTEGER NOT NULL DEFAULT 0,
  hp_current       INTEGER NOT NULL DEFAULT 0,
  hp_temp          INTEGER NOT NULL DEFAULT 0,
  ac               INTEGER NOT NULL DEFAULT 10,
  speed            INTEGER NOT NULL DEFAULT 30,
  initiative_bonus INTEGER NOT NULL DEFAULT 0,
  proficiency_bonus INTEGER NOT NULL DEFAULT 2,
  hit_dice         TEXT    NOT NULL DEFAULT 'd8',
  death_saves_success INTEGER NOT NULL DEFAULT 0,
  death_saves_failure INTEGER NOT NULL DEFAULT 0,
  saving_throws    TEXT    NOT NULL DEFAULT '{}',
  skills           TEXT    NOT NULL DEFAULT '{}',
  languages        TEXT    NOT NULL DEFAULT '',
  proficiencies    TEXT    NOT NULL DEFAULT '',
  features         TEXT    NOT NULL DEFAULT '',
  equipment        TEXT    NOT NULL DEFAULT '',
  attacks          TEXT    NOT NULL DEFAULT '[]',
  spells           TEXT    NOT NULL DEFAULT '{}',
  spell_slots      TEXT    NOT NULL DEFAULT '{}',
  personality      TEXT    NOT NULL DEFAULT '',
  ideals           TEXT    NOT NULL DEFAULT '',
  bonds            TEXT    NOT NULL DEFAULT '',
  flaws            TEXT    NOT NULL DEFAULT '',
  backstory        TEXT    NOT NULL DEFAULT '',
  notes            TEXT    NOT NULL DEFAULT '',
  inspiration      INTEGER NOT NULL DEFAULT 0,
  passive_perception INTEGER NOT NULL DEFAULT 10,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Audio boards (per campaign, named SFX grids)
CREATE TABLE IF NOT EXISTS audio_boards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT 'Board',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Audio board slots (up to 10 per board)
CREATE TABLE IF NOT EXISTS audio_board_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER NOT NULL REFERENCES audio_boards(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK(slot_number BETWEEN 0 AND 9),
  emoji       TEXT,
  title       TEXT,
  audio_path  TEXT,
  UNIQUE(board_id, slot_number)
);

-- Token templates — reusable stat blocks grouped into three categories
-- ('monster', 'player', 'npc'). Seeded with SRD creatures on first run.
CREATE TABLE IF NOT EXISTS token_templates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category         TEXT    NOT NULL DEFAULT 'monster',
  source           TEXT    NOT NULL DEFAULT 'user',
  name             TEXT    NOT NULL,
  image_path       TEXT,
  size             INTEGER NOT NULL DEFAULT 1,
  hp_max           INTEGER NOT NULL DEFAULT 10,
  ac               INTEGER,
  speed            INTEGER,
  cr               TEXT,
  creature_type    TEXT,
  faction          TEXT    NOT NULL DEFAULT 'enemy',
  marker_color     TEXT,
  notes            TEXT,
  stat_block       TEXT,
  slug             TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, name)
);

-- Sessions: prep→session transitions logged here. Closed on session→prep.
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at     TEXT
);

-- Per-monster default token overrides (set from the Wiki). Maps a creature
-- slug to the file name of the preferred portrait, e.g.
-- ('aboleth', 'AbolethEel (3).webp'). Used by data:get-monster and by the
-- Wiki's hero portrait + spawn helpers so every surface picks the same art.
CREATE TABLE IF NOT EXISTS monster_defaults (
  slug       TEXT PRIMARY KEY,
  token_file TEXT NOT NULL
);

-- Schema version tracking (single-row enforced by PK constraint)
CREATE TABLE IF NOT EXISTS schema_version (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL
);

-- Indexes on foreign keys and frequently-queried columns.
-- Fresh installs seed at the current SCHEMA_VERSION, so none of the per-version
-- migrations that added these indexes (v17, v19, v20, v22) will ever run — we
-- must define them here or new databases silently lose every index.
CREATE INDEX IF NOT EXISTS idx_tokens_map_id ON tokens(map_id);
CREATE INDEX IF NOT EXISTS idx_initiative_map_id ON initiative(map_id);
CREATE INDEX IF NOT EXISTS idx_gm_pins_map_id ON gm_pins(map_id);
CREATE INDEX IF NOT EXISTS idx_drawings_map_id ON drawings(map_id);
CREATE INDEX IF NOT EXISTS idx_walls_map_id ON walls(map_id);
CREATE INDEX IF NOT EXISTS idx_rooms_map_id ON rooms(map_id);
CREATE INDEX IF NOT EXISTS idx_notes_campaign_map ON notes(campaign_id, map_id);
CREATE INDEX IF NOT EXISTS idx_handouts_campaign_id ON handouts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_encounters_campaign_id ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_assets_campaign_id ON assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_maps_campaign_id ON maps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_campaign_id ON character_sheets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_token_id ON character_sheets(token_id);
CREATE INDEX IF NOT EXISTS idx_audio_boards_campaign_id ON audio_boards(campaign_id);
CREATE INDEX IF NOT EXISTS idx_audio_board_slots_board_id ON audio_board_slots(board_id);
CREATE INDEX IF NOT EXISTS idx_token_templates_category ON token_templates(category);
CREATE INDEX IF NOT EXISTS idx_token_templates_source ON token_templates(source);
CREATE INDEX IF NOT EXISTS idx_token_templates_slug ON token_templates(slug);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON sessions(campaign_id) WHERE ended_at IS NULL;
`

// Indexes that reference columns added in later migrations (pin_x/pin_y landed
// in v24). Keeping them out of CREATE_TABLES_SQL prevents "no such column"
// errors when opening a legacy DB — CREATE TABLE IF NOT EXISTS is a no-op on
// the existing table, and the partial-index clause would evaluate before the
// migration adds the column. We apply these once, after migrations run.
export const CREATE_POST_MIGRATION_INDEXES_SQL = `
-- Partial unique index for category-level notes (those without pin coordinates).
-- SQLite treats NULL != NULL in UNIQUE, so COALESCE(map_id, 0) collapses
-- campaign-level notes (map_id IS NULL) into a single key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_category_unique
  ON notes(campaign_id, COALESCE(map_id, 0), category)
  WHERE pin_x IS NULL AND pin_y IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_map_pins ON notes(map_id) WHERE pin_x IS NOT NULL;
`

// Migration: v17 → v18 — add indexes on frequently-queried foreign keys
export const MIGRATE_V17_TO_V18 = `
CREATE INDEX IF NOT EXISTS idx_tokens_map_id ON tokens(map_id);
CREATE INDEX IF NOT EXISTS idx_initiative_map_id ON initiative(map_id);
CREATE INDEX IF NOT EXISTS idx_gm_pins_map_id ON gm_pins(map_id);
CREATE INDEX IF NOT EXISTS idx_drawings_map_id ON drawings(map_id);
CREATE INDEX IF NOT EXISTS idx_walls_map_id ON walls(map_id);
CREATE INDEX IF NOT EXISTS idx_rooms_map_id ON rooms(map_id);
CREATE INDEX IF NOT EXISTS idx_notes_campaign_map ON notes(campaign_id, map_id);
CREATE INDEX IF NOT EXISTS idx_handouts_campaign_id ON handouts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_encounters_campaign_id ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_assets_campaign_id ON assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_maps_campaign_id ON maps(campaign_id);
UPDATE schema_version SET version = 18;
`

// Migration: v18 → v19 — add dedicated light_radius and light_color columns to tokens
export const MIGRATE_V18_TO_V19 = `
ALTER TABLE tokens ADD COLUMN light_radius INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_color TEXT NOT NULL DEFAULT '#ffcc44';
UPDATE schema_version SET version = 19;
`

// Migration: v19 → v20 — add character_sheets table
export const MIGRATE_V19_TO_V20 = `
CREATE TABLE IF NOT EXISTS character_sheets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token_id         INTEGER REFERENCES tokens(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL DEFAULT 'Charakter',
  race             TEXT    NOT NULL DEFAULT '',
  class_name       TEXT    NOT NULL DEFAULT '',
  subclass         TEXT    NOT NULL DEFAULT '',
  level            INTEGER NOT NULL DEFAULT 1,
  background       TEXT    NOT NULL DEFAULT '',
  alignment        TEXT    NOT NULL DEFAULT '',
  experience       INTEGER NOT NULL DEFAULT 0,
  str              INTEGER NOT NULL DEFAULT 10,
  dex              INTEGER NOT NULL DEFAULT 10,
  con              INTEGER NOT NULL DEFAULT 10,
  int_score        INTEGER NOT NULL DEFAULT 10,
  wis              INTEGER NOT NULL DEFAULT 10,
  cha              INTEGER NOT NULL DEFAULT 10,
  hp_max           INTEGER NOT NULL DEFAULT 0,
  hp_current       INTEGER NOT NULL DEFAULT 0,
  hp_temp          INTEGER NOT NULL DEFAULT 0,
  ac               INTEGER NOT NULL DEFAULT 10,
  speed            INTEGER NOT NULL DEFAULT 30,
  initiative_bonus INTEGER NOT NULL DEFAULT 0,
  proficiency_bonus INTEGER NOT NULL DEFAULT 2,
  hit_dice         TEXT    NOT NULL DEFAULT 'd8',
  death_saves_success INTEGER NOT NULL DEFAULT 0,
  death_saves_failure INTEGER NOT NULL DEFAULT 0,
  saving_throws    TEXT    NOT NULL DEFAULT '{}',
  skills           TEXT    NOT NULL DEFAULT '{}',
  languages        TEXT    NOT NULL DEFAULT '',
  proficiencies    TEXT    NOT NULL DEFAULT '',
  features         TEXT    NOT NULL DEFAULT '',
  equipment        TEXT    NOT NULL DEFAULT '',
  attacks          TEXT    NOT NULL DEFAULT '[]',
  spells           TEXT    NOT NULL DEFAULT '{}',
  spell_slots      TEXT    NOT NULL DEFAULT '{}',
  personality      TEXT    NOT NULL DEFAULT '',
  ideals           TEXT    NOT NULL DEFAULT '',
  bonds            TEXT    NOT NULL DEFAULT '',
  flaws            TEXT    NOT NULL DEFAULT '',
  backstory        TEXT    NOT NULL DEFAULT '',
  notes            TEXT    NOT NULL DEFAULT '',
  inspiration      INTEGER NOT NULL DEFAULT 0,
  passive_perception INTEGER NOT NULL DEFAULT 10,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_character_sheets_campaign_id ON character_sheets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_token_id ON character_sheets(token_id);
UPDATE schema_version SET version = 20;
`

// Migration: v20 → v21 — audio system (map audio columns + boards/slots tables)
export const MIGRATE_V20_TO_V21 = `
ALTER TABLE maps ADD COLUMN ambient_track_path TEXT;
ALTER TABLE maps ADD COLUMN track1_volume REAL NOT NULL DEFAULT 1.0;
ALTER TABLE maps ADD COLUMN track2_volume REAL NOT NULL DEFAULT 1.0;
ALTER TABLE maps ADD COLUMN combat_volume REAL NOT NULL DEFAULT 1.0;
CREATE TABLE IF NOT EXISTS audio_boards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT 'Board',
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audio_board_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER NOT NULL REFERENCES audio_boards(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK(slot_number BETWEEN 0 AND 9),
  emoji       TEXT,
  title       TEXT,
  audio_path  TEXT,
  UNIQUE(board_id, slot_number)
);
CREATE INDEX IF NOT EXISTS idx_audio_boards_campaign_id ON audio_boards(campaign_id);
CREATE INDEX IF NOT EXISTS idx_audio_board_slots_board_id ON audio_board_slots(board_id);
UPDATE schema_version SET version = 21;
`

// Migration: v21 → v22 — add sort_order to initiative for persistent manual ordering
export const MIGRATE_V21_TO_V22 = `
ALTER TABLE initiative ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE initiative SET sort_order = rowid;
UPDATE schema_version SET version = 22;
`

// Migration: v22 → v23 — add category column to notes, recreate with new UNIQUE constraint
export const MIGRATE_V22_TO_V23 = `
CREATE TABLE notes_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id       INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  category     TEXT    NOT NULL DEFAULT 'Allgemein',
  content      TEXT    NOT NULL DEFAULT '',
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, map_id, category)
);
INSERT INTO notes_new (campaign_id, map_id, category, content, updated_at)
  SELECT campaign_id, map_id, 'Allgemein', content, updated_at FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;
CREATE INDEX IF NOT EXISTS idx_notes_campaign_map ON notes(campaign_id, map_id);
UPDATE schema_version SET version = 23;
`

// Migration: v23 → v24 — add rotation_player to maps, add title/pin_x/pin_y to notes,
// replace the broken UNIQUE(campaign_id, map_id, category) with a partial unique
// index that handles NULL map_id correctly, and add a pin-lookup index.
export const MIGRATE_V23_TO_V24 = `
ALTER TABLE maps ADD COLUMN rotation_player INTEGER NOT NULL DEFAULT 0;

CREATE TABLE notes_v24 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id       INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  category     TEXT    NOT NULL DEFAULT 'Allgemein',
  title        TEXT    NOT NULL DEFAULT '',
  content      TEXT    NOT NULL DEFAULT '',
  pin_x        REAL,
  pin_y        REAL,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO notes_v24 (id, campaign_id, map_id, category, content, updated_at)
  SELECT id, campaign_id, map_id, category, content, updated_at FROM notes;
DROP TABLE notes;
ALTER TABLE notes_v24 RENAME TO notes;

CREATE INDEX IF NOT EXISTS idx_notes_campaign_map ON notes(campaign_id, map_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_category_unique
  ON notes(campaign_id, COALESCE(map_id, 0), category)
  WHERE pin_x IS NULL AND pin_y IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_map_pins ON notes(map_id) WHERE pin_x IS NOT NULL;

UPDATE schema_version SET version = 24;
`

// Migration: v24 → v25
// 1. Drop the partial unique index on notes so multiple notes can coexist
//    per (campaign, map, category). The categories (Allgemein, NSCs, Orte,
//    Quests, Gegenstände, Sonstiges) are now *folders*, not single docs.
// 2. Add the token_templates library: reusable stat blocks grouped by
//    category ('monster' | 'player' | 'npc'). Seeded by the main process
//    with SRD creatures on first launch.
export const MIGRATE_V24_TO_V25 = `
DROP INDEX IF EXISTS idx_notes_category_unique;

CREATE TABLE IF NOT EXISTS token_templates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category         TEXT    NOT NULL DEFAULT 'monster',
  source           TEXT    NOT NULL DEFAULT 'user',
  name             TEXT    NOT NULL,
  image_path       TEXT,
  size             INTEGER NOT NULL DEFAULT 1,
  hp_max           INTEGER NOT NULL DEFAULT 10,
  ac               INTEGER,
  speed            INTEGER,
  cr               TEXT,
  creature_type    TEXT,
  faction          TEXT    NOT NULL DEFAULT 'enemy',
  marker_color     TEXT,
  notes            TEXT,
  stat_block       TEXT,
  slug             TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, name)
);
CREATE INDEX IF NOT EXISTS idx_token_templates_category ON token_templates(category);
CREATE INDEX IF NOT EXISTS idx_token_templates_source ON token_templates(source);

UPDATE schema_version SET version = 25;
`

// Migration: v25 → v26 — add token_templates.slug so the renderer can
// resolve artwork folders (resources/token-variants/<slug>/ → user copy).
// Backfilled by the seed step, which UPDATEs slug for SRD rows that
// pre-exist from v25 without one.
export const MIGRATE_V25_TO_V26 = `
ALTER TABLE token_templates ADD COLUMN slug TEXT;
CREATE INDEX IF NOT EXISTS idx_token_templates_slug ON token_templates(slug);
UPDATE schema_version SET version = 26;
`

// Migration: v26 → v27 — retire two seeded rows whose names are not part
// of the SRD 5.2.1 CC-BY-4.0 release (Beholder, Mind Flayer). Only rows
// still untouched by the user (source='srd', name unchanged) are removed;
// anyone who renamed or otherwise edited the row keeps their copy.
export const MIGRATE_V26_TO_V27 = `
DELETE FROM token_templates
 WHERE source = 'srd'
   AND name IN ('Beholder', 'Mind Flayer');
UPDATE schema_version SET version = 27;
`

// Migration: v27 → v28 — replace the Lich seed with Stone Golem. Lich is
// SRD-legal but the upstream too-many-tokens-dnd repo has no entries for
// it, so the row had no bundled art. Stone Golem (CR 10, construct) fills
// the boss slot with a different archetype and ships with five variants.
// Same pattern as v27: only deletes the row if untouched.
export const MIGRATE_V27_TO_V28 = `
DELETE FROM token_templates
 WHERE source = 'srd'
   AND name = 'Lich';
UPDATE schema_version SET version = 28;
`

// Migration: v28 → v29 — add notes.tags (JSON array of strings) so users
// can tag notes across categories. NULL or '[]' = no tags.
export const MIGRATE_V28_TO_V29 = `
ALTER TABLE notes ADD COLUMN tags TEXT;
CREATE INDEX IF NOT EXISTS idx_notes_campaign ON notes(campaign_id);
UPDATE schema_version SET version = 29;
`

// Migration: v29 → v30 — add campaigns.cover_path. Stores a userData-
// relative path to an image the user has set as the campaign's cover;
// rendered by Welcome, Workspace hero, and campaign cards. NULL falls
// back to the first map's thumbnail (existing behavior).
export const MIGRATE_V29_TO_V30 = `
ALTER TABLE campaigns ADD COLUMN cover_path TEXT;
UPDATE schema_version SET version = 30;
`

// Migration: v30 → v31 — sessions log. Each row is one prep→session
// transition; ended_at is filled on session→prep or when the campaign
// closes. Surfaces as session count + last-played in Welcome/Workspace.
export const MIGRATE_V30_TO_V31 = `
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_open ON sessions(campaign_id) WHERE ended_at IS NULL;
UPDATE schema_version SET version = 31;
`

// Migration: v31 → v32 — per-map grid visibility / thickness / colour. The
// three existing columns (grid_type, grid_size, grid_offset_*) only cover
// geometry; the DM couldn't hide the grid without setting type='none'
// (which also disabled snap) nor adjust stroke opacity or colour.
export const MIGRATE_V31_TO_V32 = `
ALTER TABLE maps ADD COLUMN grid_visible   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE maps ADD COLUMN grid_thickness REAL    NOT NULL DEFAULT 1.0;
ALTER TABLE maps ADD COLUMN grid_color     TEXT    NOT NULL DEFAULT 'rgba(255,255,255,0.34)';
UPDATE schema_version SET version = 32;
`

// Migration: v32 → v33 — retire the hand-curated 25-creature SRD seed and
// let the new data-driven seeder (reading from resources/data/) populate
// token_templates from the full 263-creature bilingual SRD dataset. We
// purge only rows where the user hasn't touched the name (a rename bumps
// the row out of the predicate), so anyone who tweaked a seeded row keeps
// their copy. The new seeder runs at startup and is idempotent via
// UNIQUE(source, name).
export const MIGRATE_V32_TO_V33 = `
DELETE FROM token_templates WHERE source = 'srd';
UPDATE schema_version SET version = 33;
`

// Migration: v33 → v34 — per-monster default token override. DMs use the
// Wiki to pick which variant of a creature is their canonical portrait;
// we persist that choice here so spawning (from the Wiki, the Token
// Library, or the Encounter builder) picks the same image and the hero
// portrait stays consistent across sessions.
export const MIGRATE_V33_TO_V34 = `
CREATE TABLE IF NOT EXISTS monster_defaults (
  slug       TEXT PRIMARY KEY,
  token_file TEXT NOT NULL
);
UPDATE schema_version SET version = 34;
`

// Use the SCHEMA_VERSION constant directly so there's a single source of truth.
// The old template hard-coded the version number, inviting drift.
export const SEED_SCHEMA_VERSION = `INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, ${SCHEMA_VERSION});`
