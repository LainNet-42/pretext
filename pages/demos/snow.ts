import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  SNOW  -  45x64 portrait, ~30s
//
//  Text falls -> absorbed by crystal -> crystal grows (6-fold
//  symmetric snowflake) -> dissolves -> fragments rise
//
//  Crystal = the "lotus" of this animation
// ============================================================

const COLS = 45
const ROWS = 64
const SUB_ROW = 6
const CRYSTAL_CX = Math.floor(COLS / 2)
const CRYSTAL_CY = 34
const GROUND_ROW = 58

// ---- chars ----
const CH_NOISE = '.,:;\'`'
const CH_GROUND = '.,;:_-`\''
const CH_FALL = '.:,;*'
const CH_GLOW = '.,:;`'

// ---- script ----
const SCRIPT = [
  '......',
  '\u96EA,\u9759\u304B\u306B\u964D\u308B',
  '\u767D\u3044\u4E16\u754C',
  '\u97F3\u3082\u306A\u304F,\u7A4D\u3082\u308B',
  '\u51B7\u305F\u3044,\u3067\u3082\u67D4\u3089\u304B\u3044',
  '\u5168\u90E8,\u6EB6\u3051\u308B',
  '\u6C34\u306B\u306A\u308B,\u307E\u305F\u7A7A\u3078',
  '\u305D\u308C\u3067\u3044\u3044\u3002',
]
const SCRIPT_CN = [
  '',
  '(\u96EA\uFF0C\u9759\u9759\u5730\u843D\u4E0B)',
  '(\u767D\u8272\u7684\u4E16\u754C)',
  '(\u65E0\u58F0\u5730\uFF0C\u5806\u79EF)',
  '(\u51B7\uFF0C\u4F46\u662F\u67D4\u8F6F)',
  '(\u5168\u90E8\uFF0C\u878D\u5316)',
  '(\u5316\u4E3A\u6C34\uFF0C\u518D\u56DE\u5230\u5929\u7A7A)',
  '(\u8FD9\u6837\u5C31\u597D\u3002)',
]
const TIMING: [number, number, number][] = [
  [0.2,  1.2,  0.1],   // dots slow
  [1.8,  1.60, 0.4],   // seg1
  [4.5,  0.90, 0.4],   // seg2
  [6.5,  1.50, 0.4],   // seg3
  [9.0,  1.80, 0.5],   // seg4
  [12.0, 1.20, 0.3],   // seg5 melt trigger
  [15.0, 1.80, 1.0],   // seg6
  [18.5, 1.40, 2.0],   // seg7
]

// ---- pretext ----
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'
const allC = new Set(CH_NOISE + CH_GROUND + CH_FALL + CH_GLOW + '|/\\-*+.:' + SCRIPT.join('') + SCRIPT_CN.join(''))
for (const c of allC) prepareWithSegments(c, FONT)

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
function pk(s: string, seed: number): string { return s[Math.floor(H(seed) * s.length)]! }

function wind(s: number): number {
  let w = Math.sin(s * 0.25) * 0.3 + Math.sin(s * 0.11 + 2) * 0.15
  if (s > 9 && s < 11) w += Math.sin((s - 9) / 2 * Math.PI) * 0.5  // gust during line 4
  if (s > 13 && s < 17) w *= 0.3  // calm during dissolution
  return w
}

// ============================================================
//  SNOW PARTICLES (atmosphere only)
// ============================================================

interface Flake { x: number; y: number; vx: number; vy: number; far: boolean; phase: number }
const flakes: Flake[] = []

function seedFlakes(): void {
  for (let i = 0; i < 80; i++) {
    const far = Math.random() < 0.4
    flakes.push({
      x: Math.random() * COLS, y: Math.random() * ROWS * 0.9,
      vx: (Math.random() - 0.5) * 0.03,
      vy: far ? 0.02 + Math.random() * 0.03 : 0.06 + Math.random() * 0.1,
      far, phase: Math.random() * 6.28,
    })
  }
}
seedFlakes()

function snowDensity(s: number): number {
  if (s < 1.5) return 0.3 + s * 0.15
  if (s < 6) return 0.6 + (s - 1.5) * 0.09
  if (s < 12) return 1.0
  if (s < 16) return 0.6 - (s - 12) * 0.12
  if (s < 22) return 0.15
  return 0.05
}

function spawnFlakes(s: number): void {
  const d = snowDensity(s)
  if (d <= 0 || flakes.length >= 350) return
  const n = Math.floor(d * 6) + (Math.random() < (d * 6) % 1 ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const far = Math.random() < 0.35
    flakes.push({
      x: Math.random() * (COLS + 6) - 3, y: -1 - Math.random() * 8,
      vx: 0, vy: far ? 0.02 + Math.random() * 0.03 : 0.06 + Math.random() * 0.12,
      far, phase: Math.random() * 6.28,
    })
  }
}

