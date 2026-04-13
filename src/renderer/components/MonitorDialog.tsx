import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface Display {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

interface MonitorDialogProps {
  onClose: () => void
}

export function MonitorDialog({ onClose }: MonitorDialogProps) {
  const { t } = useTranslation()
  const [displays, setDisplays] = useState<Display[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    window.electronAPI?.getMonitors().then((d: Display[]) => {
      setDisplays(d)
      const nonPrimary = d.find((x) => !x.isPrimary)
      setSelected(nonPrimary?.id ?? d[0]?.id ?? null)
    })
  }, [])

  async function handleOpen() {
    if (selected === null) return
    setOpening(true)
    try {
      await window.electronAPI?.setPlayerMonitor(selected)
      await window.electronAPI?.openPlayerWindow()
      onClose()
    } catch (err) {
      console.error('[MonitorDialog] Failed to open player window:', err)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
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
        width: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
      }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--sp-4)' }}>
          {t('monitorDialog.title')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
          {displays.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              {t('monitorDialog.loading')}
            </div>
          ) : (
            displays.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-3)',
                  padding: 'var(--sp-3)',
                  background: selected === d.id ? 'var(--accent-blue-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${selected === d.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  transition: 'all var(--transition)',
                }}
              >
                <div style={{
                  width: 48, height: 32,
                  background: 'var(--bg-base)',
                  border: `2px solid ${selected === d.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                  borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  🖥
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{d.label}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {d.bounds.width} × {d.bounds.height} px
                    {d.isPrimary
                      ? ` ${t('monitorDialog.primary')}`
                      : ` ${t('monitorDialog.recommended')}`}
                  </div>
                </div>
                {selected === d.id && (
                  <div style={{ marginLeft: 'auto', color: 'var(--accent-blue-light)', fontSize: 18 }}>✓</div>
                )}
              </button>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('monitorDialog.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleOpen}
            disabled={selected === null || opening}
          >
            {opening ? t('monitorDialog.opening') : t('monitorDialog.open')}
          </button>
        </div>
      </div>
    </div>
  )
}
