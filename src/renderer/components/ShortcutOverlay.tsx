import { useTranslation } from 'react-i18next'
import { Modal } from './shared/Modal'

interface ShortcutOverlayProps {
  onClose: () => void
}

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  const { t } = useTranslation()

  // BB-051: every `key` field is either a literal (universal key combo)
  // or a `keyKey` reference into shortcuts.tk.* so German speakers no
  // longer see "Mausrad" on an English locale.
  type ShortcutEntry =
    | { section: string }
    | { key: string; keyKey?: undefined; labelKey: string; label?: never }
    | { keyKey: string; key?: undefined; labelKey: string; label?: never }

  const SHORTCUTS: ShortcutEntry[] = [
    { section: t('shortcuts.sectionTools') },
    { key: 'V',        labelKey: 'shortcuts.keySelect' },
    { key: 'W',        labelKey: 'shortcuts.keyPointerPan' },
    { key: 'T',        labelKey: 'shortcuts.keyTokenTool' },
    { key: 'B',        labelKey: 'shortcuts.keyFogBrush' },
    { key: 'F',        labelKey: 'shortcuts.keyFogRect' },
    { key: 'P',        labelKey: 'shortcuts.keyFogPolygon' },
    { key: 'C',        labelKey: 'shortcuts.keyFogCover' },
    { key: 'X',        labelKey: 'shortcuts.keyFogBrushCover' },
    { key: 'M',        labelKey: 'shortcuts.keyMeasure' },
    { key: 'D',        labelKey: 'shortcuts.keyDraw' },
    { key: 'G',        labelKey: 'shortcuts.keyWall' },
    { key: 'J',        labelKey: 'shortcuts.keyDoor' },
    { key: 'R',        labelKey: 'shortcuts.keyRoom' },
    { key: 'E',        labelKey: 'shortcuts.keyPlayerView' },
    { key: 'L',        labelKey: 'shortcuts.keyLayerPanel' },
    { section: t('shortcuts.sectionMapNav') },
    { keyKey: 'shortcuts.tk.mouseWheel',       labelKey: 'shortcuts.keyMouseWheel' },
    { keyKey: 'shortcuts.tk.altDrag',          labelKey: 'shortcuts.keyAltDrag' },
    { keyKey: 'shortcuts.tk.middleClickDrag',  labelKey: 'shortcuts.keyMiddleDrag' },
    { keyKey: 'shortcuts.tk.shiftClick',       labelKey: 'shortcuts.keyPing' },
    { key: 'Shift + G',            labelKey: 'shortcuts.keyGridToggle' },
    { key: 'Shift + G, then +/-',  labelKey: 'shortcuts.keyGridChord' },
    { key: '0',                    labelKey: 'shortcuts.keyFit' },
    { key: '1 – 5',                labelKey: 'shortcuts.keyMapSwitch' },
    { section: t('shortcuts.sectionTokens') },
    { keyKey: 'shortcuts.tk.click',       labelKey: 'shortcuts.keyTokenSelect' },
    { keyKey: 'shortcuts.tk.shiftClick',  labelKey: 'shortcuts.keyTokenMultiSelect' },
    { key: 'Delete',         labelKey: 'shortcuts.keyDeleteToken' },
    { key: 'Ctrl + C',       labelKey: 'shortcuts.keyCopyToken' },
    { key: 'Ctrl + V',       labelKey: 'shortcuts.keyPasteToken' },
    { section: t('shortcuts.sectionCombat') },
    { key: 'N',        labelKey: 'shortcuts.keyNextFighter' },
    { section: t('shortcuts.sectionFog') },
    { keyKey: 'shortcuts.tk.doubleClick', labelKey: 'shortcuts.keyPolygonFinish' },
    { key: 'Ctrl + Z',         labelKey: 'shortcuts.keyFogUndo' },
    { key: 'Ctrl + Shift + Z', labelKey: 'shortcuts.keyFogRedo' },
    { section: t('shortcuts.sectionContextMenus') },
    { keyKey: 'shortcuts.tk.rightClickMap',     labelKey: 'shortcuts.keyCtxMap' },
    { keyKey: 'shortcuts.tk.rightClickToken',   labelKey: 'shortcuts.keyCtxToken' },
    { keyKey: 'shortcuts.tk.rightClickMapList', labelKey: 'shortcuts.keyCtxMapList' },
    { keyKey: 'shortcuts.tk.rightClickWiki',    labelKey: 'shortcuts.keyCtxWiki' },
    { keyKey: 'shortcuts.tk.rightClickAudio',   labelKey: 'shortcuts.keyCtxAudio' },
    { section: t('shortcuts.sectionPanels') },
    { key: 'Ctrl + 1 – 6',     labelKey: 'shortcuts.keySidebarTab' },
    { key: 'Ctrl + 7 – 9',     labelKey: 'shortcuts.keyFloatingPanel' },
    { key: 'Ctrl + \\',         labelKey: 'shortcuts.keyLeftSidebar' },
    { key: 'Ctrl + Shift + \\', labelKey: 'shortcuts.keyRightSidebar' },
    { section: t('shortcuts.sectionAudio') },
    { key: '1 – 9, 0', labelKey: 'shortcuts.keySfxSlot' },
    { key: 'ß / -',     labelKey: 'shortcuts.keySfxNextBoard' },
    { section: t('shortcuts.sectionPlayerControl') },
    { keyKey: 'shortcuts.tk.ctrlDrag',       labelKey: 'shortcuts.keyPcDrag' },
    { keyKey: 'shortcuts.tk.ctrlMouseWheel', labelKey: 'shortcuts.keyPcZoom' },
    { keyKey: 'shortcuts.tk.ctrlArrows',     labelKey: 'shortcuts.keyPcRotate' },
    { key: 'Escape',              labelKey: 'shortcuts.keyPcExit' },
    { section: t('shortcuts.sectionGeneral') },
    { key: 'Ctrl + K', labelKey: 'shortcuts.keyPalette' },
    { key: 'Ctrl + B', labelKey: 'shortcuts.keyBlackout' },
    { key: 'Ctrl + P', labelKey: 'shortcuts.keyPlayerWindow' },
    { key: 'Ctrl + ,', labelKey: 'shortcuts.keySettings' },
    { key: 'Escape',   labelKey: 'shortcuts.keyEscape' },
    { key: 'Ctrl + S', labelKey: 'shortcuts.keySave' },
    { key: '? / F1',   labelKey: 'shortcuts.keyThisOverlay' },
  ]

  return (
    <Modal
      onClose={onClose}
      ariaLabel={t('shortcuts.title')}
      style={{
        padding: 'var(--sp-6)',
        width: 580,
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{t('shortcuts.title')}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {SHORTCUTS.map((s, i) => {
          if ('section' in s) {
            return (
              <div key={i} style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--accent-light)',
                marginTop: i > 0 ? 'var(--sp-4)' : 0,
                marginBottom: 'var(--sp-2)',
                paddingBottom: 'var(--sp-1)',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                {s.section}
              </div>
            )
          }
          return (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '5px 0',
              gap: 'var(--sp-4)',
            }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {s.labelKey ? t(s.labelKey) : s.label}
              </span>
              <kbd style={{
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {s.keyKey ? t(s.keyKey) : s.key}
              </kbd>
            </div>
          )
        })}

        <div style={{
          marginTop: 'var(--sp-5)',
          paddingTop: 'var(--sp-3)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          {t('shortcuts.hint', { key1: '?', key2: 'F1' })}
        </div>
    </Modal>
  )
}
