import { prepareWithSegments, layoutNextLine } from '../../src/layout.ts'
import type { PreparedTextWithSegments, LayoutCursor } from '../../src/layout.ts'

// ============================================================
//  Snowman — pretext-native text flow through a growing shape
//
//  The story text flows through a snowman silhouette using
//  layoutNextLine (the same API Bad Apple uses). The silhouette
//  grows over time: bottom ball → mid ball → head. Text reflows
//  to fill whatever shape exists at the current moment. Features
//  (eyes, nose, mouth, scarf, hat) are small accent chars placed
//  on top after their sentences activate.
// ============================================================

const COLS = 45
const ROWS = 64
const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'
const PX_PER_COL = 7.8
const GROUND = 54
const CX = 22

// ============================================================
//  Script — the story AND the fill material
// ============================================================

const STORY = '\u4E0B\u96EA\u4E86\u3002\u597D\u5927\u7684\u96EA\u3002\u6EDA\u4E00\u4E2A\u5927\u96EA\u7403\u3002\u518D\u6EDA\u4E00\u4E2A\u3002\u53E0\u4E0A\u53BB\u3002\u6700\u540E\u4E00\u4E2A\uFF0C\u5C0F\u5C0F\u7684\u3002\u7ED9\u5B83\u4E24\u53EA\u773C\u775B\u3002\u4E00\u4E2A\u80E1\u841D\u535C\u9F3B\u5B50\u3002\u7B11\u4E00\u4E2A\u3002\u56F4\u4E0A\u56F4\u5DFE\u3002\u6234\u4E0A\u5E3D\u5B50\u3002\u4F60\u597D\u5440\uFF0C\u96EA\u4EBA\u3002'

const SENTENCES = [
  '\u4E0B\u96EA\u4E86\u3002',
  '\u597D\u5927\u7684\u96EA\u3002',
  '\u6EDA\u4E00\u4E2A\u5927\u96EA\u7403\u3002',
  '\u518D\u6EDA\u4E00\u4E2A\u3002',
  '\u53E0\u4E0A\u53BB\u3002',
  '\u6700\u540E\u4E00\u4E2A\uFF0C\u5C0F\u5C0F\u7684\u3002',
  '\u7ED9\u5B83\u4E24\u53EA\u773C\u775B\u3002',
  '\u4E00\u4E2A\u80E1\u841D\u535C\u9F3B\u5B50\u3002',
  '\u7B11\u4E00\u4E2A\u3002',
  '\u56F4\u4E0A\u56F4\u5DFE\u3002',
  '\u6234\u4E0A\u5E3D\u5B50\u3002',
  '\u4F60\u597D\u5440\uFF0C\u96EA\u4EBA\u3002',
]

// [activateAt, holdBright]
const TIMING: [number, number][] = [
  [1.0,  1.5],
  [3.5,  1.5],
  [6.0,  2.0],
  [9.0,  1.5],
  [11.5, 1.5],
  [14.0, 2.0],
  [17.0, 1.5],
  [19.5, 1.5],
  [22.0, 1.5],
  [24.5, 1.5],
  [27.0, 1.5],
  [29.5, 3.0],
]

const TOTAL = 35.0

// Which shape stage does each sentence unlock?
// 0 = nothing, 1 = bottom ball, 2 = +mid, 3 = +head
const STAGE_MAP = [0, 0, 1, 1, 2, 3, 3, 3, 3, 3, 3, 3]

// ============================================================
//  Helpers
// ============================================================

function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x303F)
}
function vw(t: string): number {
  let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w
}
function coffs(t: string): number[] {
  const o: number[] = []; let c = 0
  for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }
  return o
}
function H(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }
function cl(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v }

// ============================================================
//  Snowman shape — per-row width segments for three ellipses
// ============================================================

// Ellipse half-width at a given row (0 if outside)
function ellipseHalfW(y: number, cy: number, rx: number, ry: number): number {
  const ny = (y - cy) / ry
  if (ny * ny > 1) return 0
  return Math.floor(rx * Math.sqrt(1 - ny * ny))
}

const BOT_CY = GROUND - 6, BOT_RX = 11, BOT_RY = 6
const MID_CY = GROUND - 15, MID_RX = 8, MID_RY = 4
const HEAD_CY = GROUND - 22, HEAD_RX = 6, HEAD_RY = 3

// For a given stage (0-3), compute the width (in cols) of the snowman
// silhouette at row y. Returns [leftCol, width] or null if row is outside.
function shapeAtRow(y: number, stage: number): [number, number] | null {
  let hw = 0
  if (stage >= 1) hw = Math.max(hw, ellipseHalfW(y, BOT_CY, BOT_RX, BOT_RY))
  if (stage >= 2) hw = Math.max(hw, ellipseHalfW(y, MID_CY, MID_RX, MID_RY))
  if (stage >= 3) hw = Math.max(hw, ellipseHalfW(y, HEAD_CY, HEAD_RX, HEAD_RY))
  if (hw <= 0) return null
  const left = CX - hw
  const width = hw * 2 + 1
  return [left, width]
}

