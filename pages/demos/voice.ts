import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  VOICE — 心音 + 声之形
//  A waveform at center. Text is sound. Sound has shape.
//
//  Silent = gentle heartbeat rhythm
//  Text   = words draw their own waveform signature
//  Peaks  = ripples radiate into the surrounding field
// ============================================================

const COLS = 45
const ROWS = 64
const CENTER_ROW = 32       // waveform baseline
const SUB_ROW = 8            // JP subtitle
const CN_ROW = 9             // CN subtitle
const AMP_RANGE = 10         // waveform amplitude range (rows)

// ---- script ----
const SCRIPT = [
  '......',
  '\u591C,\u6DF1\u3044',                          // 夜,深い
  '\u9F13\u52D5',                                  // 鼓動
  '\u7A93\u306E\u5916,\u96EA',                    // 窓の外,雪
  '\u8AB0\u3082,\u8D77\u304D\u306A\u3044',        // 誰も,起きない
  '\u308F\u305F\u3057,\u3060\u3051',              // わたし,だけ
  '\u305D\u308C\u3067\u3082,\u9CF4\u308B',        // それでも,鳴る
  '\u305D\u308C\u3067,\u3044\u3044\u3002',        // それで,いい。
]
const SCRIPT_CN = [
  '',
  '(\u591C\uFF0C\u5F88\u6DF1)',
  '(\u5FC3\u8DF3)',
  '(\u7A97\u5916\uFF0C\u96EA)',
  '(\u6CA1\u4EBA\uFF0C\u9192\u7740)',
  '(\u53EA\u6709\u6211)',
  '(\u4F46\u4ECD,\u5728\u54CD)',
  '(\u8FD9\u6837\uFF0C\u5C31\u597D\u3002)',
]
const TIMING: [number, number, number][] = [
  [0.3,  1.2,  0.3],     // dots
  [2.0,  1.10, 0.7],     // 夜,深い
  [4.3,  0.80, 1.2],     // 鼓動 (single word, long silence)
  [6.8,  1.30, 0.8],     // 窓の外,雪
  [9.3,  1.50, 0.7],     // 誰も,起きない
  [11.8, 1.20, 0.8],     // わたし,だけ
  [14.3, 1.50, 0.9],     // それでも,鳴る
  [17.0, 1.80, 2.5],     // それで,いい。
]

// ---- pretext ----
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'
const ALL_CHARS = new Set('_.-~^v|/\\*:;,`\'' + SCRIPT.join('') + SCRIPT_CN.join(''))
for (const c of ALL_CHARS) prepareWithSegments(c, FONT)

// ---- CJK ----
function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x303F) ||
    (c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF)
}
function vw(t: string): number { let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w }
function coffs(t: string): number[] { const o: number[] = []; let c = 0; for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }; return o }

// ---- helpers ----
function H(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }
function cl(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v }

// ============================================================
//  WAVEFORM (the main visual)
// ============================================================

// amplitude per column (in rows above/below CENTER_ROW)
// positive = above center (upward)
// Wave scrolls right-to-left: wave[COLS-1] is "now", wave[0] is oldest
const wave = new Float32Array(COLS)

// trail/echo of previous wave positions for ghosting effect
const waveTrail: Float32Array[] = []
for (let i = 0; i < 6; i++) waveTrail.push(new Float32Array(COLS))

// ---- pulse generator ----
// At each time, generate the "amplitude" to inject at the rightmost column.
// Mode determines the shape.

const enum Mode { HEARTBEAT, SPEAKING, FLATLINE, ARRHYTHMIC }
let mode: Mode = Mode.HEARTBEAT

// heartbeat cycle (PQRST pattern, ~60 frames per beat = 1s)
let heartPhase = 0
const HEART_PERIOD = 70  // frames per beat

// PQRST pulse shape — returns amplitude at a phase (0..1)
function heartShape(phase: number): number {
  // P wave: 0.05 - 0.15
  if (phase < 0.05) return 0
  if (phase < 0.15) {
    const t = (phase - 0.05) / 0.10
    return Math.sin(t * Math.PI) * 1.2
  }
  // Q: small dip
  if (phase < 0.20) return -0.3 * Math.sin((phase - 0.15) / 0.05 * Math.PI)
  // R: sharp spike
  if (phase < 0.24) return 8.5 * Math.sin((phase - 0.20) / 0.04 * Math.PI)
  // S: downstroke
  if (phase < 0.30) return -2.5 * Math.sin((phase - 0.24) / 0.06 * Math.PI)
  // T wave: broad bump
  if (phase < 0.50) {
    const t = (phase - 0.30) / 0.20
    return Math.sin(t * Math.PI) * 1.8
  }
  return 0
}

