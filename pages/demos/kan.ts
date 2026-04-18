// ============================================================
//  KAN 環 — pure ASCII donut, narrated build pipeline
//  9:16 portrait, ~17s (1.5s lead + 14.8s voice + 1s tail)
//  Rei voice: 点→線→環→光の環→胎→消える→環
//  Phase color palette drives donut + subtitle + breathing line
//  as one unified visual system — color IS the narrative arc.
// ============================================================

const CSS_W = 540
const CSS_H = 960
const DPR = 2

const FONT_PX = 16
const LINE_H = 18
const CHAR_W = 9.6
const FONT = `${FONT_PX}px "Cascadia Code","JetBrains Mono","SF Mono",Consolas,monospace`

const COLS = Math.floor(CSS_W / CHAR_W)
const ROWS = Math.floor(CSS_H / LINE_H)
const GRID_OX = (CSS_W - COLS * CHAR_W) / 2
const GRID_OY = (CSS_H - ROWS * LINE_H) / 2

const LUM_CHARS = '.,-~:;=!*#$@'

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d', { alpha: false })!
ctx.scale(DPR, DPR)
ctx.textBaseline = 'top'

const CELLS = COLS * ROWS
const zbuf = new Float32Array(CELLS)
const lumBuf = new Float32Array(CELLS)
const charIdx = new Int8Array(CELLS)
const noiseField = new Float32Array(CELLS)
for (let k = 0; k < CELLS; k++) noiseField[k] = Math.random()

const LEAD = 1.5

type PhaseKind = 'lead' | 'dot' | 'line' | 'ring' | 'full' | 'breath' | 'decay' | 'final' | 'fade'
type Tint = { r: number; g: number; b: number }

// Phase color palette — warm family with one cold break at "decay"
const PHASE_TINT: Record<PhaseKind, Tint> = {
  lead:   { r: 255, g: 245, b: 230 }, // cold white — birth
  dot:    { r: 255, g: 245, b: 230 },
  line:   { r: 235, g: 215, b: 185 }, // bone ivory — warmth starts
  ring:   { r: 225, g: 165, b: 95  }, // warm copper — coalescing
  full:   { r: 255, g: 130, b: 80  }, // blood gold — fully lit
  breath: { r: 255, g: 100, b: 60  }, // orange-red — peak heat
  decay:  { r: 180, g: 180, b: 200 }, // cold grey-blue — dissolution
  final:  { r: 255, g: 240, b: 210 }, // white-gold — return
  fade:   { r: 255, g: 240, b: 210 },
}

type Phase = {
  start: number
  end: number
  kind: PhaseKind
  jp?: string
  cn?: string
}

const TIMELINE: Phase[] = [
  { start: 0.0,                   end: LEAD,                   kind: 'lead' },
  { start: LEAD + 0.70,           end: LEAD + 1.40,            kind: 'dot',   jp: '点', cn: '一个点' },
  { start: LEAD + 1.40,           end: LEAD + 2.09,            kind: 'dot' },
  { start: LEAD + 2.09,           end: LEAD + 3.34,            kind: 'line',  jp: '線', cn: '光的线' },
  { start: LEAD + 3.34,           end: LEAD + 3.76,            kind: 'line' },
  { start: LEAD + 3.76,           end: LEAD + 5.10,            kind: 'ring',  jp: '環、回り始める', cn: '环，开始转' },
  { start: LEAD + 5.10,           end: LEAD + 5.49,            kind: 'ring' },
  { start: LEAD + 5.49,           end: LEAD + 8.13,            kind: 'full',  jp: '光の環。終わりがない、始まりもない', cn: '光的环。无终，亦无始' },
  { start: LEAD + 8.13,           end: LEAD + 8.56,            kind: 'full' },
  { start: LEAD + 8.56,           end: LEAD + 9.81,            kind: 'breath', jp: '胎、熱い胎。中で、何かが回る', cn: '子宫，热的子宫。里面，什么在转' },
  { start: LEAD + 9.81,           end: LEAD + 10.42,           kind: 'breath' },
  { start: LEAD + 10.42,          end: LEAD + 12.11,           kind: 'decay', jp: '消える。また、現れる', cn: '消失。又，出现' },
  { start: LEAD + 12.11,          end: LEAD + 13.47,           kind: 'decay' },
  { start: LEAD + 13.47,          end: LEAD + 13.77,           kind: 'final', jp: '環', cn: '环' },
  { start: LEAD + 13.77,          end: LEAD + 15.8,            kind: 'final', jp: '環', cn: '环' },
  { start: LEAD + 15.8,           end: LEAD + 16.8,            kind: 'fade' },
]
const TOTAL_SECONDS = LEAD + 16.8

