/**
 * Uniform-grid spatial index for wall / door / window segments.
 *
 * Built once per wall set (rebuild when the wall store changes) and
 * reused across every `computeVisibilityPolygon` call. The payoff is
 * the inner ray → segment loop in `losEngine.ts`: a 200-wall map runs
 * ~20 angles × 200 segments = 4000 ray/segment tests per visibility
 * polygon. With an index we only test segments in the handful of cells
 * the ray actually crosses.
 *
 * Closes audit findings #56 (O(angles × walls)) and #70 (missing
 * early-exit for opaque hits).
 *
 * Implementation notes:
 *
 *  - We use the "supercover" flavour of Bresenham so a segment is
 *    registered in **every** cell its geometry touches — missing a
 *    grazing-corner cell would cause the ray to miss the segment.
 *  - Ray traversal uses Amanatides & Woo (1987) voxel walk, which
 *    visits cells in order of increasing parametric `t` along the ray.
 *    That means we can short-circuit as soon as the closest hit so far
 *    is guaranteed closer than any segment still ahead of us.
 *  - Duplicate hits are harmless — the caller already keeps `minT`.
 */

import type { Segment } from './losEngine'

export interface WallIndex {
  cellSize: number
  cols: number
  rows: number
  /** origin.x / origin.y for cell (0,0). Segments below the map origin still index into negative cells via `originX / originY`. */
  originX: number
  originY: number
  /** `buckets[row * cols + col]` → segment indices that touch that cell. */
  buckets: (number[] | undefined)[]
  segments: Segment[]
}

/**
 * Pick a cell size that keeps the per-cell segment count bounded for
 * typical maps. Smaller cells = fewer segments per cell but more cells
 * walked per ray; larger cells = the opposite. `256` px (≈4 grid squares
 * on a 64-px grid map) is a reasonable middle ground for the dungeon-
 * sized scenes BoltBerry targets.
 */
const DEFAULT_CELL_SIZE = 256

export function buildWallIndex(
  segments: readonly Segment[],
  imgW: number,
  imgH: number,
  cellSize = DEFAULT_CELL_SIZE,
): WallIndex {
  // The map origin is (0, 0) but segments may extend slightly outside
  // the bitmap (e.g. a wall drawn right up to the map edge). Pad the
  // grid by one cell on each side so we never miss one.
  const originX = -cellSize
  const originY = -cellSize
  const cols = Math.max(1, Math.ceil((imgW + 2 * cellSize) / cellSize))
  const rows = Math.max(1, Math.ceil((imgH + 2 * cellSize) / cellSize))
  const buckets: (number[] | undefined)[] = new Array(cols * rows)
  const idx: WallIndex = { cellSize, cols, rows, originX, originY, buckets, segments: [...segments] }

  for (let i = 0; i < segments.length; i++) {
    rasterizeSegment(idx, i, segments[i])
  }
  return idx
}

function bucketIndex(idx: WallIndex, col: number, row: number): number {
  return row * idx.cols + col
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** World-space → cell coords (can go out of range; callers must clamp). */
function toCell(idx: WallIndex, x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor((x - idx.originX) / idx.cellSize),
    row: Math.floor((y - idx.originY) / idx.cellSize),
  }
}

function pushToBucket(idx: WallIndex, col: number, row: number, segId: number) {
  if (col < 0 || col >= idx.cols || row < 0 || row >= idx.rows) return
  const key = bucketIndex(idx, col, row)
  let arr = idx.buckets[key]
  if (!arr) {
    arr = []
    idx.buckets[key] = arr
  }
  // Avoid duplicate inserts — supercover rasterization revisits the
  // same cell from both axes on diagonals.
  if (arr[arr.length - 1] !== segId) arr.push(segId)
}

/**
 * Register every cell the segment touches. Uses supercover DDA so
 * neither endpoint nor grazed corner cells are missed.
 */
