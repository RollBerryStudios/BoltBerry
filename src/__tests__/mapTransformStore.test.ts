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
})
