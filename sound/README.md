# rei.ts audio cue sheet

The demo at `pages/demos/rei.html` is wired for sound. Click the "click for
sound" overlay on the page to unlock audio and restart the timeline at s=0.

Files are loaded from `/sound/...` paths via the dev server. Any missing
file is silently ignored so the demo still plays visually.

## Required files

### BGM
- `sound/bgm.mp3` — looping background music.
  Source candidate: `Balatro OST got me like_.mp3` (copy or symlink to this
  path). Volume 0.32.

### SFX (one-shot, all ≤ 3s)
| file | volume | length hint | trigger |
| --- | --- | --- | --- |
| `sfx/lever_pull.mp3`   | 0.75 | ~0.4s   | cha-chunk, slot lever pull  |
| `sfx/reel_spin.mp3`    | 0.50 | ~2.5s   | rattling whirr (one-shot per spin) |
| `sfx/reel_stop.mp3`    | 0.65 | ~0.2s   | short click/ding when a reel locks |
| `sfx/jackpot.mp3`      | 0.90 | ~2.5s   | dramatic fanfare burst |
| `sfx/ticket_print.mp3` | 0.55 | ~0.3s   | ratchety dot-matrix printer tick |
| `sfx/egg_crack.mp3`    | 0.70 | ~0.6s   | eggshell cracking pop |
| `sfx/egg_burst.mp3`    | 0.90 | ~0.5s   | shell shattering |
| `sfx/shimmer.mp3`      | 0.70 | ~1.2s   | magical reveal chime |

Generate via ElevenLabs Sound Effects (skill: `elevenlabs/skills`, API key
lives in `sound/11labs/know.md`).

### Voice (Rei + buddy)
Generated via the `mouth` skill
(`C:/Users/Administrator/.openclaw/workspace/skills/mouth/speak.py`,
`--lang Japanese`). One short file per unique line.

| file | text | cue |
| --- | --- | --- |
| `voice/rei_mou_ichido.wav` | もう一度。              | 0.9, 7.4, 13.9 |
| `voice/rei_mada.wav`       | まだ。                   | 5.5  |
| `voice/rei_oshii.wav`      | 惜しい。                 | 12.0 |
| `voice/rei_atari.wav`      | 当たり。                 | 20.0 |
| `voice/buddy_yatto.wav`    | やっと。                 | 26.8 |
| `voice/buddy_yoroshiku.wav`| よろしく。               | 29.8 |
| `voice/buddy_issho.wav`    | ずっと、一緒に。         | 32.8 |

GT-style short-form — use `。` sentence end, no ている/ていた. Each file ~1s
target. Re-roll if the sample sounds off.

## Full timeline reference

```
 0.0 →  1.8   "......"  +  「もう一度」 type 1  (voice: rei_mou_ichido @0.9)
 1.8 →  2.6   text falls → force streak → lever impact
 2.6          lever_pull
 2.7          reel_spin
 4.2 4.7 5.2  reel_stop ×3  (pull 1 miss)
 5.5          まだ                    (voice: rei_mada)
 7.4          もう一度                (voice: rei_mou_ichido)
 9.1          lever_pull
 9.2          reel_spin
10.7 11.2 11.8 reel_stop ×3            (pull 2 close)
12.0          惜しい                  (voice: rei_oshii)
13.9          もう一度                (voice: rei_mou_ichido)
15.6          lever_pull
15.7          reel_spin
17.4 18.0 18.8 reel_stop ×3            (pull 3 JACKPOT)
18.9          jackpot
19.5-21.9     ticket_print × 6
20.0          当たり                  (voice: rei_atari)
22.2-24.2     cabinet curtain-fade, ticket → egg morph, drift to center
24.2-25.5     egg wobbles
25.5          egg_crack
26.3          egg_burst
26.6          shimmer  (buddy reveal)
26.8          やっと。                (voice: buddy_yatto)
29.8          よろしく。              (voice: buddy_yoroshiku)
32.8          ずっと、一緒に。        (voice: buddy_issho)
38.5-41.5     fade out
41.5          loop back to 0.0
```

## Workflow

1. Use `elevenlabs/skills` to generate the 8 SFX files into `sound/sfx/`.
2. Use `mouth` skill to generate the 7 voice files into `sound/voice/`.
3. Drop or symlink the Balatro track as `sound/bgm.mp3`.
4. Reload `http://127.0.0.1:3000/pages/demos/rei.html` and click the
   overlay — the timeline restarts at 0 and audio fires at the cue points.
