import { create } from 'zustand'

export type ActiveTool = 'select' | 'fog-rect' | 'fog-polygon' | 'fog-cover' | 'fog-brush' | 'fog-brush-cover' | 'token' | 'atmosphere' | 'pointer' | 'measure-line' | 'measure-circle' | 'measure-cone' | 'draw-freehand' | 'draw-rect' | 'draw-circle' | 'draw-text' | 'wall-draw' | 'wall-door' | 'room'

interface ToolState {
  activeTool: ActiveTool
  drawColor: string
  drawWidth: number
  fogBrushRadius: number

  setActiveTool: (tool: ActiveTool) => void
  setDrawColor: (color: string) => void
  setDrawWidth: (width: number) => void
  setFogBrushRadius: (radius: number) => void
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: 'select',
  drawColor: '#ff6b6b',
  drawWidth: 3,
  fogBrushRadius: 30,

  setActiveTool: (activeTool) => set({ activeTool }),
  setDrawColor: (drawColor) => set({ drawColor }),
  setDrawWidth: (drawWidth) => set({ drawWidth }),
  setFogBrushRadius: (fogBrushRadius: number) => set({ fogBrushRadius }),
}))
