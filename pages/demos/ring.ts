import { prepareWithSegments } from '../../src/layout.ts'

const COLS = 45
const ROWS = 64
const N = COLS * ROWS

const CENTER_X = Math.floor(COLS / 2)
const CENTER_Y = Math.floor(ROWS * 0.54)

const RING_RX = 12
const RING_RY = 7
const HOLE_RX = 5.6
const HOLE_RY = 2.9

const SUBTITLE_ROW = 8
const FINAL_ROW = 6
const CLOSING_ROW = 8

const RING_CHARS = '.,-~:;=!*#$@'
const EDGE_CHARS = 'oO0@'
const BURST_CHARS = '*+x.o~'
const BREATH_CHARS = ':.`oO'
const INNER_CHARS = 'oO0@'
const NOISE_CHARS = '.`,:;'
const VINE_BY_OCT = ['-', '\\', '|', '/', '-', '\\', '|', '/']
const CURVE_CHARS = '()'
const SHUTDOWN_CHARS = '=~oO0'

const SCRIPT_LINES = [
  '......',
  '言葉, 落ちる',
  '穴の縁',
  '蔦, 巻いていく',
  '空洞を, 抱く輪',
  '呼吸',
  '光ではない. でも, 柔らかい',
  '何も埋めないまま. ただ, 上へ',
]

const SCRIPT_CN = [
  '',
  '(话语，坠落)',
  '(洞的边缘)',
  '(藤蔓，缠绕着)',
  '(抱住空洞的环)',
  '(呼吸)',
  '(不是光，但很柔软)',
  '(什么都不填满，只是向上)',
]

const LINE_TIMING: [number, number, number][] = [
  [0.2, 0.65, 0.2],
  [1.45, 1.55, 0.25],
  [3.85, 0.78, 0.25],
  [5.2, 1.4, 0.25],
  [7.55, 1.85, 0.35],
  [10.3, 0.45, 0],
  [11.1, 2.2, 1.4],
  [13.85, 2.45, 1.6],
]

const FALLING_LINES = 5
const BREATH_LINE = 5
const FINAL_LINE = 6
const CLOSING_LINE = 7

const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'

function isCJK(code: number): boolean {
  return (code >= 0x2E80 && code <= 0x9FFF) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFF00 && code <= 0xFF60) ||
    (code >= 0x3000 && code <= 0x303F) ||
    (code >= 0x3040 && code <= 0x309F) ||
    (code >= 0x30A0 && code <= 0x30FF)
}

function visualWidth(text: string): number {
  let width = 0
  for (let i = 0; i < text.length; i++) width += isCJK(text.charCodeAt(i)) ? 2 : 1
  return width
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

function esc(c: string): string {
  if (c === '<') return '&lt;'
  if (c === '>') return '&gt;'
  if (c === '&') return '&amp;'
  return c
}

function h(n: number): number {
  return ((n * 2654435761) >>> 0) / 4294967296
}

const prepChars = new Set(
  RING_CHARS + EDGE_CHARS + BURST_CHARS + BREATH_CHARS + INNER_CHARS + NOISE_CHARS +
  VINE_BY_OCT.join('') + CURVE_CHARS + SHUTDOWN_CHARS +
  SCRIPT_LINES.join('') + SCRIPT_CN.join('')
)
for (const ch of prepChars) prepareWithSegments(ch, FONT)

const LEAF_POOL = SCRIPT_LINES.slice(1, 5).join('')
  .split('')
  .filter(ch => isCJK(ch.charCodeAt(0)))
  .join('')

const ringOcc = new Uint8Array(N)
const ringDepth = new Float32Array(N)
const ringLum = new Float32Array(N)
const ringEdge = new Uint8Array(N)

const cellCh: string[] = new Array(N).fill('')
const cellKind = new Uint8Array(N)
const cellBirth = new Float32Array(N)

interface Tip {
  x: number
  y: number
  theta: number
  phase: number
  age: number
  energy: number
  cellsSinceLeaf: number
  leafSpacing: number
  leafIdx: number
  alive: boolean
}

const tips: Tip[] = []
let leafCounter = 0

interface Shockwave {
  radius: number
  speed: number
  width: number
  strength: number
}

const shockwaves: Shockwave[] = []

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  ch: string
  kind: 'burst' | 'breath'
}

const particles: Particle[] = []

interface TrailChar {
  ch: string
  x: number
  y: number
  opacity: number
}

const trails: TrailChar[] = []

interface GhostChar {
  ch: string
  x: number
  y: number
  tx: number
  ty: number
  opacity: number
}

const enum LineState { WAITING, TYPING, HOLDING, FALLING, DISSOLVING, GONE, BREATH, FADEIN, VISIBLE }

