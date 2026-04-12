// ============================================================
//  苹果种子 — canvas storybook animation
//
//  5 sentences, each adds one visual. Smooth growth driven by
//  energy interpolation. Canvas draws real curves, not ASCII.
//
//  1. 泥土 + 种子
//  2. 春风 + 阳光 + 雨
//  3. 发芽
//  4. 长成树
//  5. 开花 + 结苹果
// ============================================================

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

// 9:16 vertical, render at 2x for sharpness
const W = 540
const H = 960
const DPR = Math.min(window.devicePixelRatio, 3)
canvas.width = W * DPR
canvas.height = H * DPR
canvas.style.width = '100vw'
canvas.style.height = '100vh'
ctx.scale(DPR, DPR)

const CX = W / 2
const GROUND_Y = H * 0.72
const SEED_Y = GROUND_Y + 30

// ============================================================
//  Script
// ============================================================

const SCRIPT = [
  '泥土里睡着一颗小小的苹果种子。',
  '春风轻轻吹过，带来了温暖的阳光和细细的雨丝。',
  '小种子伸了伸腰，悄悄探出了绿色的嫩芽。',
  '它努力地向上爬呀爬，长出了茂密的枝叶。',
  '终于，它开出了粉白色的花朵，结出了红彤彤的大苹果。',
]

const TIMING: [number, number][] = [
  [0.5,  5.5],
  [7.0,  5.5],
  [14.0, 5.0],
  [20.5, 6.0],
  [28.0, 9.0],
]
const TOTAL = 40.0

// ============================================================
//  Growth state (smooth interpolation like lotus-fall)
// ============================================================

let energy = 0
let trunkHeight = 0    // pixels
let canopyRadius = 0
let bloomProgress = 0
let fruitProgress = 0

function getPhase(s: number): number {
  for (let i = TIMING.length - 1; i >= 0; i--) {
    if (s >= TIMING[i]![0]) return i
  }
  return -1
}

function updateGrowth(s: number): void {
  const phase = getPhase(s)
  let targetEnergy = 0
  if (phase >= 2) targetEnergy = 0.15
  if (phase >= 3) targetEnergy = 0.65
  if (phase >= 4) targetEnergy = 1.0
  energy += (targetEnergy - energy) * 0.018

  trunkHeight += (energy * 220 - trunkHeight) * 0.02
  const targetCanopy = energy > 0.25 ? (energy - 0.25) / 0.75 * 100 : 0
  canopyRadius += (targetCanopy - canopyRadius) * 0.018

  const targetBloom = phase >= 4 ? Math.min(1, (s - TIMING[4]![0]) / 3.5) : 0
  bloomProgress += (targetBloom - bloomProgress) * 0.025

  const targetFruit = phase >= 4 ? Math.max(0, Math.min(1, (s - TIMING[4]![0] - 3.5) / 3)) : 0
  fruitProgress += (targetFruit - fruitProgress) * 0.025
}

// ============================================================
//  Particles
// ============================================================

interface Particle { x: number; y: number; vx: number; vy: number; life: number; kind: 'rain' | 'sun' | 'wind' | 'petal' }
const particles: Particle[] = []