function updateFlakes(s: number): void {
  const w = wind(s)
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i]!
    const wm = f.far ? 0.3 : 1.0
    f.vx = f.vx * 0.99 + w * wm * 0.01 + Math.sin(s * 1.2 + f.phase) * 0.003
    f.x += f.vx; f.y += f.vy
    if (f.x < -4) f.x += COLS + 8; if (f.x > COLS + 4) f.x -= COLS + 8
    if (f.y > ROWS + 3) flakes.splice(i, 1)
  }
}

// ============================================================
//  CRYSTAL (the main visual - 6-fold symmetric snowflake)
// ============================================================

const DIRS: [number, number, string][] = [
  [0, -1, '|'],  [1, -1, '/'],  [1, 1, '\\'],
  [0, 1, '|'],   [-1, 1, '/'],  [-1, -1, '\\'],
]

let crystalEnergy = 0    // 0..1 drives growth
let crystalTarget = 0    // smooth target
let dissolving = false
let dissolveT = 0

interface CCell { x: number; y: number; ch: string; dist: number; depth: number }

function buildCrystal(): CCell[] {
  const e = crystalEnergy
  if (e <= 0.01) return []
  const cells: CCell[] = []
  const maxR = Math.floor(e * 12)
  if (maxR < 1) return [{ x: CRYSTAL_CX, y: CRYSTAL_CY, ch: '*', dist: 0, depth: 0 }]

  cells.push({ x: CRYSTAL_CX, y: CRYSTAL_CY, ch: '*', dist: 0, depth: 0 })

  for (let b = 0; b < 6; b++) {
    const [dx, dy, ch] = DIRS[b]!
    for (let d = 1; d <= maxR; d++) {
      const x = CRYSTAL_CX + dx * d, y = CRYSTAL_CY + dy * d
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue
      // junction chars at branch points
      const jct = (d % 3 === 0 && d < maxR) ? '+' : (d === maxR ? '.' : ch)
      cells.push({ x, y, ch: jct, dist: d, depth: 1 })

      // sub-branches at every 3rd step
      if (d >= 3 && d % 3 === 0) {
        const subMax = Math.max(0, Math.floor((e * 12 - d) * 0.45))
        if (subMax < 1) continue
        for (const si of [(b + 1) % 6, (b + 5) % 6]) {
          const [sdx, sdy, sch] = DIRS[si]!
          for (let sd = 1; sd <= subMax; sd++) {
            const sx = x + sdx * sd, sy = y + sdy * sd
            if (sx < 0 || sx >= COLS || sy < 0 || sy >= ROWS) continue
            const sch2 = sd === subMax ? '.' : sch
            cells.push({ x: sx, y: sy, ch: sch2, dist: d + sd, depth: 2 })
          }
        }
      }
    }
  }

  // during dissolution, trim from outside in
  if (dissolving && dissolveT > 0) {
    const keepR = maxR * Math.max(0, 1 - dissolveT)
    return cells.filter(c => c.dist <= keepR)
  }
  return cells
}

// ============================================================
//  ABSORPTION PARTICLES (text chars -> crystal)
// ============================================================

interface AbsorbP { ch: string; x: number; y: number; startX: number; startY: number; prog: number; cjkW: number }
const absorbPs: AbsorbP[] = []

function spawnAbsorb(text: string, startX: number): void {
  const offs = coffs(text)
  for (let j = 0; j < text.length; j++) {
    const ch = text[j]!
    const gx = startX + offs[j]!
    absorbPs.push({
      ch, x: gx, y: SUB_ROW, startX: gx, startY: SUB_ROW,
      prog: 0, cjkW: isCJK(ch.charCodeAt(0)) ? 2 : 1,
    })
  }
}

function updateAbsorb(): void {
  for (let i = absorbPs.length - 1; i >= 0; i--) {
    const p = absorbPs[i]!
    p.prog = Math.min(1, p.prog + 0.02) // ~50 frames (~0.8s)
    const ease = p.prog < 0.3 ? p.prog / 0.3 * 0.1 : 0.1 + (p.prog - 0.3) / 0.7 * 0.9 // slow start, accelerate
    const t = ease
    p.x = p.startX + (CRYSTAL_CX - p.startX) * t
    p.y = p.startY + (CRYSTAL_CY - p.startY) * t
    if (p.prog >= 1) {
      crystalTarget = Math.min(1, crystalTarget + 0.025)
      absorbPs.splice(i, 1)
    }
  }
}

