import { useState, useEffect } from 'react'

const cache = new Map<string, HTMLImageElement>()

export function useImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(
    src ? (cache.get(src) ?? null) : null
  )

  useEffect(() => {
    if (!src) { setImg(null); return }
    if (cache.has(src)) { setImg(cache.get(src)!); return }

    const image = new Image()
    image.onload = () => {
      cache.set(src, image)
      setImg(image)
    }
    image.onerror = () => setImg(null)
    image.src = src
  }, [src])

  return img
}