// speaking waveform: text-driven, each char contributes a beat
let speakingText = ''
let speakingT = 0           // progress 0..1 through speakingText
let speakingDur = 0          // total duration in seconds
let speakingStart = 0        // start time in seconds

function speakingShape(s: number): number {
  if (!speakingText) return 0
  const local = (s - speakingStart) / speakingDur
  if (local < 0 || local > 1) return 0
  // Each character is a "syllable" — produces a pulse
  const charIdx = local * speakingText.length
  const charFrac = charIdx - Math.floor(charIdx)
  const ch = speakingText.charAt(Math.floor(charIdx))
  if (!ch) return 0
  // character's "intensity" based on its code (deterministic pseudo-random)
  const intensity = 1 + H(ch.charCodeAt(0)) * 3
  // envelope: each syllable has a bell shape
  const env = Math.sin(charFrac * Math.PI)
  // combine with a carrier for the "shape" of the sound
  const carrier = Math.sin(charFrac * Math.PI * (2 + H(ch.charCodeAt(0) * 7) * 3))
  return env * carrier * intensity * 2.5
}

// ---- ripple field (2D wave radiating from pulse points) ----

const SIM_W = COLS
const SIM_H = ROWS
const ripple0 = new Float32Array(SIM_W * SIM_H)
const ripple1 = new Float32Array(SIM_W * SIM_H)
const DAMP = 0.978

function rippleStep(): void {
  for (let y = 1; y < SIM_H - 1; y++) {
    for (let x = 1; x < SIM_W - 1; x++) {
      const i = y * SIM_W + x
      const avg = (ripple0[i - 1]! + ripple0[i + 1]! + ripple0[i - SIM_W]! + ripple0[i + SIM_W]!) * 0.25
      ripple1[i] = (avg * 2 - ripple1[i]!) * DAMP
    }
  }
  const tmp = new Float32Array(ripple0)
  ripple0.set(ripple1)
  ripple1.set(tmp)
}

function rippleBurst(cx: number, cy: number, strength: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > radius) continue
      const x = cx + dx, y = cy + dy
      if (x < 0 || x >= SIM_W || y < 0 || y >= SIM_H) continue
      ripple0[y * SIM_W + x]! += strength * (1 - d / radius)
    }
  }
}

// ---- text line state machine ----

const enum St { WAIT, TYPE, HOLD, FADE_OUT, FADE_IN, SHOW, GONE }

interface Line {
  text: string; cn: string; st: St
  at: number; dur: number; hold: number; spd: number
  typed: number; cnTyped: number; t0: number
  prog: number
}

function mkLine(i: number): Line {
  const dur = TIMING[i]![1]
  return {
    text: SCRIPT[i]!, cn: SCRIPT_CN[i]!, st: St.WAIT,
    at: TIMING[i]![0], dur, hold: TIMING[i]![2],
    spd: SCRIPT[i]!.length / Math.max(0.1, dur),
    typed: 0, cnTyped: 0, t0: 0, prog: 0,
  }
}

const L: Line[] = SCRIPT.map((_, i) => mkLine(i))

