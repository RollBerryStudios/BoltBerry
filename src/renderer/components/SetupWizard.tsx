import { useState, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import logoSquare from '../assets/boltberry-logo.png'

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { setUserDataFolder, setIsSetupComplete } = useSettingsStore()
  const [tempFolder, setTempFolder] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'setup' | 'success'>('setup')

  useEffect(() => {
    if (!window.electronAPI) {
      setLoading(false)
      return
    }
    window.electronAPI.getDefaultUserDataFolder()
      .then((path: string) => {
        if (path) setTempFolder(path)
      })
      .catch((err: unknown) => {
        console.error('[SetupWizard] getDefaultUserDataFolder failed:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleChooseFolder() {
    if (!window.electronAPI) return
    setError(null)
    try {
      const chosen = await window.electronAPI.chooseFolder()
      if (chosen) setTempFolder(chosen)
    } catch (err) {
      console.error('[SetupWizard] chooseFolder failed:', err)
      setError('Ordnerauswahl fehlgeschlagen')
    }
  }

  async function handleContinue() {
    const folder = tempFolder.trim()
    if (!folder) return
    setError(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.setUserDataFolder(folder)
        if (!result?.success) {
          const msg = result?.error ? `Datenbank-Fehler: ${result.error}` : 'Ordner konnte nicht gesetzt werden'
          setError(msg)
          console.error('[SetupWizard] setUserDataFolder failed:', result?.error)
          return
        }
      }
      setUserDataFolder(folder)
      setIsSetupComplete(true)
      setStep('success')
    } catch (err) {
      console.error('[SetupWizard] setUserDataFolder failed:', err)
      setError('Ordner konnte nicht gesetzt werden')
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 'var(--sp-6)',
        background: 'var(--bg-base)',
      }}>
        <div style={{
          width: 500,
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: 'var(--sp-8)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--sp-4)' }}>🎉</div>
          <h2 style={{ marginBottom: 'var(--sp-3)', color: 'var(--text-primary)' }}>
            Einrichtung abgeschlossen!
          </h2>
          <p style={{
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: 'var(--sp-2)',
            maxWidth: 360,
            margin: '0 auto var(--sp-2)',
          }}>
            Dein Datenordner ist eingerichtet. Lege deine Karten-Bilder, Token-Bilder und Audio-Dateien dort ab — BoltBerry findet sie automatisch beim Import.
          </p>
          <div style={{
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius)',
            padding: 'var(--sp-3)',
            marginBottom: 'var(--sp-6)',
            marginTop: 'var(--sp-4)',
            textAlign: 'left',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.8,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)' }}>
              📂 {tempFolder}
            </div>
            <div>🗺 <strong>maps/</strong> — Karten-Bilder (PNG, JPG, WebP)</div>
            <div>🪙 <strong>tokens/</strong> — Token-Bilder und Charakterbilder</div>
            <div>🎵 <strong>audio/</strong> — Hintergrundmusik und Soundeffekte</div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontWeight: 700, padding: '10px 0' }}
            onClick={onComplete}
          >
            Los geht's →
          </button>
        </div>
      </div>
    )
  }

  // ── Setup screen ───────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 'var(--sp-6)',
      background: 'var(--bg-base)',
    }}>
      <div style={{
        width: 500,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: 'var(--sp-6)',
        textAlign: 'center',
      }}>
        <img
          src={logoSquare}
          alt="BoltBerry"
          style={{ height: 56, width: 'auto', marginBottom: 'var(--sp-3)' }}
        />
        <h2 style={{ marginBottom: 'var(--sp-2)' }}>Willkommen bei BoltBerry!</h2>
        <p style={{
          color: 'var(--text-muted)',
          marginBottom: 'var(--sp-4)',
          lineHeight: 1.5,
          maxWidth: 380,
          margin: '0 auto var(--sp-4)',
        }}>
          Wähle einen Ordner, in dem BoltBerry deine Kampagnen, Karten,
          Token und Audio-Dateien speichert. Du kannst diesen Ordner
          später in den Einstellungen ändern.
        </p>

        {/* Asset folder explanation */}
        <div style={{
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)',
          padding: 'var(--sp-3)',
          marginBottom: 'var(--sp-5)',
          textAlign: 'left',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          lineHeight: 1.9,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
            Was wird in diesem Ordner gespeichert?
          </div>
          <div>🗺 Karten-Bilder (PNG, JPG, WebP)</div>
          <div>🪙 Token- und Charakterbilder</div>
          <div>🎵 Hintergrundmusik und Soundeffekte</div>
          <div>📄 Kampagnen-Datenbank und Handouts</div>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-3)',
          marginBottom: 'var(--sp-6)',
        }}>
          <label style={{
            textAlign: 'left',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            fontWeight: 500,
          }}>
            Datenordner
          </label>

          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <input
              className="input"
              value={loading ? 'Lade…' : tempFolder}
              onChange={(e) => setTempFolder(e.target.value)}
              placeholder="Pfad zum Datenordner"
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-ghost"
              onClick={handleChooseFolder}
              disabled={loading}
            >
              Durchsuchen
            </button>
          </div>

          {error && (
            <div style={{
              color: 'var(--error)',
              fontSize: 'var(--text-xs)',
              textAlign: 'left',
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--sp-2)',
        }}>
          <button
            className="btn btn-primary"
            onClick={handleContinue}
            disabled={loading || !tempFolder.trim()}
          >
            Weiter
          </button>
        </div>
      </div>
    </div>
  )
}
