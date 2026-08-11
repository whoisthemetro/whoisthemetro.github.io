# THE STUDIO — a shared music room

A room inside THE METRO. You reach it by playing the secret fill on the
bedroom's e-kit (kick · snare · hi tom · lo tom · hat · crash), or by handing
someone the `/studio` link, which drops them straight into it.

Four machines stand in a ring. Whatever is playing when you walk in is what
everyone else is hearing, on the same beat, wherever they are. You don't build
instruments — the machines are already there, and you play them together.

## Run it

```sh
python3 -m http.server 8123
# → http://localhost:8123/studio  (or find the e-kit and play the fill)
```

Open two tabs to feel the multiplayer. With no backend keys the room runs in
local mode and mirrors itself across tabs over `BroadcastChannel` — the same
protocol, same code path, just a different pipe.

**Before it will stay in time across machines, paste `supabase/studio.sql` into
the SQL Editor.** Until you do, the HUD says `CLOCK NOT SYNCED` in red and every
browser trusts its own clock, which is wrong by whole seconds often enough to
matter. Everything else still works.

## How the sync actually works

The one decision the whole design rests on: **notes are never sent over the
network.** They can't be. A hi-hat that has to cross the Atlantic before it can
be heard is ~80ms late, and 80ms late is audibly, badly late.

Instead every browser holds the same *pattern* and the same *clock*, and each
one plays that pattern locally, out of its own sound card. The wire only carries
edits — "row 3 step 7 is on now" — which can take as long as they like to
arrive, because they describe a machine, not a sound. The only thing latency
costs is how quickly you see someone else's edit appear.

Three pieces make that work:

**The clock** (`clock.js` + `studio_now()`). Everyone NTPs against the database:
ask the server what time it is, note the round trip, assume the two legs were
about even. That recovers the browser's own clock error to within half a round
trip — measured at ~20ms on a normal connection. Local mode skips it, because
two tabs on one laptop already read the same system clock.

**Absolute step numbering** (`devices.js`). Step 0 happened at the transport
epoch and the steps have marched on ever since, so "step 1,048,576" names the
same instant in every browser in the room. Nobody follows anybody. There is no
host to lose — the transport is just two numbers, `epoch` and `bpm`, and anyone
can hold them.

**A lookahead scheduler.** A 25ms timer schedules every step falling in the next
220ms against the AudioContext clock. Nothing ever plays "now" — "now" is where
jitter comes from.

Two consequences worth knowing:

- Changing the tempo re-anchors the epoch so the downbeat doesn't move. Skip
  that and everyone lurches to a different part of the bar.
- Launching a clip names the exact absolute step it lands on, so every browser
  commits to the same bar even if the message arrives late.

## The drum machine

Sixteen voices, so a 4×4 pad grid maps one-to-one. Most are synthesised on the
spot; PERC plays 77 real dumbek one-shots from a shuffle bag (draw without
replacement, and a fresh bag never opens with the sample you just heard). Any
pad can trade its voice for a sample: long-press it and the sampler opens with
the library, a waveform, and trim / pitch / gain. Those assignments are shared,
so the whole room wears the same kit.

There's an MPC overlay (the floating `[ pads ]` button) built for a phone held
upright: sixteen pads with pad 1 bottom-left, REC / UNDO / CLEAR / CLR ALL, a
metronome that only you hear, the loop length, and A/B/C/D. It also binds **Web
MIDI**, so a real controller plays the kit whether the overlay is open or not.

Loop lengths are **per machine** — put the drums in 7 while the synth holds 16
and both wrap the same absolute step around their own length. That one line is
the whole polymeter feature. Pattern changes are queued to the next downbeat so
the room flips together.

## The synth

One instrument with two faces: the `synth` panel edits a pattern, the `launch`
panel fires them, both over one bank of eight. What PLAYS and what you're
WRITING are separate, which is how you rewrite pattern 5 while 2 is playing.

The default voice is **PLAITS** — Mutable Instruments' 24-engine macro
oscillator, Émilie Gillet's own MIT-licensed DSP compiled to WebAssembly and
run on the audio thread, drawn as the hardware panel (LED column, bank buttons,
HARMONICS / TIMBRE / MORPH / DECAY / LPG). Eight hand-rolled voices (SAW,
SQUARE, PLUCK, PAD, BELL, BASS, ORGAN, FM) are still there behind the VOICE
button, and one of them stands in if the wasm ever fails to load.

