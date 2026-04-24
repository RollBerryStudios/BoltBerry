/**
 * Shared default constants used on both the main and renderer side.
 *
 * Keep in sync with SQL column defaults declared in
 * `src/main/db/schema.ts`. Changing a value here without matching the
 * schema will cause newly created rows to drift from this constant.
 */

/** Grid line colour used when a map row has no explicit `grid_color`. */
export const DEFAULT_GRID_COLOR = 'rgba(255,255,255,0.34)'
