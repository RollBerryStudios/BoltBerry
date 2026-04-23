import { useCallback } from 'react'
import type Konva from 'konva'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import { POINTER_PING_EVENT, type PointerPingDetail } from '../components/canvas/PointerLayer'

/**
 * Canvas right-click context menu. Extracted from `CanvasArea.tsx`
 * per audit CQ-7 — the inline version was a 117-line handler built
 * on every right-click. As a stable useCallback the items are still
 * materialised on click (they reflect live tool / map state) but the
 * JSX + the rendering component stay readable.
 *
 * Action verbs match the main-process allowlist in
 * `dialog-handlers.ts`.
 */
export function useCanvasContextMenu(): (e: Konva.KonvaEventObject<MouseEvent>) => Promise<void> {
  return useCallback(async (e) => {
    e.evt.preventDefault()
    if (!window.electronAPI) return

    const { activeTool } = useUIStore.getState()
    const { sessionMode } = useSessionStore.getState()
    const { activeMapId: mapId, activeMaps: maps } = useCampaignStore.getState()
    const map = maps.find((m) => m.id === mapId)
    const curRot = (map?.rotation ?? 0) as 0 | 90 | 180 | 270
    const rotLabel = (r: number) =>
      ({ 0: '↑ 0°', 90: '→ 90°', 180: '↓ 180°', 270: '← 270°' }[r] ?? `${r}°`)

    // Snapshot the pointer position NOW, before the native menu opens
    // — by the time the handler resumes below, the user has clicked a
    // menu item and the Konva stage's cached pointer position may be
    // stale or null. Used by the "ping here" action.
    const clickPos = e.target.getStage()?.getPointerPosition()
    const clickMapPos = clickPos
      ? useMapTransformStore.getState().screenToMap(clickPos.x, clickPos.y)
      : null

    const items: Array<{ label: string; action: string } | { separator: true }> = []

    // ── Ansicht ────────────────────────────────────────────
    items.push({ label: '⊡  Karte einpassen', action: 'center-camera' })

    // ── Karte drehen ───────────────────────────────────────
    if (map) {
      items.push({ separator: true })
      const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270]
      rotations.forEach((r) => {
        items.push({
          label: `${rotLabel(r)}${r === curRot ? '  ✓' : ''}`,
          action: `rotate-${r}`,
        })
      })
    }

    // ── Nebel ──────────────────────────────────────────────
    items.push({ separator: true })
    items.push({ label: '👁  Alles aufdecken',              action: 'fog-reveal-all'     })
    items.push({ label: '🌑  Alles verdecken',              action: 'fog-cover-all'      })
    items.push({ label: '⬤  Token-Bereiche aufdecken',     action: 'fog-reveal-tokens'  })
    items.push({ label: '↺  Erkundetes zurücksetzen',       action: 'fog-reset-explored' })

    // ── Werkzeuge ──────────────────────────────────────────
    items.push({ separator: true })
    items.push({ label: `📏  Messen${activeTool === 'measure-line' ? '  ✓' : ''}`,         action: 'tool-measure'   })
    items.push({ label: `✏️  Zeichnen${activeTool === 'draw-freehand' ? '  ✓' : ''}`,      action: 'tool-draw'      })
    items.push({ label: `🖌  Nebel-Pinsel${activeTool === 'fog-brush' ? '  ✓' : ''}`,       action: 'tool-fog-brush' })
    items.push({ label: `▭  Nebel-Rechteck${activeTool === 'fog-rect' ? '  ✓' : ''}`,      action: 'tool-fog-rect'  })

    // ── Karte / Zeichnungen ────────────────────────────────
    items.push({ separator: true })
    items.push({ label: '📡  Hier pingen',                   action: 'ping-here'          })
    items.push({ label: '✕  Zeichnungen löschen',           action: 'clear-drawings'     })

    const action = await window.electronAPI.showContextMenu(items)
    if (!action) return

    // ── Ansicht ────────────────────────────────────────────
    if (action === 'center-camera') {
      useMapTransformStore.getState().fitToScreen()

    // ── Rotation ───────────────────────────────────────────
    } else if (action.startsWith('rotate-')) {
      const rot = parseInt(action.split('-')[1]) as 0 | 90 | 180 | 270
      if (!mapId || !map) return
      try {
        await window.electronAPI.maps.setRotation(mapId, rot)
        const updated = maps.map((m) => m.id === mapId ? { ...m, rotation: rot } : m)
        useCampaignStore.getState().setActiveMaps(updated)
        if (sessionMode !== 'prep') {
          const m = updated.find((mm) => mm.id === mapId)!
          window.electronAPI.sendMapUpdate({ imagePath: m.imagePath, gridType: m.gridType, gridSize: m.gridSize, rotation: rot })
        }
      } catch (err) {
        console.error('[CanvasArea] rotation change failed:', err)
      }

    // ── Nebel ──────────────────────────────────────────────
    } else if (action === 'fog-reveal-all') {
      window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealAll' } }))
    } else if (action === 'fog-cover-all') {
      window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } }))
    } else if (action === 'fog-reveal-tokens') {
      window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealTokens' } }))
    } else if (action === 'fog-reset-explored') {
      window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'resetExplored' } }))

    // ── Werkzeuge ──────────────────────────────────────────
    } else if (action === 'tool-measure') {
      useUIStore.getState().setActiveTool('measure-line')
    } else if (action === 'tool-draw') {
      useUIStore.getState().setActiveTool('draw-freehand')
    } else if (action === 'tool-fog-brush') {
      useUIStore.getState().setActiveTool('fog-brush')
    } else if (action === 'tool-fog-rect') {
      useUIStore.getState().setActiveTool('fog-rect')

    // ── Ping ───────────────────────────────────────────────
    } else if (action === 'ping-here') {
      if (clickMapPos) {
        window.dispatchEvent(new CustomEvent<PointerPingDetail>(POINTER_PING_EVENT, {
          detail: { x: clickMapPos.x, y: clickMapPos.y },
        }))
      }

    // ── Zeichnungen ────────────────────────────────────────
    } else if (action === 'clear-drawings') {
      if (!mapId) return
      try {
        await window.electronAPI.drawings.deleteByMap(mapId)
        useUIStore.getState().incrementDrawingClearTick()
      } catch (err) {
        console.error('[CanvasArea] clear drawings failed:', err)
      }
    }
  }, [])
}
