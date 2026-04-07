import { prepareWithSegments } from '../../src/layout.ts'

// ---- grid sizing (fill viewport) ----

const FONT_SIZE = 14
const LINE_HEIGHT = 16
const CHAR_WIDTH_APPROX = 8.4 // approximate average char width for column count
const COLS = Math.max(30, Math.floor(window.innerWidth / CHAR_WIDTH_APPROX))
const ROWS = Math.max(16, Math.floor(window.innerHeight / LINE_HEIGHT))

// ---- simulation config ----

const PROP_FAMILY = 'Georgia, Palatino, "Times New Roman", serif'
const FIELD_OVERSAMPLE = 2
const FIELD_COLS = COLS * FIELD_OVERSAMPLE
const FIELD_ROWS = ROWS * FIELD_OVERSAMPLE
const CANVAS_W = Math.round(COLS * CHAR_WIDTH_APPROX * 0.5)
const CANVAS_H = Math.round(ROWS * LINE_HEIGHT * 0.5)
const FIELD_SCALE_X = FIELD_COLS / CANVAS_W
const FIELD_SCALE_Y = FIELD_ROWS / CANVAS_H

const PARTICLE_N = 180
const SPRITE_R = 16
const ATTRACTOR_R = 14
const LARGE_ATTRACTOR_R = 35
const MOUSE_ATTRACTOR_R = 40
const ATTRACTOR_FORCE_1 = 0.25
const ATTRACTOR_FORCE_2 = 0.06
const MOUSE_REPEL_FORCE = 0.6
const MOUSE_REPEL_RADIUS = 60
const MOUSE_ATTRACT_FORCE = 0.04
const FIELD_DECAY = 0.84
const CHARSET = ' .,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const WEIGHTS = [300, 500, 800] as const
const STYLES = ['normal', 'italic'] as const

// ---- types ----

type FontStyleVariant = typeof STYLES[number]

type PaletteEntry = {
  char: string
  weight: number
  style: FontStyleVariant
  font: string
  width: number
  brightness: number
}

type BrightnessEntry = {
  goldHtml: string
  blueHtml: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
}

type FieldStamp = {
  radiusX: number
  radiusY: number
  sizeX: number
  sizeY: number
  values: Float32Array
}

// ---- brightness measurement ----

const brightnessCanvas = document.createElement('canvas')
brightnessCanvas.width = 28
brightnessCanvas.height = 28
const brightnessContext = brightnessCanvas.getContext('2d', { willReadFrequently: true })
if (brightnessContext === null) throw new Error('brightness context not available')
const bCtx = brightnessContext

function estimateBrightness(ch: string, font: string): number {
  const size = 28
  bCtx.clearRect(0, 0, size, size)
  bCtx.font = font
  bCtx.fillStyle = '#fff'
  bCtx.textBaseline = 'middle'
  bCtx.fillText(ch, 1, size / 2)
  const data = bCtx.getImageData(0, 0, size, size).data
  let sum = 0
  for (let i = 3; i < data.length; i += 4) sum += data[i]!
  return sum / (255 * size * size)
}

function measureWidth(ch: string, font: string): number {
  const prepared = prepareWithSegments(ch, font)
  return prepared.widths.length > 0 ? prepared.widths[0]! : 0
}

// ---- build palette ----

const palette: PaletteEntry[] = []
for (const style of STYLES) {
  for (const weight of WEIGHTS) {
    const font = `${style === 'italic' ? 'italic ' : ''}${weight} ${FONT_SIZE}px ${PROP_FAMILY}`
    for (const ch of CHARSET) {
      if (ch === ' ') continue
      const width = measureWidth(ch, font)
      if (width <= 0) continue
      const brightness = estimateBrightness(ch, font)
      palette.push({ char: ch, weight, style, font, width, brightness })
    }
  }
}

const maxBrightness = Math.max(...palette.map(e => e.brightness))
if (maxBrightness > 0) {
  for (let i = 0; i < palette.length; i++) {
    palette[i]!.brightness /= maxBrightness
  }
}
palette.sort((a, b) => a.brightness - b.brightness)

