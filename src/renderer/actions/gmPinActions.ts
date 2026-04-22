import { registerUndoAction } from '../stores/undoStore'
import type { GMPinRecord } from '@shared/ipc-types'

interface GMPinDeletePayload {
  pin: GMPinRecord
  restoredId?: number
}

registerUndoAction<GMPinDeletePayload>('gmPin.delete', {
  label: 'Delete GM pin',
  forward: async (payload) => {
    await window.electronAPI!.gmPins.delete(payload.pin.id)
  },
  backward: async (payload) => {
    const restored = await window.electronAPI!.gmPins.create({
      mapId: payload.pin.mapId,
      x: payload.pin.x,
      y: payload.pin.y,
      label: payload.pin.label,
      icon: payload.pin.icon,
      color: payload.pin.color,
    })
    if (restored) payload.restoredId = restored.id
  },
})