// ============================================================
//  Features — accent chars placed after their sentence activates
// ============================================================

interface Feature { x: number; y: number; ch: string; cls: string; sentenceIdx: number }
const FEATURES: Feature[] = [
  { x: CX - 2, y: HEAD_CY - 1, ch: '\u25CF', cls: 'coal', sentenceIdx: 6 },
  { x: CX + 2, y: HEAD_CY - 1, ch: '\u25CF', cls: 'coal', sentenceIdx: 6 },
  { x: CX + 1, y: HEAD_CY,     ch: '\u25B8', cls: 'nose', sentenceIdx: 7 },
  { x: CX - 1, y: HEAD_CY + 1, ch: '\u203F', cls: 'coal', sentenceIdx: 8 },
  // Scarf
  ...Array.from({ length: 13 }, (_, i) => ({
    x: CX - 6 + i, y: MID_CY - 4, ch: '\u2550', cls: 'sc3', sentenceIdx: 9,
  })),
  { x: CX + 6, y: MID_CY - 3, ch: '\\', cls: 'sc2', sentenceIdx: 9 },
  { x: CX + 7, y: MID_CY - 2, ch: '\\', cls: 'sc1', sentenceIdx: 9 },
  // Hat
  ...Array.from({ length: 9 }, (_, i) => ({
    x: CX - 4 + i, y: HEAD_CY - 4, ch: '\u2550', cls: 'hat3', sentenceIdx: 10,
  })),
  ...Array.from({ length: 15 }, (_, i) => ({
    x: CX - 2 + (i % 5), y: HEAD_CY - 7 + Math.floor(i / 5),
    ch: '\u2588', cls: 'hat3', sentenceIdx: 10,
  })),
]

// ============================================================
//  Subtitle text positions (poem at top, centered per line)
// ============================================================

interface TextPos { row: number; col: number; text: string; offsets: number[]; w: number }
const textPositions: TextPos[] = SENTENCES.map((text, i) => {
  const w = vw(text)
  return { row: 2 + i, col: Math.floor((COLS - w) / 2), text, offsets: coffs(text), w }
})

// ============================================================
//  Sentence state
// ============================================================

const enum St { DIM, BRIGHT, DONE }
interface SentLine { st: St; brightAt: number; doneAt: number }
function mkSent(i: number): SentLine {
  return { st: St.DIM, brightAt: TIMING[i]![0], doneAt: TIMING[i]![0] + TIMING[i]![1] }
}
const SL: SentLine[] = SENTENCES.map((_, i) => mkSent(i))

let currentStage = 0

function updateSentences(s: number): void {
  for (let i = 0; i < SL.length; i++) {
    const ln = SL[i]!
    switch (ln.st) {
      case St.DIM:
        if (s >= ln.brightAt) ln.st = St.BRIGHT
        break
      case St.BRIGHT:
        if (s >= ln.doneAt) {
          ln.st = St.DONE
          const newStage = STAGE_MAP[i]!
          if (newStage > currentStage) currentStage = newStage
        }
        break
      case St.DONE: break
    }
  }
}

// ============================================================
//  Snow flakes
// ============================================================

interface Flake { x: number; y: number; vy: number; ch: string; seed: number }
const flakes: Flake[] = []
function updateFlakes(s: number): void {
  const active = s >= TIMING[0]![0]
  const heavy = s >= TIMING[1]![0]
  const rate = !active ? 0 : heavy ? 0.4 : 0.2
  if (rate > 0 && Math.random() < rate) {
    flakes.push({
      x: Math.random() * COLS, y: -1,
      vy: 0.04 + Math.random() * 0.06,
      ch: '*.\u00B7'[Math.floor(Math.random() * 3)]!,
      seed: Math.random() * 100,
    })
  }
  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i]!
    f.x += Math.sin(f.y * 0.2 + f.seed) * 0.035
    f.y += f.vy
    if (f.y > GROUND + 2) flakes.splice(i, 1)
  }
  if (flakes.length > 160) flakes.splice(0, flakes.length - 160)
}

// ============================================================
//  Font prep
// ============================================================

const ALL_CHARS = new Set<string>()
for (const c of STORY) ALL_CHARS.add(c)
for (const f of FEATURES) ALL_CHARS.add(f.ch)
for (const c of '\u2550\u2588\u2584\u25CF\u25B8\u203F\u00B7*.\\') ALL_CHARS.add(c)
for (const c of ALL_CHARS) prepareWithSegments(c, FONT)