interface SubLine {
  text: string
  cn: string
  state: LineState
  appearAt: number
  voiceDur: number
  holdAfter: number
  typeSpeed: number
  typedCount: number
  cnTypedCount: number
  typeStartT: number
  y: number
  baseY: number
  fallVy: number
  dissolveT: number
  dissolveStartT: number
  ghosts: GhostChar[]
  lastTrailY: number
  breathT: number
  fadeInT: number
}

function makeLine(text: string, cn: string, i: number): SubLine {
  const [appearAt, voiceDur, holdAfter] = LINE_TIMING[i]!
  return {
    text,
    cn,
    state: LineState.WAITING,
    appearAt,
    voiceDur,
    holdAfter,
    typeSpeed: text.length / Math.max(0.1, voiceDur),
    typedCount: 0,
    cnTypedCount: 0,
    typeStartT: 0,
    y: SUBTITLE_ROW,
    baseY: SUBTITLE_ROW,
    fallVy: 0,
    dissolveT: 0,
    dissolveStartT: 0,
    ghosts: [],
    lastTrailY: SUBTITLE_ROW,
    breathT: 0,
    fadeInT: 0,
  }
}

const lines = SCRIPT_LINES.map((text, i) => makeLine(text, SCRIPT_CN[i]!, i))

let organismEnergy = 0
let ringGlow = 0
let breathRadiance = 0
let shutdownT = 0

function angleToOctant(theta: number): number {
  const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return Math.round(t / (Math.PI / 4)) % 8
}

function putCell(x: number, y: number, ch: string, kind: number, s: number): boolean {
  if (x < 1 || x >= COLS - 1 || y < 1 || y >= ROWS - 1) return false
  const idx = y * COLS + x
  if (cellCh[idx] !== '') return false

  const w = isCJK(ch.charCodeAt(0)) ? 2 : 1
  if (w === 2) {
    if (x + 1 >= COLS - 1) return false
    if (cellCh[idx + 1] !== '') return false
  }

  cellCh[idx] = ch
  cellKind[idx] = kind
  cellBirth[idx] = s
  if (w === 2) {
    cellCh[idx + 1] = '\t'
    cellKind[idx + 1] = 9
    cellBirth[idx + 1] = s
  }
  return true
}

function spawnTip(x: number, y: number, theta: number, energy: number): void {
  tips.push({
    x,
    y,
    theta,
    phase: Math.random() * Math.PI * 2,
    age: 0,
    energy,
    cellsSinceLeaf: 0,
    leafSpacing: 3 + Math.floor(Math.random() * 3),
    leafIdx: leafCounter++,
    alive: true,
  })
}

function placeLeafNear(x: number, y: number, kind: number, s: number, leafIdx: number): void {
  const ch = LEAF_POOL[leafIdx % LEAF_POOL.length]!
  const spots = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const
  for (let i = 0; i < spots.length; i++) {
    const [dx, dy] = spots[i]!
    if (putCell(x + dx, y + dy, ch, kind, s)) return
  }
}

function stepTip(tip: Tip, s: number): void {
  if (!tip.alive) return

  tip.age++
  const wobble = Math.sin(tip.age * 0.18 + tip.phase) * 0.22
  const jitter = (Math.random() - 0.5) * 0.04
  const climbBias = tip.x < CENTER_X ? 0.01 : -0.01
  const prevOct = angleToOctant(tip.theta)
  tip.theta += wobble + jitter + climbBias

  const oct = angleToOctant(tip.theta)
  const nx = tip.x + (oct === 0 || oct === 1 || oct === 7 ? 1 : oct === 3 || oct === 4 || oct === 5 ? -1 : 0)
  const ny = tip.y + (oct === 1 || oct === 2 || oct === 3 ? 1 : oct === 5 || oct === 6 || oct === 7 ? -1 : 0)

  if (nx < 1 || nx >= COLS - 1 || ny < 1 || ny >= ROWS - 1) {
    tip.alive = false
    return
  }

  const nextIdx = ny * COLS + nx
  if (cellCh[nextIdx] !== '') {
    placeLeafNear(nx, ny, 3, s, tip.leafIdx)
    tip.alive = false
    return
  }

  tip.cellsSinceLeaf++
  if (tip.cellsSinceLeaf >= tip.leafSpacing) {
    placeLeafNear(nx, ny, 2, s, tip.leafIdx)
    tip.cellsSinceLeaf = 0
    tip.leafIdx++
    tip.leafSpacing = 3 + Math.floor(Math.random() * 3)
  } else {
    const octDiff = Math.abs(oct - prevOct)
    const ch = octDiff >= 2 && octDiff <= 6
      ? CURVE_CHARS[Math.floor(Math.random() * CURVE_CHARS.length)]!
      : VINE_BY_OCT[oct]!
    putCell(nx, ny, ch, 1, s)
  }

  tip.x = nx
  tip.y = ny
  tip.energy -= 0.024

  if (tip.age > 7 && tip.age < 18 && Math.random() < 0.05 && tips.length < 18) {
    const side = Math.random() < 0.5 ? -1 : 1
    spawnTip(nx, ny, tip.theta + side * (Math.PI * 0.42), tip.energy * 0.62)
  }

  if (tip.energy <= 0) {
    placeLeafNear(nx, ny, 3, s, tip.leafIdx)
    tip.alive = false
  }
}

