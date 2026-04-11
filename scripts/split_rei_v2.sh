#!/bin/bash
# Re-split the existing full.wav with a looser silencedetect threshold.
set -e

TMP="F:/projects/pretext/sound/voice/_tmp2"
DEST="F:/projects/pretext/sound/voice"

if [ ! -f "$TMP/full.wav" ]; then
  echo "[err] no $TMP/full.wav — run gen_rei_voice_v2.sh first"
  exit 1
fi

NAMES=(
  "rei_01_kite_a.wav"
  "rei_02_neko.wav"
  "rei_03_ryuu.wav"
  "rei_04_fukuro_a.wav"
  "rei_05_chigau.wav"
  "rei_06_kite_b.wav"
  "rei_07_fukuro_b.wav"
  "rei_08_fukuro_c.wav"
  "rei_09_upa.wav"
  "rei_10_ato_hitotsu.wav"
  "rei_11_kite_c.wav"
  "rei_12_fukuro_d.wav"
  "rei_13_fukuro_e.wav"
  "rei_14_fukuro_f.wav"
  "rei_15_ita.wav"
  "rei_16_dare.wav"
  "rei_17_tomodachi.wav"
  "rei_18_zutto.wav"
  "rei_19_yoroshiku.wav"
)

# Try progressively looser thresholds
for thresh in "-30dB:d=0.15" "-25dB:d=0.12" "-22dB:d=0.10"; do
  echo "[try] silencedetect=noise=$thresh"
  ffmpeg -hide_banner -nostats -i "$TMP/full.wav" -af "silencedetect=noise=$thresh" -f null - 2> "$TMP/silences.log"
  GAPS=$(grep -c "silence_end" "$TMP/silences.log" || true)
  echo "  → $GAPS gaps"
  if [ "$GAPS" -ge 18 ]; then
    echo "[ok] enough gaps to split 19 segments"
    break
  fi
done

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
print(f"[info] full duration {dur:.2f}s, {len(pairs)} silence gaps")

cuts = [0.0] + [(s + e) / 2 for s, e in pairs] + [dur]
segs = []
for i in range(len(cuts) - 1):
    a, b = cuts[i], cuts[i+1]
    if b - a >= 0.10:
        segs.append((a, b))
print(f"[info] {len(segs)} candidate segments, need {len(names)}")

if len(segs) < len(names):
    print(f"[err] only found {len(segs)} segments, need {len(names)}")
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
print("[done]")
PY

rm -f "$DEST"/rei_mou_ichido.wav "$DEST"/rei_mada.wav "$DEST"/rei_oshii.wav "$DEST"/rei_atari.wav
rm -f "$DEST"/buddy_yatto.wav "$DEST"/buddy_yoroshiku.wav "$DEST"/buddy_issho.wav

ls -la "$DEST" | grep rei_
