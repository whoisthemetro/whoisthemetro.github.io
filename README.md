# THE METRO

An underground room that remembers — [whoisthemetro.com](https://whoisthemetro.com)

Walk into a 3D metro station. Read the wall. Leave a note, a photo, or a
link — it stays there forever, for everyone who comes after you. If
someone else is down there at the same time, you'll see them wandering
the platform.

No accounts, no feed, no algorithm. Just a place.

## How it's built

- **Front end** — vanilla JS + [three.js](https://threejs.org). The whole
  station (tiles, signs, train, dust) is generated procedurally; there are
  no texture or model files. Hosted on GitHub Pages.
- **The wall** — Supabase: Postgres for notes, Storage for photos,
  Realtime for live presence (seeing other visitors) and live posts.
  Until Supabase is configured the site runs in local mode
  (notes persist per-browser). See **[SETUP.md](SETUP.md)**.
- **Moderation** — owner-only kill switch at `/#admin`, IP rate limiting
  in the database, no edit/delete for visitors at the policy level.

## Run locally

Any static server works:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Open two tabs to see presence working (local mode uses BroadcastChannel).

## History

The previous incarnation of this site — a walk-through music studio with
a drum sequencer, MIDI support, and WebRTC jam mode — lives on the
[`archive/music-studio`](../../tree/archive/music-studio) branch.
