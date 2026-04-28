// ─── IPC Channel Names ─────────────────────────────────────────────────────────────────
export const IPC = {
  // DM → Main → Player
  PLAYER_MAP_UPDATE: 'player:map-update',
  PLAYER_FOG_DELTA: 'player:fog-delta',
  PLAYER_FOG_RESET: 'player:fog-reset',
  PLAYER_TOKEN_UPDATE: 'player:token-update',
  /**
   * Per-token delta broadcast. Replaces the "send the whole roster
   * every mutation" pattern on `PLAYER_TOKEN_UPDATE`, so a single HP
   * change or drag frame ships ~tens of bytes instead of re-serialising
   * every visible token. Snapshot path via `PLAYER_FULL_SYNC` /
   * `PLAYER_TOKEN_UPDATE` is retained for the initial handshake +
   * resync (audit #54 / #55 / WS-1).
   */
  PLAYER_TOKEN_DELTA: 'player:token-delta',
  PLAYER_BLACKOUT: 'player:blackout',
  PLAYER_ATMOSPHERE: 'player:atmosphere',
  PLAYER_FULL_SYNC: 'player:full-sync',
  PLAYER_INITIATIVE: 'player:initiative',
  PLAYER_WEATHER: 'player:weather',

  // Player → Main → DM (internal sync handshake)
  PLAYER_REQUEST_SYNC: 'player:request-sync',
  DM_REQUEST_FULL_SYNC: 'dm:request-full-sync',
  DM_PLAYER_WINDOW_CLOSED: 'dm:player-window-closed',
  /** Player → DM. Fires on connect and on every player-window resize so
   *  the DM-side Player Control Mode rectangle can lock to the player's
   *  exact aspect ratio. Eliminates the letterboxing/pillarboxing that
   *  otherwise appears when the dashed rect's aspect drifts away from
   *  the player window's. */
  PLAYER_WINDOW_SIZE: 'player:window-size',
  DM_PLAYER_WINDOW_SIZE: 'dm:player-window-size',

  // DM ↔ Main
  GET_MONITORS: 'app:get-monitors',
  SET_PLAYER_MONITOR: 'app:set-player-monitor',
  OPEN_PLAYER_WINDOW: 'app:open-player-window',
  CLOSE_PLAYER_WINDOW: 'app:close-player-window',
  IMPORT_FILE: 'app:import-file',
  IMPORT_PDF: 'app:import-pdf',
  SAVE_ASSET_IMAGE: 'app:save-asset-image',
  /** Persist a cropped character portrait to disk and return its
   *  absolute path. Deliberately separate from SAVE_ASSET_IMAGE so
   *  portraits don't pollute the `assets` table + don't carry a
   *  campaign-id scope. */
  SAVE_PORTRAIT: 'app:save-portrait',
  /** Remove a character portrait from disk. Called when the row is
   *  deleted so orphan PNGs don't accumulate under userData. */
  DELETE_PORTRAIT: 'app:delete-portrait',
  /** GC pass over `userData/assets/` — finds files with no DB
   *  reference. `dryRun: true` returns the counts without deleting
   *  so the UI can preview + confirm; `false` unlinks the orphans.
   *  Safe for repeat calls: referenced assets are never touched. */
  ASSET_CLEANUP: 'app:asset-cleanup',
  EXPORT_CAMPAIGN: 'app:export-campaign',
  IMPORT_CAMPAIGN: 'app:import-campaign',
  DUPLICATE_CAMPAIGN: 'app:duplicate-campaign',
  SAVE_NOW: 'app:save-now',

  // Campaigns domain — semantic replacements for raw `FROM campaigns`
  // / `INTO campaigns` / `UPDATE campaigns` SQL from the renderer.
  CAMPAIGNS_LIST: 'campaigns:list',
  CAMPAIGNS_GET: 'campaigns:get',
  CAMPAIGNS_COUNT: 'campaigns:count',
  CAMPAIGNS_CREATE: 'campaigns:create',
  CAMPAIGNS_RENAME: 'campaigns:rename',
  CAMPAIGNS_DELETE: 'campaigns:delete',
  CAMPAIGNS_SET_COVER: 'campaigns:set-cover',
  CAMPAIGNS_TOUCH_LAST_OPENED: 'campaigns:touch-last-opened',

  // Maps domain — semantic replacements for raw `FROM maps` SQL.
  MAPS_LIST: 'maps:list',
  MAPS_LIST_FOR_STATS: 'maps:list-for-stats',
  MAPS_LIST_RECENT: 'maps:list-recent',
  MAPS_COUNT: 'maps:count',
  MAPS_CREATE: 'maps:create',
  MAPS_RENAME: 'maps:rename',
  MAPS_DELETE: 'maps:delete',
  MAPS_SWAP_ORDER: 'maps:swap-order',
  MAPS_SET_GRID: 'maps:set-grid',
  MAPS_PATCH_GRID_DISPLAY: 'maps:patch-grid-display',
  MAPS_SET_ROTATION: 'maps:set-rotation',
  MAPS_SET_ROTATION_PLAYER: 'maps:set-rotation-player',
  MAPS_SET_CAMERA: 'maps:set-camera',
  MAPS_SET_AMBIENT_TRACK: 'maps:set-ambient-track',
  MAPS_SET_CHANNEL_VOLUME: 'maps:set-channel-volume',

  // Tokens domain — semantic replacements for raw `FROM tokens` SQL.
  TOKENS_LIST_BY_MAP: 'tokens:list-by-map',
  TOKENS_CREATE: 'tokens:create',
  TOKENS_RESTORE: 'tokens:restore',
  TOKENS_RESTORE_MANY: 'tokens:restore-many',
  TOKENS_UPDATE: 'tokens:update',
  TOKENS_UPDATE_MANY: 'tokens:update-many',
  TOKENS_DELETE: 'tokens:delete',
  TOKENS_DELETE_MANY: 'tokens:delete-many',

  // Initiative domain — semantic replacements for raw SQL against the
  // `initiative` table.
  INITIATIVE_LIST_BY_MAP: 'initiative:list-by-map',
  INITIATIVE_CREATE: 'initiative:create',
  INITIATIVE_UPDATE: 'initiative:update',
  INITIATIVE_UPDATE_MANY: 'initiative:update-many',
  INITIATIVE_DELETE: 'initiative:delete',
  INITIATIVE_DELETE_BY_MAP: 'initiative:delete-by-map',

  // Walls domain — semantic replacements for raw SQL against `walls`.
  WALLS_LIST_BY_MAP: 'walls:list-by-map',
  WALLS_CREATE: 'walls:create',
  WALLS_RESTORE: 'walls:restore',
  WALLS_UPDATE: 'walls:update',
  WALLS_DELETE: 'walls:delete',

  // Rooms domain — semantic replacements for raw SQL against `rooms`.
  ROOMS_LIST_BY_MAP: 'rooms:list-by-map',
  ROOMS_CREATE: 'rooms:create',
  ROOMS_RESTORE: 'rooms:restore',
  ROOMS_UPDATE: 'rooms:update',
  ROOMS_DELETE: 'rooms:delete',

  // Drawings domain — semantic replacements for raw SQL against `drawings`.
  DRAWINGS_LIST_BY_MAP: 'drawings:list-by-map',
  DRAWINGS_LIST_SYNCED_BY_MAP: 'drawings:list-synced-by-map',
  DRAWINGS_CREATE: 'drawings:create',
  DRAWINGS_CREATE_MANY: 'drawings:create-many',
  DRAWINGS_DELETE: 'drawings:delete',
  DRAWINGS_DELETE_BY_MAP: 'drawings:delete-by-map',

  // Encounters domain — semantic replacements for raw SQL against
  // the `encounters` table.
  ENCOUNTERS_LIST_BY_CAMPAIGN: 'encounters:list-by-campaign',
  ENCOUNTERS_CREATE: 'encounters:create',
  ENCOUNTERS_RENAME: 'encounters:rename',
  ENCOUNTERS_DELETE: 'encounters:delete',

  // Fog state — semantic replacements for raw SQL against `fog_state`.
  FOG_GET: 'fog:get',
  FOG_SAVE: 'fog:save',

  // GM Pins domain — semantic replacements for raw SQL against `gm_pins`.
  GM_PINS_LIST_BY_MAP: 'gm-pins:list-by-map',
  GM_PINS_CREATE: 'gm-pins:create',
  GM_PINS_UPDATE: 'gm-pins:update',
  GM_PINS_DELETE: 'gm-pins:delete',

  // Notes domain — semantic replacements for raw SQL against `notes`.
  NOTES_LIST_CATEGORY_BY_CAMPAIGN: 'notes:list-category-by-campaign',
  NOTES_LIST_CATEGORY_BY_MAP: 'notes:list-category-by-map',
  NOTES_CREATE: 'notes:create',
  NOTES_UPDATE: 'notes:update',
  NOTES_DELETE: 'notes:delete',

  // Handouts domain — semantic replacements for raw SQL against
  // the `handouts` table.
  HANDOUTS_LIST_BY_CAMPAIGN: 'handouts:list-by-campaign',
  HANDOUTS_COUNT_BY_CAMPAIGNS: 'handouts:count-by-campaigns',
  HANDOUTS_CREATE: 'handouts:create',
  HANDOUTS_DELETE: 'handouts:delete',

  // Character sheets domain — semantic replacements for raw SQL
  // against the `character_sheets` table.
  CHARACTER_SHEETS_LIST_BY_CAMPAIGN: 'character-sheets:list-by-campaign',
  /** Minimal-projection variant of LIST_BY_CAMPAIGN (BB-014). Returns
   *  only the fields needed for the panel/grid header so opening a
   *  campaign with 20+ richly populated sheets doesn't ship 1 MB of
   *  JSON across IPC. The full sheet loads lazily via GET. */
  CHARACTER_SHEETS_LIST_SUMMARY_BY_CAMPAIGN: 'character-sheets:list-summary-by-campaign',
  CHARACTER_SHEETS_GET: 'character-sheets:get',
  CHARACTER_SHEETS_LIST_PARTY_BY_CAMPAIGNS: 'character-sheets:list-party-by-campaigns',
  CHARACTER_SHEETS_COUNT: 'character-sheets:count',
  CHARACTER_SHEETS_CREATE: 'character-sheets:create',
  CHARACTER_SHEETS_UPDATE: 'character-sheets:update',
  CHARACTER_SHEETS_DELETE: 'character-sheets:delete',

  // Assets domain — read-only from the renderer; writes go through
  // the existing file-import handlers in app-handlers.ts.
  ASSETS_LIST_FOR_CAMPAIGN: 'assets:list-for-campaign',

  // Sessions — session lifecycle + dashboard stats.
  SESSIONS_START: 'sessions:start',
  SESSIONS_END_OPEN: 'sessions:end-open',
  SESSIONS_STATS_BY_CAMPAIGNS: 'sessions:stats-by-campaigns',

  // Token templates domain — semantic replacements for raw SQL
  // against the `token_templates` table (the user/SRD token library).
  TOKEN_TEMPLATES_LIST: 'token-templates:list',
  TOKEN_TEMPLATES_LIST_USER_NAMES: 'token-templates:list-user-names',
  TOKEN_TEMPLATES_CREATE: 'token-templates:create',
  TOKEN_TEMPLATES_UPDATE: 'token-templates:update',
  TOKEN_TEMPLATES_DELETE: 'token-templates:delete',

  // Audio boards + slots — soundboard CRUD.
  AUDIO_BOARDS_LIST_BY_CAMPAIGN: 'audio-boards:list-by-campaign',
  AUDIO_BOARDS_CREATE: 'audio-boards:create',
  AUDIO_BOARDS_RENAME: 'audio-boards:rename',
  AUDIO_BOARDS_DELETE: 'audio-boards:delete',
  AUDIO_BOARDS_UPSERT_SLOT: 'audio-boards:upsert-slot',
  AUDIO_BOARDS_DELETE_SLOT: 'audio-boards:delete-slot',

  // Tracks domain (v38) — canonical audio-library API. A track is its
  // own entity; channel memberships live in a separate join table the
  // MusicLibraryPanel renders as toggle badges.
  TRACKS_LIST_BY_CAMPAIGN:    'tracks:list-by-campaign',
  TRACKS_CREATE:              'tracks:create',
  TRACKS_UPDATE:              'tracks:update',
  TRACKS_DELETE:              'tracks:delete',
  TRACKS_TOGGLE_ASSIGNMENT:   'tracks:toggle-assignment',
  /** Open a multi-select file picker for audio files. Returns the
   *  list of relative paths under userData/assets/audio/ for files
   *  that were successfully copied + magic-byte-validated. Bulk
   *  variant of IMPORT_FILE so the DM can drag in 30 tracks in one
   *  click instead of running a 30-step file dialog dance. */
  IMPORT_AUDIO_FILES:         'app:import-audio-files',
  /** Open a folder picker; recursively scan for audio files; copy
   *  each one into userData/assets/audio/. Returns
   *  { folderName, files: [{ originalName, relativePath }] } so the
   *  caller can use the source folder name as the auto-soundtrack
   *  tag. */
  IMPORT_AUDIO_FOLDER:        'app:import-audio-folder',
  /** Single-file picker for a custom SFX slot icon. Copies into
   *  userData/assets/sfx-icons/ and returns the relative path. */
  IMPORT_SFX_ICON:            'app:import-sfx-icon',

  /** Generic save-to-disk helper used by every export flow (campaign,
   *  character, encounter, map, token template, soundtrack collection).
   *  Renderer hands over the prepared payload, main shows the save
   *  dialog, writes the file and returns the resulting path. Keeps
   *  every export consistent and avoids duplicating dialog code. */
  EXPORT_TO_FILE:             'app:export-to-file',
  /** Symmetric counterpart to EXPORT_TO_FILE. Main opens a file
   *  picker, reads the chosen file (size-bounded), returns its bytes
   *  to the renderer. The renderer parses + applies the payload. */
  IMPORT_FROM_FILE:           'app:import-from-file',

  // Campaign backup
  QUICK_BACKUP: 'app:quick-backup',

  // DM → Player: presentation overlay
  PLAYER_OVERLAY: 'player:overlay',

  // DM → Player: handout display
  PLAYER_HANDOUT: 'player:handout',

  // DM → Player: pointer ping
  PLAYER_POINTER: 'player:pointer',

  // DM → Player: Player Control Mode — independent viewport rectangle
  // on the GM scene that frames exactly what the player window shows.
  // Nullable payload: null exits the mode and the player falls back to
  // the camera / fit path.
  PLAYER_VIEWPORT: 'player:viewport',

  // DM → Player: measurement overlay
  PLAYER_MEASURE: 'player:measure',

  // DM → Player: drawing
  PLAYER_DRAWING: 'player:drawing',

  // DM → Player: wall list for LOS computation
  PLAYER_WALLS: 'player:walls',

  // Token delete confirmation
  DELETE_TOKEN_CONFIRM: 'app:delete-token-confirm',

  // Generic confirm dialog
  CONFIRM_DIALOG: 'app:confirm-dialog',

  // File system / settings
  GET_DEFAULT_USER_DATA_FOLDER: 'app:get-default-user-data-folder',
  SET_USER_DATA_FOLDER: 'app:set-user-data-folder',
  OPEN_CONTENT_FOLDER: 'app:open-content-folder',
  GET_IMAGE_AS_BASE64: 'app:get-image-as-base64',
  GET_USER_DATA_PATH: 'app:get-user-data-path',
  RESCAN_CONTENT_FOLDER: 'app:rescan-content-folder',
  DELETE_MAP_CONFIRM: 'app:delete-map-confirm',
  CHOOSE_FOLDER: 'app:choose-folder',

  // Native application menu
  SET_MENU_LANGUAGE: 'app:set-menu-language',
  MENU_ACTION: 'menu:action',

  // Compendium: bundled + user-supplied PDFs (SRD etc.)
  COMPENDIUM_LIST: 'compendium:list',
  COMPENDIUM_READ: 'compendium:read',
  COMPENDIUM_IMPORT: 'compendium:import',
  COMPENDIUM_OPEN_FOLDER: 'compendium:open-folder',

  // Token variants: bundled + user-supplied artwork per creature slug.
  TOKEN_VARIANTS_LIST: 'token-variants:list',
  TOKEN_VARIANTS_IMPORT: 'token-variants:import',
  TOKEN_VARIANTS_OPEN_FOLDER: 'token-variants:open-folder',
  /** Status of the first-run token-variant seed (BB-027). Renderer polls
   *  on startup to decide whether to surface a "library could not be
   *  seeded" toast. */
  TOKEN_VARIANTS_SEED_STATUS: 'token-variants:seed-status',

  // Bestiarium / reference data — bilingual SRD 5.1 monsters, items, spells.
  // The renderer never touches the JSON files directly; all reads go through
  // these handlers so the main process can resolve paths safely against
  // process.resourcesPath/data (packaged) or resources/data (dev).
  DATA_LIST_MONSTERS: 'data:list-monsters',
  DATA_GET_MONSTER: 'data:get-monster',
  DATA_GET_MONSTER_TOKEN: 'data:get-monster-token',
  /** Persist / clear the user's preferred portrait for a given slug. */
  DATA_SET_MONSTER_DEFAULT: 'data:set-monster-default',
  DATA_LIST_ITEMS: 'data:list-items',
  DATA_GET_ITEM: 'data:get-item',
  DATA_LIST_SPELLS: 'data:list-spells',
  DATA_GET_SPELL: 'data:get-spell',
  /** User-authored Wiki entries — monsters / items / spells the DM
   *  cloned from SRD or built from scratch. Shadows the bundled data
   *  by slug when both exist. */
  WIKI_UPSERT_USER_ENTRY: 'wiki:upsert-user-entry',
  WIKI_DELETE_USER_ENTRY: 'wiki:delete-user-entry',
} as const

