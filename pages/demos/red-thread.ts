import { prepareWithSegments } from '../../src/layout.ts'
import timeline from '../../output/timeline.json'

// ---- config ----

const COLS = 90
const ROWS = 48
const FONT_SIZE = 14
const TOTAL_MS = (timeline as { total_ms: number }).total_ms
const SEGMENTS = (timeline as { segments: { index: number; start_ms: number; end_ms: number }[] }).segments

const TRUNK_CHARS = '#|!I][:;'
const BRANCH_CHARS = '/\\~-=<>^'
const LEAF_CHARS = '*oO0@&%$'
const FRUIT_CHARS = '@0OQ'
const GROUND_CHARS = '_.,-~'
const SEED_CHARS = 'o.'
const RAIN_CHARS = '|:.\',`'
const NOISE_CHARS = '&*$%^#@!?~+={}<>|/\\:;.,`()[]0123456789abcdefghijklmnopqrstuvwxyz'

// Pretext measures chars
const FONT = `${FONT_SIZE}px "SF Mono","Cascadia Code",Consolas,monospace`
const allC = new Set(TRUNK_CHARS + BRANCH_CHARS + LEAF_CHARS + FRUIT_CHARS + GROUND_CHARS + SEED_CHARS + RAIN_CHARS + NOISE_CHARS)
for (const ch of allC) prepareWithSegments(ch, FONT)

// ---- per-segment visual state: [growT, rainIntensity, brightness] ----
// each segment defines visual state at its START, interpolated to next

const VIS: [number, number, number][] = [
//  growT  rain  bright
  [ 0.00, 0.05, 0 ],  //  0 "雨。"                         first drop
  [ 0.00, 0.30, 0 ],  //  1 "いつから降っていたのだろう"     rain building
  [ 0.00, 0.60, 0 ],  //  2 "気づいた時には...濡れていた"    rain strong
  [ 0.00, 0.90, 0 ],  //  3 "冷たくて...そこにあった"        rain full
  [ 0.00, 0.70, 0 ],  //  4 "一粒の滴が土に落ちる"          seed appears
  [ 0.02, 0.50, 0 ],  //  5 "音もなく...染み込んでいく"      seed pulses
  [ 0.03, 0.40, 0 ],  //  6 "その先に...雨は知らない"        seed glows
  [ 0.06, 0.30, 0 ],  //  7 "何かが芽を出す"                sprout!
  [ 0.10, 0.25, 0 ],  //  8 "名前もない。小さなもの"         tiny stem
  [ 0.18, 0.20, 0 ],  //  9 "光に向かって...伸びていく"      stem stretches
  [ 0.28, 0.15, 0 ],  // 10 "時間が経つ"                    trunk thickens
  [ 0.40, 0.12, 0 ],  // 11 "幹が太くなる。枝が広がる"       branches spread
  [ 0.55, 0.10, 0 ],  // 12 "風が吹いて...葉が揺れる"       leaves fill
  [ 0.68, 0.08, 0 ],  // 13 "いつの間にか実がなっていた"     first fruit
  [ 0.80, 0.06, 0 ],  // 14 "赤くて...丸くて...重たい"       more fruit
  [ 0.95, 0.05, 0 ],  // 15 "自分の一部なのに...自分じゃない" tree complete
  [ 1.00, 0.20, 0 ],  // 16 "雨はまだ降っている"            rain returns
  [ 1.00, 0.35, 0 ],  // 17 "同じ雨なのか...分からない"      rain + full tree
  [ 1.00, 0.30, 0 ],  // 18 "ただ立っている...空を見て"      majestic still
  [ 1.00, 0.25, 0 ],  // 19 "こんなにも長い"                contemplative
  [ 1.00, 0.25, 0 ],  // 20 "時間はどこへ行くのだろう"       wondering
  [ 1.00, 0.30, 0 ],  // 21 "枝の間を抜けて...土に還る"     rain through tree
  [ 1.00, 0.15, 0 ],  // 22 "何も掴めない...何かが残っている" rain fading
  [ 1.00, 0.08, 0.1], // 23 "この幹の中に。この根の中に"     warm glow
  [ 1.00, 0.00, 0.4], // 24 "雨が止んだ"                    rain stops
  [ 1.00, 0.00, 0.8], // 25 "空が...明るい"                  bright
]