function ringAnchor(angle: number, scale = 1): { x: number, y: number } {
  return {
    x: CENTER_X + Math.round(Math.cos(angle) * RING_RX * scale),
    y: CENTER_Y + Math.round(Math.sin(angle) * RING_RY * scale),
  }
}

function sproutRimLeaves(startAngle: number, endAngle: number, count: number, s: number, finalLeaf = false): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const angle = startAngle + (endAngle - startAngle) * t + (Math.random() - 0.5) * 0.1
    const anchor = ringAnchor(angle, 1.02 + Math.random() * 0.1)
    placeLeafNear(anchor.x, anchor.y, finalLeaf ? 3 : 2, s, leafCounter++)
  }
}

function spawnImpactGrowth(lineIdx: number, s: number): void {
  if (lineIdx === 0) return

  const configs: Array<{ anchor: number, theta: number, energy: number }> = []
  if (lineIdx === 1) {
    configs.push({ anchor: -2.2, theta: -2.0, energy: 1.05 })
    configs.push({ anchor: -0.95, theta: -1.15, energy: 1.05 })
    sproutRimLeaves(-2.35, -0.82, 2, s)
  } else if (lineIdx === 2) {
    configs.push({ anchor: Math.PI, theta: -2.15, energy: 1.0 })
    configs.push({ anchor: 0, theta: -0.95, energy: 1.0 })
    sproutRimLeaves(-2.7, -0.4, 3, s)
  } else if (lineIdx === 3) {
    configs.push({ anchor: -2.45, theta: -2.0, energy: 1.18 })
    configs.push({ anchor: -1.57, theta: -1.57, energy: 1.0 })
    configs.push({ anchor: -0.72, theta: -1.1, energy: 1.18 })
    sproutRimLeaves(-2.8, -0.3, 4, s)
  } else {
    configs.push({ anchor: -2.55, theta: -2.05, energy: 1.28 })
    configs.push({ anchor: -1.9, theta: -1.74, energy: 1.12 })
    configs.push({ anchor: -1.25, theta: -1.38, energy: 1.12 })
    configs.push({ anchor: -0.58, theta: -1.02, energy: 1.28 })
    sproutRimLeaves(-3.0, -0.15, 6, s, true)
  }

  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i]!
    const anchor = ringAnchor(cfg.anchor, 1.04)
    putCell(anchor.x, anchor.y, VINE_BY_OCT[angleToOctant(cfg.theta)]!, 1, s)
    spawnTip(anchor.x, anchor.y, cfg.theta + (Math.random() - 0.5) * 0.14, cfg.energy)
  }
}

function computeRing(t: number): void {
  ringOcc.fill(0)
  ringDepth.fill(0)
  ringLum.fill(0)
  ringEdge.fill(0)

  const settled = Math.max(0, Math.min(1, (ringGlow - 0.35) / 0.45))
  const A = 1.02 + Math.sin(t * 0.23) * 0.08 + settled * 0.05
  const spin = (1 - settled) * 0.16 + settled * 0.04
  const B = 0.55 + t * spin
  const cA = Math.cos(A)
  const sA = Math.sin(A)
  const cB = Math.cos(B)
  const sB = Math.sin(B)
  const scaleX = 16 + settled * 1.4
  const scaleY = 10 + settled * 0.9

  for (let j = 0; j < 6.283; j += 0.07) {
    const ct = Math.cos(j)
    const st = Math.sin(j)
    for (let i = 0; i < 6.283; i += 0.028) {
      const sp = Math.sin(i)
      const cp = Math.cos(i)
      const h = ct + 2
      const denom = sp * h * sA + st * cA + 5
      if (denom <= 0.14) continue

      const D = 1 / denom
      const tt = sp * h * cA - st * sA
      const x = 0 | (CENTER_X + scaleX * D * (cp * h * cB - tt * sB))
      const y = 0 | (CENTER_Y + scaleY * D * (cp * h * sB + tt * cB))

      if (x < 1 || x >= COLS - 1 || y < 1 || y >= ROWS - 1) continue

      const idx = y * COLS + x
      if (D <= ringDepth[idx]!) continue
      ringDepth[idx] = D
      ringOcc[idx] = 1

      const rawLum =
        (st * sA - sp * ct * cA) * cB -
        sp * ct * sA -
        st * cA -
        cp * ct * sB
      ringLum[idx] = rawLum > 0 ? Math.min(1, rawLum / 1.15) : 0
    }
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = y * COLS + x
      if (ringOcc[idx] === 0) continue
      let openness = 0
      if (x === 0 || ringOcc[idx - 1] === 0) openness++
      if (x === COLS - 1 || ringOcc[idx + 1] === 0) openness++
      if (y === 0 || ringOcc[idx - COLS] === 0) openness++
      if (y === ROWS - 1 || ringOcc[idx + COLS] === 0) openness++
      ringEdge[idx] = openness
    }
  }
}

