const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'tmp-snaps')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const SNAP_TIMES_MS = [200, 800, 1800, 3200, 5000, 7500]

;(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 })
  page.on('pageerror', e => console.error('pageerror:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.error('console.error:', m.text()) })

  const url = 'http://127.0.0.1:3000/demos/kan'
  console.log('loading', url)
  await page.goto(url, { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 400))

  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.startsWith('kan-')) fs.unlinkSync(path.join(OUT_DIR, f))
  }

  const t0 = Date.now()
  for (const target of SNAP_TIMES_MS) {
    const wait = target - (Date.now() - t0)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    const fn = path.join(OUT_DIR, `kan-${String(target).padStart(5, '0')}.png`)
    await page.screenshot({ path: fn })
    console.log('wrote', fn)
  }

  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
