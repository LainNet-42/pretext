// ============================================================
//  KAN 環 — pure ASCII donut, narrated build pipeline
//  9:16 portrait, ~17s (1.5s lead silence + 14.8s voice + 0.7s tail)
//  Rei voice: 点→線→環→光の環→胎→消える→環
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

const LEAD = 1.5  // pre-audio silence (adelay will push audio by this much)

// Timeline derived from silencedetect (noise=-34dB:d=0.28). All times in seconds
// relative to the ANIMATION start (audio starts at LEAD).
const AUDIO_OFFSET = LEAD  // audio segment t0 + AUDIO_OFFSET = animation t
type Phase = {
  start: number
  end: number
  kind: 'lead' | 'dot' | 'line' | 'ring' | 'full' | 'breath' | 'decay' | 'final' | 'fade'
  jp?: string
  cn?: string
}
const TIMELINE: Phase[] = [
  { start: 0.0,                   end: LEAD,                   kind: 'lead' },
  { start: LEAD + 0.70,           end: LEAD + 1.40,            kind: 'dot',   jp: '点', cn: '一つの点' },
  { start: LEAD + 1.40,           end: LEAD + 2.09,            kind: 'dot' },
  { start: LEAD + 2.09,           end: LEAD + 3.34,            kind: 'line',  jp: '線', cn: '光の線' },
  { start: LEAD + 3.34,           end: LEAD + 3.76,            kind: 'line' },
  { start: LEAD + 3.76,           end: LEAD + 5.10,            kind: 'ring',  jp: '環,回り始める', cn: '環開始回' },
  { start: LEAD + 5.10,           end: LEAD + 5.49,            kind: 'ring' },
  { start: LEAD + 5.49,           end: LEAD + 8.13,            kind: 'full',  jp: '光の環。終わりがない,始まりもない。', cn: '光の環。無終無始' },
  { start: LEAD + 8.13,           end: LEAD + 8.56,            kind: 'full' },
  { start: LEAD + 8.56,           end: LEAD + 9.81,            kind: 'breath', jp: '胎,熱い胎。中で,何かが回る。', cn: '胎。中に何かが回る' },
  { start: LEAD + 9.81,           end: LEAD + 10.42,           kind: 'breath' },
  { start: LEAD + 10.42,          end: LEAD + 12.11,           kind: 'decay', jp: '消える。また,現れる。', cn: '消える。また現れる' },
  { start: LEAD + 12.11,          end: LEAD + 13.47,           kind: 'decay' },
  { start: LEAD + 13.47,          end: LEAD + 13.77,           kind: 'final', jp: '環。', cn: '環' },
  { start: LEAD + 13.77,          end: LEAD + 15.8,            kind: 'final', jp: '環。', cn: '環' },
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

function lumToColor(lum: number): string {
  if (lum > 0.75) {
    const t = Math.min(1, (lum - 0.75) / 0.25)
    const g = (235 + 20 * t) | 0
    const b = (200 + 55 * t) | 0
    return `rgba(255,${g},${b},1)`
  } else if (lum > 0.45) {
    const t = (lum - 0.45) / 0.3
    const g = (180 + 55 * t) | 0
    const b = (110 + 90 * t) | 0
    return `rgba(255,${g},${b},1)`
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

function drawDonut(globalAlpha: number, decayThresh: number): void {
  ctx.font = FONT
  for (let y = 0; y < ROWS; y++) {
    const yPx = GRID_OY + y * LINE_H
    const rb = y * COLS
    for (let x = 0; x < COLS; x++) {
      const idx = charIdx[rb + x]
      if (idx < 0) continue
      // noise dropout during decay
      if (decayThresh > 0 && noiseField[rb + x] < decayThresh) continue
      const lum = lumBuf[rb + x]
      const col = lumToColor(lum)
      ctx.fillStyle = globalAlpha < 1 ? col.replace(/,([0-9.]+)\)$/, (_, a) => `,${(Number(a) * globalAlpha).toFixed(3)})`) : col
      ctx.fillText(LUM_CHARS[idx], GRID_OX + x * CHAR_W, yPx)
    }
  }

  // bloom
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
      const alpha = (0.08 + 0.22 * t2) * globalAlpha
      const g = (200 + 40 * t2) | 0
      const b = (130 + 90 * t2) | 0
      ctx.fillStyle = `rgba(255,${g},${b},${alpha.toFixed(3)})`
      ctx.fillRect(GRID_OX + x * CHAR_W - 2, yPx - 1, CHAR_W + 4, LINE_H + 2)
    }
  }
  ctx.restore()
}

function drawSingleDot(t: number, alpha: number): void {
  const cxPx = GRID_OX + (COLS / 2) * CHAR_W
  const cyPx = GRID_OY + (ROWS / 2) * LINE_H
  const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 / 1.2)
  const a = alpha * pulse
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.filter = 'blur(4px)'
  ctx.fillStyle = `rgba(255,235,200,${(0.4 * a).toFixed(3)})`
  ctx.fillRect(cxPx - 10, cyPx - 8, 24, 20)
  ctx.restore()
  ctx.font = FONT
  ctx.fillStyle = `rgba(255,245,220,${a.toFixed(3)})`
  ctx.fillText('@', cxPx - CHAR_W / 2, cyPx - LINE_H / 2)
}

