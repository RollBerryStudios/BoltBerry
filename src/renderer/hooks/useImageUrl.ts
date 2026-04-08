import { useState, useEffect } from 'react'

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
      setUrl(cache.get(src)!)
      return
    }

    // data: URLs are already usable directly
    if (src.startsWith('data:')) {
      setUrl(src)
      return
    }

    // Strip file:// prefix and load through main process
    const relativePath = src.startsWith('file://') ? src.substring(7) : src
    window.electronAPI?.getImageAsBase64(relativePath).then((imageData) => {
      if (imageData) {
        cache.set(src, imageData)
        setUrl(imageData)
      } else {
        setUrl(null)
      }
    }).catch(() => setUrl(null))
  }, [src])

  return url
}