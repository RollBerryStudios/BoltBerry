export interface GridDetectResult {
  gridSize: number
  gridType: 'square' | 'hex' | 'none'
  confidence: number
}

const MAX_SIZE = 512

function fft(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI * (invert ? -1 : 1)) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < (len >> 1); k++) {
        const uRe = re[i + k]
        const uIm = im[i + k]
        const vRe = re[i + k + (len >> 1)] * curRe - im[i + k + (len >> 1)] * curIm
        const vIm = re[i + k + (len >> 1)] * curIm + im[i + k + (len >> 1)] * curRe
        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + (len >> 1)] = uRe - vRe
        im[i + k + (len >> 1)] = uIm - vIm
        const newCurRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = newCurRe
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
  }
}

function autocorrelation(signal: Float64Array): Float64Array {
  const n = signal.length
  let p = 1
  while (p < 2 * n) p <<= 1
  const re = new Float64Array(p)
  const im = new Float64Array(p)
  for (let i = 0; i < n; i++) re[i] = signal[i]
  fft(re, im, false)
  for (let i = 0; i < p; i++) {
    const r = re[i]
    const c = im[i]
    re[i] = (r * r + c * c) / (n * n)
    im[i] = 0
  }
  fft(re, im, true)
  const result = new Float64Array(n)
  for (let i = 0; i < n; i++) result[i] = re[i]
  return result
}

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Float64Array {
  const gray = new Float64Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return gray
}

function sobelEdge(
  gray: Float64Array,
  width: number,
  height: number,
): { mag: Float64Array; dir: Float64Array } {
  const mag = new Float64Array(width * height)
  const dir = new Float64Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const tl = gray[(y - 1) * width + (x - 1)]
      const tc = gray[(y - 1) * width + x]
      const tr = gray[(y - 1) * width + (x + 1)]
      const ml = gray[y * width + (x - 1)]
      const mr = gray[y * width + (x + 1)]
      const bl = gray[(y + 1) * width + (x - 1)]
      const bc = gray[(y + 1) * width + x]
      const br = gray[(y + 1) * width + (x + 1)]
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      mag[idx] = Math.sqrt(gx * gx + gy * gy)
      dir[idx] = Math.atan2(gy, gx)
    }
  }
  return { mag, dir }
}

function detectHexGrid(dir: Float64Array, mag: Float64Array, width: number, height: number): boolean {
  const bins = 60
  const histogram = new Float64Array(bins)
  const piOverBins = Math.PI / bins
  const threshold = 20
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (mag[idx] < threshold) continue
      const angle = ((dir[idx] % Math.PI) + Math.PI) % Math.PI
      const bin = Math.floor(angle / piOverBins) % bins
      histogram[bin] += mag[idx]
    }
  }
  let maxVal = 0
  for (let i = 0; i < bins; i++) if (histogram[i] > maxVal) maxVal = histogram[i]
  if (maxVal === 0) return false
  for (let i = 0; i < bins; i++) histogram[i] /= maxVal
  const angles60 = [0, Math.PI / 3, (2 * Math.PI) / 3]
  let score = 0
  let totalPeaks = 0
  for (const angle of angles60) {
    const bin = Math.floor(angle / piOverBins) % bins
    for (let d = -1; d <= 1; d++) {
      const b = (bin + d + bins) % bins
      if (histogram[b] > 0.5) {
        score += histogram[b]
        totalPeaks++
      }
    }
  }
  if (totalPeaks === 0) return false
  score /= totalPeaks
  return score > 0.6
}

// Resolve a stored-relative asset path (e.g. "assets/map/foo.png") into
// something an <img> element can actually load. Data URLs / http(s) URLs are
// passed through; everything else goes through the main-process image reader
// so it comes back as a base64 data URL. Without this conversion the <img>
// silently fails to load and the detector always returns confidence: 0.
async function resolveImageSrc(path: string): Promise<string> {
  if (path.startsWith('data:') || path.startsWith('http:') || path.startsWith('https:') || path.startsWith('blob:')) {
    return path
  }
  const cleaned = path.startsWith('file://') ? path.substring(7) : path
  const data = await window.electronAPI?.getImageAsBase64(cleaned)
  if (!data) throw new Error(`Cannot resolve image path: ${path}`)
  return data
}