function spawnParticles(s: number): void {
  const phase = getPhase(s)
  if (phase < 1) return

  // Rain
  if (phase >= 1 && phase <= 3 && Math.random() < 0.3) {
    particles.push({
      x: Math.random() * W, y: -10,
      vx: -0.3, vy: 4 + Math.random() * 3,
      life: 1, kind: 'rain',
    })
  }

  // Sunshine dots (subtle)
  if (phase >= 1 && Math.random() < 0.05) {
    particles.push({
      x: Math.random() * W, y: Math.random() * GROUND_Y * 0.5,
      vx: 0, vy: 0.2,
      life: 1, kind: 'sun',
    })
  }

  // Wind wisps (phase 1-2)
  if (phase >= 1 && phase <= 2 && Math.random() < 0.02) {
    particles.push({
      x: -20, y: GROUND_Y - 100 + Math.random() * 80,
      vx: 1.5 + Math.random(), vy: (Math.random() - 0.5) * 0.3,
      life: 1, kind: 'wind',
    })
  }

  // Falling petals (phase 4, after bloom)
  if (bloomProgress > 0.5 && Math.random() < 0.03) {
    const trunkTop = GROUND_Y - trunkHeight
    particles.push({
      x: CX + (Math.random() - 0.5) * canopyRadius * 2, y: trunkTop - canopyRadius * 0.5,
      vx: (Math.random() - 0.5) * 0.5, vy: 0.5 + Math.random() * 0.5,
      life: 1, kind: 'petal',
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx; p.y += p.vy
    if (p.kind === 'rain') { p.life -= 0.015; if (p.y > GROUND_Y) p.life = 0 }
    else if (p.kind === 'sun') { p.life -= 0.008 }
    else if (p.kind === 'wind') { p.life -= 0.006; p.vy += Math.sin(p.x * 0.02) * 0.02 }
    else if (p.kind === 'petal') { p.life -= 0.005; p.vx += Math.sin(p.y * 0.05) * 0.03; if (p.y > GROUND_Y) p.life = 0 }
    if (p.life <= 0 || p.x > W + 20) particles.splice(i, 1)
  }
  if (particles.length > 300) particles.splice(0, particles.length - 300)
}

// ============================================================
//  Drawing helpers
// ============================================================

// Fractal tree branch
function drawBranch(x: number, y: number, angle: number, length: number, width: number, depth: number): void {
  if (depth <= 0 || length < 3) return

  const endX = x + Math.cos(angle) * length
  const endY = y + Math.sin(angle) * length

  // Trunk/branch
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(endX, endY)
  ctx.strokeStyle = depth > 3 ? '#5a4030' : '#6b5a3a'
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.stroke()

  // Sub-branches
  const shrink = 0.68 + Math.random() * 0.1
  const spread = 0.35 + Math.random() * 0.15
  if (depth > 1) {
    drawBranch(endX, endY, angle - spread, length * shrink, width * 0.7, depth - 1)
    drawBranch(endX, endY, angle + spread, length * shrink, width * 0.7, depth - 1)
    if (depth > 3 && Math.random() > 0.4) {
      drawBranch(endX, endY, angle + (Math.random() - 0.5) * 0.3, length * shrink * 0.8, width * 0.5, depth - 2)
    }
  }
}

// Leafy canopy (soft cluster of circles)
function drawCanopy(cx: number, cy: number, radius: number): void {
  if (radius < 5) return
  const clusters = 12 + Math.floor(radius * 0.3)
  for (let i = 0; i < clusters; i++) {
    const angle = (i / clusters) * Math.PI * 2 + Math.sin(i * 1.7) * 0.3
    const dist = radius * (0.3 + Math.random() * 0.6)
    const cr = radius * (0.3 + Math.random() * 0.3)
    const px = cx + Math.cos(angle) * dist
    const py = cy + Math.sin(angle) * dist * 0.6 - radius * 0.2
    const grad = ctx.createRadialGradient(px, py, 0, px, py, cr)
    grad.addColorStop(0, 'rgba(60, 140, 50, 0.7)')
    grad.addColorStop(0.6, 'rgba(45, 120, 40, 0.4)')
    grad.addColorStop(1, 'rgba(35, 100, 30, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, cr, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Flowers (small pink-white circles)
function drawFlowers(cx: number, cy: number, radius: number, progress: number): void {
  if (progress < 0.05) return
  // Use deterministic positions seeded by index
  const count = Math.floor(progress * 20)
  for (let i = 0; i < count; i++) {
    const seed = Math.sin(i * 127.1 + 311.7)
    const seed2 = Math.sin(i * 269.5 + 183.3)
    const angle = seed * Math.PI * 2
    const dist = radius * (0.4 + Math.abs(seed2) * 0.5)
    const px = cx + Math.cos(angle) * dist
    const py = cy + Math.sin(angle) * dist * 0.6 - radius * 0.15
    const fr = 4 + Math.abs(seed) * 4

    // Petals
    ctx.fillStyle = `rgba(255, 210, 220, ${0.6 * progress})`
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(px + Math.cos(pa) * fr * 0.4, py + Math.sin(pa) * fr * 0.4, fr * 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
    // Center
    ctx.fillStyle = `rgba(255, 240, 180, ${0.8 * progress})`
    ctx.beginPath()
    ctx.arc(px, py, fr * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Apples (red circles)
function drawApples(cx: number, cy: number, radius: number, progress: number): void {
  if (progress < 0.05) return
  const positions = [
    [-0.4, 0.1], [0.5, -0.1], [-0.2, 0.4], [0.3, 0.3],
    [-0.6, -0.2], [0.6, 0.2], [0.0, -0.3], [-0.1, 0.5],
  ]
  const count = Math.floor(progress * positions.length)
  for (let i = 0; i < count; i++) {
    const [rx, ry] = positions[i]!
    const px = cx + rx! * radius
    const py = cy + ry! * radius * 0.6 - radius * 0.1
    const appleR = 8 + progress * 4

    // Apple body
    const grad = ctx.createRadialGradient(px - 2, py - 2, 0, px, py, appleR)
    grad.addColorStop(0, `rgba(255, 80, 60, ${progress})`)
    grad.addColorStop(0.7, `rgba(220, 40, 30, ${progress * 0.9})`)
    grad.addColorStop(1, `rgba(180, 20, 15, ${progress * 0.6})`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, appleR, 0, Math.PI * 2)
    ctx.fill()

    // Highlight
    ctx.fillStyle = `rgba(255, 255, 255, ${progress * 0.25})`
    ctx.beginPath()
    ctx.arc(px - appleR * 0.25, py - appleR * 0.25, appleR * 0.25, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ============================================================
//  Main frame
// ============================================================

let startT: number | null = null

function frame(now: number): void {
  if (startT === null) startT = now
  const s = (now - startT) / 1000

  if (s > TOTAL) {
    startT = now; energy = 0; trunkHeight = 0; canopyRadius = 0
    bloomProgress = 0; fruitProgress = 0; particles.length = 0
    requestAnimationFrame(frame); return
  }

  const phase = getPhase(s)
  updateGrowth(s)
  spawnParticles(s)
  updateParticles()

  // ---- Clear ----
  const gfade = s >= TOTAL - 2.5 ? Math.max(0, 1 - (s - (TOTAL - 2.5)) / 2.5) : 1
  ctx.globalAlpha = gfade
  ctx.clearRect(0, 0, W, H)

  // ---- Sky gradient ----
  const skyBrightness = phase >= 1 ? Math.min(1, energy + 0.3) : 0
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  skyGrad.addColorStop(0, `rgba(${15 + skyBrightness * 25}, ${18 + skyBrightness * 30}, ${12 + skyBrightness * 20}, 1)`)
  skyGrad.addColorStop(1, `rgba(${12 + skyBrightness * 15}, ${15 + skyBrightness * 20}, ${10 + skyBrightness * 12}, 1)`)
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, GROUND_Y)

  // ---- Ground ----
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  groundGrad.addColorStop(0, '#3a2a18')
  groundGrad.addColorStop(0.3, '#2e2010')
  groundGrad.addColorStop(1, '#1a1208')
  ctx.fillStyle = groundGrad
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

  // Ground surface texture line
  ctx.strokeStyle = 'rgba(80, 60, 35, 0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, GROUND_Y)
  for (let x = 0; x < W; x += 5) {
    ctx.lineTo(x, GROUND_Y + Math.sin(x * 0.05) * 1.5)
  }
  ctx.stroke()

  // ---- Sunshine particles ----
  for (const p of particles) {
    if (p.kind === 'sun') {
      ctx.fillStyle = `rgba(255, 240, 180, ${p.life * 0.15})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---- Rain ----
  for (const p of particles) {
    if (p.kind === 'rain') {
      ctx.strokeStyle = `rgba(160, 200, 240, ${p.life * 0.3})`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + p.vx * 3, p.y + p.vy * 3)
      ctx.stroke()
    }
  }

  // ---- Wind wisps ----
  for (const p of particles) {
    if (p.kind === 'wind') {
      ctx.strokeStyle = `rgba(200, 220, 200, ${p.life * 0.08})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.quadraticCurveTo(p.x + 15, p.y + Math.sin(p.x * 0.1) * 5, p.x + 30, p.y)
      ctx.stroke()
    }
  }

  // ---- Seed ----
  if (phase >= 0 && trunkHeight < 20) {
    const pulse = 0.6 + 0.4 * Math.sin(s * 2)
    const seedR = 4 + pulse * 2
    const seedGrad = ctx.createRadialGradient(CX, SEED_Y, 0, CX, SEED_Y, seedR)
    seedGrad.addColorStop(0, `rgba(180, 150, 80, ${pulse * 0.9})`)
    seedGrad.addColorStop(1, `rgba(140, 110, 50, 0)`)
    ctx.fillStyle = seedGrad
    ctx.beginPath()
    ctx.arc(CX, SEED_Y, seedR, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- Tree ----
  if (trunkHeight > 3) {
    const trunkTop = GROUND_Y - trunkHeight
    const trunkW = 2 + energy * 8

    // Use fractal branches when tree is mature enough
    if (canopyRadius > 20) {
      // Save random state by using a fixed seed approach
      const savedRand = Math.random
      let rSeed = 12345
      Math.random = () => { rSeed = (rSeed * 16807) % 2147483647; return (rSeed - 1) / 2147483646 }

      drawBranch(CX, GROUND_Y, -Math.PI / 2, trunkHeight * 0.45, trunkW, 5)

      Math.random = savedRand
    } else {
      // Simple trunk line for sprout phase
      ctx.strokeStyle = energy < 0.3 ? '#4a8535' : '#5a4030'
      ctx.lineWidth = trunkW
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(CX, GROUND_Y)
      ctx.lineTo(CX, trunkTop)
      ctx.stroke()

      // Sprout tip
      if (trunkHeight > 5 && trunkHeight < 80) {
        ctx.strokeStyle = '#5aaa40'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(CX - 8, trunkTop + 5)
        ctx.quadraticCurveTo(CX - 3, trunkTop - 5, CX, trunkTop)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(CX + 8, trunkTop + 5)
        ctx.quadraticCurveTo(CX + 3, trunkTop - 5, CX, trunkTop)
        ctx.stroke()
      }
    }

    // Canopy
    drawCanopy(CX, trunkTop - canopyRadius * 0.3, canopyRadius)

    // Flowers
    drawFlowers(CX, trunkTop - canopyRadius * 0.3, canopyRadius, bloomProgress)

    // Apples
    drawApples(CX, trunkTop - canopyRadius * 0.3, canopyRadius, fruitProgress)
  }

  // ---- Falling petals ----
  for (const p of particles) {
    if (p.kind === 'petal') {
      ctx.fillStyle = `rgba(255, 200, 210, ${p.life * 0.5})`
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, 3, 2, p.x * 0.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---- Subtitle text ----
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = '15px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
  let textY = 30
  for (let i = 0; i < SCRIPT.length; i++) {
    const text = SCRIPT[i]!
    const isCurrent = i === phase
    const isPast = i < phase
    const isFuture = i > phase

    if (isCurrent) {
      ctx.fillStyle = 'rgba(255, 252, 240, 0.95)'
    } else if (isPast) {
      ctx.fillStyle = 'rgba(255, 250, 235, 0.35)'
    } else if (isFuture) {
      ctx.fillStyle = 'rgba(255, 250, 235, 0.08)'
    }

    // Wrap long lines
    const maxW = W - 60
    if (ctx.measureText(text).width > maxW) {
      const mid = Math.ceil(text.length / 2)
      ctx.fillText(text.slice(0, mid), CX, textY)
      textY += 22
      ctx.fillText(text.slice(mid), CX, textY)
    } else {
      ctx.fillText(text, CX, textY)
    }
    textY += 28
  }

  ctx.globalAlpha = 1
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
