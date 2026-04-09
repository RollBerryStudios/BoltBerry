import { useTranslation } from 'react-i18next'

interface ShortcutOverlayProps {
  onClose: () => void
}

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  const { t } = useTranslation()

  type ShortcutEntry =
    | { section: string }
    | { key: string; labelKey: string }

  const SHORTCUTS: ShortcutEntry[] = [
    { section: t('shortcuts.sectionTools') },
    { key: 'V',                   labelKey: 'shortcuts.keySelect' },
    { key: 'F',                   labelKey: 'shortcuts.keyFogRect' },
    { key: 'P',                   labelKey: 'shortcuts.keyFogPolygon' },
    { key: 'C',                   labelKey: 'shortcuts.keyFogCover' },
    { key: 'R',                   labelKey: 'shortcuts.keyRoom' },
    { key: 'T',                   labelKey: 'shortcuts.keyTokenTab' },
    { section: t('shortcuts.sectionMapNav') },
    { key: 'Mausrad / Scroll',    labelKey: 'shortcuts.keyMouseWheel' },
    { key: 'Alt + Drag',          labelKey: 'shortcuts.keyAltDrag' },
    { key: 'Mittelklick / Middle',labelKey: 'shortcuts.keyMiddleDrag' },
    { key: '1 – 5',               labelKey: 'shortcuts.keyMapSwitch' },
    { section: t('shortcuts.sectionCombat') },
    { key: 'N',                   labelKey: 'shortcuts.keyNextFighter' },
    { section: t('shortcuts.sectionFog') },
    { key: 'Doppelklick / Dblclk',labelKey: 'shortcuts.keyPolygonFinish' },
    { key: 'Ctrl + Z',            labelKey: 'shortcuts.keyFogUndo' },
    { key: 'Ctrl + ⇧ + Z',       labelKey: 'shortcuts.keyFogRedo' },
    { section: t('shortcuts.sectionGeneral') },
    { key: 'Space',               labelKey: 'shortcuts.keyBlackout' },
    { key: 'Delete',              labelKey: 'shortcuts.keyDeleteToken' },
    { key: 'Escape',              labelKey: 'shortcuts.keyEscape' },
    { key: 'Ctrl + S',            labelKey: 'shortcuts.keySave' },
    { key: '?',                   labelKey: 'shortcuts.keyShortcutOverlay' },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--sp-6)',
        width: 520,
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
      }}>
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
                {t(s.labelKey)}
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
      </div>
    </div>
  )
}
