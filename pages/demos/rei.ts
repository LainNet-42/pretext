import { prepareWithSegments } from '../../src/layout.ts'

// ============================================================
//  スロット — Slot Machine + Rei
//
//  Reuses Claude Code /buddy sprites 1:1 from
//  src/buddy/sprites.ts (18 species × 3 idle frames, 5×12).
//
//  Flow: Rei's words trigger lever pulls → reels spin → stop
//        3x miss → close → JACKPOT → ticket strip prints out →
//        animals escape from tickets → Rei's final line.
// ============================================================

const COLS = 45
const ROWS = 64

// Rei's voice is the display of the machine. JP line sits right above
// the credits display, CN one row below (just above the display frame).
const SUB_ROW = 18
const CN_ROW = 19

// Cabinet
const CAB_LEFT = 0
const CAB_RIGHT = 44
const CAB_TOP = 4
const CAB_BOT = 44

// Reels: 3 side-by-side, each 12 cols × 5 rows
// Shared vertical dividers between reels
const REEL_W = 12
const REEL_H = 5
const REEL_TOP = 12  // row of first content line
const REEL_COLS = [4, 16, 28]  // left col of each reel content

// Display
const DISPLAY_TOP = 21
const DISPLAY_LEFT = 12
const DISPLAY_RIGHT = 32

// Lever (right side, inside cabinet)
const LEVER_X = 39
const LEVER_TOP_IDLE = 19
const LEVER_TOP_PULLED = 26
const LEVER_BASE = 30

// Ticket slot (bottom of cabinet)
const SLOT_LEFT = 13
const SLOT_RIGHT = 31
const SLOT_ROW = 38  // horizontal opening

// Ticket chain area (below cabinet)
const TICKET_FIRST_ROW = 46   // first ticket top
const TICKET_COL = 17          // left col of tickets (centered)

// ============================================================
//  SPRITES (1:1 from claude-code/src/buddy/sprites.ts)
// ============================================================

