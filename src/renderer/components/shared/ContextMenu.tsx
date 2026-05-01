import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContextEnvelope, MenuItem } from '../../contextMenu/types'
import { resolveSections } from '../../contextMenu/registry'

interface ContextMenuProps {
  envelope: ContextEnvelope | null
  onClose: () => void
}

/**
 * Single rendering primitive for every right-click menu in the
 * renderer. Opens at `envelope.scenePos`, clamps inside the viewport,
 * supports keyboard nav (↑↓ Enter Esc), and renders one submenu level
 * via hover or → arrow. Replaces the four parallel render paths
 * inventoried in the Phase 8 proposal.
 *
 * Position clamping uses the same rAF retry pattern that fixed the
 * "menu invisible because portal not committed yet" bug — the layout
 * effect retries until the menu DOM is measurable.
 */
export function ContextMenu({ envelope, onClose }: ContextMenuProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [clamp, setClamp] = useState<{ x: number; y: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [openSubAt, setOpenSubAt] = useState<number | null>(null)

  const sections = useMemo(() => (envelope ? resolveSections(envelope) : []), [envelope])

  // Flatten sections into a navigable index → (sectionIdx, itemIdx)
  // map so arrow keys can step through every visible row regardless of
  // section boundaries. Separator headers are not selectable.
  const navIndex = useMemo(() => {
    const out: Array<{ section: number; item: number }> = []
    // customRender sections own their own focus, so we skip their
    // items for arrow-key + type-to-search nav.
    sections.forEach((s, si) => {
      if (s.customRender) return
      s.items?.forEach((_, ii) => out.push({ section: si, item: ii }))
    })
    return out
  }, [sections])

  // Reset highlight + clamp on every open. The layout effect below
  // re-measures and snaps the menu inside the viewport.
  useLayoutEffect(() => {
    setActiveIndex(-1)
    setOpenSubAt(null)
    setClamp(null)
  }, [envelope?.scenePos.x, envelope?.scenePos.y, envelope?.primary])

  useLayoutEffect(() => {
    if (!envelope) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const el = rootRef.current
      if (!el) {
        requestAnimationFrame(measure)
        return
      }
      const rect = el.getBoundingClientRect()
      const PAD = 8
      const vw = window.innerWidth
      const vh = window.innerHeight
      let x = envelope.scenePos.x
      let y = envelope.scenePos.y
      if (x + rect.width > vw - PAD) x = Math.max(PAD, vw - rect.width - PAD)
      if (y + rect.height > vh - PAD) y = Math.max(PAD, vh - rect.height - PAD)
      setClamp({ x, y })
    }
    measure()
    return () => { cancelled = true }
  }, [envelope])

  // ESC + click-outside dismissal. Capture-phase mousedown so the
  // listener fires before any Konva event handler claims the click.
  // Type-to-search: any printable key adds to a 1-second buffer; the
  // first item whose label starts with the buffer becomes the active
  // index. Mirrors the OS native menu's behaviour (Files / Finder /
  // Win32 menus all support this).
  const typeBufferRef = useRef<{ str: string; timer: ReturnType<typeof setTimeout> | null }>({ str: '', timer: null })
  useEffect(() => {
    if (!envelope) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(navIndex.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight' && activeIndex >= 0) {
        const ref = navIndex[activeIndex]
        const item = sections[ref.section].items?.[ref.item]
        if (item?.submenu?.length) {
          e.preventDefault()
          setOpenSubAt(activeIndex)
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setOpenSubAt(null)
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault()
        const ref = navIndex[activeIndex]
        const item = sections[ref.section].items?.[ref.item]
        if (item?.submenu?.length) setOpenSubAt(activeIndex)
        else if (item) runItem(item)
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Type-to-search.
        const buf = typeBufferRef.current
        buf.str = (buf.str + e.key).toLowerCase()
        if (buf.timer) clearTimeout(buf.timer)
        buf.timer = setTimeout(() => { buf.str = '' }, 1000)
        const idx = navIndex.findIndex((ref) => {
          const item = sections[ref.section].items?.[ref.item]
          return item ? t(item.labelKey).toLowerCase().startsWith(buf.str) : false
        })
        if (idx >= 0) setActiveIndex(idx)
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) onClose()
    }
    // Phase 11 m-32: close on resize / blur so the menu doesn't hover
    // at stale screen coordinates after the window changes shape or
    // loses focus (e.g. user alt-tabs to another app).
    const onResize = () => onClose()
    const onBlur = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown, { capture: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown, { capture: true })
      window.removeEventListener('resize', onResize)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelope, activeIndex, navIndex, sections, onClose])

  const runItem = useCallback(
    async (item: MenuItem) => {
      if (!envelope) return
      if (item.enabled && !item.enabled(envelope)) return
      if (item.submenu && item.submenu.length > 0) return // hover/click handled inline
      try {
        await item.run?.(envelope)
      } catch (err) {
        console.error('[ContextMenu] item run failed:', item.id, err)
      } finally {
        onClose()
      }
    },
    [envelope, onClose],
  )

  if (!envelope || sections.length === 0) return null

  // visibility:hidden until the clamp lands so we don't flash an
  // off-viewport menu for one frame on overflowing positions.
  const visible = clamp != null
  const left = clamp?.x ?? envelope.scenePos.x
  const top = clamp?.y ?? envelope.scenePos.y

  let runningIndex = -1
  return (
    <div
      ref={rootRef}
      role="menu"
      data-context-menu
      style={{
        position: 'fixed',
        left,
        top,
        visibility: visible ? 'visible' : 'hidden',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '4px 0',
        minWidth: 220,
        maxWidth: 360,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        zIndex: 9999,
        pointerEvents: 'all',
      }}
    >
      {sections.map((section, si) => {
        const showSeparator = si > 0
        return (
          <div key={section.id}>
            {showSeparator && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />}
            {section.headerKey && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  padding: '4px 12px 2px',
                }}
              >
                {t(section.headerKey, section.headerValues)}
              </div>
            )}
            {section.customRender && section.customRender(envelope)}
            {section.items?.map((item) => {
              runningIndex += 1
              const idx = runningIndex
              const enabled = !item.enabled || item.enabled(envelope)
              const active = idx === activeIndex
              return (
                <ContextMenuRow
                  key={item.id}
                  item={item}
                  envelope={envelope}
                  active={active}
                  enabled={enabled}
                  onActivate={() => setActiveIndex(idx)}
                  onRun={() => runItem(item)}
                  onOpenSub={(open) => setOpenSubAt(open ? idx : (cur) => (cur === idx ? null : cur))}
                  subOpen={openSubAt === idx}
                  t={t}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

interface RowProps {
  item: MenuItem
  envelope: ContextEnvelope
  active: boolean
  enabled: boolean
  onActivate: () => void
  onRun: () => void
  onOpenSub: (open: boolean) => void
  subOpen: boolean
  t: (key: string, opts?: Record<string, unknown>) => string
}

function ContextMenuRow({ item, envelope, active, enabled, onActivate, onRun, onOpenSub, subOpen, t }: RowProps) {
  const hasSub = !!item.submenu && item.submenu.length > 0
  const danger = item.danger
  // Phase 11 m-33: hover-intent delay (~250 ms) before opening the
  // submenu. Without this, mousing diagonally across the menu can
  // flash the wrong submenu open mid-traverse. Foundry uses ~400 ms;
  // 250 ms keeps the experience snappy while filtering out incidental
  // hovers. Mouse-leave cancels the pending open immediately.
  const HOVER_OPEN_MS = 250
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearOpenTimer = () => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null }
  }
  useEffect(() => () => clearOpenTimer(), [])
  return (
    <div
      role="menuitem"
      aria-disabled={!enabled}
      onMouseEnter={() => {
        onActivate()
        if (hasSub) {
          clearOpenTimer()
          openTimerRef.current = setTimeout(() => onOpenSub(true), HOVER_OPEN_MS)
        }
      }}
      onMouseLeave={() => {
        clearOpenTimer()
        if (hasSub) onOpenSub(false)
      }}
      onClick={() => { if (enabled) onRun() }}
      style={{
        position: 'relative',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.4,
        background: active ? 'var(--bg-overlay)' : 'transparent',
        color: danger ? '#ef4444' : 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
      }}
    >
      {item.icon && <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {t(item.labelKey)}
      </span>
      {item.shortcut && (
        <kbd style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {item.shortcut}
        </kbd>
      )}
      {hasSub && <span style={{ color: 'var(--text-muted)' }}>▶</span>}
      {hasSub && subOpen && (
        <ContextMenuSub items={item.submenu!} envelope={envelope} t={t} onRun={onRun} />
      )}
    </div>
  )
}

function ContextMenuSub({
  items, envelope, t, onRun,
}: { items: MenuItem[]; envelope: ContextEnvelope; t: RowProps['t']; onRun: () => void }) {
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        left: '100%',
        top: 0,
        marginLeft: 2,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '4px 0',
        minWidth: 180,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        zIndex: 10000,
      }}
    >
      {items.map((it) => {
        const enabled = !it.enabled || it.enabled(envelope)
        return (
          <div
            key={it.id}
            role="menuitem"
            aria-disabled={!enabled}
            onClick={async (e) => {
              e.stopPropagation()
              if (!enabled) return
              try { await it.run?.(envelope) } finally { onRun() }
            }}
            style={{
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: enabled ? 'pointer' : 'default',
              opacity: enabled ? 1 : 0.4,
              color: it.danger ? '#ef4444' : 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {it.icon && <span style={{ width: 16, textAlign: 'center' }}>{it.icon}</span>}
            <span style={{ flex: 1 }}>{t(it.labelKey)}</span>
          </div>
        )
      })}
    </div>
  )
}
