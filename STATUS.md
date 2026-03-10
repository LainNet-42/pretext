# Current Status

Compact current snapshot for the main browser sweep and benchmark numbers.

Use this file for "where are we right now?".
Use `RESEARCH.md` for why the numbers changed and what was tried.
Use `corpora/STATUS.md` for the long-form corpus canaries.

## Browser Accuracy

Official browser regression sweep:

| Browser | Status |
|---|---|
| Chrome | `7680/7680` |
| Safari | `7680/7680` |
| Firefox | `7680/7680` |

Notes:
- This is the 4-font × 8-size × 8-width × 30-text browser corpus.
- The public accuracy page is effectively a regression gate now, not the main steering metric.

## Benchmark Snapshot

Latest local `bun run benchmark-check` snapshot on this machine:

### Top-level batch

| Metric | Value |
|---|---|
| `prepare()` | `17.50ms` |
| `layout()` | `0.10ms` |
| DOM batch | `3.90ms` |
| DOM interleaved | `42.55ms` |

### Long-form corpus stress

| Corpus | prepare() | layout() | segments | lines @ 300px |
|---|---:|---:|---:|---:|
| Korean prose | `11.30ms` | `0.05ms` | `9,691` | `428` |
| Thai prose | `19.60ms` | `0.06ms` | `10,281` | `1,024` |
| Myanmar prose | `2.10ms` | `<0.01ms` | `797` | `81` |
| Myanmar prose (story 2) | `1.50ms` | `<0.01ms` | `498` | `54` |
| Khmer prose | `11.70ms` | `0.06ms` | `11,109` | `591` |
| Hindi prose | `14.10ms` | `0.05ms` | `9,958` | `653` |
| Arabic prose | `96.50ms` | `0.19ms` | `37,603` | `2,643` |

Notes:
- These are current Chrome-side numbers from `bun run benchmark-check`, not the older cross-browser raw snapshot in `pages/benchmark-results.txt`.
- `layout()` remains the resize hot path; `prepare()` is where script-specific cost still lives.

## Pointers

- Historical cross-browser raw benchmark snapshot: `pages/benchmark-results.txt`
- Long-form corpus canary status: `corpora/STATUS.md`
- Full exploration log: `RESEARCH.md`
