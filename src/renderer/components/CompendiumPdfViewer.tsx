import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import type { CompendiumFile } from '@shared/ipc-types'

/* PDF viewer for the Compendium. Loads a single PDF via the
   compendium:read IPC channel as base64 bytes, then renders one page at
   a time to a canvas using pdfjs-dist (lazy-loaded). The document object
   is cached in component state so only the active page re-renders on
   navigation / zoom changes. */

type Loaded = {
  doc: unknown
  numPages: number
  outline: OutlineEntry[]
}

interface OutlineEntry {
  title: string
  /** 1-based page number; null when the outline item can't be resolved. */
  page: number | null
  children: OutlineEntry[]
}

type SidebarMode = 'off' | 'toc' | 'thumbs'

interface SearchHit {
  page: number
  snippet: string
  /** Index-of match within the extracted page text; used for result ordering. */
  offset: number
}

type SearchState =
  | { phase: 'idle' }
  | { phase: 'indexing'; done: number; total: number }
  | { phase: 'ready' }

interface PdfViewerProps {
  file: CompendiumFile
  /** If set, the viewer jumps to this 1-based page as soon as the PDF loads. */
  initialPage?: number | null
  /** Called after initialPage has been honoured so the parent can clear it. */
  onConsumedInitialPage?: () => void
}