function getVisualState(ms: number): [number, number, number] {
  // find which segment we're in
  let segIdx = -1
  for (let i = SEGMENTS.length - 1; i >= 0; i--) {
    if (ms >= SEGMENTS[i]!.start_ms) { segIdx = i; break }
  }

  if (segIdx < 0) return [0, 0, 0] // before first segment

  const cur = VIS[segIdx] ?? [0, 0, 0]
  const nxt = VIS[Math.min(segIdx + 1, VIS.length - 1)] ?? cur

  // interpolate within this segment's duration to the next state
  const seg = SEGMENTS[segIdx]!
  const nextStart = segIdx + 1 < SEGMENTS.length ? SEGMENTS[segIdx + 1]!.start_ms : TOTAL_MS
  const progress = Math.min(1, (ms - seg.start_ms) / (nextStart - seg.start_ms))
  const ease = progress * progress * (3 - 2 * progress) // smoothstep

  return [
    cur[0] + (nxt[0] - cur[0]) * ease,
    cur[1] + (nxt[1] - cur[1]) * ease,
    cur[2] + (nxt[2] - cur[2]) * ease,
  ]
}

function getGrowT(ms: number): number { return getVisualState(ms)[0] }
function getRainIntensity(ms: number): number { return getVisualState(ms)[1] }
function getBrightness(ms: number): number { return getVisualState(ms)[2] }

// ---- offscreen tree canvas ----

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
  const alpha = Math.min(1, thick / 2.5)
  tCtx.strokeStyle = `rgba(${Math.round(alpha * 255)}, 0, 0, 1)`
  tCtx.lineWidth = thick * localT
  tCtx.lineCap = 'round'
  tCtx.beginPath(); tCtx.moveTo(x, y); tCtx.lineTo(ex, ey); tCtx.stroke()

  if (depth >= maxDepth) {
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
  if (depth < 3) drawBranch(ex, ey, angle + Math.sin(depth * 7) * 0.12, len * shrink * 0.75, thick * 0.45, depth + 1, maxDepth, growT)
}

function renderTree(growT: number): void {
  tCtx.clearRect(0, 0, CW, CH)
  if (growT <= 0) return
  tCtx.globalCompositeOperation = 'lighter'
  const bx = CW / 2, by = CH - 18
  drawBranch(bx, by, -Math.PI / 2, 70 + growT * 25, 4.5 + growT * 3.5, 0, 7, growT)
  tCtx.globalCompositeOperation = 'source-over'
  if (growT < 0.08) {
    const sa = 1 - growT / 0.08
    tCtx.fillStyle = `rgba(${Math.round(sa * 200)}, ${Math.round(sa * 100)}, 0, 1)`
    tCtx.beginPath(); tCtx.arc(bx, by - 3, 4 * sa, 0, Math.PI * 2); tCtx.fill()
  }
}

// ---- sample tree into grid ----

type CellType = 'empty' | 'seed' | 'trunk' | 'branch' | 'leaf' | 'fruit' | 'ground' | 'rain'

function sampleGrid(growT: number, rainI: number, frameHash: number): { type: CellType; brightness: number }[] {
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

      // seed
      if (type === 'empty' && growT > 0 && growT < 0.08 && gy >= ROWS - 4 && Math.abs(gx - COLS / 2) < 2) {
        type = 'seed'; brightness = 0.5
      }

      // ground
      if (type === 'empty' && gy >= ROWS - 2 && growT > 0.02) {
        const d = Math.abs(gx - COLS / 2) / (COLS / 2)
        const gb = Math.max(0, 0.18 - d * 0.18) * Math.min(1, growT * 10)
        if (gb > 0.02) { type = 'ground'; brightness = gb }
      }

      // rain drops
      if (type === 'empty' && rainI > 0) {
        const rh = ((gx * 41 + gy * 67 + frameHash) * 2654435761) >>> 0
        const chance = rainI * 0.06
        if ((rh & 0xff) / 255 < chance) {
          type = 'rain'
          brightness = 0.1 + rainI * 0.3
        }
      }

      grid[gy * COLS + gx] = { type, brightness }
    }
  }
  return grid
}

// ---- char + color ----

function pickChar(type: CellType, gx: number, gy: number, frameHash: number): string {
  const h = ((gx * 73 + gy * 137 + (type === 'rain' ? frameHash : 0)) * 2654435761) >>> 0
  let chars: string
  switch (type) {
    case 'trunk': chars = TRUNK_CHARS; break
    case 'branch': chars = BRANCH_CHARS; break
    case 'leaf': chars = LEAF_CHARS; break
    case 'fruit': chars = FRUIT_CHARS; break
    case 'ground': chars = GROUND_CHARS; break
    case 'seed': chars = SEED_CHARS; break
    case 'rain': chars = RAIN_CHARS; break
    default: return ' '
  }
  return chars[h % chars.length]!
}

