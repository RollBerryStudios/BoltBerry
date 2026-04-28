import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './shared/Modal'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { useDockStore } from '../stores/dockStore'
import { useCampaignStore } from '../stores/campaignStore'
import { showToast } from './shared/Toast'

export type GlobalSettingsSection = 'storage' | 'appearance' | 'profile' | 'file' | 'about'

interface GlobalSettingsModalProps {
  onClose: () => void
  /** Pre-select a section so deep-links from chrome (e.g. Welcome's
   *  👤 button) land on the right page. Defaults to 'storage'. */
  initialSection?: GlobalSettingsSection
}

type Section = GlobalSettingsSection


export function GlobalSettingsModal({ onClose, initialSection }: GlobalSettingsModalProps) {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>(initialSection ?? 'storage')

  return (
    <Modal
      onClose={onClose}
      ariaLabel={t('globalSettings.title')}
      style={{ width: 720, maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{
        padding: 'var(--sp-4) var(--sp-5)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0 }}>
          {t('globalSettings.title')}
        </h2>
        <button
          className="btn btn-ghost"
          onClick={onClose}
          aria-label={t('globalSettings.close')}
          style={{ padding: '4px 10px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav
          aria-label={t('globalSettings.sections')}
          style={{
            width: 200,
            borderRight: '1px solid var(--border)',
            padding: 'var(--sp-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-1)',
            flexShrink: 0,
            overflowY: 'auto',
          }}
        >
          {/* Sidebar labels reuse each section's `.title` so we don't
              maintain a parallel set of strings (and so we never re-
              introduce the duplicate-key bug where a sidebar string and
              a section object collide on the same JSON path). */}
          <SectionTab id="storage" current={section} onSelect={setSection} icon="💾" label={t('globalSettings.storage.title')} />
          <SectionTab id="appearance" current={section} onSelect={setSection} icon="🎨" label={t('globalSettings.appearance.title')} />
          <SectionTab id="profile" current={section} onSelect={setSection} icon="👤" label={t('globalSettings.profile.title')} />
          <SectionTab id="file" current={section} onSelect={setSection} icon="📁" label={t('globalSettings.fileSec.title')} />
          <SectionTab id="about" current={section} onSelect={setSection} icon="ℹ" label={t('globalSettings.about.title')} />
        </nav>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-5)' }}>
          {section === 'storage' && <StorageSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'profile' && <ProfileSection />}
          {section === 'file' && <FileSection onClose={onClose} />}
          {section === 'about' && <AboutSection onClose={onClose} />}
        </div>
      </div>
    </Modal>
  )
}

function SectionTab({
  id,
  current,
  onSelect,
  icon,
  label,
}: {
  id: Section
  current: Section
  onSelect: (s: Section) => void
  icon: string
  label: string
}) {
  const active = current === id
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        padding: 'var(--sp-2) var(--sp-3)',
        background: active ? 'var(--accent-blue-dim)' : 'transparent',
        border: '1px solid ' + (active ? 'var(--accent-blue)' : 'transparent'),
        borderRadius: 'var(--radius)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: 'var(--text-sm)',
        cursor: 'pointer',
        textAlign: 'left',
        fontWeight: active ? 600 : 400,
        transition: 'all var(--transition)',
      }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 'var(--sp-4)' }}>
      <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, margin: 0, marginBottom: hint ? 4 : 0 }}>
        {title}
      </h3>
      {hint && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          {hint}
        </p>
      )}
    </div>
  )
}

