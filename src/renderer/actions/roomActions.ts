import { registerUndoAction } from '../stores/undoStore'
import { useRoomStore } from '../stores/roomStore'
import type { RoomRecord, RoomVisibility } from '@shared/ipc-types'

// ── room.create ────────────────────────────────────────────────────────────────
interface RoomCreatePayload {
  patch: { mapId: number; name: string; polygon: string; visibility: RoomVisibility; color: string }
  /** Filled by the forward handler after the first run. */
  id?: number
}

registerUndoAction<RoomCreatePayload>('room.create', {
  label: 'Raum',
  forward: async (payload) => {
    const created = await window.electronAPI!.rooms.create(payload.patch)
    payload.id = created.id
    useRoomStore.getState().addRoom(created)
  },
  backward: async (payload) => {
    if (payload.id == null) return
    await window.electronAPI!.rooms.delete(payload.id)
    useRoomStore.getState().removeRoom(payload.id)
  },
})

// ── room.delete ───────────────────────────────────────────────────────────────
interface RoomDeletePayload {
  room: RoomRecord
}

registerUndoAction<RoomDeletePayload>('room.delete', {
  label: 'Delete room',
  forward: async (payload) => {
    await window.electronAPI!.rooms.delete(payload.room.id)
    useRoomStore.getState().removeRoom(payload.room.id)
  },
  backward: async (payload) => {
    const restored = await window.electronAPI!.rooms.restore(payload.room)
    if (restored) useRoomStore.getState().addRoom(restored)
  },
})
