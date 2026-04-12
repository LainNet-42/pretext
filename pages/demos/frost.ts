import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  霜 (Frost) — lotus-fall architecture, winter theme
//
//  Physics: frost diffusion grid (frontier-based growth) instead
//  of wave simulation. Text freezes in place → crystal seeds →
//  branching growth fills the glass. Energy accumulation drives
//  coverage. Final warm circle clears center → distant light.
//
//  Every design choice mirrors lotus-fall:
//    - Multiple char sets per element
//    - Layered rendering with priority
//    - Particle system (crystal sparks)
//    - Ghost chars that dissolve into the frost
//    - Smooth energy interpolation
//    - Rich opacity levels (fr1-fr6)
//    - Ambient atmospheric texture
// ============================================================

const COLS = 45
const ROWS = 64
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'

// ============================================================
//  Character sets (like lotus's SURFACE/RIPPLE/SPLASH/etc.)
// ============================================================

const FROST_H = '\u2500-~='          // horizontal: ─ - ~ =
const FROST_V = '\u2502|!:'          // vertical: │ | ! :
const FROST_D1 = '/\u2571/.'         // diagonal ╱
const FROST_D2 = '\\\u2572\\.'       // diagonal ╲
const FROST_NODE = '+*\u253C\u00B7'  // junction: + * ┼ ·
const FROST_CRYSTAL = '\u2736\u2022\u2219*+.' // sparkle chars
const NOISE_CHARS = '\u00B7.,:;\''   // ambient cold mist
const WARM_CHARS = '\u2736\u2022*+.' // warm glow chars

// ============================================================
//  Script
// ============================================================

const SCRIPT = [
  '\u5BD2\u3044\u3002',                     // 0  寒い。
  '\u606F\u304C\u767D\u3044\u3002',         // 1  息が白い。
  '\u7A93\u306B\u89E6\u308C\u305F\u3002',   // 2  窓に触れた。
  '\u51CD\u308B\u3002',                     // 3  凍る。
  '\u5E83\u304C\u308B\u3002',               // 4  広がる。
  '\u6A21\u69D8\u304C\u3067\u304D\u308B\u3002', // 5  模様ができる。
  '\u304D\u308C\u3044\u3060\u3002',         // 6  きれいだ。
  '\u4F55\u3082\u898B\u3048\u306A\u3044\u3002', // 7  何も見えない。
  '\u5C11\u3057\u3001\u62ED\u304F\u3002',   // 8  少し、拭く。
  '\u9060\u304F\u306B\u3001\u5149\u3002',   // 9  遠くに、光。
]

const SCRIPT_CN = [
  '(\u51B7)', '(\u6C14\u606F\u53D8\u767D)', '(\u89E6\u4E86\u7A97)',
  '(\u7ED3\u51B0)', '(\u8513\u5EF6)', '(\u82B1\u7EB9\u51FA\u73B0)',
  '(\u771F\u6F02\u4EAE)', '(\u4EC0\u4E48\u90FD\u770B\u4E0D\u89C1)',
  '(\u64E6\u4E00\u4E0B)', '(\u8FDC\u5904\u6709\u5149)',
]

const TIMING: [number, number, number][] = [
  [1.0,  0.8, 0.3],    // 0 寒い
  [3.0,  1.0, 0.3],    // 1 息が白い
  [5.0,  1.2, 0.3],    // 2 窓に触れた (seeds frost)
  [7.5,  0.6, 0.3],    // 3 凍る (growth burst)
  [9.5,  0.8, 0.3],    // 4 広がる
  [12.0, 1.2, 0.3],    // 5 模様ができる
  [15.0, 0.8, 0.5],    // 6 きれいだ
  [18.0, 1.2, 0.3],    // 7 何も見えない
  [21.5, 1.0, 0.5],    // 8 少し拭く (clear)
  [25.0, 1.2, 3.0],    // 9 遠くに光 (warm glow)
]

const FALLING_LINES = 8   // lines 0-7 fall/freeze
const CLEAR_LINE = 8
const LIGHT_LINE = 9
const SUB_ROW = 8         // subtitle row (like lotus's SUBTITLE_ROW)
const TOTAL = 32.0

