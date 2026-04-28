import { useState, useEffect } from 'react'

const MAX_CACHE_SIZE = 200

// Map preserves insertion order; on access we delete+re-insert to move to end (most recent)
const cache = new Map<string, HTMLImageElement>()

/**
 * Free the decoded pixel buffer held by an HTMLImageElement and revoke
 * any blob: URL still attached to it. Browsers don't always release the
 * decoded bitmap immediately when the only reference disappears — clearing
 * `src` and removing the attribute hints the renderer that the buffer can
 * go (BB-007).
 */
function disposeImage(img: HTMLImageElement): void {
  try {
    const url = img.src
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
    img.onload = null
    img.onerror = null
    img.src = ''
    img.removeAttribute('src')
  } catch {
    // Ignore — disposal is best-effort.
  }
}

function touchCache(key: string, img: HTMLImageElement) {
  cache.delete(key)
  cache.set(key, img)
  // Evict oldest entries (first in map) when over limit
  while (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    const evicted = cache.get(oldestKey)
    cache.delete(oldestKey)
    if (evicted) disposeImage(evicted)
  }
}

export function invalidateImageCache(src: string | null) {
  if (!src) return
  const img = cache.get(src)
  cache.delete(src)
  if (img) disposeImage(img)
}

export function useImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(() => {
    if (!src) return null
    const cached = cache.get(src)
    if (cached) touchCache(src, cached) // promote on initial access
    return cached ?? null
  })

  useEffect(() => {
    if (!src) {
      setImg(null)
      return
    }

    const cached = cache.get(src)
    if (cached) {
      touchCache(src, cached) // promote on access
      setImg(cached)
      return
    }

    let cancelled = false

    // Inline helper: decode a data URL or fetch any dataUrl-returning loader
    // and paint the result into the cache / state. Kept local so all three
    // loading branches (data:, bestiary://, relative path) share one code
    // path for error + cache handling. Retries once on error (500 ms) —
    // the decode can fail transiently under heavy load, and leaving the
    // user with a broken image until reload is poor UX (audit #80).
    const setFromData = (dataUrl: string | null, attempt = 0) => {
      if (cancelled) return
      if (!dataUrl) { setImg(null); return }
      const image = new Image()
      image.onload = () => {
        if (cancelled) return
        touchCache(src, image)
        setImg(image)
      }
      image.onerror = () => {
        if (cancelled) return
        if (attempt === 0) {
          setTimeout(() => { if (!cancelled) setFromData(dataUrl, 1) }, 500)
        } else {
          setImg(null)
        }
      }
      image.src = dataUrl
    }

    // Peel a leading `file://` so callers that unconditionally prefix it
    // (TokenLayer, PlayerApp, TokenPanel) still reach the right scheme
    // handler below. The full src stays the cache key so invalidation
    // with the prefixed form keeps working.
    const effective = src.startsWith('file://') ? src.substring(7) : src

    if (effective.startsWith('data:')) {
      setFromData(effective)
    } else if (effective.startsWith('bestiary://')) {
      // Shipped dataset token — resolve on demand so the DB / sync
      // payload can keep the compact reference instead of a 50 KB data URL.
      const m = effective.match(/^bestiary:\/\/([^/]+)\/(.+)$/)
      if (!m) { setImg(null); return }
      const slug = m[1]
      const file = m[2]
      const loader = window.electronAPI?.getMonsterTokenUrl ?? window.playerAPI?.getMonsterTokenUrl
      loader?.(slug, file)
        .then((data) => setFromData(data))
        .catch(() => { if (!cancelled) setImg(null) })
    } else {
      // Treat as a userData-relative path and route through the main-process
      // asset reader. Player window has no window.electronAPI — fall back.
      const loader = window.electronAPI?.getImageAsBase64 ?? window.playerAPI?.getImageAsBase64
      loader?.(effective)
        .then((data) => setFromData(data))
        .catch(() => { if (!cancelled) setImg(null) })
    }

    return () => {
      cancelled = true
    }
  }, [src])

  return img
}
