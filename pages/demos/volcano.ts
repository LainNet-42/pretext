import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  火山 — sequel to 水葬
//
//  A living pond (lotus-fall's world) dries up. The earth cracks,
//  rises, and becomes a volcano. Full arc:
//
//    pool + lotus + buddies → water recedes → lotus wilts →
//    buddies leave → dry earth → cracks spread → ground rises →
//    mountain forms → heat glows → smoke → ERUPTION → volcano
//
//  Opening reuses lotus-fall's wave sim for the water surface so
//  viewers recognize the world immediately.
// ============================================================

const COLS = 45
const ROWS = 64
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'

// ---- character sets (from lotus-fall + new) ----
const SURFACE_CHARS = '~=~-~=~_~-'
const RIPPLE_CHARS = '~-._`\''
const STEM_CHARS = '|!I:'
const PETAL_CHARS = '(){}<>@*'
const BUD_CHARS = 'oO0@'
const GROUND_CHARS = '.,:;_'
const CRACK_CHARS = '\u2571\u2572/\\+\u253C'
const SMOKE_DENSE = '#@&%\u2593\u2592'
const SMOKE_MED = '*+:;~='
const SMOKE_LIGHT = '.\u00B7\',`'
const EMBER_CHARS = '*\u2736\u2022+.'
const NOISE_CHARS = '\u00B7.,:;'
const MTN_FILL = '.:\u00B7'

// ---- story ----
const SCRIPT = [
  '\u8FD9\u91CC\u66FE\u7ECF\u662F\u4E00\u7247\u6C60\u5858\u3002',           // 这里曾经是一片池塘。
  '\u6C34\u5F88\u6E05\uFF0C\u83B2\u82B1\u5F00\u7740\u3002',                 // 水很清，莲花开着。
  '\u5C0F\u4E1C\u897F\u4EEC\u6E38\u6765\u6E38\u53BB\u3002',                 // 小东西们游来游去。
  '\u6709\u4E00\u5929\uFF0C\u6C34\u5F00\u59CB\u5C11\u4E86\u3002',           // 有一天，水开始少了。
  '\u83B2\u82B1\u5012\u4E86\u3002',                                           // 莲花倒了。
  '\u5C0F\u4E1C\u897F\u4EEC\u8D70\u4E86\u3002',                             // 小东西们走了。
  '\u6C34\u5E72\u4E86\u3002',                                                 // 水干了。
  '\u5730\u88C2\u5F00\u4E86\u3002',                                           // 地裂开了。
  '\u88C2\u7F1D\u8D8A\u6765\u8D8A\u6DF1\u3002',                             // 裂缝越来越深。
  '\u5730\u9F13\u4E86\u8D77\u6765\u3002',                                     // 地鼓了起来。
  '\u8D8A\u6765\u8D8A\u9AD8\u3002',                                           // 越来越高。
  '\u6210\u4E86\u4E00\u5EA7\u5C71\u3002',                                     // 成了一座山。
  '\u5C71\u91CC\u662F\u70ED\u7684\u3002',                                     // 山里是热的。
  '\u5192\u70DF\u4E86\u3002',                                                 // 冒烟了。
  '\u8F70\u2014\u2014',                                                       // 轰——
  '\u706B\u5C71\u3002',                                                       // 火山。
]

// [appear_at] — one time per line
const LINE_AT = [
  0.5,   // 池塘
  4.0,   // 莲花
  7.0,   // 小东西
  11.0,  // 水少了
  15.0,  // 莲花倒了
  18.0,  // 走了
  21.0,  // 水干了
  24.0,  // 裂开
  27.0,  // 裂缝深
  30.0,  // 鼓起来
  33.0,  // 越来越高
  36.0,  // 山
  39.0,  // 热
  42.0,  // 冒烟
  45.0,  // 轰
  48.0,  // 火山
]
const TOTAL = 54.0

// ============================================================
//  Helpers
// ============================================================

function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x303F)
}
function vw(t: string): number { let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w }
function coffs(t: string): number[] { const o: number[] = []; let c = 0; for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }; return o }
function hh(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }
function noise2d(x: number, y: number, t: number): number {
  return (Math.sin(x * 0.15 + t * 0.8) * Math.cos(y * 0.12 + t * 0.6)
    + Math.sin(x * 0.08 - t * 0.4 + y * 0.1) * Math.cos(x * 0.2 + t * 0.3)) * 0.5
}

// ============================================================
//  Wave sim (from lotus-fall — the SAME water)
// ============================================================