export interface TokenVariant {
  /** Path relative to the user-data folder — usable directly with the
   *  existing getImageAsBase64 loader. */
  path: string
  /** File name with extension for display. */
  name: string
  /** Size in bytes. */
  size: number
  /** Distinguishes bundled seed art from user-added files. */
  source: 'bundled' | 'user'
}

// ─── Bestiarium data types (read-only SRD compendium) ─────────────────────
// Matches the schema written by the data-pipeline that produced
// resources/data/{monsters,items,spells}. Every human-readable string is
// bilingual (en/de) so the renderer can render either language without
// round-tripping through i18n.

export interface L10n {
  en: string
  de: string
}

export interface L10nArray {
  en: string[]
  de: string[]
}

export interface NamedText {
  name: string
  text: string
}

/** Row in resources/data/index.json — one per monster. Enough to render a
 *  list or filter the catalogue without opening the full JSON. */
export interface MonsterIndexEntry {
  id: number
  slug: string
  name: string
  nameDe?: string
  type: L10n
  challenge: string
  size: string
  tokenDefault: string | null
  tokenCount: number
  /** True when this entry originates from `user_wiki_entries` rather
   *  than the bundled dataset. Added to every index + detail record by
   *  the merge layer; the UI uses it to show the "Eigene" badge and
   *  enable delete / edit actions. */
  userOwned?: boolean
}