function shockAt(gx: number, gy: number): number {
  let value = 0
  const dx = gx - CENTER_X
  const dy = (gy - CENTER_Y) * 1.45
  const dist = Math.sqrt(dx * dx + dy * dy)
  for (let i = 0; i < shockwaves.length; i++) {
    const sh = shockwaves[i]!
    const delta = Math.abs(dist - sh.radius)
    if (delta > sh.width) continue
    value += (1 - delta / sh.width) * sh.strength
  }
  return value
}

function spawnBurst(weight: number): void {
  const count = 10 + Math.floor(weight * 16)
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.15 + Math.random() * (0.32 + weight * 0.22)
    particles.push({
      x: CENTER_X,
      y: CENTER_Y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.72,
      life: 1,
      ch: BURST_CHARS[Math.floor(Math.random() * BURST_CHARS.length)]!,
      kind: 'burst',
    })
  }
}

function spawnBreathParticles(count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1
    const speed = 0.08 + Math.random() * 0.18
    particles.push({
      x: CENTER_X + (Math.random() - 0.5) * 4,
      y: CENTER_Y + (Math.random() - 0.5) * 2,
      vx: Math.cos(angle) * speed * 0.45,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.3,
      ch: BREATH_CHARS[Math.floor(Math.random() * BREATH_CHARS.length)]!,
      kind: 'breath',
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx
    p.y += p.vy
    if (p.kind === 'burst') {
      p.vx *= 0.96
      p.vy *= 0.96
      p.life -= 0.024
    } else {
      p.vx *= 0.985
      p.vy -= 0.001
      p.life -= 0.012
    }
    if (p.life <= 0 || p.y < -3 || p.y > ROWS + 2) particles.splice(i, 1)
  }
}

function updateShockwaves(): void {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sh = shockwaves[i]!
    sh.radius += sh.speed
    sh.strength *= 0.965
    if (sh.strength <= 0.03) shockwaves.splice(i, 1)
  }
}

function updateOrganism(): void {
  ringGlow += (organismEnergy - ringGlow) * 0.035
  if (breathRadiance > 0) ringGlow += (1 - ringGlow) * 0.045
}

function spawnGhostsFromLine(line: SubLine, idx: number): void {
  line.ghosts = []
  const offsets = charOffsets(line.text)
  const startAngle = -2.55 + idx * 0.22
  const endAngle = -0.55 - idx * 0.08
  for (let i = 0; i < line.text.length; i++) {
    const t = line.text.length <= 1 ? 0.5 : i / (line.text.length - 1)
    const angle = startAngle + (endAngle - startAngle) * t + (Math.random() - 0.5) * 0.12
    const anchor = ringAnchor(angle, 0.78 + Math.random() * 0.38)
    line.ghosts.push({
      ch: line.text[i]!,
      x: CENTER_X + offsets[i]! * 0.12,
      y: CENTER_Y,
      tx: anchor.x,
      ty: anchor.y,
      opacity: 0.78,
    })
  }
}

function updateGhosts(line: SubLine, drift: number): void {
  for (let i = 0; i < line.ghosts.length; i++) {
    const gc = line.ghosts[i]!
    gc.x += (gc.tx - gc.x) * 0.06 + (Math.random() - 0.5) * drift
    gc.y += (gc.ty - gc.y) * 0.06 + (Math.random() - 0.5) * drift
    gc.opacity *= 0.992
  }
}