// 18 species × 3 frames × 5 rows × 12 cols
// '{E}' is eye placeholder, replaced per-render
const BODIES: Record<string, string[][]> = {
  duck: [
    ['            ', '    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--\u00B4    '],
    ['            ', '    __      ', '  <({E} )___  ', '   (  ._>   ', '    `--\u00B4~   '],
    ['            ', '    __      ', '  <({E} )___  ', '   (  .__>  ', '    `--\u00B4    '],
  ],
  goose: [
    ['            ', '     ({E}>    ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['            ', '    ({E}>     ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
    ['            ', '     ({E}>>   ', '     ||     ', '   _(__)_   ', '    ^^^^    '],
  ],
  blob: [
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (      )  ', '   `----\u00B4   '],
    ['            ', '  .------.  ', ' (  {E}  {E}  ) ', ' (        ) ', '  `------\u00B4  '],
    ['            ', '    .--.    ', '   ({E}  {E})   ', '   (    )   ', '    `--\u00B4    '],
  ],
  cat: [
    ['            ', '   /\\_/\\    ', '  ( {E}   {E})  ', '  (  \u03C9  )   ', '  (")_(")   '],
    ['            ', '   /\\_/\\    ', '  ( {E}   {E})  ', '  (  \u03C9  )   ', '  (")_(")~  '],
    ['            ', '   /\\-/\\    ', '  ( {E}   {E})  ', '  (  \u03C9  )   ', '  (")_(")   '],
  ],
  dragon: [
    ['            ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-\u00B4  '],
    ['            ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (        ) ', '  `-vvvv-\u00B4  '],
    ['   ~    ~   ', '  /^\\  /^\\  ', ' <  {E}  {E}  > ', ' (   ~~   ) ', '  `-vvvv-\u00B4  '],
  ],
  octopus: [
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
    ['            ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  \\/\\/\\/\\/  '],
    ['     o      ', '   .----.   ', '  ( {E}  {E} )  ', '  (______)  ', '  /\\/\\/\\/\\  '],
  ],
  owl: [
    ['            ', '   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   `----\u00B4   '],
    ['            ', '   /\\  /\\   ', '  (({E})({E}))  ', '  (  ><  )  ', '   .----.   '],
    ['            ', '   /\\  /\\   ', '  (({E})(-))  ', '  (  ><  )  ', '   `----\u00B4   '],
  ],
  penguin: [
    ['            ', '  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---\u00B4     '],
    ['            ', '  .---.     ', '  ({E}>{E})     ', ' |(   )|    ', '  `---\u00B4     '],
    ['  .---.     ', '  ({E}>{E})     ', ' /(   )\\    ', '  `---\u00B4     ', '   ~ ~      '],
  ],
  turtle: [
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '  ``    ``  '],
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[______]\\ ', '   ``  ``   '],
    ['            ', '   _,--._   ', '  ( {E}  {E} )  ', ' /[======]\\ ', '  ``    ``  '],
  ],
  snail: [
    ['            ', ' {E}    .--.  ', '  \\  ( @ )  ', '   \\_`--\u00B4   ', '  ~~~~~~~   '],
    ['            ', '  {E}   .--.  ', '  |  ( @ )  ', '   \\_`--\u00B4   ', '  ~~~~~~~   '],
    ['            ', ' {E}    .--.  ', '  \\  ( @  ) ', '   \\_`--\u00B4   ', '   ~~~~~~   '],
  ],
  ghost: [
    ['            ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~`~``~`~  '],
    ['            ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  `~`~~`~`  '],
    ['    ~  ~    ', '   .----.   ', '  / {E}  {E} \\  ', '  |      |  ', '  ~~`~~`~~  '],
  ],
  axolotl: [
    ['            ', '}~(______)~{', '}~({E} .. {E})~{', '  ( .--. )  ', '  (_/  \\_)  '],
    ['            ', '~}(______){~', '~}({E} .. {E}){~', '  ( .--. )  ', '  (_/  \\_)  '],
    ['            ', '}~(______)~{', '}~({E} .. {E})~{', '  (  --  )  ', '  ~_/  \\_~  '],
  ],
  capybara: [
    ['            ', '  n______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------\u00B4  '],
    ['            ', '  n______n  ', ' ( {E}    {E} ) ', ' (   Oo   ) ', '  `------\u00B4  '],
    ['    ~  ~    ', '  u______n  ', ' ( {E}    {E} ) ', ' (   oo   ) ', '  `------\u00B4  '],
  ],
  cactus: [
    ['            ', ' n  ____  n ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
    ['            ', '    ____    ', ' n |{E}  {E}| n ', ' |_|    |_| ', '   |    |   '],
    [' n        n ', ' |  ____  | ', ' | |{E}  {E}| | ', ' |_|    |_| ', '   |    |   '],
  ],
  robot: [
    ['            ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------\u00B4  '],
    ['            ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ -==- ]  ', '  `------\u00B4  '],
    ['     *      ', '   .[||].   ', '  [ {E}  {E} ]  ', '  [ ==== ]  ', '  `------\u00B4  '],
  ],
  rabbit: [
    ['            ', '   (\\__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
    ['            ', '   (|__/)   ', '  ( {E}  {E} )  ', ' =(  ..  )= ', '  (")__(")  '],
    ['            ', '   (\\__/)   ', '  ( {E}  {E} )  ', ' =( .  . )= ', '  (")__(")  '],
  ],
  mushroom: [
    ['            ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['            ', ' .-O-oo-O-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
    ['   . o  .   ', ' .-o-OO-o-. ', '(__________)', '   |{E}  {E}|   ', '   |____|   '],
  ],
  chonk: [
    ['            ', '  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------\u00B4  '],
    ['            ', '  /\\    /|  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------\u00B4  '],
    ['            ', '  /\\    /\\  ', ' ( {E}    {E} ) ', ' (   ..   ) ', '  `------\u00B4~ '],
  ],
}

const SPECIES_LIST = Object.keys(BODIES)
const EYES = ['·', '✦', '×', '◉', '@', '°']

// Species and eye to use per reel slot. Fixed for each species for consistency.
const SPECIES_EYE: Record<string, string> = {
  duck: '·', goose: '·', blob: '◉', cat: '·', dragon: '✦', octopus: '·',
  owl: '◉', penguin: '·', turtle: '·', snail: '·', ghost: '×',
  axolotl: '°', capybara: '·', cactus: '×', robot: '◉', rabbit: '·',
  mushroom: '·', chonk: '·',
}

// Rarity stars
const RARITY: Record<string, string> = {
  duck: '★★', goose: '★', blob: '★', cat: '★', dragon: '★★★★★',
  octopus: '★★★', owl: '★★', penguin: '★★', turtle: '★', snail: '★',
  ghost: '★★★', axolotl: '★★★★', capybara: '★★', cactus: '★★',
  robot: '★★★★', rabbit: '★★', mushroom: '★★★', chonk: '★★',
}

// Pre-normalize all sprite frames: center each species's content within the 12-wide window.
// This eliminates horizontal jitter when different species are shown adjacent to each other.
const SPRITES_NORMALIZED: Record<string, string[][]> = (() => {
  const out: Record<string, string[][]> = {}
  for (const sp of Object.keys(BODIES)) {
    // Find bounding box of visible content across all frames of this species
    let minC = 12, maxC = 0
    for (const frame of BODIES[sp]!) {
      const rendered = frame.map(l => l.replaceAll('{E}', SPECIES_EYE[sp]!))
      for (const line of rendered) {
        for (let c = 0; c < line.length; c++) {
          if (line[c] !== ' ') {
            if (c < minC) minC = c
            if (c > maxC) maxC = c
          }
        }
      }
    }
    const width = (minC > maxC) ? 0 : (maxC - minC + 1)
    const target = Math.floor((12 - width) / 2)
    const shift = target - minC
    // Apply shift to every frame/line, preserving 12-col width
    out[sp] = BODIES[sp]!.map(frame =>
      frame.map(rawLine => {
        const line = rawLine.replaceAll('{E}', SPECIES_EYE[sp]!)
        if (shift === 0) return line
        if (shift > 0) return (' '.repeat(shift) + line).slice(0, 12)
        // shift < 0: cut from left, pad right
        return (line.slice(-shift) + ' '.repeat(-shift)).slice(0, 12)
      })
    )
  }
  return out
})()

function renderSprite(species: string, frame: number): string[] {
  const frames = SPRITES_NORMALIZED[species]!
  return frames[frame % frames.length]!
}

// Species used in slot reels
const CAT = 'cat'
const OWL = 'owl'
const FOX_SUBSTITUTE = 'dragon'   // no fox in original — use dragon as "wild"
const PENGUIN = 'penguin'
const AXOLOTL = 'axolotl'

const PULLS: string[][] = [
  [CAT, FOX_SUBSTITUTE, OWL],       // pull 1: miss
  [OWL, OWL, AXOLOTL],               // pull 2: close
  [OWL, OWL, OWL],                   // pull 3: JACKPOT
]

// ============================================================
//  SCRIPT (Rei words drive action)
// ============================================================

// Rei narrates each reel as it stops. All lines are short, declarative,
// in-character. The three "来て" lines are the FALL lines — they trigger
// the lever pull via the text-becomes-force streak.
const KITE      = '\u6765\u3066\u3002'             // 来て。
const NEKO      = '\u732B\u3002'                    // 猫。
const RYUU      = '\u7ADC\u3002'                    // 竜。
const FUKURO    = '\u68DF\u3002'                    // 梟。
const CHIGAU    = '\u9055\u3046\u3002'              // 違う。
const UPA       = '\u30A6\u30D1\u3002'              // ウパ。
const ATO_HITO  = '\u3042\u3068\u3001\u4E00\u3064\u3002'  // あと、一つ。
const ITA       = '\u3044\u305F\u3002'              // いた。

const SCRIPT = [
  KITE,            // 0  来て (pull 1)
  NEKO,            // 1  猫
  RYUU,            // 2  竜
  FUKURO,          // 3  梟
  CHIGAU,          // 4  違う
  KITE,            // 5  来て (pull 2)
  FUKURO,          // 6  梟
  FUKURO,          // 7  梟
  UPA,             // 8  ウパ
  ATO_HITO,        // 9  あと、一つ
  KITE,            // 10 来て (pull 3)
  FUKURO,          // 11 梟
  FUKURO,          // 12 梟
  FUKURO,          // 13 梟 (jackpot)
  ITA,             // 14 いた
]

const SCRIPT_CN = [
  '(\u6765)',            // 来
  '(\u732B)',            // 猫
  '(\u9F99)',            // 龙
  '(\u67ED)',            // 枭
  '(\u4E0D\u5BF9)',      // 不对
  '(\u6765)',            // 来
  '(\u67ED)',            // 枭
  '(\u67ED)',            // 枭
  '(\u6C34\u6807)',      // 水螈
  '(\u5DEE\u4E00\u4E2A)', // 差一个
  '(\u6765)',            // 来
  '(\u67ED)',            // 枭
  '(\u67ED)',            // 枭
  '(\u67ED)',            // 枭
  '(\u5728\u3002)',      // 在。
]

// [at, typeDur, holdDur] — the three KITE lines are fall lines: FADE_OUT
// starts at (pullStart - FALL_DUR) so the streak lands on the lever exactly
// at pullStart. Non-fall lines are quick "flash" subtitles that live for
// ~0.7s so the next reel stop line can replace them.
const TIMING: [number, number, number][] = [
  [0.9,  0.5,  0.4],        // 0  来て  → fall 1.8 → impact 2.6 (pull 1)
  [4.0,  0.2,  0.4],        // 1  猫
  [4.9,  0.2,  0.4],        // 2  竜
  [5.8,  0.2,  0.5],        // 3  梟
  [6.5,  0.3,  0.6],        // 4  違う
  [7.5,  0.5,  0.5],        // 5  来て  → fall 8.5 → impact 9.3 (pull 2)
  [10.7, 0.2,  0.4],        // 6  梟
  [11.6, 0.2,  0.4],        // 7  梟
  [12.5, 0.3,  0.4],        // 8  ウパ
  [13.2, 0.5,  0.6],        // 9  あと、一つ
  [14.3, 0.5,  0.6],        // 10 来て  → fall 15.4 → impact 16.2 (pull 3)
  [17.0, 0.2,  0.4],        // 11 梟
  [17.9, 0.2,  0.4],        // 12 梟
  [18.8, 0.3,  0.3],        // 13 梟 (jackpot)
  [22.3, 0.3,  0.5],        // 14 いた (after jackpot rotation finishes — the reveal)
]

// Fall physics: horizontal force streak (SUB_ROW = LEVER_TOP_IDLE - 1, so
// no vertical drop — pure right-ward streak to the lever handle).
const FALL_DUR = 0.8
const KITE_LINE = KITE

interface Phase {
  pullStart: number
  pullEnd: number
  spinStart: number
  stopTimes: number[]
  result: string[]
}

const PULL_PHASES: Phase[] = [
  { pullStart: 2.6,  pullEnd: 3.0,  spinStart: 2.7,  stopTimes: [4.0,  4.9,  5.8],  result: PULLS[0]! },
  { pullStart: 9.3,  pullEnd: 9.7,  spinStart: 9.4,  stopTimes: [10.7, 11.6, 12.5], result: PULLS[1]! },
  { pullStart: 16.2, pullEnd: 16.6, spinStart: 16.3, stopTimes: [17.0, 17.9, 18.8], result: PULLS[2]! },
]

const JACKPOT_TIME = 18.8           // last reel locks — jackpot moment begins
const JACKPOT_END = 22.2            // rotating burst ends (3.4s total, +1s longer)
const TICKETS_START = 20.2          // tickets emerge during jackpot moment
const MORPH_START = 23.3            // chosen ticket begins transforming to egg
const MORPH_END = 25.3              // egg fully formed, drifted to center
const CABINET_FADE_START = 23.3     // cabinet curtain-fades bottom→top
const CABINET_FADE_END = 25.3
const WOBBLE_START = 25.3           // egg wobbles in place
const CRACK_START = 26.5            // cracks spread
const HATCH_TIME = 27.3             // shell bursts, buddy revealed
const CHAT_START = 27.8             // Q&A begins
const CLOSING_START = 42.5          // buddy dims, ending text fades in
const CLOSING_TEXT_AT = 43.5        // 「またね。」flight begins
const FADE_OUT_START = 47.0         // whole screen fades to black
const TOTAL = 49.0

// ============================================================
//  Q&A chat — Rei and the hatched buddy talk. Rei's lines are
//  real voice (mouth skill), buddy's "speech" is procedural
//  Web Audio blips (Balatro/Stardew style placeholders). Both
//  sides get a bordered bubble with a horizontal tail pointing
//  at the other speaker.
// ============================================================
interface ChatMsg {
  from: 'rei' | 'buddy'
  text: string        // the Japanese text shown in the bubble (buddy = blip glyphs)
  cn: string          // CN translation below the bubble
  at: number          // time in seconds (absolute)
  dur: number         // bubble visible duration
}
const CHAT: ChatMsg[] = [
  { from: 'rei',   text: '\u8AB0\u3002',             cn: '(\u8C01)',             at: CHAT_START + 0.0, dur: 1.8 },  // 誰。 who
  { from: 'buddy', text: '\u266A \u266A',             cn: '',                    at: CHAT_START + 2.0, dur: 1.4 },  // blip
  { from: 'rei',   text: '\u2026\u53CB\u9054\u3002', cn: '(\u670B\u53CB?)',     at: CHAT_START + 3.6, dur: 1.8 },  // ……友達 friend?
  { from: 'buddy', text: '\u266A \u266B \u266A',     cn: '',                    at: CHAT_START + 5.6, dur: 1.4 },  // blip
  { from: 'rei',   text: '\u305A\u3063\u3068\u3002', cn: '(\u4E00\u76F4?)',     at: CHAT_START + 7.2, dur: 1.8 },  // ずっと always?
  { from: 'buddy', text: '\u266A \u266B \u266A \u266B', cn: '',                 at: CHAT_START + 9.2, dur: 1.6 },  // blip (happy)
  { from: 'rei',   text: '\u2026\u3088\u308D\u3057\u304F\u3002', cn: '(\u8BF7\u591A\u5173\u7167)', at: CHAT_START + 10.8, dur: 3.0 },  // ……よろしく
]

// ============================================================
//  EGG sprite (for hatch sequence)
// ============================================================
// 5 rows × 9 cols (fits sprite width)
const EGG_FRAMES: string[][] = [
  // frame 0: plain egg
  ['   ,---.   ', '  / . . \\  ', ' (       ) ', '  \\ . . /  ', '   \'---\'   '],
  // frame 1: slight wobble (shifted 1 col)
  ['  ,---.    ', ' / . . \\   ', '(       )  ', ' \\ . . /   ', '  \'---\'    '],
  // frame 2: wobble other way
  ['    ,---.  ', '   / . . \\ ', '  (       )', '   \\ . . / ', '    \'---\'  '],
]
const EGG_CRACKED: string[][] = [
  // first crack
  ['   ,-\u2571-.   ', '  / \u2572  . \\  ', ' ( \u2571     ) ', '  \\ . . /  ', '   \'---\'   '],
  // more cracks
  ['   ,\u2571-\u2572.   ', '  /\u2572 \u2571 .\\  ', ' (\u2571\u2572  \u2571) ', '  \\\u2571.\u2572.\u2571/  ', '   \'---\'   '],
]

// ============================================================
//  pretext prep
// ============================================================

const FONT = '13px/15px "SF Mono","Cascadia Code",Consolas,monospace'
const ALL_CHARS = new Set<string>()
for (const sp of SPECIES_LIST) {
  for (const frame of BODIES[sp]!) {
    for (const line of frame) for (const c of line) ALL_CHARS.add(c)
  }
}
for (const e of EYES) ALL_CHARS.add(e)
for (const c of '╔═╗║╚╝┌┐└┘─│╭╮╰╯├┤┬┴┼ *+·✦✹×◉@°oO@.,\'`[]?●○◆◇░▒▓█★-_/\\|v^VJACKPOTSLOTCLAUDEPETSINSERTCOINCREDITSPAYOUT!()><~=\u2736\u25C8\u2550\u2551\u2503\u2502\u2580\u2584\u2582\u2501\u257B\u25B8\u25C2\u266A\u266B\u266C') {
  ALL_CHARS.add(c)
}
for (const c of '\u307E\u305F\u306D\u3002(\u518D\u89C1)') ALL_CHARS.add(c)  // またね。(再见)
// Jackpot rotating ray glyphs
for (const c of '\u2571\u2572\u2500\u2502\u2550\u2551\u254B') ALL_CHARS.add(c) // ╱ ╲ ─ │ ═ ║ ╋
// Payout popup text
for (const c of '+0123456789BONUSJACKPOTx') ALL_CHARS.add(c)
// Display indicators
for (const c of 'CRP\u25CB\u25CF') ALL_CHARS.add(c)  // CR P ○ ●
for (const line of SCRIPT) for (const c of line) ALL_CHARS.add(c)
for (const line of SCRIPT_CN) for (const c of line) ALL_CHARS.add(c)
for (const m of CHAT) { for (const c of m.text) ALL_CHARS.add(c); for (const c of m.cn) ALL_CHARS.add(c) }
for (const c of ALL_CHARS) prepareWithSegments(c, FONT)

// ---- CJK ----
function isCJK(c: number): boolean {
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) ||
    (c >= 0xFF00 && c <= 0xFF60) || (c >= 0x3000 && c <= 0x303F) ||
    (c >= 0x3040 && c <= 0x309F) || (c >= 0x30A0 && c <= 0x30FF)
}
function vw(t: string): number { let w = 0; for (let i = 0; i < t.length; i++) w += isCJK(t.charCodeAt(i)) ? 2 : 1; return w }
function coffs(t: string): number[] { const o: number[] = []; let c = 0; for (let i = 0; i < t.length; i++) { o.push(c); c += isCJK(t.charCodeAt(i)) ? 2 : 1 }; return o }

// ---- helpers ----
function H(n: number): number { return ((n * 2654435761) >>> 0) / 4294967296 }
function esc(c: string): string { return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c }
function cl(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v }

// ============================================================
//  Line state machine
// ============================================================

const enum St { WAIT, TYPE, HOLD, FADE_OUT, FADE_IN, SHOW, GONE }

interface Line {
  text: string; cn: string; st: St
  at: number; dur: number; hold: number; spd: number
  typed: number; cnTyped: number; t0: number
  prog: number
}

function mkLine(i: number): Line {
  const dur = TIMING[i]![1]
  return {
    text: SCRIPT[i]!, cn: SCRIPT_CN[i]!, st: St.WAIT,
    at: TIMING[i]![0], dur, hold: TIMING[i]![2],
    spd: SCRIPT[i]!.length / Math.max(0.1, dur),
    typed: 0, cnTyped: 0, t0: 0, prog: 0,
  }
}

const L: Line[] = SCRIPT.map((_, i) => mkLine(i))

function updateLines(s: number): void {
  for (let i = 0; i < L.length; i++) {
    const ln = L[i]!
    switch (ln.st) {
      case St.WAIT:
        if (s < ln.at) break
        // All lines now behave the same — type → hold → fade_out → gone.
        // (No more "final fade-in-and-permanently-hold" case; SHOW is a
        // trap state for that old flow and would leave the line stuck.)
        ln.st = St.TYPE; ln.t0 = s; ln.typed = 0; ln.cnTyped = 0
        break
      case St.TYPE: {
        const e = s - ln.t0
        ln.typed = Math.min(ln.text.length, Math.floor(e * ln.spd))
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(e * ln.cn.length / Math.max(0.1, ln.dur)))
        if (ln.typed >= ln.text.length) ln.st = St.HOLD
        break
      }
      case St.HOLD:
        ln.cnTyped = ln.cn.length
        if (s >= ln.t0 + ln.dur + ln.hold) { ln.st = St.FADE_OUT; ln.t0 = s; ln.prog = 0 }
        break
      case St.FADE_OUT: {
        const fd = ln.text === KITE_LINE ? FALL_DUR : 0.5
        ln.prog = Math.min(1, (s - ln.t0) / fd)
        if (ln.prog >= 1) ln.st = St.GONE
        break
      }
      case St.FADE_IN:
        ln.prog = Math.min(1, (s - ln.t0) / 2.0)
        ln.cnTyped = Math.min(ln.cn.length, Math.floor(ln.prog * ln.cn.length))
        if (ln.prog >= 1) ln.st = St.SHOW
        break
      case St.SHOW:
        ln.cnTyped = ln.cn.length; break
      case St.GONE: break
    }
  }
}

// ============================================================
//  Particles (sparkles + coins)
// ============================================================

interface Particle { x: number; y: number; vx: number; vy: number; life: number; ch: string; kind: 'sparkle' | 'coin' }
const particles: Particle[] = []
const MAX_PARTICLES = 100

// ---- Balatro-style payout popups ----
//
// When the jackpot lands, short scoring texts rise from the reels and
// fade upward — matching Balatro's chip / mult popups. Each popup is a
// short string plus a rising velocity and a fading life. They chain in
// a cascade so the total reads like a building payout.
interface Payout {
  text: string
  x: number          // top-left column (not centered)
  y: number
  vy: number
  life: number       // 0..1
  cls: string        // class prefix (gb / jp / sk)
}
const payouts: Payout[] = []
const MAX_PAYOUTS = 20

function spawnPayout(x: number, y: number, text: string, cls = 'gb'): void {
  if (payouts.length >= MAX_PAYOUTS) return
  payouts.push({ text, x, y, vy: -0.14, life: 1, cls })
}

function updatePayouts(): void {
  for (let i = payouts.length - 1; i >= 0; i--) {
    const p = payouts[i]!
    p.y += p.vy
    p.vy *= 0.985
    p.life -= 0.012
    if (p.life <= 0) payouts.splice(i, 1)
  }
}

// Cascade of payout popups that fire during the jackpot window.
// Each reel gets a "+100", then a centered "JACKPOT" text, then a
// growing "x3" multiplier at the end. Rebuilt fresh on loop reset.
interface PayoutCue { at: number; fired: boolean; fire: () => void }
const payoutCascade: PayoutCue[] = [
  { at: 19.2, fired: false, fire: () => spawnPayout(REEL_COLS[0]! + 3, REEL_TOP + REEL_H - 1, '+100') },
  { at: 19.6, fired: false, fire: () => spawnPayout(REEL_COLS[1]! + 3, REEL_TOP + REEL_H - 1, '+200') },
  { at: 20.0, fired: false, fire: () => spawnPayout(REEL_COLS[2]! + 3, REEL_TOP + REEL_H - 1, '+500') },
  { at: 20.5, fired: false, fire: () => spawnPayout(REEL_COLS[0]! + 2, REEL_TOP + REEL_H - 1, '+100') },
  { at: 20.8, fired: false, fire: () => spawnPayout(REEL_COLS[1]! + 2, REEL_TOP + REEL_H - 1, '+300') },
  { at: 21.1, fired: false, fire: () => spawnPayout(REEL_COLS[2]! + 2, REEL_TOP + REEL_H - 1, '+700') },
  { at: 21.4, fired: false, fire: () => spawnPayout(Math.floor(COLS / 2) - 3, REEL_TOP - 2, 'BONUS') },
  { at: 21.8, fired: false, fire: () => spawnPayout(Math.floor(COLS / 2) - 1, REEL_TOP - 4, 'x3') },
]

function resetPayoutCascade(): void {
  payouts.length = 0
  for (const c of payoutCascade) c.fired = false
}

function spawnSparkle(cx: number, cy: number, count: number): void {
  if (particles.length + count > MAX_PARTICLES) return
  const CH_SPARKLE = '*+·✦'
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 0.08 + Math.random() * 0.18
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp * 0.6,
      life: 1.0,
      ch: CH_SPARKLE[Math.floor(Math.random() * CH_SPARKLE.length)]!,
      kind: 'sparkle',
    })
  }
}

