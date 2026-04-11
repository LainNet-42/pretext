#!/bin/bash
# Generate ALL Rei lines (15 slot + 4 Q&A = 19 segments) in ONE mouth call
# so timbre stays consistent, then split by silencedetect at the …… gaps.
set -e

PYEXE="C:/ProgramData/miniconda3/envs/mm/python.exe"
MOUTH="C:/Users/Administrator/.openclaw/workspace/skills/mouth"
DEST="F:/projects/pretext/sound/voice"
TMP="$DEST/_tmp2"

mkdir -p "$DEST" "$TMP"

# Order matters — this is the sequence silencedetect splits back into.
NAMES=(
  "rei_01_kite_a.wav"       # 来て pull 1
  "rei_02_neko.wav"         # 猫
  "rei_03_ryuu.wav"         # 竜
  "rei_04_fukuro_a.wav"     # 梟 phase 0
  "rei_05_chigau.wav"       # 違う
  "rei_06_kite_b.wav"       # 来て pull 2
  "rei_07_fukuro_b.wav"     # 梟 phase 1 stop 1
  "rei_08_fukuro_c.wav"     # 梟 phase 1 stop 2
  "rei_09_upa.wav"          # ウパ
  "rei_10_ato_hitotsu.wav"  # あと、一つ
  "rei_11_kite_c.wav"       # 来て pull 3
  "rei_12_fukuro_d.wav"     # 梟 phase 2 stop 1
  "rei_13_fukuro_e.wav"     # 梟 phase 2 stop 2
  "rei_14_fukuro_f.wav"     # 梟 phase 2 stop 3 (jackpot)
  "rei_15_ita.wav"          # いた
  "rei_16_dare.wav"         # 誰 (Q&A)
  "rei_17_tomodachi.wav"    # 友達
  "rei_18_zutto.wav"        # ずっと
  "rei_19_yoroshiku.wav"    # よろしく
)

TEXT="来て。……猫。……竜。……梟。……違う。……来て。……梟。……梟。……ウパ。……あと、一つ。……来て。……梟。……梟。……梟。……いた。……誰。……友達。……ずっと。……よろしく。"

echo "[gen] one-shot mouth call, ${#NAMES[@]} segments"
echo "[text] $TEXT"
( cd "$MOUTH" && "$PYEXE" speak.py --text "$TEXT" --lang Japanese 2>&1 | tail -12 )

LATEST=$(ls -t "$MOUTH"/output/*/*.wav 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "[err] no wav produced"
  exit 1
fi
echo "[src] $LATEST"
cp "$LATEST" "$TMP/full.wav"

echo "[split] silencedetect"
ffmpeg -hide_banner -nostats -i "$TMP/full.wav" -af "silencedetect=noise=-35dB:d=0.25" -f null - 2> "$TMP/silences.log"

python - "$TMP/silences.log" "$TMP/full.wav" "$DEST" "${NAMES[@]}" <<'PY'
import sys, os, re, subprocess
log_path, full_wav, dest, *names = sys.argv[1:]
text = open(log_path, encoding='utf-8', errors='ignore').read()
starts = [float(m) for m in re.findall(r'silence_start: ([\d.]+)', text)]
ends   = [float(m) for m in re.findall(r'silence_end: ([\d.]+)', text)]
pairs = list(zip(starts, ends))
dur = float(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', full_wav
]).decode().strip())
print(f"[info] full duration {dur:.2f}s, detected {len(pairs)} silence gaps")

cuts = [0.0] + [(s + e) / 2 for s, e in pairs] + [dur]
segs = []
for i in range(len(cuts) - 1):
    a, b = cuts[i], cuts[i+1]
    if b - a >= 0.15:
        segs.append((a, b))
print(f"[info] {len(segs)} candidate segments, need {len(names)}")

if len(segs) < len(names):
    print(f"[err] only found {len(segs)} segments, need {len(names)}")
    print(f"[err] silences: {pairs}")
    sys.exit(2)

if len(segs) > len(names):
    segs.sort(key=lambda p: p[1] - p[0], reverse=True)
    segs = segs[:len(names)]
    segs.sort()

for name, (a, b) in zip(names, segs):
    out = os.path.join(dest, name)
    print(f"[cut] {name}  {a:.2f}s -> {b:.2f}s  ({b-a:.2f}s)")
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', full_wav, '-ss', f'{a:.3f}', '-to', f'{b:.3f}',
        '-c:a', 'pcm_s16le', out
    ], check=True)
print("[done] all segments written")
PY

rm -rf "$TMP"
# Clean up the old v1 rei files so no stale files linger
rm -f "$DEST"/rei_mou_ichido.wav "$DEST"/rei_mada.wav "$DEST"/rei_oshii.wav "$DEST"/rei_atari.wav
rm -f "$DEST"/buddy_yatto.wav "$DEST"/buddy_yoroshiku.wav "$DEST"/buddy_issho.wav

echo "[all done]"
ls -la "$DEST" | grep rei_
