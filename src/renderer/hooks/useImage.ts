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

    // data: URLs load directly; everything else goes through main process
    // (file:// URLs are unreliable in Electron due to security restrictions,
    // and relative paths like "assets/map/foo.png" need resolving anyway)
    if (!src.startsWith('data:')) {
      // Strip file:// prefix if present, then load relative path through main process
      const relativePath = src.startsWith('file://') ? src.substring(7) : src
      window.electronAPI?.getImageAsBase64(relativePath).then((imageData) => {
        if (cancelled) return
        if (!imageData) {
          setImg(null)
          return
        }
        const image = new Image()
        image.onload = () => {
          if (cancelled) return
          touchCache(src, image)
          setImg(image)
        }
        image.onerror = () => {
          if (!cancelled) setImg(null)
        }
        image.src = imageData
      }).catch(() => {
        if (!cancelled) setImg(null)
      })
    } else {
      const image = new Image()
      image.onload = () => {
        if (cancelled) return
        touchCache(src, image)
        setImg(image)
      }
      image.onerror = () => {
        if (!cancelled) setImg(null)
      }
      image.src = src
    }

    return () => {
      cancelled = true
    }
  }, [src])

  return img
}