function updateParticles(): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!
    p.x += p.vx; p.y += p.vy
    p.vx *= 0.96; p.vy *= 0.96
    p.life -= 0.022
    if (p.life <= 0) particles.splice(i, 1)
  }
}

// ============================================================
//  Tickets (emerge from bottom slot after jackpot)
// ============================================================

interface Ticket {
  species: string
  emergeAt: number
  targetIdx: number  // position in chain
  x: number; y: number
  progress: number
}

const tickets: Ticket[] = []

function scheduleTicket(emergeAt: number, species: string): void {
  const idx = tickets.length
  tickets.push({
    species, emergeAt, targetIdx: idx,
    x: (SLOT_LEFT + SLOT_RIGHT) / 2 - 4, y: SLOT_ROW,
    progress: 0,
  })
}

function updateTickets(s: number): void {
  for (const t of tickets) {
    if (s < t.emergeAt) continue
    const elapsed = s - t.emergeAt
    t.progress = Math.min(1, elapsed / 0.7)
    const targetX = TICKET_COL
    const targetY = TICKET_FIRST_ROW + t.targetIdx * 4
    const ease = t.progress < 0.5 ? 2 * t.progress * t.progress : 1 - Math.pow(-2 * t.progress + 2, 2) / 2
    t.x = ((SLOT_LEFT + SLOT_RIGHT) / 2 - 4) + (targetX - ((SLOT_LEFT + SLOT_RIGHT) / 2 - 4)) * ease
    t.y = SLOT_ROW + (targetY - SLOT_ROW) * ease
  }
}

function getTicketFace(species: string): string {
  // Compact 8-char face for ticket
  const eye = SPECIES_EYE[species]!
  switch (species) {
    case 'duck':     return `  (${eye}>)  `
    case 'goose':    return `  (${eye}>>) `
    case 'blob':     return `  (${eye} ${eye})  `
    case 'cat':      return `  =${eye}ω${eye}=  `
    case 'dragon':   return ` <${eye}~${eye}> `
    case 'octopus':  return ` ~(${eye}${eye})~ `
    case 'owl':      return ` (${eye})(${eye}) `
    case 'penguin':  return `  (${eye}>${eye})  `
    case 'turtle':   return ` [${eye}_${eye}]  `
    case 'snail':    return `   ${eye}(@)  `
    case 'ghost':    return ` /${eye} ${eye}\\ `
    case 'axolotl':  return `  }${eye}${eye}{  `
    case 'capybara': return ` (${eye}oo${eye}) `
    case 'cactus':   return ` |${eye}  ${eye}| `
    case 'robot':    return `  [${eye}${eye}]   `
    case 'rabbit':   return ` (${eye}..${eye}) `
    case 'mushroom': return ` |${eye}  ${eye}| `
    case 'chonk':    return ` (${eye}.${eye})  `
    default:         return `  (${eye} ${eye})  `
  }
}

// ============================================================
//  Ticket → egg → buddy pipeline
// ============================================================

// The "chosen" ticket — middle owl of the 3 owls — morphs into an egg
// which then drifts up to center screen and hatches into the golden buddy.
const CHOSEN_TICKET_IDX = 1                       // index in tickets[] array
const TICKET_W = 10                               // ticket box width
const BUDDY_W = REEL_W                            // 12
const BUDDY_H = REEL_H                            // 5
const BUDDY_X = Math.floor((COLS - BUDDY_W) / 2)  // 16, centered
const BUDDY_Y = 22                                // upper-middle
const EGG_W = 11                                  // egg sprite width
const EGG_H = 5

// The egg (and eventually buddy) occupy the same top-left so it's seamless
// when the shell bursts and the buddy appears in place.
const EGG_FINAL_X = BUDDY_X - 1                   // aligned 1 col left
const EGG_FINAL_Y = BUDDY_Y

interface EggPose { x: number; y: number; stage: 'hidden' | 'morph' | 'egg' | 'cracked' | 'bursting' | 'gone' }
function getEggPose(s: number): EggPose {
  if (s < MORPH_START) return { x: TICKET_COL, y: TICKET_FIRST_ROW + CHOSEN_TICKET_IDX * 4, stage: 'hidden' }
  if (s < MORPH_END) {
    const t = (s - MORPH_START) / (MORPH_END - MORPH_START)
    // smoothstep for gentle drift
    const ease = t * t * (3 - 2 * t)
    const sx = TICKET_COL, sy = TICKET_FIRST_ROW + CHOSEN_TICKET_IDX * 4
    return { x: sx + (EGG_FINAL_X - sx) * ease, y: sy + (EGG_FINAL_Y - sy) * ease, stage: 'morph' }
  }
  if (s < CRACK_START) return { x: EGG_FINAL_X, y: EGG_FINAL_Y, stage: 'egg' }
  if (s < HATCH_TIME) return { x: EGG_FINAL_X, y: EGG_FINAL_Y, stage: 'cracked' }
  if (s < HATCH_TIME + 0.5) return { x: EGG_FINAL_X, y: EGG_FINAL_Y, stage: 'bursting' }
  return { x: EGG_FINAL_X, y: EGG_FINAL_Y, stage: 'gone' }
}

// Cabinet curtain-fade (bottom-up). 0 = full cabinet, 1 = gone.
function getCabinetFadeT(s: number): number {
  if (s < CABINET_FADE_START) return 0
  if (s >= CABINET_FADE_END) return 1
  const t = (s - CABINET_FADE_START) / (CABINET_FADE_END - CABINET_FADE_START)
  return t * t * (3 - 2 * t)
}

// Wrap text into lines of max CJK-width cols (each CJK char = 2 cols)
function wrapText(text: string, maxCols: number): string[] {
  // Simple: break at commas or fit whole text if short
  const result: string[] = []
  let line = ''
  let lineW = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const w = isCJK(c.charCodeAt(0)) ? 2 : 1
    if (lineW + w > maxCols) {
      if (line) result.push(line)
      line = c
      lineW = w
    } else {
      line += c
      lineW += w
    }
  }
  if (line) result.push(line)
  return result
}

// Render a speech bubble. `fullText` fixes the box size so it doesn't wobble
// while `displayText` types in. `variant` controls color (buddy=bright white,
// user=slightly dimmer). `tail` chooses tail side or none (for chat stack).
function drawSpeechBubble(
  setCell: (x: number, y: number, ch: string, cls: string) => void,
  bx: number, by: number,
  fullText: string, displayText: string,
  variant: 'buddy' | 'user' = 'buddy',
  tail: 'left' | 'right' | 'none' = 'none',
): number {
  const maxInnerCols = 18
  const fullLines = wrapText(fullText, maxInnerCols)
  const contentW = Math.max(...fullLines.map(l => vw(l)))
  const boxW = contentW + 4  // borders + padding
  const boxH = fullLines.length + 2
  const lines = wrapText(displayText, maxInnerCols)
  // Colors: buddy = bright white border, user = dimmer
  const prefix = variant === 'buddy' ? 'bu2' : 'bu1'
  const accent = variant === 'buddy' ? 'bu3' : 'bu2'

  // Border (rounded)
  setCell(bx, by, '\u256D', accent)  // ╭
  setCell(bx + boxW - 1, by, '\u256E', accent)  // ╮
  setCell(bx, by + boxH - 1, '\u2570', accent)  // ╰
  setCell(bx + boxW - 1, by + boxH - 1, '\u256F', accent)  // ╯
  for (let dx = 1; dx < boxW - 1; dx++) {
    setCell(bx + dx, by, '\u2500', accent)
    setCell(bx + dx, by + boxH - 1, '\u2500', accent)
  }
  for (let dy = 1; dy < boxH - 1; dy++) {
    setCell(bx, by + dy, '\u2502', accent)
    setCell(bx + boxW - 1, by + dy, '\u2502', accent)
  }
  // fill interior with empty space (so underlying grid is hidden)
  for (let dy = 1; dy < boxH - 1; dy++) {
    for (let dx = 1; dx < boxW - 1; dx++) {
      setCell(bx + dx, by + dy, ' ', prefix)
    }
  }
  // Text content (left-aligned with padding)
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!
    const offs = coffs(line)
    for (let j = 0; j < line.length; j++) {
      const c = line[j]!
      const cw = isCJK(c.charCodeAt(0)) ? 2 : 1
      setCell(bx + 2 + offs[j]!, by + 1 + li, c, prefix)
      if (cw === 2) setCell(bx + 2 + offs[j]! + 1, by + 1 + li, '', prefix)
    }
  }
  // Horizontal tail pointing toward the companion — CC style
  // (`<Text>─</Text>` appended inline, not a diagonal below).
  const midY = by + Math.floor(boxH / 2)
  if (tail === 'left') {
    // Bubble is to the RIGHT of the buddy — tail points LEFT at it
    setCell(bx - 1, midY, '\u2500', accent)  // ─
  } else if (tail === 'right') {
    // Bubble is to the LEFT of the buddy — tail points RIGHT at it
    setCell(bx + boxW, midY, '\u2500', accent)  // ─
  }
  return boxW
}

// ============================================================
//  Reel state — REAL vertical scroll (tape of sprites, offset in rows)
// ============================================================

const reelSprite: string[] = [SPECIES_LIST[0]!, SPECIES_LIST[0]!, SPECIES_LIST[0]!]
const reelSpinning: boolean[] = [false, false, false]
const reelLocked: boolean[] = [false, false, false]
// Scrolling state
const reelTape: string[][] = [[], [], []]  // tape[r] = array of species names
const reelOffset: number[] = [0, 0, 0]     // float row offset in tape
const reelTapeInit: boolean[] = [false, false, false]  // has tape been built for this pull

