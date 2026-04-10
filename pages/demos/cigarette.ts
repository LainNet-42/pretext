import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  SMOKE - text falls into ember bed, burns, rises as smoke
//  Portrait 30x50, 16px font (readable on mobile)
//  ~30s loop
//
//  Structure (like lotus-fall but inverted):
//    lotus: sky(text falls) | water surface | underwater(grows up)
//    smoke: sky(smoke rises) | ember bed    | below(text falls in)
//
//  Bottom 15%: glowing ember bed (always alive, flickering)
//  Above ember: burn zone where text meets fire
//  Upper 75%: smoke accumulates via fluid sim
//  Text falls FROM ABOVE toward ember bed
// ============================================================

const COLS = 30
const ROWS = 50
const EMBER_ROW = Math.floor(ROWS * 0.82) // ~41

// ---- fluid simulation (smoke density + heat) ----

const density = new Float32Array(COLS * ROWS)
const heat = new Float32Array(COLS * ROWS)
const velX = new Float32Array(COLS * ROWS)
const velY = new Float32Array(COLS * ROWS)
const tmpD = new Float32Array(COLS * ROWS)
const tmpH = new Float32Array(COLS * ROWS)

function I(x: number, y: number): number { return y * COLS + x }

function inject(cx: number, cy: number, r: number, d: number, ht: number, vx: number, vy: number): void {
  const ri = Math.ceil(r)
  for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
    const gx = Math.round(cx) + dx; const gy = Math.round(cy) + dy
    if (gx < 1 || gx >= COLS - 1 || gy < 1 || gy >= ROWS - 1) continue
    const dist = Math.sqrt(dx * dx + dy * dy); if (dist > r) continue
    const i = I(gx, gy); const f = 1 - dist / r
    density[i] = Math.min(1, density[i]! + d * f)
    heat[i] = Math.min(1, heat[i]! + ht * f)
    velX[i] = velX[i]! + vx * f; velY[i] = velY[i]! + vy * f
  }
}

function advect(src: Float32Array, dst: Float32Array): void {
  dst.fill(0)
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    const i = I(x, y)
    const sx = Math.max(1, Math.min(COLS - 2, x - velX[i]!))
    const sy = Math.max(1, Math.min(ROWS - 2, y - velY[i]!))
    const ix = Math.floor(sx); const iy = Math.floor(sy)
    const fx = sx - ix; const fy = sy - iy
    dst[i] = src[I(ix, iy)]! * (1 - fx) * (1 - fy) + src[I(ix + 1, iy)]! * fx * (1 - fy) +
      src[I(ix, iy + 1)]! * (1 - fx) * fy + src[I(ix + 1, iy + 1)]! * fx * fy
  }
}

function stepFluid(): void {
  // buoyancy
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    const i = I(x, y)
    velY[i] = velY[i]! - (density[i]! * 0.010 + heat[i]! * 0.018)
  }
  // advect
  advect(density, tmpD); density.set(tmpD)
  advect(heat, tmpH); heat.set(tmpH)
  // diffuse + damp + turbulence
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    const i = I(x, y)
    density[i] = (density[i]! * 0.93 +
      (density[i - 1]! + density[i + 1]! + density[i - COLS]! + density[i + COLS]!) * 0.016) * 0.998
    heat[i] = heat[i]! * 0.982
    velX[i] = (velX[i]! * 0.90 + (velX[i - 1]! + velX[i + 1]!) * 0.04) * 0.993
    velY[i] = (velY[i]! * 0.90 + (velY[i - COLS]! + velY[i + COLS]!) * 0.04) * 0.993
    if (heat[i]! > 0.01) velX[i] = velX[i]! + (Math.random() - 0.5) * 0.02 * heat[i]!
  }
  // top escapes
  for (let x = 0; x < COLS; x++) { density[I(x, 0)] = 0; heat[I(x, 0)] = 0 }
}

// ---- characters ----

const SMOKE_L = '~.\'`:;,'
const SMOKE_M = '*o%&+='
const SMOKE_H = '@#$%&W'
const EMBER_C = '*.,`\':;'
const FIRE_C = '*^~{}|!'
const NOISE_C = '&*$%^#@!?~+:;.,`'

// ---- script ----

