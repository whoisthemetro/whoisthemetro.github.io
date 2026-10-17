# builds peaks/NN.bin — the waveform the player draws. one byte per 1/50 s.
# 0.4*peak + 0.6*rms, normalized per track, gamma 0.72: a raw peak envelope of a
# mastered song is a rectangle (the limiter's shape, not the music's).
# usage: python3 tools/song-ideas/peaks.py "/Volumes/Metro/Metro Music/song-ideas/audio-320"
import sys, os, subprocess, numpy as np
src, out = sys.argv[1], os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'song-ideas', 'peaks')
RATE, PER_SEC = 48000, 50
for name in sorted(f for f in os.listdir(src) if f.endswith('.mp3')):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(src, name), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.abs(np.frombuffer(pcm, np.float32))
    n = RATE // PER_SEC
    x = np.pad(x, (0, -len(x) % n)).reshape(-1, n)
    v = 0.4 * x.max(1) + 0.6 * np.sqrt((x ** 2).mean(1))
    v = (v / (v.max() or 1)) ** 0.72
    open(os.path.join(out, name.replace('.mp3', '.bin')), 'wb').write((v * 255).round().astype(np.uint8).tobytes())
    print(name, len(v))
