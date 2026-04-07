import { prepareWithSegments } from '../../src/layout.ts'

// ---- grid ----

const COLS = 80
const ROWS = 44
const WATER_ROW = Math.floor(ROWS * 0.50) // water line at middle

// ---- characters ----

const SURFACE_CHARS = '~=~-~=~_'
const RIPPLE_CHARS_STRONG = '~oO*@'
const RIPPLE_CHARS_WEAK = '~-._`'
const DROP_CHARS = "|':"
const NOISE_CHARS = '&*$%^#@!?~+:;.,`'
const STEM_CHARS = '|!I:'
const PETAL_CHARS = '(){}<>@*'
const BUD_CHARS = 'oO0'

const KANJI_BY_PHASE = [
  '无空暗',        // 0 void
  '水波面',        // 1 water
  '雨滴冷',        // 2 first drop
  '雨滴冷湿',      // 3 rain
  '雨滴冷湿',      // 4 heavy rain
  '深暗待動',      // 5 beneath
  '破生芽力',      // 6 breakthrough
  '花開紅美瓣',    // 7 bloom
  '静光明息',      // 8 still
]

// Pretext char measurement
const FONT = '14px "SF Mono","Cascadia Code",Consolas,monospace'
const allC = new Set(SURFACE_CHARS + RIPPLE_CHARS_STRONG + RIPPLE_CHARS_WEAK + DROP_CHARS + NOISE_CHARS + STEM_CHARS + PETAL_CHARS + BUD_CHARS + KANJI_BY_PHASE.join(''))
for (const ch of allC) prepareWithSegments(ch, FONT)

// ---- wave simulation ----

const SIM_W = COLS
const SIM_H = ROWS - WATER_ROW
const wave0 = new Float32Array(SIM_W * SIM_H)
const wave1 = new Float32Array(SIM_W * SIM_H)
const DAMPING = 0.982

function waveStep(): void {
  for (let y = 1; y < SIM_H - 1; y++) {
    for (let x = 1; x < SIM_W - 1; x++) {
      const i = y * SIM_W + x
      const avg = (wave0[i - 1]! + wave0[i + 1]! + wave0[i - SIM_W]! + wave0[i + SIM_W]!) * 0.25
      wave1[i] = (avg * 2 - wave1[i]!) * DAMPING
    }
  }
  const tmp = new Float32Array(wave0)
  wave0.set(wave1)
  wave1.set(tmp)
}

function dropAt(x: number, strength: number): void {
  const ix = Math.round(x)
  const iy = 0 // top of water
  const r = 2
  for (let dy = 0; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > r) continue
      const gx = ix + dx, gy = iy + dy
      if (gx < 0 || gx >= SIM_W || gy < 0 || gy >= SIM_H) continue
      wave0[gy * SIM_W + gx] = wave0[gy * SIM_W + gx]! + strength * (1 - d / r)
    }
  }
}

// ---- falling rain drops ----

type Drop = { x: number; y: number; vy: number }
const drops: Drop[] = []

function spawnDrop(): void {
  drops.push({ x: 3 + Math.random() * (COLS - 6), y: -1, vy: 1.2 + Math.random() * 0.6 })
}

function stepDrops(): void {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]!
    d.y += d.vy
    if (d.y >= WATER_ROW) {
      dropAt(d.x, 0.8 + Math.random() * 0.5)
      drops.splice(i, 1)
    }
  }
}

// ---- lotus state ----

let lotusGrow = 0     // 0 = nothing, 1 = full bloom
let lotusStemH = 0    // stem height in rows
let lotusPetalR = 0   // petal radius

// ---- timing: 30 seconds total ----

// 0-2s:   void
// 2-4s:   water surface appears
// 4-7s:   first drop + ripple
// 7-13s:  more rain, ripples
// 13-16s: something beneath, rain easing
// 16-20s: stem rises, bud breaks surface
// 20-25s: bloom
// 25-30s: stillness

function getPhase(s: number): number {
  if (s < 2) return 0    // void
  if (s < 4) return 1    // water
  if (s < 7) return 2    // first drop
  if (s < 13) return 3   // rain
  if (s < 16) return 4   // beneath
  if (s < 20) return 5   // breakthrough
  if (s < 25) return 6   // bloom
  return 7               // still
}

