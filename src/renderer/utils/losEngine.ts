/**
 * losEngine.ts — 2D ray-casting visibility polygon
 *
 * Given an observer position, a view radius and a list of wall segments,
 * computes the set of canvas pixels the observer can "see" and returns a
 * flat [x0,y0, x1,y1, …] polygon suitable for passing to Konva / Canvas2D.
 *
 * Algorithm:
 *  1. Gather all unique angles from the observer to every wall endpoint,
 *     plus ±ε offsets so we can peek around corners.
 *  2. For each angle, cast a ray from the observer. Find the closest
 *     intersection with any wall segment (open doors are ignored).
 *  3. Sort the intersection points by angle and connect them as a polygon.
 *
 * Coordinate system: map-image pixels (same as WallRecord x1/y1/x2/y2).
 *
 * Performance: optionally accepts a `WallIndex` (see `wallIndex.ts`) so
 * the inner ray/segment loop only tests walls in cells the ray crosses
 * instead of every wall on the map — audit findings #56 and #70.
 */

import type { WallIndex } from './wallIndex'
import { traverseRayCells } from './wallIndex'

export interface Segment {
  x1: number; y1: number
  x2: number; y2: number
  wallType: string
  doorState: string
}

interface Point { x: number; y: number }

const EPS = 1e-9
const ANGLE_OFFSETS = [-0.0001, 0, 0.0001]

// ─── Ray / segment intersection ──────────────────────────────────────────────

/**
 * Returns the parametric 't' along ray (ox,oy)→(ox+dx,oy+dy) where it
 * intersects segment (ax,ay)–(bx,by), or null if no intersection in [0,∞).
 */
function raySegmentIntersect(
  ox: number, oy: number, dx: number, dy: number,
  ax: number, ay: number, bx: number, by: number,
): number | null {
  const sx = bx - ax
  const sy = by - ay
  const denom = dx * sy - dy * sx
  if (Math.abs(denom) < EPS) return null          // parallel
  const t = ((ax - ox) * sy - (ay - oy) * sx) / denom
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom
  if (t < 0 || u < 0 || u > 1) return null
  return t
}

// ─── Effective wall segments (doors that are open are transparent) ───────────

function isBlocking(seg: Segment): boolean {
  if (seg.wallType === 'door' || seg.wallType === 'window') {
    return seg.doorState !== 'open'
  }
  return true
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Compute visibility polygon.
 *
 * @param ox        Observer x in map-image pixels
 * @param oy        Observer y in map-image pixels
 * @param radius    Maximum view radius in map-image pixels (0 = unlimited)
 * @param segments  Wall/door/window segments (map-image coords)
 * @param imgW      Map image width  (used to build bounding-box segments)
 * @param imgH      Map image height
 * @returns Flat [x0,y0, x1,y1, …] polygon; empty array on degenerate input
 */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  radius: number,
  segments: Segment[],
  imgW: number,
  imgH: number,
  index?: WallIndex,
): number[] {
  if (imgW <= 0 || imgH <= 0) return []

  // Bounding box clamps the polygon to the map image extents
  const r = radius > 0 ? radius : Math.max(imgW, imgH) * 2
  const halfW = r
  const halfH = r

  const bboxSegs: Segment[] = [
    { x1: ox - halfW, y1: oy - halfH, x2: ox + halfW, y2: oy - halfH, wallType: 'wall', doorState: 'closed' },
    { x1: ox + halfW, y1: oy - halfH, x2: ox + halfW, y2: oy + halfH, wallType: 'wall', doorState: 'closed' },
    { x1: ox + halfW, y1: oy + halfH, x2: ox - halfW, y2: oy + halfH, wallType: 'wall', doorState: 'closed' },
    { x1: ox - halfW, y1: oy + halfH, x2: ox - halfW, y2: oy - halfH, wallType: 'wall', doorState: 'closed' },
  ]

  const blockingSegs = segments.filter(isBlocking)
  const allSegs: Segment[] = [...bboxSegs, ...blockingSegs]

  // Collect angles to all wall endpoints
  const angles: number[] = []
  for (const seg of allSegs) {
    for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
      const a = Math.atan2(pt.y - oy, pt.x - ox)
      for (const offset of ANGLE_OFFSETS) angles.push(a + offset)
    }
  }

  // Cast ray at each angle and collect closest hit
  const hits: { angle: number; pt: Point }[] = []

  // When an index is supplied AND its segments match the input, walk
  // the spatial buckets along the ray instead of testing every blocking
  // segment. The bbox segments are observer-relative so they always go
  // through the brute path. Falling back to brute force when shapes
  // don't line up keeps the engine safe across stale-index races.
  const useIndex = !!index && index.segments === segments

  for (const angle of angles) {
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)

    // Bbox first — small (always 4) and always relevant for the polygon.
    let minT = Infinity
    for (const seg of bboxSegs) {
      const t = raySegmentIntersect(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2)
      if (t !== null && t < minT) minT = t
    }

    if (useIndex && index) {
      const tested = new Set<number>()
      for (const segId of traverseRayCells(index, ox, oy, dx, dy, minT)) {
        if (tested.has(segId)) continue
        tested.add(segId)
        const seg = index.segments[segId]
        if (!isBlocking(seg)) continue
        const t = raySegmentIntersect(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2)
        if (t !== null && t < minT) minT = t
      }
    } else {
      for (const seg of blockingSegs) {
        const t = raySegmentIntersect(ox, oy, dx, dy, seg.x1, seg.y1, seg.x2, seg.y2)
        if (t !== null && t < minT) minT = t
      }
    }

    if (minT === Infinity) continue

    hits.push({
      angle,
      pt: { x: ox + dx * minT, y: oy + dy * minT },
    })
  }

  if (hits.length < 3) return []

  // Sort by angle
  hits.sort((a, b) => a.angle - b.angle)

  // Flatten into [x0,y0, x1,y1, …]
  const poly: number[] = []
  for (const h of hits) {
    poly.push(h.pt.x, h.pt.y)
  }

  return poly
}