// ============================================================
//  Helpers
// ============================================================

function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x303F) ||
    (c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF)
}
function vw(t: string): number { let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w }
function coffs(t: string): number[] { const o: number[] = []; let c = 0; for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }; return o }
function h(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }

// ============================================================
//  Font prep
// ============================================================

const allChars = new Set(
  FROST_H + FROST_V + FROST_D1 + FROST_D2 + FROST_NODE +
  FROST_CRYSTAL + NOISE_CHARS + WARM_CHARS +
  SCRIPT.join('') + SCRIPT_CN.join('')
)
for (const ch of allChars) prepareWithSegments(ch, FONT)

// ============================================================
//  Frost diffusion grid (like lotus's wave sim)
//
//  frostLevel: 0 = empty, 1-6 = frost intensity (maps to fr1-fr6)
//  frostChar: the display character for each frosted cell
//  frontier: list of cells that can grow next frame
// ============================================================

const frostLevel = new Uint8Array(COLS * ROWS)  // 0-6
const frostChar: string[] = new Array(COLS * ROWS).fill('')
const frontier: number[] = []  // flat indices into the grid
let frostDensity = 0  // 0..1, accumulates (like lotusEnergy)
let frostGrowthRate = 0 // cells per frame

function seedFrost(x: number, y: number): void {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return
  const idx = y * COLS + x
  if (frostLevel[idx]! > 0) return
  frostLevel[idx] = 1
  frostChar[idx] = FROST_NODE[Math.floor(h(x * 13 + y * 17) * FROST_NODE.length)]!
  addNeighborsToFrontier(x, y)
}

function addNeighborsToFrontier(x: number, y: number): void {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  for (const [dx, dy] of dirs) {
    const nx = x + dx!, ny = y + dy!
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
    const nIdx = ny * COLS + nx
    if (frostLevel[nIdx]! > 0) continue
    frontier.push(nIdx)
  }
}

function frostStep(): void {
  // Grow frost from frontier: pick random cells to freeze
  const toGrow = Math.min(frontier.length, Math.max(1, Math.floor(frostGrowthRate)))
  for (let i = 0; i < toGrow; i++) {
    if (frontier.length === 0) break
    const pick = Math.floor(Math.random() * frontier.length)
    const idx = frontier[pick]!
    frontier[pick] = frontier[frontier.length - 1]!
    frontier.pop()
    if (frostLevel[idx]! > 0) continue // already frozen

    const x = idx % COLS
    const y = Math.floor(idx / COLS)

    // Count frozen neighbors to determine growth direction
    let frozenN = 0, bestDx = 0, bestDy = 0
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (const [dx, dy] of dirs) {
      const nx = x + dx!, ny = y + dy!
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && frostLevel[ny * COLS + nx]! > 0) {
        frozenN++
        bestDx = -dx!  // growth direction is AWAY from the frozen neighbor
        bestDy = -dy!
      }
    }

    // Pick character based on growth direction
    let chars: string
    if (bestDx !== 0 && bestDy !== 0) chars = bestDx * bestDy > 0 ? FROST_D2 : FROST_D1
    else if (bestDy === 0 && bestDx !== 0) chars = FROST_H
    else if (bestDx === 0 && bestDy !== 0) chars = FROST_V
    else chars = FROST_NODE

    // Freeze with probability based on neighbors (more = more likely)
    if (frozenN >= 1 || Math.random() < 0.3) {
      frostLevel[idx] = 1
      frostChar[idx] = chars[Math.floor(h(x * 7 + y * 11) * chars.length)]!
      addNeighborsToFrontier(x, y)
    }
  }

  // Age existing frost (slowly intensify, like lotus energy building)
  for (let i = 0; i < COLS * ROWS; i++) {
    if (frostLevel[i]! > 0 && frostLevel[i]! < 6) {
      if (Math.random() < 0.008) frostLevel[i]!++
    }
  }

  // Update density
  let frozenCount = 0
  for (let i = 0; i < COLS * ROWS; i++) if (frostLevel[i]! > 0) frozenCount++
  frostDensity = frozenCount / (COLS * ROWS)
}