// ============================================================
//  DISSOLUTION PARTICLES (crystal -> upward vapor)
// ============================================================

interface VaporP { x: number; y: number; vy: number; vx: number; life: number; ch: string }
const vapors: VaporP[] = []

function spawnDissolutionVapor(cells: CCell[]): void {
  // spawn rising particles from the dissolving outer edge
  for (const c of cells) {
    if (Math.random() < 0.08) {
      vapors.push({
        x: c.x + (Math.random() - 0.5) * 0.5, y: c.y,
        vy: -(0.03 + Math.random() * 0.06), vx: (Math.random() - 0.5) * 0.05,
        life: 0.8 + Math.random() * 0.2, ch: c.ch,
      })
    }
  }
}

function updateVapor(s: number): void {
  const w = wind(s) * 0.15
  for (let i = vapors.length - 1; i >= 0; i--) {
    const v = vapors[i]!
    v.vx += w * 0.005 + (Math.random() - 0.5) * 0.008
    v.x += v.vx; v.y += v.vy; v.life -= 0.004
    if (v.life <= 0 || v.y < -2) vapors.splice(i, 1)
  }
}

// ============================================================
//  LINE STATE MACHINE
// ============================================================

const enum St { WAIT, TYPE, HOLD, ABSORB, DISSOLVE, FADE, SHOW, GONE }

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

function lineStartX(ln: Line): number { return Math.floor((COLS - vw(ln.text)) / 2) }

function updateLines(s: number): void {
  for (let i = 0; i < L.length; i++) {
    const ln = L[i]!
    switch (ln.st) {
      case St.WAIT:
        if (s < ln.at) break
        if (i === 7) { ln.st = St.FADE; ln.t0 = s; ln.prog = 0 }
        else { ln.st = St.TYPE; ln.t0 = s; ln.typed = 0; ln.cnTyped = 0 }
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
          if (i === 0) {
            // dots dissolve quietly
            ln.st = St.DISSOLVE; ln.prog = 0; ln.t0 = s
          } else if (i >= 1 && i <= 4) {
            // text absorbed by crystal
            ln.st = St.ABSORB; ln.prog = 0; ln.t0 = s
            spawnAbsorb(ln.text, lineStartX(ln))
          } else if (i === 5) {
            // trigger crystal dissolution
            ln.st = St.DISSOLVE; ln.prog = 0; ln.t0 = s
            dissolving = true
          } else if (i === 6) {
            ln.st = St.SHOW
          } else {
            ln.st = St.SHOW
          }
        }
        break
      }

      case St.ABSORB: {
        // text fades as chars fly away
        ln.prog = Math.min(1, (s - ln.t0) / 1.0)
        if (ln.prog >= 1) ln.st = St.GONE
        break
      }

      case St.DISSOLVE: {
        ln.prog = Math.min(1, (s - ln.t0) / 1.2)
        if (ln.prog >= 1) ln.st = St.GONE
        break
      }

      case St.FADE: {
        ln.prog = Math.min(1, (s - ln.t0) / 2.0)
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(ln.prog * ln.cn.length))
        if (ln.prog >= 1) ln.st = St.SHOW
        break
      }

      case St.SHOW:
        ln.cnTyped = ln.cn.length
        break

      case St.GONE:
        break
    }
  }

  // crystal growth: smooth toward target
  if (!dissolving) {
    crystalEnergy += (crystalTarget - crystalEnergy) * 0.03
  } else {
    dissolveT = Math.min(1, dissolveT + 0.006)
    crystalEnergy = Math.max(0, crystalEnergy * (1 - dissolveT * 0.02))
  }
}

// ============================================================
//  TIMING
// ============================================================

const CLOSE_AT = 23.0, CLOSE_DUR = 4.0
const BLACK_AT = 27.5, BLACK_DUR = 2.0, TOTAL = 30.0

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

let startT: number | null = null

