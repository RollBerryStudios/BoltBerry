import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../../stores/uiStore'
import type { PlayerOverlay, WeatherType } from '@shared/ipc-types'

export function OverlayPanel() {
  const { t } = useTranslation()
  const setOverlayActive = useUIStore((s) => s.setOverlayActive)
  const setActiveWeather = useUIStore((s) => s.setActiveWeather)
  const [text, setText] = useState('')
  const [position, setPosition] = useState<PlayerOverlay['position']>('bottom')
  const [style, setStyle] = useState<PlayerOverlay['style']>('title')
  const [active, setActive] = useState(false)
  const [weather, setWeather] = useState<WeatherType>('none')

  const STYLE_OPTS: { id: PlayerOverlay['style']; labelKey: string }[] = [
    { id: 'title',    labelKey: 'overlay.styleTitle' },
    { id: 'subtitle', labelKey: 'overlay.styleSubtitle' },
    { id: 'caption',  labelKey: 'overlay.styleCaption' },
  ]

  const POS_OPTS: { id: PlayerOverlay['position']; labelKey: string }[] = [
    { id: 'top',    labelKey: 'overlay.posTop' },
    { id: 'center', labelKey: 'overlay.posCenter' },
    { id: 'bottom', labelKey: 'overlay.posBottom' },
  ]

  const WEATHER_OPTS: { id: WeatherType; icon: string; labelKey: string }[] = [
    { id: 'none',  icon: '☀️',  labelKey: 'overlay.weatherNone' },
    { id: 'rain',  icon: '🌧️',  labelKey: 'overlay.weatherRain' },
    { id: 'snow',  icon: '❄️',  labelKey: 'overlay.weatherSnow' },
    { id: 'fog',   icon: '🌫️',  labelKey: 'overlay.weatherFog' },
    { id: 'wind',  icon: '💨',  labelKey: 'overlay.weatherWind' },
  ]

  function handleSend() {
    if (!text.trim()) return
    window.electronAPI?.sendOverlay({ text: text.trim(), position, style })
    setActive(true)
    setOverlayActive(true)
  }

  function handleClear() {
    window.electronAPI?.sendOverlay(null)
    setActive(false)
    setOverlayActive(false)
  }

  function handleWeather(type: WeatherType) {
    setWeather(type)
    setActiveWeather(type)
    window.electronAPI?.sendWeather(type)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-4)', overflowY: 'auto' }}>
      <div className="sidebar-section-title" style={{ marginBottom: 'var(--sp-3)' }}>
        {t('overlay.title')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <textarea
          className="input"
          placeholder={t('overlay.textPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={{ resize: 'none' }}
        />

        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-1)' }}>
            {t('overlay.style')}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            {STYLE_OPTS.map((o) => (
              <button
                key={o.id}
                className={`btn btn-ghost ${style === o.id ? 'btn-active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px 2px' }}
                onClick={() => setStyle(o.id)}
              >
                {t(o.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-1)' }}>
            {t('overlay.position')}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
            {POS_OPTS.map((o) => (
              <button
                key={o.id}
                className={`btn btn-ghost ${position === o.id ? 'btn-active' : ''}`}
                style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '4px 2px' }}
                onClick={() => setPosition(o.id)}
              >
                {t(o.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={handleSend}
            disabled={!text.trim()}
          >
            {t('overlay.send')}
          </button>
          {active && (
            <button
              className="btn btn-ghost"
              onClick={handleClear}
            >
              {t('overlay.clear')}
            </button>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
            {t('overlay.weather')}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' }}>
            {WEATHER_OPTS.map((w) => (
              <button
                key={w.id}
                className={`btn btn-ghost ${weather === w.id ? 'btn-active' : ''}`}
                style={{ fontSize: 'var(--text-xs)', padding: '3px 6px' }}
                onClick={() => handleWeather(w.id)}
                title={t(w.labelKey)}
              >
                {w.icon}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