export function CompendiumPdfViewer({ file, initialPage, onConsumedInitialPage }: PdfViewerProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [zoom, setZoom] = useState(1.0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search state. The per-page text cache survives zoom/page changes but is
  // tied to the loaded document; cleared when the user picks a different PDF.
  const pageTextRef = useRef<Map<number, string>>(new Map())
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ phase: 'idle' })

  // Send-to-player toast — acknowledges the page broadcast succeeded.
  const [sentTick, setSentTick] = useState(0)
  const playerConnected = useUIStore((s) => s.playerConnected)

  // Broadcast state: once the DM sends a page to the player window we enter
  // "broadcasting" mode. Page / zoom changes then auto re-render + re-send
  // so players follow what the DM is looking at. The DM can exit broadcast
  // explicitly with the "Stop" button, which clears the player's handout.
  const [broadcasting, setBroadcasting] = useState(false)

  // Sidebar: toc (outline), thumbs (page previews), or off.
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('off')

  // Load (or re-load) the PDF whenever the selected file changes. A cancel
  // flag prevents a stale load from overwriting a newer one when the user
  // clicks through the sidebar faster than the read IPC returns.
  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    setPageNum(1)
    setZoom(1.0)
    setError(null)
    setLoading(true)
    pageTextRef.current = new Map()
    setSearchQuery('')
    setSearchState({ phase: 'idle' })

    ;(async () => {
      if (!window.electronAPI) {
        setError('electronAPI unavailable')
        setLoading(false)
        return
      }
      try {
        const dataUrl = await window.electronAPI.readCompendiumPdf(file.path)
        if (cancelled) return
        if (!dataUrl) {
          setError(t('compendium.readError'))
          setLoading(false)
          return
        }
        const base64 = dataUrl.split(',')[1] ?? ''
        const raw = atob(base64)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const doc = await pdfjsLib.getDocument({ data: bytes }).promise
        if (cancelled) {
          doc.destroy()
          return
        }
        const outline = await extractOutline(doc)
        setLoaded({ doc, numPages: doc.numPages, outline })
        setLoading(false)
        if (initialPage && initialPage >= 1 && initialPage <= doc.numPages) {
          setPageNum(initialPage)
          onConsumedInitialPage?.()
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || String(err))
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
    }
  }, [file.path, t])

  // Render the current page whenever pageNum, zoom, or the loaded doc change.
  // Cancels the previous render so fast page-flipping doesn't pile up tasks.
  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const doc = loaded.doc as { getPage: (n: number) => Promise<unknown> }
        const page = (await doc.getPage(pageNum)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number }
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) =>
            { promise: Promise<void>; cancel: () => void }
        }
        if (cancelled || !canvasRef.current) return
        // devicePixelRatio-aware scaling keeps text crisp on HiDPI without
        // exploding the canvas size on large PDFs.
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: zoom * dpr })
        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width / dpr}px`
        canvas.style.height = `${viewport.height / dpr}px`
        const ctx = canvas.getContext('2d')!
        const task = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        await task.promise
      } catch (err) {
        // pdfjs throws a RenderingCancelledException on cancel — ignore that.
        const name = (err as { name?: string }).name
        if (!cancelled && name !== 'RenderingCancelledException') {
          setError((err as Error).message || String(err))
        }
      }
    })()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
    }
  }, [loaded, pageNum, zoom])

  // Keyboard navigation: arrows for prev/next, Ctrl+=/+-/0 for zoom,
  // Ctrl+F to toggle search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
      if (!loaded) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setSearchOpen((v) => !v)
        return
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        return
      }
      if (inInput) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        setPageNum((p) => Math.min(loaded.numPages, p + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setPageNum((p) => Math.max(1, p - 1))
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        setZoom(1.0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loaded, searchOpen])

  // Build a page-text index on demand. Runs when search opens for the first
  // time (or when the document changes). Each page's getTextContent yields
  // an array of items; concatenating their strs gives a searchable body.
  const ensureIndex = useCallback(async () => {
    if (!loaded) return
    if (pageTextRef.current.size === loaded.numPages) {
      setSearchState({ phase: 'ready' })
      return
    }
    setSearchState({ phase: 'indexing', done: 0, total: loaded.numPages })
    const doc = loaded.doc as { getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }
    for (let n = 1; n <= loaded.numPages; n++) {
      if (pageTextRef.current.has(n)) continue
      try {
        const page = await doc.getPage(n)
        const content = await page.getTextContent()
        const text = content.items.map((it) => (it.str ?? '').trim()).filter(Boolean).join(' ')
        pageTextRef.current.set(n, text)
      } catch {
        pageTextRef.current.set(n, '')
      }
      setSearchState({ phase: 'indexing', done: n, total: loaded.numPages })
    }
    setSearchState({ phase: 'ready' })
  }, [loaded])

  // Lazy-build the index the first time the user opens search. Re-opening is
  // cheap: the ref is preserved across opens until the doc changes. A local
  // `cancelled` flag guards against state updates firing after the component
  // unmounts or the user switches PDFs mid-index — without it the last
  // `setSearchState({ phase: 'ready' })` would leak against a stale doc.
  useEffect(() => {
    if (!searchOpen || !loaded) return
    let cancelled = false
    void (async () => {
      await ensureIndex()
      if (cancelled) return
    })()
    return () => { cancelled = true }
  }, [searchOpen, loaded, ensureIndex])

  const searchResults: SearchHit[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || q.length < 2 || searchState.phase !== 'ready') return []
    const hits: SearchHit[] = []
    // Cap at 200 hits so pathological queries (single letter "e") don't
    // freeze the UI. Users can refine the query for more.
    outer: for (const [page, text] of pageTextRef.current) {
      const lower = text.toLowerCase()
      let from = 0
      while (true) {
        const idx = lower.indexOf(q, from)
        if (idx === -1) break
        const start = Math.max(0, idx - 30)
        const end = Math.min(text.length, idx + q.length + 60)
        const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
        hits.push({ page, snippet, offset: idx })
        from = idx + q.length
        if (hits.length >= 200) break outer
      }
    }
    return hits.sort((a, b) => a.page - b.page || a.offset - b.offset)
  }, [searchQuery, searchState])

  // Render + broadcast the current page as a PNG handout. Uses a fresh
  // render so the on-screen canvas state doesn't leak in. Resolution
  // scales with the DM's zoom (clamped) so the DM can enlarge the page
  // for players just by zooming.
  const broadcastCurrentPage = useCallback(async () => {
    if (!loaded || !window.electronAPI) return
    try {
      const doc = loaded.doc as { getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }
      const page = await doc.getPage(pageNum)
      const broadcastScale = Math.min(3, Math.max(1.5, zoom * 2))
      const viewport = page.getViewport({ scale: broadcastScale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      const dataUrl = canvas.toDataURL('image/png')
      window.electronAPI.sendHandout({
        title: `${file.name} · ${t('compendium.pageShort')} ${pageNum}`,
        imagePath: dataUrl,
        textContent: null,
      })
    } catch (err) {
      setError((err as Error).message || String(err))
    }
  }, [loaded, pageNum, zoom, file.name, t])

  async function startOrSendBroadcast() {
    await broadcastCurrentPage()
    setBroadcasting(true)
    setSentTick((n) => n + 1)
  }

  function stopBroadcast() {
    if (!window.electronAPI) return
    window.electronAPI.sendHandout(null)
    setBroadcasting(false)
  }

  // While broadcasting, re-send whenever the DM changes page or zoom so the
  // player window stays in sync with the DM's view. Debounce to avoid
  // spamming during rapid zoom-button mashing.
  useEffect(() => {
    if (!broadcasting) return
    const id = window.setTimeout(() => { void broadcastCurrentPage() }, 180)
    return () => window.clearTimeout(id)
  }, [broadcasting, broadcastCurrentPage])

  // If the player window disconnects, drop out of broadcast mode so the
  // "Stop" button doesn't linger with nothing to stop.
  useEffect(() => {
    if (!playerConnected && broadcasting) setBroadcasting(false)
  }, [playerConnected, broadcasting])

  // Clear the "sent" toast after 1.8s.
  useEffect(() => {
    if (sentTick === 0) return
    const id = window.setTimeout(() => setSentTick(0), 1800)
    return () => window.clearTimeout(id)
  }, [sentTick])

  if (loading || !loaded) {
    return (
      <div className="bb-pdf-loading">
        {error ? `⚠️ ${error}` : `${t('compendium.loading')}\u2026`}
      </div>
    )
  }

  return (
    <div className="bb-pdf">
      <PdfToolbar
        pageNum={pageNum}
        numPages={loaded.numPages}
        zoom={zoom}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        sidebarMode={sidebarMode}
        onSidebarMode={setSidebarMode}
        hasOutline={loaded.outline.length > 0}
        playerConnected={playerConnected}
        broadcasting={broadcasting}
        onSendToPlayer={startOrSendBroadcast}
        onStopBroadcast={stopBroadcast}
        onPrev={() => setPageNum((p) => Math.max(1, p - 1))}
        onNext={() => setPageNum((p) => Math.min(loaded.numPages, p + 1))}
        onGoto={(n) => setPageNum(Math.max(1, Math.min(loaded.numPages, n)))}
        onZoomIn={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
        onZoomReset={() => setZoom(1.0)}
      />

      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onChange={setSearchQuery}
          state={searchState}
          results={searchResults}
          onJump={(p) => setPageNum(p)}
          onClose={() => setSearchOpen(false)}
          activePage={pageNum}
        />
      )}

      <div className="bb-pdf-body">
        {sidebarMode !== 'off' && (
          <aside className="bb-pdf-sidebar">
            {sidebarMode === 'toc' && loaded.outline.length > 0 && (
              <OutlineTree
                entries={loaded.outline}
                depth={0}
                currentPage={pageNum}
                onJump={(p) => setPageNum(p)}
              />
            )}
            {sidebarMode === 'toc' && loaded.outline.length === 0 && (
              <div className="bb-pdf-sidebar-empty">
                {t('compendium.noOutline')}
              </div>
            )}
            {sidebarMode === 'thumbs' && (
              <ThumbnailList
                doc={loaded.doc}
                numPages={loaded.numPages}
                currentPage={pageNum}
                onJump={(p) => setPageNum(p)}
              />
            )}
          </aside>
        )}

        <div className="bb-pdf-canvas-wrap">
          <canvas ref={canvasRef} className="bb-pdf-canvas" />
          {sentTick > 0 && (
            <div className="bb-pdf-sent-toast">
              ✓ {t('compendium.sentToPlayer')}
            </div>
          )}
        </div>
      </div>

      <PdfViewerStyles />
    </div>
  )
}

// ─── Search bar + result list ────────────────────────────────────────

function SearchBar({
  query,
  onChange,
  state,
  results,
  onJump,
  onClose,
  activePage,
}: {
  query: string
  onChange: (q: string) => void
  state: SearchState
  results: SearchHit[]
  onJump: (page: number) => void
  onClose: () => void
  activePage: number
}) {
  const { t } = useTranslation()
  const trimmed = query.trim()
  return (
    <div className="bb-pdf-search">
      <div className="bb-pdf-search-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className="bb-pdf-search-input"
          autoFocus
          value={query}
          placeholder={t('compendium.searchPlaceholder')}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="bb-pdf-search-status mono">
          {state.phase === 'indexing' ? `${state.done}/${state.total}` :
            state.phase === 'ready' && trimmed.length >= 2 ? t('compendium.hits', { count: results.length }) :
            state.phase === 'ready' ? t('compendium.ready') : ''}
        </span>
        <button type="button" className="bb-pdf-btn" onClick={onClose} title={t('compendium.closeSearch')}>
          ✕
        </button>
      </div>
      {state.phase === 'ready' && trimmed.length >= 2 && (
        <div className="bb-pdf-search-results">
          {results.length === 0 ? (
            <div className="bb-pdf-search-none">{t('compendium.noHits')}</div>
          ) : (
            results.map((hit, i) => {
              const lower = hit.snippet.toLowerCase()
              const q = trimmed.toLowerCase()
              const idx = lower.indexOf(q)
              const before = idx >= 0 ? hit.snippet.slice(0, idx) : hit.snippet
              const match = idx >= 0 ? hit.snippet.slice(idx, idx + trimmed.length) : ''
              const after = idx >= 0 ? hit.snippet.slice(idx + trimmed.length) : ''
              return (
                <button
                  key={`${hit.page}-${hit.offset}-${i}`}
                  type="button"
                  className={hit.page === activePage ? 'bb-pdf-search-hit active' : 'bb-pdf-search-hit'}
                  onClick={() => onJump(hit.page)}
                >
                  <span className="bb-pdf-search-hit-page mono">
                    {t('compendium.pageShort')} {hit.page}
                  </span>
                  <span className="bb-pdf-search-hit-snippet">
                    {before}
                    <mark>{match}</mark>
                    {after}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────

function PdfToolbar({
  pageNum,
  numPages,
  zoom,
  searchOpen,
  onToggleSearch,
  sidebarMode,
  onSidebarMode,
  hasOutline,
  playerConnected,
  broadcasting,
  onSendToPlayer,
  onStopBroadcast,
  onPrev,
  onNext,
  onGoto,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  pageNum: number
  numPages: number
  zoom: number
  searchOpen: boolean
  onToggleSearch: () => void
  sidebarMode: SidebarMode
  onSidebarMode: (m: SidebarMode) => void
  hasOutline: boolean
  playerConnected: boolean
  broadcasting: boolean
  onSendToPlayer: () => void
  onStopBroadcast: () => void
  onPrev: () => void
  onNext: () => void
  onGoto: (n: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}) {
  const { t } = useTranslation()
  const [pageInput, setPageInput] = useState(String(pageNum))

  useEffect(() => {
    setPageInput(String(pageNum))
  }, [pageNum])

  return (
    <div className="bb-pdf-toolbar">
      <div className="bb-pdf-group">
        <button
          type="button"
          className={sidebarMode === 'toc' ? 'bb-pdf-btn active' : 'bb-pdf-btn'}
          onClick={() => onSidebarMode(sidebarMode === 'toc' ? 'off' : 'toc')}
          disabled={!hasOutline}
          title={hasOutline ? t('compendium.toggleToc') : t('compendium.noOutline')}
        >
          ☰
        </button>
        <button
          type="button"
          className={sidebarMode === 'thumbs' ? 'bb-pdf-btn active' : 'bb-pdf-btn'}
          onClick={() => onSidebarMode(sidebarMode === 'thumbs' ? 'off' : 'thumbs')}
          title={t('compendium.toggleThumbs')}
        >
          ▤
        </button>
      </div>

      <div className="bb-pdf-group">
        <button type="button" className="bb-pdf-btn" onClick={onPrev} disabled={pageNum <= 1} title={t('compendium.prevPage')}>
          ◀
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const n = parseInt(pageInput, 10)
            if (Number.isFinite(n)) onGoto(n)
          }}
          className="bb-pdf-page-form"
        >
          <input
            className="bb-pdf-page-input mono"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => {
              const n = parseInt(pageInput, 10)
              if (Number.isFinite(n)) onGoto(n)
              else setPageInput(String(pageNum))
            }}
            aria-label={t('compendium.pageNumber')}
          />
          <span className="bb-pdf-page-of mono">/ {numPages}</span>
        </form>
        <button type="button" className="bb-pdf-btn" onClick={onNext} disabled={pageNum >= numPages} title={t('compendium.nextPage')}>
          ▶
        </button>
      </div>

      <div className="bb-pdf-group">
        <button type="button" className="bb-pdf-btn" onClick={onZoomOut} disabled={zoom <= 0.4} title={t('compendium.zoomOut')}>
          −
        </button>
        <button type="button" className="bb-pdf-btn bb-pdf-btn-text mono" onClick={onZoomReset} title={t('compendium.zoomReset')}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="bb-pdf-btn" onClick={onZoomIn} disabled={zoom >= 4} title={t('compendium.zoomIn')}>
          +
        </button>
      </div>

      <div className="bb-pdf-group">
        <button
          type="button"
          className={searchOpen ? 'bb-pdf-btn active' : 'bb-pdf-btn'}
          onClick={onToggleSearch}
          title={t('compendium.search') + ' (Ctrl+F)'}
        >
          🔎
        </button>
        <button
          type="button"
          className={broadcasting ? 'bb-pdf-btn bb-pdf-btn-send active' : 'bb-pdf-btn bb-pdf-btn-send'}
          onClick={onSendToPlayer}
          disabled={!playerConnected}
          title={
            !playerConnected ? t('compendium.sendDisabled')
            : broadcasting ? t('compendium.resyncPlayer')
            : t('compendium.sendToPlayer')
          }
        >
          {broadcasting ? '🔄' : '↗'} {t('compendium.sendShort')}
        </button>
        {broadcasting && (
          <button
            type="button"
            className="bb-pdf-btn bb-pdf-btn-stop"
            onClick={onStopBroadcast}
            title={t('compendium.stopBroadcast')}
          >
            ⏹ {t('compendium.stopShort')}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

// ─── Outline extraction ──────────────────────────────────────────────
// pdfjs-dist returns bookmarks as a tree of OutlineNode objects whose
// `dest` needs to be resolved to a 1-based page number via getPageIndex.
// A null result means the destination couldn't be resolved (e.g. external
// links, encrypted refs) — we keep the title but disable the click.

interface PdfOutlineItem {
  title: string
  dest: string | unknown[] | null
  items: PdfOutlineItem[]
}

async function extractOutline(doc: unknown): Promise<OutlineEntry[]> {
  const d = doc as {
    getOutline: () => Promise<PdfOutlineItem[] | null>
    getPageIndex: (ref: unknown) => Promise<number>
    getDestination: (name: string) => Promise<unknown[] | null>
  }
  const raw = await d.getOutline()
  if (!raw) return []
  async function resolve(items: PdfOutlineItem[]): Promise<OutlineEntry[]> {
    const out: OutlineEntry[] = []
    for (const it of items) {
      let page: number | null = null
      try {
        let dest = it.dest
        if (typeof dest === 'string') dest = await d.getDestination(dest)
        if (Array.isArray(dest) && dest.length > 0) {
          const ref = dest[0]
          const idx = await d.getPageIndex(ref)
          if (Number.isFinite(idx)) page = idx + 1
        }
      } catch {
        /* unresolvable — leave page null */
      }
      const children = it.items && it.items.length > 0 ? await resolve(it.items) : []
      out.push({ title: it.title, page, children })
    }
    return out
  }
  return resolve(raw)
}

// ─── TOC sidebar ─────────────────────────────────────────────────────

function OutlineTree({
  entries,
  depth,
  currentPage,
  onJump,
}: {
  entries: OutlineEntry[]
  depth: number
  currentPage: number
  onJump: (page: number) => void
}) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {entries.map((e, i) => (
        <li key={`${depth}-${i}`}>
          <button
            type="button"
            onClick={() => e.page && onJump(e.page)}
            disabled={e.page === null}
            title={e.title}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              width: '100%',
              padding: `4px 10px 4px ${10 + depth * 12}px`,
              background: e.page === currentPage ? 'var(--accent-blue-dim)' : 'transparent',
              border: 'none',
              borderLeft: e.page === currentPage ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: e.page === null ? 'var(--text-muted)' : 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: 11,
              cursor: e.page === null ? 'default' : 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(ev) => { if (e.page !== null && e.page !== currentPage) ev.currentTarget.style.background = 'var(--bg-overlay)' }}
            onMouseLeave={(ev) => { if (e.page !== currentPage) ev.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.title}
            </span>
            {e.page !== null && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.page}</span>
            )}
          </button>
          {e.children.length > 0 && (
            <OutlineTree entries={e.children} depth={depth + 1} currentPage={currentPage} onJump={onJump} />
          )}
        </li>
      ))}
    </ul>
  )
}

// ─── Thumbnail sidebar ───────────────────────────────────────────────

function ThumbnailList({
  doc,
  numPages,
  currentPage,
  onJump,
}: {
  doc: unknown
  numPages: number
  currentPage: number
  onJump: (page: number) => void
}) {
  // Pre-allocate a flat array — each Thumb only renders its canvas when
  // scrolled into view via IntersectionObserver. Keeps memory low on
  // long PDFs (300+ pages).
  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])
  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pages.map((p) => (
        <Thumb
          key={p}
          doc={doc}
          page={p}
          active={p === currentPage}
          onClick={() => onJump(p)}
        />
      ))}
    </div>
  )
}

function Thumb({
  doc,
  page,
  active,
  onClick,
}: {
  doc: unknown
  page: number
  active: boolean
  onClick: () => void
}) {
  const rootRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  // Render the canvas the first time this thumb intersects the viewport.
  useEffect(() => {
    if (rendered || !rootRef.current) return
    const el = rootRef.current
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        io.disconnect()
        void renderThumb()
        return
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()

    async function renderThumb() {
      try {
        const d = doc as { getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }
        const p = await d.getPage(page)
        if (!canvasRef.current) return
        const vp = p.getViewport({ scale: 0.18 })
        canvasRef.current.width = vp.width
        canvasRef.current.height = vp.height
        const ctx = canvasRef.current.getContext('2d')!
        await p.render({ canvasContext: ctx, viewport: vp }).promise
        setRendered(true)
      } catch {
        /* ignore cancelled / stale thumb renders */
      }
    }
  }, [doc, page, rendered])

  // When the user navigates to this page via other controls, scroll the
  // thumb into view so the sidebar tracks the main canvas.
  useEffect(() => {
    if (active && rootRef.current) {
      rootRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [active])

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onClick}
      title={`Seite ${page}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: 4,
        background: 'transparent',
        border: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: '100%',
        minHeight: 120,
        background: '#fff',
        borderRadius: 2,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>
      <div style={{ fontSize: 10, color: active ? 'var(--accent-blue-light)' : 'var(--text-muted)', fontWeight: 600 }}>
        {page}
      </div>
    </button>
  )
}

