import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  LOTUS FALL - vertical falling-subtitle ASCII animation
//  Portrait 45x80, 30s loop
// ============================================================

// ---- grid (portrait / phone ratio 9:16) ----

const COLS = 45
const ROWS = 80
const WATER_ROW = Math.floor(ROWS * 0.44) // ~row 35

// ---- character sets ----

const SURFACE_CHARS = '~=~-~=~_~-'
const RIPPLE_STRONG = '~oO*@&'
const RIPPLE_WEAK = '~-._`\''
const SPLASH_CHARS = '*+x.o~'
const NOISE_CHARS = '&*$%^#@!?~+:;.,`'
const STEM_CHARS = '|!I:'
const PETAL_CHARS = '(){}<>@*'
const BUD_CHARS = 'oO0@'

// ---- placeholder script (Rei-style short phrases) ----

const SCRIPT_LINES = [
  '......',
  '\u96E8\u304C\u964D\u3063\u3066\u3044\u308B',       // rain ga futteiru
  '\u6C34\u306E\u4E2D\u3067',                           // mizu no naka de
  '\u4F55\u304B\u304C\u52D5\u3044\u3066\u3044\u308B',   // nanika ga ugoiteiru
  '\u75DB\u307F\u306E\u5148\u306B',                     // itami no saki ni
  '\u5149',                                               // hikari
]

// [appearAt_s, holdDuration_s]
const LINE_TIMING: [number, number][] = [
  [1.0, 1.8],
  [4.5, 2.5],
  [9.0, 2.2],
  [13.5, 2.5],
  [18.0, 2.0],
  [23.0, 2.5],
]

// ---- font measurement via pretext ----

const FONT = '13px "SF Mono","Cascadia Code",Consolas,monospace'
const allChars = new Set(
  SURFACE_CHARS + RIPPLE_STRONG + RIPPLE_WEAK + SPLASH_CHARS + NOISE_CHARS +
  STEM_CHARS + PETAL_CHARS + BUD_CHARS + SCRIPT_LINES.join('')
)
for (const ch of allChars) prepareWithSegments(ch, FONT)

// ---- CJK width helpers ----

function isCJK(code: number): boolean {
  return (code >= 0x2E80 && code <= 0x9FFF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFF00 && code <= 0xFF60) ||
    (code >= 0x3000 && code <= 0x303F) ||
    (code >= 0x3040 && code <= 0x309F) ||
    (code >= 0x30A0 && code <= 0x30FF)
}

function visualWidth(text: string): number {
  let w = 0
  for (let i = 0; i < text.length; i++) w += isCJK(text.charCodeAt(i)) ? 2 : 1
  return w
}

function charOffsets(text: string): number[] {
  const offsets: number[] = []
  let col = 0
  for (let i = 0; i < text.length; i++) {
    offsets.push(col)
    col += isCJK(text.charCodeAt(i)) ? 2 : 1
  }
  return offsets
}

// ---- wave simulation ----

const SIM_W = COLS
const SIM_H = ROWS - WATER_ROW
const wave0 = new Float32Array(SIM_W * SIM_H)
const wave1 = new Float32Array(SIM_W * SIM_H)
const DAMPING = 0.984

function waveStep(): void {
  for (let y = 1; y < SIM_H - 1; y++) {
    for (let x = 1; x < SIM_W - 1; x++) {
      const i = y * SIM_W + x
      const avg = (wave0[i - 1]! + wave0[i + 1]! + wave0[i - SIM_W]! + wave0[i + SIM_W]!) * 0.25
      wave1[i] = (avg * 2 - wave1[i]!) * DAMPING
    }
  }
  const tmp = new Float32Array(wave0)
  wave0.set(wave1)
  wave1.set(tmp)
}

function waveSplash(cx: number, width: number, strength: number): void {
  const r = Math.max(3, Math.floor(width * 0.6))
  for (let dy = 0; dy < Math.min(4, SIM_H); dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const gx = cx + dx
      if (gx < 0 || gx >= SIM_W) continue
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > r) continue
      const falloff = 1 - dist / (r + 1)
      const idx = dy * SIM_W + gx
      wave0[idx] = wave0[idx]! + strength * falloff * (1 - dy * 0.2)
    }
  }
}

// ---- splash particles (visual burst on impact) ----

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number  // 0..1
  ch: string
}

const particles: Particle[] = []