**CLOUDS** sits across the whole master bus — the granular processor, dry until
someone reaches for DRY/WET. Both live in `assets/wasm/mi.wasm`; the rebuild
recipe is in `tools/mi/`.

Knobs are **drag-only**: grab one and the camera freezes while your hand turns
it, the value previews live, and exactly one edit reaches the room when you let
go.

## Sliders latch

Grabbing a fader latches onto *that control*, not onto the panel. For the rest
of the drag only the horizontal position is read. Slide your hand up onto the
next row, off the end of the bar, or off the panel entirely and it keeps
tracking the fader you're actually holding — one slider at a time, always.

That's why `hitPanel` returns sliders as `{type:"slider", dev, ch?, key, value}`:
the `(dev, ch, key)` triple *names* the control and `value` is only the reading
at the instant you touched it. Because the name is separable from the reading,
`sliderValue()` can be asked for a fresh reading of a known control at a new
horizontal position, which is exactly what a held drag needs.

## Conflicts

Every device carries a `(version, author)` pair. Higher version wins; a tie goes
to the higher author id. The tiebreak matters — without it two simultaneous
edits can settle differently in different browsers and the room quietly splits
in two.

Joining is one message: a newcomer asks "what's playing?", and the lowest id in
the room that isn't the newcomer answers with a full snapshot. Everyone works
out who that is independently, so there's no election round trip. If nobody
answers within 1.3s you're the first one in, and you seed the room.

## Files

```
studio/index.html          entry point
assets/css/studio.css      overlay + HUD
assets/js/studio/
  clock.js                 shared time, NTP against the db
  devices.js               state, transport, scheduler   <- the sync lives here
  audio.js                 drums, synth voices, samples, FX rack, the wasm loader
  mi-worklet.js            PLAITS + CLOUDS on the audio thread
  pads.js                  the MPC overlay: pads, Web MIDI, per-pad sampler
  panels.js                the machine faces, drawn to canvas + hit-tested by UV
  room.js                  the three.js room (a Group in the main world)
  controls.js              walking and pointing (standalone page only)
  net.js                   realtime channel + local-mode mirror
  main.js                  boot and glue (standalone page only)
assets/wasm/mi.wasm        Mutable Instruments DSP  (rebuild: tools/mi/)
supabase/studio.sql        the clock function (idempotent)
```

## Why the panels are canvases

Each machine's face is drawn to a 1024×512 canvas and mapped onto a plane. A
click is a raycast that returns a UV, and a UV is a cell. That indirection is
deliberate: the exact same hit test works for a mouse today and a controller ray
in a headset later. Nothing in the interaction layer knows which one it's
talking to — adding WebXR should mean touching `controls.js` and nothing else.

## The room remembers

The room opens on **silence** — nothing is seeded, so the first thing anyone
hears is something they played. But the state persists: every change schedules
a debounced snapshot into the `studio` room flag (only the lowest uid present
writes, so ten people don't write ten copies), flushed again when you leave or
close the tab. Walking into an EMPTY room restores the last session before it
falls back to silence; a live peer's answer always wins, because whoever is
actually there is newer than the database by definition.

## VR

The room works in a headset — it's the bedroom's rig, so every physical control
answers a controller ray. The standalone `/studio/` page has its own rig,
feeding `xr.js` an `isWalkable` adapter built from `room.clampWalk`.

Anything that would open a **DOM overlay** (the pads, the sampler) is blocked
with a note on your wrist instead, because DOM is invisible in a session.

## Known gaps

- The pads overlay and the sampler are flat-screen only (see VR above).
- No voice chat — the main world has walkie-talkie, this room doesn't yet.
- One global room, no room codes: everyone lands in the same session.

## Testing note

`config.js` **assigns** `window.METRO_CONFIG`, so a puppeteer
`evaluateOnNewDocument` that sets it to `{}` gets overwritten by the real keys
and the test quietly runs against the live room. To genuinely force local mode,
intercept the request for `/assets/js/config.js` and serve an empty config.