const SIM_W = COLS
const SIM_H = 36
const wave0 = new Float32Array(SIM_W * SIM_H)
const wave1 = new Float32Array(SIM_W * SIM_H)
const DAMPING = 0.984

function waveStep(): void {
  for (let y = 1; y < SIM_H - 1; y++) {
    for (let x = 1; x < SIM_W - 1; x++) {
      const i = y * SIM_W + x
      wave1[i] = ((wave0[i - 1]! + wave0[i + 1]! + wave0[i - SIM_W]! + wave0[i + SIM_W]!) * 0.25 * 2 - wave1[i]!) * DAMPING
    }
  }
  const tmp = new Float32Array(wave0)
  wave0.set(wave1); wave1.set(tmp)
}

function waveSplash(cx: number, strength: number): void {
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const gx = cx + dx; if (gx < 0 || gx >= SIM_W) continue
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 5) continue
      wave0[dy * SIM_W + gx] = (wave0[dy * SIM_W + gx] ?? 0) + strength * (1 - d / 5)
    }
  }
}

// ============================================================
//  Smoke particles (from smoke prototype)
// ============================================================

interface Wisp { x: number; y: number; vx: number; vy: number; life: number; decay: number; ch: string; heat: number }
const wisps: Wisp[] = []

function spawnSmoke(cx: number, cy: number, count: number, power: number): void {
  for (let i = 0; i < count && wisps.length < 600; i++) {
    const a = Math.PI * 0.5 + (Math.random() - 0.5) * 1.0
    const sp = power * (0.5 + Math.random())
    const pool = Math.random() < 0.3 ? SMOKE_DENSE : Math.random() < 0.6 ? SMOKE_MED : SMOKE_LIGHT
    wisps.push({ x: cx + (Math.random() - 0.5) * 3, y: cy,
      vx: Math.cos(a) * sp * 0.4, vy: -Math.sin(a) * sp,
      life: 1, decay: 0.003 + Math.random() * 0.005,
      ch: pool[Math.floor(Math.random() * pool.length)]!, heat: power > 1.5 ? 1 : 0.3 })
  }
}

function updateWisps(s: number): void {
  for (let i = wisps.length - 1; i >= 0; i--) {
    const w = wisps[i]!
    w.vx += noise2d(w.x, w.y, s) * 0.06; w.vy -= 0.008
    w.vx *= 0.985; w.vy *= 0.993; w.x += w.vx; w.y += w.vy
    w.heat = Math.max(0, w.heat - 0.008); w.life -= w.decay
    if (w.life <= 0 || w.y < -2) { wisps[i] = wisps[wisps.length - 1]!; wisps.pop() }
  }
}

// ============================================================
//  Font prep
// ============================================================

const allChars = new Set(
  SURFACE_CHARS + RIPPLE_CHARS + STEM_CHARS + PETAL_CHARS + BUD_CHARS +
  GROUND_CHARS + CRACK_CHARS + SMOKE_DENSE + SMOKE_MED + SMOKE_LIGHT +
  EMBER_CHARS + NOISE_CHARS + MTN_FILL + '/\\^_><\u2736\u2022'
)
for (const line of SCRIPT) for (const c of line) allChars.add(c)
for (const ch of allChars) prepareWithSegments(ch, FONT)

// ============================================================
//  DOM + buffers
// ============================================================

const art = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) { const el = document.createElement('div'); el.className = 'r'; art.appendChild(el); rowEls.push(el) }
const cellCh: string[] = new Array(COLS * ROWS).fill('')
const cellCls: string[] = new Array(COLS * ROWS).fill('')
function clearCells(): void { for (let i = 0; i < cellCh.length; i++) { cellCh[i] = ''; cellCls[i] = '' } }
function setCell(x: number, y: number, ch: string, cls: string): void {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return
  cellCh[y * COLS + x] = ch; cellCls[y * COLS + x] = cls
}
const htmlParts: string[] = []

// ============================================================
//  Scene state
// ============================================================

const CX = Math.floor(COLS / 2)
const INITIAL_WATER_ROW = 28  // same as lotus-fall's 44%

// Derived from timeline
function waterRow(s: number): number {
  // Lines 0-3 (0-11s): full water. Lines 4-6 (11-21): water drains. After 21: dry.
  if (s < 11) return INITIAL_WATER_ROW
  if (s > 23) return ROWS + 5  // off-screen = no water
  return Math.round(INITIAL_WATER_ROW + (s - 11) * 2.5)
}

function lotusAlive(s: number): number {
  // 1.0 during lines 0-3, fades during line 4 (15-18)
  if (s < 15) return 1
  if (s > 18) return 0
  return 1 - (s - 15) / 3
}

