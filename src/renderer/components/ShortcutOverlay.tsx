interface ShortcutOverlayProps {
  onClose: () => void
}

const SHORTCUTS = [
  { section: 'Werkzeuge' },
  { key: 'V',         label: 'Auswählen / Token verschieben' },
  { key: 'F',         label: 'Fog aufdecken (Rechteck)' },
  { key: 'P',         label: 'Fog aufdecken (Polygon)' },
  { key: 'C',         label: 'Fog zudecken' },
  { key: 'T',         label: 'Token-Tab öffnen' },
  { section: 'Karte & Navigation' },
  { key: 'Mausrad',   label: 'Zoom zur Mausposition' },
  { key: 'Alt + Drag',label: 'Karte verschieben (Pan)' },
  { key: 'Mittelklick + Drag', label: 'Karte verschieben (Pan)' },
  { key: '1 – 5',     label: 'Schnell-Wechsel Karte 1–5' },
  { section: 'Kampf & Initiative' },
  { key: 'N',         label: 'Nächster Kämpfer' },
  { section: 'Fog of War' },
  { key: 'Doppelklick', label: 'Polygon abschließen' },
  { key: 'Ctrl + Z',  label: 'Fog-Aufdeckung rückgängig' },
  { key: 'Ctrl + ⇧ + Z', label: 'Fog-Aufdeckung wiederholen' },
  { section: 'Allgemein' },
  { key: 'Space',     label: 'Schwarzbild ein/aus' },
  { key: 'Delete',    label: 'Ausgewählten Token löschen' },
  { key: 'Escape',    label: 'Auswahl aufheben / Polygon abbrechen' },
  { key: 'Ctrl + S',  label: 'Sofort speichern' },
  { key: '?',         label: 'Dieses Fenster' },
] as const

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
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
          <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>⌨️ Tastenkürzel</h2>
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
                {s.label}
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
          Drücke <kbd style={{ background: 'var(--bg-overlay)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)' }}>?</kbd> oder <kbd style={{ background: 'var(--bg-overlay)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)' }}>F1</kbd> um dieses Fenster zu öffnen
        </div>
      </div>
    </div>
  )
}
