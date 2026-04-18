// Simple dev server that works on Windows
// Usage: bun serve.ts
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const PORT = 3000
const ROOT = import.meta.dir

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.ts': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
}

// Route map: URL path -> file path (relative to ROOT)
const routes: Record<string, string> = {
  '/': 'pages/works.html',
  '/works': 'pages/works.html',
  '/demos': 'pages/demos/index.html',
  '/demos/index': 'pages/demos/index.html',
  '/demos/lotus': 'pages/demos/lotus.html',
  '/demos/lotus-fall': 'pages/demos/lotus-fall.html',
  '/demos/cigarette': 'pages/demos/cigarette.html',
  '/demos/snow': 'pages/demos/snow.html',
  '/demos/voice': 'pages/demos/voice.html',
  '/demos/rei': 'pages/demos/rei.html',
  '/demos/snowman': 'pages/demos/snowman.html',
  '/demos/frost': 'pages/demos/frost.html',
  '/demos/fish': 'pages/demos/fish.html',
  '/demos/smoke': 'pages/demos/smoke.html',
  '/demos/volcano': 'pages/demos/volcano.html',
  '/demos/apple': 'pages/demos/apple.html',
  '/demos/life': 'pages/demos/life.html',
  '/demos/fluid-ascii': 'pages/demos/fluid-ascii.html',
  '/demos/red-thread': 'pages/demos/red-thread.html',
  '/demos/ivy-climb': 'pages/demos/ivy-climb.html',
  '/demos/ring': 'pages/demos/ring.html',
  '/demos/kan': 'pages/demos/kan.html',
  '/demos/showcase': 'pages/demos/showcase.html',
  '/demos/bubbles': 'pages/demos/bubbles.html',
  '/demos/accordion': 'pages/demos/accordion.html',
  '/demos/dynamic-layout': 'pages/demos/dynamic-layout.html',
  '/demos/editorial-engine': 'pages/demos/editorial-engine.html',
  '/demos/justification-comparison': 'pages/demos/justification-comparison.html',
  '/demos/rich-note': 'pages/demos/rich-note.html',
  '/demos/markdown-chat': 'pages/demos/markdown-chat.html',
  '/demos/masonry': 'pages/demos/masonry/index.html',
  '/demos/variable-typographic-ascii': 'pages/demos/variable-typographic-ascii.html',
  '/accuracy': 'pages/accuracy.html',
  '/benchmark': 'pages/benchmark.html',
  '/corpus': 'pages/corpus.html',
  '/probe': 'pages/probe.html',
}

async function buildTs(filePath: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [filePath],
    bundle: true,
    format: 'esm',
    target: 'browser',
    minify: false,
  })
  if (!result.success) {
    const errors = result.logs.map(l => l.message).join('\n')
    throw new Error(`Build failed: ${errors}`)
  }
  const output = result.outputs[0]
  if (!output) throw new Error('No build output')
  return await output.text()
}

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    let pathname = url.pathname

    // check route map for HTML pages
    const routeFile = routes[pathname]
    if (routeFile) {
      const filePath = join(ROOT, routeFile)
      if (existsSync(filePath)) {
        return new Response(readFileSync(filePath, 'utf-8'), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
    }

    // serve .ts files as compiled JS
    // Browser resolves relative paths like ./showcase.ts from /demos/showcase
    // which becomes /demos/showcase.ts -- remap to pages/demos/showcase.ts
    if (pathname.endsWith('.ts')) {
      let filePath = join(ROOT, pathname.slice(1))
      if (!existsSync(filePath)) {
        filePath = join(ROOT, 'pages', pathname.slice(1))
      }
      if (existsSync(filePath)) {
        try {
          const js = await buildTs(filePath)
          return new Response(js, {
            headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
          })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          return new Response(`console.error(${JSON.stringify(msg)})`, {
            headers: { 'Content-Type': 'application/javascript' },
            status: 500,
          })
        }
      }
    }

    // serve static files (try root first, then pages/ prefix)
    let filePath = join(ROOT, pathname.slice(1))
    if (!existsSync(filePath)) {
      filePath = join(ROOT, 'pages', pathname.slice(1))
    }
    if (existsSync(filePath)) {
      const ext = extname(filePath)
      const mime = MIME[ext] ?? 'application/octet-stream'
      const file = Bun.file(filePath)
      const size = file.size

      // Honor HTTP Range requests so browsers can seek inside videos.
      const rangeHeader = req.headers.get('range')
      if (rangeHeader !== null) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
        if (m !== null) {
          const startStr = m[1]
          const endStr = m[2]
          let start = startStr === '' ? 0 : parseInt(startStr, 10)
          let end = endStr === '' ? size - 1 : parseInt(endStr, 10)
          if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= size || start > end) {
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}` },
            })
          }
          const slice = file.slice(start, end + 1)
          return new Response(slice, {
            status: 206,
            headers: {
              'Content-Type': mime,
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Content-Length': String(end - start + 1),
            },
          })
        }
      }

      return new Response(file, {
        headers: {
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size),
        },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`Dev server running at http://127.0.0.1:${PORT}`)
console.log(`Open http://127.0.0.1:${PORT}/demos/showcase`)