const LINES = [
  { jp: '\u706B,\u6E29\u304B\u3044\u706B', cn: '(\u706B\uFF0C\u6E29\u6696\u7684\u706B)', at: 3, dur: 1.5, hold: 0.4, sem: 'ignite' },
  { jp: '\u7159,\u6D88\u3048\u308B\u7269', cn: '(\u70DF\uFF0C\u6D88\u5931\u7684\u4E1C\u897F)', at: 6, dur: 1.5, hold: 0.4, sem: 'smoke' },
  { jp: '\u4E00\u672C\u3060\u3051', cn: '(\u53EA\u6709\u4E00\u652F)', at: 9.5, dur: 1.2, hold: 0.4, sem: 'alone' },
  { jp: '\u6697\u3044\u4E2D\u3067', cn: '(\u5728\u9ED1\u6684\u4E2D)', at: 12.5, dur: 1.3, hold: 0.4, sem: 'dark' },
  { jp: '\u5438\u3046,\u5410\u304F', cn: '(\u5438\uFF0C\u5410)', at: 16, dur: 1.0, hold: 0.4, sem: 'breathe' },
  { jp: '\u77ED\u304F\u306A\u308B', cn: '(\u8D8A\u6765\u8D8A\u77ED)', at: 19.5, dur: 1.3, hold: 0.4, sem: 'shorten' },
  { jp: '\u6700\u5F8C\u306E\u4E00\u53E3', cn: '(\u6700\u540E\u4E00\u53E3)', at: 23, dur: 1.3, hold: 0.4, sem: 'last' },
]

// ---- pretext ----

const FONT = '16px/19px "SF Mono","Cascadia Code",Consolas,monospace'
const allChars = new Set(
  SMOKE_L + SMOKE_M + SMOKE_H + EMBER_C + FIRE_C + NOISE_C +
  LINES.map(l => l.jp + l.cn).join('')
)
for (const ch of allChars) prepareWithSegments(ch, FONT)

// ---- CJK ----

function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x30FF)
}
function vw(t: string): number { let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w }
function co(t: string): number[] {
  const o: number[] = []; let c = 0
  for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }; return o
}

// ---- helpers ----

function h(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function ss(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x)
}
function esc(c: string): string {
  if (c === '<') return '&lt;'; if (c === '>') return '&gt;'; if (c === '&') return '&amp;'; return c
}

// ---- line state ----

const enum S { WAIT, TYPE, HOLD, FALL, BURN, DONE }

interface Ln {
  jp: string; cn: string; st: S; sem: string
  at: number; dur: number; hold: number; spd: number
  jn: number; cn_: number; t0: number
  y: number; by: number; vy: number
  bp: Float32Array; bt: number
}

const SR = 5 // subtitle row

const lns: Ln[] = LINES.map(l => ({
  jp: l.jp, cn: l.cn, st: S.WAIT, sem: l.sem,
  at: l.at, dur: l.dur, hold: l.hold, spd: l.jp.length / Math.max(0.1, l.dur),
  jn: 0, cn_: 0, t0: 0,
  y: SR, by: SR, vy: 0,
  bp: new Float32Array(l.jp.length), bt: 0,
}))

// ---- ember state ----

let emberPower = 0   // 0..1
let emberWidth = 0    // columns
let glowR = 0

function onHit(sem: string): void {
  const cx = Math.floor(COLS / 2)
  emberPower = Math.min(1, emberPower + 0.2)
  inject(cx, EMBER_ROW - 1, 3, 0.15, 0.25, 0, -0.08)
  if (sem === 'breathe') {
    inject(cx, EMBER_ROW - 2, 6, 0.4, 0.5, 0, -0.22)
    emberPower = 1.0
  }
  if (sem === 'last') {
    for (let dx = -8; dx <= 8; dx += 2) inject(cx + dx, EMBER_ROW - 3, 3, 0.5, 0.6, dx * 0.015, -0.25)
    emberPower = 1.0
  }
}

function onDone(sem: string): void {
  const cx = Math.floor(COLS / 2)
  if (sem === 'ignite') { emberWidth = 10; emberPower = 0.6; glowR = 10 }
  if (sem === 'smoke') { inject(cx, EMBER_ROW - 4, 5, 0.3, 0.2, 0, -0.18); glowR = 8 }
  if (sem === 'alone') { emberWidth = Math.max(6, emberWidth - 2); glowR = Math.max(6, glowR - 1) }
  if (sem === 'dark') { emberWidth = Math.max(4, emberWidth - 2); glowR = Math.max(4, glowR - 2); emberPower *= 0.6 }
  if (sem === 'breathe') { inject(cx, EMBER_ROW - 6, 8, 0.5, 0.3, 0, -0.25) }
  if (sem === 'shorten') { emberWidth = Math.max(2, emberWidth - 2); emberPower *= 0.4 }
  if (sem === 'last') { emberPower = -1 } // death signal
}

// ---- update ----

