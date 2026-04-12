import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '../../src/layout.ts'

// ---- constants ----

const BODY_FONT = '17px "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const BODY_LINE_HEIGHT = 28
const HEADLINE_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif'
const HEADLINE_TEXT = 'TEXT THAT FLOWS LIKE WATER'
const SUBTITLE_TEXT = 'Zero DOM reads. Pure arithmetic. 60 fps.'
const SUBTITLE_FONT = '14px "Helvetica Neue", Helvetica, Arial, sans-serif'
const SUBTITLE_LINE_HEIGHT = 20
const GUTTER = 40
const COL_GAP = 36
const BOTTOM_GAP = 20
const MIN_SLOT_WIDTH = 40
const NARROW_BREAKPOINT = 760
const NARROW_GUTTER = 16
const NARROW_COL_GAP = 20
const NARROW_BOTTOM_GAP = 12
const CURSOR_ORB_RADIUS = 120
const CURSOR_ORB_RADIUS_NARROW = 80
const ORB_H_PAD = 14
const ORB_V_PAD = 6

// ---- types ----

type Interval = { left: number; right: number }

type PositionedLine = {
  x: number
  y: number
  width: number
  text: string
}

type CircleObstacle = {
  cx: number
  cy: number
  r: number
  hPad: number
  vPad: number
}

type OrbColor = [number, number, number]

type OrbDef = {
  fx: number
  fy: number
  r: number
  vx: number
  vy: number
  color: OrbColor
}

type Orb = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  color: OrbColor
}

type PointerState = {
  x: number
  y: number
  smoothX: number
  smoothY: number
}

// ---- text corpus (multilingual) ----

const BODY_TEXT = `The web renders text through a pipeline designed thirty years ago for static documents. A browser loads a font, shapes the text into glyphs, measures their combined width, determines where lines break, and positions each line vertically. Every step requires the rendering engine to consult its internal layout tree, a structure so expensive to maintain that browsers guard access to it behind synchronous reflow barriers.

For a paragraph in a blog post this pipeline is invisible. But the web is no longer a collection of static documents. It is a platform for applications that need to know about text in ways the original pipeline never anticipated.

A messaging application needs the exact height of every bubble before rendering a virtualized list. A masonry layout needs the height of every card to position them without overlap. An editorial page needs text to flow around images and interactive elements. A responsive dashboard needs to resize and reflow text in real time.

Every one of these operations requires text measurement, and every text measurement on the web today requires a synchronous layout reflow. Measuring the height of a single text block forces the browser to recalculate the position of every element on the page. This pattern, known as layout thrashing, is the single largest source of jank on the modern web.

What if text measurement did not require the DOM at all? What if you could compute exactly where every line breaks, exactly how wide each line would be, and exactly how tall the entire text block would be, using nothing but arithmetic?

This is the core insight. The canvas API includes a measureText method that returns the width of any string in any font without triggering a layout reflow. Canvas measurement uses the same font engine as DOM rendering. The results are identical.

When text first appears, every word is measured once via canvas and cached. After this preparation phase, layout is pure arithmetic: walk the cached widths, track the running line width, insert line breaks when the width exceeds the maximum, and sum the line heights. No DOM. No reflow.

The text you are reading right now is flowing around the glowing obstacles on this page. Every frame, the layout engine computes obstacle intersections for every line of text, determines the available horizontal slots, lays out each line at the correct width and position, and updates the DOM with the results. The total computation time is typically under half a millisecond.

With DOM-free text measurement, an entire class of previously impractical interfaces becomes trivial. Text can flow around arbitrary shapes because you control the line widths directly. For each line you compute which horizontal intervals are blocked by obstacles, subtract them from the available width, and pass the remaining width to the layout engine.

Obstacles can be any shape: rectangles, circles, arbitrary polygons, even the alpha channel of an image. Text wraps on both sides simultaneously. Obstacles can move, animate, or be dragged by the user, and the text reflows instantly because the layout computation takes less than a millisecond.

Shrinkwrap is another capability that CSS cannot express. Given a block of multiline text, what is the narrowest width that preserves the current line count? CSS offers fit-content, which works for single lines but always leaves dead space for multiline text. A binary search over widths solves this: narrow until the line count increases, then back off.

Multi-column text flow with cursor handoff is perhaps the most striking capability. The left column consumes text until it reaches the bottom, then hands its cursor to the right column. The right column picks up exactly where the left column stopped, with no gap and perfect line breaking at the column boundary.

The open web deserves typography that matches its ambition. We build applications that rival native software in every dimension except text. Our animations are smooth, our interactions are responsive, our graphics are stunning, but our text sits in rigid boxes.

This is what changes when text measurement becomes free. Not slightly better, categorically different. The interfaces that were too expensive to build become trivial. The layouts that existed only in print become interactive. The text that sat in boxes begins to flow.

Fifteen kilobytes. Zero dependencies. Zero DOM reads. And the text flows.`

