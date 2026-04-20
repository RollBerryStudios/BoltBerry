import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { CompendiumPdfViewer } from './CompendiumPdfViewer'
import type { CompendiumFile } from '@shared/ipc-types'

// Global search state — shared hit record with enough to render one row
// and jump straight into the right PDF at the right page.
interface GlobalHit {
  file: CompendiumFile
  page: number
  snippet: string
}

type IndexState =
  | { phase: 'idle' }
  | { phase: 'indexing'; doneFiles: number; totalFiles: number }
  | { phase: 'ready' }

/* Top-level Compendium view. Shown via uiStore.topView === 'compendium'.
   Currently scaffolds navigation, the PDF list sidebar, and the empty-
   state flow. The actual PDF rendering + search lands in the next
   package. */

export function CompendiumView() {
  const { t } = useTranslation()
  const setTopView = useUIStore((s) => s.setTopView)
  const language = useUIStore((s) => s.language)
  const toggleLanguage = useUIStore((s) => s.toggleLanguage)
  // Reserve space for OS-native window controls (matches DmTitleBar).
  const isDarwin = typeof navigator !== 'undefined' &&
    navigator.userAgent.toUpperCase().includes('MAC')

  const [files, setFiles] = useState<CompendiumFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // Jump target: when set, the viewer opens this page on load.
  const [jumpTarget, setJumpTarget] = useState<number | null>(null)
  // Global search: query, state, results, and the per-file text index.
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalIndexState, setGlobalIndexState] = useState<IndexState>({ phase: 'idle' })
  // Map file.path → page → extracted text.
  const globalIndexRef = useRef<Map<string, Map<number, string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!window.electronAPI) return
    setLoading(true)
    try {
      const list = await window.electronAPI.listCompendium()
      setFiles(list)
      if (list.length === 0) setSelectedPath(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  // SRD PDFs ship in both languages (srd-de-5.2.1.pdf, srd-en-5.2.1.pdf).
  // Show only the one that matches the current UI language so the
  // compendium doesn't force the DM to pick the same book twice.
  const matchesLanguage = (name: string) =>
    language === 'de' ? /[-_]de[-_]/i.test(name) : /[-_]en[-_]/i.test(name)
  const visibleFiles = useMemo(
    () => files.filter((f) => f.source === 'user' || matchesLanguage(f.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, language],
  )

  // Auto-select a sensible default: the language-matching bundled SRD first,
  // or the first user file otherwise. Re-runs when the language toggles so
  // the viewer follows.
  useEffect(() => {
    if (visibleFiles.length === 0) { setSelectedPath(null); return }
    const stillVisible = visibleFiles.find((f) => f.path === selectedPath)
    if (stillVisible) return
    const bundled = visibleFiles.find((f) => f.source !== 'user')
    setSelectedPath((bundled ?? visibleFiles[0]).path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFiles])

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

  // Build the per-file text index on demand. Each PDF is loaded once via
  // compendium:read IPC, decoded, pdfjs-ified, and every page's
  // getTextContent is cached in globalIndexRef. Repeat searches are O(n)
  // scans over already-loaded text maps.
  const buildIndex = useCallback(async () => {
    if (!window.electronAPI || files.length === 0) return
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    setGlobalIndexState({ phase: 'indexing', doneFiles: 0, totalFiles: files.length })
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (globalIndexRef.current.has(file.path)) {
        setGlobalIndexState({ phase: 'indexing', doneFiles: i + 1, totalFiles: files.length })
        continue
      }
      try {
        const dataUrl = await window.electronAPI.readCompendiumPdf(file.path)
        if (!dataUrl) {
          globalIndexRef.current.set(file.path, new Map())
          continue
        }
        const raw = atob(dataUrl.split(',')[1] ?? '')
        const bytes = new Uint8Array(raw.length)
        for (let j = 0; j < raw.length; j++) bytes[j] = raw.charCodeAt(j)
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise
        const pageText = new Map<number, string>()
        for (let p = 1; p <= doc.numPages; p++) {
          try {
            const page = await doc.getPage(p)
            const content = await page.getTextContent()
            const text = (content.items as Array<{ str?: string }>)
              .map((it) => (it.str ?? '').trim()).filter(Boolean).join(' ')
            pageText.set(p, text)
          } catch {
            pageText.set(p, '')
          }
        }
        globalIndexRef.current.set(file.path, pageText)
        doc.destroy()
      } catch {
        globalIndexRef.current.set(file.path, new Map())
      }
      setGlobalIndexState({ phase: 'indexing', doneFiles: i + 1, totalFiles: files.length })
    }
    setGlobalIndexState({ phase: 'ready' })
  }, [files])

  useEffect(() => {
    const q = globalQuery.trim()
    if (q.length < 2) return
    if (globalIndexState.phase === 'idle') void buildIndex()
  }, [globalQuery, globalIndexState.phase, buildIndex])

  const globalHits: GlobalHit[] = useMemo(() => {
    const q = globalQuery.trim().toLowerCase()
    if (q.length < 2 || globalIndexState.phase !== 'ready') return []
    const hits: GlobalHit[] = []
    outer: for (const file of files) {
      const pages = globalIndexRef.current.get(file.path)
      if (!pages) continue
      for (const [page, text] of pages) {
        const lower = text.toLowerCase()
        let from = 0
        while (true) {
          const idx = lower.indexOf(q, from)
          if (idx === -1) break
          const start = Math.max(0, idx - 30)
          const end = Math.min(text.length, idx + q.length + 60)
          const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
          hits.push({ file, page, snippet })
          from = idx + q.length
          if (hits.length >= 300) break outer
        }
      }
    }
    return hits
  }, [globalQuery, globalIndexState, files])

  function jumpToHit(hit: GlobalHit) {
    setSelectedPath(hit.file.path)
    setJumpTarget(hit.page)
    setGlobalQuery('')
  }

  return (
    <div className="bb-comp">
      <CompendiumStyles />

      {/* Top bar */}
      <header className="bb-comp-topbar" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {isDarwin && <div className="bb-comp-traffic-space" aria-hidden="true" />}
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
          <div className="bb-comp-global-search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder={t('compendium.globalSearchPlaceholder')}
            />
            {globalQuery && (
              <button type="button" onClick={() => setGlobalQuery('')} title={t('compendium.closeSearch')}>✕</button>
            )}
          </div>
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
        {!isDarwin && <div className="bb-comp-controls-space" aria-hidden="true" />}
      </header>

      {/* Short visible credit in proximity to the bundled SRD PDFs.
          Click opens the About dialog with the canonical CC-BY-4.0
          attribution paragraph. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('app:open-about'))}
        style={{
          padding: '6px var(--sp-6)',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          border: 'none',
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          width: '100%',
        }}
      >
        {t('compendium.attributionPrefix')} · CC-BY-4.0{' · '}
        <span style={{
          color: 'var(--accent-blue-light)',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
        }}>{t('compendium.attributionSuffix')}</span>
      </button>

      {/* Cross-PDF search results — overlays the body when a query is active. */}
      {globalQuery.trim().length >= 2 && (
        <div className="bb-comp-global-results">
          <div className="bb-comp-global-results-header">
            {globalIndexState.phase === 'indexing'
              ? t('compendium.indexing', { done: globalIndexState.doneFiles, total: globalIndexState.totalFiles })
              : globalIndexState.phase === 'ready'
                ? t('compendium.hits', { count: globalHits.length })
                : '…'}
          </div>
          {globalIndexState.phase === 'ready' && globalHits.length === 0 ? (
            <div className="bb-comp-sidebar-empty">{t('compendium.noHits')}</div>
          ) : (
            <div className="bb-comp-global-results-list">
              {globalHits.map((h, i) => {
                const q = globalQuery.trim().toLowerCase()
                const idx = h.snippet.toLowerCase().indexOf(q)
                const before = idx >= 0 ? h.snippet.slice(0, idx) : h.snippet
                const match = idx >= 0 ? h.snippet.slice(idx, idx + q.length) : ''
                const after = idx >= 0 ? h.snippet.slice(idx + q.length) : ''
                return (
                  <button
                    key={`${h.file.path}-${h.page}-${i}`}
                    type="button"
                    className="bb-comp-global-hit"
                    onClick={() => jumpToHit(h)}
                  >
                    <span className="bb-comp-global-hit-file">{h.file.name}</span>
                    <span className="bb-comp-global-hit-page mono">
                      {t('compendium.pageShort')} {h.page}
                    </span>
                    <span className="bb-comp-global-hit-snippet">
                      {before}<mark>{match}</mark>{after}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Body: file list sidebar (only when the user has more than one
          file to choose from — typically happens only after importing a
          custom PDF) + viewer. Bundled SRDs are filtered by UI language
          upstream, so the default install shows no sidebar. */}
      <div className="bb-comp-body">
        {visibleFiles.length > 1 && (
          <aside className="bb-comp-sidebar">
            <div className="bb-comp-sidebar-title">
              {t('compendium.files')} <span className="bb-comp-sidebar-count mono">{visibleFiles.length}</span>
            </div>
            <ul className="bb-comp-sidebar-list">
              {visibleFiles.map((f) => (
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
          </aside>
        )}

        <main className="bb-comp-main">
          {error && <div className="bb-comp-error">⚠️ {error}</div>}
          {selected ? (
            <CompendiumPdfViewer
              key={selected.path}
              file={selected}
              initialPage={jumpTarget}
              onConsumedInitialPage={() => setJumpTarget(null)}
            />
          ) : (
            <EmptyCompendium onImport={handleImport} onOpenFolder={handleOpenFolder} />
          )}
        </main>
      </div>
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
      /* Reserve room for the OS-native window-control buttons, mirroring
         DmTitleBar (72px traffic lights on macOS, 140px caption buttons
         on Windows / Linux). Without this, Windows minimise / maximise /
         close overlap the import + folder buttons. */
      .bb-comp-traffic-space  { width: 72px;  height: 100%; flex-shrink: 0; }
      .bb-comp-controls-space { width: 140px; height: 100%; flex-shrink: 0; }
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

      /* Global search input */
      .bb-comp-global-search {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        width: 220px;
      }
      .bb-comp-global-search input {
        flex: 1; min-width: 0;
        background: transparent;
        border: none; outline: none;
        color: var(--text-primary);
        font-size: 12px;
        font-family: inherit;
      }
      .bb-comp-global-search button {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-muted); font-size: 11px; padding: 0 2px;
      }

      /* Global search result panel */
      .bb-comp-global-results {
        border-bottom: 1px solid var(--border);
        background: var(--bg-surface);
        max-height: 60%;
        overflow-y: auto;
      }
      .bb-comp-global-results-header {
        padding: 8px var(--sp-5);
        font-size: 10px; letterSpacing: '0.08em';
        color: var(--text-muted);
        text-transform: uppercase;
        font-weight: 700;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border-subtle);
      }
      .bb-comp-global-results-list {
        display: flex; flex-direction: column;
      }
      .bb-comp-global-hit {
        display: grid;
        grid-template-columns: 140px 60px 1fr;
        align-items: baseline;
        gap: 10px;
        padding: 6px var(--sp-5);
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--border-subtle);
        color: var(--text-primary);
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        transition: background var(--transition);
      }
      .bb-comp-global-hit:hover { background: var(--bg-overlay); }
      .bb-comp-global-hit-file {
        font-weight: 600;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bb-comp-global-hit-page {
        font-size: 10px;
        color: var(--text-muted);
        font-weight: 600;
      }
      .bb-comp-global-hit-snippet {
        color: var(--text-secondary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        min-width: 0;
      }
      .bb-comp-global-hit-snippet mark {
        background: rgba(255, 198, 46, 0.35);
        color: var(--accent);
        padding: 0 2px;
        border-radius: 2px;
      }

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
      /* Flex, not a fixed 2-column grid: when the user only has a
         single PDF visible the sidebar does not render at all, and
         the old 280px + 1fr grid left main stuck in the 280px column
         with the rest of the window empty. Flex lets main reclaim
         the full width when it is the only child. */
      .bb-comp-body {
        flex: 1; min-height: 0;
        display: flex;
        overflow: hidden;
      }
      .bb-comp-sidebar {
        width: 280px;
        flex-shrink: 0;
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
        flex: 1; min-width: 0; min-height: 0;
        display: flex; flex-direction: column;
        padding: var(--sp-5);
      }
      .bb-comp-main > :not(.bb-comp-error) { flex: 1; min-height: 0; }
      .bb-comp-error {
        padding: var(--sp-3) var(--sp-4);
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius);
        color: var(--danger);
        font-size: var(--text-sm);
        margin-bottom: var(--sp-4);
      }

      .bb-comp-empty {
        display: flex; flex-direction: column; align-items: center;
        text-align: center;
        padding: 64px var(--sp-6);
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
      }
      .bb-comp-empty-icon { font-size: 52px; opacity: 0.6; margin-bottom: var(--sp-3); }
      .bb-comp-empty-title {
        font-size: 24px; margin: 0 0 var(--sp-2);
        color: var(--text-primary);
      }
      .bb-comp-empty-sub {
        color: var(--text-secondary);
        font-size: 13px; max-width: 480px;
        margin: 0 0 var(--sp-5);
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
