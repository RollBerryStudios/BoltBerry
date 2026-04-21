import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'

/**
 * Interactive circular image cropper. Pan + zoom a source image inside
 * a circular mask, then export a square PNG of the crop (transparent
 * pixels outside the circle). Used for character portraits and the
 * Monster → NPC wizard's custom-image upload path.
 *
 * The component is presentational — callers pass the source (file path
 * or data URL) and receive the cropped data URL via `onCropComplete`
 * when the user clicks "Übernehmen". Keeps FS writes / IPC in the
 * caller so this stays reusable across the Wiki and CharacterSheet.
 */
export interface CircularCropperProps {
  src: string
  /** Output PNG dimensions. Defaults to 256 × 256 — Retina-ready for
   *  the small portrait thumbnails we render (64–96 px on-screen). */
  outputSize?: number
  onComplete: (dataUrl: string) => void
  onCancel: () => void
}

export function CircularCropper({
  src, outputSize = 256, onComplete, onCancel,
}: CircularCropperProps) {
  const { t } = useTranslation()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)

  const onCropAreaComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels)
  }, [])

  async function handleConfirm() {
    if (!croppedArea) return
    const dataUrl = await renderCircularCrop(src, croppedArea, outputSize)
    onComplete(dataUrl)
  }

  return (
    <div className="circ-cropper-modal" role="dialog" aria-modal="true">
      <div className="circ-cropper-card">
        <div className="circ-cropper-title">{t('cropper.title')}</div>
        <div className="circ-cropper-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropAreaComplete}
            // Sane zoom bounds — below 1× just pulls the image away
            // from the circle, which is rarely what anyone wants.
            minZoom={1}
            maxZoom={4}
            zoomSpeed={0.3}
          />
        </div>
        <div className="circ-cropper-controls">
          <label className="circ-cropper-zoom-label">{t('cropper.zoom')}</label>
          <input
            className="circ-cropper-zoom"
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
        </div>
        <div className="circ-cropper-actions">
          <button type="button" className="circ-cropper-btn" onClick={onCancel}>
            {t('cropper.cancel')}
          </button>
          <button
            type="button"
            className="circ-cropper-btn circ-cropper-btn-primary"
            onClick={handleConfirm}
            disabled={!croppedArea}
          >
            {t('cropper.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Draws the cropped region of `src` into an `outputSize × outputSize`
 * canvas, masks it to a circle, and returns the PNG data URL. Uses
 * `crossOrigin='anonymous'` so images served via the `bestiary://` or
 * `file://` protocols load without painting the canvas (Electron's
 * file protocol counts as same-origin, but the flag is a no-op there).
 */
async function renderCircularCrop(src: string, area: Area, outputSize: number): Promise<string> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')!

  ctx.save()
  ctx.beginPath()
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()

  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, outputSize, outputSize,
  )
  ctx.restore()

  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}