function spawnSplash(cx: number, width: number): void {
  const count = 8 + width * 2
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI  // upward semicircle
    const speed = 0.3 + Math.random() * 0.8
    particles.push({
      x: cx + (Math.random() - 0.5) * width * 0.8,
      y: WATER_ROW,
      vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: -Math.sin(angle) * speed * 0.6,
      life: 1.0,
      ch: SPLASH_CHARS[Math.floor(Math.random() * SPLASH_CHARS.length)]!,
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.04 // gravity
    p.life -= 0.025
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ---- falling text trail ----

interface TrailChar {
  ch: string; x: number; y: number; opacity: number
}

const trails: TrailChar[] = []

// ---- subtitle state machine ----

const enum LineState { WAITING, TYPING, HOLDING, FALLING, DISSOLVING, GONE }

interface SubLine {
  text: string
  state: LineState
  appearAt: number
  holdDur: number
  typedCount: number
  typeStartT: number
  y: number
  baseY: number
  fallVy: number
  fallStartT: number
  dissolveT: number
  dissolveStartT: number
  ghostChars: { ch: string; x: number; y: number; opacity: number }[]
  lastTrailY: number  // last row where trail was spawned
}

const SUBTITLE_ROW = 10

const lines: SubLine[] = SCRIPT_LINES.map((text, i) => ({
  text,
  state: LineState.WAITING,
  appearAt: LINE_TIMING[i]![0],
  holdDur: LINE_TIMING[i]![1],
  typedCount: 0,
  typeStartT: 0,
  y: SUBTITLE_ROW,
  baseY: SUBTITLE_ROW,
  fallVy: 0,
  fallStartT: 0,
  dissolveT: 0,
  dissolveStartT: 0,
  ghostChars: [],
  lastTrailY: SUBTITLE_ROW,
}))

// ---- lotus state ----

let lotusEnergy = 0
let lotusStemH = 0
let lotusPetalR = 0
let lotusBloomT = 0

function updateLotus(s: number): void {
  const targetStem = Math.min(12, Math.floor(lotusEnergy * 15))
  lotusStemH += (targetStem - lotusStemH) * 0.03

  if (lotusEnergy > 0.5) {
    const bp = Math.min(1, (lotusEnergy - 0.5) / 0.5)
    lotusPetalR += (bp * 5.5 - lotusPetalR) * 0.022
    lotusBloomT += (bp - lotusBloomT) * 0.025
  }

  if (s > 26) {
    lotusStemH += (12 - lotusStemH) * 0.05
    lotusPetalR += (5.5 - lotusPetalR) * 0.04
    lotusBloomT += (1 - lotusBloomT) * 0.04
  }
}

// ---- update subtitle lines ----

const TYPE_SPEED = 5.0

function updateLines(s: number): void {
  for (const ln of lines) {
    switch (ln.state) {
      case LineState.WAITING:
        if (s >= ln.appearAt) {
          ln.state = LineState.TYPING
          ln.typeStartT = s
          ln.typedCount = 0
        }
        break

      case LineState.TYPING: {
        const elapsed = s - ln.typeStartT
        ln.typedCount = Math.min(ln.text.length, Math.floor(elapsed * TYPE_SPEED))
        if (ln.typedCount >= ln.text.length) ln.state = LineState.HOLDING
        break
      }

      case LineState.HOLDING: {
        const typeEnd = ln.typeStartT + ln.text.length / TYPE_SPEED
        if (s >= typeEnd + ln.holdDur) {
          ln.state = LineState.FALLING
          ln.fallStartT = s
          ln.fallVy = 0.3
          ln.y = ln.baseY
          ln.lastTrailY = ln.baseY
        }
        break
      }

      case LineState.FALLING: {
        const dt = 1 / 60
        ln.fallVy += 15.0 * dt
        ln.y += ln.fallVy * dt * 60

        // spawn trail every 2 rows
        if (Math.floor(ln.y) >= ln.lastTrailY + 2) {
          ln.lastTrailY = Math.floor(ln.y)
          const vw = visualWidth(ln.text)
          const sx = Math.floor((COLS - vw) / 2)
          const offs = charOffsets(ln.text)
          for (let i = 0; i < ln.text.length; i++) {
            if (Math.random() > 0.4) continue // sparse trail
            trails.push({
              ch: ln.text[i]!,
              x: sx + offs[i]!,
              y: ln.lastTrailY,
              opacity: 0.35,
            })
          }
        }

        if (ln.y >= WATER_ROW) {
          ln.y = WATER_ROW
          const cx = Math.floor(COLS / 2)
          const vw = visualWidth(ln.text)
          const strength = 0.6 + vw * 0.05
          waveSplash(cx, vw, strength)
          spawnSplash(cx, vw)
          lotusEnergy = Math.min(1.0, lotusEnergy + 0.10 + ln.text.length * 0.012)

          ln.state = LineState.DISSOLVING
          ln.dissolveStartT = s
          ln.dissolveT = 0

          const sx = Math.floor((COLS - vw) / 2)
          const offs = charOffsets(ln.text)
          ln.ghostChars = []
          for (let i = 0; i < ln.text.length; i++) {
            ln.ghostChars.push({
              ch: ln.text[i]!,
              x: sx + offs[i]!,
              y: WATER_ROW + 1 + Math.random() * 3,
              opacity: 0.8,
            })
          }
        }
        break
      }

      case LineState.DISSOLVING: {
        ln.dissolveT = Math.min(1, (s - ln.dissolveStartT) / 2.0)
        for (const gc of ln.ghostChars) {
          gc.y += 0.02
          gc.opacity *= 0.99
          gc.x += (Math.random() - 0.5) * 0.1
        }
        if (ln.dissolveT >= 1) ln.state = LineState.GONE
        break
      }

      case LineState.GONE:
        for (const gc of ln.ghostChars) {
          gc.y += 0.01
          gc.opacity *= 0.995
        }
        break
    }
  }

  // fade trails
  for (let i = trails.length - 1; i >= 0; i--) {
    trails[i]!.opacity -= 0.012
    if (trails[i]!.opacity <= 0) trails.splice(i, 1)
  }
}

// ---- hash / helpers ----

function h(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

function esc(c: string): string {
  if (c === '<') return '&lt;'
  if (c === '>') return '&gt;'
  if (c === '&') return '&amp;'
  return c
}

// ---- water surface visibility ----

function surfaceVis(s: number): number {
  if (s < 0.5) return 0
  return Math.min(1, smoothstep(0.5, 4.0, s))
}

// ---- DOM ----

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div')
  el.className = 'r'
  artEl.appendChild(el)
  rowEls.push(el)
}

// ---- render ----

let startTime: number | null = null

function frame(now: number): void {
  if (startTime === null) startTime = now
  const ms = now - startTime
  const s = ms / 1000

  // loop at 33s
  if (s > 33) {
    startTime = now
    wave0.fill(0); wave1.fill(0)
    lotusEnergy = 0; lotusStemH = 0; lotusPetalR = 0; lotusBloomT = 0
    particles.length = 0
    trails.length = 0
    for (const ln of lines) {
      ln.state = LineState.WAITING
      ln.typedCount = 0
      ln.y = ln.baseY
      ln.fallVy = 0
      ln.dissolveT = 0
      ln.ghostChars = []
      ln.lastTrailY = ln.baseY
    }
    requestAnimationFrame(frame)
    return
  }

  const fi = Math.floor(ms / 80)
  const sv = surfaceVis(s)

  updateLines(s)
  updateParticles()
  updateLotus(s)
  waveStep()
  waveStep()

  // --- build cell maps ---

  // text cells (subtitle / falling / dissolving)
  const textCells = new Map<string, { ch: string; cls: string }>()

  for (const ln of lines) {
    if (ln.state === LineState.WAITING || ln.state === LineState.GONE) continue

    const displayText = ln.state === LineState.TYPING
      ? ln.text.slice(0, ln.typedCount) : ln.text
    if (displayText.length === 0) continue

    const vw = visualWidth(ln.text)
    const startX = Math.floor((COLS - vw) / 2)
    const offsets = charOffsets(displayText)
    const row = Math.floor(ln.y)
    if (row < 0 || row >= ROWS) continue

    for (let i = 0; i < displayText.length; i++) {
      const gx = startX + offsets[i]!
      if (gx < 0 || gx >= COLS) continue
      const ch = displayText[i]!
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1

      let cls: string
      if (ln.state === LineState.TYPING || ln.state === LineState.HOLDING) {
        if (ln.state === LineState.TYPING) {
          const charAge = (s - ln.typeStartT) * TYPE_SPEED - i
          const brightness = Math.min(1, Math.max(0, charAge * 1.5))
          const lvl = Math.max(1, Math.min(6, Math.ceil(brightness * 6)))
          cls = `s${lvl}`
        } else {
          cls = 's6'
        }
      } else if (ln.state === LineState.FALLING) {
        const fallDist = ln.y - ln.baseY
        const maxDist = WATER_ROW - ln.baseY
        const fade = Math.min(1, fallDist / maxDist)
        const lvl = Math.max(1, Math.min(5, Math.ceil((1 - fade * 0.5) * 5)))
        cls = `ft${lvl}`
      } else if (ln.state === LineState.DISSOLVING) {
        const lvl = Math.max(1, Math.min(4, Math.ceil((1 - ln.dissolveT) * 4)))
        cls = `ds${lvl}`
      } else {
        continue
      }

      textCells.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) textCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }
  }

  // trail cells
  const trailCells = new Map<string, { ch: string; opacity: number }>()
  for (const t of trails) {
    const key = `${Math.round(t.x)},${Math.round(t.y)}`
    if (!trailCells.has(key) || t.opacity > trailCells.get(key)!.opacity) {
      trailCells.set(key, { ch: t.ch, opacity: t.opacity })
    }
  }

  // ghost cells (sunken text)
  const ghostCells = new Map<string, { ch: string; opacity: number }>()
  for (const ln of lines) {
    for (const gc of ln.ghostChars) {
      if (gc.opacity < 0.02) continue
      const gx = Math.round(gc.x)
      const gy = Math.round(gc.y)
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
      const key = `${gx},${gy}`
      const existing = ghostCells.get(key)
      if (!existing || gc.opacity > existing.opacity) {
        ghostCells.set(key, { ch: gc.ch, opacity: gc.opacity })
      }
    }
  }

  // particle cells (splash)
  const particleCells = new Map<string, { ch: string; life: number }>()
  for (const p of particles) {
    const gx = Math.round(p.x)
    const gy = Math.round(p.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    const key = `${gx},${gy}`
    if (!particleCells.has(key) || p.life > particleCells.get(key)!.life) {
      particleCells.set(key, { ch: p.ch, life: p.life })
    }
  }

  // lotus geometry
  const lotusCX = Math.floor(COLS / 2)
  const stemTop = WATER_ROW - Math.floor(lotusStemH)
  const flowerY = stemTop - 1

  // --- render rows ---

  for (let gy = 0; gy < ROWS; gy++) {
    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + gy * 137
      const key = `${gx},${gy}`

      // ---- SUBTITLE / FALLING TEXT (top priority above water) ----
      const tc = textCells.get(key)
      if (tc !== undefined && gy <= WATER_ROW) {
        if (tc.ch === '') { continue } // CJK second column
        html += `<span class="${tc.cls}">${esc(tc.ch)}</span>`
        continue
      }

      // ---- SPLASH PARTICLES (above water) ----
      if (gy <= WATER_ROW) {
        const pc = particleCells.get(key)
        if (pc) {
          const lvl = Math.max(1, Math.min(4, Math.ceil(pc.life * 4)))
          html += `<span class="sp${lvl}">${esc(pc.ch)}</span>`
          continue
        }
      }

      // ---- FALLING TRAIL (faint afterimage) ----
      if (gy < WATER_ROW) {
        const tr = trailCells.get(key)
        if (tr && tr.opacity > 0.03) {
          const lvl = Math.max(1, Math.min(5, Math.ceil(tr.opacity * 8)))
          html += `<span class="ft${lvl}">${esc(tr.ch)}</span>`
          continue
        }
      }

      // ---- LOTUS (stem + flower) ----
      if (lotusStemH > 1) {
        if (gx === lotusCX && gy >= stemTop && gy < WATER_ROW) {
          const sc = STEM_CHARS[Math.floor(h(seed) * STEM_CHARS.length)]!
          const stemProgress = 1 - (gy - stemTop) / Math.max(1, WATER_ROW - stemTop)
          const sl = Math.max(1, Math.min(4, Math.ceil(stemProgress * lotusBloomT * 4 + 1)))
          html += `<span class="g${sl}">${esc(sc)}</span>`
          continue
        }
        if (lotusPetalR > 0.5 && gy <= flowerY + 1 && gy >= flowerY - Math.ceil(lotusPetalR)) {
          const dx = gx - lotusCX
          const dy = gy - flowerY
          const dist = Math.sqrt(dx * dx + dy * dy * 3.0)
          if (dist < lotusPetalR) {
            if (dist < lotusPetalR * 0.25) {
              const bl = Math.max(1, Math.min(3, Math.ceil(lotusBloomT * 3)))
              const pc = BUD_CHARS[Math.floor(h(seed + 99) * BUD_CHARS.length)]!
              html += `<span class="bc${bl}">${esc(pc)}</span>`
            } else {
              const falloff = 1 - dist / lotusPetalR
              const pl = Math.max(1, Math.min(5, Math.ceil(falloff * lotusBloomT * 5)))
              const pc = PETAL_CHARS[Math.floor(h(seed + 77) * PETAL_CHARS.length)]!
              html += `<span class="f${pl}">${esc(pc)}</span>`
            }
            continue
          }
        }
      }

      // ---- ABOVE WATER (sky) ----
      if (gy < WATER_ROW) {
        const gc = ghostCells.get(key)
        if (gc && gc.opacity > 0.05) {
          const gl = Math.max(1, Math.min(3, Math.ceil(gc.opacity * 3)))
          html += `<span class="gh${gl}">${esc(gc.ch)}</span>`
          continue
        }
        // sparse noise
        const noiseChance = s < 1 ? 0.05 : 0.025
        if (h(seed + fi * 13) < noiseChance) {
          const nc = NOISE_CHARS[Math.floor(h(seed + fi * 31) * NOISE_CHARS.length)]!
          const nl = 1 + Math.floor(h(seed * 5) * 3)
          html += `<span class="n${nl}">${esc(nc)}</span>`
        } else {
          html += ' '
        }
        continue
      }

      // ---- WATER SURFACE (2 rows thick for visibility) ----
      if (gy === WATER_ROW || gy === WATER_ROW + 1) {
        if (sv <= 0) { html += ' '; continue }
        const fromCenter = Math.abs(gx - COLS / 2) / (COLS / 2)
        const reveal = sv - fromCenter * 0.4
        if (reveal <= 0) { html += ' '; continue }
        const simRow = gy - WATER_ROW
        const wh = Math.abs(wave0[simRow * SIM_W + gx] ?? 0)
        // baseline + wave energy
        const baseIntensity = gy === WATER_ROW ? 0.35 : 0.18
        const intensity = Math.min(1, wh * 5 + baseIntensity)
        const lvl = Math.max(1, Math.min(7, Math.ceil(intensity * 7 * Math.min(1, reveal * 1.3))))
        const sc = SURFACE_CHARS[Math.floor(h(seed + fi * 3) * SURFACE_CHARS.length)]!
        html += `<span class="w${lvl}">${esc(sc)}</span>`
        continue
      }

      // ---- BELOW WATER ----
      const simY = gy - WATER_ROW
      if (simY >= SIM_H || sv <= 0) { html += ' '; continue }

      // ghost chars underwater
      const gc = ghostCells.get(key)
      if (gc && gc.opacity > 0.03) {
        const gl = Math.max(1, Math.min(3, Math.ceil(gc.opacity * 4)))
        html += `<span class="gh${gl}">${esc(gc.ch)}</span>`
        continue
      }

      // underwater glow near lotus root
      if (lotusEnergy > 0.15) {
        const distToCenter = Math.abs(gx - lotusCX)
        const distToBottom = SIM_H - simY
        const glowRadius = lotusEnergy * 14
        const dist = Math.sqrt(distToCenter * distToCenter + distToBottom * distToBottom * 0.4)
        if (dist < glowRadius && h(seed + fi * 7) < 0.10 * (1 - dist / glowRadius)) {
          const gl = Math.max(1, Math.min(4, Math.ceil((1 - dist / glowRadius) * lotusEnergy * 4)))
          const gc2 = NOISE_CHARS[Math.floor(h(seed + fi * 19) * NOISE_CHARS.length)]!
          html += `<span class="gl${gl}">${esc(gc2)}</span>`
          continue
        }
      }

      // wave ripples
      const wh = wave0[simY * SIM_W + gx] ?? 0
      const absH = Math.abs(wh)
      if (absH > 0.02) {
        const intensity = Math.min(1, absH * 6)
        const lvl = Math.max(1, Math.min(6, Math.ceil(intensity * 6)))
        const chars = absH > 0.10 ? RIPPLE_STRONG : RIPPLE_WEAK
        const rc = chars[Math.floor(h(seed) * chars.length)]!
        html += `<span class="p${lvl}">${esc(rc)}</span>`
        continue
      }

      // ambient water texture
      const depthFade = Math.max(0, 1 - simY / SIM_H)
      if (h(seed + fi * 3) < 0.018 * depthFade) {
        const rc = RIPPLE_WEAK[Math.floor(h(seed) * RIPPLE_WEAK.length)]!
        html += `<span class="am${1 + Math.floor(h(seed * 3) * 2)}">${esc(rc)}</span>`
      } else {
        html += ' '
      }
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
