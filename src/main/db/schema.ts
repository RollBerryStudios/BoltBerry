export const SCHEMA_VERSION = 7

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

export const CREATE_TABLES_SQL = `
-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
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
  rotation     INTEGER NOT NULL DEFAULT 0
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
  status_effects     TEXT
);

-- Initiative list
CREATE TABLE IF NOT EXISTS initiative (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id          INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  combatant_name  TEXT    NOT NULL,
  roll            INTEGER NOT NULL DEFAULT 0,
  current_turn    INTEGER NOT NULL DEFAULT 0
);

-- Notes (campaign-level or map-level)
CREATE TABLE IF NOT EXISTS notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id       INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  content      TEXT    NOT NULL DEFAULT '',
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, map_id)
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

-- Asset registry
CREATE TABLE IF NOT EXISTS assets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT    NOT NULL,
  stored_path   TEXT    NOT NULL,
  type          TEXT    NOT NULL,
  campaign_id   INTEGER REFERENCES campaigns(id)
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
`

export const SEED_SCHEMA_VERSION = `
INSERT OR IGNORE INTO schema_version (version) VALUES (7);
`