// target cell width for proportional fitting
const targetCellW = (window.innerWidth * 0.95) / COLS

function findBest(targetBrightness: number): PaletteEntry {
  let lo = 0
  let hi = palette.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (palette[mid]!.brightness < targetBrightness) lo = mid + 1
    else hi = mid
  }

  let bestScore = Infinity
  let best = palette[lo]!
  const start = Math.max(0, lo - 15)
  const end = Math.min(palette.length, lo + 15)
  for (let i = start; i < end; i++) {
    const entry = palette[i]!
    const brightnessError = Math.abs(entry.brightness - targetBrightness) * 2.5
    const widthError = Math.abs(entry.width - targetCellW) / targetCellW
    const score = brightnessError + widthError
    if (score < bestScore) {
      bestScore = score
      best = entry
    }
  }
  return best
}

function esc(ch: string): string {
  if (ch === '<') return '&lt;'
  if (ch === '>') return '&gt;'
  if (ch === '&') return '&amp;'
  if (ch === '"') return '&quot;'
  return ch
}

function wCls(weight: number, style: FontStyleVariant): string {
  const wc = weight === 300 ? 'w3' : weight === 500 ? 'w5' : 'w8'
  return style === 'italic' ? `${wc} it` : wc
}

// ---- build brightness lookup (gold + blue) ----

const brightnessLookup: BrightnessEntry[] = []
for (let b = 0; b < 256; b++) {
  const brightness = b / 255
  if (brightness < 0.02) {
    brightnessLookup.push({ goldHtml: ' ', blueHtml: ' ' })
    continue
  }
  const match = findBest(brightness)
  const alphaIndex = Math.max(1, Math.min(10, Math.round(brightness * 10)))
  const cls = wCls(match.weight, match.style)
  const ch = esc(match.char)
  brightnessLookup.push({
    goldHtml: `<span class="${cls} a${alphaIndex}">${ch}</span>`,
    blueHtml: `<span class="${cls} b${alphaIndex}">${ch}</span>`,
  })
}

// ---- particles ----

const particles: Particle[] = []
for (let i = 0; i < PARTICLE_N; i++) {
  const angle = Math.random() * Math.PI * 2
  const radius = Math.random() * 60 + 20
  particles.push({
    x: CANVAS_W / 2 + Math.cos(angle) * radius,
    y: CANVAS_H / 2 + Math.sin(angle) * radius,
    vx: (Math.random() - 0.5) * 1.0,
    vy: (Math.random() - 0.5) * 1.0,
  })
}

// ---- field stamps (gaussian splats) ----

function spriteAlphaAt(d: number): number {
  if (d >= 1) return 0
  if (d <= 0.35) return 0.45 + (0.15 - 0.45) * (d / 0.35)
  return 0.15 * (1 - (d - 0.35) / 0.65)
}

function createFieldStamp(radiusPx: number): FieldStamp {
  const frx = radiusPx * FIELD_SCALE_X
  const fry = radiusPx * FIELD_SCALE_Y
  const rx = Math.ceil(frx)
  const ry = Math.ceil(fry)
  const sx = rx * 2 + 1
  const sy = ry * 2 + 1
  const values = new Float32Array(sx * sy)
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const nd = Math.sqrt((x / frx) ** 2 + (y / fry) ** 2)
      values[(y + ry) * sx + x + rx] = spriteAlphaAt(nd)
    }
  }
  return { radiusX: rx, radiusY: ry, sizeX: sx, sizeY: sy, values }
}

const brightnessField = new Float32Array(FIELD_COLS * FIELD_ROWS)
// secondary field for the blue tint channel (mouse influence)
const blueField = new Float32Array(FIELD_COLS * FIELD_ROWS)