function updateLines(s: number): void {
  for (const ln of lns) {
    switch (ln.st) {
      case S.WAIT: if (s >= ln.at) { ln.st = S.TYPE; ln.t0 = s; ln.jn = 0; ln.cn_ = 0 } break
      case S.TYPE: {
        const el = s - ln.t0
        ln.jn = Math.min(ln.jp.length, Math.floor(el * ln.spd))
        ln.cn_ = Math.min(ln.cn.length, Math.floor(el * ln.cn.length / Math.max(0.1, ln.dur)))
        if (ln.jn >= ln.jp.length) ln.st = S.HOLD
        break
      }
      case S.HOLD:
        ln.cn_ = ln.cn.length
        if (s >= ln.t0 + ln.dur + ln.hold) { ln.st = S.FALL; ln.vy = 0.1; ln.y = ln.by }
        break
      case S.FALL:
        ln.vy += 5.0 / 60; ln.y += ln.vy / 60 * 60
        if (ln.y >= EMBER_ROW - 2) {
          ln.y = EMBER_ROW - 2; ln.st = S.BURN; ln.bt = s; ln.bp.fill(0); onHit(ln.sem)
        }
        break
      case S.BURN: {
        const el = s - ln.bt
        const rate = ln.sem === 'last' ? 1.5 : 3.0
        const w = vw(ln.jp); const sx = Math.floor((COLS - w) / 2); const offs = co(ln.jp)
        for (let i = 0; i < ln.jp.length; i++) {
          const edge = Math.min(i, ln.jp.length - 1 - i)
          const bp = Math.min(1, Math.max(0, (el - edge / rate) * 1.5))
          if (bp > ln.bp[i]!) {
            if (bp > 0.4 && ln.bp[i]! <= 0.4) {
              inject(sx + offs[i]!, EMBER_ROW - 2, 2, 0.06, 0.1, (Math.random() - 0.5) * 0.02, -0.05)
            }
            ln.bp[i] = bp
          }
        }
        let done = true; for (let i = 0; i < ln.bp.length; i++) if (ln.bp[i]! < 1) { done = false; break }
        if (done) { ln.st = S.DONE; onDone(ln.sem) }
        break
      }
      case S.DONE: break
    }
  }
}

function updateEmber(s: number): void {
  if (s < 1) { emberPower = 0; emberWidth = 0; glowR = 0 }
  else if (s < 3) { emberPower = ss(1, 3, s) * 0.25; emberWidth = Math.floor(ss(1, 3, s) * 4); glowR = ss(1, 3, s) * 5 }

  if (emberPower === -1) { emberPower = 0; emberWidth = 0; glowR = 0 }
  if (emberPower > 0.01) {
    emberPower += Math.sin(s * 2.1) * 0.008 + Math.sin(s * 0.9) * 0.004
    emberPower = Math.max(0, Math.min(1, emberPower))
    const cx = Math.floor(COLS / 2)
    inject(cx, EMBER_ROW, emberWidth * 0.3, 0.002 * emberPower, 0.003 * emberPower,
      (Math.random() - 0.5) * 0.005, -0.01 * emberPower)
    glowR += (Math.max(2, 5 + emberPower * 6) - glowR) * 0.02
  } else { glowR *= 0.97 }
  stepFluid()
}

// ---- DOM ----

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; artEl.appendChild(el); rowEls.push(el)
}

// ---- render ----

let startTime: number | null = null

