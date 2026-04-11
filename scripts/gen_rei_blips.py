"""
Generate 3 buddy blip WAV files that mirror the Web Audio playBlip()
function in pages/demos/rei.ts, so the recorded video has the same
Balatro/Stardew-style placeholder voice sounds.

Each blip is a sequence of short square-wave bursts at slightly
randomized pitches. Written as mono 44.1 kHz 16-bit PCM.
"""
import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "sound", "voice")

SR = 44100
BURST_DUR = 0.08     # seconds per blip tone
STEP_DUR = 0.07      # time between the start of each tone
GAIN = 0.28

def square(freq, samples):
    out = []
    period = SR / freq
    half = period / 2
    for i in range(samples):
        phase = i % period
        out.append(GAIN if phase < half else -GAIN)
    return out

def envelope(buf, attack_ms=5, release_ms=55):
    a = int(SR * attack_ms / 1000)
    r = int(SR * release_ms / 1000)
    n = len(buf)
    for i in range(min(a, n)):
        buf[i] *= i / a
    for i in range(min(r, n)):
        k = n - 1 - i
        if k < 0:
            break
        buf[k] *= (i / r)
    return buf

def build_blip(count, base_pitch, direction, seed):
    rng = random.Random(seed)
    burst_n = int(BURST_DUR * SR)
    step_n = int(STEP_DUR * SR)
    total_n = step_n * (count - 1) + burst_n + int(0.02 * SR)
    out = [0.0] * total_n
    for i in range(count):
        if direction == "up":
            freq = base_pitch * (1 + i * 0.12)
        elif direction == "down":
            freq = base_pitch * (1 - i * 0.10)
        else:  # wobble
            freq = base_pitch * (1 + (0.12 if i % 2 == 0 else -0.08))
        freq *= 0.95 + rng.random() * 0.1
        tone = envelope(square(freq, burst_n))
        start = i * step_n
        for j, v in enumerate(tone):
            if start + j < total_n:
                out[start + j] += v
    # clip
    return [max(-0.99, min(0.99, v)) for v in out]

def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        data = b"".join(struct.pack("<h", int(v * 32767)) for v in samples)
        w.writeframes(data)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    specs = [
        ("buddy_blip_1.wav", 2, 520, "up"),
        ("buddy_blip_2.wav", 3, 480, "up"),
        ("buddy_blip_3.wav", 4, 500, "wobble"),
    ]
    for name, count, pitch, direction in specs:
        samples = build_blip(count, pitch, direction, seed=hash(name) & 0xffff)
        path = os.path.join(OUT_DIR, name)
        write_wav(path, samples)
        print(f"[gen] {path}  ({len(samples) / SR:.2f}s, {count} tones, {direction})")

if __name__ == "__main__":
    main()