/** Row in resources/data/items-index.json. */
export interface ItemIndexEntry {
  id: number
  slug: string
  name: string
  nameDe?: string
  category: L10n
  rarity: L10n
  cost?: number | null
  userOwned?: boolean
}

/** Row in resources/data/spells-index.json. */
export interface SpellIndexEntry {
  id: number
  slug: string
  name: string
  nameDe?: string
  level: L10n
  school: L10n
  classes?: L10nArray
  userOwned?: boolean
}

/** Full monster.json. Legendary-action entries include a leading intro
 *  string in the EN locale, so the array is a union of strings and named
 *  entries — consumers should check typeof on each element. */
export interface MonsterRecord {
  id: number
  slug: string
  name: string
  nameDe?: string
  source: string
  meta: L10n
  challenge: string
  xp: number
  /** Dataset writes this as L10n for most creatures but a handful
   *  (banshee, goat, kobold, …) store a plain string like "12". Accept
   *  either so the detail view doesn't crash. */
  ac: L10n | string
  hp: L10n
  str: number; dex: number; con: number
  int: number; wis: number; cha: number
  strMod?: number; dexMod?: number; conMod?: number
  intMod?: number; wisMod?: number; chaMod?: number
  speed?: Partial<{
    run: { en: number; de: number }
    fly: { en: number; de: number }
    swim: { en: number; de: number }
    climb: { en: number; de: number }
    burrow: { en: number; de: number }
  }>
  senses?: L10nArray
  languages?: L10nArray
  /** Legacy shape: `["Kon +6", "Int +8"]` (already-formatted strings).
   *  New shape (banshee): `{ wis: 2, cha: 5 }` (ability → bonus). The
   *  renderer normalises via `formatSavingThrows`. */
  savingThrows?: string[] | Record<string, number>
  skills?: string[]
  traits?: { en: NamedText[]; de: NamedText[] }
  actions?: { en: Array<NamedText | string>; de: Array<NamedText | string> }
  legendaryActions?: { en: Array<NamedText | string>; de: Array<NamedText | string> }
  reactions?: { en: NamedText[]; de: NamedText[] }
  img?: string
  size: L10n
  type: L10n
  alignment: L10n
  token?: { file: string; variant: string }
  tokens?: Array<{ file: string; variant: string }>
  license: string
  licenseSource: string
  /** True for rows loaded from user_wiki_entries. */
  userOwned?: boolean
}

