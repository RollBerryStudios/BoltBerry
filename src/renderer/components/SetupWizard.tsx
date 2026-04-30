import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../stores/settingsStore'
import logoSquare from '../assets/boltberry-logo.png'

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation()
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
      setError(t('setupWizard.errorChoose'))
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
          const msg = result?.error
            ? t('setupWizard.errorDbPrefix', { error: result.error })
            : t('setupWizard.errorSetFolder')
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
      setError(t('setupWizard.errorSetFolder'))
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div
        data-testid="setup-wizard-success"
        style={{
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
            {t('setupWizard.successTitle')}
          </h2>
          <p style={{
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: 'var(--sp-2)',
            maxWidth: 360,
            margin: '0 auto var(--sp-2)',
          }}>
            {t('setupWizard.successBody')}
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
            color: 'var(--text-secondary)',
            lineHeight: 1.8,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)' }}>
              📂 {tempFolder}
            </div>
            <div>🗺 <strong>maps/</strong> — {t('setupWizard.folderMaps')}</div>
            <div>🪙 <strong>tokens/</strong> — {t('setupWizard.folderTokens')}</div>
            <div>🎵 <strong>audio/</strong> — {t('setupWizard.folderAudio')}</div>
          </div>
          <button
            data-testid="button-setup-finish"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontWeight: 700, padding: '10px 0', marginBottom: 'var(--sp-2)' }}
            onClick={onComplete}
          >
            {t('setupWizard.letsGo')}
          </button>
          <button
            data-testid="button-setup-import-campaign"
            className="btn"
            style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-xs)', padding: '8px 0' }}
            onClick={() => {
              window.electronAPI?.importCampaign()
                .then((result: any) => {
                  if (result?.success) onComplete()
                })
                .catch(() => {})
            }}
          >
            📥 {t('setupWizard.importCampaign')}
          </button>
        </div>
      </div>
    )
  }

  // ── Setup screen ───────────────────────────────────────────────────────────
  return (
    <div
      data-testid="setup-wizard"
      style={{
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
        <h2 style={{ marginBottom: 'var(--sp-2)' }}>{t('setupWizard.welcome')}</h2>
        <p style={{
          color: 'var(--text-secondary)',
          marginBottom: 'var(--sp-4)',
          lineHeight: 1.5,
          maxWidth: 380,
          margin: '0 auto var(--sp-4)',
        }}>
          {t('setupWizard.pickFolderIntro')}
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
          color: 'var(--text-secondary)',
          lineHeight: 1.9,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
            {t('setupWizard.folderExplainHeader')}
          </div>
          <div>🗺 {t('setupWizard.explainMaps')}</div>
          <div>🪙 {t('setupWizard.explainTokens')}</div>
          <div>🎵 {t('setupWizard.explainAudio')}</div>
          <div>📄 {t('setupWizard.explainDb')}</div>
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
            {t('setupWizard.dataFolder')}
          </label>

          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <input
              data-testid="input-setup-data-folder"
              className="input"
              value={loading ? t('setupWizard.loading') : tempFolder}
              onChange={(e) => setTempFolder(e.target.value)}
              placeholder={t('setupWizard.pathPlaceholder')}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button
              data-testid="button-setup-browse"
              className="btn btn-ghost"
              onClick={handleChooseFolder}
              disabled={loading}
            >
              {t('setupWizard.browse')}
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
            data-testid="button-setup-next"
            className="btn btn-primary"
            onClick={handleContinue}
            disabled={loading || !tempFolder.trim()}
          >
            {t('setupWizard.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
