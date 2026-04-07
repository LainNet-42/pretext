"""
Stitch voice segments with silence gaps into one audio track.
Outputs: voice_stitched.wav + timeline.json
"""
import json
import os
import subprocess
import sys

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output")
SEG_DIR = os.path.join(OUT_DIR, "segments")
os.makedirs(OUT_DIR, exist_ok=True)

# (filename, text, gap_after_ms)
# Animation line 0 ("......") has no voice
# Voice segments correspond to animation lines 1-7
SEGMENTS = [
    ("seg1.wav", "雨。冷たい雨が、降っている",       200),
    ("seg2.wav", "水の中。暗くて、静かな場所",       200),
    ("seg3.wav", "何かが、動いている。小さな力",     200),
    ("seg4.wav", "痛みの先に、光がある",             200),
    ("seg5.wav", "光",                               200),
    ("seg6.wav", "光があれば、雨は止む",             200),
    ("seg7.wav", "でも、また降る。それでいい。",       0),
]

FFPROBE = "C:/ProgramData/miniconda3/envs/okc/Library/bin/ffprobe.exe"
FFMPEG = "C:/ProgramData/miniconda3/envs/okc/Library/bin/ffmpeg.exe"


def get_duration_ms(wav_path):
    cmd = [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", wav_path]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"ffprobe error on {wav_path}: {r.stderr}", file=sys.stderr)
        sys.exit(1)
    return int(float(json.loads(r.stdout)["format"]["duration"]) * 1000)


def main():
    lead_silence_ms = 1500

    concat_path = os.path.join(OUT_DIR, "concat_list.txt")
    timeline = []
    cursor_ms = lead_silence_ms
    silence_cache = {}

    def get_silence_wav(ms):
        if ms in silence_cache:
            return silence_cache[ms]
        path = os.path.join(OUT_DIR, f"silence_{ms}ms.wav")
        if not os.path.exists(path):
            subprocess.run([
                FFMPEG, "-y", "-f", "lavfi",
                "-i", "anullsrc=r=40000:cl=mono",
                "-t", str(ms / 1000),
                "-c:a", "pcm_s16le",
                path,
            ], capture_output=True)
        silence_cache[ms] = path
        return path

    lead_path = get_silence_wav(lead_silence_ms)

    with open(concat_path, "w", encoding="utf-8") as f:
        f.write(f"file '{lead_path}'\n")

        for i, (filename, text, gap_ms) in enumerate(SEGMENTS):
            wav_path = os.path.join(SEG_DIR, filename)
            if not os.path.exists(wav_path):
                print(f"Missing: {wav_path}", file=sys.stderr)
                sys.exit(1)

            dur_ms = get_duration_ms(wav_path)
            timeline.append({
                "index": i,
                "file": filename,
                "text": text,
                "start_ms": cursor_ms,
                "end_ms": cursor_ms + dur_ms,
                "duration_ms": dur_ms,
                "gap_after_ms": gap_ms,
            })

            f.write(f"file '{wav_path}'\n")
            cursor_ms += dur_ms

            if gap_ms > 0:
                sil = get_silence_wav(gap_ms)
                f.write(f"file '{sil}'\n")
                cursor_ms += gap_ms

    total_ms = cursor_ms
    print(f"Total duration: {total_ms}ms ({total_ms/1000:.1f}s)")
    print(f"Segments: {len(SEGMENTS)}")
    for seg in timeline:
        print(f"  [{seg['index']}] {seg['start_ms']:>6}ms - {seg['end_ms']:>6}ms  {seg['text']}")

    output_wav = os.path.join(OUT_DIR, "voice_stitched.wav")
    cmd = [
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", concat_path,
        "-c:a", "pcm_s16le",
        "-ar", "40000",
        output_wav,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"ffmpeg concat error: {r.stderr}", file=sys.stderr)
        sys.exit(1)

    timeline_path = os.path.join(OUT_DIR, "timeline.json")
    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump({"total_ms": total_ms, "segments": timeline}, f, indent=2, ensure_ascii=False)

    print(f"Output: {output_wav}")
    print(f"Timeline: {timeline_path}")

    os.remove(concat_path)
    for p in silence_cache.values():
        if os.path.exists(p):
            os.remove(p)


if __name__ == "__main__":
    main()