export interface ItemRecord {
  id: number
  slug: string
  name: string
  nameDe?: string
  category: L10n
  rarity: L10n
  cost?: number | null
  source?: L10n
  classification?: L10n | string
  description?: L10n | string
  damage?: string
  damageType?: L10n | string
  /** Dataset writes this as L10n (single string per locale) today, but
   *  historically we typed it as L10nArray. Allow both — consumers
   *  normalise via `propertiesAsText` in the renderer. */
  properties?: L10n | L10nArray | string
  stealth?: string
  /** Mostly "+1" / "+2" strings, but a few items (elven-chain) store
   *  the AC as an L10n object so the DE version can read "13+ Geschick…". */
  ac?: string | L10n
  /** Most items use int/float lb; a minority use a string ("2 lb"). */
  weight?: number | string | null
  image?: string
  license: string
  licenseSource: string
  userOwned?: boolean
}

export interface SpellRecord {
  id: number
  slug: string
  name: string
  nameDe?: string
  level: L10n
  school: L10n
  ritual?: boolean
  source?: string
  classes?: L10nArray
  type?: L10n | string
  castingTime?: L10n | string
  range?: L10n | string
  duration?: L10n | string
  components?: {
    verbal?: boolean
    somatic?: boolean
    material?: boolean
    raw?: L10n | string
  }
  description?: L10n | string
  higherLevels?: L10n | string
  image?: string
  license: string
  licenseSource: string
  userOwned?: boolean
}

