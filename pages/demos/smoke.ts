import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  煙 — pure abstract smoke, expert ASCII principles
//
//  RESTRAINT:
//    - 5 characters only: ' ', '.', ':', '*', '#'
//    - 70%+ negative space — the darkness IS the composition
//    - Thin column, not a fat cloud
//    - Smooth density gradient: dense at source, thin at top
//    - One ember glow point at the bottom
//
//  ANIMATION (Disney principles):
//    - Ease-in on spawn (wisps accelerate into their upward motion)
//    - Follow-through (wisps drift after bursts stop)
//    - Overlapping action (wisps at different speeds/phases)
//    - Anticipation (small puff before a big burst)
//
//  No objects. No shapes. Just smoke against darkness.
// ============================================================

const COLS = 45
const ROWS = 64
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'

const CX = 22
const SOURCE_Y = 56

// Only 5 smoke characters, ordered by density
const CHARS = ['.', ':', '*', '#', '@']

function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x303F)
}
function vw(t: string): number { let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w }
function coffs(t: string): number[] { const o: number[] = []; let c = 0; for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }; return o }

// Noise for turbulence
function noise(x: number, y: number, t: number): number {
  return (Math.sin(x * 0.12 + t * 0.7) * Math.cos(y * 0.09 + t * 0.5)
    + Math.sin(x * 0.07 - t * 0.35 + y * 0.08) * 0.5) * 0.6
}

function hh(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }

// ============================================================
//  Font prep
// ============================================================

const allChars = new Set(CHARS.join('') + '@.\u5BD2\u6696\u7159\u6D88\u3044\u304B\u3002\u2026\u3001\u306E\u308B\u3048')
for (const ch of allChars) prepareWithSegments(ch, FONT)

// ============================================================
//  Wisp particles — the only visual element besides the ember
// ============================================================

interface Wisp {
  x: number; y: number
  vx: number; vy: number
  life: number
  maxLife: number
}
const wisps: Wisp[] = []
const MAX_WISPS = 400

function spawnWisp(spread: number, power: number): void {
  if (wisps.length >= MAX_WISPS) return
  wisps.push({
    x: CX + (Math.random() - 0.5) * spread,
    y: SOURCE_Y,
    vx: (Math.random() - 0.5) * 0.15,
    vy: -(0.3 + Math.random() * power * 0.7),
    life: 1.0,
    maxLife: 1.0,
  })
}

function updateWisps(s: number): void {
  for (let i = wisps.length - 1; i >= 0; i--) {
    const w = wisps[i]!

    // Turbulence
    w.vx += noise(w.x, w.y, s) * 0.04
    // Buoyancy (gentle upward pull)
    w.vy -= 0.003
    // Drag
    w.vx *= 0.988
    w.vy *= 0.995
    // Horizontal diffusion increases as it rises
    const height = SOURCE_Y - w.y
    w.vx += (Math.random() - 0.5) * 0.015 * (1 + height * 0.02)

    w.x += w.vx
    w.y += w.vy

    // Decay: slow near source, faster as it rises
    const heightRatio = Math.max(0, height / SOURCE_Y)
    w.life -= 0.003 + heightRatio * 0.004

    if (w.life <= 0 || w.y < -2 || w.x < -5 || w.x > COLS + 5) {
      wisps[i] = wisps[wisps.length - 1]!
      wisps.pop()
    }
  }
}

// ============================================================
//  Subtitle
// ============================================================

const LINES = [
  '\u5BD2\u3044\u3002',           // 寒い。
  '\u7159\u3002',                 // 煙。
  '\u6D88\u3048\u306A\u3044\u3002', // 消えない。
]
const LINE_AT = [2.0, 10.0, 22.0]

// ============================================================
//  DOM
// ============================================================

const art = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; art.appendChild(el); rowEls.push(el)
}

// Pre-allocated density grid: stores the "density" at each cell (0..1)
// populated from wisps each frame, then rendered to chars.
const density = new Float32Array(COLS * ROWS)
const htmlParts: string[] = []

const TOTAL = 30.0

