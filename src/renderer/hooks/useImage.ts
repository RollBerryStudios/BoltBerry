import { useState, useEffect } from 'react'

const MAX_CACHE_SIZE = 200

// Map preserves insertion order; on access we delete+re-insert to move to end (most recent)
const cache = new Map<string, HTMLImageElement>()

function touchCache(key: string, img: HTMLImageElement) {
  cache.delete(key)
  cache.set(key, img)
  // Evict oldest entries (first in map) when over limit
  while (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
    else break
  }
}

export function invalidateImageCache(src: string | null) {
  if (src) cache.delete(src)
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
    // path for error + cache handling.
    const setFromData = (dataUrl: string | null) => {
      if (cancelled) return
      if (!dataUrl) { setImg(null); return }
      const image = new Image()
      image.onload = () => {
        if (cancelled) return
        touchCache(src, image)
        setImg(image)
      }
      image.onerror = () => { if (!cancelled) setImg(null) }
      image.src = dataUrl
    }

    if (src.startsWith('data:')) {
      setFromData(src)
    } else if (src.startsWith('bestiary://')) {
      // Shipped dataset token — resolve on demand so the DB / sync
      // payload can keep the compact reference instead of a 50 KB data URL.
      const m = src.match(/^bestiary:\/\/([^/]+)\/(.+)$/)
      if (!m) { setImg(null); return }
      const slug = m[1]
      const file = m[2]
      const loader = window.electronAPI?.getMonsterTokenUrl ?? window.playerAPI?.getMonsterTokenUrl
      loader?.(slug, file)
        .then((data) => setFromData(data))
        .catch(() => { if (!cancelled) setImg(null) })
    } else {
      // Strip file:// prefix if present, then load relative path through main process.
      // Player window has no window.electronAPI — fall back to window.playerAPI.
      const relativePath = src.startsWith('file://') ? src.substring(7) : src
      const loader = window.electronAPI?.getImageAsBase64 ?? window.playerAPI?.getImageAsBase64
      loader?.(relativePath)
        .then((data) => setFromData(data))
        .catch(() => { if (!cancelled) setImg(null) })
    }

    return () => {
      cancelled = true
    }
  }, [src])

  return img
}