/** A single token image belonging to a monster. `path` is the
 *  local-asset protocol URL so it can be used directly as an <img src>. */
export interface MonsterToken {
  file: string
  variant: string
  /** Safe URL loaded through the local-asset protocol. */
  path: string
}

export interface CompendiumFile {
  /** File name with extension, e.g. "srd-de-5.2.1.pdf" */
  name: string
  /** Absolute path on disk; used as the key when opening the file. */
  path: string
  /** 'bundled' = ships with the installer; 'user' = in <userData>/compendium/. */
  source: 'bundled' | 'user'
  /** Size in bytes, useful for display ("24 MB"). */
  size: number
}

// ─── Shared Data Types ─────────────────────────────────────────────────────────────────

export type GridType = 'none' | 'square' | 'hex'
export type WeatherType = 'none' | 'rain' | 'snow' | 'fog' | 'wind'

export interface Campaign {
  id: number
  name: string
  coverPath: string | null
  createdAt: string
  lastOpened: string
}

export interface MapRecord {
  id: number
  campaignId: number
  name: string
  imagePath: string
  gridType: GridType
  gridSize: number
  ftPerUnit: number  // feet per grid unit (e.g. 5 for D&D standard)
  orderIndex: number
  rotation: number         // 0 | 90 | 180 | 270 — DM view only
  rotationPlayer: number   // 0 | 90 | 180 | 270 — sent to player window
  gridOffsetX: number  // pixel offset for grid alignment
  gridOffsetY: number  // pixel offset for grid alignment
  cameraX: number | null
  cameraY: number | null
  cameraScale: number | null
  ambientBrightness: number  // 0-100
  ambientTrackPath: string | null
  track1Volume: number
  track2Volume: number
  combatVolume: number
  // Grid appearance — decoupled from gridType so the DM can hide the
  // grid without disabling snap/geometry, and restyle the stroke.
  gridVisible: boolean
  gridThickness: number   // multiplier applied to the auto-scaled stroke
  gridColor: string       // any CSS colour string (hex or rgba)
}

