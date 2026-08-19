# THE GARDEN — getting music into it

Three things live in three places, on purpose:

| what | where | in git? |
| --- | --- | --- |
| the masters | wherever you keep them | no |
| the web encodes (`.m4a`) | `assets/audio/garden/` → **R2** | **no** (gitignored) |
| the catalog (titles, durations, waveforms) | `assets/js/garden-catalog.js` | **yes** |

The catalog is a few KB and the room needs it to grow the beds before a single
byte of audio loads, so it's committed. The audio never is — git keeps every
version of every file forever, and audio is exactly the thing you re-master.
Deleting it later means rewriting history and force-pushing `main`, which this
repo forbids (see "Two chats, one repo" in CLAUDE.md).

## planting a track

```sh
node tools/garden/encode.mjs ~/masters/*.wav
```

Per file it loudness-matches to −16 LUFS (two-pass EBU R128, `linear=true`, so
it's one gain change and not a compressor riding your mix), encodes AAC 128k
VBR with `+faststart`, reads 256 peak buckets, and writes the entry into
`assets/js/garden-catalog.js`.

```sh
node tools/garden/encode.mjs --demo        # 8 placeholder pieces, different shapes
node tools/garden/encode.mjs --list        # what's planted
node tools/garden/encode.mjs --rm <id>     # dig one up
node tools/garden/encode.mjs --raw ...     # skip loudness matching
node tools/garden/encode.mjs --bitrate 96k ...
```

Roughly **1 MB per minute** at the default bitrate. Reckon on that when you're
deciding how much goes in.

### why AAC and not Opus

Opus at 96k matches AAC at 128k, so it's about 25% smaller. It loses anyway:
Safari's Opus support is recent and still the thing that bites, and this world
already bends over backwards for iOS. Universal playback beats 25%.

### the demo plants

`--demo` writes eight `demo-*` tracks whose only job is to be **different
shapes** — a drone is a hedge, a riser steps up, a sparse piece is a picket
fence with gaps in it — so the beds can be built and walked before a real track
exists. Pull them the day the real ones land:

```sh
for id in drone pulse swell rain perc riser sparse long; do
  node tools/garden/encode.mjs --rm demo-$id
done
```

## R2

The audio is served from Cloudflare R2 rather than from this repo or Supabase
Storage. 10 GB free, and — the actual reason — **zero egress fees**, so
"everybody can hear my sound design work" doesn't have a meter running on it.
Supabase Storage's 5 GB/month egress is about 600 plays of a 10 MB track, in
total, across everyone.

### one-time setup

1. Cloudflare dashboard → R2 → **Create bucket**, name it `metro-garden`.
2. **Settings → Public access → Custom domain**: add `audio.whoisthemetro.com`
   (Cloudflare adds the CNAME itself if the zone is there). Public r2.dev URLs
   work too but are rate-limited and ugly.
3. **Settings → CORS policy** — this one is not optional. The room reads the
   audio through a `MediaElementAudioSourceNode`, and a cross-origin media
   element without CORS is *tainted*: it plays through a speaker but the Web
   Audio graph reading it outputs **silence, with no error anywhere**. Paste:

   ```json
   [
     {
       "AllowedOrigins": ["https://whoisthemetro.com", "http://localhost:8123"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["Range", "Content-Type"],
       "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   `Range` in `AllowedHeaders` and the three `ExposeHeaders` are what make
   *streaming* work. Without them the browser has to download a whole track
   before it makes a sound, which defeats the point of not using
   `decodeAudioData`.
4. Point the catalog at it — edit `GARDEN_BASE` at the top of
   `assets/js/garden-catalog.js`:

   ```js
   export const GARDEN_BASE = "https://audio.whoisthemetro.com/";
   ```

   Leave it as `""` and the room falls back to the local, gitignored
   `assets/audio/garden/`, which is what you want while working offline. The
   encoder preserves whatever is in there when it rewrites the file.

### uploading

`rclone` is the least annoying way (`brew install rclone`, then
`rclone config` → `s3` → provider `Cloudflare`, endpoint
`https://<account-id>.r2.cloudflarestorage.com`, and an R2 API token with
Object Read & Write):

```sh
rclone sync assets/audio/garden/ r2:metro-garden/ --progress
```

`sync` mirrors, so a track removed with `--rm` disappears from the bucket too.
Use `copy` instead if you'd rather nothing ever gets deleted up there.

The API token goes in **`~/.config/metro/CREDENTIALS.txt`** with a note saying
what it unlocks — never in this repo, and never in a session scratchpad.

## checking it landed

```sh
curl -sI https://audio.whoisthemetro.com/<id>.m4a | grep -iE "access-control|accept-ranges|content-type"
```

You want `access-control-allow-origin`, `accept-ranges: bytes`, and
`content-type: audio/mp4`. If the first is missing the garden will look like
it's playing and make no sound at all.