function splatFieldStamp(field: Float32Array, cx: number, cy: number, stamp: FieldStamp, intensity: number): void {
  const gcx = Math.round(cx * FIELD_SCALE_X)
  const gcy = Math.round(cy * FIELD_SCALE_Y)
  for (let y = -stamp.radiusY; y <= stamp.radiusY; y++) {
    const gy = gcy + y
    if (gy < 0 || gy >= FIELD_ROWS) continue
    const fro = gy * FIELD_COLS
    const sro = (y + stamp.radiusY) * stamp.sizeX
    for (let x = -stamp.radiusX; x <= stamp.radiusX; x++) {
      const gx = gcx + x
      if (gx < 0 || gx >= FIELD_COLS) continue
      const sv = stamp.values[sro + x + stamp.radiusX]!
      if (sv === 0) continue
      const fi = fro + gx
      field[fi] = Math.min(1, field[fi]! + sv * intensity)
    }
  }
}

const particleStamp = createFieldStamp(SPRITE_R)
const largeAttractorStamp = createFieldStamp(LARGE_ATTRACTOR_R)
const smallAttractorStamp = createFieldStamp(ATTRACTOR_R)
const mouseStamp = createFieldStamp(MOUSE_ATTRACTOR_R)

// ---- DOM setup ----

const grid = document.getElementById('ascii-grid')!
const hudEl = document.getElementById('hud')!
const hintEl = document.getElementById('hint')!

const rowNodes: HTMLDivElement[] = []
for (let row = 0; row < ROWS; row++) {
  const el = document.createElement('div')
  el.className = 'art-row'
  grid.appendChild(el)
  rowNodes.push(el)
}

// ---- mouse tracking ----

const mouse = {
  canvasX: CANVAS_W / 2,
  canvasY: CANVAS_H / 2,
  active: false,
  prevX: CANVAS_W / 2,
  prevY: CANVAS_H / 2,
}

let hintHidden = false

window.addEventListener('pointermove', (e: PointerEvent) => {
  // map viewport coords to simulation canvas coords
  mouse.canvasX = (e.clientX / window.innerWidth) * CANVAS_W
  mouse.canvasY = (e.clientY / window.innerHeight) * CANVAS_H
  mouse.active = true
  if (!hintHidden) {
    hintEl.style.opacity = '0'
    hintHidden = true
  }
})

window.addEventListener('pointerleave', () => {
  mouse.active = false
})

// ---- render loop ----

let frameCount = 0