/** Minimal map projection used by the campaign-dashboard stats loader —
 *  just enough to count maps and pick the first thumbnail per campaign. */
export interface MapStatsRow {
  campaignId: number
  imagePath: string
  orderIndex: number
}

/** Minimal projection with the owning campaign's name, for the recent
 *  maps carousel on the dashboard. */
export interface RecentMapEntry {
  id: number
  name: string
  imagePath: string
  campaignId: number
  campaignName: string
}

export type AudioChannelKey = 'track1' | 'track2' | 'combat'

/**
 * v38 canonical shape: one track in a campaign's audio library. The
 * `assignments` array is empty for unassigned tracks; otherwise it
 * lists every channel this track is currently a member of.
 */
export interface TrackRecord {
  id: number
  campaignId: number
  path: string
  fileName: string
  /** 1:N grouping ("Combat", "Wald-Ambient", …). NULL = uncategorised. */
  soundtrack: string | null
  /** Cached duration in seconds. NULL until the renderer plays the
   *  track once and reports its duration back. */
  durationS: number | null
  /** Channel memberships. Order is stable per channel via the
   *  `position` column; the renderer can reorder via dedicated
   *  IPC if needed (Commit 2 will add that). */
  assignments: AudioChannelKey[]
}

export interface AudioBoardSlot {
  slotNumber: number   // 0–9
  emoji: string
  title: string
  audioPath: string | null
  /** v38: per-slot custom-icon image path (PNG / SVG / WebP). NULL
   *  falls back to `emoji`. */
  iconPath: string | null
  /** v38: per-slot volume 0–1. Multiplies with the global SFX
   *  volume. Default 1.0. */
  volume: number
  /** v38: per-slot loop flag. When true the SFX restarts from the
   *  beginning when it finishes. Default false. */
  isLoop: boolean
}

export interface AudioBoardRecord {
  id: number
  campaignId: number
  name: string
  sortOrder: number
  slots: AudioBoardSlot[]
}

export type WallType = 'wall' | 'door' | 'window'
export type DoorState = 'open' | 'closed' | 'locked'

export interface WallRecord {
  id: number
  mapId: number
  x1: number
  y1: number
  x2: number
  y2: number
  wallType: WallType
  doorState: DoorState
}

export interface TokenRecord {
  id: number
  mapId: number
  name: string
  imagePath: string | null
  x: number
  y: number
  size: number
  hpCurrent: number
  hpMax: number
  visibleToPlayers: boolean
  rotation: number
  locked: boolean
  zIndex: number
  markerColor: string | null
  ac: number | null
  notes: string | null
  statusEffects: string[] | null
  faction: string
  showName: boolean
  lightRadius: number
  lightColor: string
}

export interface EffectTimer {
  effectId: string
  roundsLeft: number
}

export interface InitiativeEntry {
  id: number
  mapId: number
  combatantName: string
  roll: number
  currentTurn: boolean
  tokenId: number | null
  effectTimers: EffectTimer[] | null
}

export interface NoteRecord {
  id: number
  campaignId: number
  mapId: number | null
  category: string
  title: string
  content: string
  pinX: number | null
  pinY: number | null
  /** Decoded JSON; null when the row has no tags assigned. */
  tags: string[] | null
  updatedAt: string
}

// ─── Player Window State (what gets synced) ──────────────────────────────────────────

export interface PlayerMapState {
  imagePath: string
  gridType: GridType
  gridSize: number
  rotation: number
  /** Per-map grid overlay styling. Optional so pre-v32 clients that
   *  only send the four original fields still render cleanly — the
   *  player falls back to visible + 1x thickness + the default colour. */
  gridVisible?: boolean
  gridThickness?: number
  gridColor?: string
}

/** GM-only pin on a map, for DM-side bookmarks and ping sources. */
export interface GMPinRecord {
  id: number
  mapId: number
  x: number
  y: number
  label: string
  icon: string
  color: string
}

/** Fog and explored bitmaps for a single map, both PNG data URLs. */
export interface FogStateRecord {
  fogBitmap: string | null
  exploredBitmap: string | null
}

export interface EncounterRecord {
  id: number
  campaignId: number
  name: string
  templateData: string  // JSON string
  notes: string | null
  createdAt: string
}