function frame(now: number): void {
  if (startT === null) startT = now
  const ms = now - startT; const s = ms / 1000

  if (s > TOTAL) {
    startT = now; flakes.length = 0; absorbPs.length = 0; vapors.length = 0
    crystalEnergy = 0; crystalTarget = 0; dissolving = false; dissolveT = 0
    for (let i = 0; i < L.length; i++) Object.assign(L[i]!, mkLine(i))
    seedFlakes()
    requestAnimationFrame(frame); return
  }

  const fi = Math.floor(ms / 80)

  // ---- simulate ----
  spawnFlakes(s); updateFlakes(s)
  updateLines(s); updateAbsorb(); updateVapor(s)

  // build crystal cells
  const crystalCells = buildCrystal()
  // spawn dissolution vapor periodically
  if (dissolving && dissolveT > 0.05 && dissolveT < 0.9 && Math.random() < 0.15) {
    spawnDissolutionVapor(crystalCells)
  }

  // frost close
  let frostR = 0
  if (s >= CLOSE_AT) {
    const t = Math.min(1, (s - CLOSE_AT) / CLOSE_DUR)
    frostR = (t * t * (3 - 2 * t)) * (COLS / 2 + 4)
  }

  // fade to black
  const gfade = s >= BLACK_AT ? Math.max(0, 1 - (s - BLACK_AT) / BLACK_DUR) : 1.0

  // ---- build cell maps ----

  // text cells
  const txtM = new Map<string, { ch: string; cls: string }>()
  const cnM = new Map<string, { ch: string; cls: string }>()

  for (let i = 0; i < L.length; i++) {
    const ln = L[i]!
    if (ln.st === St.WAIT || ln.st === St.GONE) continue

    const row = i === 7 ? 5 : SUB_ROW
    let txt = ''
    if (ln.st === St.TYPE) txt = ln.text.slice(0, ln.typed)
    else if (ln.st === St.FADE) txt = ln.text
    else if (ln.st === St.ABSORB || ln.st === St.DISSOLVE) txt = ln.text
    else if (ln.st === St.HOLD || ln.st === St.SHOW) txt = ln.text
    if (!txt) continue

    const sx = lineStartX(ln), offs = coffs(txt)

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
      } else if (ln.st === St.ABSORB) {
        // text fades as chars are absorbed
        if (H(j * 31 + Math.floor(ln.prog * 10)) < ln.prog) continue
        cls = `s${cl(Math.ceil((1 - ln.prog) * 6), 1, 6)}`
      } else if (ln.st === St.DISSOLVE) {
        if (i === 0) {
          if (H(j * 31 + Math.floor(ln.prog * 8)) < ln.prog) continue
          cls = `s${cl(Math.ceil((1 - ln.prog) * 2), 1, 2)}`
        } else {
          if (H(j * 31 + Math.floor(ln.prog * 10)) < ln.prog) continue
          cls = `s${cl(Math.ceil((1 - ln.prog) * 6), 1, 6)}`
        }
      } else if (ln.st === St.FADE) {
        cls = `fs${cl(Math.ceil(ln.prog * 5), 1, 5)}`
      }

      txtM.set(`${gx},${row}`, { ch, cls })
      if (cw === 2) txtM.set(`${gx + 1},${row}`, { ch: '', cls: '' })
    }

    // CN subtitle
    const cnRow = i === 7 ? 6 : row + 1
    if (ln.cn && ln.cnTyped > 0 && (ln.st === St.TYPE || ln.st === St.HOLD || ln.st === St.FADE || ln.st === St.SHOW)) {
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

  // crystal cell map
  const crM = new Map<string, CCell>()
  for (const c of crystalCells) {
    if (c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS)
      crM.set(`${c.x},${c.y}`, c)
  }

  // flake cells
  const flakeM = new Map<string, boolean>() // key -> far?
  for (const f of flakes) {
    const gx = Math.round(f.x), gy = Math.round(f.y)
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS)
      flakeM.set(`${gx},${gy}`, f.far)
  }

  // absorption cells
  const abM = new Map<string, AbsorbP>()
  for (const p of absorbPs) {
    const gx = Math.round(p.x), gy = Math.round(p.y)
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS)
      abM.set(`${gx},${gy}`, p)
  }

  // vapor cells
  const vpM = new Map<string, number>()
  for (const v of vapors) {
    const gx = Math.round(v.x), gy = Math.round(v.y)
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS)
      vpM.set(`${gx},${gy}`, v.life)
  }

  // ============================================================
  //  RENDER
  // ============================================================

  // pre-compute crystal glow radius
  const glowR = crystalEnergy * 16

  for (let gy = 0; gy < ROWS; gy++) {
    if (gfade <= 0) { rowEls[gy]!.innerHTML = ''; continue }

    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + gy * 137
      const key = `${gx},${gy}`

      // --- FROST CLOSE ---
      if (frostR > 0) {
        const edX = Math.min(gx, COLS - 1 - gx), edY = Math.min(gy, ROWS - 1 - gy)
        const ed = Math.min(edX, edY * 0.7)
        if (ed < frostR) {
          const depth = frostR - ed
          const h1 = H(gx * 73 + gy * 137 + 5000), h2 = H(gx * 31 + gy * 97 + 8000)
          const fill = depth > 3 ? 1 : depth > 1.5 ? 0.5 + depth * 0.12 : (h1 * 0.6 + h2 * 0.4) < depth * 0.35 ? 1 : 0
          if (fill > 0) {
            // text resists frost
            const tc = txtM.get(key)
            if (tc && tc.ch && depth < 5) {
              const iceLvl = cl(Math.ceil(depth / 5 * 3), 1, 3)
              html += `<span class="cr${iceLvl}">${esc(tc.ch)}</span>`; continue
            }
            const lvl = depth < 2 ? 5 : depth < 4 ? 4 : cl(Math.ceil((1 - depth / (COLS / 2)) * 5), 2, 5)
            const fch = '|/\\-+*.:'.charAt(Math.floor(H(seed + 999) * 8))
            html += `<span class="cr${frostR > COLS / 2 + 1 ? 6 : lvl}">${esc(fch)}</span>`; continue
          }
        }
      }

      // --- TEXT ---
      const tc = txtM.get(key)
      if (tc) { if (!tc.ch) continue; html += `<span class="${tc.cls}">${esc(tc.ch)}</span>`; continue }

      // --- CN ---
      const cc = cnM.get(key)
      if (cc) { if (!cc.ch) continue; html += `<span class="${cc.cls}">${esc(cc.ch)}</span>`; continue }

      // --- ABSORPTION PARTICLES ---
      const ab = abM.get(key)
      if (ab) {
        // white -> ice blue as they approach crystal
        const lvl = ab.prog < 0.5 ? cl(Math.ceil((1 - ab.prog * 2) * 4), 1, 4) : cl(Math.ceil((1 - ab.prog) * 4), 1, 4)
        // show actual text character flying
        html += `<span class="ab${lvl}">${esc(ab.ch)}</span>`; continue
      }

      // --- CRYSTAL ---
      const cr = crM.get(key)
      if (cr) {
        // brightness: center bright, edges dim; depth 0 brightest
        const maxDist = Math.max(1, crystalEnergy * 12)
        const distFade = 1 - cr.dist / (maxDist + 2) * 0.6
        const depthFade = cr.depth === 0 ? 1 : cr.depth === 1 ? 0.85 : 0.65
        const brightness = distFade * depthFade
        // shimmer: occasional bright flash on crystal cells
        const shimmer = H(seed + fi * 11) < 0.03 ? 0.3 : 0
        const lvl = cl(Math.ceil((brightness + shimmer) * 6), 1, 6)
        html += `<span class="cr${lvl}">${esc(cr.ch)}</span>`; continue
      }

      // --- VAPOR (dissolution particles rising) ---
      const vp = vpM.get(key)
      if (vp !== undefined) {
        html += `<span class="vp${cl(Math.ceil(vp * 4), 1, 4)}">${esc(pk(CH_FALL, seed + fi))}</span>`; continue
      }

      // --- SNOW FLAKES ---
      const fl = flakeM.get(key)
      if (fl !== undefined) {
        if (fl) { // far
          html += `<span class="sf${cl(1 + Math.floor(H(seed + fi) * 3), 1, 3)}">${esc(pk(CH_FALL, seed))}</span>`
        } else { // near
          html += `<span class="sn${cl(1 + Math.floor(H(seed + fi) * 4), 1, 4)}">${esc(pk(CH_FALL, seed))}</span>`
        }
        continue
      }

      // --- CRYSTAL GLOW (ambient light near crystal) ---
      if (glowR > 0) {
        const dx = gx - CRYSTAL_CX, dy = (gy - CRYSTAL_CY) * 0.7
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < glowR) {
          const intensity = (1 - dist / glowR) * crystalEnergy
          if (H(seed + fi * 7) < intensity * 0.08) {
            html += `<span class="cg${cl(Math.ceil(intensity * 3), 1, 3)}">${esc(pk(CH_GLOW, seed + fi * 13))}</span>`
            continue
          }
        }
      }

      // --- GROUND ---
      if (gy >= GROUND_ROW) {
        const gDepth = gy - GROUND_ROW
        const density = gDepth === 0 ? 0.25 : gDepth <= 2 ? 0.15 : 0.08
        if (H(seed + fi * 3) < density) {
          html += `<span class="gd${cl(3 - gDepth, 1, 3)}">${esc(pk(CH_GROUND, seed))}</span>`
        } else html += ' '
        continue
      }

      // --- AMBIENT NOISE ---
      if (H(seed + fi * 13) < 0.015) {
        html += `<span class="n${1 + Math.floor(H(seed * 5) * 3)}">${esc(pk(CH_NOISE, seed + fi * 31))}</span>`
      } else html += ' '
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