/**
 * Find up to `maxPeaks` local maxima in `signal[minLag..maxLag]`,
 * sorted by descending value. A "peak" is any index strictly greater
 * than its immediate neighbours AND separated from previously-found
 * peaks by at least `separation` samples so we don't pick out the
 * same hump twice.
 */
export function findTopPeaks(
  signal: Float64Array,
  minLag: number,
  maxLag: number,
  maxPeaks: number,
  separation: number,
): Array<{ lag: number; value: number }> {
  const peaks: Array<{ lag: number; value: number }> = []
  // BB-033: clamp the search window into the array's valid neighbour-access
  // range. Without this, a `signal` shorter than minLag+2 silently fell
  // through to an empty result; for very small signals we now exit cleanly
  // and never index out of bounds when reading signal[x-1] / signal[x+1].
  const start = Math.max(1, minLag + 1)
  const end = Math.min(maxLag, signal.length - 1)
  if (start >= end) return peaks
  for (let x = start; x < end; x++) {
    const v = signal[x]
    if (v > signal[x - 1] && v > signal[x + 1] && v > 0) {
      peaks.push({ lag: x, value: v })
    }
  }
  peaks.sort((a, b) => b.value - a.value)
  const picked: Array<{ lag: number; value: number }> = []
  for (const p of peaks) {
    if (picked.every((q) => Math.abs(q.lag - p.lag) >= separation)) {
      picked.push(p)
      if (picked.length >= maxPeaks) break
    }
  }
  return picked
}

/**
 * Score a candidate lag by how well its harmonics (2×, 3×) also show
 * up in the autocorrelation. A genuine grid repeats at every multiple
 * of its cell size, so real peaks come with friends; spurious ones
 * don't. Returns a bonus in [0, 1].
 */
export function harmonicBonus(signal: Float64Array, lag: number, baseValue: number): number {
  if (baseValue <= 0) return 0
  if (lag <= 0 || !Number.isFinite(lag)) return 0
  let sum = 0
  let counted = 0
  for (const k of [2, 3]) {
    const idx = lag * k
    if (idx >= signal.length - 1) break
    // Sample a small ±2 window so we don't miss the harmonic if it
    // drifts by a pixel due to rounding. BB-033: clamp the window into
    // [0, signal.length) so we never read past either end on signals
    // sized close to the harmonic boundary.
    let peak = 0
    const lo = Math.max(0, idx - 2)
    const hi = Math.min(signal.length - 1, idx + 2)
    for (let i = lo; i <= hi; i++) {
      const v = signal[i]
      if (v > peak) peak = v
    }
    sum += Math.min(1, peak / baseValue)
    counted++
  }
  return counted > 0 ? sum / counted : 0
}