export type FormationType = 'saved' | 'line' | 'circle' | 'cluster' | 'wing' | 'v-formation'
export type DifficultyLevel = 'normal' | 'easy' | 'hard' | 'deadly'
export type RoomVisibility = 'hidden' | 'revealed' | 'dimmed'

export type DrawingType = 'freehand' | 'rect' | 'circle' | 'text'

export interface DrawingRecord {
  id: number
  mapId: number
  type: DrawingType
  /** Numeric array: `[x0, y0, x1, y1, …]` for freehand, `[x0, y0, x1, y1]`
   *  (start + end corners) for rect/circle, `[x, y]` for text. */
  points: number[]
  color: string
  width: number
  /** Only populated for `type: 'text'`. */
  text: string | null
  /** True when this drawing is broadcast to the player window. */
  synced: boolean
  /** Set when the row's `points` JSON could not be parsed (BB-028).
   *  The renderer can surface a "corrupted drawing" toast or repair UI
   *  without losing the entire drawing list. Absent in the common case. */
  corrupt?: boolean
}

export interface EncounterTemplate {
  tokens: Array<{
    name: string
    imagePath: string | null
    x: number
    y: number
    size: number
    hpCurrent: number
    hpMax: number
    faction: string
    ac: number | null
    visibleToPlayers: boolean
  }>
  walls: Array<{
    x1: number
    y1: number
    x2: number
    y2: number
    wallType: string
    doorState: string
  }>
  initiative: Array<{
    combatantName: string
    roll: number
    tokenId: number | null
  }>
  fogReveal?: Array<{
    type: 'reveal' | 'cover'
    shape: 'rect' | 'circle'
    points: number[]
  }>
  notes: string | null
  formation?: FormationType
  difficulty?: DifficultyLevel
  randomVariant?: boolean
  randomCount?: number
}

export interface RoomRecord {
  id: number
  mapId: number
  name: string
  description: string
  polygon: string          // JSON: Array<{x: number, y: number}> — closed polygon vertices
  visibility: RoomVisibility
  encounterId: number | null
  atmosphereHint: string | null
  notes: string | null
  color: string
  createdAt: string
}

export interface PlayerTokenState {
  id: number
  name: string
  imagePath: string | null
  x: number
  y: number
  size: number
  hpCurrent: number
  hpMax: number
  showName: boolean
  rotation: number
  markerColor: string | null
  statusEffects: string[] | null
  ac: number | null
  faction: string
  lightRadius: number
  lightColor: string
}

/**
 * Wire format for per-token delta broadcasts on `PLAYER_TOKEN_DELTA`.
 * `upsert` covers new + changed tokens, `remove` covers tokens that
 * left visibility (deleted or visibleToPlayers flipped off). The
 * player side merges upserts into its local id-keyed map and drops
 * ids in `remove`. Snapshot-style resets still go through
 * `PLAYER_TOKEN_UPDATE` / `PLAYER_FULL_SYNC`.
 */
export interface PlayerTokenDelta {
  upsert: PlayerTokenState[]
  remove: number[]
}

export interface PlayerMeasureState {
  type: 'line' | 'circle' | 'cone'
  startX: number
  startY: number
  endX: number
  endY: number
  distance: number
}

export interface PlayerInitiativeEntry {
  name: string
  roll: number
  current: boolean
}

export interface FogDelta {
  type: 'reveal' | 'cover'
  shape: 'rect' | 'polygon' | 'circle'
  points: number[] // flat [x0,y0, x1,y1, ...] in canvas coords; circle: [cx, cy, r]
}

export interface PlayerOverlay {
  text: string | null
  position: 'top' | 'center' | 'bottom'
  style: 'title' | 'subtitle' | 'caption'
}

export interface HandoutRecord {
  id: number
  campaignId: number
  title: string
  imagePath: string | null
  textContent: string | null
  createdAt: string
}

export interface PlayerHandout {
  title: string
  imagePath: string | null
  textContent: string | null
}

export interface PlayerPointer {
  x: number // map image coordinates
  y: number
}

/** Player Control Mode rectangle. All coordinates are in map-image
 *  pixels (the unrotated image space), so the frame is stable across
 *  the DM's own pan / zoom. Rotation is in degrees, clockwise, applied
 *  to the view content inside the rectangle (player sees the content
 *  rotated by `rotation`). The rectangle itself is axis-aligned in map
 *  space — rotation affects only the rendered orientation, not the
 *  hitbox of the frame on the DM canvas. */
export interface PlayerViewport {
  cx: number
  cy: number
  w: number
  h: number
  rotation: number
}