// ---- DOM refs ----

const stage = getDiv('stage')
const glowCanvas = document.getElementById('glow-canvas') as HTMLCanvasElement
const glowCtx = glowCanvas.getContext('2d')!
const hudEl = document.getElementById('hud')!
const hintEl = document.getElementById('hint')!

// ---- orb definitions ----

const orbDefs: OrbDef[] = [
  { fx: 0.28, fy: 0.35, r: 90, vx: 18, vy: 12, color: [100, 140, 255] },
  { fx: 0.72, fy: 0.55, r: 70, vx: -14, vy: 18, color: [220, 90, 120] },
  { fx: 0.55, fy: 0.75, r: 60, vx: 10, vy: -16, color: [70, 195, 140] },
]

// ---- state ----

const W0 = window.innerWidth
const H0 = window.innerHeight

const orbs: Orb[] = orbDefs.map(d => ({
  x: d.fx * W0,
  y: d.fy * H0,
  r: d.r,
  vx: d.vx,
  vy: d.vy,
  color: d.color,
}))

const pointer: PointerState = {
  x: W0 / 2,
  y: H0 / 2,
  smoothX: W0 / 2,
  smoothY: H0 / 2,
}

let lastFrameTime: number | null = null
let hintHidden = false

// ---- prepare text ----

await document.fonts.ready

const preparedBody = prepareWithSegments(BODY_TEXT, BODY_FONT)
const preparedSubtitle = prepareWithSegments(SUBTITLE_TEXT, SUBTITLE_FONT)

// ---- DOM pools ----

const bodyLinePool: HTMLSpanElement[] = []
const headlineLinePool: HTMLSpanElement[] = []
const subtitleLinePool: HTMLSpanElement[] = []

const orbEls = orbDefs.map(d => createOrbEl(d.color, d.r))
const cursorOrbEl = createCursorOrbEl()

// ---- column divider ----

const dividerEl = document.createElement('div')
dividerEl.className = 'divider'
stage.appendChild(dividerEl)

// ---- helpers ----

function getDiv(id: string): HTMLDivElement {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLDivElement)) throw new Error(`#${id} not found`)
  return el
}

function createOrbEl(color: OrbColor, r: number): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'orb'
  const size = r * 2
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.background = `radial-gradient(circle at 38% 38%, rgba(${color[0]},${color[1]},${color[2]},0.3), rgba(${color[0]},${color[1]},${color[2]},0.1) 50%, transparent 70%)`
  el.style.boxShadow = `0 0 ${r}px ${r * 0.3}px rgba(${color[0]},${color[1]},${color[2]},0.12)`
  stage.appendChild(el)
  return el
}

function createCursorOrbEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'cursor-orb'
  const size = CURSOR_ORB_RADIUS * 2
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.background = `radial-gradient(circle at 40% 40%, rgba(196,163,90,0.28), rgba(196,163,90,0.08) 50%, transparent 68%)`
  el.style.boxShadow = `0 0 100px 30px rgba(196,163,90,0.1)`
  stage.appendChild(el)
  return el
}

function syncPool(pool: HTMLSpanElement[], count: number, className: string): void {
  while (pool.length < count) {
    const el = document.createElement('span')
    el.className = className
    stage.appendChild(el)
    pool.push(el)
  }
  for (let i = 0; i < pool.length; i++) {
    pool[i]!.style.display = i < count ? '' : 'none'
  }
}