function updateLines(s: number): void {
  for (let i = 0; i < L.length; i++) {
    const ln = L[i]!
    switch (ln.st) {
      case St.WAIT:
        if (s < ln.at) break
        if (i === 7) { ln.st = St.FADE_IN; ln.t0 = s; ln.prog = 0 }
        else { ln.st = St.TYPE; ln.t0 = s; ln.typed = 0; ln.cnTyped = 0 }
        // Trigger speaking mode for this line (not for dots)
        if (i > 0 && i < 7) {
          // Line 2 "鼓動" = stay in HEARTBEAT (the heartbeat IS the voice)
          // Line 4 "誰も,起きない" = FLATLINE (no one awake, isolation)
          // Line 6 "それでも,鳴る" = strong SPEAKING (affirmation that it rings)
          if (i === 2) {
            mode = Mode.HEARTBEAT
            // Big ripple from heart — like noticing your own heartbeat
            rippleBurst(COLS - 1, CENTER_ROW, 2.5, 4)
          } else if (i === 4) {
            mode = Mode.FLATLINE
          } else {
            mode = Mode.SPEAKING
            speakingText = ln.text
            speakingStart = s
            speakingDur = ln.dur
          }
          // Ripples for emotional beats
          if (i === 6) rippleBurst(COLS - 1, CENTER_ROW, 2.0, 3)
        }
        break

      case St.TYPE: {
        const e = s - ln.t0
        ln.typed = Math.min(ln.text.length, Math.floor(e * ln.spd))
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(e * ln.cn.length / Math.max(0.1, ln.dur)))
        if (ln.typed >= ln.text.length) ln.st = St.HOLD
        break
      }

      case St.HOLD: {
        ln.cnTyped = ln.cn.length
        if (s >= ln.t0 + ln.dur + ln.hold) {
          ln.st = St.FADE_OUT; ln.t0 = s; ln.prog = 0
          // return to heartbeat after speaking
          if (i > 0 && i < 7) {
            speakingText = ''
            mode = Mode.HEARTBEAT
          }
        }
        break
      }

      case St.FADE_OUT: {
        ln.prog = Math.min(1, (s - ln.t0) / 0.6)
        if (ln.prog >= 1) ln.st = St.GONE
        break
      }

      case St.FADE_IN: {
        ln.prog = Math.min(1, (s - ln.t0) / 1.8)
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(ln.prog * ln.cn.length))
        if (ln.prog >= 1) ln.st = St.SHOW
        break
      }

      case St.SHOW:
        ln.cnTyped = ln.cn.length
        break

      case St.GONE: break
    }
  }
}

// ============================================================
//  WAVEFORM UPDATE (generate new amplitude, scroll, inject)
// ============================================================

function updateWave(s: number): void {
  // scroll left
  for (let i = 0; i < COLS - 1; i++) wave[i] = wave[i + 1]!

  // generate new amplitude at rightmost
  let amp = 0

  if (mode === Mode.FLATLINE) {
    // nearly flat, tiny oscillation
    amp = Math.sin(s * 3) * 0.15 + (Math.random() - 0.5) * 0.1
  } else if (mode === Mode.SPEAKING && speakingText) {
    // speech waveform + gentle heartbeat underneath
    amp = speakingShape(s)
    const heartAmp = heartShape((heartPhase % HEART_PERIOD) / HEART_PERIOD) * 0.3
    amp += heartAmp
  } else {
    // HEARTBEAT: regular PQRST cycle
    amp = heartShape((heartPhase % HEART_PERIOD) / HEART_PERIOD)
    // subtle baseline variation
    amp += Math.sin(s * 0.8) * 0.1 + (Math.random() - 0.5) * 0.05
  }

  heartPhase++

  // clamp to range
  amp = cl(amp, -AMP_RANGE, AMP_RANGE)
  wave[COLS - 1] = amp

  // update trails (shift each trail left with delay)
  for (let t = 0; t < waveTrail.length; t++) {
    const delay = (t + 1) * 2  // each trail lags behind
    if (heartPhase % 2 === 0) {  // update trail every 2 frames
      for (let i = 0; i < COLS - 1; i++) waveTrail[t]![i] = waveTrail[t]![i + 1]!
      // sample from delay steps ago
      waveTrail[t]![COLS - 1] = wave[Math.max(0, COLS - 1 - delay)]!
    }
  }

  // Every ~50 frames during speaking, inject a small ripple where wave is
  if (mode === Mode.SPEAKING && heartPhase % 25 === 0) {
    const waveY = CENTER_ROW - Math.round(amp)
    rippleBurst(COLS - 1, waveY, 0.8, 2)
  }

  // Heartbeat R-spike = ripple
  const phase = (heartPhase % HEART_PERIOD) / HEART_PERIOD
  if (phase > 0.20 && phase < 0.24 && mode !== Mode.FLATLINE) {
    if (heartPhase % HEART_PERIOD < 14 && heartPhase % HEART_PERIOD > 11) {
      rippleBurst(COLS - 1, CENTER_ROW, 1.5, 2)
    }
  }
}

// ============================================================
//  DOM
// ============================================================

const art = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; art.appendChild(el); rowEls.push(el)
}

// ============================================================
//  MAIN LOOP
// ============================================================

const TOTAL = 28.0
const FADE_BLACK_START = 25.0
const FADE_BLACK_DUR = 3.0

