import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  LOTUS FALL - vertical falling-subtitle ASCII animation
//  Portrait 45x64, ~22s loop
//
//  Narrative: text falls into water -> energy accumulates ->
//  lotus grows -> light radiates up -> stillness -> TV shutdown
// ============================================================

const COLS = 45
const ROWS = 64
const WATER_ROW = Math.floor(ROWS * 0.44) // ~28

// ---- characters ----

const SURFACE_CHARS = '~=~-~=~_~-'
const RIPPLE_STRONG = '~oO*@&'
const RIPPLE_WEAK = '~-._`\''
const SPLASH_CHARS = '*+x.o~'
const NOISE_CHARS = '&*$%^#@!?~+:;.,`'
const LIGHT_CHARS = '|:!*+.\'`'
const STEM_CHARS = '|!I:'
const PETAL_CHARS = '(){}<>@*'
const BUD_CHARS = 'oO0@'

// ---- script (GT-style short phrases) ----
// Lines 0-4 FALL. Line 5 "light" radiates UP. Line 6 fades in. Line 7 closing fades in.

const SCRIPT_LINES = [
  '......',
  '\u96E8,\u51B7\u305F\u3044\u96E8',                 // ame, tsumetai ame
  '\u6C34\u306E\u4E2D',                                 // mizu no naka
  '\u4F55\u304B,\u52D5\u304F\u7269',                   // nanika, ugoku mono
  '\u75DB\u307F,\u305D\u306E\u5148',                   // itami, sono saki
  '\u5149',                                               // hikari
  '\u5149\u304C\u3042\u308C\u3070,\u96E8\u306F\u6B62\u3080', // hikari ga areba, ame wa yamu
  '\u3067\u3082,\u307E\u305F\u964D\u308B\u3002\u305D\u308C\u3067\u3044\u3044\u3002', // demo, mata furu. sore de ii.
]

// Chinese subtitles in parentheses
const SCRIPT_CN = [
  '',
  '(\u96E8\uFF0C\u51B7\u51B7\u7684\u96E8)',           // (雨，冷冷的雨)
  '(\u6C34\u4E2D)',                                       // (水中)
  '(\u4EC0\u4E48\uFF0C\u5728\u52A8\u7684\u4E1C\u897F)', // (什么，在动的东西)
  '(\u75DB\uFF0C\u5728\u90A3\u4E4B\u540E)',             // (痛，在那之后)
  '(\u5149)',                                               // (光)
  '(\u6709\u5149\u7684\u8BDD\uFF0C\u96E8\u4F1A\u505C)', // (有光的话，雨会停)
  '(\u4F46\u662F\uFF0C\u8FD8\u4F1A\u4E0B\u3002\u8FD9\u6837\u5C31\u597D\u3002)', // (但是，还会下。这样就好。)
]

// [appearAt_s, voiceDuration_s, holdAfter_s]
// Segment timings from silence detection (+1.5s lead)
const LINE_TIMING: [number, number, number][] = [
  [0.2,  0.5,  0.2],      // "......" no voice, quick fall
  [1.5,  1.68,  0.2],     // seg1: 1.5-3.18
  [3.94, 0.71,  0.2],     // seg2: 3.94-4.65
  [5.29, 1.53,  0.2],     // seg3: 5.29-6.82
  [7.57, 1.62,  0.2],     // seg4: 7.57-9.19 (heaviest)
  [10.01, 0.35, 0],       // seg5: 10.01-10.36 "light" (radiate)
  [11.12, 2.16, 1.5],     // seg6: 11.12-13.28 (fade in, stay)
  [13.89, 2.39, 1.5],     // seg7: 13.89-16.28 (closing fade in)
]

const FALLING_LINES = 5   // 0-4 fall
const LIGHT_LINE = 5
const FINAL_LINE = 6
const CLOSING_LINE = 7

// ---- pretext ----