function circleIntervalForBand(
  cx: number, cy: number, r: number,
  bandTop: number, bandBottom: number,
  hPad: number, vPad: number,
): Interval | null {
  const top = bandTop - vPad
  const bottom = bandBottom + vPad
  if (top >= cy + r || bottom <= cy - r) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad }
}

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base]
  for (let bi = 0; bi < blocked.length; bi++) {
    const interval = blocked[bi]!
    const next: Interval[] = []
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(s => s.right - s.left >= MIN_SLOT_WIDTH)
}

// ---- headline fitting ----

let cachedHlWidth = -1
let cachedHlFontSize = 24
let cachedHlLines: PositionedLine[] = []

function fitHeadline(maxWidth: number, maxHeight: number): { fontSize: number; lines: PositionedLine[] } {
  if (maxWidth === cachedHlWidth) return { fontSize: cachedHlFontSize, lines: cachedHlLines }
  cachedHlWidth = maxWidth

  let lo = 18
  let hi = 82
  let best = lo
  let bestLines: PositionedLine[] = []

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const lh = Math.round(size * 0.95)
    const prepared = prepareWithSegments(HEADLINE_TEXT, font)
    let breaksWord = false
    let lineCount = 0

    walkLineRanges(prepared, maxWidth, line => {
      lineCount++
      if (line.end.graphemeIndex !== 0) breaksWord = true
    })

    const totalHeight = lineCount * lh
    if (!breaksWord && totalHeight <= maxHeight) {
      best = size
      const result = layoutWithLines(prepared, maxWidth, lh)
      bestLines = result.lines.map((line, i) => ({
        x: 0,
        y: i * lh,
        text: line.text,
        width: line.width,
      }))
      lo = size + 1
    } else {
      hi = size - 1
    }
  }

  cachedHlFontSize = best
  cachedHlLines = bestLines
  return { fontSize: best, lines: bestLines }
}

// ---- column layout with obstacles ----

function layoutColumn(
  prepared: PreparedTextWithSegments,
  startCursor: LayoutCursor,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
  lineHeight: number,
  obstacles: CircleObstacle[],
): { lines: PositionedLine[]; cursor: LayoutCursor } {
  let cursor: LayoutCursor = startCursor
  let lineTop = regionY
  const lines: PositionedLine[] = []
  let exhausted = false

  while (lineTop + lineHeight <= regionY + regionH && !exhausted) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: Interval[] = []

    for (let oi = 0; oi < obstacles.length; oi++) {
      const o = obstacles[oi]!
      const interval = circleIntervalForBand(o.cx, o.cy, o.r, bandTop, bandBottom, o.hPad, o.vPad)
      if (interval !== null) blocked.push(interval)
    }

    const slots = carveTextLineSlots({ left: regionX, right: regionX + regionW }, blocked)
    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    const ordered = [...slots].sort((a, b) => a.left - b.left)
    for (let si = 0; si < ordered.length; si++) {
      const slot = ordered[si]!
      const slotWidth = slot.right - slot.left
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) {
        exhausted = true
        break
      }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        text: line.text,
        width: line.width,
      })
      cursor = line.end
    }

    lineTop += lineHeight
  }

  return { lines, cursor }
}

// ---- glow canvas ----

function resizeGlowCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio, 2)
  // use a lower resolution for the glow effect for performance
  const scale = 0.25
  glowCanvas.width = Math.ceil(window.innerWidth * dpr * scale)
  glowCanvas.height = Math.ceil(window.innerHeight * dpr * scale)
}

