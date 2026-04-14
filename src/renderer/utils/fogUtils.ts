// Pure canvas utility — no React, Konva, or store dependencies.
// Kept separate so PlayerApp.tsx doesn't pull the entire FogLayer chunk into
// the player bundle (which caused a TDZ crash in the minified production build).

export type FogShape = 'rect' | 'polygon' | 'circle'
export type FogOperation = { type: 'reveal' | 'cover'; shape: FogShape; points: number[] }

export function applyOpToCtxPair(
  exploredCtx: CanvasRenderingContext2D,
  coveredCtx: CanvasRenderingContext2D,
  op: FogOperation,
) {
  if (op.type === 'reveal') {
    exploredCtx.globalCompositeOperation = 'destination-out'
    exploredCtx.fillStyle = '#fff'
    applyShape(exploredCtx, op)
    exploredCtx.globalCompositeOperation = 'source-over'

    coveredCtx.globalCompositeOperation = 'destination-out'
    coveredCtx.fillStyle = '#fff'
    applyShape(coveredCtx, op)
    coveredCtx.globalCompositeOperation = 'source-over'
  } else {
    coveredCtx.globalCompositeOperation = 'source-over'
    coveredCtx.fillStyle = 'rgba(0,0,0,0.45)'
    applyShape(coveredCtx, op)
  }
}

function applyShape(ctx: CanvasRenderingContext2D, op: FogOperation) {
  if (op.shape === 'rect' && op.points.length === 4) {
    const [x1, y1, x2, y2] = op.points
    ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
  } else if (op.shape === 'circle' && op.points.length === 3) {
    const [cx, cy, r] = op.points
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  } else if (op.shape === 'polygon' && op.points.length >= 6) {
    ctx.beginPath()
    for (let i = 0; i < op.points.length; i += 2) {
      if (i === 0) ctx.moveTo(op.points[i], op.points[i + 1])
      else         ctx.lineTo(op.points[i], op.points[i + 1])
    }
    ctx.closePath()
    ctx.fill()
  }
}