// ============================================================
//  Particles (crystal sparks — like lotus splash particles)
// ============================================================

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; ch: string; kind: 'crystal' | 'warm'
}
const particles: Particle[] = []

function spawnCrystalBurst(cx: number, cy: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.2 + Math.random() * 0.5
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.5,
      life: 1.0,
      ch: FROST_CRYSTAL[Math.floor(Math.random() * FROST_CRYSTAL.length)]!,
      kind: 'crystal',
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx; p.y += p.vy
    p.vx *= 0.97; p.vy *= 0.97
    p.life -= (p.kind === 'warm' ? 0.01 : 0.02)
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ============================================================
//  Trails (like lotus ghost chars / trail chars)
// ============================================================

interface Ghost { ch: string; x: number; y: number; opacity: number }
const ghosts: Ghost[] = []

// ============================================================
//  Subtitle state machine (directly from lotus-fall)
// ============================================================

const enum St { WAIT, TYPE, HOLD, FALL, DISSOLVE, GONE, FADEIN, VISIBLE }

interface SubLine {
  text: string; cn: string; st: St
  at: number; dur: number; holdAfter: number; typeSpeed: number
  typedCount: number; cnTyped: number; t0: number
  y: number; baseY: number; fallVy: number
  dissolveT: number; dissolveStartT: number
  lastTrailY: number; fadeInT: number
  seeded: boolean
}

function mkLine(i: number): SubLine {
  const dur = TIMING[i]![1]
  return {
    text: SCRIPT[i]!, cn: SCRIPT_CN[i]!, st: St.WAIT,
    at: TIMING[i]![0], dur, holdAfter: TIMING[i]![2],
    typeSpeed: SCRIPT[i]!.length / Math.max(0.1, dur),
    typedCount: 0, cnTyped: 0, t0: 0,
    y: SUB_ROW, baseY: SUB_ROW, fallVy: 0,
    dissolveT: 0, dissolveStartT: 0,
    lastTrailY: SUB_ROW, fadeInT: 0,
    seeded: false,
  }
}

const L: SubLine[] = SCRIPT.map((_, i) => mkLine(i))
let warmRadiance = 0
let clearProgress = 0  // 0..1

function updateLines(s: number): void {
  for (let idx = 0; idx < L.length; idx++) {
    const ln = L[idx]!
    switch (ln.st) {
      case St.WAIT:
        if (s >= ln.at) {
          if (idx === LIGHT_LINE) { ln.st = St.FADEIN; ln.t0 = s; ln.fadeInT = 0 }
          else if (idx === CLEAR_LINE) { ln.st = St.FADEIN; ln.t0 = s; ln.fadeInT = 0 }
          else { ln.st = St.TYPE; ln.t0 = s; ln.typedCount = 0; ln.cnTyped = 0 }
        }
        break
      case St.TYPE: {
        const e = s - ln.t0
        ln.typedCount = Math.min(ln.text.length, Math.floor(e * ln.typeSpeed))
        const cnSpd = ln.cn.length / Math.max(0.1, ln.dur)
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(e * cnSpd))
        if (ln.typedCount >= ln.text.length) ln.st = St.HOLD
        break
      }
      case St.HOLD: {
        ln.cnTyped = ln.cn.length
        if (s >= ln.t0 + ln.dur + ln.holdAfter) {
          if (idx < FALLING_LINES) {
            ln.st = St.FALL; ln.fallVy = 0.3; ln.y = ln.baseY; ln.lastTrailY = ln.baseY
          } else {
            ln.st = St.DISSOLVE; ln.dissolveStartT = s; ln.dissolveT = 0
          }
        }
        break
      }
      case St.FALL: {
        const gravity = 15.0; const dt = 1 / 60
        ln.fallVy += gravity * dt; ln.y += ln.fallVy * dt * 60

        // Drop trail chars every 2 rows (like lotus)
        if (Math.floor(ln.y) >= ln.lastTrailY + 2) {
          ln.lastTrailY = Math.floor(ln.y)
          const tw = vw(ln.text); const sx = Math.floor((COLS - tw) / 2); const offs = coffs(ln.text)
          for (let i = 0; i < ln.text.length; i++) {
            if (Math.random() > 0.4) continue
            ghosts.push({ ch: ln.text[i]!, x: sx + offs[i]!, y: ln.lastTrailY, opacity: 0.35 })
          }
        }

        // When text hits the middle of the screen → freeze into frost seeds
        const landRow = Math.floor(ROWS * 0.5)
        if (ln.y >= landRow) {
          ln.y = landRow
          // Spawn crystal burst (like lotus splash)
          const cx = Math.floor(COLS / 2)
          spawnCrystalBurst(cx, landRow, 6 + ln.text.length * 2)
          // Seed frost from the text positions
          if (!ln.seeded) {
            ln.seeded = true
            const tw = vw(ln.text); const sx = Math.floor((COLS - tw) / 2); const offs = coffs(ln.text)
            for (let i = 0; i < ln.text.length; i++) {
              seedFrost(sx + offs[i]!, landRow)
              if (isCJK(ln.text.charCodeAt(i))) seedFrost(sx + offs[i]! + 1, landRow)
            }
            // Also seed from edges on line 2+ (window frame freezing)
            if (idx >= 2) {
              for (let k = 0; k < 4; k++) {
                seedFrost(Math.floor(Math.random() * COLS), 0)
                seedFrost(Math.floor(Math.random() * COLS), ROWS - 1)
                seedFrost(0, Math.floor(Math.random() * ROWS))
                seedFrost(COLS - 1, Math.floor(Math.random() * ROWS))
              }
            }
            // Increase growth rate
            frostGrowthRate = Math.min(12, frostGrowthRate + 1.5)
          }
          // Ghost chars at landing position (like lotus ghosts at water)
          const tw = vw(ln.text); const sx = Math.floor((COLS - tw) / 2); const offs = coffs(ln.text)
          for (let i = 0; i < ln.text.length; i++) {
            ghosts.push({ ch: ln.text[i]!, x: sx + offs[i]!, y: landRow + 1 + Math.random() * 2, opacity: 0.7 })
          }
          ln.st = St.DISSOLVE; ln.dissolveStartT = s; ln.dissolveT = 0
        }
        break
      }
      case St.DISSOLVE:
        ln.dissolveT = Math.min(1, (s - ln.dissolveStartT) / 1.5)
        if (ln.dissolveT >= 1) ln.st = St.GONE
        break
      case St.GONE: break
      case St.FADEIN:
        ln.fadeInT = Math.min(1, (s - ln.t0) / 2.0)
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(ln.fadeInT * ln.cn.length))
        if (idx === CLEAR_LINE) clearProgress = Math.min(1, ln.fadeInT * 1.5)
        if (idx === LIGHT_LINE) warmRadiance = ln.fadeInT
        if (ln.fadeInT >= 1) ln.st = St.VISIBLE
        break
      case St.VISIBLE:
        ln.cnTyped = ln.cn.length
        if (idx === CLEAR_LINE) clearProgress = 1
        if (idx === LIGHT_LINE) warmRadiance = 1
        break
    }
  }
  // Fade ghosts
  for (let i = ghosts.length - 1; i >= 0; i--) {
    ghosts[i]!.opacity -= 0.01; if (ghosts[i]!.opacity <= 0) ghosts.splice(i, 1)
  }
}