function updateLines(s: number): void {
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!
    switch (line.state) {
      case LineState.WAITING:
        if (s >= line.appearAt) {
          if (idx === BREATH_LINE) {
            line.state = LineState.BREATH
            line.typeStartT = s
            line.breathT = 0
          } else if (idx >= FINAL_LINE) {
            line.state = LineState.FADEIN
            line.typeStartT = s
            line.fadeInT = 0
          } else {
            line.state = LineState.TYPING
            line.typeStartT = s
            line.typedCount = 0
            line.cnTypedCount = 0
          }
        }
        break
      case LineState.TYPING: {
        const elapsed = s - line.typeStartT
        line.typedCount = Math.min(line.text.length, Math.floor(elapsed * line.typeSpeed))
        const cnSpeed = line.cn.length / Math.max(0.1, line.voiceDur)
        line.cnTypedCount = Math.min(line.cn.length, Math.floor(elapsed * cnSpeed))
        if (line.typedCount >= line.text.length) line.state = LineState.HOLDING
        break
      }
      case LineState.HOLDING:
        line.cnTypedCount = line.cn.length
        if (s >= line.typeStartT + line.voiceDur + line.holdAfter) {
          line.state = LineState.FALLING
          line.fallVy = 0.28
          line.y = line.baseY
          line.lastTrailY = line.baseY
        }
        break
      case LineState.FALLING: {
        const gravity = idx === FALLING_LINES - 1 ? 21.5 : 15.5
        const dt = 1 / 60
        line.fallVy += gravity * dt
        line.y += line.fallVy * dt * 60

        if (Math.floor(line.y) >= line.lastTrailY + 2) {
          line.lastTrailY = Math.floor(line.y)
          const vw = visualWidth(line.text)
          const sx = Math.floor((COLS - vw) / 2)
          const offsets = charOffsets(line.text)
          for (let i = 0; i < line.text.length; i++) {
            if (Math.random() > 0.45) continue
            trails.push({
              ch: line.text[i]!,
              x: sx + offsets[i]!,
              y: line.lastTrailY,
              opacity: 0.36,
            })
          }
        }

        if (line.y >= CENTER_Y) {
          line.y = CENTER_Y
          line.state = LineState.DISSOLVING
          line.dissolveStartT = s
          line.dissolveT = 0
          const impactWeight = idx === 0 ? 0.18 : 0.58 + line.text.length * 0.04
          organismEnergy = Math.min(1, organismEnergy + (idx === 0 ? 0.04 : 0.11 + line.text.length * 0.017))
          shockwaves.push({
            radius: 0,
            speed: 1.6 + idx * 0.15,
            width: 2.6 + idx * 0.2,
            strength: 0.8 + idx * 0.07,
          })
          spawnBurst(impactWeight)
          spawnGhostsFromLine(line, idx)
          spawnImpactGrowth(idx, s)
        }
        break
      }
      case LineState.DISSOLVING:
        line.dissolveT = Math.min(1, (s - line.dissolveStartT) / 1.8)
        updateGhosts(line, 0.04)
        if (line.dissolveT >= 1) line.state = LineState.GONE
        break
      case LineState.GONE:
        updateGhosts(line, 0.02)
        break
      case LineState.BREATH:
        line.breathT = Math.min(1, (s - line.typeStartT) / 3)
        breathRadiance = line.breathT
        if (line.breathT > 0.12 && line.breathT < 0.96 && Math.random() < 0.26) {
          spawnBreathParticles(2 + (Math.random() < 0.35 ? 1 : 0))
        }
        if (line.breathT >= 1) line.state = LineState.VISIBLE
        break
      case LineState.FADEIN: {
        line.fadeInT = Math.min(1, (s - line.typeStartT) / 2)
        const cnSpeed = line.cn.length / Math.max(0.1, line.voiceDur)
        line.cnTypedCount = Math.min(line.cn.length, Math.floor((s - line.typeStartT) * cnSpeed))
        if (line.fadeInT >= 1) line.state = LineState.VISIBLE
        break
      }
      case LineState.VISIBLE:
        if (idx === BREATH_LINE) breathRadiance = 1
        line.cnTypedCount = line.cn.length
        break
    }
  }

  for (let i = trails.length - 1; i >= 0; i--) {
    trails[i]!.opacity -= 0.013
    if (trails[i]!.opacity <= 0) trails.splice(i, 1)
  }
}

function cellClass(idx: number, s: number): string {
  const age = s - cellBirth[idx]!
  const kind = cellKind[idx]
  if (kind === 3) {
    if (age < 0.65) return `fl${Math.max(1, Math.min(4, Math.ceil((1 - age / 0.65) * 4 + 0.5)))}`
    if (age < 2.5) return 'fl2'
    return 'fl1'
  }
  if (kind === 2) {
    if (age < 0.5) return `lf${Math.max(2, Math.min(4, Math.ceil((1 - age / 0.5) * 4)))}`
    return 'lf2'
  }
  if (age < 0.4) return `vt${Math.max(1, Math.min(4, Math.ceil((1 - age / 0.4) * 4)))}`
  if (age < 1.8) {
    const t = (age - 0.4) / 1.4
    return `va${Math.max(1, Math.min(5, Math.ceil((1 - t * 0.5) * 5)))}`
  }
  const t = Math.min(1, (age - 1.8) / 3.2)
  return `vo${Math.max(1, Math.min(4, Math.ceil((1 - t * 0.6) * 4)))}`
}

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div')
  el.className = 'r'
  artEl.appendChild(el)
  rowEls.push(el)
}

const SHUTDOWN_START = 18.4
const SHUTDOWN_DUR = 2.4
const TOTAL_DUR = SHUTDOWN_START + SHUTDOWN_DUR + 1.3

let startTime: number | null = null
let lastTipStep = 0
const TIP_STEP_MS = 72

