import { describe, it, expect, beforeEach } from 'vitest'
import { useMapTransformStore } from '../renderer/stores/mapTransformStore'

beforeEach(() => {
  useMapTransformStore.setState({ scale: 1, offsetX: 0, offsetY: 0, imgW: 0, imgH: 0 })
})

describe('mapTransformStore', () => {
  it('screenToMap converts with scale=1, no offset', () => {
    useMapTransformStore.setState({ scale: 1, offsetX: 0, offsetY: 0 })
    const { screenToMap } = useMapTransformStore.getState()
    expect(screenToMap(100, 200)).toEqual({ x: 100, y: 200 })
  })

  it('screenToMap converts with scale and offset', () => {
    useMapTransformStore.setState({ scale: 2, offsetX: 50, offsetY: 30 })
    const { screenToMap } = useMapTransformStore.getState()
    // screen(150, 80) → map = (150 - 50) / 2 = 50, (80 - 30) / 2 = 25
    expect(screenToMap(150, 80)).toEqual({ x: 50, y: 25 })
  })

  it('mapToScreen converts with scale and offset', () => {
    useMapTransformStore.setState({ scale: 2, offsetX: 50, offsetY: 30 })
    const { mapToScreen } = useMapTransformStore.getState()
    // map(25, 25) → screen = 25*2 + 50 = 100, 25*2 + 30 = 80
    expect(mapToScreen(25, 25)).toEqual({ x: 100, y: 80 })
  })

  it('screenToMap and mapToScreen are inverses', () => {
    useMapTransformStore.setState({ scale: 1.5, offsetX: 120, offsetY: 80 })
    const { screenToMap, mapToScreen } = useMapTransformStore.getState()
    const screen = { x: 300, y: 250 }
    const map = screenToMap(screen.x, screen.y)
    const back = mapToScreen(map.x, map.y)
    expect(back.x).toBeCloseTo(screen.x)
    expect(back.y).toBeCloseTo(screen.y)
  })

  it('setTransform merges partial state', () => {
    useMapTransformStore.setState({ scale: 1, offsetX: 0, offsetY: 0 })
    useMapTransformStore.getState().setTransform({ scale: 3, offsetX: 100 })
    const s = useMapTransformStore.getState()
    expect(s.scale).toBe(3)
    expect(s.offsetX).toBe(100)
    expect(s.offsetY).toBe(0)
  })

  it('reset returns to default state', () => {
    useMapTransformStore.getState().setTransform({ scale: 5, offsetX: 200, offsetY: 300 })
    useMapTransformStore.getState().reset()
    const s = useMapTransformStore.getState()
    expect(s.scale).toBe(1)
    expect(s.offsetX).toBe(0)
    expect(s.offsetY).toBe(0)
  })

  it('zoomIn multiplies scale by ZOOM_FACTOR, clamped at MAX_SCALE', () => {
    useMapTransformStore.setState({ scale: 1, offsetX: 0, offsetY: 0, canvasW: 800, canvasH: 600 })
    useMapTransformStore.getState().zoomIn()
    const s = useMapTransformStore.getState()
    expect(s.scale).toBeCloseTo(1.3)
  })

  it('zoomIn does not exceed MAX_SCALE (12)', () => {
    useMapTransformStore.setState({ scale: 11, offsetX: 0, offsetY: 0, canvasW: 800, canvasH: 600 })
    useMapTransformStore.getState().zoomIn()
    expect(useMapTransformStore.getState().scale).toBe(12)
  })

  it('zoomOut divides scale by ZOOM_FACTOR, clamped at MIN_SCALE', () => {
    useMapTransformStore.setState({ scale: 1, offsetX: 0, offsetY: 0, canvasW: 800, canvasH: 600 })
    useMapTransformStore.getState().zoomOut()
    const s = useMapTransformStore.getState()
    expect(s.scale).toBeCloseTo(1 / 1.3)
  })

  it('zoomOut does not go below MIN_SCALE (0.05)', () => {
    useMapTransformStore.setState({ scale: 0.06, offsetX: 0, offsetY: 0, canvasW: 800, canvasH: 600 })
    useMapTransformStore.getState().zoomOut()
    expect(useMapTransformStore.getState().scale).toBe(0.05)
  })

  it('fitToScreen sets scale to fitScale and centers image', () => {
    useMapTransformStore.setState({ scale: 3, fitScale: 0.5, imgW: 1600, imgH: 900, canvasW: 800, canvasH: 600 })
    useMapTransformStore.getState().fitToScreen()
    const s = useMapTransformStore.getState()
    expect(s.scale).toBe(0.5)
    // offsetX = (canvasW - imgW * fitScale) / 2 = (800 - 1600 * 0.5) / 2 = 0
    expect(s.offsetX).toBeCloseTo(0)
    // offsetY = (canvasH - imgH * fitScale) / 2 = (600 - 900 * 0.5) / 2 = 75
    expect(s.offsetY).toBeCloseTo(75)
  })

  it('fitToScreen is a no-op when no image is loaded', () => {
    useMapTransformStore.setState({ scale: 2, imgW: 0, imgH: 0 })
    useMapTransformStore.getState().fitToScreen()
    expect(useMapTransformStore.getState().scale).toBe(2)
  })

  it('centerOnPoint places map point at canvas centre', () => {
    // Canvas 800×600, scale 2 → map point (100, 50) should land at screen (400, 300)
    useMapTransformStore.setState({ scale: 2, canvasW: 800, canvasH: 600 })
    useMapTransformStore.getState().centerOnPoint(100, 50)
    const s = useMapTransformStore.getState()
    // offsetX = canvasW/2 - mx*scale = 400 - 200 = 200
    expect(s.offsetX).toBe(200)
    // offsetY = canvasH/2 - my*scale = 300 - 100 = 200
    expect(s.offsetY).toBe(200)
    // Verify via mapToScreen: map(100,50) → screen should be (400, 300)
    const { mapToScreen } = useMapTransformStore.getState()
    expect(mapToScreen(100, 50)).toEqual({ x: 400, y: 300 })
  })

  it('centerOnPoint does not change scale', () => {
    useMapTransformStore.setState({ scale: 3, canvasW: 600, canvasH: 400 })
    useMapTransformStore.getState().centerOnPoint(0, 0)
    expect(useMapTransformStore.getState().scale).toBe(3)
  })
})