// ============================================================
//  DOM
// ============================================================

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; artEl.appendChild(el); rowEls.push(el)
}

// ============================================================
//  Frame loop (structure matches lotus-fall exactly)
// ============================================================

let startTime: number | null = null

function frame(now: number): void {
  if (startTime === null) startTime = now
  const ms = now - startTime; const s = ms / 1000

  if (s > TOTAL) {
    startTime = now; frostLevel.fill(0); frostChar.fill('')
    frontier.length = 0; frostDensity = 0; frostGrowthRate = 0
    warmRadiance = 0; clearProgress = 0
    particles.length = 0; ghosts.length = 0
    for (let i = 0; i < L.length; i++) Object.assign(L[i]!, mkLine(i))
    requestAnimationFrame(frame); return
  }

  const fi = Math.floor(ms / 80)
  updateLines(s); updateParticles(); frostStep()

  // Fade-out
  const fadeAlpha = s >= TOTAL - 2 ? Math.max(0, 1 - (s - (TOTAL - 2)) / 2) : 1
  if (fadeAlpha <= 0) {
    for (let gy = 0; gy < ROWS; gy++) rowEls[gy]!.innerHTML = ''
    requestAnimationFrame(frame); return
  }

  // Clear circle center + radius
  const clearCX = Math.floor(COLS / 2), clearCY = Math.floor(ROWS / 2)
  const clearR = clearProgress * 10

  // ---- build cell maps (like lotus-fall) ----
  const textCells = new Map<string, { ch: string; cls: string }>()
  const cnCells = new Map<string, { ch: string; cls: string }>()

  for (let idx = 0; idx < L.length; idx++) {
    const ln = L[idx]!
    if (ln.st === St.WAIT || ln.st === St.GONE) continue
    if (idx >= CLEAR_LINE) continue

    const txt = ln.st === St.TYPE ? ln.text.slice(0, ln.typedCount) : ln.text
    if (txt.length === 0) continue
    const tw = vw(ln.text); const sx = Math.floor((COLS - tw) / 2)
    const offs = coffs(txt); const row = Math.floor(ln.y)
    if (row < 0 || row >= ROWS) continue

    for (let i = 0; i < txt.length; i++) {
      const gx = sx + offs[i]!; if (gx < 0 || gx >= COLS) continue
      const ch = txt[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      let cls: string
      if (ln.st === St.TYPE || ln.st === St.HOLD) {
        if (ln.st === St.TYPE) {
          const age = (s - ln.t0) * ln.typeSpeed - i
          cls = `s${Math.max(1, Math.min(6, Math.ceil(Math.min(1, Math.max(0, age * 1.5)) * 6)))}`
        } else cls = 's6'
      } else if (ln.st === St.FALL) {
        const fade = Math.min(1, (ln.y - ln.baseY) / (ROWS * 0.5 - ln.baseY))
        cls = `s${Math.max(1, Math.min(6, Math.ceil((1 - fade * 0.5) * 6)))}`
      } else if (ln.st === St.DISSOLVE) {
        cls = `fr${Math.max(1, Math.min(4, Math.ceil((1 - ln.dissolveT) * 4)))}`
      } else continue
      textCells.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) textCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }

    // CN subtitle
    if (ln.cn && ln.cnTyped > 0 && (ln.st === St.TYPE || ln.st === St.HOLD)) {
      const cnTxt = ln.cn.slice(0, ln.cnTyped)
      const cnW = vw(ln.cn); const cnSx = Math.floor((COLS - cnW) / 2)
      const cnOffs = coffs(cnTxt)
      for (let i = 0; i < cnTxt.length; i++) {
        const gx = cnSx + cnOffs[i]!; const ch = cnTxt[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        cnCells.set(`${gx},${row + 1}`, { ch, cls: 'cn' })
        if (cw === 2) cnCells.set(`${gx + 1},${row + 1}`, { ch: '', cls: '' })
      }
    }
  }

  // Fade-in text (clear + light lines)
  const fadeCells = new Map<string, { ch: string; cls: string }>()
  for (const idx of [CLEAR_LINE, LIGHT_LINE]) {
    const ln = L[idx]!
    if (ln.st !== St.FADEIN && ln.st !== St.VISIBLE) continue
    const row = idx === CLEAR_LINE ? 5 : 7
    const br = ln.st === St.VISIBLE ? 1 : ln.fadeInT
    const tw = vw(ln.text); const sx = Math.floor((COLS - tw) / 2); const offs = coffs(ln.text)
    for (let i = 0; i < ln.text.length; i++) {
      const gx = sx + offs[i]!; const ch = ln.text[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      const cls = idx === LIGHT_LINE ? `w${Math.max(1, Math.min(4, Math.ceil(br * 4)))}` : `s${Math.max(1, Math.min(6, Math.ceil(br * 6)))}`
      fadeCells.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) fadeCells.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }
    if (ln.cn && ln.cnTyped > 0) {
      const cnTxt = ln.cn.slice(0, ln.cnTyped); const cnW = vw(ln.cn); const cnSx = Math.floor((COLS - cnW) / 2)
      const cnOffs = coffs(cnTxt)
      for (let i = 0; i < cnTxt.length; i++) {
        const gx = cnSx + cnOffs[i]!; const ch = cnTxt[i]!; const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        fadeCells.set(`${gx},${row + 1}`, { ch, cls: 'cn' })
        if (cw === 2) fadeCells.set(`${gx + 1},${row + 1}`, { ch: '', cls: '' })
      }
    }
  }

  // Ghost + particle cell maps
  const ghostCells = new Map<string, { ch: string; opacity: number }>()
  for (const g of ghosts) {
    if (g.opacity < 0.03) continue
    const key = `${Math.round(g.x)},${Math.round(g.y)}`
    const ex = ghostCells.get(key)
    if (!ex || g.opacity > ex.opacity) ghostCells.set(key, { ch: g.ch, opacity: g.opacity })
  }
  const particleCells = new Map<string, { ch: string; life: number; kind: string }>()
  for (const p of particles) {
    const gx = Math.round(p.x), gy = Math.round(p.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    const key = `${gx},${gy}`; const ex = particleCells.get(key)
    if (!ex || p.life > ex.life) particleCells.set(key, { ch: p.ch, life: p.life, kind: p.kind })
  }

  // ---- render rows (like lotus-fall: layered priority) ----

  for (let gy = 0; gy < ROWS; gy++) {
    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + gy * 137; const key = `${gx},${gy}`

      // Layer 1: fade-in subtitles (clear / light lines)
      const fc = fadeCells.get(key)
      if (fc) { if (fc.ch === '') continue; html += `<span class="${fc.cls}">${esc(fc.ch)}</span>`; continue }

      // Layer 2: CN subtitle
      const cc = cnCells.get(key)
      if (cc) { if (cc.ch === '') continue; html += `<span class="${cc.cls}">${esc(cc.ch)}</span>`; continue }

      // Layer 3: falling text
      const tc = textCells.get(key)
      if (tc) { if (tc.ch === '') continue; html += `<span class="${tc.cls}">${esc(tc.ch)}</span>`; continue }

      // Layer 4: particles
      const pc = particleCells.get(key)
      if (pc) {
        const lvl = Math.max(1, Math.min(6, Math.ceil(pc.life * 6)))
        html += `<span class="${pc.kind === 'warm' ? 'w' : 'fr'}${Math.min(lvl, 4)}">${esc(pc.ch)}</span>`
        continue
      }

      // Layer 5: ghost trails
      const gc = ghostCells.get(key)
      if (gc && gc.opacity > 0.03) {
        html += `<span class="fr${Math.max(1, Math.min(3, Math.ceil(gc.opacity * 4)))}">${esc(gc.ch)}</span>`
        continue
      }

      // Layer 6: frost grid
      const fLvl = frostLevel[gy * COLS + gx]!
      if (fLvl > 0) {
        // Inside clear circle? don't render frost
        if (clearR > 0) {
          const dx = gx - clearCX, dy = (gy - clearCY) * 0.7
          if (dx * dx + dy * dy < clearR * clearR) {
            // Warm glow inside the cleared area
            if (warmRadiance > 0.1) {
              const d = Math.sqrt(dx * dx + dy * dy)
              const warmI = warmRadiance * Math.max(0, 1 - d / (clearR + 2))
              if (h(seed + fi * 7) < warmI * 0.15) {
                html += `<span class="w${Math.max(1, Math.min(4, Math.ceil(warmI * 4)))}">${esc(WARM_CHARS[Math.floor(h(seed + fi * 19) * WARM_CHARS.length)]!)}</span>`
                continue
              }
            }
            html += ' '; continue
          }
        }
        html += `<span class="fr${fLvl}">${esc(frostChar[gy * COLS + gx]!)}</span>`
        continue
      }

      // Layer 7: ambient noise (like lotus noise_chars)
      if (h(seed + fi * 13) < 0.02) {
        html += `<span class="n1">${esc(NOISE_CHARS[Math.floor(h(seed + fi * 31) * NOISE_CHARS.length)]!)}</span>`
      } else {
        html += ' '
      }
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