function buddyAlive(s: number): number {
  if (s < 18) return 1
  if (s > 21) return 0
  return 1 - (s - 18) / 3
}

function crackProgress(s: number): number {
  // Starts at line 7 (24s), full at line 9 (30s)
  if (s < 24) return 0
  if (s > 30) return 1
  return (s - 24) / 6
}

function mtnHeight(s: number): number {
  // Rises during lines 9-11 (30-36s), max ~16 rows
  if (s < 30) return 0
  if (s > 38) return 16
  return ((s - 30) / 8) * 16
}

function smokeIntensity(s: number): number {
  if (s < 42) return 0
  if (s < 45) return (s - 42) / 3
  if (s < 48) return 1.0   // eruption
  return Math.max(0, 1 - (s - 48) / 4)
}

function isEruption(s: number): boolean { return s >= 45 && s < 48 }

// Buddy sprites — simple 3-char fish swimming left/right
const BUDDIES = [
  { x: 8, y: 0, vx: 1.5, sprite: '><>' },
  { x: 35, y: 2, vx: -1.2, sprite: '<><' },
  { x: 20, y: 1, vx: 0.8, sprite: '><>' },
]

function updateBuddies(dt: number): void {
  for (const b of BUDDIES) {
    b.x += b.vx * dt
    if (b.vx > 0 && b.x > COLS + 2) b.x = -4
    if (b.vx < 0 && b.x < -4) b.x = COLS + 2
  }
}

// ============================================================
//  Crack grid — frontier growth (like frost, reused)
// ============================================================

const cracked = new Uint8Array(COLS * ROWS)
const crackFrontier: number[] = []
let cracksSeeded = false

function seedCracks(): void {
  if (cracksSeeded) return; cracksSeeded = true
  // Seed from center + random spots
  for (let i = 0; i < 8; i++) {
    const x = CX + Math.floor((Math.random() - 0.5) * 20)
    const y = INITIAL_WATER_ROW + 2 + Math.floor(Math.random() * 10)
    const idx = y * COLS + x
    if (idx >= 0 && idx < COLS * ROWS) { cracked[idx] = 1; crackFrontier.push(idx) }
  }
}

function growCracks(rate: number): void {
  const toGrow = Math.min(crackFrontier.length, Math.max(1, Math.floor(rate)))
  for (let i = 0; i < toGrow; i++) {
    if (crackFrontier.length === 0) break
    const pick = Math.floor(Math.random() * crackFrontier.length)
    const idx = crackFrontier[pick]!
    crackFrontier[pick] = crackFrontier[crackFrontier.length - 1]!; crackFrontier.pop()
    if (cracked[idx]!) continue
    cracked[idx] = 1
    const x = idx % COLS, y = Math.floor(idx / COLS)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx!, ny = y + dy!
      if (nx >= 0 && nx < COLS && ny >= INITIAL_WATER_ROW && ny < ROWS) {
        const nIdx = ny * COLS + nx
        if (!cracked[nIdx]!) crackFrontier.push(nIdx)
      }
    }
  }
}

// ============================================================
//  Frame
// ============================================================

let startT: number | null = null
let lastEruptBurst = 0