function buildReelTape(r: number, target: string): void {
  const tape: string[] = []
  const N = 10  // length before target
  for (let i = 0; i < N; i++) {
    tape.push(SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)]!)
  }
  tape.push(target)
  reelTape[r] = tape
  reelOffset[r] = 0
  reelTapeInit[r] = true
}

function resolvePullState(s: number): void {
  for (const p of PULL_PHASES) {
    if (s < p.pullStart || s > p.stopTimes[2]! + 0.5) continue
    if (s >= p.spinStart) {
      for (let i = 0; i < 3; i++) {
        // Initialize tape at spin start for this reel
        if (s >= p.spinStart && !reelTapeInit[i] && s < p.stopTimes[i]!) {
          buildReelTape(i, p.result[i]!)
        }
        if (s < p.stopTimes[i]!) {
          reelSpinning[i] = true
          reelLocked[i] = false
          // Linear scroll (no deceleration — discrete grid can't show smooth slowdown).
          // Reel reaches target exactly at stopTime, then snaps.
          const t = (s - p.spinStart) / (p.stopTimes[i]! - p.spinStart)
          const tape = reelTape[i]!
          const targetOffset = (tape.length - 1) * 5
          reelOffset[i] = t * targetOffset
          reelSprite[i] = tape[Math.min(tape.length - 1, Math.floor(reelOffset[i] / 5))]!
        } else {
          reelSpinning[i] = false
          reelLocked[i] = true
          reelSprite[i] = p.result[i]!
          const tape = reelTape[i]!
          if (tape.length > 0) reelOffset[i] = (tape.length - 1) * 5
        }
      }
    }
    // Reset init flags when phase fully ends
    if (s > p.stopTimes[2]! + 0.2) {
      // keep init true so we don't rebuild; but next phase will reset in own range
    }
  }
}

// Render reel from tape at current offset (returns 5-row sprite view)
function renderReelFromTape(r: number, s: number): string[] {
  const tape = reelTape[r]!
  const off = reelOffset[r]!
  if (tape.length === 0) {
    return renderSprite(reelSprite[r]!, getIdleFrame(reelSprite[r]!, s))
  }
  const result: string[] = []
  const offInt = Math.floor(off)
  for (let dy = 0; dy < REEL_H; dy++) {
    const tapeRow = offInt + dy
    const spriteIdx = Math.floor(tapeRow / REEL_H)
    const rowInSprite = ((tapeRow % REEL_H) + REEL_H) % REEL_H
    const species = tape[Math.min(tape.length - 1, spriteIdx)]!
    const frames = SPRITES_NORMALIZED[species]!
    result.push(frames[0]![rowInSprite]!)
  }
  return result
}

function getLeverT(s: number): number {
  for (const p of PULL_PHASES) {
    if (s >= p.pullStart && s <= p.pullEnd + 0.3) {
      const t = (s - p.pullStart) / (p.pullEnd - p.pullStart)
      if (t < 0.5) return Math.min(1, t * 2)
      return Math.max(0, 1 - (t - 0.5) * 2)
    }
  }
  return 0
}

// Idle animation: which frame (0-2) is active
function getIdleFrame(species: string, s: number): number {
  const offset = (species.charCodeAt(0) * 0.37) % 1.5
  return Math.floor((s + offset) * 1.8) % 3
}

// ============================================================
//  DOM
// ============================================================

const art = document.getElementById('art')!
const rowEls: HTMLDivElement[] = []
for (let r = 0; r < ROWS; r++) {
  const el = document.createElement('div'); el.className = 'r'; art.appendChild(el); rowEls.push(el)
}

// ============================================================
//  AUDIO  (cue-driven)
// ============================================================
//
// The demo runs silently on load. Clicking the overlay unlocks the audio
// context (browser autoplay policy), resets the timeline to s=0, and plays
// the BGM + all cued SFX/voice lines in sync with the animation.
//
// Rei voice: 19 short phrases generated in ONE mouth-skill call (consistent
// timbre), split by silencedetect at the …… gaps. See
// scripts/gen_rei_voice_v2.sh.
//
// Buddy voice: procedural Web Audio blips (Balatro/Stardew style). No file.
//
// Volumes are capped below the voice level so speech always reads clearly.

function makeAudio(src: string, volume = 1.0, loop = false): HTMLAudioElement {
  const a = new Audio(src)
  a.volume = volume
  a.loop = loop
  a.preload = 'auto'
  a.addEventListener('error', () => { /* missing file = silent */ })
  return a
}

const bgm = makeAudio('/sound/bgm.mp3', 0.22, true)

// SFX volumes — all capped below the voice level (0.95) so speech reads.
const SFX = {
  leverPull: makeAudio('/sound/sfx/lever_pull.mp3',   0.55),
  reelSpin:  makeAudio('/sound/sfx/reel_spin.mp3',    0.30),
  reelStop:  makeAudio('/sound/sfx/reel_stop.mp3',    0.40),
  jackpot:   makeAudio('/sound/sfx/jackpot.mp3',      0.45),
  ticket:    makeAudio('/sound/sfx/ticket_print.mp3', 0.35),
  crack:     makeAudio('/sound/sfx/egg_crack.mp3',    0.45),
  burst:     makeAudio('/sound/sfx/egg_burst.mp3',    0.50),
  shimmer:   makeAudio('/sound/sfx/shimmer.mp3',      0.55),
}

// Rei voice — 19 phrases from the one-shot mouth call, indexed in order.
// See scripts/gen_rei_voice_v2.sh and the NAMES array inside for mapping.
const REI_V: HTMLAudioElement[] = [
  makeAudio('/sound/voice/rei_01_kite_a.wav',      0.95),  // 来て (pull 1)
  makeAudio('/sound/voice/rei_02_neko.wav',        0.95),  // 猫
  makeAudio('/sound/voice/rei_03_ryuu.wav',        0.95),  // 竜
  makeAudio('/sound/voice/rei_04_fukuro_a.wav',    0.95),  // 梟 (p0 stop 3)
  makeAudio('/sound/voice/rei_05_chigau.wav',      0.95),  // 違う
  makeAudio('/sound/voice/rei_06_kite_b.wav',      0.95),  // 来て (pull 2)
  makeAudio('/sound/voice/rei_07_fukuro_b.wav',    0.95),  // 梟 (p1 stop 1)
  makeAudio('/sound/voice/rei_08_fukuro_c.wav',    0.95),  // 梟 (p1 stop 2)
  makeAudio('/sound/voice/rei_09_upa.wav',         0.95),  // ウパ
  makeAudio('/sound/voice/rei_10_ato_hitotsu.wav', 0.95),  // あと、一つ
  makeAudio('/sound/voice/rei_11_kite_c.wav',      0.95),  // 来て (pull 3)
  makeAudio('/sound/voice/rei_12_fukuro_d.wav',    0.95),  // 梟 (p2 stop 1)
  makeAudio('/sound/voice/rei_13_fukuro_e.wav',    0.95),  // 梟 (p2 stop 2)
  makeAudio('/sound/voice/rei_14_fukuro_f.wav',    0.95),  // 梟 (p2 stop 3 — jackpot)
  makeAudio('/sound/voice/rei_15_ita.wav',         0.95),  // いた
  makeAudio('/sound/voice/rei_16_dare.wav',        0.95),  // 誰 (Q&A)
  makeAudio('/sound/voice/rei_17_tomodachi.wav',   0.95),  // 友達
  makeAudio('/sound/voice/rei_18_zutto.wav',       0.95),  // ずっと
  makeAudio('/sound/voice/rei_19_yoroshiku.wav',   0.95),  // よろしく
]

// Procedural buddy "voice" — a short sequence of square-wave blips at
// rising/falling pitches. Built from scratch via Web Audio so every utter
// sounds slightly different (Balatro/Stardew placeholder vibe).
let audioCtx: AudioContext | null = null
function ensureAudioCtx(): AudioContext {
  if (!audioCtx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctx()
  }
  return audioCtx
}

function playBlip(count: number, basePitch = 500, direction: 'up' | 'down' | 'wobble' = 'up'): void {
  const ctx = ensureAudioCtx()
  let t = ctx.currentTime
  const step = 0.07
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    let freq = basePitch
    if (direction === 'up')     freq = basePitch * (1 + i * 0.12)
    if (direction === 'down')   freq = basePitch * (1 - i * 0.10)
    if (direction === 'wobble') freq = basePitch * (1 + (i % 2 === 0 ? 0.12 : -0.08))
    // Slight randomization so each blip has character
    freq *= 0.95 + Math.random() * 0.1
    osc.frequency.value = freq
    osc.connect(gain).connect(ctx.destination)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055)
    osc.start(t)
    osc.stop(t + 0.08)
    t += step
  }
}

// Play from start, ignoring autoplay rejections
function playFromStart(a: HTMLAudioElement): void {
  try { a.currentTime = 0 } catch { /* not loaded yet */ }
  a.play().catch(() => { /* autoplay blocked or file missing */ })
}

// Cue schedule — `at` in seconds on the master timeline. `fire` runs once
// per loop when the timeline crosses `at`. Flags reset in `resetAudioCues`.
interface Cue { at: number; fire: () => void; fired: boolean }
const AUDIO_CUES: Cue[] = [
  // --- Rei voice — slot phase (narrates each reel) ---
  { at: 0.9,  fire: () => playFromStart(REI_V[0]!),  fired: false },  // 来て 1
  { at: 4.0,  fire: () => playFromStart(REI_V[1]!),  fired: false },  // 猫
  { at: 4.9,  fire: () => playFromStart(REI_V[2]!),  fired: false },  // 竜
  { at: 5.8,  fire: () => playFromStart(REI_V[3]!),  fired: false },  // 梟
  { at: 6.5,  fire: () => playFromStart(REI_V[4]!),  fired: false },  // 違う
  { at: 7.5,  fire: () => playFromStart(REI_V[5]!),  fired: false },  // 来て 2
  { at: 10.7, fire: () => playFromStart(REI_V[6]!),  fired: false },  // 梟
  { at: 11.6, fire: () => playFromStart(REI_V[7]!),  fired: false },  // 梟
  { at: 12.5, fire: () => playFromStart(REI_V[8]!),  fired: false },  // ウパ
  { at: 13.2, fire: () => playFromStart(REI_V[9]!),  fired: false },  // あと、一つ
  { at: 14.3, fire: () => playFromStart(REI_V[10]!), fired: false },  // 来て 3
  { at: 17.0, fire: () => playFromStart(REI_V[11]!), fired: false },  // 梟
  { at: 17.9, fire: () => playFromStart(REI_V[12]!), fired: false },  // 梟
  { at: 18.8, fire: () => playFromStart(REI_V[13]!), fired: false },  // 梟 (jackpot)
  { at: 22.3, fire: () => playFromStart(REI_V[14]!), fired: false },  // いた (reveal after rotation)

  // --- Lever pull cha-chunks (pullStart) ---
  { at: 2.6,  fire: () => playFromStart(SFX.leverPull), fired: false },
  { at: 9.3,  fire: () => playFromStart(SFX.leverPull), fired: false },
  { at: 16.2, fire: () => playFromStart(SFX.leverPull), fired: false },

  // --- Reel spin whirrs (spinStart) ---
  { at: 2.7,  fire: () => playFromStart(SFX.reelSpin), fired: false },
  { at: 9.4,  fire: () => playFromStart(SFX.reelSpin), fired: false },
  { at: 16.3, fire: () => playFromStart(SFX.reelSpin), fired: false },

  // --- Reel stop clicks (every stopTimes entry) ---
  { at: 4.0,  fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 4.9,  fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 5.8,  fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 10.7, fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 11.6, fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 12.5, fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 17.0, fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 17.9, fire: () => playFromStart(SFX.reelStop), fired: false },
  { at: 18.8, fire: () => playFromStart(SFX.reelStop), fired: false },

  // --- Jackpot chime (quiet, not fanfare) ---
  { at: 18.9, fire: () => playFromStart(SFX.jackpot), fired: false },

  // --- Ticket printer (one per schedule entry) ---
  { at: 20.2, fire: () => playFromStart(SFX.ticket), fired: false },
  { at: 20.7, fire: () => playFromStart(SFX.ticket), fired: false },
  { at: 21.2, fire: () => playFromStart(SFX.ticket), fired: false },
  { at: 21.8, fire: () => playFromStart(SFX.ticket), fired: false },
  { at: 22.2, fire: () => playFromStart(SFX.ticket), fired: false },
  { at: 22.6, fire: () => playFromStart(SFX.ticket), fired: false },

  // --- Egg crack + burst + buddy shimmer ---
  { at: 26.5, fire: () => playFromStart(SFX.crack),   fired: false },
  { at: 27.3, fire: () => playFromStart(SFX.burst),   fired: false },
  { at: 27.6, fire: () => playFromStart(SFX.shimmer), fired: false },

  // --- Q&A — Rei voice lines + buddy blips (CHAT_START = 27.8) ---
  { at: 27.8, fire: () => playFromStart(REI_V[15]!),            fired: false }, // 誰
  { at: 29.8, fire: () => playBlip(2, 520, 'up'),                fired: false }, // blip
  { at: 31.4, fire: () => playFromStart(REI_V[16]!),            fired: false }, // 友達
  { at: 33.4, fire: () => playBlip(3, 480, 'up'),                fired: false }, // blip
  { at: 35.0, fire: () => playFromStart(REI_V[17]!),            fired: false }, // ずっと
  { at: 37.0, fire: () => playBlip(4, 500, 'wobble'),            fired: false }, // blip (happy)
  { at: 38.6, fire: () => playFromStart(REI_V[18]!),            fired: false }, // よろしく
]

