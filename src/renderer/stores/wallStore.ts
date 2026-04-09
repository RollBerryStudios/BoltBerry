import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WallRecord, WallType, DoorState } from '@shared/ipc-types'

interface WallState {
  walls: WallRecord[]

  setWalls: (walls: WallRecord[]) => void
  addWall: (wall: WallRecord) => void
  removeWall: (id: number) => void
  updateWall: (id: number, patch: Partial<WallRecord>) => void
  toggleDoor: (id: number) => void
}

export const useWallStore = create<WallState>()(
  immer((set) => ({
    walls: [],

    setWalls: (walls) =>
      set((s) => { s.walls = walls }),

    addWall: (wall) =>
      set((s) => { s.walls.push(wall) }),

    removeWall: (id) =>
      set((s) => { s.walls = s.walls.filter((w) => w.id !== id) }),

    updateWall: (id, patch) =>
      set((s) => {
        const w = s.walls.find((w) => w.id === id)
        if (w) Object.assign(w, patch)
      }),

    toggleDoor: (id) =>
      set((s) => {
        const w = s.walls.find((w) => w.id === id)
        if (!w || (w.wallType !== 'door' && w.wallType !== 'window')) return
        if (w.doorState === 'open') w.doorState = 'closed'
        else if (w.doorState === 'closed') w.doorState = 'open'
        else w.doorState = 'open'
      }),
  }))
)