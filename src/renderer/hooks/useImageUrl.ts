import { useState, useEffect } from 'react'

// Sentinel stored in cache when a path was fetched but returned null (missing file).
// Prevents repeated IPC calls for the same broken path.
const MISSING = '__missing__'
const cache = new Map<string, string>()

export function invalidateImageUrlCache(src: string | null) {
  if (src) cache.delete(src)
}

export function useImageUrl(src: string | null): string | null {
  const [url, setUrl] = useState<string | null>(
    src ? (cache.get(src) ?? null) : null
  )

  useEffect(() => {
    if (!src) {
      setUrl(null)
      return
    }

    if (cache.has(src)) {
      const cached = cache.get(src)!
      setUrl(cached === MISSING ? null : cached)
      return
    }

    // data: URLs are already usable directly
    if (src.startsWith('data:')) {
      setUrl(src)
      return
    }

    // Strip file:// prefix and load through main process
    const relativePath = src.startsWith('file://') ? src.substring(7) : src
    let cancelled = false
    window.electronAPI?.getImageAsBase64(relativePath).then((imageData) => {
      if (cancelled) return
      if (imageData) {
        cache.set(src, imageData)
        setUrl(imageData)
      } else {
        cache.set(src, MISSING)
        setUrl(null)
      }
    }).catch(() => {
      if (!cancelled) {
        cache.set(src, MISSING)
        setUrl(null)
      }
    })
    return () => { cancelled = true }
  }, [src])

  return url
}