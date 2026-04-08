import { create } from 'zustand'

export interface MapTransform {
  scale: number
  offsetX: number
  offsetY: number
  /** Natural image dimensions (needed for FoW coordinate mapping) */
  imgW: number
  imgH: number
  /** Fit-to-screen scale (for camera sync calculations) */
  fitScale: number
  /** Canvas dimensions (for viewport center calculations) */
  canvasW: number
  canvasH: number
}

interface MapTransformState extends MapTransform {
  setTransform: (t: Partial<MapTransform>) => void
  reset: () => void
  zoomIn: () => void
  zoomOut: () => void
  fitToScreen: () => void
  /** Convert screen (stage) coordinates → map image coordinates */
  screenToMap: (sx: number, sy: number) => { x: number; y: number }
  /** Convert map image coordinates → screen (stage) coordinates */
  mapToScreen: (mx: number, my: number) => { x: number; y: number }
}

const DEFAULT: MapTransform = { scale: 1, offsetX: 0, offsetY: 0, imgW: 0, imgH: 0, fitScale: 1, canvasW: 0, canvasH: 0 }

const MIN_SCALE = 0.05
const MAX_SCALE = 12
const ZOOM_FACTOR = 1.3

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

  screenToMap: (sx, sy) => {
    const { scale, offsetX, offsetY } = get()
    if (scale === 0) return { x: 0, y: 0 }
    return {
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale,
    }
  },

  mapToScreen: (mx, my) => {
    const { scale, offsetX, offsetY } = get()
    return {
      x: mx * scale + offsetX,
      y: my * scale + offsetY,
    }
  },
}))
