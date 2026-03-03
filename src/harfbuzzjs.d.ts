declare module 'harfbuzzjs' {
  import type { HarfBuzzModule } from './harfbuzz-types.ts'
  const init: Promise<HarfBuzzModule>
  export default init
}
