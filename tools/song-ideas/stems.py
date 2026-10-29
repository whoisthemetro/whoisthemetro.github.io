# song ideas stems: separate -> align -> pack.
#
#   ~/.venvs/demucs/bin/python tools/song-ideas/stems.py [--upload] 17 38 42
#   (--upload sends each packed song to R2 as it finishes; tools/song-ideas/r2put.sh)
#
# 1. demucs (htdemucs_ft, on the M1's GPU) splits the master into drums / bass / vocals / other.
#    masters come from the Metro Music catalog's "Show Clients" playlist; if a master isn't on
#    this machine (some live in Dropbox), the site's own 320k mp3 is used instead.
# 2. ALIGN. the stems must sit sample-for-sample under the site's mp3, or the waveform, the loop
#    points and the mix all drift off the stems. an mp3 source arrives with ~25 ms of decoder
#    padding in front, so nothing is assumed: the stems' sum is cross-correlated against the
#    site mp3 and trimmed/padded to the lag it finds, then cut to the mp3's exact length.
# 3. PACK all four into ONE 8-channel FLAC (drums L R, bass L R, vocals L R, other L R).
#    one file means one media element and one clock — the stems cannot drift apart. FLAC because
#    it was the only 8-channel format iPhone Safari plays with every channel intact and in order
#    (tools/song-ideas/fmt/test.html): opus/webm doesn't play there, and AAC 7.1 reorders the
#    channels and drops one as LFE. output: song-ideas/stems-pack/NN.flac + a manifest line.
import sys, os, json, sqlite3, shutil, subprocess, tempfile
import numpy as np

ROOT = '/Volumes/Metro/Metro Music'
SITE_MP3 = f'{ROOT}/song-ideas/audio-320'
RAW = f'{ROOT}/song-ideas/stems-raw2'   # round 2 (round 1, which drifted, is in stems-raw)
MODEL = 'htdemucs_ft'
# each round of stems gets its own folder in R2: the live set is never overwritten mid-run, and a
# new folder can't be served stale from cloudflare's cache. the player switches when stems.js does.
VER = 'v2'
PACK = f'{ROOT}/song-ideas/stems-pack'
STEMS = ['drums', 'bass', 'vocals', 'other']
SR = 44100   # demucs works at 44.1k
DEMUCS = os.path.expanduser('~/.venvs/demucs/bin/demucs')

def masters():
    # the catalog db is read from a copy: never touch the live one
    with tempfile.TemporaryDirectory() as d:
        db = os.path.join(d, 'cat.db'); shutil.copy(f'{ROOT}/_catalog/catalog.db', db)
        rows = sqlite3.connect(db).execute(
            "select pt.position, t.path from playlist_tracks pt join playlists p on p.id=pt.playlist_id "
            "join tracks t on t.id=pt.track_id where p.name='Show Clients' order by pt.position").fetchall()
    return {pos + 1: path for pos, path in rows}

def pcm(path, rate, ch):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', str(rate), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32).reshape(-1, ch)

def xcorr_lag(a, b, lo):
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
    k = int(np.argmax(c)); k = k - n if k > n // 2 else k   # >0: a starts late by k samples
    return round(k * SR / lo)

def lags(stem_dir, site_mp3):
    # the lag at the START and at the END of the song. they must agree: in round 1, mp3 sources
    # decoded inside demucs drifted (26 ms over 2.5 min), the first-40-s check called them aligned,
    # and rebuilding OTHER from drifted parts left doubled hits in it — the clicks and pops.
    lo, w = 11025, 11025 * 30
    a = sum(pcm(f'{stem_dir}/{s}.wav', lo, 1)[:, 0] for s in STEMS)
    b = pcm(site_mp3, lo, 1)[:, 0]
    m = min(len(a), len(b))
    return xcorr_lag(a[:w], b[:w], lo), xcorr_lag(a[m - w:m], b[m - w:m], lo)

def low_split(chans, cut=120.0):
    # the 808 rule. htdemucs learned bass from live bands, so an 808 comes back as DRUMS and the
    # bass part is empty. on those songs everything under `cut` in the rhythm parts goes to BASS.
    # the split is complementary (drums keep d - lowpass(d)), so drums + bass still sum exactly.
    from scipy.signal import butter, sosfiltfilt
    # order 2 run forwards+backwards: zero-phase (so d - low(d) is a clean highpass — a one-way
    # filter's complement leaks sub into drums), and gentle enough that the kick's low end isn't
    # smeared audibly ahead of the hit, which order 4 did
    sos = butter(2, cut, 'lowpass', fs=SR, output='sos')
    lowd = sosfiltfilt(sos, chans[0], axis=0).astype(np.float32)   # zero-phase, so subtraction is clean
    chans[0] = chans[0] - lowd
    chans[1] = chans[1] + lowd

def lowshare(x, mix):
    from scipy.signal import butter, sosfilt
    sos = butter(4, 150, 'lowpass', fs=SR, output='sos')
    e = lambda y: float(np.mean(sosfilt(sos, y.mean(1)) ** 2)) + 1e-12
    return e(x) / e(mix)

