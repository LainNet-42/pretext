"""
Capture frames from the ASCII Growth demo page via Puppeteer, then encode with voice + BGM.

Usage:
  python scripts/capture-and-encode.py [--bgm path/to/bgm.mp3] [--bgm-vol 0.3]

Requires:
  - bun serve.ts running on port 3000
  - node + puppeteer installed
  - ffmpeg
"""
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(ROOT, "output")
TIMELINE_PATH = os.path.join(OUTPUT_DIR, "timeline.json")
VOICE_PATH = os.path.join(OUTPUT_DIR, "voice_stitched.wav")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
FINAL_DIR = os.path.join(OUTPUT_DIR, "final")

FPS = 60
PAGE_URL = "http://127.0.0.1:3000/demos/lotus-fall"
WIDTH = 540
HEIGHT = 960
DPR = 2  # deviceScaleFactor: renders at 1080x1920


def load_timeline():
    with open(TIMELINE_PATH, encoding="utf-8") as f:
        return json.load(f)


def capture_frames(total_ms):
    """Use puppeteer to screenshot every frame."""
    os.makedirs(FRAMES_DIR, exist_ok=True)

    total_frames = int(total_ms / 1000 * FPS) + FPS  # extra second at end
    frame_interval_ms = 1000 / FPS

    # write a small node script for puppeteer capture
    capture_js = os.path.join(OUTPUT_DIR, "_capture.cjs")
    with open(capture_js, "w", encoding="utf-8") as f:
        f.write(f"""
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {{
  const browser = await puppeteer.launch({{
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
  }});
  const page = await browser.newPage();
  await page.setViewport({{ width: {WIDTH}, height: {HEIGHT}, deviceScaleFactor: {DPR} }});
  await page.goto('{PAGE_URL}', {{ waitUntil: 'networkidle0', timeout: 30000 }});

  // Wait for animation to initialize
  await new Promise(r => setTimeout(r, 500));

  // Override requestAnimationFrame to control time
  await page.evaluate(() => {{
    window.__captureTime = 0;
    window.__originalRAF = window.requestAnimationFrame;
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

    // Advance time and call all queued RAF callbacks
    await page.evaluate((t) => {{
      window.__captureTime = t;
      const cbs = window.__rafCallbacks.splice(0);
      for (const cb of cbs) cb(t);
    }}, timeMs);

    // Small delay to let DOM update
    await new Promise(r => setTimeout(r, 20));

    const padded = String(i).padStart(5, '0');
    await page.screenshot({{
      path: path.join('{FRAMES_DIR.replace(chr(92), "/")}', 'frame_' + padded + '.png'),
      type: 'png',
    }});

    if (i % 50 === 0) console.log('Frame ' + i + '/' + totalFrames + ' (' + (timeMs / 1000).toFixed(1) + 's)');
  }}

  await browser.close();
  console.log('Done: ' + totalFrames + ' frames captured');
}})();
""")

    print(f"Capturing {total_frames} frames @ {FPS}fps ({total_ms / 1000:.1f}s)...")
    result = subprocess.run(["node", "--max-old-space-size=4096", capture_js], cwd=ROOT, timeout=600)
    if result.returncode != 0:
        print("Puppeteer capture failed", file=sys.stderr)
        sys.exit(1)

    os.remove(capture_js)


def detect_bgm_start(bgm_path):
    cmd = [
        "ffmpeg", "-i", bgm_path,
        "-af", "silencedetect=noise=-35dB:d=0.3",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace")
    first_start = None
    first_end = None
    for line in result.stderr.splitlines():
        if "silence_start:" in line and first_start is None:
            first_start = float(line.split("silence_start:")[1].strip().split()[0])
        if "silence_end:" in line and first_end is None:
            first_end = float(line.split("silence_end:")[1].split("|")[0].strip())
            break
    if first_start is not None and first_start < 0.5 and first_end and first_end > 0.1:
        return first_end
    return 0.0


def encode(total_ms, bgm_path=None, bgm_vol=0.3):
    os.makedirs(FINAL_DIR, exist_ok=True)
    output_path = os.path.join(FINAL_DIR, "ascii_growth.mp4")
    frame_pattern = os.path.join(FRAMES_DIR, "frame_%05d.png")
    duration = total_ms / 1000

    if bgm_path:
        bgm_start = detect_bgm_start(bgm_path)
        print(f"BGM: {bgm_path} (vol={bgm_vol}, start={bgm_start:.2f}s)")
        # Pad voice to full duration with silence so closing animation has audio too
        # duration=longest mixes across the full video length (bgm continues after voice ends)
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", frame_pattern,
            "-i", VOICE_PATH,
            "-ss", str(bgm_start),
            "-i", bgm_path,
            "-filter_complex",
            f"[1:a]apad[voice_padded];"  # pad voice with silence to match longest
            f"[voice_padded]volume=1.0[voice];[2:a]volume={bgm_vol}[bgm];"
            f"[voice][bgm]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0[aout]",
            "-map", "0:v", "-map", "[aout]",

            "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-t", str(duration),
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", frame_pattern,
            "-i", VOICE_PATH,
            "-filter_complex", "[1:a]apad[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-t", str(duration),
            output_path,
        ]

    print(f"Encoding -> {output_path}")
    result = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(f"ffmpeg error:\n{result.stderr[-500:]}", file=sys.stderr)
        sys.exit(1)

    print(f"Done! {output_path} ({duration:.1f}s)")
    return output_path


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--bgm", default="", help="BGM file path")
    parser.add_argument("--bgm-vol", type=float, default=0.3, help="BGM volume")
    parser.add_argument("--skip-capture", action="store_true", help="Skip frame capture, use existing frames")
    args = parser.parse_args()

    tl = load_timeline()
    # voice 16.3s + 2s buffer + 2.5s shutdown + 1.5s black = ~22.3s
    total_ms = 22300

    if not args.skip_capture:
        if os.path.exists(FRAMES_DIR):
            shutil.rmtree(FRAMES_DIR)
        capture_frames(total_ms)

    encode(total_ms, bgm_path=args.bgm or None, bgm_vol=args.bgm_vol)

    # cleanup frames
    # shutil.rmtree(FRAMES_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