function resetWorld(): void {
  ringOcc.fill(0)
  ringDepth.fill(0)
  ringLum.fill(0)
  ringEdge.fill(0)
  cellCh.fill('')
  cellKind.fill(0)
  cellBirth.fill(0)
  tips.length = 0
  particles.length = 0
  trails.length = 0
  shockwaves.length = 0
  leafCounter = 0
  organismEnergy = 0
  ringGlow = 0
  breathRadiance = 0
  shutdownT = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    line.state = LineState.WAITING
    line.typedCount = 0
    line.cnTypedCount = 0
    line.typeStartT = 0
    line.y = line.baseY
    line.fallVy = 0
    line.dissolveT = 0
    line.dissolveStartT = 0
    line.ghosts = []
    line.lastTrailY = line.baseY
    line.breathT = 0
    line.fadeInT = 0
  }
}

function frame(now: number): void {
  if (startTime === null) {
    startTime = now
    lastTipStep = 0
  }

  const ms = now - startTime
  const s = ms / 1000

  if (s > TOTAL_DUR) {
    startTime = now
    lastTipStep = 0
    resetWorld()
    requestAnimationFrame(frame)
    return
  }

  updateLines(s)
  updateParticles()
  updateShockwaves()
  updateOrganism()

  if (ms - lastTipStep >= TIP_STEP_MS) {
    lastTipStep = ms
    for (let i = 0; i < tips.length; i++) if (tips[i]!.alive) stepTip(tips[i]!, s)
    if (tips.length > 40) {
      for (let i = tips.length - 1; i >= 0; i--) if (!tips[i]!.alive) tips.splice(i, 1)
    }
  }

  computeRing(s)

  if (s >= SHUTDOWN_START) shutdownT = Math.min(1, (s - SHUTDOWN_START) / SHUTDOWN_DUR)

  const fi = Math.floor(ms / 90)
  const textCells = new Map<string, { ch: string, cls: string }>()
  const cnCells = new Map<string, { ch: string, cls: string }>()
  const fadeCells = new Map<string, { ch: string, cls: string }>()
  const breathCells = new Map<string, { ch: string, cls: string }>()

  for (let idx = 0; idx < FALLING_LINES; idx++) {
    const line = lines[idx]!
    if (line.state === LineState.WAITING || line.state === LineState.GONE) continue

    const displayText = line.state === LineState.TYPING ? line.text.slice(0, line.typedCount) : line.text
    if (displayText.length === 0) continue

    const vw = visualWidth(line.text)
    const sx = Math.floor((COLS - vw) / 2)
    const offsets = charOffsets(displayText)
    const row = Math.floor(line.y)
    if (row < 0 || row >= ROWS) continue

    for (let i = 0; i < displayText.length; i++) {
      const gx = sx + offsets[i]!
      if (gx < 0 || gx >= COLS) continue
      const ch = displayText[i]!
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      let cls: string
      if (line.state === LineState.TYPING) {
        const charAge = (s - line.typeStartT) * line.typeSpeed - i
        cls = `s${Math.max(1, Math.min(6, Math.ceil(Math.min(1, Math.max(0, charAge * 1.5)) * 6)))}`
      } else if (line.state === LineState.HOLDING) {
        cls = 's6'
      } else if (line.state === LineState.FALLING) {
        const fade = Math.min(1, (line.y - line.baseY) / (CENTER_Y - line.baseY))
        cls = `ft${Math.max(1, Math.min(5, Math.ceil((1 - fade * 0.45) * 5)))}`
      } else if (line.state === LineState.DISSOLVING) {
        cls = `ds${Math.max(1, Math.min(4, Math.ceil((1 - line.dissolveT) * 4)))}`
      } else {
        continue
      }
      textCells.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) textCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }

    if (line.cn && line.cnTypedCount > 0 && (line.state === LineState.TYPING || line.state === LineState.HOLDING)) {
      const cnText = line.cn.slice(0, line.cnTypedCount)
      const cnVw = visualWidth(line.cn)
      const cnSx = Math.floor((COLS - cnVw) / 2)
      const cnOffsets = charOffsets(cnText)
      for (let i = 0; i < cnText.length; i++) {
        const gx = cnSx + cnOffsets[i]!
        const gy = row + 1
        if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
        const ch = cnText[i]!
        const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        cnCells.set(`${gx},${gy}`, { ch, cls: 'cn' })
        if (cw === 2) cnCells.set(`${gx + 1},${gy}`, { ch: '', cls: '' })
      }
    }
  }

  const breathLine = lines[BREATH_LINE]!
  if (breathLine.state === LineState.BREATH || breathLine.state === LineState.VISIBLE) {
    const row = CENTER_Y - 1
    const brightness = breathLine.state === LineState.VISIBLE ? 1 : breathLine.breathT
    const vw = visualWidth(breathLine.text)
    const sx = Math.floor((COLS - vw) / 2)
    const offsets = charOffsets(breathLine.text)
    for (let i = 0; i < breathLine.text.length; i++) {
      const gx = sx + offsets[i]!
      const ch = breathLine.text[i]!
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      breathCells.set(`${gx},${row}`, { ch, cls: `br${Math.max(1, Math.min(5, Math.ceil(brightness * 5)))}` })
      if (cw === 2) breathCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }
  }

  for (const idx of [FINAL_LINE, CLOSING_LINE]) {
    const line = lines[idx]!
    if (line.state !== LineState.FADEIN && line.state !== LineState.VISIBLE) continue
    const row = idx === FINAL_LINE ? FINAL_ROW : CLOSING_ROW
    const brightness = line.state === LineState.VISIBLE ? 1 : line.fadeInT
    const vw = visualWidth(line.text)
    const sx = Math.floor((COLS - vw) / 2)
    const offsets = charOffsets(line.text)
    for (let i = 0; i < line.text.length; i++) {
      const gx = sx + offsets[i]!
      const ch = line.text[i]!
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      fadeCells.set(`${gx},${row}`, { ch, cls: `fs${Math.max(1, Math.min(5, Math.ceil(brightness * 5)))}` })
      if (cw === 2) fadeCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }
    if (line.cn && line.cnTypedCount > 0) {
      const cnText = line.cn.slice(0, line.cnTypedCount)
      const cnVw = visualWidth(line.cn)
      const cnSx = Math.floor((COLS - cnVw) / 2)
      const cnOffsets = charOffsets(cnText)
      const cnRow = row + 1
      for (let i = 0; i < cnText.length; i++) {
        const gx = cnSx + cnOffsets[i]!
        const ch = cnText[i]!
        const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        fadeCells.set(`${gx},${cnRow}`, { ch, cls: 'cn' })
        if (cw === 2) fadeCells.set(`${gx + 1},${cnRow}`, { ch: '', cls: '' })
      }
    }
  }

  const trailCells = new Map<string, { ch: string, opacity: number }>()
  for (let i = 0; i < trails.length; i++) {
    const tr = trails[i]!
    const key = `${Math.round(tr.x)},${Math.round(tr.y)}`
    const prev = trailCells.get(key)
    if (!prev || tr.opacity > prev.opacity) trailCells.set(key, { ch: tr.ch, opacity: tr.opacity })
  }

  const ghostCells = new Map<string, { ch: string, opacity: number }>()
  for (let i = 0; i < lines.length; i++) {
    const ghosts = lines[i]!.ghosts
    for (let j = 0; j < ghosts.length; j++) {
      const gc = ghosts[j]!
      if (gc.opacity < 0.03) continue
      const key = `${Math.round(gc.x)},${Math.round(gc.y)}`
      const prev = ghostCells.get(key)
      if (!prev || gc.opacity > prev.opacity) ghostCells.set(key, { ch: gc.ch, opacity: gc.opacity })
    }
  }

  const particleCells = new Map<string, { ch: string, life: number, kind: string }>()
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    const gx = Math.round(p.x)
    const gy = Math.round(p.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    const key = `${gx},${gy}`
    const prev = particleCells.get(key)
    if (!prev || p.life > prev.life) particleCells.set(key, { ch: p.ch, life: p.life, kind: p.kind })
  }

  for (let gy = 0; gy < ROWS; gy++) {
    if (shutdownT >= 1) {
      rowEls[gy]!.innerHTML = ''
      continue
    }

    let mappedGy = gy
    if (shutdownT > 0) {
      const squeeze = Math.max(0, 1 - shutdownT * shutdownT * 1.18)
      mappedGy = Math.round(CENTER_Y + (gy - CENTER_Y) * squeeze)
      if (shutdownT > 0.72) {
        if (gy === CENTER_Y) {
          let line = ''
          const brightness = 1 - (shutdownT - 0.72) / 0.28
          for (let gx = 0; gx < COLS; gx++) {
            const edgeFade = 1 - Math.abs(gx - CENTER_X) / CENTER_X * (1 - brightness)
            if (edgeFade > 0.1) {
              const lvl = Math.max(1, Math.min(4, Math.ceil(edgeFade * brightness * 4)))
              line += `<span class="rh${lvl}">${SHUTDOWN_CHARS[gx % SHUTDOWN_CHARS.length]!}</span>`
            } else {
              line += ' '
            }
          }
          rowEls[gy]!.innerHTML = line
          continue
        }
        if (Math.abs(gy - CENTER_Y) > Math.max(1, Math.floor((1 - shutdownT) * ROWS * 0.45))) {
          rowEls[gy]!.innerHTML = ''
          continue
        }
      }
    }

    if (mappedGy < 0 || mappedGy >= ROWS) {
      rowEls[gy]!.innerHTML = ''
      continue
    }

    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const idx = mappedGy * COLS + gx
      const key = `${gx},${mappedGy}`
      const seed = gx * 73 + mappedGy * 131

      const fc = fadeCells.get(key)
      if (fc !== undefined) {
        if (fc.ch === '') continue
        html += `<span class="${fc.cls}">${esc(fc.ch)}</span>`
        continue
      }

      const cc = cnCells.get(key)
      if (cc !== undefined) {
        if (cc.ch === '') continue
        html += `<span class="${cc.cls}">${esc(cc.ch)}</span>`
        continue
      }

      const tc = textCells.get(key)
      if (tc !== undefined) {
        if (tc.ch === '') continue
        html += `<span class="${tc.cls}">${esc(tc.ch)}</span>`
        continue
      }

      const bc = breathCells.get(key)
      if (bc !== undefined) {
        if (bc.ch === '') continue
        html += `<span class="${bc.cls}">${esc(bc.ch)}</span>`
        continue
      }

      const pc = particleCells.get(key)
      if (pc !== undefined) {
        const lvl = Math.max(1, Math.min(4, Math.ceil(pc.life * 4)))
        html += `<span class="${pc.kind === 'breath' ? `bp${lvl}` : `bs${lvl}`}">${esc(pc.ch)}</span>`
        continue
      }

      const tr = trailCells.get(key)
      if (tr && tr.opacity > 0.04) {
        html += `<span class="tr${Math.max(1, Math.min(4, Math.ceil(tr.opacity * 6)))}">${esc(tr.ch)}</span>`
        continue
      }

      const ch = cellCh[idx]
      if (ch) {
        if (ch === '\t') continue
        html += `<span class="${cellClass(idx, s)}">${esc(ch)}</span>`
        continue
      }

      const gc = ghostCells.get(key)
      if (gc && gc.opacity > 0.04) {
        html += `<span class="gh${Math.max(1, Math.min(3, Math.ceil(gc.opacity * 3)))}">${esc(gc.ch)}</span>`
        continue
      }

      if (ringOcc[idx] === 1) {
        const shock = shockAt(gx, mappedGy)
        const lum = ringLum[idx]!
        if (ringEdge[idx] > 0 && lum + shock + ringGlow * 0.35 > 0.22) {
          const lvl = Math.max(1, Math.min(4, Math.ceil(Math.min(1, lum * 0.8 + shock * 0.75 + ringGlow * 0.35) * 4)))
          html += `<span class="rh${lvl}">${EDGE_CHARS[Math.floor(h(seed + fi * 7) * EDGE_CHARS.length)]!}</span>`
        } else {
          const lvl = Math.max(1, Math.min(7, Math.ceil(Math.min(1, lum * 0.75 + ringGlow * 0.4 + shock * 0.55) * 7)))
          html += `<span class="rg${lvl}">${RING_CHARS[Math.floor(h(seed + fi * 5) * RING_CHARS.length)]!}</span>`
        }
        continue
      }

      const dx = (gx - CENTER_X) / HOLE_RX
      const dy = (mappedGy - CENTER_Y) / HOLE_RY
      const holeDist = dx * dx + dy * dy
      if (holeDist < 1.08) {
        const inner = Math.max(0, breathRadiance * (1 - holeDist / 1.08) * 1.2 + ringGlow * 0.1 - 0.02)
        if (inner > 0.03 && h(seed + fi * 9) < inner * 0.3) {
          const lvl = Math.max(1, Math.min(4, Math.ceil(inner * 4)))
          html += `<span class="in${lvl}">${INNER_CHARS[Math.floor(h(seed + fi * 13) * INNER_CHARS.length)]!}</span>`
          continue
        }
        html += ' '
        continue
      }

      const ex = (gx - CENTER_X) / (RING_RX + 6)
      const ey = (mappedGy - CENTER_Y) / (RING_RY + 8)
      const haloDist = ex * ex + ey * ey
      if (haloDist < 1.4 && ringGlow > 0.2) {
        const halo = Math.max(0, (1.4 - haloDist) * 0.18 * ringGlow + shockAt(gx, mappedGy) * 0.06)
        if (halo > 0.03 && h(seed + fi * 17) < halo) {
          const lvl = Math.max(1, Math.min(3, Math.ceil(halo * 4)))
          html += `<span class="mt${lvl}">${NOISE_CHARS[Math.floor(h(seed + fi * 29) * NOISE_CHARS.length)]!}</span>`
          continue
        }
      }

      const noiseBase = mappedGy < CENTER_Y - 10 ? 0.03 : 0.02
      if (h(seed + fi * 11) < noiseBase) {
        html += `<span class="n${1 + Math.floor(h(seed * 3) * 3)}">${NOISE_CHARS[Math.floor(h(seed + fi * 19) * NOISE_CHARS.length)]!}</span>`
      } else {
        html += ' '
      }
    }

    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
