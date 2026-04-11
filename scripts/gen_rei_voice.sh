#!/bin/bash
# Generate ALL rei voice lines in ONE mouth call (so timbre stays consistent
# across segments), then split by silence into individual files.
#
# Separator between segments: …… (6 dots, per mouth skill guidance).
set -e

PYEXE="C:/ProgramData/miniconda3/envs/mm/python.exe"
MOUTH="C:/Users/Administrator/.openclaw/workspace/skills/mouth"
DEST="F:/projects/pretext/sound/voice"
TMP="F:/projects/pretext/sound/voice/_tmp"

mkdir -p "$DEST" "$TMP"

# Order matters — this is the sequence we'll split back out in.
NAMES=(
  "rei_mou_ichido.wav"
  "rei_mada.wav"
  "rei_oshii.wav"
  "rei_atari.wav"
  "buddy_yatto.wav"
  "buddy_yoroshiku.wav"
  "buddy_issho.wav"
)

TEXT="もう一度。……まだ。……惜しい。……当たり。……やっと。……よろしく。……ずっと、一緒に。"

echo "[gen] one-shot mouth call (${#NAMES[@]} segments)"
echo "[text] $TEXT"
( cd "$MOUTH" && "$PYEXE" speak.py --text "$TEXT" --lang Japanese 2>&1 | tail -12 )

LATEST=$(ls -t "$MOUTH"/output/*/*.wav 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "[err] no wav produced"
  exit 1
fi
echo "[src] $LATEST"
cp "$LATEST" "$TMP/full.wav"

# Detect silence regions (gaps between segments). Use noise=-35dB and
# minimum duration 0.25s so the long …… pauses show up but intra-word
# silence doesn't.
echo "[split] running silencedetect"
ffmpeg -hide_banner -nostats -i "$TMP/full.wav" -af "silencedetect=noise=-35dB:d=0.25" -f null - 2> "$TMP/silences.log"

# Parse silence_start / silence_end pairs, take the midpoints as cut points.
python - "$TMP/silences.log" "$TMP/full.wav" "$TMP" "${NAMES[@]}" <<'PY'
import sys, os, re, subprocess, shutil

log_path, full_wav, tmp_dir, *names = sys.argv[1:]
text = open(log_path, encoding='utf-8', errors='ignore').read()
starts = [float(m) for m in re.findall(r'silence_start: ([\d.]+)', text)]
ends   = [float(m) for m in re.findall(r'silence_end: ([\d.]+)', text)]
pairs = list(zip(starts, ends))
# Get total duration via ffprobe
dur = float(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', full_wav
]).decode().strip())
print(f"[info] full duration {dur:.2f}s")
print(f"[info] detected {len(pairs)} silence gaps: {pairs}")

# Segment boundaries: start at 0, cut at midpoint of each silence, end at dur.
cuts = [0.0]
for s, e in pairs:
    cuts.append((s + e) / 2)
cuts.append(dur)

# We want len(names) segments. Reality: may detect extra gaps (header/tail
# silence). Drop leading silence if the first gap starts near 0, and drop
# trailing silence if the last gap ends near dur.
segs = []
for i in range(len(cuts) - 1):
    a, b = cuts[i], cuts[i+1]
    if b - a >= 0.15:  # ignore tiny slivers
        segs.append((a, b))
print(f"[info] {len(segs)} candidate segments after filtering")

if len(segs) < len(names):
    print(f"[err] only found {len(segs)} segments, need {len(names)}")
    print(f"[err] silences: {pairs}")
    sys.exit(2)

# If we have more than needed, keep the LONGEST N
if len(segs) > len(names):
    segs.sort(key=lambda p: p[1] - p[0], reverse=True)
    segs = segs[:len(names)]
    segs.sort()  # back to time order

# Cut each segment via ffmpeg
for name, (a, b) in zip(names, segs):
    out = os.path.join(os.path.dirname(tmp_dir), name)
    print(f"[cut] {name}  {a:.2f}s -> {b:.2f}s  ({b-a:.2f}s)")
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', full_wav, '-ss', f'{a:.3f}', '-to', f'{b:.3f}',
        '-c:a', 'pcm_s16le', out
    ], check=True)

print("[done] all segments written")
PY

echo "[cleanup] removing tmp"
rm -rf "$TMP"

echo "[all done]"
ls -la "$DEST"
