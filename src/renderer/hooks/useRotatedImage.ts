import { useState, useEffect } from 'react'
import { useImage } from './useImage'

export interface RotatedImageResult {
  img: HTMLImageElement | ImageBitmap | null
  imgW: number
  imgH: number
}

/**
 * Loads an image and optionally pre-rotates it in an OffscreenCanvas.
 * For rotation 0, returns the original HTMLImageElement unchanged.
 * For 90/180/270, returns an ImageBitmap with swapped dimensions baked in,
 * so all downstream coordinate math is automatically correct.
 */
export function useRotatedImage(src: string | null, rotation: number = 0): RotatedImageResult {
  const source = useImage(src)
  const [result, setResult] = useState<RotatedImageResult>({ img: null, imgW: 0, imgH: 0 })

  useEffect(() => {
    if (!source) {
      setResult((prev) => {
        if (prev.img instanceof ImageBitmap) prev.img.close()
        return { img: null, imgW: 0, imgH: 0 }
      })
      return
    }

    const norm = ((rotation % 360) + 360) % 360

    if (norm === 0) {
      setResult((prev) => {
        if (prev.img instanceof ImageBitmap) prev.img.close()
        return { img: source, imgW: source.naturalWidth, imgH: source.naturalHeight }
      })
      return
    }

    let cancelled = false
    const isSwapped = norm === 90 || norm === 270
    const offW = isSwapped ? source.naturalHeight : source.naturalWidth
    const offH = isSwapped ? source.naturalWidth : source.naturalHeight
    const canvas = new OffscreenCanvas(offW, offH)
    const ctx = canvas.getContext('2d')!
    ctx.translate(offW / 2, offH / 2)
    ctx.rotate((norm * Math.PI) / 180)
    ctx.drawImage(source, -source.naturalWidth / 2, -source.naturalHeight / 2)

    createImageBitmap(canvas).then((bmp) => {
      if (cancelled) {
        bmp.close()
        return
      }
      setResult((prev) => {
        if (prev.img instanceof ImageBitmap) prev.img.close()
        return { img: bmp, imgW: offW, imgH: offH }
      })
    })

    return () => { cancelled = true }
  }, [source, rotation])

  // BB-019: when the consumer (e.g. MapLayer) unmounts, free the rotated
  // ImageBitmap immediately rather than waiting for GC. The replacement
  // path inside the effect already closes the previous bitmap, but on
  // final unmount nothing else does.
  useEffect(() => {
    return () => {
      setResult((prev) => {
        if (prev.img instanceof ImageBitmap) prev.img.close()
        return { img: null, imgW: 0, imgH: 0 }
      })
    }
  }, [])

  return result
}
