import { registerUndoAction } from '../stores/undoStore'
import { useWallStore } from '../stores/wallStore'
import type { WallRecord } from '@shared/ipc-types'

// ── wall.create ───────────────────────────────────────────────────────────────
import type { WallType, DoorState } from '@shared/ipc-types'

interface WallCreatePayload {
  segment: { mapId: number; x1: number; y1: number; x2: number; y2: number; wallType: WallType; doorState: DoorState }
  /** Filled by the forward handler after the first run. */
  id?: number
}

registerUndoAction<WallCreatePayload>('wall.create', {
  label: (p) => p.segment.wallType === 'door' ? 'Tür' : 'Wand',
  forward: async (payload) => {
    const created = await window.electronAPI!.walls.create(payload.segment)
    payload.id = created.id
    useWallStore.getState().addWall(created)
  },
  backward: async (payload) => {
    if (payload.id == null) return
    await window.electronAPI!.walls.delete(payload.id)
    useWallStore.getState().removeWall(payload.id)
  },
})

// ── wall.delete ───────────────────────────────────────────────────────────────
interface WallDeletePayload {
  wall: WallRecord
}

registerUndoAction<WallDeletePayload>('wall.delete', {
  label: 'Delete wall',
  forward: async (payload) => {
    await window.electronAPI!.walls.delete(payload.wall.id)
    useWallStore.getState().removeWall(payload.wall.id)
  },
  backward: async (payload) => {
    const restored = await window.electronAPI!.walls.restore(payload.wall)
    if (restored) useWallStore.getState().addWall(restored)
  },
})