function colorClass(type: CellType, brightness: number, brightenAmount: number): string {
  const lvl = Math.max(1, Math.min(6, Math.ceil(brightness * 6)))
  // brighten effect at the end
  if (brightenAmount > 0) {
    const boosted = Math.max(1, Math.min(6, Math.ceil((brightness + brightenAmount * 0.4) * 6)))
    switch (type) {
      case 'trunk': case 'branch': return `t${boosted}`
      case 'leaf': return `l${boosted}`
      case 'fruit': return `f${Math.min(4, boosted)}`
      default: break
    }
  }
  switch (type) {
    case 'trunk': case 'branch': return `t${lvl}`
    case 'leaf': return `l${lvl}`
    case 'fruit': return `f${Math.min(4, lvl)}`
    case 'ground': return `g${Math.min(2, lvl)}`
    case 'seed': return `t${Math.min(4, lvl)}`
    case 'rain': return `r${Math.min(3, lvl)}`
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

// ---- subtitle element ----

const subEl = document.createElement('div')
subEl.id = 'sub'
subEl.innerHTML = '<div id="sub-jp"></div><div id="sub-cn"></div>'
document.body.appendChild(subEl)
const subJpEl = document.getElementById('sub-jp')!
const subCnEl = document.getElementById('sub-cn')!

const SUBS: [string, string][] = [
  ['雨。', '雨。'],
  ['いつから、降っていたのだろう。', '从什么时候开始下的呢。'],
  ['気づいた時には……もう、濡れていた。', '发觉的时候......已经湿了。'],
  ['冷たくて……静かで……でも確かに、そこにあった。', '冷冷的......静静的......但确实在那里。'],
  ['一粒の滴が、土に落ちる。', '一滴水，落入土中。'],
  ['音もなく……染み込んでいく。', '无声地......渗了进去。'],
  ['その先に何があるのか……雨は、知らない。', '前方有什么......雨不知道。'],
  ['でも、やがて、何かが芽を出す。', '但是，终究，有什么发了芽。'],
  ['名前もない。小さなもの。', '没有名字。很小的东西。'],
  ['光に向かって……ただ、伸びていく。', '朝着光......只是，伸展着。'],
  ['時間が経つ。', '时间过去了。'],
  ['幹が太くなる。枝が広がる。', '树干变粗。枝条展开。'],
  ['風が吹いて……葉が、揺れる。', '风吹过......叶子，在摇。'],
  ['いつの間にか、実がなっていた。', '不知不觉，结了果。'],
  ['赤くて……丸くて……重たい。', '红红的......圆圆的......沉甸甸的。'],
  ['自分の一部なのに……自分じゃないもの。', '明明是自己的一部分......却不是自己。'],
  ['雨はまだ、降っている。', '雨还在下。'],
  ['同じ雨なのか、違う雨なのか……もう、分からない。', '是同一场雨，还是不同的雨......已经分不清了。'],
  ['ただ、こうして立っている。根を張って、空を見て。', '只是，这样站着。扎着根，望着天。'],
  ['それだけのことが……こんなにも、長い。', '仅此而已的事......竟如此漫长。'],
  ['時間は、どこへ行くのだろう。', '时间，去了哪里呢。'],
  ['この枝の間を抜けて……葉の先から、滴り落ちて……また、土に還るのだろうか。', '穿过枝叶......从叶尖滴落......又回到土里去了吧。'],
  ['何も掴めないまま。でも、何かが残っている。', '什么也没抓住。但有什么留下了。'],
  ['この幹の中に。この根の中に。', '在这树干里。在这根里。'],
  ['雨が、止んだ。', '雨，停了。'],
  ['空が……明るい。', '天空......亮了。'],
]

function getCurrentSub(ms: number): [string, string] {
  for (let i = SEGMENTS.length - 1; i >= 0; i--) {
    const seg = SEGMENTS[i]!
    if (ms >= seg.start_ms && ms < seg.end_ms + 500) {
      return SUBS[i] ?? ['', '']
    }
  }
  return ['', '']
}

// ---- easing ----

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// ---- render loop ----

let startTime: number | null = null

function frame(now: number): void {
  if (startTime === null) startTime = now
  const ms = (now - startTime) % (TOTAL_MS + 3000) // 3s black at end before loop

  const growT = easeInOutCubic(Math.min(1, Math.max(0, getGrowT(ms))))
  const rainI = getRainIntensity(ms)
  const bright = getBrightness(ms)
  const frameHash = Math.floor(ms / 80) // rain changes every 80ms

  renderTree(growT)
  const grid = sampleGrid(growT, rainI, frameHash)
  const nSeed = Math.floor(ms / 100)

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
      html += `<span class="${colorClass(cell.type, cell.brightness, bright)}">${esc(pickChar(cell.type, gx, gy, frameHash))}</span>`
    }
    rowEls[gy]!.innerHTML = html
  }

  // subtitle
  const [jp, cn] = getCurrentSub(ms)
  subJpEl.textContent = jp
  subCnEl.textContent = cn

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