const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'
const allChars = new Set(
  SURFACE_CHARS + RIPPLE_STRONG + RIPPLE_WEAK + SPLASH_CHARS +
  NOISE_CHARS + LIGHT_CHARS + STEM_CHARS + PETAL_CHARS + BUD_CHARS +
  SCRIPT_LINES.join('') + SCRIPT_CN.join('')
)
for (const ch of allChars) prepareWithSegments(ch, FONT)

// ---- CJK width ----

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
      const idx = dy * SIM_W + gx
      wave0[idx] = wave0[idx]! + strength * (1 - dist / (r + 1)) * (1 - dy * 0.2)
    }
  }
}

// ---- particles ----

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; ch: string; kind: 'splash' | 'light'
}
const particles: Particle[] = []

function spawnSplash(cx: number, width: number): void {
  const count = 8 + width * 2
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI
    const speed = 0.3 + Math.random() * 0.8
    particles.push({
      x: cx + (Math.random() - 0.5) * width * 0.8, y: WATER_ROW,
      vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
      vy: -Math.sin(angle) * speed * 0.6,
      life: 1.0, ch: SPLASH_CHARS[Math.floor(Math.random() * SPLASH_CHARS.length)]!,
      kind: 'splash',
    })
  }
}

function spawnLightRays(cx: number, flowerRow: number): void {
  for (let i = 0; i < 60; i++) {
    const spread = (Math.random() - 0.5) * 16
    particles.push({
      x: cx + spread, y: flowerRow - Math.random() * 2,
      vx: spread * 0.02, vy: -(0.3 + Math.random() * 0.7),
      life: 1.0, ch: LIGHT_CHARS[Math.floor(Math.random() * LIGHT_CHARS.length)]!,
      kind: 'light',
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx; p.y += p.vy
    if (p.kind === 'splash') { p.vy += 0.04; p.life -= 0.025 }
    else { p.vy *= 0.995; p.vx += (Math.random() - 0.5) * 0.02; p.life -= 0.012 }
    if (p.life <= 0 || p.y < -2) particles.splice(i, 1)
  }
}

// ---- trails ----

interface TrailChar { ch: string; x: number; y: number; opacity: number }
const trails: TrailChar[] = []

// ---- subtitle state machine ----

const enum LineState { WAITING, TYPING, HOLDING, FALLING, DISSOLVING, GONE, RADIATE, FADEIN, VISIBLE }

interface SubLine {
  text: string; cn: string; state: LineState
  appearAt: number; voiceDur: number; holdAfter: number; typeSpeed: number
  typedCount: number; cnTypedCount: number; typeStartT: number
  y: number; baseY: number; fallVy: number
  dissolveT: number; dissolveStartT: number
  ghostChars: { ch: string; x: number; y: number; opacity: number }[]
  lastTrailY: number; radiateT: number; fadeInT: number
}

const SUBTITLE_ROW = 8
// CN subtitle rendered one row below each JP line

function makeSubLine(text: string, cn: string, i: number): SubLine {
  const voiceDur = LINE_TIMING[i]![1]
  return {
    text, cn, state: LineState.WAITING,
    appearAt: LINE_TIMING[i]![0], voiceDur, holdAfter: LINE_TIMING[i]![2],
    typeSpeed: text.length / Math.max(0.1, voiceDur),
    typedCount: 0, cnTypedCount: 0, typeStartT: 0,
    y: SUBTITLE_ROW, baseY: SUBTITLE_ROW, fallVy: 0,
    dissolveT: 0, dissolveStartT: 0, ghostChars: [], lastTrailY: SUBTITLE_ROW,
    radiateT: 0, fadeInT: 0,
  }
}

const lines: SubLine[] = SCRIPT_LINES.map((t, i) => makeSubLine(t, SCRIPT_CN[i]!, i))

// ---- lotus state ----

let lotusEnergy = 0, lotusStemH = 0, lotusPetalR = 0, lotusBloomT = 0
let lightRadiance = 0, lightSpawned = false

// ---- TV shutdown ----

let shutdownT = 0  // 0 = normal, 0..1 = compressing, 1 = black

function updateLotus(): void {
  const targetStem = Math.min(10, Math.floor(lotusEnergy * 13))
  lotusStemH += (targetStem - lotusStemH) * 0.035
  if (lotusEnergy > 0.45) {
    const bp = Math.min(1, (lotusEnergy - 0.45) / 0.55)
    lotusPetalR += (bp * 4.5 - lotusPetalR) * 0.025
    lotusBloomT += (bp - lotusBloomT) * 0.03
  }
  if (lightRadiance > 0) {
    lotusStemH += (10 - lotusStemH) * 0.06
    lotusPetalR += (5.0 - lotusPetalR) * 0.05
    lotusBloomT += (1 - lotusBloomT) * 0.05
  }
}

// ---- update lines ----

function updateLines(s: number): void {
  for (let idx = 0; idx < lines.length; idx++) {
    const ln = lines[idx]!
    switch (ln.state) {
      case LineState.WAITING:
        if (s >= ln.appearAt) {
          if (idx === LIGHT_LINE) { ln.state = LineState.RADIATE; ln.typeStartT = s; ln.radiateT = 0 }
          else if (idx >= FINAL_LINE) { ln.state = LineState.FADEIN; ln.typeStartT = s; ln.fadeInT = 0 }
          else { ln.state = LineState.TYPING; ln.typeStartT = s; ln.typedCount = 0; ln.cnTypedCount = 0 }
        }
        break
      case LineState.TYPING: {
        const elapsed = s - ln.typeStartT
        ln.typedCount = Math.min(ln.text.length, Math.floor(elapsed * ln.typeSpeed))
        // CN types slightly behind
        const cnSpeed = ln.cn.length / Math.max(0.1, ln.voiceDur)
        ln.cnTypedCount = Math.min(ln.cn.length, Math.floor(Math.max(0, elapsed - 0.15) * cnSpeed))
        if (ln.typedCount >= ln.text.length) ln.state = LineState.HOLDING
        break
      }
      case LineState.HOLDING: {
        const typeEnd = ln.typeStartT + ln.voiceDur
        // keep CN typing if needed
        const cnSpeed = ln.cn.length / Math.max(0.1, ln.voiceDur)
        ln.cnTypedCount = Math.min(ln.cn.length, Math.floor(Math.max(0, s - ln.typeStartT - 0.15) * cnSpeed))
        if (s >= typeEnd + ln.holdAfter) {
          ln.state = LineState.FALLING; ln.fallVy = 0.3; ln.y = ln.baseY; ln.lastTrailY = ln.baseY
        }
        break
      }
      case LineState.FALLING: {
        const gravity = idx === FALLING_LINES - 1 ? 22.0 : 15.0
        const dt = 1 / 60
        ln.fallVy += gravity * dt; ln.y += ln.fallVy * dt * 60
        if (Math.floor(ln.y) >= ln.lastTrailY + 2) {
          ln.lastTrailY = Math.floor(ln.y)
          const vw = visualWidth(ln.text); const sx = Math.floor((COLS - vw) / 2); const offs = charOffsets(ln.text)
          for (let i = 0; i < ln.text.length; i++) {
            if (Math.random() > 0.4) continue
            trails.push({ ch: ln.text[i]!, x: sx + offs[i]!, y: ln.lastTrailY, opacity: 0.35 })
          }
        }
        if (ln.y >= WATER_ROW) {
          ln.y = WATER_ROW
          const cx = Math.floor(COLS / 2); const vw = visualWidth(ln.text)
          const mult = idx === FALLING_LINES - 1 ? 1.5 : 1.0
          waveSplash(cx, vw, (0.6 + vw * 0.05) * mult)
          spawnSplash(cx, Math.floor(vw * mult))
          lotusEnergy = Math.min(1.0, lotusEnergy + 0.14 + ln.text.length * 0.012)
          ln.state = LineState.DISSOLVING; ln.dissolveStartT = s; ln.dissolveT = 0
          const sx = Math.floor((COLS - vw) / 2); const offs = charOffsets(ln.text)
          ln.ghostChars = []
          for (let i = 0; i < ln.text.length; i++) {
            ln.ghostChars.push({ ch: ln.text[i]!, x: sx + offs[i]!, y: WATER_ROW + 1 + Math.random() * 3, opacity: 0.8 })
          }
        }
        break
      }
      case LineState.DISSOLVING: {
        ln.dissolveT = Math.min(1, (s - ln.dissolveStartT) / 2.0)
        for (const gc of ln.ghostChars) { gc.y += 0.02; gc.opacity *= 0.99; gc.x += (Math.random() - 0.5) * 0.1 }
        if (ln.dissolveT >= 1) ln.state = LineState.GONE
        break
      }
      case LineState.GONE:
        for (const gc of ln.ghostChars) { gc.y += 0.01; gc.opacity *= 0.995 }
        break
      case LineState.RADIATE: {
        ln.radiateT = Math.min(1, (s - ln.typeStartT) / 3.0); lightRadiance = ln.radiateT
        if (!lightSpawned && lotusBloomT > 0.3) {
          lightSpawned = true; spawnLightRays(Math.floor(COLS / 2), WATER_ROW - Math.floor(lotusStemH) - 1)
        }
        if (ln.radiateT > 0.1 && ln.radiateT < 0.9 && Math.random() < 0.15) {
          const cx = Math.floor(COLS / 2); const fr = WATER_ROW - Math.floor(lotusStemH) - 1
          particles.push({ x: cx + (Math.random() - 0.5) * 8, y: fr, vx: (Math.random() - 0.5) * 0.15,
            vy: -(0.15 + Math.random() * 0.3), life: 0.7 + Math.random() * 0.3,
            ch: LIGHT_CHARS[Math.floor(Math.random() * LIGHT_CHARS.length)]!, kind: 'light' })
        }
        if (ln.radiateT >= 1) ln.state = LineState.VISIBLE
        break
      }
      case LineState.FADEIN: {
        ln.fadeInT = Math.min(1, (s - ln.typeStartT) / 2.0)
        // CN types along
        const cnSpeed = ln.cn.length / Math.max(0.1, ln.voiceDur)
        ln.cnTypedCount = Math.min(ln.cn.length, Math.floor(Math.max(0, s - ln.typeStartT - 0.15) * cnSpeed))
        if (ln.fadeInT >= 1) ln.state = LineState.VISIBLE
        break
      }
      case LineState.VISIBLE:
        if (idx === LIGHT_LINE) lightRadiance = 1
        break
    }
  }
  for (let i = trails.length - 1; i >= 0; i--) {
    trails[i]!.opacity -= 0.012; if (trails[i]!.opacity <= 0) trails.splice(i, 1)
  }
}

// ---- helpers ----

function h(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string {
  if (c === '<') return '&lt;'; if (c === '>') return '&gt;'; if (c === '&') return '&amp;'; return c
}
function surfaceVis(s: number): number {
  if (s < 0.5) return 0; return Math.min(1, (s - 0.5) / 3.5)
}

// ---- DOM ----

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; artEl.appendChild(el); rowEls.push(el)
}

// ---- render ----

let startTime: number | null = null
const SHUTDOWN_START = 18.3  // 16.28 voice end + 2s buffer
const SHUTDOWN_DUR = 2.5
const TOTAL_DUR = SHUTDOWN_START + SHUTDOWN_DUR + 1.5  // + 1.5s black

function frame(now: number): void {
  if (startTime === null) startTime = now
  const ms = now - startTime; const s = ms / 1000

  if (s > TOTAL_DUR) {
    startTime = now; wave0.fill(0); wave1.fill(0)
    lotusEnergy = 0; lotusStemH = 0; lotusPetalR = 0; lotusBloomT = 0
    lightRadiance = 0; lightSpawned = false; shutdownT = 0
    particles.length = 0; trails.length = 0
    for (const ln of lines) {
      ln.state = LineState.WAITING; ln.typedCount = 0; ln.cnTypedCount = 0
      ln.y = ln.baseY; ln.fallVy = 0; ln.dissolveT = 0; ln.ghostChars = []
      ln.lastTrailY = ln.baseY; ln.radiateT = 0; ln.fadeInT = 0
    }
    requestAnimationFrame(frame); return
  }

  const fi = Math.floor(ms / 80); const sv = surfaceVis(s)
  updateLines(s); updateParticles(); updateLotus(); waveStep(); waveStep()

  // TV shutdown progress
  if (s >= SHUTDOWN_START) shutdownT = Math.min(1, (s - SHUTDOWN_START) / SHUTDOWN_DUR)

  // --- build cell maps (same as before but with CN support) ---

  const textCells = new Map<string, { ch: string; cls: string }>()
  const cnCells = new Map<string, { ch: string; cls: string }>()

  for (let idx = 0; idx < lines.length; idx++) {
    const ln = lines[idx]!
    if (ln.state === LineState.WAITING || ln.state === LineState.GONE) continue
    if (idx === LIGHT_LINE || idx >= FINAL_LINE) continue // rendered separately

    const displayText = ln.state === LineState.TYPING ? ln.text.slice(0, ln.typedCount) : ln.text
    if (displayText.length === 0) continue

    const vw = visualWidth(ln.text); const startX = Math.floor((COLS - vw) / 2)
    const offsets = charOffsets(displayText); const row = Math.floor(ln.y)
    if (row < 0 || row >= ROWS) continue

    for (let i = 0; i < displayText.length; i++) {
      const gx = startX + offsets[i]!; if (gx < 0 || gx >= COLS) continue
      const ch = displayText[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      let cls: string
      if (ln.state === LineState.TYPING || ln.state === LineState.HOLDING) {
        if (ln.state === LineState.TYPING) {
          const charAge = (s - ln.typeStartT) * ln.typeSpeed - i
          cls = `s${Math.max(1, Math.min(6, Math.ceil(Math.min(1, Math.max(0, charAge * 1.5)) * 6)))}`
        } else cls = 's6'
      } else if (ln.state === LineState.FALLING) {
        const fade = Math.min(1, (ln.y - ln.baseY) / (WATER_ROW - ln.baseY))
        cls = `ft${Math.max(1, Math.min(5, Math.ceil((1 - fade * 0.5) * 5)))}`
      } else if (ln.state === LineState.DISSOLVING) {
        cls = `ds${Math.max(1, Math.min(4, Math.ceil((1 - ln.dissolveT) * 4)))}`
      } else continue
      textCells.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) textCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }

    // CN subtitle (one row below, smaller opacity)
    if (ln.cn && ln.cnTypedCount > 0 && (ln.state === LineState.TYPING || ln.state === LineState.HOLDING)) {
      const cnText = ln.cn.slice(0, ln.cnTypedCount)
      const cnVw = visualWidth(ln.cn); const cnSx = Math.floor((COLS - cnVw) / 2)
      const cnOffs = charOffsets(cnText); const cnRow = row + 1
      for (let i = 0; i < cnText.length; i++) {
        const gx = cnSx + cnOffs[i]!; if (gx < 0 || gx >= COLS) continue
        const ch = cnText[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        cnCells.set(`${gx},${cnRow}`, { ch, cls: 'cn' })
        if (cw === 2) cnCells.set(`${gx + 1},${cnRow}`, { ch: '', cls: '' })
      }
    }
  }

  // Light text at flower
  const lightLine = lines[LIGHT_LINE]!; const lightCells = new Map<string, { ch: string; cls: string }>()
  if (lightLine.state === LineState.RADIATE || lightLine.state === LineState.VISIBLE) {
    const fr = WATER_ROW - Math.floor(lotusStemH) - 2; const vw = visualWidth(lightLine.text)
    const sx = Math.floor((COLS - vw) / 2); const offs = charOffsets(lightLine.text)
    const br = lightLine.state === LineState.VISIBLE ? 1 : lightLine.radiateT
    for (let i = 0; i < lightLine.text.length; i++) {
      const gx = sx + offs[i]!; const ch = lightLine.text[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      lightCells.set(`${gx},${fr}`, { ch, cls: `lr${Math.max(1, Math.min(6, Math.ceil(br * 6)))}` })
      if (cw === 2) lightCells.set(`${gx + 1},${fr}`, { ch: '', cls: '' })
    }
  }

  // Final + closing subtitle cells (fade in at different rows)
  const fadeCells = new Map<string, { ch: string; cls: string }>()
  for (const idx of [FINAL_LINE, CLOSING_LINE]) {
    const ln = lines[idx]!
    if (ln.state !== LineState.FADEIN && ln.state !== LineState.VISIBLE) continue
    const row = idx === FINAL_LINE ? 5 : 7
    const br = ln.state === LineState.VISIBLE ? 1 : ln.fadeInT
    // JP
    const vw = visualWidth(ln.text); const sx = Math.floor((COLS - vw) / 2); const offs = charOffsets(ln.text)
    for (let i = 0; i < ln.text.length; i++) {
      const gx = sx + offs[i]!; const ch = ln.text[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      fadeCells.set(`${gx},${row}`, { ch, cls: `fs${Math.max(1, Math.min(5, Math.ceil(br * 5)))}` })
      if (cw === 2) fadeCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }
    // CN below
    if (ln.cn && ln.cnTypedCount > 0) {
      const cnText = ln.cn.slice(0, ln.cnTypedCount)
      const cnVw = visualWidth(ln.cn); const cnSx = Math.floor((COLS - cnVw) / 2)
      const cnOffs = charOffsets(cnText); const cnRow = row + 1
      for (let i = 0; i < cnText.length; i++) {
        const gx = cnSx + cnOffs[i]!; const ch = cnText[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        fadeCells.set(`${gx},${cnRow}`, { ch, cls: 'cn' })
        if (cw === 2) fadeCells.set(`${gx + 1},${cnRow}`, { ch: '', cls: '' })
      }
    }
  }

  // Other cell maps
  const trailCells = new Map<string, { ch: string; opacity: number }>()
  for (const t of trails) {
    const key = `${Math.round(t.x)},${Math.round(t.y)}`
    if (!trailCells.has(key) || t.opacity > trailCells.get(key)!.opacity)
      trailCells.set(key, { ch: t.ch, opacity: t.opacity })
  }
  const ghostCells = new Map<string, { ch: string; opacity: number }>()
  for (const ln of lines) for (const gc of ln.ghostChars) {
    if (gc.opacity < 0.02) continue
    const key = `${Math.round(gc.x)},${Math.round(gc.y)}`
    const ex = ghostCells.get(key)
    if (!ex || gc.opacity > ex.opacity) ghostCells.set(key, { ch: gc.ch, opacity: gc.opacity })
  }
  const particleCells = new Map<string, { ch: string; life: number; kind: string }>()
  for (const p of particles) {
    const gx = Math.round(p.x), gy = Math.round(p.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    const key = `${gx},${gy}`; const ex = particleCells.get(key)
    if (!ex || p.life > ex.life) particleCells.set(key, { ch: p.ch, life: p.life, kind: p.kind })
  }

  const lotusCX = Math.floor(COLS / 2)
  const stemTop = WATER_ROW - Math.floor(lotusStemH); const flowerY = stemTop - 1

  // ---- render rows ----

  for (let gy = 0; gy < ROWS; gy++) {
    // TV shutdown: compress rows toward WATER_ROW
    let mappedGy = gy
    if (shutdownT > 0) {
      const center = WATER_ROW
      const squeeze = 1 - shutdownT * 0.95 // at shutdownT=1, squeeze to 5% height
      mappedGy = Math.round(center + (gy - center) * squeeze)
      if (shutdownT > 0.85) {
        // nearly collapsed: only render the center line
        if (Math.abs(gy - center) > 1) { rowEls[gy]!.innerHTML = ''; continue }
      }
    }
    if (mappedGy < 0 || mappedGy >= ROWS) { rowEls[gy]!.innerHTML = ''; continue }

    // full black after shutdown
    if (shutdownT >= 1) { rowEls[gy]!.innerHTML = ''; continue }

    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + mappedGy * 137; const key = `${gx},${mappedGy}`

      // fade-in subtitles
      const fc = fadeCells.get(key)
      if (fc !== undefined) { if (fc.ch === '') { continue }; html += `<span class="${fc.cls}">${esc(fc.ch)}</span>`; continue }

      // CN subtitle
      const cc = cnCells.get(key)
      if (cc !== undefined) { if (cc.ch === '') { continue }; html += `<span class="${cc.cls}">${esc(cc.ch)}</span>`; continue }

      // falling text
      const tc = textCells.get(key)
      if (tc !== undefined && mappedGy <= WATER_ROW) { if (tc.ch === '') { continue }; html += `<span class="${tc.cls}">${esc(tc.ch)}</span>`; continue }

      // light text
      const lc = lightCells.get(key)
      if (lc !== undefined) { if (lc.ch === '') { continue }; html += `<span class="${lc.cls}">${esc(lc.ch)}</span>`; continue }

      // particles
      const pc = particleCells.get(key)
      if (pc) {
        if (pc.kind === 'light') html += `<span class="lr${Math.max(1, Math.min(6, Math.ceil(pc.life * 6)))}">${esc(pc.ch)}</span>`
        else html += `<span class="sp${Math.max(1, Math.min(4, Math.ceil(pc.life * 4)))}">${esc(pc.ch)}</span>`
        continue
      }

      // trail
      if (mappedGy < WATER_ROW) {
        const tr = trailCells.get(key)
        if (tr && tr.opacity > 0.03) { html += `<span class="ft${Math.max(1, Math.min(5, Math.ceil(tr.opacity * 8)))}">${esc(tr.ch)}</span>`; continue }
      }

      // lotus
      if (lotusStemH > 1) {
        if (gx === lotusCX && mappedGy >= stemTop && mappedGy < WATER_ROW) {
          const sc = STEM_CHARS[Math.floor(h(seed) * STEM_CHARS.length)]!
          const prog = 1 - (mappedGy - stemTop) / Math.max(1, WATER_ROW - stemTop)
          html += `<span class="g${Math.max(1, Math.min(4, Math.ceil(prog * lotusBloomT * 4 + 1)))}">${esc(sc)}</span>`; continue
        }
        if (lotusPetalR > 0.5 && mappedGy <= flowerY + 1 && mappedGy >= flowerY - Math.ceil(lotusPetalR)) {
          const dx = gx - lotusCX, dy = mappedGy - flowerY, dist = Math.sqrt(dx * dx + dy * dy * 3.0)
          if (dist < lotusPetalR) {
            if (dist < lotusPetalR * 0.25) html += `<span class="bc${Math.max(1, Math.min(3, Math.ceil(lotusBloomT * 3)))}">${esc(BUD_CHARS[Math.floor(h(seed + 99) * BUD_CHARS.length)]!)}</span>`
            else html += `<span class="f${Math.max(1, Math.min(5, Math.ceil((1 - dist / lotusPetalR) * lotusBloomT * 5)))}">${esc(PETAL_CHARS[Math.floor(h(seed + 77) * PETAL_CHARS.length)]!)}</span>`
            continue
          }
        }
      }

      // above water
      if (mappedGy < WATER_ROW) {
        const gc = ghostCells.get(key)
        if (gc && gc.opacity > 0.05) { html += `<span class="gh${Math.max(1, Math.min(3, Math.ceil(gc.opacity * 3)))}">${esc(gc.ch)}</span>`; continue }
        if (lightRadiance > 0.1) {
          const d = Math.sqrt((gx - lotusCX) ** 2 + (WATER_ROW - mappedGy) ** 2 * 0.3)
          const illum = lightRadiance * Math.max(0, 1 - d / (WATER_ROW * 1.2))
          if (illum > 0.02 && h(seed + fi * 11) < illum * 0.12) {
            html += `<span class="il${Math.max(1, Math.min(4, Math.ceil(illum * 4)))}">${esc(NOISE_CHARS[Math.floor(h(seed + fi * 23) * NOISE_CHARS.length)]!)}</span>`; continue
          }
        }
        if (h(seed + fi * 13) < (s < 1 ? 0.05 : 0.025)) {
          html += `<span class="n${1 + Math.floor(h(seed * 5) * 3)}">${esc(NOISE_CHARS[Math.floor(h(seed + fi * 31) * NOISE_CHARS.length)]!)}</span>`
        } else html += ' '
        continue
      }

      // water surface
      if (mappedGy === WATER_ROW || mappedGy === WATER_ROW + 1) {
        if (sv <= 0) { html += ' '; continue }
        const fromCenter = Math.abs(gx - COLS / 2) / (COLS / 2)
        const reveal = sv - fromCenter * 0.4; if (reveal <= 0) { html += ' '; continue }
        const simRow = mappedGy - WATER_ROW
        const wh = Math.abs(wave0[simRow * SIM_W + gx] ?? 0)
        const base = mappedGy === WATER_ROW ? 0.35 : 0.18
        const lvl = Math.max(1, Math.min(7, Math.ceil(Math.min(1, wh * 5 + base) * 7 * Math.min(1, reveal * 1.3))))
        html += `<span class="w${lvl}">${esc(SURFACE_CHARS[Math.floor(h(seed + fi * 3) * SURFACE_CHARS.length)]!)}</span>`
        continue
      }

      // below water
      const simY = mappedGy - WATER_ROW
      if (simY >= SIM_H || sv <= 0) { html += ' '; continue }
      const gc = ghostCells.get(key)
      if (gc && gc.opacity > 0.03) { html += `<span class="gh${Math.max(1, Math.min(3, Math.ceil(gc.opacity * 4)))}">${esc(gc.ch)}</span>`; continue }
      if (lotusEnergy > 0.15) {
        const dc = Math.abs(gx - lotusCX), db = SIM_H - simY, gr = lotusEnergy * 14
        const dist = Math.sqrt(dc * dc + db * db * 0.4)
        if (dist < gr && h(seed + fi * 7) < 0.10 * (1 - dist / gr)) {
          html += `<span class="gl${Math.max(1, Math.min(4, Math.ceil((1 - dist / gr) * lotusEnergy * 4)))}">${esc(NOISE_CHARS[Math.floor(h(seed + fi * 19) * NOISE_CHARS.length)]!)}</span>`; continue
        }
      }
      const wh = wave0[simY * SIM_W + gx] ?? 0; const absH = Math.abs(wh)
      if (absH > 0.02) {
        const chars = absH > 0.10 ? RIPPLE_STRONG : RIPPLE_WEAK
        html += `<span class="p${Math.max(1, Math.min(6, Math.ceil(Math.min(1, absH * 6) * 6)))}">${esc(chars[Math.floor(h(seed) * chars.length)]!)}</span>`; continue
      }
      const depthFade = Math.max(0, 1 - simY / SIM_H)
      if (h(seed + fi * 3) < 0.018 * depthFade) html += `<span class="am${1 + Math.floor(h(seed * 3) * 2)}">${esc(RIPPLE_WEAK[Math.floor(h(seed) * RIPPLE_WEAK.length)]!)}</span>`
      else html += ' '
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
