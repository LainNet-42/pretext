"""
Stitch voice segments with silence gaps into one audio track.
Outputs: voice_stitched.wav + timeline.json (exact timestamps for animation sync)
"""
import json
import os
import subprocess
import sys

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output")
os.makedirs(OUT_DIR, exist_ok=True)

WAV_DIR = "C:/Users/Administrator/.openclaw/workspace/skills/mouth/output/2026-04-08"

# (filename, gap_after_ms)
SEGMENTS = [
    ("013701.wav", 200),    # 1  雨。
    ("013730.wav", 200),    # 2  いつから,降っていたのだろう。
    ("013756.wav", 200),    # 3  気づいた時には……もう,濡れていた。
    ("013824.wav", 200),    # 4  冷たくて……静かで……でも確かに,そこにあった。
    ("013856.wav", 200),    # 5  一粒の滴が,土に落ちる。
    ("013915.wav", 200),    # 6  音もなく……染み込んでいく。
    ("013943.wav", 200),    # 7  その先に何があるのか……雨は,知らない。
    ("014005.wav", 200),    # 8  でも,やがて,何かが芽を出す。
    ("014041.wav", 200),    # 9  名前もない。小さなもの。
    ("014059.wav", 200),    # 10 光に向かって……ただ,伸びていく。
    ("014129.wav", 200),    # 11 時間が経つ。
    ("014145.wav", 200),    # 12 幹が太くなる。枝が広がる。
    ("014204.wav", 200),    # 13 風が吹いて……葉が,揺れる。
    ("014237.wav", 200),    # 14 いつの間にか,実がなっていた。
    ("014255.wav", 200),    # 15 赤くて……丸くて……重たい。
    ("014315.wav", 200),    # 16 自分の一部なのに……自分じゃないもの。
    ("014345.wav", 200),    # 17 雨はまだ,降っている。
    ("014402.wav", 200),    # 18 同じ雨なのか,違う雨なのか……もう,分からない。
    ("014438.wav", 200),    # 19 ただ,こうして立っている。根を張って,空を見て。
    ("014500.wav", 200),    # 20 それだけのことが……こんなにも,長い。
    ("014530.wav", 200),    # 21 時間は,どこへ行くのだろう。
    ("014549.wav", 200),    # 22 この枝の間を抜けて……葉の先から,滴り落ちて……また,土に還るのだろうか。
    ("014623.wav", 200),    # 23 何も掴めないまま。でも,何かが残っている。
    ("014643.wav", 200),    # 24 この幹の中に。この根の中に。
    ("014712.wav", 200),    # 25 雨が,止んだ。
    ("014729.wav", 2000),   # 26 空が……明るい。(tail)
]

FFPROBE = "ffprobe"
FFMPEG = "ffmpeg"


def get_duration_ms(wav_path):
    cmd = [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", wav_path]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"ffprobe error on {wav_path}: {r.stderr}", file=sys.stderr)
        sys.exit(1)
    return int(float(json.loads(r.stdout)["format"]["duration"]) * 1000)


def main():
    # 1s silence at the start
    lead_silence_ms = 1000

    # build concat list file and timeline
    concat_path = os.path.join(OUT_DIR, "concat_list.txt")
    timeline = []
    cursor_ms = lead_silence_ms  # start after lead silence

    # generate silence wavs we'll need
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

    # lead silence
    lead_path = get_silence_wav(lead_silence_ms)

    with open(concat_path, "w", encoding="utf-8") as f:
        f.write(f"file '{lead_path}'\n")

        for i, (filename, gap_ms) in enumerate(SEGMENTS):
            wav_path = os.path.join(WAV_DIR, filename)
            if not os.path.exists(wav_path):
                print(f"Missing: {wav_path}", file=sys.stderr)
                sys.exit(1)

            dur_ms = get_duration_ms(wav_path)
            timeline.append({
                "index": i,
                "file": filename,
                "start_ms": cursor_ms,
                "end_ms": cursor_ms + dur_ms,
                "duration_ms": dur_ms,
                "gap_after_ms": gap_ms,
            })

            f.write(f"file '{wav_path}'\n")
            cursor_ms += dur_ms

            # silence gap
            if gap_ms > 0:
                sil = get_silence_wav(gap_ms)
                f.write(f"file '{sil}'\n")
                cursor_ms += gap_ms

    total_ms = cursor_ms
    print(f"Total duration: {total_ms}ms ({total_ms/1000:.1f}s)")
    print(f"Segments: {len(SEGMENTS)}")

    # concat
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

    # save timeline
    timeline_path = os.path.join(OUT_DIR, "timeline.json")
    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump({"total_ms": total_ms, "segments": timeline}, f, indent=2, ensure_ascii=False)

    print(f"Output: {output_wav}")
    print(f"Timeline: {timeline_path}")

    # cleanup
    os.remove(concat_path)
    for p in silence_cache.values():
        if os.path.exists(p):
            os.remove(p)


if __name__ == "__main__":
    main()
