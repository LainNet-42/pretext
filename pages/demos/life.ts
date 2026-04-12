import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  数字生命 — canvas creature + ASCII atmosphere overlay
//
//  Two layers composited:
//    Bottom: <canvas> renders creature 3 (jellyfish) as scatter
//            dots, exactly like the MATLAB original.
//    Top:    <div#art> 45×64 monospace grid with transparent bg.
//            Sparse underwater ASCII noise, drifting chars,
//            and Rei subtitle text. The canvas creature shows
//            through the empty spaces.
// ============================================================

const COLS = 45
const ROWS = 64
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'
const GRID_W = 352   // COLS * ~7.8px
const GRID_H = 960   // ROWS * 15px

// ============================================================
//  Canvas setup — the creature layer
// ============================================================

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const DPR = Math.min(window.devicePixelRatio, 2)
canvas.width = GRID_W * DPR
canvas.height = GRID_H * DPR
ctx.scale(DPR, DPR)

// ============================================================
//  Creature 3 — small jellyfish (exact MATLAB port)
// ============================================================

const N = 10000
const ck = new Float32Array(N), ce = new Float32Array(N)
const cd = new Float32Array(N), ca = new Float32Array(N)
{
  for (let i = 0; i < N; i++) {
    const x = i % 200
    const y = i / 43
    ck[i] = 5 * Math.cos(x / 14) * Math.cos(y / 30)
    ce[i] = y / 8 - 13
    cd[i] = (ck[i]! ** 2 + ce[i]! ** 2) / 59 + 4
    ca[i] = Math.atan2(ck[i]!, ce[i]!)
  }
}

function drawCreature(t: number): void {
  // Motion trail: semi-transparent black overlay (not full clear)
  ctx.fillStyle = 'rgba(6, 8, 16, 0.12)'
  ctx.fillRect(0, 0, GRID_W, GRID_H)

  // Dots: soft blue-white, semi-transparent
  ctx.fillStyle = 'rgba(160, 210, 255, 0.35)'

  for (let i = 0; i < N; i++) {
    const k = ck[i]!, e = ce[i]!, d = cd[i]!, a = ca[i]!
    const q = 60 - 3 * Math.sin(a * e) + k * (3 + 4 / d * Math.sin(d * d - t * 2))
    const c = d / 2 + e / 99 - t / 18
    // Map from MATLAB's [0,400]×[0,400] to our canvas [0,GRID_W]×[0,GRID_H]
    const px = (q * Math.sin(c) + 200) / 400 * GRID_W
    const py = ((q + d * 9) * Math.cos(c) + 200) / 400 * GRID_H
    ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2)
  }
}

// ============================================================
//  ASCII overlay — atmosphere
// ============================================================

const WATER_CHARS = '~-._`\''
const NOISE_CHARS = '\u00B7.,'

const allChars = new Set(WATER_CHARS + NOISE_CHARS)
for (const ch of allChars) prepareWithSegments(ch, FONT)

function hh(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }

// DOM
const art = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; art.appendChild(el); rowEls.push(el)
}
const htmlParts: string[] = []

// Drifting particles (ASCII chars that float slowly)
interface Drift { x: number; y: number; vx: number; vy: number; ch: string; life: number }
const drifts: Drift[] = []

function updateDrifts(s: number): void {
  // Spawn occasionally
  if (Math.random() < 0.04) {
    drifts.push({
      x: Math.random() * COLS,
      y: ROWS + 1,
      vx: (Math.random() - 0.5) * 0.05,
      vy: -(0.02 + Math.random() * 0.04),
      ch: WATER_CHARS[Math.floor(Math.random() * WATER_CHARS.length)]!,
      life: 1,
    })
  }
  for (let i = drifts.length - 1; i >= 0; i--) {
    const d = drifts[i]!
    d.x += d.vx + Math.sin(d.y * 0.15 + s) * 0.02
    d.y += d.vy
    d.life -= 0.003
    if (d.life <= 0 || d.y < -1) drifts.splice(i, 1)
  }
  if (drifts.length > 40) drifts.splice(0, drifts.length - 40)
}

function drawASCII(s: number): void {
  const fi = Math.floor(s * 12.5)

  for (let gy = 0; gy < ROWS; gy++) {
    htmlParts.length = 0
    for (let gx = 0; gx < COLS; gx++) {
      let rendered = false

      // Drifting particles
      if (!rendered) {
        for (const d of drifts) {
          if (Math.round(d.x) === gx && Math.round(d.y) === gy) {
            const lvl = d.life > 0.6 ? 3 : d.life > 0.3 ? 2 : 1
            htmlParts.push('<span class="w', String(lvl), '">', esc(d.ch), '</span>')
            rendered = true
            break
          }
        }
      }

      // Sparse ambient noise
      if (!rendered) {
        if (hh(gx * 73 + gy * 137 + fi * 13) < 0.008) {
          htmlParts.push('<span class="w1">\u00B7</span>')
        } else {
          htmlParts.push(' ')  // transparent — canvas shows through
        }
      }
    }
    rowEls[gy]!.innerHTML = htmlParts.join('')
  }
}

// ============================================================
//  Frame
// ============================================================

let startT: number | null = null

function frame(now: number): void {
  if (startT === null) startT = now
  const s = (now - startT) / 1000
  const t = s * 1.8

  // Canvas: draw creature
  drawCreature(t)

  // ASCII: draw atmosphere overlay
  updateDrifts(s)
  drawASCII(s)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
