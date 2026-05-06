import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useCampaignStore } from '../stores/campaignStore'
import { useMapTransformStore } from '../stores/mapTransformStore'
import { POINTER_PING_EVENT, type PointerPingDetail } from '../components/canvas/PointerLayer'
import { NOTE_CATEGORIES } from '../notes/categories'
import type { MenuResolver, MenuSection } from './types'
import { registerMenu } from './registry'

/**
 * Canvas / map background menu (Phase 8 §E.Canvas). Reorganises the
 * old useCanvasContextMenu flat list into nested submenus (Tool ▶,
 * Rotate ▶, Fog ▶) so the first level stays under NN/g's "small
 * subset" guideline.
 *
 * Routes that need to round-trip through CustomEvents (fog actions)
 * mirror the previous hook to keep FogLayer + DrawingLayer listeners
 * happy without rewriting them in this phase.
 */
const ROTATIONS: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270]

const canvasResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'map') return []
  const map = env.primary.map
  const curRot = (map.rotation ?? 0) as 0 | 90 | 180 | 270
  const sessionMode = useSessionStore.getState().sessionMode

  const sections: MenuSection[] = [
    {
      id: 'view',
      items: [
        {
          id: 'fit-to-screen',
          labelKey: 'contextMenu.canvas.fitToScreen',
          icon: '⊡',
          run: () => useMapTransformStore.getState().fitToScreen(),
        },
        {
          id: 'rotate',
          labelKey: 'contextMenu.canvas.rotate',
          icon: '↻',
          submenu: ROTATIONS.map((r) => ({
            id: `rotate-${r}`,
            labelKey: `contextMenu.canvas.rotate${r}`,
            icon: r === curRot ? '✓' : ' ',
            run: async () => {
              if (!window.electronAPI) return
              await Promise.all([
                window.electronAPI.maps.setRotation(map.id, r),
                window.electronAPI.maps.setRotationPlayer(map.id, r),
              ])
              const updated = useCampaignStore.getState().activeMaps.map((m) =>
                m.id === map.id ? { ...m, rotation: r, rotationPlayer: r } : m,
              )
              useCampaignStore.getState().setActiveMaps(updated)
              if (sessionMode !== 'prep') {
                window.electronAPI.sendMapUpdate({
                  mapId: map.id,
                  imagePath: map.imagePath,
                  gridType: map.gridType,
                  gridSize: map.gridSize,
                  rotation: r,
                })
              }
            },
          })),
        },
      ],
    },
    {
      id: 'spawn',
      items: [
        {
          id: 'add-from-wiki',
          labelKey: 'contextMenu.canvas.addFromWiki',
          icon: '📖',
          // The picker pulls a slug; the existing click-to-place flow
          // takes over from there. We pre-arm the click coordinate by
          // letting CanvasArea's listener fire on the next click — but
          // since the user just right-clicked at this exact spot, we
          // can short-circuit and place immediately at env.pos. Phase
          // 1 wires the simpler "open picker" path; Phase 4 will add
          // place-at-right-click coords directly.
          run: () => {
            window.dispatchEvent(new CustomEvent('canvas:open-bestiary-picker'))
          },
        },
        {
          id: 'ping-here',
          labelKey: 'contextMenu.canvas.pingHere',
          icon: '📡',
          run: () => {
            window.dispatchEvent(
              new CustomEvent<PointerPingDetail>(POINTER_PING_EVENT, {
                detail: { x: env.pos.x, y: env.pos.y },
              }),
            )
          },
        },
        {
          id: 'add-note-marker',
          labelKey: 'contextMenu.canvas.addNoteMarker',
          icon: '📝',
          submenu: NOTE_CATEGORIES.map((category) => ({
            id: `add-note-marker-${category.key}`,
            labelKey: `notes.categories.${category.key}`,
            icon: category.icon,
            run: () => {
              window.dispatchEvent(new CustomEvent('note-marker:create', {
                detail: { x: env.pos.x, y: env.pos.y, category: category.id },
              }))
            },
          })),
        },
      ],
    },
    {
      id: 'fog',
      items: [
        {
          id: 'fog',
          labelKey: 'contextMenu.canvas.fog',
          icon: '🌫',
          submenu: [
            {
              id: 'fog-reveal-all',
              labelKey: 'contextMenu.canvas.fogRevealAll',
              icon: '👁',
              run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealAll' } })),
            },
            {
              id: 'fog-cover-all',
              labelKey: 'contextMenu.canvas.fogCoverAll',
              icon: '🌑',
              run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'coverAll' } })),
            },
            {
              id: 'fog-reveal-tokens',
              labelKey: 'contextMenu.canvas.fogRevealTokens',
              icon: '⬤',
              run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'revealTokens' } })),
            },
            {
              id: 'fog-reset-explored',
              labelKey: 'contextMenu.canvas.fogResetExplored',
              icon: '↺',
              run: () => window.dispatchEvent(new CustomEvent('fog:action', { detail: { type: 'resetExplored' } })),
            },
          ],
        },
      ],
    },
    {
      id: 'tool',
      items: [
        {
          id: 'tool',
          labelKey: 'contextMenu.canvas.tool',
          icon: '🛠',
          submenu: [
            { id: 'tool-select',     labelKey: 'contextMenu.canvas.toolSelect',    run: () => useUIStore.getState().setActiveTool('select') },
            { id: 'tool-pointer',    labelKey: 'contextMenu.canvas.toolPointer',   run: () => useUIStore.getState().setActiveTool('pointer') },
            { id: 'tool-measure',    labelKey: 'contextMenu.canvas.toolMeasure',   run: () => useUIStore.getState().setActiveTool('measure-line') },
            { id: 'tool-draw',       labelKey: 'contextMenu.canvas.toolDraw',      run: () => useUIStore.getState().setActiveTool('draw-freehand') },
            { id: 'tool-fog-brush',  labelKey: 'contextMenu.canvas.toolFogBrush',  run: () => useUIStore.getState().setActiveTool('fog-brush') },
            { id: 'tool-fog-rect',   labelKey: 'contextMenu.canvas.toolFogRect',   run: () => useUIStore.getState().setActiveTool('fog-rect') },
            { id: 'tool-wall',       labelKey: 'contextMenu.canvas.toolWall',      run: () => useUIStore.getState().setActiveTool('wall-draw') },
            { id: 'tool-room',       labelKey: 'contextMenu.canvas.toolRoom',      run: () => useUIStore.getState().setActiveTool('room') },
          ],
        },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'clear-drawings',
          labelKey: 'contextMenu.canvas.clearDrawings',
          icon: '✕',
          danger: true,
          run: async () => {
            const mapId = useCampaignStore.getState().activeMapId
            if (!mapId || !window.electronAPI) return
            await window.electronAPI.drawings.deleteByMap(mapId)
            useUIStore.getState().incrementDrawingClearTick()
          },
        },
      ],
    },
  ]

  return sections
}

let registered = false
export function registerCanvasMenu(): void {
  if (registered) return
  registered = true
  registerMenu('map', canvasResolver)
}
