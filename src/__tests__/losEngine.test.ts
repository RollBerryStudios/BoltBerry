/**
 * losEngine.test.ts
 *
 * Unit tests for the 2D ray-casting visibility polygon.
 * Tests are written against the public API:
 *   computeVisibilityPolygon(ox, oy, radius, segments, imgW, imgH) → number[]
 *
 * Coordinate system: map-image pixels, Y-down (same as Konva canvas).
 */

import { describe, it, expect } from 'vitest'
import { computeVisibilityPolygon, type Segment } from '@renderer/utils/losEngine'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert flat [x0,y0, x1,y1, …] array into array of {x,y} points */
function toPoints(poly: number[]): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i < poly.length; i += 2) {
    pts.push({ x: poly[i], y: poly[i + 1] })
  }
  return pts
}

/** True if the point (px, py) is inside the polygon (ray-casting method) */
function pointInPolygon(px: number, py: number, poly: number[]): boolean {
  const pts = toPoints(poly)
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y
    const xj = pts[j].x, yj = pts[j].y
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Compute the approximate area of the visibility polygon using the shoelace formula.
 * Useful to assert that walls reduce visible area.
 */
function polygonArea(poly: number[]): number {
  const pts = toPoints(poly)
  const n = pts.length
  let area = 0
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += pts[j].x * pts[i].y
    area -= pts[i].x * pts[j].y
  }
  return Math.abs(area) / 2
}

// ── Segments ─────────────────────────────────────────────────────────────────

const wall = (x1: number, y1: number, x2: number, y2: number): Segment => ({
  x1, y1, x2, y2, wallType: 'wall', doorState: 'closed',
})

const door = (
  x1: number, y1: number, x2: number, y2: number,
  state: 'open' | 'closed',
): Segment => ({
  x1, y1, x2, y2, wallType: 'door', doorState: state,
})

const windowSeg = (
  x1: number, y1: number, x2: number, y2: number,
  state: 'open' | 'closed',
): Segment => ({
  x1, y1, x2, y2, wallType: 'window', doorState: state,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeVisibilityPolygon — degenerate input', () => {
  it('returns empty array for zero-size map', () => {
    expect(computeVisibilityPolygon(50, 50, 0, [], 0, 0)).toEqual([])
    expect(computeVisibilityPolygon(50, 50, 0, [], 0, 100)).toEqual([])
    expect(computeVisibilityPolygon(50, 50, 0, [], 100, 0)).toEqual([])
  })

  it('returns a non-empty polygon for an open field (no walls)', () => {
    const poly = computeVisibilityPolygon(500, 500, 0, [], 1000, 1000)
    expect(poly.length).toBeGreaterThan(0)
    expect(poly.length % 2).toBe(0)   // always paired x,y coordinates
  })

  it('polygon has at least 3 points in an open field', () => {
    const poly = computeVisibilityPolygon(500, 500, 0, [], 1000, 1000)
    expect(toPoints(poly).length).toBeGreaterThanOrEqual(3)
  })
})

describe('computeVisibilityPolygon — open field', () => {
  const W = 1000, H = 1000
  const ox = 500, oy = 500   // observer at centre

  it('observer position is inside its own visibility polygon', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, [], W, H)
    expect(pointInPolygon(ox, oy, poly)).toBe(true)
  })

  it('a point 50px away from the observer is visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, [], W, H)
    expect(pointInPolygon(ox + 50, oy, poly)).toBe(true)
    expect(pointInPolygon(ox, oy + 50, poly)).toBe(true)
    expect(pointInPolygon(ox - 50, oy, poly)).toBe(true)
    expect(pointInPolygon(ox, oy - 50, poly)).toBe(true)
  })

  it('the open-field polygon contains the map edges', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, [], W, H)
    // Near-edge points should be visible
    expect(pointInPolygon(5, 5, poly)).toBe(true)
    expect(pointInPolygon(W - 5, H - 5, poly)).toBe(true)
  })
})

describe('computeVisibilityPolygon — radius clamping', () => {
  const W = 1000, H = 1000
  const ox = 500, oy = 500

  it('radius 100 produces a smaller polygon than radius 0 (unlimited)', () => {
    const limited   = computeVisibilityPolygon(ox, oy, 100, [], W, H)
    const unlimited = computeVisibilityPolygon(ox, oy, 0,   [], W, H)
    expect(polygonArea(limited)).toBeLessThan(polygonArea(unlimited))
  })

  it('radius 100: point 90px away is visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 100, [], W, H)
    expect(pointInPolygon(ox + 90, oy, poly)).toBe(true)
  })

  it('radius 100: point 200px away is NOT visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 100, [], W, H)
    // 200px away — well outside the radius
    expect(pointInPolygon(ox + 200, oy, poly)).toBe(false)
  })
})

describe('computeVisibilityPolygon — single blocking wall', () => {
  // Observer at (200,200) on a 1000×1000 map.
  // A vertical wall at x=400, spanning y=0–1000, blocks all eastward visibility.
  const W = 1000, H = 1000
  const ox = 200, oy = 200
  const blockingWall = [wall(400, 0, 400, 1000)]

  it('polygon area is smaller with a blocking wall than without', () => {
    const noWall   = computeVisibilityPolygon(ox, oy, 0, [],           W, H)
    const withWall = computeVisibilityPolygon(ox, oy, 0, blockingWall, W, H)
    expect(polygonArea(withWall)).toBeLessThan(polygonArea(noWall))
  })

  it('points on the observer side of the wall are still visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, blockingWall, W, H)
    expect(pointInPolygon(300, 200, poly)).toBe(true)   // 100px west of wall
    expect(pointInPolygon(200, 200, poly)).toBe(true)   // observer pos
  })

  it('points on the far side of the wall are NOT visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, blockingWall, W, H)
    expect(pointInPolygon(600, 200, poly)).toBe(false)  // well east of wall
    expect(pointInPolygon(800, 200, poly)).toBe(false)
  })
})