// ============================================================
//  Frame
// ============================================================

let startT: number | null = null

function frame(now: number): void {
  if (startT === null) startT = now
  const s = (now - startT) / 1000

  if (s > TOTAL) {
    startT = now; wisps.length = 0
    requestAnimationFrame(frame); return
  }

  // ---- Spawn behavior: builds over time ----
  // Phase 0 (0-5s): nothing, just darkness
  // Phase 1 (5-15s): slow thin smoke, 1-2 wisps per frame
  // Phase 2 (15-22s): denser, periodic bursts
  // Phase 3 (22-28s): sustained thick smoke
  // Phase 4 (28+): thinning, fading

  let spawnRate = 0
  let spread = 1.5
  let power = 0.6

  if (s > 4 && s < 8) {
    spawnRate = 0.15
    spread = 1; power = 0.5
  } else if (s >= 8 && s < 15) {
    spawnRate = 0.3
    spread = 2; power = 0.7
  } else if (s >= 15 && s < 22) {
    spawnRate = 0.5
    spread = 2.5; power = 1.0
    // Periodic bursts (anticipation → release)
    if (Math.sin(s * 1.5) > 0.7) { spawnRate = 0.9; power = 1.3 }
  } else if (s >= 22 && s < 28) {
    spawnRate = 0.65
    spread = 3; power = 1.1
  } else if (s >= 28) {
    spawnRate = Math.max(0, 0.3 * (1 - (s - 28) / 2))
    spread = 2; power = 0.6
  }

  if (Math.random() < spawnRate) spawnWisp(spread, power)

  updateWisps(s)

  // ---- Build density grid from wisps ----
  density.fill(0)
  for (const w of wisps) {
    const gx = Math.round(w.x)
    const gy = Math.round(w.y)
    // Each wisp contributes to a small area (not just one cell)
    // This creates smooth density instead of point-particles
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = gx + dx, py = gy + dy
        if (px < 0 || px >= COLS || py < 0 || py >= ROWS) continue
        const d = Math.sqrt(dx * dx + dy * dy)
        const contribution = w.life * (1 - d * 0.5) * 0.5
        if (contribution > 0) {
          const idx = py * COLS + px
          density[idx] = Math.min(1, (density[idx] ?? 0) + contribution)
        }
      }
    }
  }

  // Fade out
  const gfade = s >= TOTAL - 2 ? Math.max(0, 1 - (s - (TOTAL - 2)) / 2) : 1.0

  // ---- Render ----
  for (let gy = 0; gy < ROWS; gy++) {
    if (gfade <= 0) { rowEls[gy]!.innerHTML = ''; continue }
    htmlParts.length = 0
    for (let gx = 0; gx < COLS; gx++) {
      const d = density[gy * COLS + gx]!

      // Ember glow at source: small bright area
      const distFromSource = Math.sqrt((gx - CX) * (gx - CX) + (gy - SOURCE_Y) * (gy - SOURCE_Y))
      if (distFromSource < 2.5 && s > 4) {
        const emberI = Math.max(0, 1 - distFromSource / 2.5) * Math.min(1, (s - 4) / 2)
        const pulse = 0.7 + 0.3 * Math.sin(s * 2.5 + gx)
        if (emberI * pulse > 0.3) {
          const lvl = Math.min(3, Math.ceil(emberI * pulse * 3))
          htmlParts.push('<span class="h', String(lvl), '">', esc(CHARS[3]!), '</span>')
          continue
        }
      }

      if (d > 0.03) {
        // Map density to character + CSS class
        // 5 characters: . : * # @
        // 5 CSS classes: a b c d e (lightest → densest)
        const charIdx = Math.min(CHARS.length - 1, Math.floor(d * CHARS.length))
        const ch = CHARS[charIdx]!
        const cls = ['a', 'b', 'c', 'd', 'e'][charIdx]!
        htmlParts.push('<span class="', cls, '">', esc(ch), '</span>')
      } else {
        htmlParts.push(' ')
      }
    }
    rowEls[gy]!.innerHTML = htmlParts.join('')
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