function rasterizeSegment(idx: WallIndex, segId: number, seg: Segment) {
  const { cellSize } = idx
  const ax = seg.x1
  const ay = seg.y1
  const bx = seg.x2
  const by = seg.y2

  const start = toCell(idx, ax, ay)
  const end = toCell(idx, bx, by)

  if (start.col === end.col && start.row === end.row) {
    pushToBucket(idx, start.col, start.row, segId)
    return
  }

  // Supercover DDA. Walks from start → end visiting every cell the
  // segment line passes through.
  const dx = bx - ax
  const dy = by - ay
  const stepCol = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepRow = dy > 0 ? 1 : dy < 0 ? -1 : 0

  let col = start.col
  let row = start.row
  pushToBucket(idx, col, row, segId)

  // Next vertical grid line x coordinate along the ray.
  const cellLeft = idx.originX + col * cellSize
  const cellTop = idx.originY + row * cellSize
  let tMaxX = dx === 0
    ? Infinity
    : stepCol > 0
      ? ((cellLeft + cellSize) - ax) / dx
      : (cellLeft - ax) / dx
  let tMaxY = dy === 0
    ? Infinity
    : stepRow > 0
      ? ((cellTop + cellSize) - ay) / dy
      : (cellTop - ay) / dy
  const tDeltaX = dx === 0 ? Infinity : Math.abs(cellSize / dx)
  const tDeltaY = dy === 0 ? Infinity : Math.abs(cellSize / dy)

  // Guard against pathological segments producing an infinite loop.
  const maxSteps = idx.cols + idx.rows + 4
  let steps = 0
  while ((col !== end.col || row !== end.row) && steps < maxSteps) {
    if (tMaxX < tMaxY) {
      col += stepCol
      tMaxX += tDeltaX
    } else if (tMaxY < tMaxX) {
      row += stepRow
      tMaxY += tDeltaY
    } else {
      // Exact corner — visit both adjacent cells to keep supercover safe.
      pushToBucket(idx, col + stepCol, row, segId)
      pushToBucket(idx, col, row + stepRow, segId)
      col += stepCol
      row += stepRow
      tMaxX += tDeltaX
      tMaxY += tDeltaY
    }
    pushToBucket(idx, col, row, segId)
    steps += 1
  }
}

/**
 * Walk cells along the ray (ox,oy)→(ox+dx,oy+dy) and yield the union of
 * segment indices registered in those cells. Segments may repeat across
 * adjacent cells — the caller is expected to keep a running `minT`
 * rather than a `Set<number>`, matching the existing losEngine inner
 * loop which tolerates duplicate tests.
 *
 * `maxDistance` (in world units) bounds the walk; pass `Infinity` to
 * walk until the ray exits the grid.
 */
export function* traverseRayCells(
  idx: WallIndex,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDistance: number,
): Generator<number> {
  const { cellSize, cols, rows, originX, originY } = idx

  // Clamp observer into grid space so a light source just off-map still
  // traverses its own column/row of cells.
  const startCol = clamp(Math.floor((ox - originX) / cellSize), 0, cols - 1)
  const startRow = clamp(Math.floor((oy - originY) / cellSize), 0, rows - 1)

  const stepCol = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const stepRow = dy > 0 ? 1 : dy < 0 ? -1 : 0

  const cellLeft = originX + startCol * cellSize
  const cellTop = originY + startRow * cellSize
  let tMaxX = dx === 0
    ? Infinity
    : stepCol > 0
      ? ((cellLeft + cellSize) - ox) / dx
      : (cellLeft - ox) / dx
  let tMaxY = dy === 0
    ? Infinity
    : stepRow > 0
      ? ((cellTop + cellSize) - oy) / dy
      : (cellTop - oy) / dy
  const tDeltaX = dx === 0 ? Infinity : Math.abs(cellSize / dx)
  const tDeltaY = dy === 0 ? Infinity : Math.abs(cellSize / dy)

  let col = startCol
  let row = startRow
  const emitBucket = (c: number, r: number) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return undefined
    return idx.buckets[bucketIndex(idx, c, r)]
  }

  // Emit the starting cell first.
  const first = emitBucket(col, row)
  if (first) for (const id of first) yield id

  let t = 0
  while (t <= maxDistance) {
    if (tMaxX < tMaxY) {
      t = tMaxX
      col += stepCol
      tMaxX += tDeltaX
    } else {
      t = tMaxY
      row += stepRow
      tMaxY += tDeltaY
    }
    if (col < 0 || col >= cols || row < 0 || row >= rows) return
    const bucket = emitBucket(col, row)
    if (bucket) for (const id of bucket) yield id
  }
}