function render(now: number): void {
  const t0 = performance.now()

  // two orbiting attractors
  const a1x = Math.cos(now * 0.0005) * CANVAS_W * 0.28 + CANVAS_W / 2
  const a1y = Math.sin(now * 0.0008) * CANVAS_H * 0.32 + CANVAS_H / 2
  const a2x = Math.cos(now * 0.0010 + Math.PI) * CANVAS_W * 0.22 + CANVAS_W / 2
  const a2y = Math.sin(now * 0.0007 + Math.PI) * CANVAS_H * 0.28 + CANVAS_H / 2

  // step particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const d1x = a1x - p.x
    const d1y = a1y - p.y
    const d2x = a2x - p.x
    const d2y = a2y - p.y
    const dist1sq = d1x * d1x + d1y * d1y
    const dist2sq = d2x * d2x + d2y * d2y

    // attractor pull
    let ax: number
    let ay: number
    let force: number
    if (dist1sq < dist2sq) {
      ax = d1x; ay = d1y; force = ATTRACTOR_FORCE_1
    } else {
      ax = d2x; ay = d2y; force = ATTRACTOR_FORCE_2
    }
    const dist = Math.sqrt(Math.min(dist1sq, dist2sq)) + 1
    p.vx += ax / dist * force
    p.vy += ay / dist * force

    // mouse influence: repel at close range, gentle attract at far range
    if (mouse.active) {
      const dmx = mouse.canvasX - p.x
      const dmy = mouse.canvasY - p.y
      const dmDist = Math.sqrt(dmx * dmx + dmy * dmy) + 1
      if (dmDist < MOUSE_REPEL_RADIUS) {
        // push away - creates "parting smoke" effect
        const repelStrength = (1 - dmDist / MOUSE_REPEL_RADIUS) * MOUSE_REPEL_FORCE
        p.vx -= dmx / dmDist * repelStrength
        p.vy -= dmy / dmDist * repelStrength
      } else if (dmDist < CANVAS_W * 0.35) {
        // gentle far-range attract to keep particles nearby
        p.vx += dmx / dmDist * MOUSE_ATTRACT_FORCE
        p.vy += dmy / dmDist * MOUSE_ATTRACT_FORCE
      }
    }

    // noise + damping
    p.vx += (Math.random() - 0.5) * 0.3
    p.vy += (Math.random() - 0.5) * 0.3
    p.vx *= 0.96
    p.vy *= 0.96
    p.x += p.vx
    p.y += p.vy

    // wrap
    if (p.x < -SPRITE_R) p.x += CANVAS_W + SPRITE_R * 2
    if (p.x > CANVAS_W + SPRITE_R) p.x -= CANVAS_W + SPRITE_R * 2
    if (p.y < -SPRITE_R) p.y += CANVAS_H + SPRITE_R * 2
    if (p.y > CANVAS_H + SPRITE_R) p.y -= CANVAS_H + SPRITE_R * 2
  }

  // decay fields
  for (let i = 0; i < brightnessField.length; i++) {
    brightnessField[i] = brightnessField[i]! * FIELD_DECAY
    blueField[i] = blueField[i]! * (FIELD_DECAY * 0.92)
  }

  // splat particles onto gold field
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    splatFieldStamp(brightnessField, p.x, p.y, particleStamp, 1.0)
  }

  // splat attractors
  splatFieldStamp(brightnessField, a1x, a1y, largeAttractorStamp, 1.0)
  splatFieldStamp(brightnessField, a2x, a2y, smallAttractorStamp, 1.0)

  // splat mouse onto blue field for color contrast
  if (mouse.active) {
    splatFieldStamp(blueField, mouse.canvasX, mouse.canvasY, mouseStamp, 1.2)
    // also add mouse glow to main field
    splatFieldStamp(brightnessField, mouse.canvasX, mouse.canvasY, mouseStamp, 0.8)
  }

  // mouse trail: splat along velocity vector for smoother trails
  if (mouse.active) {
    const dx = mouse.canvasX - mouse.prevX
    const dy = mouse.canvasY - mouse.prevY
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 2) {
      const steps = Math.min(6, Math.floor(len / 3))
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1)
        const tx = mouse.prevX + dx * t
        const ty = mouse.prevY + dy * t
        splatFieldStamp(blueField, tx, ty, smallAttractorStamp, 0.6)
        splatFieldStamp(brightnessField, tx, ty, smallAttractorStamp, 0.4)
      }
    }
  }
  mouse.prevX = mouse.canvasX
  mouse.prevY = mouse.canvasY

  // render ASCII rows
  for (let row = 0; row < ROWS; row++) {
    let html = ''
    const fieldRowStart = row * FIELD_OVERSAMPLE * FIELD_COLS
    for (let col = 0; col < COLS; col++) {
      const fieldColStart = col * FIELD_OVERSAMPLE

      // sample brightness from oversampled field
      let goldBright = 0
      let blueBright = 0
      for (let sy = 0; sy < FIELD_OVERSAMPLE; sy++) {
        const sampleRow = fieldRowStart + sy * FIELD_COLS + fieldColStart
        for (let sx = 0; sx < FIELD_OVERSAMPLE; sx++) {
          goldBright += brightnessField[sampleRow + sx]!
          blueBright += blueField[sampleRow + sx]!
        }
      }
      const samples = FIELD_OVERSAMPLE * FIELD_OVERSAMPLE
      goldBright = goldBright / samples
      blueBright = blueBright / samples

      const totalBright = Math.min(1, goldBright + blueBright)
      const brightByte = Math.min(255, (totalBright * 255) | 0)

      if (brightByte < 5) {
        html += ' '
        continue
      }

      const entry = brightnessLookup[brightByte]!
      // choose gold or blue based on which field dominates
      if (blueBright > goldBright * 0.6) {
        html += entry.blueHtml
      } else {
        html += entry.goldHtml
      }
    }
    rowNodes[row]!.innerHTML = html
  }

  const frameMs = performance.now() - t0
  frameCount++
  if (frameCount % 10 === 0) {
    hudEl.textContent = `${COLS}x${ROWS} | ${frameMs.toFixed(1)}ms`
  }

  requestAnimationFrame(render)
}

requestAnimationFrame(render)
