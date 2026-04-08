import { useRef, useEffect, RefObject, useState } from 'react'
import Konva from 'konva'
import { useMapTransformStore } from '../../stores/mapTransformStore'
import { useCampaignStore } from '../../stores/campaignStore'

interface MinimapOverlayProps {
  stageRef: RefObject<Konva.Stage | null>
  canvasSize: { width: number; height: number }
}

const MINIMAP_W = 180
const MINIMAP_H = 120

export function MinimapOverlay({ stageRef, canvasSize }: MinimapOverlayProps) {
  const { scale, offsetX, offsetY, imgW, imgH, fitScale } = useMapTransformStore()
  const { activeMapId, activeMaps } = useCampaignStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapThumbnail, setMapThumbnail] = useState<HTMLImageElement | null>(null)

  const activeMap = activeMaps.find((m) => m.id === activeMapId) ?? null

  useEffect(() => {
    if (!activeMap?.imagePath) { setMapThumbnail(null); return }
    const img = new Image()
    img.onload = () => setMapThumbnail(img)
    img.onerror = () => setMapThumbnail(null)
    if (activeMap.imagePath.startsWith('data:')) {
      img.src = activeMap.imagePath
    } else {
      window.electronAPI?.getImageAsBase64(activeMap.imagePath).then((base64) => {
        if (base64) img.src = base64
        else setMapThumbnail(null)
      }).catch(() => setMapThumbnail(null))
    }
  }, [activeMap?.imagePath])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || imgW === 0 || imgH === 0) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)

    const mmFitScale = Math.min(MINIMAP_W / imgW, MINIMAP_H / imgH)
    const drawW = imgW * mmFitScale
    const drawH = imgH * mmFitScale
    const drawX = (MINIMAP_W - drawW) / 2
    const drawY = (MINIMAP_H - drawH) / 2

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H)

    if (mapThumbnail) {
      ctx.drawImage(mapThumbnail, drawX, drawY, drawW, drawH)
    }

    const vpLeft = (-offsetX / scale) * mmFitScale + drawX
    const vpTop = (-offsetY / scale) * mmFitScale + drawY
    const vpW = (canvasSize.width / scale) * mmFitScale
    const vpH = (canvasSize.height / scale) * mmFitScale

    ctx.fillStyle = 'rgba(47,107,255,0.15)'
    ctx.fillRect(vpLeft, vpTop, vpW, vpH)
    ctx.strokeStyle = 'rgba(47,107,255,0.6)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(vpLeft, vpTop, vpW, vpH)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.strokeRect(drawX, drawY, drawW, drawH)
  }, [scale, offsetX, offsetY, imgW, imgH, canvasSize.width, canvasSize.height, mapThumbnail])

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const mmFitScale = Math.min(MINIMAP_W / imgW, MINIMAP_H / imgH)
    const drawW = imgW * mmFitScale
    const drawH = imgH * mmFitScale
    const drawX = (MINIMAP_W - drawW) / 2
    const drawY = (MINIMAP_H - drawH) / 2

    const mapX = (x - drawX) / mmFitScale
    const mapY = (y - drawY) / mmFitScale

    useMapTransformStore.getState().setTransform({
      offsetX: canvasSize.width / 2 - mapX * scale,
      offsetY: canvasSize.height / 2 - mapY * scale,
    })
  }

  return (
    <canvas
      ref={canvasRef}
      width={MINIMAP_W}
      height={MINIMAP_H}
      onClick={handleClick}
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.7)',
        cursor: 'pointer',
        zIndex: 50,
      }}
    />
  )
}