// Sort by time so the per-frame scan can early-exit.
AUDIO_CUES.sort((a, b) => a.at - b.at)

let audioEnabled = false

function resetAudioCues(): void {
  for (const c of AUDIO_CUES) c.fired = false
}

function fireAudioCues(s: number): void {
  if (!audioEnabled) return
  for (const c of AUDIO_CUES) {
    if (c.fired) continue
    if (s >= c.at) { c.fire(); c.fired = true }
    else break  // sorted — later cues not due yet
  }
}

const startOverlay = document.getElementById('start')!
startOverlay.addEventListener('click', () => {
  audioEnabled = true
  startOverlay.classList.add('gone')
  // Unlock the Web Audio context so procedural blips can play
  ensureAudioCtx().resume().catch(() => { /* ignore */ })
  // Reset timeline and cues so audio+animation sync from s=0
  startT = null
  resetAudioCues()
  bgm.play().catch(() => { /* missing/blocked; demo still runs silently */ })
})

// ============================================================
//  MAIN LOOP
// ============================================================

let startT: number | null = null
let lastSparkleT = 0
let ticketsScheduled = false

function frame(now: number): void {
  if (startT === null) startT = now
  const ms = now - startT; const s = ms / 1000

  if (s > TOTAL) {
    startT = now
    particles.length = 0
    resetPayoutCascade()
    tickets.length = 0
    ticketsScheduled = false
    reelTape[0] = []; reelTape[1] = []; reelTape[2] = []
    reelOffset[0] = 0; reelOffset[1] = 0; reelOffset[2] = 0
    reelTapeInit[0] = false; reelTapeInit[1] = false; reelTapeInit[2] = false
    reelSprite[0] = SPECIES_LIST[0]!; reelSprite[1] = SPECIES_LIST[0]!; reelSprite[2] = SPECIES_LIST[0]!
    reelSpinning[0] = false; reelSpinning[1] = false; reelSpinning[2] = false
    reelLocked[0] = false; reelLocked[1] = false; reelLocked[2] = false
    for (let i = 0; i < L.length; i++) Object.assign(L[i]!, mkLine(i))
    resetAudioCues()
    requestAnimationFrame(frame); return
  }

  fireAudioCues(s)

  const fi = Math.floor(ms / 80)

  updateLines(s)
  resolvePullState(s)
  updateParticles()
  updatePayouts()
  updateTickets(s)

  // ---- Balatro-style payout cascade during the jackpot window ----
  //
  // Spawn a sequence of rising score popups from the 3 reels + a big
  // "JACKPOT" popup + final "x3" multiplier, each gated once.
  {
    type Cascade = { at: number; fired?: boolean; fire: () => void }
    const list = payoutCascade as Cascade[]
    for (const c of list) {
      if (!c.fired && s >= c.at) { c.fire(); c.fired = true }
    }
  }

  // Schedule tickets after jackpot
  if (!ticketsScheduled && s >= TICKETS_START) {
    ticketsScheduled = true
    // 3 owl tickets first (the winning combo), then 5 more of varied species
    scheduleTicket(TICKETS_START + 0.0, 'owl')
    scheduleTicket(TICKETS_START + 0.5, 'owl')
    scheduleTicket(TICKETS_START + 1.0, 'owl')
    scheduleTicket(TICKETS_START + 1.6, 'axolotl')
    scheduleTicket(TICKETS_START + 2.0, 'capybara')
    scheduleTicket(TICKETS_START + 2.4, 'cat')
  }

  // Brief jackpot sparkle burst (just 0.4s, not the whole 5s dizzy loop)
  const frameJackpot = s >= JACKPOT_TIME && s < JACKPOT_TIME + 0.5
  if (frameJackpot && s - lastSparkleT > 0.06) {
    lastSparkleT = s
    for (let k = 0; k < 2; k++) {
      const edge = Math.floor(Math.random() * 4)
      let sx = 0, sy = 0
      if (edge === 0) { sx = CAB_LEFT + Math.random() * (CAB_RIGHT - CAB_LEFT); sy = CAB_TOP }
      else if (edge === 1) { sx = CAB_RIGHT; sy = CAB_TOP + Math.random() * (CAB_BOT - CAB_TOP) }
      else if (edge === 2) { sx = CAB_LEFT + Math.random() * (CAB_RIGHT - CAB_LEFT); sy = CAB_BOT }
      else { sx = CAB_LEFT; sy = CAB_TOP + Math.random() * (CAB_BOT - CAB_TOP) }
      spawnSparkle(sx, sy, 1)
    }
  }

  const gfade = s >= FADE_OUT_START ? Math.max(0, 1 - (s - FADE_OUT_START) / (TOTAL - FADE_OUT_START)) : 1.0
  const cabFade = getCabinetFadeT(s)                            // 0..1 bottom-up fade
  const cabinetVisible = s < CABINET_FADE_END
  const isJackpotGlow = s >= JACKPOT_TIME && s < CABINET_FADE_START
  const framePrefix = isJackpotGlow ? 'fj' : 'f'
  const eggPose = getEggPose(s)

  // ---- build cell map ----
  const cells: Array<{ ch: string; cls: string } | null> = new Array(COLS * ROWS).fill(null)
  function setCell(x: number, y: number, ch: string, cls: string): void {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return
    cells[y * COLS + x] = { ch, cls }
  }

  if (cabinetVisible) {
    // Marquee row (just above cabinet top)
    for (let i = 0; i <= CAB_RIGHT - CAB_LEFT; i++) {
      const x = CAB_LEFT + i
      const phase = (fi + i) % 4
      if (i % 2 === 0) {
        const ch = phase < 2 ? '●' : '○'
        setCell(x, CAB_TOP - 1, ch, isJackpotGlow ? 'jp3' : 'sk2')
      }
    }

    // Cabinet frame
    for (let x = CAB_LEFT; x <= CAB_RIGHT; x++) {
      setCell(x, CAB_TOP, x === CAB_LEFT ? '╔' : x === CAB_RIGHT ? '╗' : '═', `${framePrefix}3`)
      setCell(x, CAB_BOT, x === CAB_LEFT ? '╚' : x === CAB_RIGHT ? '╝' : '═', `${framePrefix}3`)
    }
    for (let y = CAB_TOP + 1; y < CAB_BOT; y++) {
      setCell(CAB_LEFT, y, '║', `${framePrefix}2`)
      setCell(CAB_RIGHT, y, '║', `${framePrefix}2`)
    }

    // Corner bolts/rivets (metallic look)
    setCell(CAB_LEFT + 1, CAB_TOP + 1, '◉', `${framePrefix}2`)
    setCell(CAB_RIGHT - 1, CAB_TOP + 1, '◉', `${framePrefix}2`)
    setCell(CAB_LEFT + 1, CAB_BOT - 1, '◉', `${framePrefix}2`)
    setCell(CAB_RIGHT - 1, CAB_BOT - 1, '◉', `${framePrefix}2`)
    // mid-side rivets
    setCell(CAB_LEFT, Math.floor((CAB_TOP + CAB_BOT) / 2), '●', `${framePrefix}1`)
    setCell(CAB_RIGHT, Math.floor((CAB_TOP + CAB_BOT) / 2), '●', `${framePrefix}1`)

    // Inner frame (second wall — creates depth)
    for (let x = CAB_LEFT + 2; x <= CAB_RIGHT - 2; x++) {
      setCell(x, CAB_TOP + 1, '─', `${framePrefix}1`)
    }
    // Inner side pillars (creates double-wall)
    for (let y = CAB_TOP + 2; y < CAB_BOT; y++) {
      if (y !== Math.floor((CAB_TOP + CAB_BOT) / 2)) {
        setCell(CAB_LEFT + 1, y, '│', `${framePrefix}1`)
        setCell(CAB_RIGHT - 1, y, '│', `${framePrefix}1`)
      }
    }

    // Title banner — ガチャ (Gacha)
    const title = '\u30AC\u30C1\u30E3'  // ガチャ
    const titleW = 6  // 3 CJK chars × 2 cols each
    const tx = Math.floor((COLS - titleW) / 2)
    for (let i = 0; i < title.length; i++) {
      const pulse = isJackpotGlow ? (0.6 + 0.4 * Math.sin(s * 5 + i)) : 1
      const lvl = cl(Math.ceil(pulse * 3), 1, 3)
      setCell(tx + i * 2, CAB_TOP + 3, title[i]!, `${isJackpotGlow ? 'jp' : framePrefix}${lvl}`)
    }
    // Decorative diamonds both sides
    setCell(tx - 4, CAB_TOP + 3, '◆', `${framePrefix}2`)
    setCell(tx - 3, CAB_TOP + 3, '◇', `${framePrefix}1`)
    setCell(tx + titleW + 1, CAB_TOP + 3, '◇', `${framePrefix}1`)
    setCell(tx + titleW + 2, CAB_TOP + 3, '◆', `${framePrefix}2`)
    // title underline decoration
    for (let i = tx - 5; i <= tx + titleW + 3; i++) {
      setCell(i, CAB_TOP + 4, '─', `${framePrefix}1`)
    }
    // decorative pattern line
    for (let i = tx - 5; i <= tx + titleW + 3; i += 2) {
      setCell(i, CAB_TOP + 5, '·', `${framePrefix}1`)
    }

    // ---- Reel windows (3 × 12 wide, 5 tall with shared dividers) ----
    const reelTop = REEL_TOP
    const reelBot = REEL_TOP + REEL_H - 1
    // Top and bottom borders of all 3 reels
    for (let r = 0; r < 3; r++) {
      const rx = REEL_COLS[r]!
      for (let dx = 0; dx < REEL_W; dx++) {
        setCell(rx + dx, reelTop - 1, '─', `${framePrefix}2`)
        setCell(rx + dx, reelBot + 1, '─', `${framePrefix}2`)
      }
    }
    // Left border of reel 1, right border of reel 3
    for (let dy = -1; dy <= REEL_H; dy++) {
      const ch = dy === -1 ? '┌' : dy === REEL_H ? '└' : '│'
      setCell(REEL_COLS[0]! - 1, reelTop + dy, ch, `${framePrefix}2`)
      const ch2 = dy === -1 ? '┐' : dy === REEL_H ? '┘' : '│'
      setCell(REEL_COLS[2]! + REEL_W, reelTop + dy, ch2, `${framePrefix}2`)
    }
    // Shared dividers
    for (let r = 1; r < 3; r++) {
      const dx = REEL_COLS[r]! - 1
      setCell(dx, reelTop - 1, '┬', `${framePrefix}2`)
      setCell(dx, reelBot + 1, '┴', `${framePrefix}2`)
      for (let dy = 0; dy < REEL_H; dy++) {
        setCell(dx, reelTop + dy, '│', `${framePrefix}2`)
      }
    }

    // Reel content — vertical scroll from tape during spin, static sprite when locked
    for (let r = 0; r < 3; r++) {
      const rx = REEL_COLS[r]!
      const ry = reelTop
      const spinning = reelSpinning[r]!
      const sprite = spinning ? renderReelFromTape(r, s)
        : renderSprite(reelSprite[r]!, getIdleFrame(reelSprite[r]!, s))

      for (let dy = 0; dy < REEL_H; dy++) {
        const line = sprite[dy]!
        for (let dx = 0; dx < REEL_W; dx++) {
          const ch = line[dx] ?? ' '
          if (ch === ' ') continue
          // keep color consistent throughout spin/lock; only jackpot glow changes it
          const cls = reelLocked[r] && isJackpotGlow ? 'jp3' : 'sp3'
          setCell(rx + dx, ry + dy, ch, cls)
        }
      }
    }

    // ---- Display ----
    for (let x = DISPLAY_LEFT; x <= DISPLAY_RIGHT; x++) {
      setCell(x, DISPLAY_TOP, x === DISPLAY_LEFT ? '┌' : x === DISPLAY_RIGHT ? '┐' : '─', `${framePrefix}1`)
      setCell(x, DISPLAY_TOP + 2, x === DISPLAY_LEFT ? '└' : x === DISPLAY_RIGHT ? '┘' : '─', `${framePrefix}1`)
    }
    setCell(DISPLAY_LEFT, DISPLAY_TOP + 1, '│', `${framePrefix}1`)
    setCell(DISPLAY_RIGHT, DISPLAY_TOP + 1, '│', `${framePrefix}1`)

    const dispCenter = Math.floor((DISPLAY_LEFT + DISPLAY_RIGHT) / 2)
    // Credit counter ramps 0 → 1800 across the jackpot window, matching
    // the rising payout popups. Before jackpot, shows 0000.
    let credits = 0
    if (s >= JACKPOT_TIME) {
      const cT = Math.min(1, (s - JACKPOT_TIME) / (JACKPOT_END - JACKPOT_TIME - 0.2))
      credits = Math.floor(cT * 1800)
      if (credits > 1800) credits = 1800
    }
    const score = `CR ${String(credits).padStart(4, '0')}`
    // Pull counter: show spin progress as filled/empty dots
    let completed = 0
    for (const ph of PULL_PHASES) if (s >= ph.stopTimes[2]!) completed++
    const dots = ['\u25CB', '\u25CB', '\u25CB']  // ○ ○ ○
    for (let i = 0; i < completed && i < 3; i++) dots[i] = '\u25CF'  // ●
    const pull = `P ${dots.join('')}`
    const combined = `${score}  ${pull}`
    const mx = dispCenter - Math.floor(combined.length / 2)
    const baseCls = isJackpotGlow ? 'jp' : 'sp'
    for (let i = 0; i < combined.length; i++) {
      const ch = combined[i]!
      // Highlight the credits digits brighter when the counter is live
      let lvl = 2
      if (isJackpotGlow) {
        const pulse = 0.7 + 0.3 * Math.sin(s * 8 + i * 0.6)
        lvl = cl(Math.ceil(pulse * 3), 1, 3)
      } else if (i >= 3 && i <= 6) {
        lvl = 3  // bright digits
      }
      setCell(mx + i, DISPLAY_TOP + 1, ch, `${baseCls}${lvl}`)
    }

    // ---- Lever (right side) ----
    const leverT = getLeverT(s)
    const handleTop = Math.round(LEVER_TOP_IDLE + leverT * (LEVER_TOP_PULLED - LEVER_TOP_IDLE))
    setCell(LEVER_X, handleTop - 1, '●', 'lv3')
    for (let y = handleTop; y <= handleTop + 2; y++) {
      setCell(LEVER_X, y, '█', 'lv3')
    }
    for (let y = handleTop + 3; y <= LEVER_BASE; y++) {
      setCell(LEVER_X, y, '║', 'lv2')
    }

    // Power LED (pulses near display)
    const ledPulse = Math.sin(s * 3) * 0.5 + 0.5
    setCell(DISPLAY_RIGHT + 3, DISPLAY_TOP + 1, '●', ledPulse > 0.5 ? 'lv3' : 'lv1')
    setCell(DISPLAY_RIGHT + 4, DISPLAY_TOP + 1, 'P', `${framePrefix}1`)

    // Decorative buttons below display (fake front-panel buttons)
    const btnRow = DISPLAY_TOP + 5
    const btnStart = DISPLAY_LEFT + 1
    // Button A
    setCell(btnStart, btnRow, '[', `${framePrefix}2`)
    setCell(btnStart + 1, btnRow, '\u2500', `${framePrefix}1`)
    setCell(btnStart + 2, btnRow, ']', `${framePrefix}2`)
    // Button B
    setCell(btnStart + 5, btnRow, '[', `${framePrefix}2`)
    setCell(btnStart + 6, btnRow, '\u2500', `${framePrefix}1`)
    setCell(btnStart + 7, btnRow, ']', `${framePrefix}2`)
    // Button C (bigger)
    setCell(btnStart + 10, btnRow, '[', `${framePrefix}2`)
    setCell(btnStart + 11, btnRow, '\u2550', `${framePrefix}2`)
    setCell(btnStart + 12, btnRow, '\u2550', `${framePrefix}2`)
    setCell(btnStart + 13, btnRow, ']', `${framePrefix}2`)

    // ---- PAYOUT area + ticket slot ----
    const payoutText = '\u2550\u2550\u2550 PAYOUT \u2550\u2550\u2550'
    const pcol = Math.floor((COLS - payoutText.length) / 2)
    for (let i = 0; i < payoutText.length; i++) {
      setCell(pcol + i, 35, payoutText[i]!, `${framePrefix}2`)
    }
    // Decorative brackets at payout
    setCell(pcol - 2, 35, '\u257B', `${framePrefix}1`)
    setCell(pcol + payoutText.length + 1, 35, '\u257B', `${framePrefix}1`)

    // Ticket slot opening (deep dark cavity with shading)
    for (let x = SLOT_LEFT; x <= SLOT_RIGHT; x++) {
      setCell(x, SLOT_ROW - 1, '\u2584', `${framePrefix}2`)
      setCell(x, SLOT_ROW, '\u2501', isJackpotGlow ? 'jp2' : `${framePrefix}1`)
      setCell(x, SLOT_ROW + 1, '\u2580', `${framePrefix}2`)
    }
    // Slot label arrow indicators
    setCell(SLOT_LEFT - 2, SLOT_ROW, '\u25B8', `${framePrefix}1`)
    setCell(SLOT_RIGHT + 2, SLOT_ROW, '\u25C2', `${framePrefix}1`)

    // Decorative bands on bottom panel (horizontal striping)
    for (let x = CAB_LEFT + 3; x < CAB_RIGHT - 2; x++) {
      setCell(x, CAB_BOT - 2, '\u2500', `${framePrefix}1`)
    }
  }

  // Base shadow (outside cabinet bottom, suggests cabinet sitting on surface)
  if (cabinetVisible) {
    for (let x = CAB_LEFT + 1; x <= CAB_RIGHT - 1; x++) {
      setCell(x, CAB_BOT + 1, '\u2582', `${framePrefix}1`)
    }
  }

  // ---- Cabinet curtain-fade (bottom-up, smooth) ----
  //
  // Each row has a "wave arrival" fraction — top rows disappear last, bottom
  // rows first. When the wave has passed a row, its cells clear. Around the
  // wave front we render dim fragments so it looks like the cabinet is
  // gently breaking down, not flicker-dissolving.
  if (cabFade > 0) {
    const rowSpan = (CAB_BOT + 2) - (CAB_TOP - 1)
    for (let y = CAB_TOP - 1; y <= CAB_BOT + 2; y++) {
      const rowFrac = ((CAB_BOT + 2) - y) / rowSpan   // 0 at bottom, 1 at top
      const gone = cabFade > rowFrac
      const nearFront = Math.abs(cabFade - rowFrac) < 0.08
      if (gone) {
        for (let x = CAB_LEFT; x <= CAB_RIGHT; x++) {
          cells[y * COLS + x] = null
        }
      } else if (nearFront) {
        // dim the cells along the fade front
        for (let x = CAB_LEFT; x <= CAB_RIGHT; x++) {
          const c = cells[y * COLS + x]
          if (c && H(x * 31 + y * 17) < 0.5) {
            cells[y * COLS + x] = { ch: c.ch, cls: 'f1' }
          }
        }
      }
    }
  }

  // ============================================================
  //  JACKPOT MOMENT — 3.4s rotating golden starburst
  // ============================================================
  //
  // Five things happen simultaneously:
  //   1. Brief shake (0.3s) right at JACKPOT_TIME so the whole cabinet
  //      "hits" the jackpot.
  //   2. Gold tint wave — a circle expands from the middle reel center;
  //      every cell the wave passes over is re-classed to gb1/gb2/gb3
  //      based on its original brightness. By 60% into the window the
  //      whole cabinet is gold.
  //   3. 8 rotating radial rays (─ │ ╱ ╲) from the middle reel.
  //   4. Pulsing star burst at the center (✹ ★ ✦ ✷).
  //   5. Two counter-rotating sparkle rings.
  //   6. Dark body dim under the reels for contrast.
  //
  // Envelope uses fixed 0.5s ramp-in and 0.7s ramp-out so the middle
  // stays full bright across the extra second of rotation.
  let shakeDx = 0, shakeDy = 0
  if (s >= JACKPOT_TIME && s < JACKPOT_TIME + 0.35) {
    const shakeT = 1 - (s - JACKPOT_TIME) / 0.35
    const seed = Math.floor(s * 30)
    shakeDx = Math.round((H(seed) - 0.5) * 3 * shakeT)
    shakeDy = Math.round((H(seed + 101) - 0.5) * 1.5 * shakeT)
  }

  if (s >= JACKPOT_TIME && s < JACKPOT_END) {
    const jpElapsed = s - JACKPOT_TIME
    const jpLeft = JACKPOT_END - s
    const jp = jpElapsed / (JACKPOT_END - JACKPOT_TIME)  // 0..1 progress
    const rampIn = Math.min(1, jpElapsed / 0.5)
    const rampOut = Math.min(1, jpLeft / 0.7)
    const alpha = Math.max(0, rampIn * rampOut)

    // --- 1. Dark body dim below the reels ---
    const dimIntensity = jp < 0.85 ? 1 : Math.max(0, 1 - (jp - 0.85) * 6.66)
    if (dimIntensity > 0) {
      for (let y = REEL_TOP + REEL_H; y <= CAB_BOT + 2; y++) {
        for (let x = CAB_LEFT; x <= CAB_RIGHT; x++) {
          const c = cells[y * COLS + x]
          if (!c) continue
          if (c.cls.startsWith('f1') || c.cls === 'rw') continue
          if (H(x * 3 + y * 5) < dimIntensity) {
            cells[y * COLS + x] = { ch: c.ch, cls: 'f1' }
          }
        }
      }
    }

    // --- 2. Gold tint wave ---
    // A circle of "gold influence" expands from the middle reel center,
    // growing from radius 0 to far beyond the screen over the first 60%
    // of the window. Any cell within the current radius gets re-classed
    // to gb1/gb2/gb3 based on a rough brightness reading of its
    // original class (cabinet f1/f2/f3 → gb1/gb2/gb3).
    if (jp > 0.1) {
      const tintT = Math.min(1, (jp - 0.1) / 0.55)   // reach full coverage at jp=0.65
      const tintRadius = tintT * 55
      const ccx = REEL_COLS[1]! + REEL_W / 2
      const ccy = REEL_TOP + REEL_H / 2
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = cells[y * COLS + x]
          if (!c) continue
          // Already gold? skip.
          if (c.cls.startsWith('gb') || c.cls.startsWith('rs') || c.cls.startsWith('jp')) continue
          const dx = x - ccx
          const dy = (y - ccy) * 1.6
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d > tintRadius) continue
          // Extract the brightness level from the class suffix (f1/f2/f3,
          // sp1/sp2/sp3, lv1/lv3, tc1/tc3, etc). Default to gb2.
          const last = c.cls[c.cls.length - 1]
          let lvl = 2
          if (last && last >= '1' && last <= '3') lvl = parseInt(last, 10)
          cells[y * COLS + x] = { ch: c.ch, cls: `gb${lvl}` }
        }
      }
    }

    if (alpha > 0.05) {
      const cx = REEL_COLS[1]! + REEL_W / 2
      const cy = REEL_TOP + REEL_H / 2
      const baseAngle = (s - JACKPOT_TIME) * Math.PI * 0.6  // rotates ~0.3 rev/s
      const rayCount = 8
      const maxRadius = 14

      // --- 1. Rotating radial rays ---
      // For each ray angle, step out from center and plot characters
      // along the line. Pick glyph by angle octant so the line reads
      // visually (─, /, |, \).
      for (let r = 0; r < rayCount; r++) {
        const ang = baseAngle + (r * Math.PI * 2) / rayCount
        const dxUnit = Math.cos(ang)
        const dyUnit = Math.sin(ang) * 0.6  // y-axis squash so rays look circular in the rectangular cell grid
        // Pick glyph by direction
        const absCos = Math.abs(dxUnit)
        const absSin = Math.abs(dyUnit / 0.6)
        let glyph: string
        if (absSin < 0.35) glyph = '\u2500'              // ─
        else if (absCos < 0.35) glyph = '\u2502'          // │
        else if (dxUnit * (dyUnit / 0.6) > 0) glyph = '\u2572'  // ╲
        else glyph = '\u2571'                             // ╱
        for (let t = 2; t <= maxRadius; t++) {
          const px = Math.round(cx + dxUnit * t)
          const py = Math.round(cy + dyUnit * t)
          if (px < 0 || px >= COLS || py < 0 || py >= ROWS) continue
          if (cells[py * COLS + px]) continue
          // Brightness fades with distance
          const fade = 1 - (t / maxRadius)
          const lvl = cl(Math.ceil(fade * alpha * 3), 1, 3)
          if (lvl > 0) {
            setCell(px, py, glyph, `gb${lvl}`)
          }
        }
      }

      // --- 2. Pulsing center star ---
      const starChars = ['\u2739', '\u2605', '\u2736', '\u2737']  // ✹ ★ ✦ ✷
      const starIdx = Math.floor(fi * 0.3) % starChars.length
      setCell(Math.round(cx), Math.round(cy), starChars[starIdx]!, 'gb3')
      // A glow cross right at center
      setCell(Math.round(cx) - 1, Math.round(cy), '\u2500', 'gb2')
      setCell(Math.round(cx) + 1, Math.round(cy), '\u2500', 'gb2')
      setCell(Math.round(cx), Math.round(cy) - 1, '\u2502', 'gb2')
      setCell(Math.round(cx), Math.round(cy) + 1, '\u2502', 'gb2')

      // --- 3. Co-rotating sparkle rings ---
      // Two rings of sparkles rotating in opposite directions at different
      // radii so the burst looks busy but controlled.
      const rings: Array<{ radius: number; count: number; angVel: number; phase: number }> = [
        { radius: 4, count: 6, angVel:  1.8, phase: 0 },
        { radius: 8, count: 10, angVel: -1.2, phase: Math.PI / 6 },
      ]
      for (const ring of rings) {
        for (let k = 0; k < ring.count; k++) {
          const a = (s - JACKPOT_TIME) * ring.angVel + ring.phase + (k * Math.PI * 2) / ring.count
          const px = Math.round(cx + Math.cos(a) * ring.radius)
          const py = Math.round(cy + Math.sin(a) * ring.radius * 0.6)
          if (px < 0 || px >= COLS || py < 0 || py >= ROWS) continue
          if (cells[py * COLS + px]) continue
          const lvl = cl(Math.ceil(alpha * 3), 1, 3)
          setCell(px, py, '\u2736', `gb${lvl}`)
        }
      }
    }
  }

  // ---- Jackpot shake: post-process shift of cabinet cells ----
  //
  // Only runs during the first 0.35s of the jackpot moment. Snapshots
  // every cell inside the cabinet bounding box, clears them, then
  // re-lays with (shakeDx, shakeDy) offset. Outside-cabinet cells
  // (particles etc.) stay put.
  if (shakeDx !== 0 || shakeDy !== 0) {
    const snapshot: Array<{ x: number; y: number; c: { ch: string; cls: string } }> = []
    for (let y = CAB_TOP - 1; y <= CAB_BOT + 2; y++) {
      for (let x = CAB_LEFT; x <= CAB_RIGHT; x++) {
        const c = cells[y * COLS + x]
        if (c) {
          snapshot.push({ x, y, c })
          cells[y * COLS + x] = null
        }
      }
    }
    for (const { x, y, c } of snapshot) {
      const nx = x + shakeDx, ny = y + shakeDy
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
        cells[ny * COLS + nx] = c
      }
    }
  }

  // ---- Tickets (emerging below slot) ----
  // The chosen ticket (middle owl) fades out slightly FASTER than the rest
  // while the egg takes its place — so the viewer sees it transforming.
  // Non-chosen tickets simply fade out as the cabinet leaves.
  for (const t of tickets) {
    if (s < t.emergeAt) continue
    const isChosen = t.targetIdx === CHOSEN_TICKET_IDX
    // fade during 22.0..24.0 bottom-up curtain window
    let alpha = 1
    if (s >= MORPH_START) {
      const ft = Math.min(1, (s - MORPH_START) / (MORPH_END - MORPH_START))
      // chosen ticket fades out first (by 0.4 of morph window) so egg can take over
      alpha = isChosen ? Math.max(0, 1 - ft / 0.4) : Math.max(0, 1 - ft)
    }
    if (alpha <= 0) continue
    const face = getTicketFace(t.species)
    const tx = Math.round(t.x), ty = Math.round(t.y)
    const lvl = cl(Math.ceil(t.progress * alpha * 3), 1, 3)
    // Ticket box frame
    setCell(tx, ty, '┌', `tc${lvl}`)
    setCell(tx + 9, ty, '┐', `tc${lvl}`)
    setCell(tx, ty + 2, '└', `tc${lvl}`)
    setCell(tx + 9, ty + 2, '┘', `tc${lvl}`)
    for (let i = 1; i < 9; i++) {
      setCell(tx + i, ty, '─', `tc${lvl}`)
      setCell(tx + i, ty + 2, '─', `tc${lvl}`)
    }
    setCell(tx, ty + 1, '│', `tc${lvl}`)
    setCell(tx + 9, ty + 1, '│', `tc${lvl}`)
    for (let i = 0; i < face.length && i < 8; i++) {
      const ch = face[i]!
      if (ch === ' ') continue
      setCell(tx + 1 + i, ty + 1, ch, `tc${lvl}`)
    }
  }

  // ---- Particles ----
  for (const p of particles) {
    const gx = Math.round(p.x), gy = Math.round(p.y)
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue
    const lvl = cl(Math.ceil(p.life * 3), 1, 3)
    setCell(gx, gy, p.ch, `sk${lvl}`)
  }

  // ---- Payout popups (Balatro-style rising score text) ----
  for (const p of payouts) {
    const px = Math.round(p.x), py = Math.round(p.y)
    const lvl = cl(Math.ceil(p.life * 3), 1, 3)
    for (let j = 0; j < p.text.length; j++) {
      const ch = p.text[j]!
      if (ch === ' ') continue
      const gx = px + j
      if (gx < 0 || gx >= COLS || py < 0 || py >= ROWS) continue
      setCell(gx, py, ch, `${p.cls}${lvl}`)
    }
  }

  // ---- Egg (ticket → morph → egg → crack → burst → gone) ----
  if (eggPose.stage !== 'hidden' && eggPose.stage !== 'gone') {
    const ex = Math.round(eggPose.x)
    const ey = Math.round(eggPose.y)
    // Pick the right art for the stage
    let eggArt: string[]
    if (eggPose.stage === 'morph') {
      // Use the first wobble frame (symmetric) during the drift up
      eggArt = EGG_FRAMES[0]!
    } else if (eggPose.stage === 'egg') {
      const frameIdx = Math.floor((s - MORPH_END) * 5) % 3
      eggArt = EGG_FRAMES[frameIdx]!
    } else if (eggPose.stage === 'cracked') {
      // Deepening cracks: 0 → 1 as we approach HATCH_TIME
      const crackProg = (s - CRACK_START) / (HATCH_TIME - CRACK_START)
      eggArt = crackProg > 0.5 ? EGG_CRACKED[1]! : EGG_CRACKED[0]!
    } else {
      // bursting: frame is gone quickly, shell fragments fly as particles
      eggArt = EGG_CRACKED[1]!
    }
    // Render egg sprite golden with rainbow shimmer. Scale brightness down
    // during morph so it appears to "resolve" out of the ticket.
    const resolveT = eggPose.stage === 'morph'
      ? Math.min(1, ((s - MORPH_START) / (MORPH_END - MORPH_START)))
      : 1
    const burstFade = eggPose.stage === 'bursting'
      ? Math.max(0, 1 - (s - HATCH_TIME) / 0.4)
      : 1
    for (let dy = 0; dy < EGG_H; dy++) {
      const line = eggArt[dy]!
      for (let dx = 0; dx < EGG_W; dx++) {
        const ch = line[dx] ?? ' '
        if (ch === ' ') continue
        // During morph: only some cells visible (probability grows with t)
        if (resolveT < 1 && H(dx * 7 + dy * 11) > resolveT) continue
        if (burstFade < 1 && H(dx * 5 + dy * 13 + fi) > burstFade) continue
        const sh = H(dx * 13 + dy * 17 + fi * 3)
        const cIdx = Math.floor((dx + dy + fi * 0.2) % 7)
        const cls = sh < 0.2 ? `rs${cIdx}` : 'gb3'
        setCell(ex + dx, ey + dy, ch, cls)
      }
    }

    // Soft golden aura during egg/crack stages
    if (eggPose.stage === 'egg' || eggPose.stage === 'cracked') {
      const cx = ex + 5, cy = ey + 2
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const px = cx + dx, py = cy + dy
          if (px < 0 || px >= COLS || py < 0 || py >= ROWS) continue
          if (cells[py * COLS + px]) continue
          const d = Math.sqrt(dx * dx + (dy * 1.5) ** 2)
          const intensity = Math.max(0, 1 - d / 5)
          if (H(px * 31 + py * 17 + fi * 5) < intensity * 0.08) {
            const lvl = cl(Math.ceil(intensity * 3), 1, 3)
            setCell(px, py, '\u00B7', `gb${lvl}`)
          }
        }
      }
    }

    // Crack particles: small sparks along the shell during 'cracked' stage
    if (eggPose.stage === 'cracked' && Math.random() < 0.2 && particles.length < MAX_PARTICLES) {
      particles.push({
        x: ex + 2 + Math.random() * 7,
        y: ey + Math.random() * 5,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -(0.04 + Math.random() * 0.06),
        life: 0.9,
        ch: '\u2736',
        kind: 'sparkle',
      })
    }

    // Burst: spawn shell-fragment particles once
    if (eggPose.stage === 'bursting' && s - HATCH_TIME < 0.04 && particles.length < MAX_PARTICLES - 24) {
      for (let k = 0; k < 24; k++) {
        const a = Math.random() * Math.PI * 2
        const sp = 0.12 + Math.random() * 0.22
        particles.push({
          x: ex + 5, y: ey + 2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.6 - 0.05,
          life: 1.0,
          ch: '\u25C8',
          kind: 'sparkle',
        })
      }
    }
  }

  // ---- Buddy appears in place of egg (fixed position, idle-animated) ----
  const buddyVisible = s >= HATCH_TIME && s < FADE_OUT_START
  // During the closing window the buddy dims gradually.
  const closingDim = s > CLOSING_START
    ? Math.max(0.25, 1 - (s - CLOSING_START) / (FADE_OUT_START - CLOSING_START) * 0.75)
    : 1
  if (buddyVisible) {
    const frame = getIdleFrame('owl', s)
    const sprite = renderSprite('owl', frame)
    const revealT = Math.min(1, (s - HATCH_TIME) / 0.6)
    // Render buddy sprite golden with rainbow shimmer highlights
    for (let dy = 0; dy < BUDDY_H; dy++) {
      const line = sprite[dy]!
      for (let dx = 0; dx < BUDDY_W; dx++) {
        const ch = line[dx] ?? ' '
        if (ch === ' ') continue
        if (revealT < 1 && H(dx * 11 + dy * 13) > revealT) continue
        const shimmerSeed = H(dx * 11 + dy * 19 + fi * 7)
        const cIdx = Math.floor(((dx + dy + fi * 0.3) / 2) % 7)
        // During the closing, the buddy dims down toward gb1.
        const dimLvl = closingDim < 1 ? cl(Math.ceil(closingDim * 3), 1, 3) : 3
        const cls = shimmerSeed < 0.12 ? `rs${cIdx}` : `gb${dimLvl}`
        setCell(BUDDY_X + dx, BUDDY_Y + dy, ch, cls)
      }
    }
    // Name label under the buddy — only shown for a brief window right
    // after hatching, not during the Q&A chat phase (so the dialogue
    // scene stays clean).
    if (revealT >= 1 && s < CHAT_START) {
      const label = 'owl'
      const lx = BUDDY_X + Math.floor((BUDDY_W - label.length) / 2)
      for (let i = 0; i < label.length; i++) {
        setCell(lx + i, BUDDY_Y + BUDDY_H, label[i]!, 'gb2')
      }
    }
  }

  // ---- Q&A speech bubble next to buddy (CC style) ----
  //
  // Two speakers alternating:
  //   'rei'   → bubble sits LEFT of buddy, tail points RIGHT at the buddy
  //   'buddy' → bubble sits RIGHT of buddy, tail points LEFT at the buddy
  // CN translation is rendered just below the bubble (rei lines only;
  // buddy bubbles contain ♪ glyphs and have no CN).
  if (buddyVisible && s < FADE_OUT_START) {
    let current: ChatMsg | null = null
    for (const m of CHAT) {
      if (s >= m.at && s < m.at + m.dur) { current = m; break }
    }
    if (current) {
      const age = s - current.at
      const typingDur = Math.min(0.7, current.dur * 0.35)
      const typedFrac = Math.min(1, age / typingDur)
      const typed = Math.max(1, Math.floor(typedFrac * current.text.length))
      const shown = current.text.slice(0, typed)
      // Box width from FULL text so the frame doesn't wobble while typing
      const fullLines = wrapText(current.text, 18)
      const contentW = Math.max(...fullLines.map(l => vw(l)))
      const boxW = contentW + 4
      const boxH = fullLines.length + 2
      const by = BUDDY_Y
      let bx: number
      let tail: 'left' | 'right'
      const variant: 'buddy' | 'user' = current.from === 'rei' ? 'user' : 'buddy'
      if (current.from === 'buddy') {
        // buddy bubble → right of buddy, tail points LEFT toward buddy
        bx = BUDDY_X + BUDDY_W + 2
        if (bx + boxW > COLS) bx = COLS - boxW
        tail = 'left'
      } else {
        // rei bubble → left of buddy, tail points RIGHT toward buddy
        bx = BUDDY_X - boxW - 2
        if (bx < 0) bx = 0
        tail = 'right'
      }
      drawSpeechBubble(setCell, bx, by, current.text, shown, variant, tail)

      // CN subtitle just below the bubble (rei lines only)
      if (typedFrac > 0.6 && current.cn) {
        const cnText = current.cn
        const cnW = vw(cnText)
        const cnX = bx + Math.floor((boxW - cnW) / 2)
        const cnY = by + boxH
        const cnOffs = coffs(cnText)
        for (let j = 0; j < cnText.length; j++) {
          const cgx = cnX + cnOffs[j]!
          if (cgx < 0 || cgx >= COLS) continue
          const ch = cnText[j]!
          const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
          setCell(cgx, cnY, ch, 'cn')
          if (cw === 2) setCell(cgx + 1, cnY, '', 'cn')
        }
      }
    }
  }

  // ---- Closing ending: 「またね。」flies out of buddy, lands centered ----
  //
  // Each char of MATANE is a particle that launches from the buddy's
  // center and arcs out to its final centered destination row below
  // the buddy, with a 3-step trail behind it. Chars stagger in one by
  // one (0.15s apart), ease-out cubic flight over 0.55s each. Once
  // all chars have landed, CN fades in beneath.
  if (s >= CLOSING_TEXT_AT && s < TOTAL) {
    const MATANE = '\u307E\u305F\u306D\u3002'          // またね。
    const MATANE_CN = '(\u518D\u89C1)'                  // (再见)
    const CHAR_STAGGER = 0.18
    const FLY_DUR = 0.6
    const matRow = BUDDY_Y + BUDDY_H + 4
    const matW = vw(MATANE)
    const matX = Math.floor((COLS - matW) / 2)
    const matOffs = coffs(MATANE)
    // Start point = buddy center
    const startX = BUDDY_X + BUDDY_W / 2
    const startY = BUDDY_Y + BUDDY_H / 2
    const fadeOutAlpha = s < FADE_OUT_START
      ? 1
      : Math.max(0, 1 - (s - FADE_OUT_START) / (TOTAL - FADE_OUT_START))

    let allLanded = true
    for (let j = 0; j < MATANE.length; j++) {
      const launchAt = CLOSING_TEXT_AT + j * CHAR_STAGGER
      if (s < launchAt) { allLanded = false; continue }
      const flyT = Math.min(1, (s - launchAt) / FLY_DUR)
      if (flyT < 1) allLanded = false
      const eased = 1 - Math.pow(1 - flyT, 3)  // ease-out cubic
      const endX = matX + matOffs[j]!
      const endY = matRow
      const px = Math.round(startX + (endX - startX) * eased)
      const py = Math.round(startY + (endY - startY) * eased)
      const ch = MATANE[j]!
      const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1

      // 3-step trail behind the flight path
      for (let k = 3; k >= 1; k--) {
        const tp = flyT - k * 0.09
        if (tp <= 0) continue
        const tEased = 1 - Math.pow(1 - tp, 3)
        const tpx = Math.round(startX + (endX - startX) * tEased)
        const tpy = Math.round(startY + (endY - startY) * tEased)
        if (tpx < 0 || tpx >= COLS || tpy < 0 || tpy >= ROWS) continue
        const trailLvl = cl(4 - k, 1, 3)
        setCell(tpx, tpy, ch, `rei${trailLvl}`)
        if (cw === 2) setCell(tpx + 1, tpy, '', `rei${trailLvl}`)
      }
      // Main char. Brightness peaks on landing then settles steady.
      if (px >= 0 && px < COLS && py >= 0 && py < ROWS) {
        const settleLvl = flyT > 0.9 ? 6 : 5
        const lvl = cl(Math.ceil(settleLvl * fadeOutAlpha), 1, 6)
        setCell(px, py, ch, `rei${lvl}`)
        if (cw === 2) setCell(px + 1, py, '', `rei${lvl}`)
      }
    }

    // CN fades in once all chars have landed
    if (allLanded && fadeOutAlpha > 0.1) {
      const cW = vw(MATANE_CN)
      const cX = Math.floor((COLS - cW) / 2)
      const cOffs = coffs(MATANE_CN)
      for (let j = 0; j < MATANE_CN.length; j++) {
        const gx = cX + cOffs[j]!
        const ch = MATANE_CN[j]!
        const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
        setCell(gx, matRow + 1, ch, 'cn')
        if (cw === 2) setCell(gx + 1, matRow + 1, '', 'cn')
      }
    }
  }

  // ---- Rei subtitle — sits above the credits display, Rei blue ----
  //
  // All SCRIPT lines are Rei's voice, rendered steady-brightness (no
  // per-char shimmer) on row SUB_ROW (= 18). Anchor is the CENTER of
  // the credits display so different-width stop callouts don't visibly
  // shift horizontally when one replaces the next.
  //
  // Only the LATEST line index that's non-terminal renders each frame.
  // We walk L[] from newest to oldest and pick the first visible one;
  // this is stable against FADE_OUT re-setting t0, which would break a
  // max-t0 selector.
  {
    let activeLine: Line | null = null
    for (let i = L.length - 1; i >= 0; i--) {
      const ln = L[i]!
      if (ln.st === St.WAIT || ln.st === St.GONE) continue
      activeLine = ln; break
    }
    if (activeLine) {
      const ln = activeLine
      const isFall = ln.text === KITE_LINE && ln.st === St.FADE_OUT
      const row = SUB_ROW
      const displayCx = Math.floor((DISPLAY_LEFT + DISPLAY_RIGHT) / 2)
      const sx = displayCx - Math.floor(vw(ln.text) / 2)

      if (isFall) {
        // Horizontal force streak — word slides right with quadratic
        // ease-in and morphs into ═, 4-step trail echo, ─ beam between
        // leading edge and lever, ✹ flash on impact.
        const p = ln.prog
        const slideT = p * p
        const wordW = vw(ln.text)
        const wordLeftEnd = LEVER_X - wordW + 1
        const wordLeft = sx + (wordLeftEnd - sx) * slideT
        const offs = coffs(ln.text)
        const TRAIL_STEPS = 4
        for (let j = 0; j < ln.text.length; j++) {
          const ch = ln.text[j]!
          if (ch === ' ') continue
          const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
          const displayCh = slideT > 0.5 ? '\u2550' : ch
          for (let k = TRAIL_STEPS; k >= 1; k--) {
            const tp = p - k * 0.06
            if (tp <= 0) continue
            const tSlide = tp * tp
            const tWordLeft = sx + (wordLeftEnd - sx) * tSlide
            const tpx = Math.round(tWordLeft + offs[j]!)
            if (tpx < 0 || tpx >= COLS) continue
            const trailLvl = cl(5 - k, 1, 4)
            setCell(tpx, row, displayCh, `rei${trailLvl}`)
            if (cw === 2) setCell(tpx + 1, row, '', `rei${trailLvl}`)
          }
          const px = Math.round(wordLeft + offs[j]!)
          if (px >= 0 && px < COLS) {
            setCell(px, row, displayCh, 'rei6')
            if (cw === 2) setCell(px + 1, row, '', 'rei6')
          }
        }
        if (slideT > 0.3) {
          const leadX = Math.round(wordLeft + wordW - 1)
          for (let bx = leadX + 1; bx < LEVER_X; bx++) {
            if (cells[row * COLS + bx]) continue
            const beamLvl = cl(Math.ceil((1 - (bx - leadX) / Math.max(1, LEVER_X - leadX)) * 4), 1, 4)
            setCell(bx, row, '\u2500', `rei${beamLvl}`)
          }
        }
        if (p > 0.8 && particles.length < MAX_PARTICLES - 3) {
          for (let k = 0; k < 2; k++) {
            const a = Math.random() * Math.PI * 2
            const sp = 0.14 + Math.random() * 0.20
            particles.push({
              x: LEVER_X + (Math.random() - 0.5) * 1.5,
              y: LEVER_TOP_IDLE + (Math.random() - 0.5) * 1.5,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp * 0.5 - 0.1,
              life: 0.9, ch: '\u2736', kind: 'sparkle',
            })
          }
        }
        if (p > 0.85) {
          const flashLvl = cl(Math.ceil((p - 0.85) * 20), 1, 3)
          setCell(LEVER_X, LEVER_TOP_IDLE, '\u2739', `jp${flashLvl}`)
        }
      } else {
        // Normal (non-fall) render — STEADY brightness, no per-char shimmer.
        // State only affects overall alpha: FADE_IN / FADE_OUT ramp the
        // whole word alpha class, TYPE / HOLD / SHOW hold at full bright.
        const txt = ln.st === St.TYPE ? ln.text.slice(0, ln.typed) : ln.text
        if (txt.length > 0) {
          let cls = 'rei5'
          if (ln.st === St.FADE_OUT) {
            cls = `rei${cl(Math.ceil((1 - ln.prog) * 5), 1, 5)}`
          } else if (ln.st === St.FADE_IN) {
            cls = `rei${cl(Math.ceil(ln.prog * 5), 1, 5)}`
          }
          const offs = coffs(txt)
          for (let j = 0; j < txt.length; j++) {
            const gx = sx + offs[j]!
            if (gx < 0 || gx >= COLS) continue
            const ch = txt[j]!
            const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
            setCell(gx, row, ch, cls)
            if (cw === 2) setCell(gx + 1, row, '', cls)
          }
        }
      }

      // CN translation on CN_ROW — suppressed during the fall streak.
      if (!isFall && ln.cn && ln.cnTyped > 0 && ln.st !== St.TYPE && ln.st !== St.WAIT) {
        const ct = ln.cn
        const cvw = vw(ct)
        const csx = displayCx - Math.floor(cvw / 2)
        const co = coffs(ct)
        for (let j = 0; j < ct.length; j++) {
          const gx = csx + co[j]!
          if (gx < 0 || gx >= COLS) continue
          const ch = ct[j]!
          const cw = isCJK(ch.charCodeAt(0)) ? 2 : 1
          setCell(gx, CN_ROW, ch, 'cn')
          if (cw === 2) setCell(gx + 1, CN_ROW, '', 'cn')
        }
      }
    }
  }

  // ============================================================
  //  RENDER
  // ============================================================

  for (let gy = 0; gy < ROWS; gy++) {
    if (gfade <= 0) { rowEls[gy]!.innerHTML = ''; continue }
    // Ambient noise: on during the slot phase, off once the scene
    // transitions to the quiet dialogue so the Q&A feels clean.
    const noiseOn = s < CABINET_FADE_START
    let html = ''
    for (let gx = 0; gx < COLS; gx++) {
      const c = cells[gy * COLS + gx]
      if (c) {
        if (c.ch === '') continue
        html += `<span class="${c.cls}">${esc(c.ch)}</span>`
      } else {
        if (noiseOn && H(gx * 73 + gy * 137 + fi * 13) < 0.006) {
          html += `<span class="n1">·</span>`
        } else {
          html += ' '
        }
      }
    }
    rowEls[gy]!.innerHTML = html
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
