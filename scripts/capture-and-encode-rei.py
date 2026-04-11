"""
Capture the rei slot demo via Puppeteer and encode with the full audio
stack (BGM + all SFX + Rei voice + buddy blips) placed at exact cue
times. Produces final/rei_slot.mp4 at the highest quality settings.

Usage:
  python scripts/capture-and-encode-rei.py [--skip-capture]

Requires:
  - `bun serve.ts` running on :3000
  - node + puppeteer
  - ffmpeg
  - sound/bgm.mp3, sound/sfx/*.mp3, sound/voice/rei_*.wav, sound/voice/buddy_blip_*.wav
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(ROOT, "output")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "rei_frames")
FINAL_DIR = os.path.join(OUTPUT_DIR, "final")
SOUND = os.path.join(ROOT, "sound")

FPS = 60
PAGE_URL = "http://127.0.0.1:3000/demos/rei"
WIDTH = 540
HEIGHT = 960
DPR = 4                    # 2160x3840 render
TOTAL_S = 49.0             # TOTAL in rei.ts (keep in sync)

# Audio cue table — must mirror AUDIO_CUES in pages/demos/rei.ts
# (seconds, audio file path). Buddy blips map to three generated WAVs.
def p(rel):
    return os.path.join(SOUND, rel)

REI_VOICE = [
    p("voice/rei_01_kite_a.wav"),
    p("voice/rei_02_neko.wav"),
    p("voice/rei_03_ryuu.wav"),
    p("voice/rei_04_fukuro_a.wav"),
    p("voice/rei_05_chigau.wav"),
    p("voice/rei_06_kite_b.wav"),
    p("voice/rei_07_fukuro_b.wav"),
    p("voice/rei_08_fukuro_c.wav"),
    p("voice/rei_09_upa.wav"),
    p("voice/rei_10_ato_hitotsu.wav"),
    p("voice/rei_11_kite_c.wav"),
    p("voice/rei_12_fukuro_d.wav"),
    p("voice/rei_13_fukuro_e.wav"),
    p("voice/rei_14_fukuro_f.wav"),
    p("voice/rei_15_ita.wav"),
    p("voice/rei_16_dare.wav"),
    p("voice/rei_17_tomodachi.wav"),
    p("voice/rei_18_zutto.wav"),
    p("voice/rei_19_yoroshiku.wav"),
]

SFX = {
    "lever_pull": p("sfx/lever_pull.mp3"),
    "reel_spin":  p("sfx/reel_spin.mp3"),
    "reel_stop":  p("sfx/reel_stop.mp3"),
    "jackpot":    p("sfx/jackpot.mp3"),
    "ticket":     p("sfx/ticket_print.mp3"),
    "crack":      p("sfx/egg_crack.mp3"),
    "burst":      p("sfx/egg_burst.mp3"),
    "shimmer":    p("sfx/shimmer.mp3"),
}
BLIP = [p(f"voice/buddy_blip_{i}.wav") for i in (1, 2, 3)]
BGM = p("bgm.mp3")

# (time_seconds, file_path, volume)
# Voice boosted (>1 is OK via ffmpeg `volume` filter), SFX + BGM cut.
VOX = 1.45
CUES = [
    # Rei voice — slot phase
    (0.9,  REI_VOICE[0],  VOX),
    (4.0,  REI_VOICE[1],  VOX),
    (4.9,  REI_VOICE[2],  VOX),
    (5.8,  REI_VOICE[3],  VOX),
    (6.5,  REI_VOICE[4],  VOX),
    (7.5,  REI_VOICE[5],  VOX),
    (10.7, REI_VOICE[6],  VOX),
    (11.6, REI_VOICE[7],  VOX),
    (12.5, REI_VOICE[8],  VOX),
    (13.2, REI_VOICE[9],  VOX),
    (14.3, REI_VOICE[10], VOX),
    (17.0, REI_VOICE[11], VOX),
    (17.9, REI_VOICE[12], VOX),
    (18.8, REI_VOICE[13], VOX),
    (22.3, REI_VOICE[14], VOX),
    # Lever / spin / stop — all pushed down
    (2.6,  SFX["lever_pull"], 0.30),
    (9.3,  SFX["lever_pull"], 0.30),
    (16.2, SFX["lever_pull"], 0.30),
    (2.7,  SFX["reel_spin"],  0.15),
    (9.4,  SFX["reel_spin"],  0.15),
    (16.3, SFX["reel_spin"],  0.15),
    (4.0,  SFX["reel_stop"],  0.20),
    (4.9,  SFX["reel_stop"],  0.20),
    (5.8,  SFX["reel_stop"],  0.20),
    (10.7, SFX["reel_stop"],  0.20),
    (11.6, SFX["reel_stop"],  0.20),
    (12.5, SFX["reel_stop"],  0.20),
    (17.0, SFX["reel_stop"],  0.20),
    (17.9, SFX["reel_stop"],  0.20),
    (18.8, SFX["reel_stop"],  0.20),
    # Jackpot chime
    (18.9, SFX["jackpot"],    0.24),
    # Ticket printer
    (20.2, SFX["ticket"],     0.16),
    (20.7, SFX["ticket"],     0.16),
    (21.2, SFX["ticket"],     0.16),
    (21.8, SFX["ticket"],     0.16),
    (22.2, SFX["ticket"],     0.16),
    (22.6, SFX["ticket"],     0.16),
    # Egg crack + burst + shimmer
    (26.5, SFX["crack"],      0.22),
    (27.3, SFX["burst"],      0.26),
    (27.6, SFX["shimmer"],    0.28),
    # Q&A — Rei voice
    (27.8, REI_VOICE[15], VOX),
    (31.4, REI_VOICE[16], VOX),
    (35.0, REI_VOICE[17], VOX),
    (38.6, REI_VOICE[18], VOX),
    # Buddy blips
    (29.8, BLIP[0], 0.50),
    (33.4, BLIP[1], 0.50),
    (37.0, BLIP[2], 0.50),
]


def capture_frames():
    os.makedirs(FRAMES_DIR, exist_ok=True)
    total_frames = int(TOTAL_S * FPS) + FPS
    frame_interval_ms = 1000 / FPS
    capture_js = os.path.join(OUTPUT_DIR, "_capture_rei.cjs")
    frames_dir_fwd = FRAMES_DIR.replace(chr(92), "/")
    with open(capture_js, "w", encoding="utf-8") as f:
        f.write(f"""
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {{
  const browser = await puppeteer.launch({{
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required'],
  }});
  const page = await browser.newPage();
  await page.setViewport({{ width: {WIDTH}, height: {HEIGHT}, deviceScaleFactor: {DPR} }});
  await page.goto('{PAGE_URL}', {{ waitUntil: 'networkidle0', timeout: 30000 }});
  await new Promise(r => setTimeout(r, 500));

  // Hide the start overlay and force-unmute cue firing so the demo
  // renders the same way it would after the user clicks play.
  await page.evaluate(() => {{
    const o = document.getElementById('start');
    if (o) o.style.display = 'none';
  }});

  // Drive requestAnimationFrame ourselves so the timeline is
  // deterministic (not wall-clock).
  await page.evaluate(() => {{
    window.__captureTime = 0;
    window.__rafCallbacks = [];
    window.requestAnimationFrame = (cb) => {{
      window.__rafCallbacks.push(cb);
      return 0;
    }};
  }});

  const totalFrames = {total_frames};
  const intervalMs = {frame_interval_ms};

  for (let i = 0; i < totalFrames; i++) {{
    const timeMs = i * intervalMs;
    await page.evaluate((t) => {{
      window.__captureTime = t;
      const cbs = window.__rafCallbacks.splice(0);
      for (const cb of cbs) cb(t);
    }}, timeMs);
    await new Promise(r => setTimeout(r, 15));
    const padded = String(i).padStart(5, '0');
    await page.screenshot({{
      path: path.join('{frames_dir_fwd}', 'frame_' + padded + '.png'),
      type: 'png',
    }});
    if (i % 60 === 0) console.log('frame ' + i + '/' + totalFrames + ' (' + (timeMs / 1000).toFixed(1) + 's)');
  }}

  await browser.close();
  console.log('done: ' + totalFrames + ' frames');
}})();
""")
    print(f"[capture] {total_frames} frames @ {FPS}fps ({TOTAL_S}s, {WIDTH*DPR}x{HEIGHT*DPR})")
    subprocess.run(["node", "--max-old-space-size=4096", capture_js], cwd=ROOT, timeout=1800, check=True)
    os.remove(capture_js)


def build_audio_mix():
    """Build the filter_complex string for ffmpeg to place every cue at its
    time via adelay and mix them all with the BGM."""
    inputs = []  # list of ffmpeg -i args
    filters = []
    labels = []

    # Input 0 is reserved for the image sequence (handled by caller)
    # Input 1 is BGM.
    inputs.append(BGM)
    # Trim BGM to video duration, apply volume
    filters.append(f"[1:a]atrim=0:{TOTAL_S},volume=0.12[bgm]")
    labels.append("[bgm]")

    for idx, (t, src, vol) in enumerate(CUES):
        if not os.path.exists(src):
            print(f"[warn] missing {src}, skipping cue at {t}")
            continue
        inputs.append(src)
        in_idx = idx + 2  # +2 because 0=video, 1=bgm, then each cue
        delay_ms = int(t * 1000)
        label = f"[c{idx}]"
        filters.append(
            f"[{in_idx}:a]adelay={delay_ms}|{delay_ms},volume={vol}{label}"
        )
        labels.append(label)

    merge = "".join(labels) + f"amix=inputs={len(labels)}:duration=longest:dropout_transition=0:normalize=0[aout]"
    filters.append(merge)
    return inputs, ";".join(filters)


def encode():
    os.makedirs(FINAL_DIR, exist_ok=True)
    out_path = os.path.join(FINAL_DIR, "rei_slot.mp4")
    frame_pattern = os.path.join(FRAMES_DIR, "frame_%05d.png")

    audio_inputs, filter_complex = build_audio_mix()

    cmd = ["ffmpeg", "-y",
           "-framerate", str(FPS),
           "-i", frame_pattern]
    for a in audio_inputs:
        cmd += ["-i", a]
    cmd += [
        "-filter_complex", filter_complex,
        "-map", "0:v", "-map", "[aout]",
        # Original settings (CRF 14 + tune animation) read better on
        # ASCII content than the "sharper" stillimage/low-deblock
        # variant, which added ringing around glyph edges. Keep the
        # flat-color-optimised tune, just drop the conflicting -b:v
        # ceiling and add +faststart for streaming.
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "14",
        "-tune", "animation",
        "-pix_fmt", "yuv420p",
        "-profile:v", "high", "-level", "5.1",
        "-c:a", "aac", "-b:a", "320k",
        "-movflags", "+faststart",
        "-t", str(TOTAL_S),
        out_path,
    ]
    print(f"[encode] -> {out_path}")
    r = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"[err] ffmpeg:\n{r.stderr[-1500:]}", file=sys.stderr)
        sys.exit(1)
    print(f"[done] {out_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-capture", action="store_true")
    args = parser.parse_args()

    if not args.skip_capture:
        if os.path.exists(FRAMES_DIR):
            shutil.rmtree(FRAMES_DIR)
        capture_frames()
    encode()


if __name__ == "__main__":
    main()
