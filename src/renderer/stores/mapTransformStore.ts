import { create } from 'zustand'

export interface MapTransform {
  scale: number
  offsetX: number
  offsetY: number
  imgW: number
  imgH: number
  fitScale: number
  canvasW: number
  canvasH: number
}

interface MapTransformState extends MapTransform {
  setTransform: (t: Partial<MapTransform>) => void
  reset: () => void
  zoomIn: () => void
  zoomOut: () => void
  fitToScreen: () => void
  /** Pan so map point (mx, my) is centered in the viewport, keeping current scale. */
  centerOnPoint: (mx: number, my: number) => void
  screenToMap: (sx: number, sy: number) => { x: number; y: number }
  mapToScreen: (mx: number, my: number) => { x: number; y: number }
}

const DEFAULT: MapTransform = { scale: 1, offsetX: 0, offsetY: 0, imgW: 0, imgH: 0, fitScale: 1, canvasW: 0, canvasH: 0 }

const MIN_SCALE = 0.05
const MAX_SCALE = 12
const ZOOM_FACTOR = 1.3

export function screenToMapPure(sx: number, sy: number, scale: number, offsetX: number, offsetY: number): { x: number; y: number } {
  if (scale === 0) return { x: 0, y: 0 }
  return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale }
}

export function mapToScreenPure(mx: number, my: number, scale: number, offsetX: number, offsetY: number): { x: number; y: number } {
  return { x: mx * scale + offsetX, y: my * scale + offsetY }
}

export const useMapTransformStore = create<MapTransformState>((set, get) => ({
  ...DEFAULT,

  setTransform: (t) => set((s) => ({ ...s, ...t })),

  reset: () => set(DEFAULT),

  zoomIn: () => {
    const { scale, offsetX, offsetY, canvasW, canvasH } = get()
    const newScale = Math.min(MAX_SCALE, scale * ZOOM_FACTOR)
    const cx = canvasW / 2
    const cy = canvasH / 2
    set({
      scale: newScale,
      offsetX: cx - (cx - offsetX) * (newScale / scale),
      offsetY: cy - (cy - offsetY) * (newScale / scale),
    })
  },

  zoomOut: () => {
    const { scale, offsetX, offsetY, canvasW, canvasH } = get()
    const newScale = Math.max(MIN_SCALE, scale / ZOOM_FACTOR)
    const cx = canvasW / 2
    const cy = canvasH / 2
    set({
      scale: newScale,
      offsetX: cx - (cx - offsetX) * (newScale / scale),
      offsetY: cy - (cy - offsetY) * (newScale / scale),
    })
  },

  fitToScreen: () => {
    const { imgW, imgH, canvasW, canvasH, fitScale } = get()
    if (imgW === 0 || imgH === 0) return
    set({
      scale: fitScale,
      offsetX: (canvasW - imgW * fitScale) / 2,
      offsetY: (canvasH - imgH * fitScale) / 2,
    })
  },

  centerOnPoint: (mx, my) => {
    const { scale, canvasW, canvasH } = get()
    set({
      offsetX: canvasW / 2 - mx * scale,
      offsetY: canvasH / 2 - my * scale,
    })
  },

  screenToMap: (sx, sy) => {
    const { scale, offsetX, offsetY } = get()
    if (scale === 0) return { x: 0, y: 0 }
    return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale }
  },

  mapToScreen: (mx, my) => {
    const { scale, offsetX, offsetY } = get()
    return { x: mx * scale + offsetX, y: my * scale + offsetY }
  },
}))