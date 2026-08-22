# the tour

A minute of vertical video for social: Trinity walks the camera round the
bedroom and says what things are.

```sh
node tools/tour/record.mjs           # the whole thing → out/metro-tour.mp4
node tools/tour/record.mjs --fast    # half size, for checking a cut
node tools/tour/record.mjs --voice-only
```

`script.mjs` is the **content** — what she says and where the camera goes.
That's the file to edit. `record.mjs` is the machinery and shouldn't need
touching to change the tour.

## how it works

1. Her lines go to ElevenLabs once (same voice id, model and settings the
   room uses — a tour in a different voice is a different person) and land
   in `audio/`. A clip is named for a hash of its own text, so editing one
   line re-renders one line.
2. Chrome opens the site at 1080×1920, and the camera is stepped **one
   frame at a time**. Each shot runs for exactly as long as its sentence,
   measured off the rendered mp3 rather than guessed from the character
   count — guessing drifts about a second over a minute.
3. ffmpeg stitches the frames and muxes the narration on. Frame N is always
   at N/FPS seconds, so the audio lines up by construction.

**The voice is never captured from the browser.** It doesn't need to be —
the files already exist, so the audio track is assembled from them. Clean
speech, no room tone, no fighting a headless browser for its audio device.

## things that cost a render to learn

- **Set the room dressing every beat, not once.** Blinds, dimmer and lava
  lamp are shared room flags that arrive from the database a moment after
  you enter, and anyone standing in the room can change them. The first cut
  opened the blinds and had them shut again two seconds later, which put
  slats across the one shot the whole video exists for.
- **Pin the clock.** `world.setWorldTime(date)` — `updateSky` runs every 60
  seconds of world time and will otherwise walk the sun back up mid-render.
  `skyPreview` is not enough: it repaints the view and leaves the interior
  light alone.
- **The room lamp runs to intensity 26.** 0.26 is a lamp on in a dark room.
  0.72 washes the back wall and the ceiling to cream and puts out the star
  projector entirely.
- **The portrait FOV is ~100°**, solved so a player on a phone can see a
  whole wall. That's right for playing and far too wide for a detail shot,
  so beats set their own.
- **The KuKo rug renders black headless** (no linear filtering for
  half-float textures on this backend — see CLAUDE.md). It's fine on real
  hardware. The tour keeps it out of frame; if you add a beat that looks at
  the floor by the bed, render with `HEADFUL=1` on a real GPU.
- `audio/`, `frames/` and `out/` are build artifacts and gitignored. The
  script is the thing worth keeping.