function PdfViewerStyles() {
  return (
    <style>{`
      .bb-pdf {
        display: flex; flex-direction: column;
        height: 100%;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .bb-pdf-toolbar {
        display: flex; align-items: center;
        justify-content: space-between;
        gap: var(--sp-3);
        padding: 8px var(--sp-4);
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      .bb-pdf-group { display: flex; align-items: center; gap: 4px; }
      .bb-pdf-btn {
        min-width: 32px; height: 28px;
        padding: 0 10px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        cursor: pointer;
        font-family: inherit;
        font-size: 12px; font-weight: 600;
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .bb-pdf-btn:hover:not(:disabled) {
        background: var(--bg-overlay);
        color: var(--text-primary);
      }
      .bb-pdf-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .bb-pdf-btn-text { min-width: 56px; }

      .bb-pdf-page-form { display: flex; align-items: center; gap: 6px; }
      .bb-pdf-page-input {
        width: 52px;
        padding: 4px 6px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-size: 12px;
        text-align: center;
        outline: none;
      }
      .bb-pdf-page-input:focus {
        border-color: var(--accent-blue);
        box-shadow: 0 0 0 2px var(--accent-blue-dim);
      }
      .bb-pdf-page-of { font-size: 12px; color: var(--text-muted); }

      .bb-pdf-body {
        flex: 1; min-height: 0;
        display: flex;
      }
      .bb-pdf-sidebar {
        width: 220px;
        flex-shrink: 0;
        overflow-y: auto;
        background: var(--bg-surface);
        border-right: 1px solid var(--border);
        padding: 6px 0;
      }
      .bb-pdf-sidebar-empty {
        padding: 16px;
        font-size: 11px;
        color: var(--text-muted);
        text-align: center;
        font-style: italic;
      }
      .bb-pdf-canvas-wrap {
        flex: 1; min-height: 0;
        overflow: auto;
        padding: var(--sp-5);
        background: var(--bg-base);
        /* `display: block` + margin auto centers the canvas when it's
           narrower than the viewport, but stops clipping the left edge
           when the page is wider — `flex + justify-content: center`
           anchors overflow off-screen and the user can't scroll back. */
        text-align: center;
      }
      .bb-pdf-canvas {
        background: #fff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        display: inline-block;
        max-width: none;
      }

      .bb-pdf-loading {
        display: flex; align-items: center; justify-content: center;
        height: 100%;
        color: var(--text-muted);
        font-size: 13px;
      }

      .bb-pdf-btn.active {
        background: var(--accent-blue-dim);
        border-color: var(--accent-blue);
        color: var(--accent-blue-light);
      }
      .bb-pdf-btn-send {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--text-inverse);
      }
      .bb-pdf-btn-send:hover:not(:disabled) {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
        color: var(--text-inverse);
      }
      .bb-pdf-btn-send:disabled {
        background: transparent;
        color: var(--text-muted);
        border-color: var(--border);
      }
      .bb-pdf-btn-send.active {
        background: rgba(34, 197, 94, 0.18);
        border-color: rgba(34, 197, 94, 0.6);
        color: var(--success);
      }
      .bb-pdf-btn-stop {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.4);
        color: var(--danger);
      }
      .bb-pdf-btn-stop:hover {
        background: rgba(239, 68, 68, 0.22);
        border-color: var(--danger);
        color: var(--danger);
      }

      /* ── Search bar ─────────────────────────────────────────── */
      .bb-pdf-search {
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
        display: flex; flex-direction: column;
        max-height: 40%;
      }
      .bb-pdf-search-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px var(--sp-4);
      }
      .bb-pdf-search-input {
        flex: 1;
        padding: 6px 8px;
        background: var(--bg-base);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        font-size: 12px;
        outline: none;
        font-family: inherit;
      }
      .bb-pdf-search-input:focus {
        border-color: var(--accent-blue);
        box-shadow: 0 0 0 2px var(--accent-blue-dim);
      }
      .bb-pdf-search-status {
        font-size: 11px;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .bb-pdf-search-results {
        overflow-y: auto;
        border-top: 1px solid var(--border-subtle);
      }
      .bb-pdf-search-none {
        padding: var(--sp-3) var(--sp-4);
        font-size: 12px;
        color: var(--text-muted);
      }
      .bb-pdf-search-hit {
        display: flex; gap: 10px;
        width: 100%;
        padding: 7px var(--sp-4);
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
      .bb-pdf-search-hit:hover { background: var(--bg-overlay); }
      .bb-pdf-search-hit.active {
        border-left-color: var(--accent-blue);
        background: var(--accent-blue-dim);
      }
      .bb-pdf-search-hit-page {
        flex-shrink: 0;
        min-width: 48px;
        font-size: 10px;
        font-weight: 700;
        color: var(--text-muted);
      }
      .bb-pdf-search-hit-snippet {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-secondary);
      }
      .bb-pdf-search-hit-snippet mark {
        background: rgba(255, 198, 46, 0.35);
        color: var(--accent);
        padding: 0 2px;
        border-radius: 2px;
      }

      /* ── Sent-to-player toast ───────────────────────────────── */
      .bb-pdf-canvas-wrap { position: relative; }
      .bb-pdf-sent-toast {
        position: absolute;
        top: 14px; left: 50%;
        transform: translateX(-50%);
        padding: 6px 14px;
        background: rgba(13, 16, 21, 0.92);
        border: 1px solid var(--success);
        border-radius: 999px;
        color: var(--success);
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        z-index: 10;
        animation: bb-pdf-toast-in 180ms ease-out;
        pointer-events: none;
      }
      @keyframes bb-pdf-toast-in {
        from { opacity: 0; transform: translate(-50%, -8px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
    `}</style>
  )
}