function surfaceVis(s: number): number {
  if (s < 2) return 0
  if (s < 4) return (s - 2) / 2
  return 1
}

function rainRate(s: number): number {
  if (s < 4) return 0
  if (s < 5) return 0     // pause before first drop
  if (s < 5.5) return 0   // first drop is manual
  if (s < 7) return 0     // let ripple breathe
  if (s < 9) return 3
  if (s < 11) return 8
  if (s < 13) return 15
  if (s < 16) return 8    // easing
  if (s < 20) return 3
  if (s < 25) return 1
  return 0
}

function updateLotus(s: number): void {
  if (s < 13) { lotusGrow = 0; lotusStemH = 0; lotusPetalR = 0; return }
  if (s < 16) {
    // beneath: subtle bulge, no visible stem yet
    lotusGrow = (s - 13) / 3 * 0.1
    lotusStemH = 0
    lotusPetalR = 0
  } else if (s < 20) {
    // breakthrough: stem rises
    const t = (s - 16) / 4
    lotusGrow = 0.1 + t * 0.5
    lotusStemH = Math.floor(t * 8) // up to 8 rows above water
    lotusPetalR = t > 0.7 ? (t - 0.7) / 0.3 * 1.5 : 0 // bud starts opening
  } else if (s < 25) {
    // bloom
    const t = (s - 20) / 5
    lotusGrow = 0.6 + t * 0.4
    lotusStemH = 8
    lotusPetalR = 1.5 + t * 3 // full bloom radius
  } else {
    lotusGrow = 1
    lotusStemH = 8
    lotusPetalR = 4.5
  }
}

// ---- hash ----

function h(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }

function esc(c: string): string {
  if (c === '<') return '&lt;'; if (c === '>') return '&gt;'; if (c === '&') return '&amp;'; return c
}

// ---- DOM ----

const artEl = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; artEl.appendChild(el); rowEls.push(el)
}

// ---- render ----

let startTime: number | null = null
let dropAcc = 0
let firstDropDone = false

