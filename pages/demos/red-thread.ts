import { prepareWithSegments } from '../../src/layout.ts'

// ---- config ----

const COLS = 90
const ROWS = 48
const FONT_SIZE = 14
const CYCLE_DURATION = 14000
const HOLD_DURATION = 5000

const TRUNK_CHARS = '#|!I][:;'
const BRANCH_CHARS = '/\\~-=<>^'
const LEAF_CHARS = '*oO0@&%$'
const FRUIT_CHARS = '@0OQ'
const GROUND_CHARS = '_.,-~'
const SEED_CHARS = 'o.'
const NOISE_CHARS = '&*$%^#@!?~+={}<>|/\\:;.,`()[]0123456789abcdefghijklmnopqrstuvwxyz'

// Pretext measures each character for the stats display
const FONT = `${FONT_SIZE}px "SF Mono","Cascadia Code",Consolas,monospace`
const allCharsSet = new Set(TRUNK_CHARS + BRANCH_CHARS + LEAF_CHARS + FRUIT_CHARS + GROUND_CHARS + SEED_CHARS + NOISE_CHARS)
const charWidths = new Map<string, number>()
for (const ch of allCharsSet) {
  const p = prepareWithSegments(ch, FONT)
  charWidths.set(ch, p.widths.length > 0 ? p.widths[0]! : FONT_SIZE * 0.6)
}

// ---- offscreen canvas for tree shape ----

const CW = 440, CH = 400
const treeCvs = document.createElement('canvas')
treeCvs.width = CW; treeCvs.height = CH
const tCtxRaw = treeCvs.getContext('2d')
if (!tCtxRaw) throw new Error('no ctx')
const tCtx = tCtxRaw

function drawBranch(
  x: number, y: number, angle: number, len: number, thick: number,
  depth: number, maxDepth: number, growT: number,
): void {
  const depthT = depth / maxDepth
  const localT = Math.max(0, Math.min(1, (growT - depthT * 0.45) / 0.55))
  if (localT <= 0) return

  const actualLen = len * localT
  const ex = x + Math.cos(angle) * actualLen
  const ey = y + Math.sin(angle) * actualLen

  // trunk/branch (R channel)
  const alpha = Math.min(1, thick / 2.5)
  tCtx.strokeStyle = `rgba(${Math.round(alpha * 255)}, 0, 0, 1)`
  tCtx.lineWidth = thick * localT
  tCtx.lineCap = 'round'
  tCtx.beginPath()
  tCtx.moveTo(x, y); tCtx.lineTo(ex, ey)
  tCtx.stroke()

  if (depth >= maxDepth) {
    // leaves (G channel)
    const leafT = Math.max(0, Math.min(1, (growT - 0.45) / 0.3))
    if (leafT > 0) {
      const lr = (12 + len * 0.4) * leafT
      const grad = tCtx.createRadialGradient(ex, ey, 0, ex, ey, lr)
      grad.addColorStop(0, `rgba(0, ${Math.round(leafT * 220)}, 0, 1)`)
      grad.addColorStop(0.6, `rgba(0, ${Math.round(leafT * 120)}, 0, 1)`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      tCtx.fillStyle = grad
      tCtx.beginPath(); tCtx.arc(ex, ey, lr, 0, Math.PI * 2); tCtx.fill()
    }
    // fruit (B channel)
    const fruitT = Math.max(0, Math.min(1, (growT - 0.8) / 0.2))
    if (fruitT > 0 && depth % 2 === 0) {
      tCtx.fillStyle = `rgba(0, 0, ${Math.round(fruitT * 255)}, 1)`
      tCtx.beginPath()
      tCtx.arc(ex + Math.cos(angle + 0.6) * 7, ey + Math.sin(angle + 0.6) * 7, 5 * fruitT, 0, Math.PI * 2)
      tCtx.fill()
    }
    return
  }

  const branchT = Math.max(0, (localT - 0.35) / 0.65)
  if (branchT <= 0) return
  const spread = 0.42 + depth * 0.07
  const shrink = 0.67 + Math.sin(depth * 3.7) * 0.04
  drawBranch(ex, ey, angle - spread, len * shrink, thick * 0.62, depth + 1, maxDepth, growT)
  drawBranch(ex, ey, angle + spread, len * shrink, thick * 0.62, depth + 1, maxDepth, growT)
  if (depth < 3) {
    drawBranch(ex, ey, angle + Math.sin(depth * 7) * 0.12, len * shrink * 0.75, thick * 0.45, depth + 1, maxDepth, growT)
  }
}

function renderTree(growT: number): void {
  tCtx.clearRect(0, 0, CW, CH)
  tCtx.globalCompositeOperation = 'lighter'
  const bx = CW / 2, by = CH - 18
  drawBranch(bx, by, -Math.PI / 2, 70 + growT * 25, 4.5 + growT * 3.5, 0, 7, growT)
  tCtx.globalCompositeOperation = 'source-over'
  // seed
  if (growT < 0.15) {
    const sa = 1 - growT / 0.15
    tCtx.fillStyle = `rgba(${Math.round(sa * 200)}, ${Math.round(sa * 100)}, 0, 1)`
    tCtx.beginPath(); tCtx.arc(bx, by - 3, 4 * (1 - growT / 0.15), 0, Math.PI * 2); tCtx.fill()
  }
}

// ---- sample ----

type CellType = 'empty' | 'seed' | 'trunk' | 'branch' | 'leaf' | 'fruit' | 'ground'

function sampleGrid(growT: number): { type: CellType; brightness: number }[] {
  const img = tCtx.getImageData(0, 0, CW, CH).data
  const sx = CW / COLS, sy = CH / ROWS
  const grid: { type: CellType; brightness: number }[] = new Array(COLS * ROWS)

  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const px = Math.floor(gx * sx + sx / 2)
      const py = Math.floor(gy * sy + sy / 2)
      const idx = (py * CW + px) * 4
      const tr = (img[idx] ?? 0) / 255
      const lf = (img[idx + 1] ?? 0) / 255
      const fr = (img[idx + 2] ?? 0) / 255

      let type: CellType = 'empty'
      let brightness = 0
      if (fr > 0.15) { type = 'fruit'; brightness = fr }
      else if (lf > 0.06) { type = 'leaf'; brightness = lf }
      else if (tr > 0.06) {
        type = gy > ROWS * 0.55 && Math.abs(gx - COLS / 2) < COLS * 0.08 ? 'trunk' : 'branch'
        brightness = tr
      }

      if (type === 'empty' && growT < 0.15 && gy >= ROWS - 4 && Math.abs(gx - COLS / 2) < 2) {
        const sb = (1 - growT / 0.15) * 0.6
        if (sb > 0.05) { type = 'seed'; brightness = sb }
      }
      if (type === 'empty' && gy >= ROWS - 2) {
        const d = Math.abs(gx - COLS / 2) / (COLS / 2)
        const gb = Math.max(0, 0.18 - d * 0.18) * Math.min(1, growT * 4)
        if (gb > 0.02) { type = 'ground'; brightness = gb }
      }
      grid[gy * COLS + gx] = { type, brightness }
    }
  }
  return grid
}

