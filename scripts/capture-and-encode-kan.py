"""
Capture KAN 環 demo frames via puppeteer, then encode with voice + optional BGM.

Usage:
  python scripts/capture-and-encode-kan.py [--bgm path/to/bgm.mp3] [--bgm-vol 0.25]
  python scripts/capture-and-encode-kan.py --skip-capture

Requires:
  - bun serve.ts running on port 3000
  - node + puppeteer
  - ffmpeg
  - sound/voice/kan/rei_kan.wav (adelayed by 1.5s already)
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES_DIR = os.path.join(ROOT, "output", "kan_frames")
FINAL_DIR = os.path.join(ROOT, "output", "final")
VOICE_PATH = os.path.join(ROOT, "sound", "voice", "kan", "rei_kan.wav")

FPS = 60
PAGE_URL = "http://127.0.0.1:3000/demos/kan"
WIDTH = 540
HEIGHT = 960
DPR = 2  # 1080x1920 source — native 1080p, ~4x faster than DPR=4
TOTAL_SECONDS = 17.3  # 1.5 lead + 14.8 voice + 1.0 tail
TOTAL_MS = int(TOTAL_SECONDS * 1000)


def capture_frames():
    os.makedirs(FRAMES_DIR, exist_ok=True)
    total_frames = int(TOTAL_SECONDS * FPS)
    frame_interval_ms = 1000 / FPS

    capture_js = os.path.join(ROOT, "output", "_kan_capture.cjs")
    os.makedirs(os.path.dirname(capture_js), exist_ok=True)
    frames_dir_js = FRAMES_DIR.replace(chr(92), "/")

    with open(capture_js, "w", encoding="utf-8") as f:
        f.write(f"""
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {{
  const browser = await puppeteer.launch({{
    headless: true,
    args: ['--no-sandbox','--disable-gpu','--font-render-hinting=none','--autoplay-policy=no-user-gesture-required'],
  }});
  const page = await browser.newPage();
  await page.setViewport({{ width: {WIDTH}, height: {HEIGHT}, deviceScaleFactor: {DPR} }});
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => {{ if (m.type() === 'error') console.error('console.error:', m.text()); }});

  await page.goto('{PAGE_URL}', {{ waitUntil: 'networkidle0', timeout: 30000 }});
  await new Promise(r => setTimeout(r, 400));

  // Pause the realtime loop; we'll drive drawAt(t) per frame.
  await page.evaluate(() => {{ window.__kan && window.__kan.pause(); }});

  const totalFrames = {total_frames};
  const intervalMs = {frame_interval_ms};

  for (let i = 0; i < totalFrames; i++) {{
    const sec = (i * intervalMs) / 1000;
    await page.evaluate(t => {{ window.__kan.drawAt(t); }}, sec);
    const padded = String(i).padStart(5, '0');
    await page.screenshot({{
      path: path.join('{frames_dir_js}', 'f_' + padded + '.jpg'),
      type: 'jpeg',
      quality: 92,
    }});
    if (i % 30 === 0) console.log('frame', i + '/' + totalFrames, '(' + sec.toFixed(2) + 's)');
  }}

  await browser.close();
  console.log('captured', totalFrames, 'frames');
}})();
""")

    print(f"Capturing {total_frames} frames @ {FPS}fps ({TOTAL_SECONDS:.1f}s)...")
    r = subprocess.run(["node", "--max-old-space-size=4096", capture_js], cwd=ROOT, timeout=1800)
    if r.returncode != 0:
        print("puppeteer capture failed", file=sys.stderr)
        sys.exit(1)
    os.remove(capture_js)


def detect_bgm_start(bgm_path):
    cmd = ["ffmpeg", "-i", bgm_path, "-af", "silencedetect=noise=-35dB:d=0.3", "-f", "null", "-"]
    r = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace")
    first_start = None
    first_end = None
    for line in r.stderr.splitlines():
        if "silence_start:" in line and first_start is None:
            first_start = float(line.split("silence_start:")[1].strip().split()[0])
        if "silence_end:" in line and first_end is None:
            first_end = float(line.split("silence_end:")[1].split("|")[0].strip())
            break
    if first_start is not None and first_start < 0.5 and first_end and first_end > 0.1:
        return first_end
    return 0.0


def encode(bgm_path=None, bgm_vol=0.25):
    os.makedirs(FINAL_DIR, exist_ok=True)
    output_path = os.path.join(FINAL_DIR, "kan.mp4")
    frame_pattern = os.path.join(FRAMES_DIR, "f_%05d.jpg")

    if bgm_path:
        bgm_start = detect_bgm_start(bgm_path)
        print(f"BGM: {bgm_path} (vol={bgm_vol}, skip={bgm_start:.2f}s)")
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", frame_pattern,
            "-i", VOICE_PATH,
            "-ss", str(bgm_start), "-i", bgm_path,
            "-filter_complex",
            f"[1:a]apad[voice_padded];"
            f"[voice_padded]volume=1.0[voice];[2:a]volume={bgm_vol}[bgm];"
            f"[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
            "-tune", "animation",
            "-b:v", "45M", "-maxrate", "55M", "-bufsize", "110M",
            "-profile:v", "high", "-level", "5.1",
            "-c:a", "aac", "-b:a", "320k",
            "-t", str(TOTAL_SECONDS),
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
            "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
            "-tune", "animation",
            "-b:v", "45M", "-maxrate", "55M", "-bufsize", "110M",
            "-profile:v", "high", "-level", "5.1",
            "-c:a", "aac", "-b:a", "320k",
            "-t", str(TOTAL_SECONDS),
            output_path,
        ]

    print(f"encoding -> {output_path}")
    r = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print("ffmpeg error:\n" + r.stderr[-1200:], file=sys.stderr)
        sys.exit(1)
    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"done: {output_path} ({TOTAL_SECONDS:.1f}s, {size_mb:.1f} MB)")
    return output_path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bgm", default="", help="BGM file path")
    p.add_argument("--bgm-vol", type=float, default=0.25)
    p.add_argument("--skip-capture", action="store_true")
    a = p.parse_args()

    if not a.skip_capture:
        if os.path.exists(FRAMES_DIR):
            shutil.rmtree(FRAMES_DIR)
        capture_frames()

    encode(bgm_path=a.bgm or None, bgm_vol=a.bgm_vol)


if __name__ == "__main__":
    main()
