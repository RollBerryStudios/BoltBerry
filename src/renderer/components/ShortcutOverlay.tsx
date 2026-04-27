import { useTranslation } from 'react-i18next'
import { Modal } from './shared/Modal'

interface ShortcutOverlayProps {
  onClose: () => void
}

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  const { t } = useTranslation()

  type ShortcutEntry =
    | { section: string }
    | { key: string; labelKey: string; label?: never }
    | { key: string; label: string; labelKey?: never }

  const SHORTCUTS: ShortcutEntry[] = [
    { section: t('shortcuts.sectionTools') },
    { key: 'V',        labelKey: 'shortcuts.keySelect' },
    { key: 'W',        labelKey: 'shortcuts.keyPointerPan' },
    { key: 'T',        labelKey: 'shortcuts.keyTokenTab' },
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
    { section: t('shortcuts.sectionMapNav') },
    { key: 'Mausrad',              labelKey: 'shortcuts.keyMouseWheel' },
    { key: 'Alt + Drag',           labelKey: 'shortcuts.keyAltDrag' },
    { key: 'Mittelklick + Drag',   labelKey: 'shortcuts.keyMiddleDrag' },
    { key: 'Shift + Klick',        labelKey: 'shortcuts.keyPing' },
    { key: '0',                    labelKey: 'shortcuts.keyFit' },
    { key: '1 – 5',                labelKey: 'shortcuts.keyMapSwitch' },
    { section: t('shortcuts.sectionTokens') },
    { key: 'Klick',          labelKey: 'shortcuts.keyTokenSelect' },
    { key: 'Shift + Klick',  labelKey: 'shortcuts.keyTokenMultiSelect' },
    { key: 'Delete',         labelKey: 'shortcuts.keyDeleteToken' },
    { key: 'Ctrl + C',       labelKey: 'shortcuts.keyCopyToken' },
    { key: 'Ctrl + V',       labelKey: 'shortcuts.keyPasteToken' },
    { section: t('shortcuts.sectionCombat') },
    { key: 'N',        labelKey: 'shortcuts.keyNextFighter' },
    { section: t('shortcuts.sectionFog') },
    { key: 'Doppelklick', labelKey: 'shortcuts.keyPolygonFinish' },
    { key: 'Ctrl + Z',    labelKey: 'shortcuts.keyFogUndo' },
    { key: 'Ctrl + Shift + Z', labelKey: 'shortcuts.keyFogRedo' },
    { section: t('shortcuts.sectionContextMenus') },
    { key: 'Rechtsklick Karte',         labelKey: 'shortcuts.keyCtxMap' },
    { key: 'Rechtsklick Token',         labelKey: 'shortcuts.keyCtxToken' },
    { key: 'Rechtsklick Karte (Liste)', labelKey: 'shortcuts.keyCtxMapList' },
    { key: 'Rechtsklick Wiki-Eintrag',  labelKey: 'shortcuts.keyCtxWiki' },
    { key: 'Rechtsklick Audio-Kanal',   labelKey: 'shortcuts.keyCtxAudio' },
    { section: t('shortcuts.sectionPlayerControl') },
    { key: 'Ctrl + Drag',         labelKey: 'shortcuts.keyPcDrag' },
    { key: 'Ctrl + Mausrad',      labelKey: 'shortcuts.keyPcZoom' },
    { key: 'Ctrl + Pfeiltasten',  labelKey: 'shortcuts.keyPcRotate' },
    { key: 'Escape',              labelKey: 'shortcuts.keyPcExit' },
    { section: t('shortcuts.sectionGeneral') },
    { key: 'Ctrl + K', labelKey: 'shortcuts.keyPalette' },
    { key: 'Ctrl + B', labelKey: 'shortcuts.keyBlackout' },
    { key: 'Ctrl + P', labelKey: 'shortcuts.keyPlayerWindow' },
    { key: 'Ctrl + \\', labelKey: 'shortcuts.keyLeftSidebar' },
    { key: 'Ctrl + Shift + \\', labelKey: 'shortcuts.keyRightSidebar' },
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
                {s.key}
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
