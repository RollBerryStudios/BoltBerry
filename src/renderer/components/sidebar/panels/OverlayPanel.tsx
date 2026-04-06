import { useState } from 'react'
import type { PlayerOverlay, WeatherType } from '@shared/ipc-types'

const STYLE_OPTS: { id: PlayerOverlay['style']; label: string }[] = [
  { id: 'title',    label: 'Titel (groß)' },
  { id: 'subtitle', label: 'Untertitel' },
  { id: 'caption',  label: 'Beschriftung' },
]

const POS_OPTS: { id: PlayerOverlay['position']; label: string }[] = [
  { id: 'top',    label: 'Oben' },
  { id: 'center', label: 'Mitte' },
  { id: 'bottom', label: 'Unten' },
]

const WEATHER_OPTS: { id: WeatherType; icon: string; label: string }[] = [
  { id: 'none',  icon: '☀️',  label: 'Klar' },
  { id: 'rain',  icon: '🌧️',  label: 'Regen' },
  { id: 'snow',  icon: '❄️',  label: 'Schnee' },
  { id: 'fog',   icon: '🌫️',  label: 'Nebel' },
  { id: 'wind',  icon: '💨',  label: 'Wind' },
]

export function OverlayPanel() {
  const [text, setText] = useState('')
  const [position, setPosition] = useState<PlayerOverlay['position']>('bottom')
  const [style, setStyle] = useState<PlayerOverlay['style']>('title')
  const [active, setActive] = useState(false)
  const [weather, setWeather] = useState<WeatherType>('none')

  function handleSend() {
    if (!text.trim()) return
    window.electronAPI?.sendOverlay({ text: text.trim(), position, style })
    setActive(true)
  }

  function handleClear() {
    window.electronAPI?.sendOverlay(null)
    setActive(false)
  }

  function handleWeather(type: WeatherType) {
    setWeather(type)
    window.electronAPI?.sendWeather(type)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)', overflowY: 'auto' }}>
      <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-3)' }}>
        Präsentations-Overlay
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <textarea
          className="input"
          placeholder="Text für Spieler-Bildschirm…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={{ resize: 'none' }}
        />

        {/* Style */}
        <div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-1)' }}>
            Stil
          </label>
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            {STYLE_OPTS.map((o) => (
              <button
                key={o.id}
                className={`btn btn-ghost ${style === o.id ? 'btn-active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px' }}
                onClick={() => setStyle(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position */}
        <div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 'var(--sp-1)' }}>
            Position
          </label>
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            {POS_OPTS.map((o) => (
              <button
                key={o.id}
                className={`btn btn-ghost ${position === o.id ? 'btn-active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px' }}
                onClick={() => setPosition(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Send / Clear buttons */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)' }}
            disabled={!text.trim()}
            onClick={handleSend}
          >
            {active ? '↺ Aktualisieren' : '▶ Senden'}
          </button>
          {active && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}
              onClick={handleClear}
            >
              ✕ Ausblenden
            </button>
          )}
        </div>

        {active && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', textAlign: 'center' }}>
            Overlay aktiv auf Spieler-Bildschirm
          </div>
        )}

        {/* Preview box */}
        <div style={{
          border: '1px dashed var(--border-subtle)',
          borderRadius: 'var(--radius)',
          padding: 'var(--sp-3)',
          background: 'rgba(0,0,0,0.3)',
          minHeight: 60,
          display: 'flex',
          alignItems: position === 'top' ? 'flex-start' : position === 'bottom' ? 'flex-end' : 'center',
          justifyContent: 'center',
        }}>
          {text ? (
            <span style={{
              color: '#e8e8f0',
              fontSize: style === 'title' ? 16 : style === 'subtitle' ? 13 : 11,
              fontWeight: style === 'title' ? 700 : style === 'subtitle' ? 600 : 400,
              textAlign: 'center',
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}>
              {text}
            </span>
          ) : (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Vorschau</span>
          )}
        </div>

        {/* ── Wetter-Overlay ──────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--sp-3)' }}>
          <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-2)' }}>
            Wetter-Overlay
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' }}>
            {WEATHER_OPTS.map((w) => (
              <button
                key={w.id}
                className={`btn btn-ghost ${weather === w.id ? 'btn-active' : ''}`}
                title={w.label}
                style={{ flex: '1 1 calc(33% - 4px)', justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px 2px', flexDirection: 'column', gap: 2 }}
                onClick={() => handleWeather(w.id)}
              >
                <span style={{ fontSize: 16 }}>{w.icon}</span>
                {w.label}
              </button>
            ))}
          </div>
          {weather !== 'none' && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', textAlign: 'center', marginTop: 'var(--sp-2)' }}>
              Wetter aktiv: {WEATHER_OPTS.find((w) => w.id === weather)?.label}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
