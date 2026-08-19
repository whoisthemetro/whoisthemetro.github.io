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
node tools/garden/encode.mjs --reshape     # recompute every waveform, no re-encode
node tools/garden/encode.mjs --raw ...     # skip loudness matching
node tools/garden/encode.mjs --bitrate 96k ...
```

## naming a plant

The catalog is **generated**, so a title typed straight into
`garden-catalog.js` is lost the next time that track is encoded. Names live in
`tools/garden/titles.json`, keyed by track id (the slug of the source
filename), and every encode run re-applies them to everything already planted.
Rename a track there and run `--reshape` to write it through.

## what the plant's shape actually is

Not a plain peak envelope. A peak envelope of anything mastered pins to the
ceiling in nearly every bucket, so ten tracks gave ten identical hedges — the
plant was showing the limiter's work instead of the music's. It's
`0.4 * peak + 0.6 * RMS`, **normalized per track**, with a `^0.72` lift so
quiet passages don't vanish into the 22 cm floor.

Per-track normalization is right *because* everything is loudness-matched:
absolute height across plants would encode crest factor, not loudness, which is
nothing a listener cares about. And the row's **length** is the track's
duration (sqrt-scaled, 1.15–3.0 m) — that's the part you can read from twenty
metres down the path.

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

## where the audio actually is right now: Supabase

**Live on Supabase Storage**, bucket `garden`, folder `g/`. It was already in the
stack and needed no new account, so the garden could open the same day. R2 is
still the intended home — see below for why and how to move.

The bucket is **public for reads and closed for writes.** Reads need no policy at
all (public is a bucket property); the site's anon key cannot write to it. To
plant more tracks you open a window, upload, and shut it again — the two
migrations are already applied and named, so re-running them is the procedure:

```sh
# 1. open  → supabase migration `garden_planting_window_reopen_for_cache_headers`
# 2. upload
ANON=$(grep -oE 'eyJ[A-Za-z0-9._-]+' assets/js/config.js | head -1)
URL=https://donnxntnewmkzrycugpn.supabase.co
for f in assets/audio/garden/*.m4a; do
  curl -s -o /dev/null -w "%{http_code} $(basename $f)\n" -X POST \
    "$URL/storage/v1/object/garden/g/$(basename $f)" \
    -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
    -H "Content-Type: audio/mp4" -H "x-upsert: true" --data-binary "@$f"
done
# 3. close → supabase migration `garden_bed_closed_for_good`
```

Leaving that window open would let anyone with the site's public key (which is
public, by design) write into the bucket. It is not a thing to forget about.

### the one real cost of this tier

Supabase's free tier serves public objects **`Cache-Control: no-cache`** no
matter what the object carries — the objects here are stored with
`max-age=31536000, immutable` and it is ignored, because browser caching there
needs Smart CDN, a paid feature. So a repeat listen re-downloads the track, and
the 5 GB/month egress is the real ceiling: the whole 25 MB catalog is about 200
complete listens a month, or ~1,700 single-track plays.

`garden/player.js` mitigates the part it can — stopping a track pauses and
rewinds rather than dropping the source, so stop/replay costs zero extra
requests (verified). Changing tracks still refetches, which is unavoidable.

**If plays ever get near that ceiling, move to R2.** It is one line.

## R2 — the intended home

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
   `assets/js/garden-catalog.js`. That single string is the entire migration;
   nothing else in the room knows where the audio comes from:

   ```js
   export const GARDEN_BASE = "https://audio.whoisthemetro.com/";
   ```

   Leave it as `""` and the room falls back to the local, gitignored
   `assets/audio/garden/`, which is what you want while working offline. The
   encoder preserves whatever is in there when it rewrites the file.

### doing the move

Once the bucket, domain and CORS policy exist, put the four values in
`~/.config/metro/r2.env` (the file the tool asks for) and run:

```sh
node tools/garden/to-r2.mjs --selftest   # signing is sane, no creds needed
node tools/garden/to-r2.mjs --commit     # upload, verify every object, rewrite GARDEN_BASE
```

Then commit the catalog and push. That's the whole migration — the same files in
a different place and one string changed. Nothing else in the room knows where
audio comes from, so nothing else has to change and a visitor can't tell.

`to-r2.mjs` speaks R2's S3 API and signs with SigV4 out of `node:crypto`, so
there is nothing to install. It verifies **every** object over the public URL
before declaring success, and it checks the two headers that actually decide
whether the room can use a file rather than just whether the file exists:
`Access-Control-Allow-Origin` and range support. A missing CORS header is the
failure that looks like success — the garden plays silence with no error at all.

Afterwards the Supabase `garden` bucket can be deleted, or left as a fallback.

### uploading by hand (rclone)

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
