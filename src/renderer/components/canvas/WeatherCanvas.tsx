import { useEffect, useRef } from 'react'
import type { WeatherType } from '@shared/ipc-types'

/**
 * Weather overlay canvas shared by the DM map view and the player window.
 * Renders particle animations for rain / snow / wind and a static radial
 * fog gradient. Pointer-inert; stacks above the map, below UI HUDs.
 *
 * Previous wind visuals rendered at 60 particles with ~0.4-alpha pale
 * strokes — on a bright map that read as nothing. Boosted to 150 particles
 * with a brighter, wider trail so the wind is actually legible.
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
}

interface Props {
  type: WeatherType
  width: number
  height: number
  /**
   * Absolute positioning anchor. Defaults to covering the whole parent.
   */
  className?: string
  style?: React.CSSProperties
}

export function WeatherCanvas({ type, width, height, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (type === 'none' || type === 'fog') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const count = type === 'wind' ? 150 : 140
    const particles: Particle[] = Array.from({ length: count }, () =>
      makeParticle(type, width, height, true),
    )

    let rafId: number
    const tick = () => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.y > height + 20 || p.x < -20 || p.x > width + 20) {
          Object.assign(p, makeParticle(type, width, height, false))
        }
        ctx.globalAlpha = p.alpha
        if (type === 'rain') {
          ctx.strokeStyle = 'rgba(140,180,255,0.8)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2)
          ctx.stroke()
        } else if (type === 'snow') {
          ctx.fillStyle = 'rgba(230,240,255,0.9)'
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        } else if (type === 'wind') {
          ctx.strokeStyle = 'rgba(220,235,255,0.9)'
          ctx.lineWidth = 1.2 + p.size * 0.6
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 12, p.y - p.vy * 12)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [type, width, height])

  if (type === 'none') return null

  if (type === 'fog') {
    return (
      <div
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 80%, rgba(180,200,240,0.22) 0%, rgba(180,200,240,0.08) 100%)',
          backdropFilter: 'blur(2px)',
          pointerEvents: 'none',
          zIndex: 10,
          ...style,
        }}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 10,
        ...style,
      }}
    />
  )
}

function makeParticle(type: WeatherType, width: number, height: number, randomY: boolean): Particle {
  if (type === 'rain') {
    return {
      x: Math.random() * (width + 100) - 50,
      y: randomY ? Math.random() * height : -10,
      vx: -2 - Math.random() * 2,
      vy: 14 + Math.random() * 8,
      size: 1,
      alpha: 0.5 + Math.random() * 0.5,
    }
  }
  if (type === 'snow') {
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : -10,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.8 + Math.random() * 1.2,
      size: 1 + Math.random() * 2.5,
      alpha: 0.6 + Math.random() * 0.4,
    }
  }
  // wind — brighter + faster than the old pass so the streaks actually
  // read on a bright map.
  return {
    x: -40,
    y: Math.random() * height,
    vx: 10 + Math.random() * 12,
    vy: (Math.random() - 0.5) * 1.8,
    size: 1.2 + Math.random() * 2.8,
    alpha: 0.55 + Math.random() * 0.4,
  }
}
