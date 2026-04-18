// ============================================================
//  KAN 環 — pure ASCII donut, a1k0n's torus rendered into a
//  9:16 monospace grid. No flowing text, no DOM. Characters
//  colored by luminance (bone -> amber -> white-hot ridge).
// ============================================================

const CSS_W = 540
const CSS_H = 960
const DPR = 2

// Monospace cell: we pick font size and derive cols/rows from canvas.
// Cascadia Code at 16px renders ~9.6px wide ASCII glyphs.
const FONT_PX = 16
const LINE_H = 18
const CHAR_W = 9.6
const FONT = `${FONT_PX}px "Cascadia Code","JetBrains Mono","SF Mono",Consolas,monospace`

const COLS = Math.floor(CSS_W / CHAR_W)   // ~56
const ROWS = Math.floor(CSS_H / LINE_H)   // ~53
const GRID_OX = (CSS_W - COLS * CHAR_W) / 2
const GRID_OY = (CSS_H - ROWS * LINE_H) / 2

// Luminance ramp — original a1k0n gradient
const LUM_CHARS = '.,-~:;=!*#$@'

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d', { alpha: false })!
ctx.scale(DPR, DPR)
ctx.textBaseline = 'top'
ctx.font = FONT

// Pre-allocated frame buffers — zero alloc in hot loop
const CELLS = COLS * ROWS
const zbuf = new Float32Array(CELLS)
const lumBuf = new Float32Array(CELLS)
const charIdx = new Int8Array(CELLS)  // -1 = empty, 0..11 = char index

function computeTorusFrame(A: number, B: number, breath: number): void {
  zbuf.fill(0)
  lumBuf.fill(0)
  charIdx.fill(-1)

  const cA = Math.cos(A), sA = Math.sin(A)
  const cB = Math.cos(B), sB = Math.sin(B)

  // Scale: fits 9:16 viewport, center the torus
  // a1k0n math's projected (x,y) is symmetric around (COLS/2, ROWS/2) when
  // scaled by K ~ min(COLS,ROWS) * 0.35
  // Monospace cells are taller than wide (9.6 x 18), so K_Y is scaled down
  // to keep the projected torus round in pixel space.
  const K_X = COLS * 0.62 * breath
  const K_Y = K_X * (CHAR_W / LINE_H)
  const cx = COLS / 2
  const cy = ROWS / 2

  for (let j = 0; j < 6.283; j += 0.03) {
    const ct = Math.cos(j), st = Math.sin(j)
    for (let i = 0; i < 6.283; i += 0.008) {
      const sp = Math.sin(i), cp = Math.cos(i)
      const h = ct + 2
      const denom = sp * h * sA + st * cA + 5
      if (denom <= 0.1) continue
      const D = 1 / denom
      const tt = sp * h * cA - st * sA

      const x = (cx + K_X * D * (cp * h * cB - tt * sB)) | 0
      const y = (cy + K_Y * D * (cp * h * sB + tt * cB)) | 0

      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue

      const o = y * COLS + x
      if (D > zbuf[o]) {
        zbuf[o] = D
        const N = (st * sA - sp * ct * cA) * cB - sp * ct * sA - st * cA - cp * ct * sB
        if (N > 0) {
          const n8 = (8 * N) | 0
          const idx = n8 > 11 ? 11 : n8
          charIdx[o] = idx
          lumBuf[o] = n8 > 11 ? 1 : n8 / 11
        } else {
          charIdx[o] = 0
          lumBuf[o] = 0
        }
      }
    }
  }
}

function lumToColor(lum: number): string {
  // bone ivory -> amber -> white-hot
  if (lum > 0.75) {
    const t = Math.min(1, (lum - 0.75) / 0.25)
    const g = (235 + 20 * t) | 0
    const b = (200 + 55 * t) | 0
    return `rgba(255,${g},${b},1)`
  } else if (lum > 0.45) {
    const t = (lum - 0.45) / 0.3
    const r = 255
    const g = (180 + 55 * t) | 0
    const b = (110 + 90 * t) | 0
    return `rgba(${r},${g},${b},1)`
  } else if (lum > 0.18) {
    const t = (lum - 0.18) / 0.27
    const r = (230 + 25 * t) | 0
    const g = (150 + 30 * t) | 0
    const b = (90 + 20 * t) | 0
    return `rgba(${r},${g},${b},0.95)`
  } else {
    const t = lum / 0.18
    const r = (150 + 80 * t) | 0
    const g = (85 + 65 * t) | 0
    const b = (55 + 35 * t) | 0
    return `rgba(${r},${g},${b},0.85)`
  }
}

function drawFrame(t: number): void {
  const A = 0.2 + t * 0.28
  const B = 0.1 + t * 0.19
  const breath = 1 + 0.04 * Math.sin(t * (Math.PI * 2 / 1.4))

  computeTorusFrame(A, B, breath)

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CSS_W, CSS_H)

  ctx.font = FONT
  for (let y = 0; y < ROWS; y++) {
    const yPx = GRID_OY + y * LINE_H
    const rb = y * COLS
    for (let x = 0; x < COLS; x++) {
      const idx = charIdx[rb + x]
      if (idx < 0) continue
      const xPx = GRID_OX + x * CHAR_W
      ctx.fillStyle = lumToColor(lumBuf[rb + x])
      ctx.fillText(LUM_CHARS[idx], xPx, yPx)
    }
  }

  // Additive bloom at hot-ridge cells — warm halo blooms through neighbor glyphs
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.filter = 'blur(6px)'
  for (let y = 0; y < ROWS; y++) {
    const yPx = GRID_OY + y * LINE_H
    const rb = y * COLS
    for (let x = 0; x < COLS; x++) {
      const lum = lumBuf[rb + x]
      if (lum < 0.72) continue
      const t2 = Math.min(1, (lum - 0.72) / 0.28)
      const alpha = (0.08 + 0.22 * t2).toFixed(3)
      const g = (200 + 40 * t2) | 0
      const b = (130 + 90 * t2) | 0
      ctx.fillStyle = `rgba(255,${g},${b},${alpha})`
      ctx.fillRect(GRID_OX + x * CHAR_W - 2, yPx - 1, CHAR_W + 4, LINE_H + 2)
    }
  }
  ctx.restore()
}

let startTs = 0
function loop(now: number): void {
  if (startTs === 0) startTs = now
  const t = (now - startTs) / 1000
  drawFrame(t)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