export function detectGrid(imagePath: string): Promise<GridDetectResult> {
  return new Promise((resolve, reject) => {
    resolveImageSrc(imagePath).then((src) => {
    const img = new Image()
    img.onload = () => {
      const origW = img.naturalWidth || img.width
      const origH = img.naturalHeight || img.height
      const downsample = Math.max(origW / MAX_SIZE, origH / MAX_SIZE, 1)
      const w = Math.round(origW / downsample)
      const h = Math.round(origH / downsample)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)

      const gray = toGrayscale(imageData.data, w, h)
      const { mag, dir } = sobelEdge(gray, w, h)

      // Adaptive edge threshold — use 20% of the image's peak magnitude
      // but not less than 8. Soft / anti-aliased grid lines on bright
      // maps used to disappear under the old fixed `> 10` cut-off.
      let maxMag = 0
      for (let i = 0; i < mag.length; i++) if (mag[i] > maxMag) maxMag = mag[i]
      const edgeThreshold = Math.max(8, maxMag * 0.2)

      // Row autocorrelation — horizontal periodicity.
      const rowAutocorr = new Float64Array(w)
      let rowsUsed = 0
      for (let y = 1; y < h - 1; y++) {
        const row = new Float64Array(w)
        let hasEdge = false
        for (let x = 0; x < w; x++) {
          const v = mag[y * w + x]
          row[x] = v
          if (v > edgeThreshold) hasEdge = true
        }
        if (!hasEdge) continue
        const ac = autocorrelation(row)
        for (let x = 0; x < w; x++) rowAutocorr[x] += ac[x]
        rowsUsed++
      }

      // Column autocorrelation — vertical periodicity. Averaging both
      // axes doubles the signal on true grids and dampens anisotropic
      // artefacts (e.g. long horizontal patterns from paper grain).
      const colAutocorr = new Float64Array(h)
      let colsUsed = 0
      for (let x = 1; x < w - 1; x++) {
        const col = new Float64Array(h)
        let hasEdge = false
        for (let y = 0; y < h; y++) {
          const v = mag[y * w + x]
          col[y] = v
          if (v > edgeThreshold) hasEdge = true
        }
        if (!hasEdge) continue
        const ac = autocorrelation(col)
        for (let y = 0; y < h; y++) colAutocorr[y] += ac[y]
        colsUsed++
      }

      if (rowsUsed === 0 && colsUsed === 0) {
        resolve({ gridSize: 0, gridType: 'none', confidence: 0 })
        return
      }
      if (rowsUsed > 0) for (let x = 0; x < w; x++) rowAutocorr[x] /= rowsUsed
      if (colsUsed > 0) for (let y = 0; y < h; y++) colAutocorr[y] /= colsUsed

      // Combined autocorrelation — length is the shorter of the two
      // axes; add values where both exist, else use whichever is
      // available.
      const combLen = Math.min(
        rowsUsed > 0 ? w : Infinity,
        colsUsed > 0 ? h : Infinity,
      )
      const combined = new Float64Array(combLen)
      for (let i = 0; i < combLen; i++) {
        const r = rowsUsed > 0 ? rowAutocorr[i] : 0
        const c = colsUsed > 0 ? colAutocorr[i] : 0
        combined[i] = (r + c) / ((rowsUsed > 0 ? 1 : 0) + (colsUsed > 0 ? 1 : 0))
      }

      const zeroLag = combined[0]
      if (zeroLag <= 0) {
        resolve({ gridSize: 0, gridType: 'none', confidence: 0 })
        return
      }

      // Top-3 candidate peaks, pick the best by base-strength × (1 + 0.5 ×
      // harmonic-bonus). A peak with strong harmonics at 2L/3L wins over
      // a slightly stronger one-off peak — that's the signature of a
      // real grid vs. a single repeating feature.
      const minLag = 6
      const maxLag = Math.floor(combLen / 2)
      const candidates = findTopPeaks(combined, minLag, maxLag, 5, Math.max(4, Math.floor(minLag / 2)))

      if (candidates.length === 0) {
        resolve({ gridSize: 0, gridType: 'none', confidence: 0 })
        return
      }

      let best = { lag: 0, value: 0, score: 0 }
      for (const c of candidates) {
        const harmonic = harmonicBonus(combined, c.lag, c.value)
        const score = (c.value / zeroLag) * (1 + 0.5 * harmonic)
        if (score > best.score) best = { lag: c.lag, value: c.value, score }
      }

      const isHex = detectHexGrid(dir, mag, w, h)
      // Base confidence = normalised peak height; the harmonic-weighted
      // score already factored in, so surface the stronger number so the
      // caller's threshold is meaningful.
      const confidence = Math.min(best.score, 1)
      const gridSize = Math.round(best.lag * downsample)

      if (confidence < 0.15 || best.lag === 0) {
        resolve({ gridSize: 0, gridType: 'none', confidence: 0 })
        return
      }

      resolve({
        gridSize,
        gridType: isHex ? 'hex' : 'square',
        confidence,
      })
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`))
    img.src = src
    }).catch(reject)
  })
}