function drawGlow(_allObstacles: CircleObstacle[], cursorR: number): void {
  const w = glowCanvas.width
  const h = glowCanvas.height
  const scaleX = w / window.innerWidth
  const scaleY = h / window.innerHeight

  glowCtx.clearRect(0, 0, w, h)

  // cursor glow
  const cGrad = glowCtx.createRadialGradient(
    pointer.smoothX * scaleX, pointer.smoothY * scaleY, 0,
    pointer.smoothX * scaleX, pointer.smoothY * scaleY, cursorR * scaleX * 1.8,
  )
  cGrad.addColorStop(0, 'rgba(196, 163, 90, 0.15)')
  cGrad.addColorStop(0.5, 'rgba(196, 163, 90, 0.05)')
  cGrad.addColorStop(1, 'transparent')
  glowCtx.fillStyle = cGrad
  glowCtx.fillRect(0, 0, w, h)

  // orb glows
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!
    const color = orb.color
    const ox = orb.x * scaleX
    const oy = orb.y * scaleY
    const or = orb.r * scaleX * 2

    const grad = glowCtx.createRadialGradient(ox, oy, 0, ox, oy, or)
    grad.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0.12)`)
    grad.addColorStop(0.5, `rgba(${color[0]},${color[1]},${color[2]},0.04)`)
    grad.addColorStop(1, 'transparent')
    glowCtx.fillStyle = grad
    glowCtx.fillRect(0, 0, w, h)
  }
}

// ---- physics ----

function stepOrbs(dt: number): void {
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!
    orb.x += orb.vx * dt
    orb.y += orb.vy * dt
    // bounce off walls
    if (orb.x - orb.r < 0) { orb.x = orb.r; orb.vx = Math.abs(orb.vx) }
    if (orb.x + orb.r > vw) { orb.x = vw - orb.r; orb.vx = -Math.abs(orb.vx) }
    if (orb.y - orb.r < 0) { orb.y = orb.r; orb.vy = Math.abs(orb.vy) }
    if (orb.y + orb.r > vh) { orb.y = vh - orb.r; orb.vy = -Math.abs(orb.vy) }
  }
}

// ---- render ----

resizeGlowCanvas()
window.addEventListener('resize', resizeGlowCanvas)

function render(now: number): void {
  const t0 = performance.now()

  // delta time
  const dt = lastFrameTime === null ? 0.016 : Math.min((now - lastFrameTime) / 1000, 0.05)
  lastFrameTime = now

  const vw = window.innerWidth
  const vh = window.innerHeight
  const isNarrow = vw <= NARROW_BREAKPOINT

  // smooth cursor
  const smoothing = 0.12
  pointer.smoothX += (pointer.x - pointer.smoothX) * smoothing
  pointer.smoothY += (pointer.y - pointer.smoothY) * smoothing

  // step orb physics
  stepOrbs(dt)

  // layout geometry
  const gutter = isNarrow ? NARROW_GUTTER : GUTTER
  const colGap = isNarrow ? NARROW_COL_GAP : COL_GAP
  const bottomGap = isNarrow ? NARROW_BOTTOM_GAP : BOTTOM_GAP
  const cursorR = isNarrow ? CURSOR_ORB_RADIUS_NARROW : CURSOR_ORB_RADIUS

  // headline area
  const headlineLeft = gutter
  const headlineTop = gutter
  const headlineMaxWidth = vw - gutter * 2
  const headlineMaxHeight = isNarrow ? 80 : 140
  const hl = fitHeadline(headlineMaxWidth, headlineMaxHeight)
  const headlineActualHeight = hl.lines.length > 0
    ? hl.lines[hl.lines.length - 1]!.y + Math.round(hl.fontSize * 0.95)
    : 0

  // subtitle below headline
  const subtitleTop = headlineTop + headlineActualHeight + 8
  const subtitleResult = layoutWithLines(preparedSubtitle, headlineMaxWidth, SUBTITLE_LINE_HEIGHT)
  const subtitleHeight = subtitleResult.height

  // body region
  const bodyTop = subtitleTop + subtitleHeight + (isNarrow ? 16 : 24)
  const bodyBottom = vh - bottomGap
  const bodyHeight = bodyBottom - bodyTop

  // build all circle obstacles
  const allObstacles: CircleObstacle[] = []

  // cursor obstacle
  allObstacles.push({
    cx: pointer.smoothX,
    cy: pointer.smoothY,
    r: cursorR,
    hPad: ORB_H_PAD,
    vPad: ORB_V_PAD,
  })

  // floating orbs as obstacles
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!
    allObstacles.push({
      cx: orb.x,
      cy: orb.y,
      r: orb.r * (isNarrow ? 0.6 : 1),
      hPad: ORB_H_PAD,
      vPad: ORB_V_PAD,
    })
  }

  // layout body text
  let bodyLines: PositionedLine[]
  if (isNarrow) {
    // single column
    const colX = gutter
    const colW = vw - gutter * 2
    const result = layoutColumn(
      preparedBody,
      { segmentIndex: 0, graphemeIndex: 0 },
      colX, bodyTop, colW, bodyHeight, BODY_LINE_HEIGHT,
      allObstacles,
    )
    bodyLines = result.lines
  } else {
    // two columns with cursor handoff
    const colW = (vw - gutter * 2 - colGap) / 2
    const col1X = gutter
    const col2X = gutter + colW + colGap
    const col1 = layoutColumn(
      preparedBody,
      { segmentIndex: 0, graphemeIndex: 0 },
      col1X, bodyTop, colW, bodyHeight, BODY_LINE_HEIGHT,
      allObstacles,
    )
    const col2 = layoutColumn(
      preparedBody,
      col1.cursor,
      col2X, bodyTop, colW, bodyHeight, BODY_LINE_HEIGHT,
      allObstacles,
    )
    bodyLines = [...col1.lines, ...col2.lines]

    // draw divider between columns
    const divX = gutter + colW + colGap / 2
    dividerEl.style.left = `${divX}px`
    dividerEl.style.top = `${bodyTop}px`
    dividerEl.style.width = '1px'
    dividerEl.style.height = `${bodyHeight}px`
    dividerEl.style.background = 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)'
    dividerEl.style.display = ''
  }

  if (isNarrow) {
    dividerEl.style.display = 'none'
  }

  const layoutMs = performance.now() - t0

  // ---- DOM writes ----

  // headline
  const hlFont = `700 ${hl.fontSize}px ${HEADLINE_FONT_FAMILY}`
  const hlLh = Math.round(hl.fontSize * 0.95)
  syncPool(headlineLinePool, hl.lines.length, 'headline-line')
  for (let i = 0; i < hl.lines.length; i++) {
    const el = headlineLinePool[i]!
    const line = hl.lines[i]!
    el.textContent = line.text
    el.style.left = `${headlineLeft + line.x}px`
    el.style.top = `${headlineTop + line.y}px`
    el.style.font = hlFont
    el.style.lineHeight = `${hlLh}px`
  }

  // subtitle
  syncPool(subtitleLinePool, subtitleResult.lines.length, 'subtitle-line')
  for (let i = 0; i < subtitleResult.lines.length; i++) {
    const el = subtitleLinePool[i]!
    const line = subtitleResult.lines[i]!
    el.textContent = line.text
    el.style.left = `${headlineLeft}px`
    el.style.top = `${subtitleTop + i * SUBTITLE_LINE_HEIGHT}px`
    el.style.font = SUBTITLE_FONT
    el.style.lineHeight = `${SUBTITLE_LINE_HEIGHT}px`
  }

  // body lines
  syncPool(bodyLinePool, bodyLines.length, 'line')
  for (let i = 0; i < bodyLines.length; i++) {
    const el = bodyLinePool[i]!
    const line = bodyLines[i]!
    el.textContent = line.text
    el.style.left = `${line.x}px`
    el.style.top = `${line.y}px`
    el.style.font = BODY_FONT
    el.style.lineHeight = `${BODY_LINE_HEIGHT}px`
  }

  // orbs
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!
    const el = orbEls[i]!
    const size = orb.r * 2
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.transform = `translate(${orb.x - orb.r}px, ${orb.y - orb.r}px)`
  }

  // cursor orb
  const cursorSize = cursorR * 2
  cursorOrbEl.style.width = `${cursorSize}px`
  cursorOrbEl.style.height = `${cursorSize}px`
  cursorOrbEl.style.transform = `translate(${pointer.smoothX - cursorR}px, ${pointer.smoothY - cursorR}px)`

  // glow
  drawGlow(allObstacles, cursorR)

  // HUD
  const totalMs = performance.now() - t0
  hudEl.textContent = `layout: ${layoutMs.toFixed(2)}ms | frame: ${totalMs.toFixed(2)}ms | lines: ${bodyLines.length}`

  // fade hint after first interaction
  if (!hintHidden && (Math.abs(pointer.x - W0 / 2) > 40 || Math.abs(pointer.y - H0 / 2) > 40)) {
    hintEl.style.opacity = '0'
    hintHidden = true
  }

  requestAnimationFrame(render)
}

// ---- events ----

window.addEventListener('pointermove', (e: PointerEvent) => {
  pointer.x = e.clientX
  pointer.y = e.clientY
})

window.addEventListener('pointerleave', () => {
  pointer.x = -9999
  pointer.y = -9999
})

window.addEventListener('resize', () => {
  cachedHlWidth = -1 // invalidate headline cache
})

// ---- start ----

requestAnimationFrame(render)
