// Server-side text measurement using HarfBuzz (WASM).
// Drop-in replacement for canvas measureText in headless environments.

import type { HarfBuzzModule, HarfBuzzFont, HarfBuzzFace, HarfBuzzBlob } from './harfbuzz-types.ts'

let hb: HarfBuzzModule | null = null
const fonts = new Map<string, { font: HarfBuzzFont, face: HarfBuzzFace, blob: HarfBuzzBlob }>()

export async function init(): Promise<void> {
  if (hb !== null) return
  const mod = await import('harfbuzzjs')
  hb = await (mod.default as unknown as Promise<HarfBuzzModule>)
}

export function loadFont(name: string, path: string): void {
  if (hb === null) throw new Error('Call init() first')
  if (fonts.has(name)) return
  const data = require('fs').readFileSync(path) as Buffer
  const blob = hb.createBlob(new Uint8Array(data))
  const face = hb.createFace(blob, 0)
  const font = hb.createFont(face)
  fonts.set(name, { font, face, blob })
}

export function measureText(text: string, fontName: string, fontSize: number): number {
  if (hb === null) throw new Error('Call init() first')
  const entry = fonts.get(fontName)
  if (!entry) throw new Error(`Font "${fontName}" not loaded. Call loadFont() first.`)

  const buf = hb.createBuffer()
  buf.addText(text)
  buf.guessSegmentProperties()
  hb.shape(entry.font, buf)
  const glyphs = buf.json() as { ax: number }[]
  const scale = fontSize / entry.face.upem
  let width = 0
  for (let i = 0; i < glyphs.length; i++) {
    width += glyphs[i]!.ax
  }
  buf.destroy()
  return width * scale
}