// ─── Storage section ─────────────────────────────────────────────────────────
function StorageSection() {
  const { t } = useTranslation()
  const userDataFolder = useSettingsStore((s) => s.userDataFolder)
  const setUserDataFolder = useSettingsStore((s) => s.setUserDataFolder)
  const [busy, setBusy] = useState(false)

  async function handleOpenFolder() {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.openContentFolder()
    } catch (err) {
      showToast(t('globalSettings.errors.openFolder'), 'error')
    }
  }

  async function handleChangeFolder() {
    if (!window.electronAPI || busy) return
    setBusy(true)
    try {
      const chosen = await window.electronAPI.chooseFolder()
      if (!chosen) return
      const result = await window.electronAPI.setUserDataFolder(chosen)
      if (!result?.success) {
        showToast(
          result?.error
            ? t('globalSettings.errors.changeFolderPrefix', { error: result.error })
            : t('globalSettings.errors.changeFolder'),
          'error',
          7000,
        )
        return
      }
      setUserDataFolder(chosen)
      showToast(t('globalSettings.storage.changedReload'), 'success', 8000)
    } catch (err) {
      showToast(t('globalSettings.errors.changeFolder'), 'error', 7000)
    } finally {
      setBusy(false)
    }
  }

  async function handleAssetCleanup() {
    if (!window.electronAPI) return
    try {
      const probe = await window.electronAPI.assetCleanup(true)
      if (!probe.success) {
        showToast(t('globalSettings.errors.scanFailed', { error: probe.error ?? '' }), 'error', 7000)
        return
      }
      if (probe.count === 0) {
        showToast(t('globalSettings.storage.cleanupEmpty'), 'success')
        return
      }
      const mb = (probe.totalBytes / (1024 * 1024)).toFixed(1)
      const msg = t('globalSettings.storage.cleanupConfirm', { count: probe.count, mb })
      if (!window.confirm(msg)) return
      const result = await window.electronAPI.assetCleanup(false)
      if (result.success) {
        showToast(t('globalSettings.storage.cleanupDone', { count: result.count }), 'success', 6000)
      } else {
        showToast(t('globalSettings.errors.cleanupFailed', { error: result.error ?? '' }), 'error', 7000)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast(t('globalSettings.errors.cleanupFailed', { error: message }), 'error', 7000)
    }
  }

  return (
    <>
      <SectionHeader title={t('globalSettings.storage.title')} hint={t('globalSettings.storage.hint')} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-1)' }}>
            {t('globalSettings.storage.folderLabel')}
          </label>
          <div style={{
            padding: 'var(--sp-2)',
            background: 'var(--bg-overlay)',
            borderRadius: 'var(--radius)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            border: '1px solid var(--border-subtle)',
          }}>
            {userDataFolder || t('globalSettings.storage.notSet')}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost"
            onClick={handleOpenFolder}
            style={{ flex: '1 1 140px' }}
          >
            📂 {t('globalSettings.storage.openFolder')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={handleChangeFolder}
            disabled={busy}
            style={{ flex: '1 1 140px' }}
          >
            🔀 {t('globalSettings.storage.changeFolder')}
          </button>
        </div>

        <div style={{
          padding: 'var(--sp-3)',
          background: 'var(--bg-overlay)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>
            🧹 {t('globalSettings.storage.cleanupTitle')}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
            {t('globalSettings.storage.cleanupHint')}
          </div>
          <button className="btn btn-ghost" onClick={handleAssetCleanup} style={{ width: '100%' }}>
            {t('globalSettings.storage.cleanupRun')}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Appearance section ──────────────────────────────────────────────────────
function AppearanceSection() {
  const { t } = useTranslation()
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const language = useUIStore((s) => s.language)
  const toggleLanguage = useUIStore((s) => s.toggleLanguage)
  const dockLabels = useDockStore((s) => s.dockLabels)
  const dockAutoHide = useDockStore((s) => s.dockAutoHide)
  const toggleDockLabels = useDockStore((s) => s.toggleDockLabels)
  const toggleDockAutoHide = useDockStore((s) => s.toggleDockAutoHide)

  return (
    <>
      <SectionHeader title={t('globalSettings.appearance.title')} hint={t('globalSettings.appearance.hint')} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <SettingRow
          label={t('globalSettings.appearance.theme')}
          hint={t('globalSettings.appearance.themeHint')}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { if (theme !== 'dark') toggleTheme() }}
              style={{ padding: '6px 14px' }}
            >
              🌙 {t('globalSettings.appearance.dark')}
            </button>
            <button
              className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { if (theme !== 'light') toggleTheme() }}
              style={{ padding: '6px 14px' }}
            >
              ☀ {t('globalSettings.appearance.light')}
            </button>
          </div>
        </SettingRow>

        <SettingRow
          label={t('globalSettings.appearance.language')}
          hint={t('globalSettings.appearance.languageHint')}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            {(['de', 'en'] as const).map((l) => (
              <button
                key={l}
                className={`btn ${language === l ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { if (language !== l) toggleLanguage() }}
                style={{ padding: '6px 14px', minWidth: 60 }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </SettingRow>

        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--sp-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--sp-3)' }}>
            {t('globalSettings.appearance.dockTitle')}
          </div>

          <ToggleRow
            label={t('globalSettings.appearance.dockLabels')}
            hint={t('globalSettings.appearance.dockLabelsHint')}
            checked={dockLabels}
            onToggle={toggleDockLabels}
          />
          <ToggleRow
            label={t('globalSettings.appearance.dockAutoHide')}
            hint={t('globalSettings.appearance.dockAutoHideHint')}
            checked={dockAutoHide}
            onToggle={toggleDockAutoHide}
          />
        </div>
      </div>
    </>
  )
}

// ─── Profile section ─────────────────────────────────────────────────────────
function ProfileSection() {
  const { t } = useTranslation()
  const displayName = useSettingsStore((s) => s.displayName)
  const avatarHue = useSettingsStore((s) => s.avatarHue)
  const setDisplayName = useSettingsStore((s) => s.setDisplayName)
  const setAvatarHue = useSettingsStore((s) => s.setAvatarHue)
  const [draftName, setDraftName] = useState(displayName)

  const effectiveHue = avatarHue ?? hashHue(displayName || 'BoltBerry')
  const previewLetter = (draftName || displayName || 'B').slice(0, 1).toUpperCase()

  function commitName() {
    setDisplayName(draftName)
  }

  return (
    <>
      <SectionHeader title={t('globalSettings.profile.title')} hint={t('globalSettings.profile.hint')} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
          <div
            style={{
              width: 72, height: 72,
              borderRadius: '50%',
              background: `hsl(${effectiveHue}, 60%, 45%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
              fontWeight: 600,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {previewLetter}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-1)' }}>
              {t('globalSettings.profile.displayName')}
            </label>
            <input
              className="input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
              placeholder={t('globalSettings.profile.displayNamePlaceholder')}
              maxLength={40}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
            {t('globalSettings.profile.avatarHue')}
          </label>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={effectiveHue}
            onChange={(e) => setAvatarHue(parseInt(e.target.value, 10))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setAvatarHue(null)} style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}>
              {t('globalSettings.profile.resetHue')}
            </button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {effectiveHue}°
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── File section ────────────────────────────────────────────────────────────
// Cross-campaign file actions: importing another campaign archive while
// already inside one. Per-campaign export/quick-backup live in the
// per-campaign SettingsPanel where the active campaign is the implied
// subject; "import any other campaign" doesn't fit that scope.
function FileSection({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const setActiveCampaign = useCampaignStore((s) => s.setActiveCampaign)

  async function handleImport() {
    if (!window.electronAPI) return
    showToast(t('globalSettings.fileSec.importRunning'), 'info')
    try {
      const result = await window.electronAPI.importCampaign() as {
        success: boolean; campaignId?: number; error?: string; canceled?: boolean
      }
      if (result.success && result.campaignId) {
        const campaigns = await window.electronAPI.campaigns.list()
        useCampaignStore.getState().setCampaigns(campaigns)
        setActiveCampaign(result.campaignId)
        showToast(t('globalSettings.fileSec.importDone'), 'success', 6000)
        onClose()
      } else if (result.canceled) {
        showToast(t('globalSettings.fileSec.importCanceled'), 'info')
      } else if (!result.success) {
        showToast(t('globalSettings.fileSec.importFailed', { error: result.error ?? '' }), 'error', 7000)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(t('globalSettings.fileSec.importFailed', { error: msg }), 'error', 7000)
    }
  }

  return (
    <>
      <SectionHeader title={t('globalSettings.fileSec.title')} hint={t('globalSettings.fileSec.hint')} />

      <div style={{
        padding: 'var(--sp-3)',
        background: 'var(--bg-overlay)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>
          📥 {t('globalSettings.fileSec.importTitle')}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-2)' }}>
          {t('globalSettings.fileSec.importHint')}
        </div>
        <button className="btn btn-ghost" onClick={handleImport} style={{ width: '100%' }}>
          {t('globalSettings.fileSec.importRun')}
        </button>
      </div>
    </>
  )
}

// ─── About section ───────────────────────────────────────────────────────────
// Defers to the canonical AboutDialog (SRD attribution + credits) so the
// modal doesn't keep a parallel about copy that would drift over time.
function AboutSection({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <SectionHeader title={t('globalSettings.about.title')} />

      <div style={{
        padding: 'var(--sp-4)',
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 4 }}>BoltBerry</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--sp-4)' }}>
          {t('globalSettings.about.tagline')}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            onClose()
            window.dispatchEvent(new CustomEvent('app:open-about'))
          }}
        >
          {t('globalSettings.about.openFull')}
        </button>
      </div>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint?: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--sp-2)',
      padding: 'var(--sp-2) 0',
      cursor: 'pointer',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{label}</span>
        {hint && (
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
            {hint}
          </span>
        )}
      </span>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ flexShrink: 0 }} />
    </label>
  )
}

function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h % 360
}
