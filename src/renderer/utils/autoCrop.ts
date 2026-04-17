export interface CropResult {
  top: number
  right: number
  bottom: number
  left: number
  cropped: boolean
}

const DEFAULT_THRESHOLD = 10

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// Same image-resolution helper as gridDetect — stored relative paths
// ("assets/…") must be converted to a loadable data URL before the <img>
// element can read them, otherwise detection silently fails.
async function resolveImageSrc(path: string): Promise<string> {
  if (path.startsWith('data:') || path.startsWith('http:') || path.startsWith('https:') || path.startsWith('blob:')) {
    return path
  }
  const cleaned = path.startsWith('file://') ? path.substring(7) : path
  const data = await window.electronAPI?.getImageAsBase64(cleaned)
  if (!data) throw new Error(`Cannot resolve image path: ${path}`)
  return data
}

export function detectMargins(imagePath: string, threshold: number = DEFAULT_THRESHOLD): Promise<CropResult> {
  return new Promise((resolve, reject) => {
    resolveImageSrc(imagePath).then((src) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data

      const topAvg = luminance(data[0], data[1], data[2])
      const bottomIdx = ((h - 1) * w) * 4
      const bottomAvg = luminance(data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2])
      const leftIdx = 0
      const leftAvg = luminance(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2])
      const rightIdx = (w - 1) * 4
      const rightAvg = luminance(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2])

      const isWhite =
        topAvg > 200 || bottomAvg > 200 || leftAvg > 200 || rightAvg > 200
      const isBlack =
        topAvg < 55 || bottomAvg < 55 || leftAvg < 55 || rightAvg < 55

      let marginColorR: number, marginColorG: number, marginColorB: number
      if (isWhite && !isBlack) {
        marginColorR = 255
        marginColorG = 255
        marginColorB = 255
      } else if (isBlack && !isWhite) {
        marginColorR = 0
        marginColorG = 0
        marginColorB = 0
      } else {
        let sumR = 0
        let sumG = 0
        let sumB = 0
        const perimeter = 2 * (w + h)
        const step = Math.max(1, Math.floor(perimeter / 200))
        let count = 0
        for (let x = 0; x < w; x += step) {
          const off = x * 4
          sumR += data[off]
          sumG += data[off + 1]
          sumB += data[off + 2]
          const off2 = ((h - 1) * w + x) * 4
          sumR += data[off2]
          sumG += data[off2 + 1]
          sumB += data[off2 + 2]
          count += 2
        }
        for (let y = 0; y < h; y += step) {
          const off = y * w * 4
          sumR += data[off]
          sumG += data[off + 1]
          sumB += data[off + 2]
          const off2 = (y * w + w - 1) * 4
          sumR += data[off2]
          sumG += data[off2 + 1]
          sumB += data[off2 + 2]
          count += 2
        }
        marginColorR = sumR / count
        marginColorG = sumG / count
        marginColorB = sumB / count
      }

      const colorDist = (idx: number): number => {
        const dr = data[idx] - marginColorR
        const dg = data[idx + 1] - marginColorG
        const db = data[idx + 2] - marginColorB
        return Math.sqrt(dr * dr + dg * dg + db * db) / 1.732
      }

      let top = 0
      let bottom = h - 1
      let left = 0
      let right = w - 1

      rowScan: for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4
          if (colorDist(idx) > threshold) {
            top = y
            break rowScan
          }
        }
      }

      rowScanRev: for (let y = h - 1; y >= 0; y--) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4
          if (colorDist(idx) > threshold) {
            bottom = y
            break rowScanRev
          }
        }
      }

      colScan: for (let x = 0; x < w; x++) {
        for (let y = top; y <= bottom; y++) {
          const idx = (y * w + x) * 4
          if (colorDist(idx) > threshold) {
            left = x
            break colScan
          }
        }
      }

      colScanRev: for (let x = w - 1; x >= 0; x--) {
        for (let y = top; y <= bottom; y++) {
          const idx = (y * w + x) * 4
          if (colorDist(idx) > threshold) {
            right = x
            break colScanRev
          }
        }
      }

      const cropped = top > 0 || bottom < h - 1 || left > 0 || right < w - 1

      resolve({
        top,
        right: w - 1 - right,
        bottom: h - 1 - bottom,
        left,
        cropped,
      })
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`))
    img.src = src
    }).catch(reject)
  })
}