const SUBTITLE_FONT_JP = '22px "Noto Sans JP","Hiragino Sans",sans-serif'
const SUBTITLE_FONT_CN = '15px "Noto Sans SC","PingFang SC",sans-serif'

function drawSubtitles(jp: string | undefined, cn: string | undefined, phaseStart: number, phaseEnd: number, t: number): void {
  if (!jp && !cn) return
  // Fade in over 0.2s, hold, fade out over 0.25s at end
  const local = t - phaseStart
  const dur = phaseEnd - phaseStart
  let alpha = 1
  if (local < 0.25) alpha = local / 0.25
  else if (local > dur - 0.25) alpha = Math.max(0, (dur - local) / 0.25)
  if (alpha <= 0) return

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (jp) {
    ctx.font = SUBTITLE_FONT_JP
    ctx.fillStyle = `rgba(236,232,220,${(0.92 * alpha).toFixed(3)})`
    ctx.fillText(jp, CSS_W / 2, 48)
  }
  if (cn) {
    ctx.font = SUBTITLE_FONT_CN
    ctx.fillStyle = `rgba(180,175,165,${(0.55 * alpha).toFixed(3)})`
    ctx.fillText(`(${cn})`, CSS_W / 2, CSS_H - 60)
  }
  ctx.textAlign = 'start'
}

function drawFrame(t: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CSS_W, CSS_H)

  const phase = phaseAt(t)
  const kind = phase.kind
  const progress = clamp01((t - phase.start) / Math.max(1e-6, phase.end - phase.start))

  // Slow master rotation used by all build phases
  const A = 0.2 + t * 0.26
  const B = 0.1 + t * 0.18

  if (kind === 'lead') {
    drawSingleDot(t, 0.4 + 0.6 * clamp01(t / LEAD))
  } else if (kind === 'dot') {
    drawSingleDot(t, 1)
  } else if (kind === 'line') {
    // One big-circle ring traced: thetaMax=0 (only j=0), phiMax grows to 2π
    const phiMax = Math.PI * 2 * clamp01(progress * 1.1)
    const breath = 1 + 0.035 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(A, B, breath, 0.0, phiMax)
    drawDonut(1, 0)
  } else if (kind === 'ring') {
    // Build tube by growing thetaMax
    const thetaMax = Math.PI * 2 * clamp01(progress)
    const breath = 1 + 0.035 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(A, B, breath, thetaMax, Math.PI * 2)
    drawDonut(1, 0)
  } else if (kind === 'full') {
    const breath = 1 + 0.04 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(A, B, breath, Math.PI * 2, Math.PI * 2)
    drawDonut(1, 0)
  } else if (kind === 'breath') {
    // Bigger breath amplitude — the ring throbs like an organ
    const breath = 1 + 0.08 * Math.sin(t * Math.PI * 2 / 0.9)
    computeTorusFrame(A, B, breath, Math.PI * 2, Math.PI * 2)
    drawDonut(1, 0)
  } else if (kind === 'decay') {
    // Oscillate noise dropout: up to 0.55 mid-phase, back to 0 at end
    const breath = 1 + 0.05 * Math.sin(t * Math.PI * 2 / 1.1)
    computeTorusFrame(A, B, breath, Math.PI * 2, Math.PI * 2)
    const oscillate = Math.sin(progress * Math.PI * 2.2)
    const decayThresh = 0.55 * Math.max(0, oscillate)
    drawDonut(1, decayThresh)
  } else if (kind === 'final') {
    // Freeze rotation — hold the final pose
    const freezeT = phase.start
    const freezeA = 0.2 + freezeT * 0.26
    const freezeB = 0.1 + freezeT * 0.18
    const breath = 1 + 0.025 * Math.sin(t * Math.PI * 2 / 1.4)
    computeTorusFrame(freezeA, freezeB, breath, Math.PI * 2, Math.PI * 2)
    drawDonut(1, 0)
  } else if (kind === 'fade') {
    const freezeT = phase.start
    const freezeA = 0.2 + freezeT * 0.26
    const freezeB = 0.1 + freezeT * 0.18
    computeTorusFrame(freezeA, freezeB, 1, Math.PI * 2, Math.PI * 2)
    drawDonut(1 - progress, 0)
  }

  drawSubtitles(phase.jp, phase.cn, phase.start, phase.end, t)
}

// ---- runtime ----
let startTs = 0
let paused = false

function loop(now: number): void {
  if (startTs === 0) startTs = now
  const t = (now - startTs) / 1000
  if (t > TOTAL_SECONDS) {
    // loop
    startTs = now
  }
  if (!paused) drawFrame(t)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// ---- audio sync ----
// Expose a hook so the capture script (or a click-to-start layer) can align
// animation t=0 with audio play. Audio itself gets 1.5s of lead silence via
// ffmpeg adelay so the visual "lead" phase lines up.
;(window as any).__kan = {
  reset() { startTs = 0 },
  setTime(sec: number) { startTs = performance.now() - sec * 1000 },
  drawAt(sec: number) { paused = true; drawFrame(sec) },
  pause() { paused = true },
  resume() { paused = false },
  get duration() { return TOTAL_SECONDS },
}

// click-to-start audio layer (for live preview; capture bypasses this)
const audio = new Audio('/sound/voice/kan/rei_kan.wav')
audio.preload = 'auto'
document.body.addEventListener('click', () => {
  startTs = 0
  audio.currentTime = 0
  audio.play().catch(() => {})
}, { once: true })
