#!/bin/bash
# Roll the Rei subtitle part (4 lines) 3 times so the user can pick the
# best-sounding take. All 4 lines in ONE mouth call per roll (timbre
# consistent). User picks a roll → we split it into individual clips.
set -e

PYEXE="C:/ProgramData/miniconda3/envs/mm/python.exe"
MOUTH="C:/Users/Administrator/.openclaw/workspace/skills/mouth"
PREV="F:/projects/pretext/sound/voice/_preview"

mkdir -p "$PREV"
rm -f "$PREV"/rei_roll*.wav

TEXT="もう一度。……まだ。……惜しい。……当たり。"

for i in 1 2 3; do
  echo ""
  echo "=========================================="
  echo "[roll $i] generating"
  echo "[text] $TEXT"
  ( cd "$MOUTH" && "$PYEXE" speak.py --text "$TEXT" --lang Japanese 2>&1 | tail -8 )
  LATEST=$(ls -t "$MOUTH"/output/*/*.wav 2>/dev/null | head -1)
  if [ -z "$LATEST" ]; then
    echo "[err] roll $i: no wav produced"
    exit 1
  fi
  cp "$LATEST" "$PREV/rei_roll$i.wav"
  echo "[done] $PREV/rei_roll$i.wav"
done

echo ""
echo "=========================================="
echo "[all done]"
ls -la "$PREV"
