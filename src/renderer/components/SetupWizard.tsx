import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../stores/settingsStore'

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation()
  const { userDataFolder, setUserDataFolder } = useSettingsStore()
  const [tempFolder, setTempFolder] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTempFolder(userDataFolder)
  }, [userDataFolder])

  async function handleChooseFolder() {
    if (!window.electronAPI) return
    
    try {
      const result = await window.electronAPI.importFile('atmosphere') // We'll reuse this for folder selection
      if (result?.path) {
        // Extract directory from the selected file path
        const directory = result.path.substring(0, result.path.lastIndexOf('/'))
        setTempFolder(directory)
      }
    } catch (err) {
      console.error('[SetupWizard] folder selection failed:', err)
      setError('Ordnerauswahl fehlgeschlagen')
    }
  }

  async function handleContinue() {
    if (tempFolder.trim()) {
      // Set the custom user data folder in the main process
      if (window.electronAPI) {
        await window.electronAPI.setUserDataFolder(tempFolder)
      }
      setUserDataFolder(tempFolder)
      onComplete()
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
          lineHeight: 1.5
        }}>
          Wählen Sie einen Ordner für Ihre BoltBerry-Daten. 
          Wir empfehlen den Standardordner zu verwenden.
        </p>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 'var(--sp-3)',
          marginBottom: 'var(--sp-6)'
        }}>
          <label style={{ 
            textAlign: 'left', 
            fontSize: 'var(--text-sm)', 
            color: 'var(--text-muted)',
            fontWeight: 500
          }}>
            Datenordner
          </label>
          
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <input
              className="input"
              value={tempFolder}
              onChange={(e) => setTempFolder(e.target.value)}
              placeholder="Pfad zum Datenordner"
              style={{ flex: 1 }}
            />
            <button 
              className="btn btn-ghost"
              onClick={handleChooseFolder}
            >
              Durchsuchen
            </button>
          </div>
          
          {error && (
            <div style={{
              color: 'var(--error)',
              fontSize: 'var(--text-xs)',
              textAlign: 'left',
              marginTop: 'var(--sp-1)'
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          gap: 'var(--sp-2)'
        }}>
          <button 
            className="btn btn-ghost"
            onClick={() => setTempFolder('')}
          >
            Zurücksetzen
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleContinue}
            disabled={!tempFolder.trim()}
          >
            Weiter
          </button>
        </div>
      </div>
    </div>
  )
}