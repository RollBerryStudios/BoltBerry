import { useState, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { setUserDataFolder, setIsSetupComplete } = useSettingsStore()
  const [tempFolder, setTempFolder] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      onComplete()
    } catch (err) {
      console.error('[SetupWizard] setUserDataFolder failed:', err)
      setError('Ordner konnte nicht gesetzt werden')
    }
  }

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
        <h2 style={{ marginBottom: 'var(--sp-2)' }}>Willkommen bei BoltBerry!</h2>
        <p style={{
          color: 'var(--text-muted)',
          marginBottom: 'var(--sp-6)',
          lineHeight: 1.5,
        }}>
          Wählen Sie einen Ordner für Ihre BoltBerry-Daten.
          Wir empfehlen den Standardordner zu verwenden.
        </p>

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