describe('computeVisibilityPolygon — token behind a wall (corner case)', () => {
  // Observer at (100,100). A diagonal wall at 45° blocks south-east view.
  // Wall from (200,100) to (100,200).
  const W = 800, H = 800
  const ox = 100, oy = 100
  const diagWall = [wall(200, 100, 100, 200)]

  it('point directly behind the diagonal wall is not visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, diagWall, W, H)
    // (400,400) is behind the diagonal wall (south-east quadrant)
    expect(pointInPolygon(400, 400, poly)).toBe(false)
  })

  it('observer position is always visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, diagWall, W, H)
    expect(pointInPolygon(ox, oy, poly)).toBe(true)
  })
})

describe('computeVisibilityPolygon — door behaviour', () => {
  const W = 1000, H = 1000
  const ox = 200, oy = 500
  // Vertical door at x=400
  const closedDoor = [door(400, 0, 400, 1000, 'closed')]
  const openDoor   = [door(400, 0, 400, 1000, 'open')]

  it('closed door blocks sight (point beyond is not visible)', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, closedDoor, W, H)
    expect(pointInPolygon(700, 500, poly)).toBe(false)
  })

  it('open door does NOT block sight (point beyond is visible)', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, openDoor, W, H)
    expect(pointInPolygon(700, 500, poly)).toBe(true)
  })

  it('open door polygon area equals no-wall polygon area (full visibility)', () => {
    const noWall = computeVisibilityPolygon(ox, oy, 0, [],       W, H)
    const open   = computeVisibilityPolygon(ox, oy, 0, openDoor, W, H)
    // Areas should be very close (within 1% — floating-point angle differences)
    expect(Math.abs(polygonArea(open) - polygonArea(noWall))).toBeLessThan(
      polygonArea(noWall) * 0.01,
    )
  })
})

describe('computeVisibilityPolygon — window behaviour', () => {
  const W = 1000, H = 1000
  const ox = 200, oy = 500
  const closedWindow = [windowSeg(400, 0, 400, 1000, 'closed')]
  const openWindow   = [windowSeg(400, 0, 400, 1000, 'open')]

  it('closed window blocks sight', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, closedWindow, W, H)
    expect(pointInPolygon(700, 500, poly)).toBe(false)
  })

  it('open window allows sight through', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, openWindow, W, H)
    expect(pointInPolygon(700, 500, poly)).toBe(true)
  })
})

describe('computeVisibilityPolygon — multiple walls (room)', () => {
  // Simple room: observer at centre (200,200), four walls forming a 300×300 box
  // with observer inside, and target outside the box.
  const W = 1000, H = 1000
  const ox = 200, oy = 200
  // Box from (50,50) to (350,350)
  const roomWalls: Segment[] = [
    wall(50, 50, 350, 50),    // top
    wall(350, 50, 350, 350),  // right
    wall(350, 350, 50, 350),  // bottom
    wall(50, 350, 50, 50),    // left
  ]

  it('points inside the room are visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, roomWalls, W, H)
    expect(pointInPolygon(200, 200, poly)).toBe(true)  // observer
    expect(pointInPolygon(300, 300, poly)).toBe(true)  // corner of room
  })

  it('points outside the room are NOT visible', () => {
    const poly = computeVisibilityPolygon(ox, oy, 0, roomWalls, W, H)
    expect(pointInPolygon(600, 200, poly)).toBe(false)  // far outside right wall
    expect(pointInPolygon(200, 700, poly)).toBe(false)  // far outside bottom wall
  })
})

describe('computeVisibilityPolygon — observer on map edge', () => {
  it('works correctly when observer is near the map boundary', () => {
    const W = 1000, H = 1000
    // Observer at top-left corner
    const poly = computeVisibilityPolygon(5, 5, 0, [], W, H)
    expect(poly.length).toBeGreaterThan(0)
    expect(pointInPolygon(5, 5, poly)).toBe(true)
    expect(pointInPolygon(100, 100, poly)).toBe(true)
  })
})

describe('computeVisibilityPolygon — zero-length wall (edge case)', () => {
  it('ignores a degenerate zero-length wall without crashing', () => {
    const W = 1000, H = 1000
    const zeroWall: Segment = { x1: 400, y1: 300, x2: 400, y2: 300, wallType: 'wall', doorState: 'closed' }
    // Should not throw and should produce a valid polygon
    expect(() => {
      const poly = computeVisibilityPolygon(200, 200, 0, [zeroWall], W, H)
      expect(poly.length).toBeGreaterThan(0)
    }).not.toThrow()
  })
})

describe('computeVisibilityPolygon — output format', () => {
  it('always returns an even-length array', () => {
    const segs = [wall(300, 0, 300, 1000), wall(0, 400, 1000, 400)]
    const poly = computeVisibilityPolygon(150, 150, 0, segs, 1000, 1000)
    expect(poly.length % 2).toBe(0)
  })

  it('all coordinates are finite numbers', () => {
    const poly = computeVisibilityPolygon(500, 500, 200, [wall(400, 0, 400, 1000)], 1000, 1000)
    for (const v of poly) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})
