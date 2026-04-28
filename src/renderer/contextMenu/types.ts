import type { TokenRecord, WallRecord, GMPinRecord, RoomRecord, DrawingRecord, MapRecord } from '@shared/ipc-types'

/**
 * Right-click target resolved by the context-menu engine. The `kind`
 * tag drives which menu sections render; the rest of the fields carry
 * the entity payload the items operate on.
 *
 * `list-row` covers sidebar rows (maps, bestiary, characters, …); the
 * `entity` field is intentionally generic so list authors can register
 * their own predicates without having to extend this union per kind.
 */
export type ContextTarget =
  | { kind: 'token'; token: TokenRecord; selection: number[] }
  | { kind: 'wall'; wall: WallRecord }
  | { kind: 'pin'; pin: GMPinRecord }
  | { kind: 'room'; room: RoomRecord }
  | { kind: 'drawing'; drawing: DrawingRecord }
  | { kind: 'map'; map: MapRecord }
  | { kind: 'list-row'; entity: string; payload: unknown }

/**
 * What the engine hands to every predicate / item handler. `primary`
 * is the foreground entity at the click point; `under` carries deeper
 * entities at the same point so a token-inside-room right-click can
 * append a "In Room" section after the token's own items.
 *
 * `pos` is map-space; `scenePos` is screen-space (used to position the
 * menu div). `closeMenu` lets items dismiss the menu after running an
 * action that doesn't already cause an unmount.
 */
export interface ContextEnvelope {
  primary: ContextTarget
  under: ContextTarget[]
  pos: { x: number; y: number }
  scenePos: { x: number; y: number }
  closeMenu: () => void
}

export interface MenuItem {
  /** Stable id; used as React key, analytics tag, and i18n fallback. */
  id: string
  /** i18next key for the user-visible label. */
  labelKey: string
  /** Optional emoji / icon shown at the start of the row. */
  icon?: string
  /** Display-only shortcut hint (e.g. "Del"). Not bound by the menu. */
  shortcut?: string
  /** Renders red + appears under a separator at the bottom. */
  danger?: boolean
  /** Submenu (one level only — see Phase 8 proposal §F.6). */
  submenu?: MenuItem[]
  /** When false the item is hidden. Pure — runs on every render. */
  show?: (env: ContextEnvelope) => boolean
  /** When false the item renders dimmed and rejects clicks. */
  enabled?: (env: ContextEnvelope) => boolean
  /** Click handler. May be async; the engine awaits the returned promise. */
  run?: (env: ContextEnvelope) => void | Promise<void>
}

export interface MenuSection {
  id: string
  /** Optional small-caps header rendered above the section. */
  headerKey?: string
  /** Hide the whole section when this returns false. */
  show?: (env: ContextEnvelope) => boolean
  items: MenuItem[]
}

/** Resolves to the section list for a given target kind. */
export type MenuResolver = (env: ContextEnvelope) => MenuSection[]