function phaseAt(t: number): Phase {
  for (let i = TIMELINE.length - 1; i >= 0; i--) {
    if (t >= TIMELINE[i].start) return TIMELINE[i]
  }
  return TIMELINE[0]
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x }

// Smooth color interpolation between phase tints so the transition across
// phase boundaries is continuous, not a jump.
function tintAt(t: number): Tint {
  const blend = 0.35 // seconds of cross-fade before/after each phase boundary
  for (let i = 0; i < TIMELINE.length; i++) {
    const ph = TIMELINE[i]
    if (t >= ph.start && t < ph.end) {
      const base = PHASE_TINT[ph.kind]
      // Check if inside the blend window at start of this phase
      if (i > 0 && t < ph.start + blend) {
        const prev = PHASE_TINT[TIMELINE[i - 1].kind]
        const k = (t - ph.start) / blend
        return {
          r: prev.r + (base.r - prev.r) * k,
          g: prev.g + (base.g - prev.g) * k,
          b: prev.b + (base.b - prev.b) * k,
        }
      }
      return base
    }
  }
  return PHASE_TINT.fade
}

function computeTorusFrame(A: number, B: number, breath: number, thetaMax: number, phiMax: number): void {
  zbuf.fill(0)
  lumBuf.fill(0)
  charIdx.fill(-1)

  const cA = Math.cos(A), sA = Math.sin(A)
  const cB = Math.cos(B), sB = Math.sin(B)

  const K_X = COLS * 0.62 * breath
  const K_Y = K_X * (CHAR_W / LINE_H)
  const cx = COLS / 2
  const cy = ROWS / 2

  for (let j = 0; j <= thetaMax + 1e-6; j += 0.03) {
    const ct = Math.cos(j), st = Math.sin(j)
    for (let i = 0; i <= phiMax + 1e-6; i += 0.008) {
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

// Luminance-modulated color biased by the phase tint. Low lum -> darkened
// tint; high lum -> tint washed toward white (the "hot ridge" effect).
function lumToColor(lum: number, tint: Tint): string {
  let r: number, g: number, b: number, a: number
  if (lum > 0.8) {
    const t = (lum - 0.8) / 0.2
    // wash toward white, keep tint hint
    r = tint.r + (255 - tint.r) * t * 0.75
    g = tint.g + (255 - tint.g) * t * 0.75
    b = tint.b + (255 - tint.b) * t * 0.75
    a = 1
  } else if (lum > 0.45) {
    const t = (lum - 0.45) / 0.35
    const k = 0.75 + 0.25 * t
    r = tint.r * k
    g = tint.g * k
    b = tint.b * k
    a = 1
  } else if (lum > 0.18) {
    const t = (lum - 0.18) / 0.27
    const k = 0.38 + 0.38 * t
    r = tint.r * k
    g = tint.g * k
    b = tint.b * k
    a = 0.94
  } else {
    const t = lum / 0.18
    const k = 0.16 + 0.22 * t
    r = tint.r * k
    g = tint.g * k
    b = tint.b * k
    a = 0.82
  }
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`
}

function drawDonut(tint: Tint, globalAlpha: number, decayThresh: number): void {
  ctx.font = FONT
  for (let y = 0; y < ROWS; y++) {
    const yPx = GRID_OY + y * LINE_H
    const rb = y * COLS
    for (let x = 0; x < COLS; x++) {
      const idx = charIdx[rb + x]
      if (idx < 0) continue
      if (decayThresh > 0 && noiseField[rb + x] < decayThresh) continue
      const lum = lumBuf[rb + x]
      let col = lumToColor(lum, tint)
      if (globalAlpha < 1) {
        // parse "rgba(r,g,b,a)" and multiply a — avoids regex allocation
        const comma3 = col.lastIndexOf(',')
        const a = Number(col.slice(comma3 + 1, -1)) * globalAlpha
        col = col.slice(0, comma3 + 1) + a.toFixed(3) + ')'
      }
      ctx.fillStyle = col
      ctx.fillText(LUM_CHARS[idx], GRID_OX + x * CHAR_W, yPx)
    }
  }

  // bloom — warm halo tuned toward the tint
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.filter = 'blur(6px)'
  for (let y = 0; y < ROWS; y++) {
    const yPx = GRID_OY + y * LINE_H
    const rb = y * COLS
    for (let x = 0; x < COLS; x++) {
      const lum = lumBuf[rb + x]
      if (lum < 0.72) continue
      if (decayThresh > 0 && noiseField[rb + x] < decayThresh) continue
      const t2 = Math.min(1, (lum - 0.72) / 0.28)
      const alpha = (0.08 + 0.24 * t2) * globalAlpha
      // wash tint toward white for bloom
      const r = (tint.r + (255 - tint.r) * (0.4 + 0.5 * t2)) | 0
      const g = (tint.g + (255 - tint.g) * (0.3 + 0.4 * t2)) | 0
      const b = (tint.b + (255 - tint.b) * (0.2 + 0.3 * t2)) | 0
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
      ctx.fillRect(GRID_OX + x * CHAR_W - 2, yPx - 1, CHAR_W + 4, LINE_H + 2)
    }
  }
  ctx.restore()
}

function drawSingleDot(t: number, alpha: number, tint: Tint): void {
  const cxPx = GRID_OX + (COLS / 2) * CHAR_W
  const cyPx = GRID_OY + (ROWS / 2) * LINE_H
  const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 / 1.2)
  const a = alpha * pulse
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.filter = 'blur(4px)'
  ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${(0.4 * a).toFixed(3)})`
  ctx.fillRect(cxPx - 10, cyPx - 8, 24, 20)
  ctx.restore()
  ctx.font = FONT
  const hotR = (tint.r + (255 - tint.r) * 0.7) | 0
  const hotG = (tint.g + (255 - tint.g) * 0.6) | 0
  const hotB = (tint.b + (255 - tint.b) * 0.5) | 0
  ctx.fillStyle = `rgba(${hotR},${hotG},${hotB},${a.toFixed(3)})`
  ctx.fillText('@', cxPx - CHAR_W / 2, cyPx - LINE_H / 2)
}

// ---- subtitles ----
//
// Characters are first-class scene objects, not a UI overlay. They type in
// at the top of the grid, hold during their voice segment, then get pulled
// toward the donut center at the end of the phase and dissolve into it —
// the subtitle literally becomes part of the animation.

const SUB_JP_FONT = '600 28px "Noto Sans JP","Hiragino Sans",sans-serif'
const SUB_CN_FONT = '300 14px "Noto Sans SC","PingFang SC",sans-serif'
const JP_ROW_Y = 58
const CN_ROW_Y = JP_ROW_Y + 42

interface SubChar {
  ch: string
  font: string
  baseX: number     // start position (typed home)
  baseY: number
  destX: number     // end position (near donut surface)
  destY: number
  jitterPhase: number  // per-char phase for gentle float
  typeAt: number    // time this char fades in
  flyStartAt: number// time it starts flying toward donut
  flyDur: number    // fly+fade duration
  isJp: boolean
}

const subChars: SubChar[] = []

// Deterministic hash (same every frame call) so capture replays identically
function hash2(a: number, b: number): number {
  const x = Math.sin(a * 374761.39 + b * 668265.263) * 43758.5453
  return x - Math.floor(x)
}

interface SubSegment { jp?: string; cn?: string; start: number; end: number }

function buildSubSegments(): SubSegment[] {
  const segs: SubSegment[] = []
  let cur: SubSegment | null = null
  for (const ph of TIMELINE) {
    if (ph.jp || ph.cn) {
      if (cur && cur.jp === ph.jp && cur.cn === ph.cn) {
        cur.end = ph.end
      } else {
        if (cur) segs.push(cur)
        cur = { jp: ph.jp, cn: ph.cn, start: ph.start, end: ph.end }
      }
    } else if (cur) {
      // extend current segment through the following silent phase so the
      // text has time to hold before flying
      cur.end = ph.end
    }
  }
  if (cur) segs.push(cur)
  return segs
}

function buildSubChars(): void {
  subChars.length = 0
  const segs = buildSubSegments()
  const DONUT_CX = CSS_W / 2
  const DONUT_CY = CSS_H / 2

  for (let segIdx = 0; segIdx < segs.length; segIdx++) {
    const seg = segs[segIdx]
    const dur = seg.end - seg.start
    const typeDur = Math.min(dur * 0.5, 1.2)
    const flyDur = 0.6
    // Start flying 0.3s before phase end so chars are mostly gone by next seg
    const flyStart = seg.end - 0.3

    if (seg.jp) addLine(seg.jp, SUB_JP_FONT, JP_ROW_Y, seg.start, typeDur, flyStart, flyDur, true, segIdx, DONUT_CX, DONUT_CY)
    if (seg.cn) addLine(seg.cn, SUB_CN_FONT, CN_ROW_Y, seg.start + 0.08, Math.min(typeDur * 1.1, dur * 0.6), flyStart, flyDur, false, segIdx, DONUT_CX, DONUT_CY)
  }
}

function addLine(text: string, font: string, baseY: number, startT: number, typeDur: number, flyStart: number, flyDur: number, isJp: boolean, segIdx: number, donutCx: number, donutCy: number): void {
  ctx.font = font
  const chars = Array.from(text)  // handle surrogate pairs for CJK
  const widths: number[] = []
  let total = 0
  for (const ch of chars) {
    const w = ctx.measureText(ch).width
    widths.push(w)
    total += w
  }
  const startX = CSS_W / 2 - total / 2
  const charT = typeDur / Math.max(1, chars.length)
  let x = startX
  for (let i = 0; i < chars.length; i++) {
    // Destination: a point on a ring around the donut center. Each char
    // aims for its own "slot" so they stream in from different angles.
    const h = hash2(segIdx * 13 + (isJp ? 1 : 2), i)
    const angle = h * Math.PI * 2
    // Destination lands near/inside donut surface so it looks absorbed
    const r = 40 + hash2(i, segIdx) * 90
    subChars.push({
      ch: chars[i],
      font,
      baseX: x,
      baseY,
      destX: donutCx + Math.cos(angle) * r,
      destY: donutCy + Math.sin(angle) * r,
      jitterPhase: h * Math.PI * 2,
      typeAt: startT + i * charT,
      flyStartAt: flyStart,
      flyDur,
      isJp,
    })
    x += widths[i]
  }
}

function drawSubChars(t: number, tint: Tint): void {
  for (const c of subChars) {
    if (t < c.typeAt) continue
    const endT = c.flyStartAt + c.flyDur
    if (t > endT) continue

    let x: number, y: number, alpha: number
    if (t < c.flyStartAt) {
      // Typed in → gentle micro-float while holding
      const fadeIn = Math.min(1, (t - c.typeAt) / 0.18)
      const floatY = Math.sin(t * Math.PI * 2 / 1.4 + c.jitterPhase) * 1.2
      x = c.baseX
      y = c.baseY + floatY
      alpha = 0.95 * fadeIn
    } else {
      // Flying toward donut surface. Ease-in position so it accelerates as
      // it nears the ring (being "pulled in"); cubic fade so it vanishes
      // quickly as it arrives, not lingering outside the donut.
      const flyT = (t - c.flyStartAt) / c.flyDur
      const eased = flyT * flyT * (3 - 2 * flyT)  // smoothstep
      x = c.baseX + (c.destX - c.baseX) * eased
      y = c.baseY + (c.destY - c.baseY) * eased
      const fade = 1 - flyT
      alpha = fade * fade * fade * 0.95
    }

    if (alpha <= 0.01) continue
    ctx.font = c.font
    // JP gets a warm glow shadow, CN stays flat
    ctx.fillStyle = `rgba(${tint.r | 0},${tint.g | 0},${tint.b | 0},${alpha.toFixed(3)})`
    // center the glyph on its x (textAlign=left, we precomputed x as left edge)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(c.ch, x, y)
  }
}

function drawFrame(t: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CSS_W, CSS_H)

  const phase = phaseAt(t)
  const kind = phase.kind
  const tint = tintAt(t)
  const progress = clamp01((t - phase.start) / Math.max(1e-6, phase.end - phase.start))

  const A = 0.2 + t * 0.26
  const B = 0.1 + t * 0.18

  if (kind === 'lead') {
    drawSingleDot(t, 0.4 + 0.6 * clamp01(t / LEAD), tint)
  } else if (kind === 'dot') {
    drawSingleDot(t, 1, tint)
  } else if (kind === 'line') {
    const phiMax = Math.PI * 2 * clamp01(progress * 1.1)
    const breath = 1 + 0.035 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(A, B, breath, 0.0, phiMax)
    drawDonut(tint, 1, 0)
  } else if (kind === 'ring') {
    const thetaMax = Math.PI * 2 * clamp01(progress)
    const breath = 1 + 0.035 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(A, B, breath, thetaMax, Math.PI * 2)
    drawDonut(tint, 1, 0)
  } else if (kind === 'full') {
    const breath = 1 + 0.04 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(A, B, breath, Math.PI * 2, Math.PI * 2)
    drawDonut(tint, 1, 0)
  } else if (kind === 'breath') {
    const breath = 1 + 0.08 * Math.sin(t * Math.PI * 2 / 0.9)
    computeTorusFrame(A, B, breath, Math.PI * 2, Math.PI * 2)
    drawDonut(tint, 1, 0)
  } else if (kind === 'decay') {
    const breath = 1 + 0.05 * Math.sin(t * Math.PI * 2 / 1.1)
    computeTorusFrame(A, B, breath, Math.PI * 2, Math.PI * 2)
    const oscillate = Math.sin(progress * Math.PI * 2.2)
    const decayThresh = 0.55 * Math.max(0, oscillate)
    drawDonut(tint, 1, decayThresh)
  } else if (kind === 'final') {
    const freezeT = phase.start
    const freezeA = 0.2 + freezeT * 0.26
    const freezeB = 0.1 + freezeT * 0.18
    const breath = 1 + 0.025 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(freezeA, freezeB, breath, Math.PI * 2, Math.PI * 2)
    drawDonut(tint, 1, 0)
  } else if (kind === 'fade') {
    const freezeT = phase.start
    const freezeA = 0.2 + freezeT * 0.26
    const freezeB = 0.1 + freezeT * 0.18
    computeTorusFrame(freezeA, freezeB, 1, Math.PI * 2, Math.PI * 2)
    drawDonut(tint, 1 - progress, 0)
  }

  drawSubChars(t, tint)
}

// Precompute subtitle characters once at startup (needs ctx for measureText)
buildSubChars()

// ---- runtime ----
let startTs = 0
let paused = false

function loop(now: number): void {
  if (startTs === 0) startTs = now
  const t = (now - startTs) / 1000
  if (t > TOTAL_SECONDS) startTs = now
  if (!paused) drawFrame(t)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

;(window as any).__kan = {
  reset() { startTs = 0 },
  setTime(sec: number) { startTs = performance.now() - sec * 1000 },
  drawAt(sec: number) { paused = true; drawFrame(sec) },
  pause() { paused = true },
  resume() { paused = false },
  get duration() { return TOTAL_SECONDS },
}

const audio = new Audio('/sound/voice/kan/rei_kan.wav')
audio.preload = 'auto'
document.body.addEventListener('click', () => {
  startTs = 0
  audio.currentTime = 0
  audio.play().catch(() => {})
}, { once: true })