function frame(now: number): void {
  if (startTime === null) startTime = now
  const ms = now - startTime
  const s = ms / 1000

  // loop at 33s (30s + 3s black)
  if (s > 33) {
    startTime = now
    wave0.fill(0); wave1.fill(0)
    drops.length = 0
    firstDropDone = false
    dropAcc = 0
  }

  const phase = getPhase(s)
  const sv = surfaceVis(s)
  const rr = rainRate(s)
  const fi = Math.floor(ms / 90) // frame index for noise variation

  updateLotus(s)

  // first drop at 5s
  if (s > 5 && s < 5.2 && !firstDropDone) {
    firstDropDone = true
    drops.push({ x: COLS / 2, y: 0, vy: 1.5 })
  }

  // spawn rain
  dropAcc += rr / 60
  while (dropAcc >= 1) { spawnDrop(); dropAcc -= 1 }

  stepDrops()
  waveStep()
  waveStep()

  const kanji = KANJI_BY_PHASE[phase] ?? ''
  const lotusCenterX = COLS / 2

  for (let gy = 0; gy < ROWS; gy++) {
    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const seed = gx * 73 + gy * 137

      // ---- LOTUS (stem + flower) renders on top ----
      if (lotusGrow > 0 && lotusStemH > 0) {
        const stemTop = WATER_ROW - lotusStemH
        // stem
        if (gx === lotusCenterX && gy >= stemTop && gy < WATER_ROW) {
          const sc = STEM_CHARS[Math.floor(h(seed) * STEM_CHARS.length)]!
          const sl = Math.min(4, 2 + Math.floor(lotusGrow * 3))
          html += `<span class="g${sl}">${esc(sc)}</span>`
          continue
        }
        // flower/bud at top of stem
        if (lotusPetalR > 0) {
          const flowerY = stemTop - 1
          const dx = gx - lotusCenterX
          const dy = gy - flowerY
          const dist = Math.sqrt(dx * dx + dy * dy * 2.5) // wider than tall
          if (dist < lotusPetalR && dy <= 1) {
            if (dist < lotusPetalR * 0.3) {
              // center
              const pc = BUD_CHARS[Math.floor(h(seed + 99) * BUD_CHARS.length)]!
              html += `<span class="f4">${esc(pc)}</span>`
            } else {
              // petals
              const pc = PETAL_CHARS[Math.floor(h(seed + 77) * PETAL_CHARS.length)]!
              const pl = Math.max(1, Math.min(4, Math.ceil((1 - dist / lotusPetalR) * 4)))
              html += `<span class="f${pl}">${esc(pc)}</span>`
            }
            continue
          }
        }
      }

      // ---- ABOVE WATER ----
      if (gy < WATER_ROW) {
        // falling drop here?
        let isDrop = false
        for (const d of drops) {
          if (Math.floor(d.x) === gx && Math.floor(d.y) === gy) { isDrop = true; break }
        }
        if (isDrop) {
          html += `<span class="d3">${esc(DROP_CHARS[Math.floor(h(seed) * DROP_CHARS.length)]!)}</span>`
          continue
        }
        // noise + kanji
        const nChance = phase === 0 ? 0.06 : 0.03
        if (h(seed + fi * 13) < nChance) {
          if (h(seed + fi * 7) < 0.04 && kanji.length > 0) {
            const kc = kanji[Math.floor(h(seed * 7) * kanji.length)]!
            const kl = 1 + Math.floor(h(seed * 3) * 3)
            html += `<span class="k${kl}">${esc(kc)}</span>`
          } else {
            const nc = NOISE_CHARS[Math.floor(h(seed + fi * 31) * NOISE_CHARS.length)]!
            html += `<span class="n${1 + Math.floor(h(seed * 5) * 3)}">${esc(nc)}</span>`
          }
        } else {
          html += ' '
        }
        continue
      }

      // ---- WATER SURFACE ROW ----
      if (gy === WATER_ROW) {
        if (sv <= 0) { html += ' '; continue }
        const fromCenter = Math.abs(gx - COLS / 2) / (COLS / 2)
        const reveal = sv - fromCenter * 0.7
        if (reveal <= 0) { html += ' '; continue }
        // beneath bulge pushes surface up
        const bulge = (phase >= 4 && lotusGrow > 0 && Math.abs(gx - lotusCenterX) < 3)
          ? lotusGrow * 0.5 : 0
        const wh = Math.abs(wave0[gx] ?? 0) + bulge
        const intensity = Math.min(1, wh * 3 + 0.25)
        const lvl = Math.max(1, Math.min(6, Math.ceil(intensity * 6 * Math.min(1, reveal * 1.5))))
        const sc = SURFACE_CHARS[Math.floor(h(seed + fi * 3) * SURFACE_CHARS.length)]!
        html += `<span class="w${lvl}">${esc(sc)}</span>`
        continue
      }

      // ---- BELOW WATER ----
      const simY = gy - WATER_ROW
      if (simY < SIM_H && sv > 0) {
        const wh = wave0[simY * SIM_W + gx] ?? 0
        const absH = Math.abs(wh)
        if (absH > 0.03) {
          const intensity = Math.min(1, absH * 5)
          const lvl = Math.max(1, Math.min(6, Math.ceil(intensity * 6)))
          const chars = absH > 0.15 ? RIPPLE_CHARS_STRONG : RIPPLE_CHARS_WEAK
          const rc = chars[Math.floor(h(seed) * chars.length)]!
          html += `<span class="p${lvl}">${esc(rc)}</span>`
        } else {
          // depth noise + kanji
          const depthFade = Math.max(0, 1 - simY / SIM_H)
          if (h(seed + fi * 3) < 0.015 * depthFade) {
            if (h(seed * 11) < 0.05 && kanji.length > 0) {
              const kc = kanji[Math.floor(h(seed * 7) * kanji.length)]!
              html += `<span class="k1">${esc(kc)}</span>`
            } else {
              html += `<span class="w1">${esc(RIPPLE_CHARS_WEAK[Math.floor(h(seed) * RIPPLE_CHARS_WEAK.length)]!)}</span>`
            }
          } else {
            html += ' '
          }
        }
      } else {
        html += ' '
      }
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