let startT: number | null = null

function frame(now: number): void {
  if (startT === null) startT = now
  const ms = now - startT; const s = ms / 1000

  if (s > TOTAL) {
    startT = now
    wave.fill(0); for (const t of waveTrail) t.fill(0)
    ripple0.fill(0); ripple1.fill(0)
    heartPhase = 0; mode = Mode.HEARTBEAT
    speakingText = ''; speakingT = 0; speakingDur = 0; speakingStart = 0
    for (let i = 0; i < L.length; i++) Object.assign(L[i]!, mkLine(i))
    requestAnimationFrame(frame); return
  }

  const fi = Math.floor(ms / 80)

  updateLines(s)
  updateWave(s)
  rippleStep()

  // global fade
  const gfade = s >= FADE_BLACK_START ? Math.max(0, 1 - (s - FADE_BLACK_START) / FADE_BLACK_DUR) : 1.0

  // ---- text cells ----
  const txtM = new Map<string, { ch: string; cls: string }>()
  const cnM = new Map<string, { ch: string; cls: string }>()

  for (let i = 0; i < L.length; i++) {
    const ln = L[i]!
    if (ln.st === St.WAIT || ln.st === St.GONE) continue

    const row = i === 7 ? SUB_ROW - 2 : SUB_ROW
    let txt = ''
    if (ln.st === St.TYPE) txt = ln.text.slice(0, ln.typed)
    else txt = ln.text
    if (!txt) continue

    const sx = Math.floor((COLS - vw(ln.text)) / 2)
    const offs = coffs(txt)

    for (let j = 0; j < txt.length; j++) {
      const gx = sx + offs[j]!; if (gx < 0 || gx >= COLS) continue
      const ch = txt[j]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      let cls = 's6'

      if (ln.st === St.TYPE) {
        const age = (s - ln.t0) * ln.spd - j
        if (i === 0) cls = `s${cl(Math.ceil(Math.min(1, Math.max(0, age)) * 2), 1, 2)}`
        else cls = `s${cl(Math.ceil(Math.min(1, Math.max(0, age * 1.5)) * 6), 1, 6)}`
      } else if (ln.st === St.HOLD || ln.st === St.SHOW) {
        cls = i === 0 ? 's2' : i === 7 ? 'fs5' : 's6'
      } else if (ln.st === St.FADE_OUT) {
        if (H(j * 31 + Math.floor(ln.prog * 8)) < ln.prog) continue
        cls = i === 0 ? `s${cl(Math.ceil((1 - ln.prog) * 2), 1, 2)}`
              : `s${cl(Math.ceil((1 - ln.prog) * 6), 1, 6)}`
      } else if (ln.st === St.FADE_IN) {
        cls = `fs${cl(Math.ceil(ln.prog * 5), 1, 5)}`
      }

      txtM.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) txtM.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }

    // CN subtitle
    const cnRow = row + 1
    if (ln.cn && ln.cnTyped > 0 && (ln.st === St.TYPE || ln.st === St.HOLD || ln.st === St.FADE_IN || ln.st === St.SHOW)) {
      const ct = ln.cn.slice(0, ln.cnTyped)
      const cvw = vw(ln.cn); const csx = Math.floor((COLS - cvw) / 2)
      const co = coffs(ct)
      for (let j = 0; j < ct.length; j++) {
        const gx = csx + co[j]!; if (gx < 0 || gx >= COLS) continue
        const ch = ct[j]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        cnM.set(`${gx},${cnRow}`, { ch, cls: 'cn' })
        if (cw === 2) cnM.set(`${gx + 1},${cnRow}`, { ch: '', cls: '' })
      }
    }
  }

  // ---- build waveform cell map ----
  // For each column, the wave has an amplitude. The line passes through (x, CENTER_ROW - amp).
  // We render the line with characters chosen by slope.
  const waveCells = new Map<string, { ch: string; cls: string; bright: number }>()

  function placeWave(x: number, amp: number, cls: string, bright: number, prevAmp: number, nextAmp: number): void {
    const y = CENTER_ROW - Math.round(amp)
    if (y < 0 || y >= ROWS) return

    // Slope detection: compare to prevAmp and nextAmp
    const slopeL = amp - prevAmp
    const slopeR = nextAmp - amp

    let ch = '_'
    if (Math.abs(amp) < 0.3 && Math.abs(slopeL) < 0.4 && Math.abs(slopeR) < 0.4) {
      ch = '_'
    } else if (slopeR > 0.8) {
      ch = '/'
    } else if (slopeR < -0.8) {
      ch = '\\'
    } else if (slopeL > 0.8 && slopeR < -0.3) {
      ch = '^'  // peak
    } else if (slopeL < -0.8 && slopeR > 0.3) {
      ch = 'v'  // valley
    } else if (amp > 0) {
      ch = '-'
    } else {
      ch = '_'
    }

    waveCells.set(`${x},${y}`, { ch, cls, bright })

    // Fill vertical gap if the line jumps big between columns
    const prevY = CENTER_ROW - Math.round(prevAmp)
    if (Math.abs(prevY - y) > 1) {
      const step = prevY < y ? 1 : -1
      for (let fy = prevY + step; fy !== y; fy += step) {
        if (fy < 0 || fy >= ROWS) continue
        if (!waveCells.has(`${x},${fy}`)) {
          waveCells.set(`${x},${fy}`, { ch: '|', cls, bright: bright * 0.8 })
        }
      }
    }
  }

  // Draw trails first (dimmer, below main wave)
  for (let t = waveTrail.length - 1; t >= 0; t--) {
    const tw = waveTrail[t]!
    const trailLvl = cl(waveTrail.length - t, 1, 3)
    for (let x = 0; x < COLS; x++) {
      const amp = tw[x]!
      if (amp === 0) continue
      const y = CENTER_ROW - Math.round(amp)
      if (y < 0 || y >= ROWS) continue
      const key = `${x},${y}`
      if (waveCells.has(key)) continue  // don't overwrite
      waveCells.set(key, { ch: '.', cls: `wt${trailLvl}`, bright: 0.3 })
    }
  }

  // Draw main wave on top
  for (let x = 0; x < COLS; x++) {
    const amp = wave[x]!
    const prevAmp = x > 0 ? wave[x - 1]! : amp
    const nextAmp = x < COLS - 1 ? wave[x + 1]! : amp
    // Fade out at edges
    const edgeFade = x < 3 ? x / 3 : x > COLS - 4 ? 1 : 1
    const bright = Math.min(1, (Math.abs(amp) / 4 + 0.5) * edgeFade)
    const lvl = cl(Math.ceil(bright * 6), 1, 6)
    placeWave(x, amp, `w${lvl}`, bright, prevAmp, nextAmp)
  }

  // ---- render ----
  for (let gy = 0; gy < ROWS; gy++) {
    if (gfade <= 0) { rowEls[gy]!.innerHTML = ''; continue }

    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + gy * 137
      const key = `${gx},${gy}`

      // 1. text
      const tc = txtM.get(key)
      if (tc) { if (!tc.ch) continue; html += `<span class="${tc.cls}">${esc(tc.ch)}</span>`; continue }

      // 2. CN
      const cc = cnM.get(key)
      if (cc) { if (!cc.ch) continue; html += `<span class="${cc.cls}">${esc(cc.ch)}</span>`; continue }

      // 3. waveform
      const wc = waveCells.get(key)
      if (wc) { html += `<span class="${wc.cls}">${esc(wc.ch)}</span>`; continue }

      // 4. ripple field (radiating from wave)
      const ri = ripple0[gy * SIM_W + gx] ?? 0
      const riAbs = Math.abs(ri)
      if (riAbs > 0.08) {
        const lvl = cl(Math.ceil(Math.min(1, riAbs * 3) * 5), 1, 5)
        const ch = riAbs > 0.3 ? '*' : riAbs > 0.15 ? ':' : '.'
        html += `<span class="pr${lvl}">${esc(ch)}</span>`; continue
      }

      // 5. ambient reference grid lines (very faint horizontal markers)
      if (gy === CENTER_ROW && H(seed + fi * 3) < 0.08) {
        html += `<span class="g1">_</span>`; continue
      }
      if ((gy === CENTER_ROW - AMP_RANGE || gy === CENTER_ROW + AMP_RANGE) && H(seed + fi * 5) < 0.04) {
        html += `<span class="g1">.</span>`; continue
      }

      // 6. ambient noise
      if (H(seed + fi * 13) < 0.008) {
        html += `<span class="n${1 + Math.floor(H(seed * 5) * 3)}">.</span>`
      } else {
        html += ' '
      }
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