export interface PlayerFullState {
  /** 'idle' resets the player window to the BoltBerry "Warte auf den
   *  Spielleiter…" splash. The DM enters this state by toggling the
   *  session back to Prep mid-session — players should immediately
   *  stop seeing whatever was on screen. */
  mode: 'map' | 'atmosphere' | 'blackout' | 'idle'
  map: PlayerMapState | null
  tokens: PlayerTokenState[]
  fogBitmap: string | null      // base64 PNG — "covered dim" canvas
  exploredBitmap: string | null // base64 PNG — "never explored" canvas
  atmosphereImagePath: string | null
  blackout: boolean
  drawings: PlayerDrawingState[]
  /** Walls scoped to the active map. Included in full-sync so a player
   *  reconnecting mid-session doesn't have to wait for the separate
   *  PLAYER_WALLS broadcast to arrive before the LOS engine has its
   *  geometry — without this, the lighting layer briefly computes
   *  visibility against an empty wall set OR (after the first
   *  broadcast) against stale walls from the previous map. */
  walls?: PlayerWallState[]
  /** Optional: when present, the player window frames exactly this
   *  rectangle. Takes precedence over camera / fit on the player side. */
  viewport?: PlayerViewport | null
}

export interface PlayerDrawingState {
  id: number
  type: string
  points: number[]
  color: string
  width: number
  text?: string
}

// Minimal wall data sent to the player for LOS ray-casting
export interface PlayerWallState {
  x1: number
  y1: number
  x2: number
  y2: number
  wallType: string   // 'wall' | 'door' | 'window'
  doorState: string  // 'open' | 'closed' | 'locked'
}

// ─── Character Sheet (D&D 5e) ─────────────────────────────────────────────────

export interface CharacterAttack {
  name: string
  bonus: string
  damage: string
  damageType: string
  range: string
  notes: string
}

export interface CharacterSpellSlots {
  [level: number]: { total: number; used: number }
}

export interface CharacterSpells {
  [level: number]: string[]
}

export interface CharacterSavingThrows {
  str: boolean; dex: boolean; con: boolean
  int: boolean; wis: boolean; cha: boolean
}

export interface CharacterSkills {
  acrobatics: boolean; animalHandling: boolean; arcana: boolean
  athletics: boolean; deception: boolean; history: boolean
  insight: boolean; intimidation: boolean; investigation: boolean
  medicine: boolean; nature: boolean; perception: boolean
  performance: boolean; persuasion: boolean; religion: boolean
  sleightOfHand: boolean; stealth: boolean; survival: boolean
}

/** Minimal character-sheet projection used by the campaign-dashboard
 *  party avatar strip — just enough to render name + class + level. */
export interface CharacterPartyEntry {
  campaignId: number
  name: string
  className: string
  level: number
}

/** Lightweight projection of a CharacterSheet for the panel header /
 *  list view (BB-014). Excludes the JSON blob columns (savingThrows,
 *  skills, attacks, spells, spellSlots, features, equipment, notes,
 *  backstory, etc.) so the renderer can paint the sheet picker without
 *  paying ~50–80 KB per sheet up front. The full sheet is fetched on
 *  demand via CHARACTER_SHEETS_GET. */
export interface CharacterSheetSummary {
  id: number
  campaignId: number
  tokenId: number | null
  name: string
  race: string
  className: string
  level: number
  hpMax: number
  hpCurrent: number
  ac: number
  portraitPath: string | null
}

/** Row shape returned by the token-templates IPC. Snake_case mirrors
 *  the DB columns so the existing Token Library render code (which
 *  references `image_path`, `hp_max`, etc. throughout) works without
 *  a mass rename. `stat_block` is decoded from its stored JSON form. */
export interface TokenTemplateRow {
  id: number
  category: string
  source: string
  name: string
  image_path: string | null
  size: number
  hp_max: number
  ac: number | null
  speed: number | null
  cr: string | null
  creature_type: string | null
  faction: string
  marker_color: string | null
  notes: string | null
  stat_block: unknown | null
  slug: string | null
  created_at: string
}

export type AssetType = 'map' | 'token' | 'atmosphere' | 'handout' | 'audio'

export interface AssetEntry {
  id: number
  originalName: string
  storedPath: string
  type: AssetType
}

export interface SessionStatsEntry {
  campaignId: number
  count: number
  lastAt: string | null
}

export interface CharacterSheet {
  id: number
  campaignId: number
  tokenId: number | null
  name: string
  race: string
  className: string
  subclass: string
  level: number
  background: string
  alignment: string
  experience: number
  // ability scores
  str: number; dex: number; con: number
  intScore: number; wis: number; cha: number
  // HP / combat
  hpMax: number; hpCurrent: number; hpTemp: number
  ac: number; speed: number
  initiativeBonus: number; proficiencyBonus: number
  hitDice: string
  deathSavesSuccess: number; deathSavesFailure: number
  // JSON blobs
  savingThrows: CharacterSavingThrows
  skills: CharacterSkills
  // text fields
  languages: string; proficiencies: string
  features: string; equipment: string
  attacks: CharacterAttack[]
  spells: CharacterSpells
  spellSlots: CharacterSpellSlots
  personality: string; ideals: string; bonds: string; flaws: string
  backstory: string; notes: string
  inspiration: number
  passivePerception: number
  /** Circular-crop portrait stored as a PNG data URL (nullable; UI
   *  falls back to the first letter of the name when absent). */
  portraitPath: string | null
  createdAt: string
  updatedAt: string
}
