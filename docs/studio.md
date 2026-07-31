# THE STUDIO — a shared music room

An experiment on the `music-world` branch, living at `/studio/`. Nothing on
`main` is touched, so whoisthemetro.com is unaffected either way.

Four machines stand in a ring. Whatever is playing when you walk in is what
everyone else is hearing, on the same beat, wherever they are. You don't build
instruments — the machines are already there, and you play them together.

## Run it

```sh
python3 -m http.server 8123
# → http://localhost:8123/studio/
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
  audio.js                 drums, synth voices, FX rack (no sample files)
  panels.js                the machine faces, drawn to canvas + hit-tested by UV
  room.js                  the three.js room
  controls.js              walking and pointing
  net.js                   realtime channel + local-mode mirror
  main.js                  boot and glue
supabase/studio.sql        the clock function (idempotent)
```

## Why the panels are canvases

Each machine's face is drawn to a 1024×512 canvas and mapped onto a plane. A
click is a raycast that returns a UV, and a UV is a cell. That indirection is
deliberate: the exact same hit test works for a mouse today and a controller ray
in a headset later. Nothing in the interaction layer knows which one it's
talking to — adding WebXR should mean touching `controls.js` and nothing else.

## Known gaps

- No WebXR yet (the room is built so it can be added, but it isn't there).
- The melodic sequencer starts empty on purpose; only the drums and the clip
  bank are seeded.
- Clip patterns can be launched but not yet edited in-world (`act.setClipNote`
  exists and syncs; nothing calls it from the UI).
- No voice chat — the main world has walkie-talkie, this room doesn't yet.
