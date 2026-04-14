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

  // DM → Player: camera viewport sync
  PLAYER_CAMERA: 'player:camera',

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
} as const

// ─── Shared Data Types ─────────────────────────────────────────────────────────────────

export type GridType = 'none' | 'square' | 'hex'
export type WeatherType = 'none' | 'rain' | 'snow' | 'fog' | 'wind'

export interface Campaign {
  id: number
  name: string
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
  rotation: number   // 0 | 90 | 180 | 270
  gridOffsetX: number  // pixel offset for grid alignment
  gridOffsetY: number  // pixel offset for grid alignment
  cameraX: number | null
  cameraY: number | null
  cameraScale: number | null
  ambientBrightness: number  // 0-100
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
  content: string
  updatedAt: string
}

// ─── Player Window State (what gets synced) ──────────────────────────────────────────

export interface PlayerMapState {
  imagePath: string
  gridType: GridType
  gridSize: number
  rotation: number
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

export interface PlayerCamera {
  imageCenterX: number
  imageCenterY: number
  relZoom: number // DM scale / DM fit-scale
}

export interface PlayerFullState {
  mode: 'map' | 'atmosphere' | 'blackout'
  map: PlayerMapState | null
  tokens: PlayerTokenState[]
  fogBitmap: string | null      // base64 PNG — "covered dim" canvas
  exploredBitmap: string | null // base64 PNG — "never explored" canvas
  atmosphereImagePath: string | null
  blackout: boolean
  drawings: PlayerDrawingState[]
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
