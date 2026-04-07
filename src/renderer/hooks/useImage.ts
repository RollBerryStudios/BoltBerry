import { useState, useEffect } from 'react'

const cache = new Map<string, HTMLImageElement>()

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

    const image = new Image()
    image.crossOrigin = "anonymous" // Handle potential CORS issues
    image.onload = () => {
      cache.set(src, image)
      setImg(image)
    }
    image.onerror = (err) => {
      console.error('[useImage] Failed to load image:', src, err)
      // Try loading through main process as fallback
      loadImageThroughMainProcess(src)
    }
    image.src = src
  }, [src])

  // Fallback method to load images through main process
  async function loadImageThroughMainProcess(src: string) {
    if (window.electronAPI) {
      try {
        const imageData = await window.electronAPI.getImageAsBase64(src)
        if (imageData) {
          const img = new Image()
          img.onload = () => {
            cache.set(src, img)
            setImg(img)
          }
          img.src = imageData
        }
      } catch (err) {
        console.error('[useImage] Failed to load through main process:', err)
        setImg(null)
      }
    }
  }

  return img
}