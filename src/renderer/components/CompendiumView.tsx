import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import type { CompendiumFile } from '@shared/ipc-types'

/* Top-level Compendium view. Shown via uiStore.topView === 'compendium'.
   Currently scaffolds navigation, the PDF list sidebar, and the empty-
   state flow. The actual PDF rendering + search lands in the next
   package. */

export function CompendiumView() {
  const { t } = useTranslation()
  const setTopView = useUIStore((s) => s.setTopView)
  const language = useUIStore((s) => s.language)
  const toggleLanguage = useUIStore((s) => s.toggleLanguage)

  const [files, setFiles] = useState<CompendiumFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!window.electronAPI) return
    setLoading(true)
    try {
      const list = await window.electronAPI.listCompendium()
      setFiles(list)
      if (list.length > 0 && !selectedPath) {
        setSelectedPath(list[0].path)
      }
      if (list.length === 0) setSelectedPath(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleImport() {
    if (!window.electronAPI) return
    const result = await window.electronAPI.importCompendiumPdf()
    if (result?.success) {
      await refresh()
      setSelectedPath(result.path)
    } else if (result && result.error !== 'cancelled') {
      setError(result.error ?? 'import-failed')
    }
  }

  async function handleOpenFolder() {
    await window.electronAPI?.openCompendiumFolder()
  }

  const selected = files.find((f) => f.path === selectedPath) ?? null

  return (
    <div className="bb-comp">
      <CompendiumStyles />

      {/* Top bar */}
      <header className="bb-comp-topbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <button
          type="button"
          className="bb-comp-back"
          onClick={() => setTopView('main')}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={t('compendium.back')}
        >
          ◁ {t('compendium.back')}
        </button>

        <div className="bb-comp-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill="var(--accent)" />
          </svg>
          <span className="bb-comp-wordmark">
            BOLT<span style={{ color: 'var(--accent-blue-light)' }}>BERRY</span>
          </span>
          <span className="bb-comp-breadcrumb-sep">/</span>
          <span className="bb-comp-breadcrumb-name">{t('compendium.title')}</span>
        </div>

        <div className="bb-comp-actions" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button type="button" className="bb-comp-cta bb-comp-cta-ghost" onClick={handleImport}>
            📥 {t('compendium.importPdf')}
          </button>
          <button type="button" className="bb-comp-cta bb-comp-cta-ghost" onClick={handleOpenFolder}>
            📁 {t('compendium.openFolder')}
          </button>
          <div className="bb-comp-lang" role="group" aria-label="Language">
            {(['de', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  if (language !== l) toggleLanguage()
                }}
                className={language === l ? 'active' : ''}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Body: file list sidebar + viewer */}
      <div className="bb-comp-body">
        <aside className="bb-comp-sidebar">
          <div className="bb-comp-sidebar-title">
            {t('compendium.files')} <span className="bb-comp-sidebar-count mono">{files.length}</span>
          </div>
          {loading && files.length === 0 ? (
            <div className="bb-comp-sidebar-empty">…</div>
          ) : files.length === 0 ? (
            <div className="bb-comp-sidebar-empty">{t('compendium.noFiles')}</div>
          ) : (
            <ul className="bb-comp-sidebar-list">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className={
                      f.path === selectedPath
                        ? 'bb-comp-file active'
                        : 'bb-comp-file'
                    }
                    onClick={() => setSelectedPath(f.path)}
                    title={f.path}
                  >
                    <span className="bb-comp-file-icon" aria-hidden="true">
                      📕
                    </span>
                    <span className="bb-comp-file-body">
                      <span className="bb-comp-file-name">{f.name}</span>
                      <span className="bb-comp-file-meta mono">
                        {formatSize(f.size)}
                        <span className="bb-comp-file-sep">·</span>
                        {t(f.source === 'bundled' ? 'compendium.bundled' : 'compendium.userFile')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="bb-comp-main">
          {error && <div className="bb-comp-error">⚠️ {error}</div>}
          {selected ? (
            <PdfViewerPlaceholder file={selected} />
          ) : (
            <EmptyCompendium onImport={handleImport} onOpenFolder={handleOpenFolder} />
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Viewer placeholder ───────────────────────────────────────────────
// Real PDF rendering lands in the next package. This placeholder proves
// the data flow (file listed, file selected, path resolvable) end-to-end.

function PdfViewerPlaceholder({ file }: { file: CompendiumFile }) {
  const { t } = useTranslation()
  return (
    <div className="bb-comp-viewer-empty">
      <div className="bb-comp-viewer-empty-icon">📕</div>
      <h2 className="bb-comp-viewer-empty-title display">{file.name}</h2>
      <p className="bb-comp-viewer-empty-sub">
        {formatSize(file.size)} · {t(file.source === 'bundled' ? 'compendium.bundled' : 'compendium.userFile')}
      </p>
      <p className="bb-comp-viewer-empty-hint">{t('compendium.viewerComingSoon')}</p>
    </div>
  )
}

// ─── Empty compendium (no files at all) ───────────────────────────────

function EmptyCompendium({
  onImport,
  onOpenFolder,
}: {
  onImport: () => void
  onOpenFolder: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="bb-comp-empty">
      <div className="bb-comp-empty-icon">📚</div>
      <h2 className="bb-comp-empty-title display">{t('compendium.emptyTitle')}</h2>
      <p className="bb-comp-empty-sub">{t('compendium.emptySub')}</p>
      <div className="bb-comp-empty-actions">
        <button type="button" className="bb-comp-cta" onClick={onImport}>
          📥 {t('compendium.importPdf')}
        </button>
        <button type="button" className="bb-comp-cta bb-comp-cta-ghost" onClick={onOpenFolder}>
          📁 {t('compendium.openFolder')}
        </button>
      </div>
      <div className="bb-comp-empty-hint">
        <strong>{t('compendium.srdHintTitle')}:</strong>{' '}
        <span>
          <a
            href="https://media.dndbeyond.com/compendium-images/srd/5.2/DE_SRD_CC_v5.2.1.pdf"
            target="_blank"
            rel="noreferrer"
            className="bb-comp-empty-link"
          >
            D&amp;D 5e SRD (DE, CC-BY-4.0)
          </a>
        </span>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}

// ─── Scoped styles ────────────────────────────────────────────────────

function CompendiumStyles() {
  return (
    <style>{`
      .bb-comp {
        display: flex; flex-direction: column;
        height: 100%;
        background: var(--bg-base);
        color: var(--text-primary);
      }
      .bb-comp .display {
        font-family: 'Fraunces', 'Iowan Old Style', Georgia, serif;
        font-weight: 500; letter-spacing: -0.01em;
      }
      .bb-comp .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

      /* ── Top bar ───────────────────────────────────────────── */
      .bb-comp-topbar {
        display: flex; align-items: center; gap: var(--sp-4);
        padding: 0 var(--sp-6); height: 56px;
        background: rgba(13, 16, 21, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
        user-select: none;
      }
      .bb-comp-back {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 5px 12px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-secondary);
        font-size: 12px; font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: border-color var(--transition), color var(--transition);
        flex-shrink: 0;
      }
      .bb-comp-back:hover {
        border-color: var(--accent);
        color: var(--accent-light);
      }
      .bb-comp-brand {
        display: flex; align-items: center; gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .bb-comp-wordmark {
        font-size: 12px; letter-spacing: 0.14em; font-weight: 700;
      }
      .bb-comp-breadcrumb-sep { color: var(--text-muted); }
      .bb-comp-breadcrumb-name {
        font-size: 13px; font-weight: 500;
        color: var(--text-primary);
      }
      .bb-comp-actions {
        display: flex; align-items: center; gap: var(--sp-2);
        flex-shrink: 0;
      }

      .bb-comp-cta {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 7px 14px;
        background: var(--accent);
        color: var(--text-inverse);
        border: none; border-radius: var(--radius);
        font-size: 13px; font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: background var(--transition), transform var(--transition);
      }
      .bb-comp-cta:hover { background: var(--accent-hover); }
      .bb-comp-cta:active { transform: translateY(1px); }
      .bb-comp-cta-ghost {
        background: transparent;
        color: var(--text-primary);
        border: 1px solid var(--border);
      }
      .bb-comp-cta-ghost:hover { background: var(--bg-overlay); }

      .bb-comp-lang {
        display: flex;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }
      .bb-comp-lang button {
        padding: 4px 10px;
        font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
        background: transparent;
        color: var(--text-muted);
        border: none; cursor: pointer;
        font-family: inherit;
      }
      .bb-comp-lang button.active {
        background: var(--accent-dim);
        color: var(--accent);
      }

      /* ── Body ──────────────────────────────────────────────── */
      .bb-comp-body {
        flex: 1; min-height: 0;
        display: grid;
        grid-template-columns: 280px 1fr;
        overflow: hidden;
      }
      .bb-comp-sidebar {
        border-right: 1px solid var(--border);
        background: var(--bg-surface);
        overflow-y: auto;
        padding: var(--sp-4) 0;
      }
      .bb-comp-sidebar-title {
        display: flex; align-items: center; gap: 6px;
        padding: 0 var(--sp-4);
        font-size: 11px; letter-spacing: 0.08em; font-weight: 700;
        color: var(--text-muted);
        text-transform: uppercase;
        margin-bottom: var(--sp-3);
      }
      .bb-comp-sidebar-count {
        font-size: 10px; font-weight: 600;
        color: var(--text-muted);
      }
      .bb-comp-sidebar-empty {
        padding: 0 var(--sp-4);
        font-size: 12px; color: var(--text-muted);
      }
      .bb-comp-sidebar-list {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column;
      }
      .bb-comp-file {
        display: flex; gap: 10px;
        width: 100%;
        padding: 10px var(--sp-4);
        background: transparent;
        border: none;
        border-left: 2px solid transparent;
        color: var(--text-primary);
        font-family: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
        transition: background var(--transition), border-color var(--transition);
      }
      .bb-comp-file:hover { background: var(--bg-overlay); }
      .bb-comp-file.active {
        background: var(--accent-dim);
        border-left-color: var(--accent);
      }
      .bb-comp-file-icon { font-size: 16px; line-height: 1; flex-shrink: 0; }
      .bb-comp-file-body {
        display: flex; flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .bb-comp-file-name {
        font-weight: 500;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bb-comp-file-meta {
        font-size: 10px;
        color: var(--text-muted);
        display: flex; gap: 6px;
      }
      .bb-comp-file-sep { opacity: 0.5; }

      /* ── Main area ─────────────────────────────────────────── */
      .bb-comp-main {
        position: relative;
        overflow: auto;
        padding: var(--sp-6);
      }
      .bb-comp-error {
        padding: var(--sp-3) var(--sp-4);
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius);
        color: var(--danger);
        font-size: var(--text-sm);
        margin-bottom: var(--sp-4);
      }

      .bb-comp-viewer-empty,
      .bb-comp-empty {
        display: flex; flex-direction: column; align-items: center;
        text-align: center;
        padding: 64px var(--sp-6);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
      }
      .bb-comp-viewer-empty-icon,
      .bb-comp-empty-icon { font-size: 52px; opacity: 0.6; margin-bottom: var(--sp-3); }
      .bb-comp-viewer-empty-title,
      .bb-comp-empty-title {
        font-size: 24px; margin: 0 0 var(--sp-2);
        color: var(--text-primary);
      }
      .bb-comp-viewer-empty-sub,
      .bb-comp-empty-sub {
        color: var(--text-secondary);
        font-size: 13px; max-width: 480px;
        margin: 0 0 var(--sp-5);
      }
      .bb-comp-viewer-empty-hint {
        color: var(--text-muted);
        font-size: 12px;
        margin: 0;
        padding: var(--sp-2) var(--sp-4);
        background: var(--bg-elevated);
        border: 1px dashed var(--border);
        border-radius: var(--radius);
      }
      .bb-comp-empty-actions {
        display: flex; gap: var(--sp-3);
        margin-bottom: var(--sp-5);
      }
      .bb-comp-empty-hint {
        font-size: 12px; color: var(--text-secondary);
        max-width: 460px;
        padding: var(--sp-3) var(--sp-4);
        background: var(--bg-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius);
        line-height: 1.5;
      }
      .bb-comp-empty-link {
        color: var(--accent-blue-light);
        text-decoration: underline;
        text-decoration-style: dotted;
      }
      .bb-comp-empty-link:hover { color: var(--accent-blue); }
    `}</style>
  )
}
