// ─── IPC Channel Names ─────────────────────────────────────────────────────────────────
export const IPC = {
  // DM → Main → Player
  PLAYER_MAP_UPDATE: 'player:map-update',
  PLAYER_FOG_DELTA: 'player:fog-delta',
  PLAYER_FOG_RESET: 'player:fog-reset',
  PLAYER_TOKEN_UPDATE: 'player:token-update',
  PLAYER_BLACKOUT: 'player:blackout',
  PLAYER_ATMOSPHERE: 'player:atmosphere',
  PLAYER_FULL_SYNC: 'player:full-sync',
  PLAYER_INITIATIVE: 'player:initiative',
  PLAYER_WEATHER: 'player:weather',

  // Player → Main → DM (internal sync handshake)
  PLAYER_REQUEST_SYNC: 'player:request-sync',
  DM_REQUEST_FULL_SYNC: 'dm:request-full-sync',
  DM_PLAYER_WINDOW_CLOSED: 'dm:player-window-closed',

  // DM ↔ Main
  GET_MONITORS: 'app:get-monitors',
  SET_PLAYER_MONITOR: 'app:set-player-monitor',
  OPEN_PLAYER_WINDOW: 'app:open-player-window',
  CLOSE_PLAYER_WINDOW: 'app:close-player-window',
  IMPORT_FILE: 'app:import-file',
  IMPORT_PDF: 'app:import-pdf',
  SAVE_ASSET_IMAGE: 'app:save-asset-image',
  EXPORT_CAMPAIGN: 'app:export-campaign',
  IMPORT_CAMPAIGN: 'app:import-campaign',
  DUPLICATE_CAMPAIGN: 'app:duplicate-campaign',
  SAVE_NOW: 'app:save-now',

  // DB queries (renderer → main)
  DB_QUERY: 'db:query',
  DB_RUN: 'db:run',
  DB_RUN_BATCH: 'db:run-batch',

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

  // Context menu
  SHOW_CONTEXT_MENU: 'app:show-context-menu',

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
  createdAt: string
  updatedAt: string
}