// ---- pick char + color class ----

function pickChar(type: CellType, gx: number, gy: number): string {
  const h = ((gx * 73 + gy * 137) * 2654435761) >>> 0
  let chars: string
  switch (type) {
    case 'trunk': chars = TRUNK_CHARS; break
    case 'branch': chars = BRANCH_CHARS; break
    case 'leaf': chars = LEAF_CHARS; break
    case 'fruit': chars = FRUIT_CHARS; break
    case 'ground': chars = GROUND_CHARS; break
    case 'seed': chars = SEED_CHARS; break
    default: return ' '
  }
  return chars[h % chars.length]!
}

function colorClass(type: CellType, brightness: number): string {
  const lvl = Math.max(1, Math.min(6, Math.ceil(brightness * 6)))
  switch (type) {
    case 'trunk': case 'branch': return `t${lvl}`
    case 'leaf': return `l${lvl}`
    case 'fruit': return `f${Math.min(4, lvl)}`
    case 'ground': return `g${Math.min(2, lvl)}`
    case 'seed': return `t${Math.min(4, lvl)}`
    default: return ''
  }
}

function esc(c: string): string {
  if (c === '<') return '&lt;'; if (c === '>') return '&gt;'; if (c === '&') return '&amp;'; return c
}

// ---- DOM ----

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; artEl.appendChild(el); rowEls.push(el)
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// ---- render ----

function frame(time: number): void {
  const total = CYCLE_DURATION + HOLD_DURATION
  const cycleT = (time % total) / total
  const gp = CYCLE_DURATION / total
  const growT = cycleT < gp ? easeInOutCubic(cycleT / gp) : 1

  renderTree(growT)
  const grid = sampleGrid(growT)
  const nSeed = Math.floor(time / 100)

  for (let gy = 0; gy < ROWS; gy++) {
    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const cell = grid[gy * COLS + gx]!

      if (cell.type === 'empty' || cell.brightness < 0.03) {
        const nh = ((gx * 31 + gy * 97 + nSeed * 13) * 2654435761) >>> 0
        if ((nh & 0xff) < 18) {
          const nch = NOISE_CHARS[(nh >>> 8) % NOISE_CHARS.length]!
          const nl = 1 + ((nh >>> 16) % 3)
          html += `<span class="n${nl}">${esc(nch)}</span>`
        } else {
          html += ' '
        }
        continue
      }

      html += `<span class="${colorClass(cell.type, cell.brightness)}">${esc(pickChar(cell.type, gx, gy))}</span>`
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
