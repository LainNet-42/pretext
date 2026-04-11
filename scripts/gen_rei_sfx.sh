#!/bin/bash
# Generate all rei SFX via ElevenLabs sound-generation API.
KEY="sk_268ba7433a98a645cb0b43fe580eecbaa86153dd0aa51548"
DEST="F:/projects/pretext/sound/sfx"
mkdir -p "$DEST"

gen() {
  local name="$1"; local dur="$2"; local infl="$3"; local prompt="$4"
  echo "[gen] $name (${dur}s)"
  curl -s -X POST "https://api.elevenlabs.io/v1/sound-generation" \
    -H "xi-api-key: $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$prompt\",\"duration_seconds\":$dur,\"prompt_influence\":$infl}" \
    --output "$DEST/$name" -w "  http=%{http_code}  bytes=%{size_download}\n"
}

gen "lever_pull.mp3"   0.8 0.6 "short mechanical slot machine lever pull cha-chunk, metallic click, no music"
gen "reel_spin.mp3"    2.5 0.6 "slot machine reel spinning whirr, rattling mechanical loop, no music"
gen "reel_stop.mp3"    0.3 0.7 "short crisp mechanical click, slot reel stopping, single thunk, no music"
gen "jackpot.mp3"      2.5 0.5 "slot machine jackpot fanfare, bright celebratory chime burst, coins, no vocals"
gen "ticket_print.mp3" 0.4 0.7 "short dot-matrix printer ratchet tick, one ticket printing, mechanical, no music"
gen "egg_crack.mp3"    0.7 0.6 "delicate eggshell cracking pop, short crisp snap, no music"
gen "egg_burst.mp3"    0.6 0.6 "eggshell shattering burst, magical pop with sparkle tail, no music"
gen "shimmer.mp3"      1.5 0.5 "magical reveal chime, sparkle shimmer sweep, fairy glow, no music"

echo "[all done]"
ls -la "$DEST"
