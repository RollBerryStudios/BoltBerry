import { useState, useEffect } from 'react'

const cache = new Map<string, HTMLImageElement>()

export function invalidateImageCache(src: string | null) {
  if (src) cache.delete(src)
}

export function useImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(
    src ? (cache.get(src) ?? null) : null
  )

  useEffect(() => {
    if (!src) {
      setImg(null)
      return
    }

    if (cache.has(src)) {
      setImg(cache.get(src)!)
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
          cache.set(src, image)
          setImg(image)
        }
        image.onerror = () => {
          if (cancelled) setImg(null)
        }
        image.src = imageData
      }).catch(() => {
        if (!cancelled) setImg(null)
      })
    } else {
      const image = new Image()
      image.onload = () => {
        if (cancelled) return
        cache.set(src, image)
        setImg(image)
      }
      image.onerror = () => {
        if (cancelled) setImg(null)
      }
      image.src = src
    }

    return () => {
      cancelled = true
    }
  }, [src])

  return img
}