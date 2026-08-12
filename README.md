# THE METRO

The room is always on — [whoisthemetro.com](https://whoisthemetro.com)

Walk into a living 3D studio in your browser. Read the wall. Leave a note,
a photo, or a link — it stays there forever, for everyone who comes after
you. If someone else is in the room right now, you'll see them wandering it,
hear them on the walkie-talkie, and play alongside them.

No accounts, no feed, no algorithm. Just a place that remembers.

## Status

Live and shipping. Every push to `main` deploys straight to
whoisthemetro.com (GitHub Pages, custom domain via `CNAME`). The
[CHANGELOG](CHANGELOG.md) is the running history — each line went live the
day it says it did.

There's also a **[work-in-progress preview](https://whoisthemetro.com/wip/)**
at `/wip` — the bedroom rebuilt from scratch in Babylon.js (PBR lighting,
god-rays, real 3D models, physics). It's a complete, playable snapshot of a
paused experiment: the main site stays on three.js for now, and the full
migration lives on the `babylon-migration` branch for a later date.

The site runs in two modes:

- **Connected** — wired to a Supabase backend, the wall is shared and
  permanent and you see other visitors live. This is how the live site runs.
- **Local mode** — with no backend keys in `assets/js/config.js`, everything
  still works, but notes persist only in your own browser and "other
  visitors" are simulated across your own tabs. See **[SETUP.md](SETUP.md)**
  to connect your own Supabase project (about 3 minutes, free tier).

## The world

One continuous 3D space, nearly all of it generated procedurally in code —
almost everything is canvas-drawn and then cel-shaded with a toon ramp. The
exceptions are deliberate and few: scanned `.glb` props (the four arcade
cabinets, some desk gear), the dumbek samples, visitors' own avatars, and
one WebAssembly binary for the studio's synth. Spaces are separated by
distance and portals:

- **The bedroom studio** — the home base. A real home-studio layout you can
  walk: the wall of notes left by visitors, a playable C-major keybed, a
  guitar, a drum kit, a mixer, light dimmer, a radio tuned to live Sveriges
  Radio streams, a cat with a real metabolism, LA weather and live LAX
  flyovers out the window, and **METRO OS** on the desk computer (rooms,
  private messages to metro, and a self-playing music player). The bedroom
  door — under its METRO: MIX & MASTER neon — steps out to the
  [mix & master site](https://whoisthemetro.com/mixandmaster/).
- **METRO'S ARCADE** — behind the closet. Four scanned cabinets (TRON,
  PAC-MAN, PONG, DEFENDER) running games written from scratch — DEFENDER's
  full liturgy, an original maze-chase, light cycles and paddles — some
  2-player in lockstep over the network. They play in VR too: the game
  floats on a panel in the room and the controllers become the cabinet.
  A marquee hangs over the row where the neon sign used to be — bulbs
  chasing round the frame, cycling each machine's all-time top five, and
  it flashes when your name lands on it. In the corner there's a half court
  with real markings — hold to wind up, release on the marker for a
  swish, and the board under the rim counts how many you've hit in a row
  before it calls you UNCONSCIOUS. Five in a row and the whole thing
  catches fire, NBA Jam style — every bucket after that feeds it, and a
  single miss puts it out.
- **THE DESI** — a boat room reached through a poster (passphrase `desi`).
  Runs on the *real* sun, moon and weather of Gotland, Sweden via Open-Meteo,
  with a living sea, true sound isolation, and a message-in-a-bottle you can
  cork and throw back.
- **ECHO ARENA** (a.k.a. THE CREW) — a zero-gravity disc sport, no
  passphrase and no lobby: the lift drops you straight into the hall,
  floating. Grab walls and teammates to slingshot yourself, punch to stun,
  shield to block, and score from inside or beyond the 3-point bubble.
  Flight runs the real game's numbers. Disc, goals and players are all
  networked. Best in a headset — see **VR** below.
- **THE BOOTH / venue** — a club space with a host-run booth: share a tab or
  a loopback audio source to the room, put a live video stream on the big
  screen for everyone in sync, and trigger DJ FX (fog, fireworks, look
  changes). WebRTC for screen-share, with TURN credentials minted by a
  Supabase edge function.
- **THE STUDIO** — a shared step-sequencer room, reached by playing a
  secret fill on the e-kit (or by handing someone the `/studio` link).
  Everyone in it shares one clock and one set of patterns, so two people in
  two cities hear the same bar at the same instant — the network carries
  *edits*, never notes. A 16-voice drum machine with an MPC-style pad
  overlay, Web MIDI, per-pad samplers, and a synth voiced by **PLAITS** with
  **CLOUDS** across the master bus — Mutable Instruments' own MIT-licensed
  DSP compiled to WebAssembly and run on the audio thread. The room
  remembers the last session anyone left in it.
- **THE GYM** — a full-court basketball game behind the JOIN sign on the
  arcade court. A cyberpunk night-court (neon line work, dim cyan/magenta
  lights, a glowing ball, a scoreboard above each hoop). On foot with a real
  jump and a stamina-limited dash (no boosting while you carry the ball). One
  shared ball: grab it, strip the holder, throw guided outlet passes, or jump
  into the paint and time the **dunk meter** for an automatic slam. Shooting is
  **auto-aimed for everyone** (the arc is solved at the hoop you face) so the
  skill is **power**: a ping-ponging meter with an **active-reload marker** —
  release in the green zone for a guaranteed swish, miss it for a brick. You
  spawn into a **warm-up** (unlimited boost, free roam, makes don't count) and
  tap the wall **READY board** to tip off into the real game. Two auto-balanced
  teams, 2s and 3s — all networked, with a full on-screen control pad on mobile.

Out the bedroom window is a place rather than a backdrop: concentric
horizon rings (sky, the San Gabriels with the Hollywood sign, a drifting
haze band, the painted skyline) with real geometry in front — a street
three storeys down with traffic running, and blocks of real buildings.
Because the rings are cylinders centred on the room, there is no angle from
which Los Angeles runs out.

The room also furnishes itself for regulars: time spent, piano notes,
arcade games and portal trips quietly add up and earn small objects that
stay.

## VR

The room is playable in a headset. `[ enter vr ]` appears after you walk in
on any WebXR browser (tested on Quest). Left stick walks (push it further to
walk faster), right stick snap-turns, triggers act as clicks, and B or Y is
push-to-talk. Because DOM overlays are invisible in a session, anything that
would open one is either blocked with a note on your wrist or given a
physical equivalent instead — and the arcade cabinets play on a floating
panel.

In ECHO ARENA the bindings are the real game's: **GRIP** grabs whatever your
hand is near (move your hand to drag yourself, release to fling), **A/X**
fire that wrist's thruster along where the hand points, **left stick click**
boosts, **right stick click** brakes. The disc lives in your grip, and the
throw reads the peak of your swing.

## Your avatar

The mirror in the arcade opens an outfit picker — build, hair, fit, skin
tone — and everyone sees what you're wearing. If you'd rather be yourself,
drop a `.glb` file on the wardrobe (or paste a public link to one): it's
loaded and parsed before it's worn, height-normalised, and its facing is
worked out from its own skeleton, so models exported from anywhere tend to
just work.

## Tech stack

- **Front end** — vanilla JavaScript ES modules, no framework, no bundler,
  **no build step**. [three.js](https://threejs.org) 0.160 loads via an
  importmap from a CDN (`three` + `three/addons/`). All geometry and
  textures are procedural.
- **Backend** — [Supabase](https://supabase.com): Postgres for the notes,
  Storage for photos, and Realtime for live presence (other visitors),
  shared actions, chat and walkie-talkie voice. Everything privileged runs
  through **security-definer RPCs** with IP-based rate limiting; the public
  anon key is safe to ship because the database policies lock down what it
  can do (read the wall and add to it — no edits, no deletes).
- **Audio** — pure WebAudio, room-scoped, no sound files (the only audio
  assets are the cat's meow/purr).
- **Analytics** — optional, env-gated PostHog (off entirely with no key).
  See [docs/analytics.md](docs/analytics.md).
- **Hosting** — GitHub Pages + a Supabase edge function for TURN.

## Requirements

- To run it: any static file server, and a modern browser with WebGL.
- To make the wall shared/permanent: a free Supabase project (see SETUP.md).
- To develop: just an editor and Node (used only for the `node --check`
  syntax pass and ad-hoc Puppeteer smoke tests — there is no npm install).

## Run locally

Any static server works:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Open two tabs to see presence working — in local mode visitors are mirrored
across tabs over `BroadcastChannel`.

To wire up the live backend instead, follow **[SETUP.md](SETUP.md)** and fill
in your Supabase URL and anon key in `assets/js/config.js`.

## Controls

- **WASD** move, **mouse** look, **click a wall** to post, **ESC** to step
  out. On mobile: left thumb walks, right thumb looks, tap a wall to post.
- **T** to chat, **V** (or hold the mic button) for walkie-talkie voice.
- In ECHO ARENA: gaze + WASD to thrust, **E** to grab/fling walls and
  teammates, **SHIFT** boost, **B** brake, **F** shield, click to punch.
  (In VR, see the **VR** section above.)
- In THE GYM: **WASD** move, **SPACE** jump, **SHIFT** dash (stamina), hold
  **click** to wind up the power meter and release in the green zone to shoot,
  click to grab/steal, **E** to pass, **R** to ready up. On mobile, twin
  thumbsticks — left moves (shove to the edge to boost), right looks (tap it to
  grab) — with JUMP, SHOOT and PASS buttons orbiting the right stick.

## Moderation

- **Owner-only kill switch** at `whoisthemetro.com/#admin`: click any item on
  the wall and remove it (soft-delete) after entering a passphrase once per
  session. Visitors cannot edit or delete anything — it's impossible at the
  database policy level.
- **Rate limits** are enforced in the database (per-IP and site-wide), with a
  280-char cap on notes and an in-browser 3 MB cap on photos. See SETUP.md
  for the full guardrail table.

## Project structure

```
index.html            entry point: importmap, all UI overlays, boots main.js
assets/
  js/                 the world, all ES modules:
    main.js           boot, click handling, room transitions, glue (~big)
    world.js          procedural geometry for every room (~big)
    store.js          data layer — Supabase RPCs or localStorage (dual mode)
    presence.js       Realtime presence: poses, actions, chat, voice
    controls.js       movement + collision; zero-g flight in the arena
    notes3d.js        the wall — placing/laying out notes in 3D
    ambience.js       procedural WebAudio
    arcade.js         the cabinets and the games inside them
    xr.js             WebXR: the rig, controllers, wrist HUD, zero-g flight
    avatar-glb.js     visitors' own .glb avatars (facing + gaze correction)
    studio/           the sequencer room: devices, audio, panels, pads, net
    config.js         your Supabase / PostHog keys (safe to publish)
    …                 cat, songs, radio, voice, stream/screen (venue), etc.
  css/room.css        the overlay/HUD styling
  models/*.glb        scanned props (arcade cabinets, desk gear)
  wasm/mi.wasm        Mutable Instruments DSP for the studio (MIT; see tools/mi)
  img/, audio/        cat sounds, dumbek one-shots, a couple of images
supabase/             idempotent SQL migrations (paste into the SQL Editor)
                      + edge functions (e.g. TURN credential minting)
venue/                standalone venue entry page
docs/analytics.md     PostHog event spec (optional analytics)
docs/studio.md        how the shared sequencer room works
tools/mi/             how to rebuild assets/wasm/mi.wasm from source
CHANGELOG.md          what shipped, newest first
SETUP.md              connect Supabase + the admin kill switch
```

## Caveats

- The world is one big procedural scene; `world.js` and `main.js` are large
  on purpose (no asset pipeline means the geometry lives in code).
- Some external data sources must be CORS-open to work in the browser — live
  flight strips use `airplanes.live`, weather uses Open-Meteo, radio uses
  Sveriges Radio. If one goes down, that feature degrades gracefully.
- `supabase/*.local.sql` (which would contain real secrets like the Discord
  webhook) is gitignored and never committed — only the idempotent public SQL
  and the public anon key ship.

## History

whoisthemetro.com used to be a walk-through music studio with a drum
sequencer, MIDI support, and a WebRTC jam mode. That incarnation is archived
on the [`archive/music-studio`](../../tree/archive/music-studio) branch,
heavy media and all.
