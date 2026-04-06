// ─── IPC Channel Names ────────────────────────────────────────────────────────
export const IPC = {
  // DM → Main → Player
  PLAYER_MAP_UPDATE: 'player:map-update',
  PLAYER_FOG_DELTA: 'player:fog-delta',
  PLAYER_TOKEN_UPDATE: 'player:token-update',
  PLAYER_BLACKOUT: 'player:blackout',
  PLAYER_ATMOSPHERE: 'player:atmosphere',
  PLAYER_FULL_SYNC: 'player:full-sync',
  PLAYER_INITIATIVE: 'player:initiative',
  PLAYER_WEATHER: 'player:weather',

  // DM ↔ Main
  GET_MONITORS: 'app:get-monitors',
  SET_PLAYER_MONITOR: 'app:set-player-monitor',
  OPEN_PLAYER_WINDOW: 'app:open-player-window',
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
} as const

// ─── Shared Data Types ────────────────────────────────────────────────────────

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
  cameraX: number | null
  cameraY: number | null
  cameraScale: number | null
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
}

export interface InitiativeEntry {
  id: number
  mapId: number
  combatantName: string
  roll: number
  currentTurn: boolean
}

export interface NoteRecord {
  id: number
  campaignId: number
  mapId: number | null
  content: string
  updatedAt: string
}

// ─── Player Window State (what gets synced) ───────────────────────────────────

export interface PlayerMapState {
  imagePath: string
  gridType: GridType
  gridSize: number
  rotation: number
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
}

export interface PlayerInitiativeEntry {
  name: string
  roll: number
  current: boolean
}

export interface FogDelta {
  type: 'reveal' | 'cover'
  shape: 'rect' | 'polygon'
  points: number[] // flat [x0,y0, x1,y1, ...] in canvas coords
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
}