def run(order, src):
    n = f'{order:02d}'
    site = f'{SITE_MP3}/{n}.mp3'
    # a WAV master is the cleanest thing to separate. anything else -> the site's own mp3, which is
    # what the player plays, so the parts line up with it by construction
    if not src.lower().endswith(('.wav', '.aif', '.aiff', '.flac')): src = site
    sd = f'{RAW}/{MODEL}/{n}'
    if not all(os.path.exists(f'{sd}/{s}.wav') for s in STEMS):
        with tempfile.TemporaryDirectory() as d:
            # decode it OURSELVES to a 44.1k float wav — demucs's own decode is what drifted
            wav = f'{d}/{n}.wav'
            subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ar', str(SR), '-ac', '2', '-c:a', 'pcm_f32le', wav], check=True)
            subprocess.run([DEMUCS, '-n', MODEL, '-d', 'mps', '--shifts', '2', '--int24', '-o', RAW, wav], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    lag, lag_end = lags(sd, site)
    if abs(lag_end - lag) > 2:
        raise RuntimeError(f'{n}: parts drift against the site mp3 ({lag} -> {lag_end} samples) — not packing it')
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', site],
                               capture_output=True, text=True).stdout)
    want = round(dur * SR)
    chans = []
    for s in STEMS:
        x = pcm(f'{sd}/{s}.wav', SR, 2)
        x = x[lag:] if lag > 0 else np.vstack([np.zeros((-lag, 2), np.float32), x])
        x = x[:want] if len(x) >= want else np.vstack([x, np.zeros((want - len(x), 2), np.float32)])
        chans.append(x)
    mix = pcm(site, SR, 2)
    mix = mix[:want] if len(mix) >= want else np.vstack([mix, np.zeros((want - len(mix), 2), np.float32)])
    # the model's own parts must already sum close to the mix, or rebuilding OTHER below would bake
    # their disagreement into it as artifacts. a song that doesn't null is reported, not shipped.
    # drift has its own check above, so this only catches gross failure: most songs land 12-24 dB,
    # and the two densest, hottest masters (26, 47 — both peak past full scale) sit at a flat 9-10
    null = float(10 * np.log10(np.mean(mix ** 2) / (np.mean((mix - sum(chans)) ** 2) + 1e-12)))
    if null < 9:
        raise RuntimeError(f'{n}: parts only null the mix by {null:.1f} dB — not packing it')
    bass_low, drums_low = lowshare(chans[1], mix), lowshare(chans[0], mix)
    split = bool(bass_low < 0.15 and drums_low > 2.5 * bass_low)
    if split: low_split(chans)
    # htdemucs_ft is four specialist models, one per stem, so the stems don't sum back to the
    # mix exactly. OTHER is rebuilt as the mix minus the other three: at unity the four ARE the
    # site's mp3, and whatever the models missed lives in OTHER, which is what "other" means anyway.
    chans[3] = mix - chans[0] - chans[1] - chans[2]
    eight = np.hstack(chans)                                     # (samples, 8)
    # 16-bit can't hold a rebuilt OTHER that peaks past full scale; scale everything down together
    # and tell the player to scale back up (manifest 'gain'), so the sum is still the mix
    peak = float(np.abs(eight).max()); scale = min(1.0, 0.98 / peak) if peak else 1.0
    eight = eight * scale
    lufs = {}
    for s, x in zip(STEMS, chans):   # a near-silent stem gets flagged so the mixer can grey it out
        rms = float(np.sqrt(np.mean(x ** 2)) + 1e-12); lufs[s] = round(20 * np.log10(rms), 1)
    os.makedirs(PACK, exist_ok=True)
    out = f'{PACK}/{n}.flac'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '8', '-i', '-',
                    '-c:a', 'flac', '-sample_fmt', 's16', '-compression_level', '8', out],
                   input=eight.astype(np.float32).tobytes(), check=True)
    mb = os.path.getsize(out) / 1048576
    rec = {'order': order, 'gain': round(1 / scale, 4), 'rms_db': lufs, 'low_split': split}
    print(json.dumps({**rec, 'lag': lag, 'null_db': round(null, 1), 'bass_low': round(bass_low, 2),
                      'drums_low': round(drums_low, 2), 'src': os.path.basename(src), 'mb': round(mb, 1)}), flush=True)
    return rec

SITE_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'song-ideas', 'stems.js')
def write_site(man):
    # the player's copy of the manifest. the packed FLACs live in the metro-media R2 bucket at
    # media.whoisthemetro.com (they're ~2 Mbps — far past the supabase bucket's 25 MB file cap);
    # its CORS allows whoisthemetro.com, songs.whoisthemetro.com and localhost:8123
    body = json.dumps({int(k): v for k, v in man.items()}, separators=(',', ':'), sort_keys=True)
    open(SITE_JS, 'w').write(
        '// generated by tools/song-ideas/stems.py — which songs have stems, and how to play them back\n'
        f"const STEMS_BASE='https://media.whoisthemetro.com/song-ideas/stems/{VER}/';\n"
        f'const STEMS={body};\n')

if __name__ == '__main__':
    m = masters()
    man_path = f'{PACK}/manifest.json'
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    flags = [x for x in sys.argv[1:] if x.startswith('--')]
    for o in (int(x) for x in sys.argv[1:] if not x.startswith('--')):
        src = m.get(o)
        if not src or not os.path.exists(src): src = f'{SITE_MP3}/{o:02d}.mp3'
        try: rec = run(o, src)
        except RuntimeError as e: print('SKIP', e, flush=True); continue
        man[str(o)] = {'gain': rec['gain'], 'rms_db': rec['rms_db'], 'low_split': rec['low_split']}
        if '--upload' in flags:
            subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r2put.sh'),
                            f'{PACK}/{o:02d}.flac', f'song-ideas/stems/{VER}/{o:02d}.flac', 'audio/flac'], check=True)
        json.dump(man, open(man_path, 'w'), indent=1, sort_keys=True)
    write_site(man)
