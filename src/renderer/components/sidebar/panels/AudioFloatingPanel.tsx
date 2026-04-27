import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MusicLivePanel } from './MusicLivePanel'
import { ProfessionalSfxPanel } from './ProfessionalSfxPanel'

/**
 * Compact tabbed audio surface for the FloatingUtilityDock popover.
 * Shows live music controls under Music and the SFX board under SFX.
 * Replaces the legacy `AudioPanel layout="narrow"` that mixed both
 * concerns into one ~800-line component.
 *
 * The SFX panel runs with `hideBoards` so the popover stays compact —
 * board management lives in the workspace's SFX tab. The DM still
 * picks the active board there before a session and triggers slots
 * here during play (or via the 0–9 keyboard shortcuts).
 */
export function AudioFloatingPanel() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'music' | 'sfx'>('music')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-elevated)',
          zIndex: 1,
        }}
      >
        {(['music', 'sfx'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              padding: '5px 0',
              background: 'none',
              border: 'none',
              borderBottom: tab === id ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: tab === id ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {id === 'music' ? t('audio.tabMusic') : t('audio.tabSfx')}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'music' ? <MusicLivePanel /> : <ProfessionalSfxPanel hideBoards />}
      </div>
    </div>
  )
}