function frame(now: number): void {
  if (startT === null) startT = now
  const s = (now - startT) / 1000
  const dt = 1 / 60
  const fi = Math.floor(s * 12.5)

  if (s > TOTAL) {
    startT = now; wave0.fill(0); wave1.fill(0); wisps.length = 0
    cracked.fill(0); crackFrontier.length = 0; cracksSeeded = false; lastEruptBurst = 0
    for (const b of BUDDIES) { b.x = Math.random() * COLS }
    requestAnimationFrame(frame); return
  }

  const wr = waterRow(s)
  const hasWater = wr < ROWS
  if (hasWater) { waveStep(); if (Math.random() < 0.03) waveSplash(Math.floor(Math.random() * COLS), 0.2) }
  updateBuddies(dt)

  // Crack growth
  const cp = crackProgress(s)
  if (cp > 0) { seedCracks(); growCracks(cp * 3) }

  // Smoke
  const si = smokeIntensity(s)
  const mh = mtnHeight(s)
  const mtnPeakY = Math.round(INITIAL_WATER_ROW + 10 - mh)
  if (si > 0) {
    if (Math.random() < si * 0.5) spawnSmoke(CX, mtnPeakY - 1, 2 + Math.floor(si * 4), si * 2)
  }
  if (isEruption(s) && s - lastEruptBurst > 0.25) {
    lastEruptBurst = s; spawnSmoke(CX, mtnPeakY - 2, 60, 3.5)
  }
  updateWisps(s)

  const gfade = s >= TOTAL - 2 ? Math.max(0, 1 - (s - (TOTAL - 2)) / 2) : 1.0
  clearCells()

  // ============================================================
  //  RENDER LAYERS (bottom-up priority)
  // ============================================================

  // ---- Layer: Ground (below water / after water recedes) ----
  if (wr > INITIAL_WATER_ROW) {
    for (let y = INITIAL_WATER_ROW + 1; y < ROWS; y++) {
      if (y < wr - 2) {
        // Exposed dry ground
        for (let x = 0; x < COLS; x++) {
          const ch = GROUND_CHARS[Math.floor(hh(x * 73 + y * 137) * GROUND_CHARS.length)]!
          const lvl = Math.max(1, Math.min(4, Math.ceil(hh(x * 31 + y * 53) * 3 + 1)))
          setCell(x, y, ch, `d${lvl}`)
        }
      }
    }
  }

  // ---- Layer: Cracks on dry ground ----
  if (cp > 0) {
    for (let y = INITIAL_WATER_ROW; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!cracked[y * COLS + x]) continue
        const ch = CRACK_CHARS[Math.floor(hh(x * 13 + y * 17) * CRACK_CHARS.length)]!
        setCell(x, y, ch, 'cr')
      }
    }
  }

  // ---- Layer: Mountain (rising from ground) ----
  if (mh > 1) {
    const baseY = INITIAL_WATER_ROW + 10
    for (let y = mtnPeakY; y <= baseY; y++) {
      const rowFromPeak = y - mtnPeakY
      const halfW = Math.floor(rowFromPeak * 1.0 + 1)
      // Slopes
      const le = CX - halfW, re = CX + halfW
      if (le >= 0 && le < COLS) setCell(le, y, '/', 'm3')
      if (re >= 0 && re < COLS) setCell(re, y, '\\', 'm3')
      // Fill
      for (let x = le + 1; x < re; x++) {
        if (x < 0 || x >= COLS) continue
        if (hh(x * 73 + y * 137) < 0.2) setCell(x, y, MTN_FILL[Math.floor(hh(x * 7 + y * 11) * MTN_FILL.length)]!, 'm2')
        else if (hh(x * 31 + y * 53) < 0.1) setCell(x, y, '.', 'm1')
      }
    }
    // Ember glow inside mountain (line 12+: 山里是热的)
    if (s >= 39) {
      const glowI = Math.min(1, (s - 39) / 3)
      for (let y = mtnPeakY + 1; y <= baseY - 1; y++) {
        const rowFromPeak = y - mtnPeakY
        const halfW = Math.floor(rowFromPeak * 0.8)
        for (let dx = -halfW; dx <= halfW; dx++) {
          const x = CX + dx; if (x < 0 || x >= COLS) continue
          if (hh(x * 7 + y * 11 + Math.floor(s * 5)) < glowI * 0.15) {
            setCell(x, y, EMBER_CHARS[Math.floor(hh(x * 13 + y * 17 + fi) * EMBER_CHARS.length)]!, `e${Math.max(1, Math.min(4, Math.ceil(glowI * 3)))}`)
          }
        }
      }
    }
    // Peak marker
    setCell(CX, mtnPeakY, '^', si > 0 ? 'e3' : 'm3')
  }

  // ---- Layer: Water surface + underwater (lotus-fall style) ----
  if (hasWater) {
    const wrInt = Math.floor(wr)
    // Surface
    for (let x = 0; x < COLS; x++) {
      const wh = Math.abs(wave0[x] ?? 0)
      const lvl = Math.max(1, Math.min(7, Math.ceil(Math.min(1, wh * 5 + 0.35) * 7)))
      setCell(x, wrInt, SURFACE_CHARS[Math.floor(hh(x * 73 + fi * 3) * SURFACE_CHARS.length)]!, `w${lvl}`)
    }
    // Underwater ripples
    for (let dy = 1; dy < Math.min(SIM_H, ROWS - wrInt); dy++) {
      const y = wrInt + dy
      if (y >= ROWS) break
      for (let x = 0; x < COLS; x++) {
        const wh = Math.abs(wave0[dy * SIM_W + x] ?? 0)
        if (wh > 0.02) {
          const ch = RIPPLE_CHARS[Math.floor(hh(x * 73 + y * 137) * RIPPLE_CHARS.length)]!
          const lvl = Math.max(1, Math.min(4, Math.ceil(Math.min(1, wh * 5) * 4)))
          setCell(x, y, ch, `p${lvl}`)
        }
      }
    }
  }

  // ---- Layer: Lotus (alive → wilting) ----
  const la = lotusAlive(s)
  if (la > 0 && hasWater) {
    const wrInt = Math.floor(wr)
    const stemH = Math.round(6 * la)
    const stemTop = wrInt - stemH
    // Stem
    for (let y = stemTop; y < wrInt; y++) {
      if (y < 0 || y >= ROWS) continue
      const ch = STEM_CHARS[Math.floor(hh(y * 7) * STEM_CHARS.length)]!
      const lvl = Math.max(1, Math.min(4, Math.ceil(la * 3)))
      setCell(CX, y, ch, `g${lvl}`)
    }
    // Flower
    if (la > 0.3) {
      const pr = Math.round(la * 3)
      const fy = stemTop - 1
      for (let dy = -pr; dy <= 0; dy++) {
        for (let dx = -pr; dx <= pr; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy * 3)
          if (d > pr) continue
          const px = CX + dx, py = fy + dy
          if (px < 0 || px >= COLS || py < 0 || py >= ROWS) continue
          if (d < pr * 0.3) {
            setCell(px, py, BUD_CHARS[Math.floor(hh(px + py * 7) * BUD_CHARS.length)]!, `f${Math.max(1, Math.min(4, Math.ceil(la * 4)))}`)
          } else {
            setCell(px, py, PETAL_CHARS[Math.floor(hh(px * 3 + py * 11) * PETAL_CHARS.length)]!, `f${Math.max(1, Math.min(4, Math.ceil(la * (1 - d / pr) * 4)))}`)
          }
        }
      }
    }
  }

  // ---- Layer: Buddies (swimming in water) ----
  const ba = buddyAlive(s)
  if (ba > 0 && hasWater) {
    const wrInt = Math.floor(wr)
    for (const b of BUDDIES) {
      const by = wrInt + 2 + b.y
      if (by >= ROWS) continue
      for (let j = 0; j < b.sprite.length; j++) {
        const gx = Math.round(b.x) + j
        if (gx < 0 || gx >= COLS) continue
        setCell(gx, by, b.sprite[j]!, 'bd')
      }
    }
  }

  // ---- Layer: Smoke wisps ----
  wisps.sort((a, b) => b.life - a.life)
  for (const w of wisps) {
    const gx = Math.round(w.x), gy = Math.round(w.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    if (cellCls[gy * COLS + gx] !== '') continue
    const cls = w.heat > 0.4
      ? `e${Math.max(1, Math.min(4, Math.ceil(w.life * w.heat * 4)))}`
      : `k${Math.max(1, Math.min(7, Math.ceil(w.life * 7)))}`
    setCell(gx, gy, w.ch, cls)
  }

  // ---- Layer: Subtitle text (all visible at top, current line bright) ----
  let subRow = 2
  for (let i = 0; i < SCRIPT.length; i++) {
    const text = SCRIPT[i]!
    const w = vw(text)
    const sx = Math.floor((COLS - w) / 2)
    const offs = coffs(text)
    const active = s >= LINE_AT[i]!
    const isCurrent = active && (i === SCRIPT.length - 1 || s < LINE_AT[i + 1]!)

    for (let j = 0; j < text.length; j++) {
      const ch = text[j]!; const gx = sx + offs[j]!
      if (gx < 0 || gx >= COLS) continue
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      const cls = isCurrent ? 's6' : active ? 's3' : 's1'
      setCell(gx, subRow, ch, cls)
      if (cw === 2) setCell(gx + 1, subRow, '', cls)
    }
    subRow++
  }

  // ---- Render ----
  for (let gy = 0; gy < ROWS; gy++) {
    if (gfade <= 0) { rowEls[gy]!.innerHTML = ''; continue }
    const base = gy * COLS
    htmlParts.length = 0
    for (let gx = 0; gx < COLS; gx++) {
      const cls = cellCls[base + gx]!
      if (cls !== '') {
        const ch = cellCh[base + gx]!
        if (ch === '') continue
        htmlParts.push('<span class="', cls, '">', esc(ch), '</span>')
      } else {
        if (hh(gx * 73 + gy * 137 + fi * 13) < 0.006) {
          htmlParts.push('<span class="n1">\u00B7</span>')
        } else { htmlParts.push(' ') }
      }
    }
    rowEls[gy]!.innerHTML = htmlParts.join('')
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
