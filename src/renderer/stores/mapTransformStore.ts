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
  /** Convert screen (stage) coordinates → map image coordinates */
  screenToMap: (sx: number, sy: number) => { x: number; y: number }
  /** Convert map image coordinates → screen (stage) coordinates */
  mapToScreen: (mx: number, my: number) => { x: number; y: number }
}

const DEFAULT: MapTransform = { scale: 1, offsetX: 0, offsetY: 0, imgW: 0, imgH: 0, fitScale: 1, canvasW: 0, canvasH: 0 }

export const useMapTransformStore = create<MapTransformState>((set, get) => ({
  ...DEFAULT,

  setTransform: (t) => set((s) => ({ ...s, ...t })),

  reset: () => set(DEFAULT),

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