const preparedStory: PreparedTextWithSegments = prepareWithSegments(STORY, FONT)

// ============================================================
//  DOM + buffers
// ============================================================

const art = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; art.appendChild(el); rowEls.push(el)
}
const cellCh: string[] = new Array(COLS * ROWS).fill('')
const cellCls: string[] = new Array(COLS * ROWS).fill('')
function clearCells(): void { for (let i = 0; i < cellCh.length; i++) { cellCh[i] = ''; cellCls[i] = '' } }
function setCell(x: number, y: number, ch: string, cls: string): void {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return
  cellCh[y * COLS + x] = ch; cellCls[y * COLS + x] = cls
}
const htmlParts: string[] = []

// ============================================================
//  Frame
// ============================================================

let startT: number | null = null

function frame(now: number): void {
  if (startT === null) startT = now
  const ms = now - startT; const s = ms / 1000

  if (s > TOTAL) {
    startT = now; flakes.length = 0; currentStage = 0
    for (let i = 0; i < SL.length; i++) Object.assign(SL[i]!, mkSent(i))
    requestAnimationFrame(frame); return
  }

  updateSentences(s)
  updateFlakes(s)

  const gfade = s >= TOTAL - 2 ? Math.max(0, 1 - (s - (TOTAL - 2)) / 2) : 1.0
  clearCells()

  // ---- Ground ----
  for (let x = 0; x < COLS; x++) {
    setCell(x, GROUND + 1, '\u2584', 'gd2')
    if (H(x * 73) > 0.5) setCell(x, GROUND + 2, '\u2584', 'gd1')
  }

  // ============================================================
  //  CORE: flow the story text through the snowman silhouette
  //  using pretext's layoutNextLine.
  //
  //  For each row that's inside the current silhouette, compute
  //  the pixel-width of that row's segment, then call
  //  layoutNextLine to get the text that fits. Render the result
  //  centered at the row's left edge.
  // ============================================================
  if (currentStage > 0) {
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    // Scan from top of shape to bottom
    for (let y = HEAD_CY - HEAD_RY; y <= GROUND; y++) {
      const seg = shapeAtRow(y, currentStage)
      if (!seg) continue
      const [leftCol, widthCols] = seg
      const maxWidthPx = widthCols * PX_PER_COL
      const line = layoutNextLine(preparedStory, cursor, maxWidthPx)
      if (!line) {
        // Text exhausted — wrap around to the start to keep filling
        cursor = { segmentIndex: 0, graphemeIndex: 0 }
        const retry = layoutNextLine(preparedStory, cursor, maxWidthPx)
        if (!retry) continue
        cursor = retry.end
        renderLine(leftCol, y, retry.text, widthCols)
      } else {
        cursor = line.end
        renderLine(leftCol, y, line.text, widthCols)
      }
    }
  }

  // ---- Features (accent marks on top of the text body) ----
  for (const f of FEATURES) {
    if (SL[f.sentenceIdx]!.st !== St.DONE) continue
    setCell(f.x, f.y, f.ch, f.cls)
  }

  // ---- Snow flakes ----
  for (const f of flakes) {
    const gx = Math.round(f.x), gy = Math.round(f.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    if (cellCls[gy * COLS + gx] !== '') continue
    setCell(gx, gy, f.ch, 'sn3')
  }

  // ---- Subtitle sentences at the top ----
  for (let i = 0; i < SENTENCES.length; i++) {
    const ln = SL[i]!
    const tp = textPositions[i]!
    let cls: string
    if (ln.st === St.DIM) cls = 's2'
    else if (ln.st === St.BRIGHT) cls = 's6'
    else cls = 's3'   // DONE — stays visible but dims back

    for (let j = 0; j < tp.text.length; j++) {
      const ch = tp.text[j]!
      const gx = tp.col + tp.offsets[j]!
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
      setCell(gx, tp.row, ch, cls)
      if (cw === 2) setCell(gx + 1, tp.row, '', cls)
    }
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
        htmlParts.push(' ')
      }
    }
    rowEls[gy]!.innerHTML = htmlParts.join('')
  }
  requestAnimationFrame(frame)
}

// Render a pretext-laid-out line at (leftCol, row) in the body color.
function renderLine(leftCol: number, row: number, text: string, _maxCols: number): void {
  const offs = coffs(text)
  for (let j = 0; j < text.length; j++) {
    const ch = text[j]!
    if (ch === ' ') continue
    const gx = leftCol + offs[j]!
    if (gx < 0 || gx >= COLS) continue
    const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
    setCell(gx, row, ch, 'sb3')
    if (cw === 2) setCell(gx + 1, row, '', 'sb3')
  }
}

requestAnimationFrame(frame)
