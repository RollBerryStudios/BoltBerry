import { registerUndoAction } from '../stores/undoStore'
import type { DrawingRecord } from '@shared/ipc-types'

// ── drawing.clearMap ────────────────────────────────────────────────────────────
interface DrawingClearMapPayload {
  mapId: number
  /** Full snapshot deleted by the forward handler. */
  snapshot: DrawingRecord[]
}

registerUndoAction<DrawingClearMapPayload>('drawing.clearMap', {
  label: (p) => `Clear drawings (${p.snapshot.length})`,
  forward: async (payload) => {
    await window.electronAPI!.drawings.deleteByMap(payload.mapId)
  },
  backward: async (payload) => {
    if (payload.snapshot.length === 0) return
    await window.electronAPI!.drawings.createMany(
      payload.snapshot.map((row) => ({
        mapId: payload.mapId,
        type: row.type,
        points: row.points,
        color: row.color,
        width: row.width,
        text: row.text,
        synced: row.synced,
      })),
    )
  },
})
