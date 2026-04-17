import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CompendiumFile } from '@shared/ipc-types'

/* PDF viewer for the Compendium. Loads a single PDF via the
   compendium:read IPC channel as base64 bytes, then renders one page at
   a time to a canvas using pdfjs-dist (lazy-loaded). The document object
   is cached in component state so only the active page re-renders on
   navigation / zoom changes. */

type Loaded = {
  doc: unknown
  numPages: number
}

interface PdfViewerProps {
  file: CompendiumFile
}

export function CompendiumPdfViewer({ file }: PdfViewerProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [zoom, setZoom] = useState(1.0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setLoaded({ doc, numPages: doc.numPages })
        setLoading(false)
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

  // Keyboard navigation: arrows for prev/next, Ctrl+=/+-/0 for zoom.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!loaded) return
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
  }, [loaded])

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
        onPrev={() => setPageNum((p) => Math.max(1, p - 1))}
        onNext={() => setPageNum((p) => Math.min(loaded.numPages, p + 1))}
        onGoto={(n) => setPageNum(Math.max(1, Math.min(loaded.numPages, n)))}
        onZoomIn={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
        onZoomReset={() => setZoom(1.0)}
      />

      <div className="bb-pdf-canvas-wrap">
        <canvas ref={canvasRef} className="bb-pdf-canvas" />
      </div>

      <PdfViewerStyles />
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────

function PdfToolbar({
  pageNum,
  numPages,
  zoom,
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
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

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

      .bb-pdf-canvas-wrap {
        flex: 1; min-height: 0;
        overflow: auto;
        padding: var(--sp-5);
        display: flex; justify-content: center; align-items: flex-start;
        background: var(--bg-base);
      }
      .bb-pdf-canvas {
        background: #fff;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        display: block;
      }

      .bb-pdf-loading {
        display: flex; align-items: center; justify-content: center;
        height: 100%;
        color: var(--text-muted);
        font-size: 13px;
      }
    `}</style>
  )
}
