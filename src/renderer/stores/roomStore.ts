import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { RoomRecord, RoomVisibility } from '@shared/ipc-types'

interface RoomState {
  rooms: RoomRecord[]
  selectedRoomId: number | null

  setRooms: (rooms: RoomRecord[]) => void
  addRoom: (room: RoomRecord) => void
  removeRoom: (id: number) => void
  updateRoom: (id: number, patch: Partial<RoomRecord>) => void
  setSelectedRoomId: (id: number | null) => void
}

export const useRoomStore = create<RoomState>()(
  immer((set) => ({
    rooms: [],
    selectedRoomId: null,

    setRooms: (rooms) =>
      set((s) => { s.rooms = rooms }),

    addRoom: (room) =>
      set((s) => { s.rooms.push(room) }),

    removeRoom: (id) =>
      set((s) => {
        s.rooms = s.rooms.filter((r) => r.id !== id)
        if (s.selectedRoomId === id) s.selectedRoomId = null
      }),

    updateRoom: (id, patch) =>
      set((s) => {
        const room = s.rooms.find((r) => r.id === id)
        if (room) Object.assign(room, patch)
      }),

    setSelectedRoomId: (id) =>
      set((s) => { s.selectedRoomId = id }),
  })),
)