function frame(now: number): void {
  if (startTime === null) startTime = now
  const ms = now - startTime; const s = ms / 1000
  if (s > 30) {
    startTime = now; density.fill(0); heat.fill(0); velX.fill(0); velY.fill(0)
    emberPower = 0; emberWidth = 0; glowR = 0
    for (const ln of lns) { ln.st = S.WAIT; ln.jn = 0; ln.cn_ = 0; ln.y = ln.by; ln.vy = 0; ln.bp.fill(0) }
    requestAnimationFrame(frame); return
  }

  const fi = Math.floor(ms / 80)
  updateLines(s); updateEmber(s)

  // ---- text cells ----
  const tc = new Map<string, { ch: string; cls: string }>()
  const cc = new Map<string, { ch: string; cls: string }>()

  for (const ln of lns) {
    if (ln.st === S.WAIT || ln.st === S.DONE) continue
    const disp = ln.st === S.TYPE ? ln.jp.slice(0, ln.jn) : ln.jp
    if (disp.length === 0) continue
    const w = vw(ln.jp); const sx = Math.floor((COLS - w) / 2)
    const offs = co(disp); const row = Math.floor(ln.y)
    if (row < 0 || row >= ROWS) continue

    for (let i = 0; i < disp.length; i++) {
      const gx = sx + offs[i]!; if (gx < 0 || gx >= COLS) continue
      const ch = disp[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      let cls: string
      if (ln.st === S.BURN) {
        const bp = ln.bp[i] ?? 0; if (bp >= 0.95) continue
        cls = `b${Math.max(1, Math.min(8, Math.ceil(bp * 8)))}`
      } else if (ln.st === S.TYPE || ln.st === S.HOLD) {
        cls = ln.st === S.TYPE
          ? `s${Math.max(1, Math.min(6, Math.ceil(Math.min(1, Math.max(0, ((s - ln.t0) * ln.spd - i) * 1.5)) * 6)))}`
          : 's6'
      } else {
        const fade = Math.min(1, (ln.y - ln.by) / (EMBER_ROW - 2 - ln.by))
        cls = `ft${Math.max(1, Math.min(4, Math.ceil((1 - fade * 0.3) * 4)))}`
      }
      tc.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) tc.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }

    if (ln.cn && ln.cn_ > 0 && (ln.st === S.TYPE || ln.st === S.HOLD)) {
      const ct = ln.cn.slice(0, ln.cn_)
      const cVw = vw(ln.cn); const csx = Math.floor((COLS - cVw) / 2); const cco = co(ct)
      for (let i = 0; i < ct.length; i++) {
        const gx = csx + cco[i]!; if (gx < 0 || gx >= COLS) continue
        const ch = ct[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        cc.set(`${gx},${row + 1}`, { ch, cls: 'cn' })
        if (cw === 2) cc.set(`${gx + 1},${row + 1}`, { ch: '', cls: '' })
      }
    }
  }

  const cx = Math.floor(COLS / 2)

  for (let gy = 0; gy < ROWS; gy++) {
    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + gy * 137; const key = `${gx},${gy}`

      // text
      const t = tc.get(key)
      if (t !== undefined) { if (t.ch === '') continue; html += `<span class="${t.cls}">${esc(t.ch)}</span>`; continue }
      const c = cc.get(key)
      if (c !== undefined) { if (c.ch === '') continue; html += `<span class="${c.cls}">${esc(c.ch)}</span>`; continue }

      // ember bed
      if (gy >= EMBER_ROW && gy < EMBER_ROW + 5 && emberPower > 0.01) {
        const dc = Math.abs(gx - cx); const dy = gy - EMBER_ROW
        if (dc < emberWidth) {
          const f = (1 - dc / emberWidth) * (1 - dy / 5) * emberPower
          const flick = 0.6 + Math.sin(s * 3.5 + gx * 0.9) * 0.2 + Math.sin(s * 1.3 + gy * 0.5) * 0.2
          const v = f * flick
          if (v > 0.02 && h(seed + fi * 3) < v * 0.6) {
            const l = Math.max(1, Math.min(8, Math.ceil(v * 8)))
            html += `<span class="e${l}">${esc(FIRE_C[Math.floor(h(seed + fi * 11) * FIRE_C.length)]!)}</span>`; continue
          }
        }
        // dim embers around fire
        if (dc < emberWidth + 4 && h(seed + fi * 5) < emberPower * 0.04 * (1 - dc / (emberWidth + 4))) {
          html += `<span class="e${Math.max(1, Math.min(3, Math.ceil(emberPower * 2)))}">${esc(EMBER_C[Math.floor(h(seed + fi * 7) * EMBER_C.length)]!)}</span>`; continue
        }
      }

      // smoke
      const d = density[I(gx, gy)] ?? 0
      const ht = heat[I(gx, gy)] ?? 0
      if (d > 0.006) {
        const warm = ht / Math.max(0.01, d)
        const chars = d > 0.2 ? SMOKE_H : d > 0.06 ? SMOKE_M : SMOKE_L
        const sc = chars[Math.floor(h(seed + fi * 3) * chars.length)]!
        if (warm > 0.25) {
          html += `<span class="kw${Math.max(1, Math.min(6, Math.ceil(d * 10)))}">${esc(sc)}</span>`
        } else {
          html += `<span class="k${Math.max(1, Math.min(8, Math.ceil(d * 12)))}">${esc(sc)}</span>`
        }
        continue
      }

      // warm glow
      if (glowR > 0.5 && emberPower > 0.02) {
        const dx = gx - cx; const dy = (gy - EMBER_ROW) * 1.5
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < glowR && dist > 0) {
          const v = (1 - dist / glowR) * emberPower * (0.7 + Math.sin(s * 2.8 + gx * 0.4) * 0.3)
          if (h(seed + fi * 7) < v * 0.08) {
            html += `<span class="wg${Math.max(1, Math.min(4, Math.ceil(v * 4)))}">${esc(NOISE_C[Math.floor(h(seed + fi * 13) * NOISE_C.length)]!)}</span>`; continue
          }
        }
      }

      // noise
      if (h(seed + fi * 13) < 0.008) {
        html += `<span class="n${1 + Math.floor(h(seed * 5) * 3)}">${esc(NOISE_C[Math.floor(h(seed + fi * 31) * NOISE_C.length)]!)}</span>`
      } else html += ' '
    }
    rowEls[gy]!.innerHTML = html
  }
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
