// Minimal type declarations for harfbuzzjs

export type HarfBuzzBlob = { readonly _tag: 'blob' }

export type HarfBuzzFace = {
  readonly upem: number
  readonly _tag: 'face'
}

export type HarfBuzzFont = { readonly _tag: 'font' }

export type HarfBuzzBuffer = {
  addText(text: string): void
  guessSegmentProperties(): void
  json(): { ax: number }[]
  destroy(): void
}

export type HarfBuzzModule = {
  createBlob(data: Uint8Array): HarfBuzzBlob
  createFace(blob: HarfBuzzBlob, index: number): HarfBuzzFace
  createFont(face: HarfBuzzFace): HarfBuzzFont
  createBuffer(): HarfBuzzBuffer
  shape(font: HarfBuzzFont, buffer: HarfBuzzBuffer): void
  version: string
}
