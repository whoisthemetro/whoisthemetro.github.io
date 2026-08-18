# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

whoisthemetro.com — "THE METRO", a persistent 3D hangout world built with vanilla ES modules + three.js 0.160 (via importmap CDN, `three/addons/` for loaders/postprocessing). No bundler, no framework, no build step, no test framework. All geometry and textures are procedural (canvas textures); binary assets live in `assets/img/`, `assets/models/` (GLB props — the four scanned arcade cabinets swap in over procedural stand-ins, loaded one at a time 1.2s after build; new GLBs get preprocessed `gltf-transform dedup/prune/resize 512/webp q80` and the loader strips `transmission`/`clearcoat` — one visible transmissive material makes three.js render the whole scene twice per frame), `assets/audio/dumbek/` and `assets/wasm/`. The arcade's games (defender, pac, tron, pong) are hand-written canvas games in arcade.js — DOOM and js-dos are gone, PAC-MAN (an original maze-chase homage) lives in that cabinet now.

README.md is the human-facing description and is kept current; CHANGELOG.md is the running history (newest first). **`assets/js/whatsnew.js` is the VISITOR-facing changelog** — read in the room by typing `new` at the computer — and any job that changes something a visitor could NOTICE adds a plain-English line to it in the same commit. It is a translation, not a copy: no jargon, no file names, no how-it-works. A change nobody can see from inside the room stays in CHANGELOG.md only; padding whatsnew.js is how it stops being worth reading. docs/studio.md covers the sequencer room, tools/mi/ covers rebuilding the wasm. **docs/map.md is the job index** — which files a given piece of work actually touches, and where it lives inside the two big files. Open it when you're starting a job and don't already know where that job lives; don't move its contents in here, this brief stays short on purpose. The world is a bedroom home-studio + arcade, plus five other spaces (see Architecture).

## Commands

**One-time setup in a fresh clone:** `git config core.hooksPath .githooks` (see
"Two chats, one repo" below). Hooks aren't version-controlled by default, so this
line is what turns the pre-push guard on.

```sh
# run locally (any static server)
python3 -m http.server 8123
# RULE: always start the server and give the user the address — http://localhost:8123/ —
# any time there's something to look at (a change to test, a screenshot, a "go check it").

# syntax-check after edits (the only "lint"). NOTE the .mjs copy — it is not
# optional. `node --check foo.js` parses a module as CommonJS first, fails,
# retries as ESM, and that retry is LENIENT: it passed a file ending in an
# unterminated function. 38 of the 39 files here are ES modules, so the naive
# form was missing the exact thing it existed to catch.
for f in assets/js/*.js assets/js/studio/*.js; do
  cp "$f" /tmp/c.mjs && node --check /tmp/c.mjs || echo "FAIL $f"
done

# deploy = push to main (GitHub Pages, CNAME whoisthemetro.com)
git push origin main
# verify deploy landed:
curl -s https://whoisthemetro.com/assets/js/world.js | grep -q "<some new string>"
```

Smoke tests (VR too: xr exposes _debug.{step,rig,controllers} — drive step(dt, fakeSession) with fake inputSources; NOTE xr controllers have matrixAutoUpdate=false, a harness must updateMatrix()+updateMatrixWorld(true) after posing them) are ad-hoc puppeteer-core scripts in `/tmp/metro-smoke/` (system Chrome, `headless: "new"`, flags `--no-sandbox --mute-audio --use-gl=angle`). Pattern: force local mode by defining `METRO_CONFIG` empty via `evaluateOnNewDocument`, click `#enter-btn`, drive the camera through `window.METRO_DEBUG` (`{renderer, camera, world, controls, THREE, cat, notesWall}`), screenshot, and **read the screenshots** — most regressions here are visual. A second "tab" can be simulated by posting on `BroadcastChannel("metro-presence")`.

## Architecture

### Rooms and world layout (assets/js/world.js, ~2800 lines)

`buildWorld(renderer)` builds everything and returns a large API object consumed by main.js. Five spaces in one scene, separated by distance:

- **Bedroom + arcade** around the origin. Out the window is a PLACE, not a backdrop (`makeOutside`): concentric CYLINDERS centred on the room — sky 112 m, mountains 103 (with the METROWORLD neon), drifting haze 96, painted city 88 — plus real geometry in front: a street at y=-9 with instanced traffic on ten avenues, and ~40 real building boxes from 34-82 m. A cylinder has no left or right edge, which is the whole point: pressed to the glass at any angle you can never find the end of Los Angeles. Rules: rings are `MeshBasicMaterial` + `fog:false` + `BackSide` (the room's fog dies at 40 m and the toon pass only rewrites Lambert/Standard); ring textures are mirrored once (`repeat.x=-1`) because the arc builds west-to-east; the two FX rings (jet/bat/beacon/sun/moon at 86 m, kaiju at 90 m) keep the original 720×280 art coords and MUST pass `{arc: 92}` or their art stretches; the front wall carries a real ShapeGeometry window hole; heavy rings repaint only when the light of day turns over. Rooms cull each other's GEOMETRY, not just their lights: `bucketRoomGeometry` sorts every top-level scene child into desi/crew/venue/gym/studio by BOUNDING-BOX CENTRE (not group origin — boatGroup sits at 0,0,0 while its sea is out at x=40), and main.js calls `world.setRoomCull(myScope())` next to `applyLightCull` — same authoritative scope, because a position guess can't see the arena's flight height. LA rides the same switch. Anything main.js hangs on the scene after buildWorld (the venue screen) must register with `world.cullAdd(obj, room)`. Walkable floorplan is a union of overlapping rects (`WALK_RECTS`) checked by `isWalkable(x,z)`; collision is axis-slide in controls.js. Real wall openings are `ShapeGeometry` with holes. The **bathroom** off the arcade's south wall owns the room's only convolution reverb: `ambience.bathroomSend()` is a lazily-built send bus (a synthesized tiled-room IR — early slaps + a bright tail), and BOTH the toilets' sample pack and per-speaker voice route into it. `world.bath.inside(x,z)` is the single authority for who's in there — the fart wet/dry, the voice wet/dry and the lazy pack load all have to agree. Voice reverb is per SPEAKER, not a flag on the bus (`voice.setSpeakerBath(uid, wet, send)`, driven from `ghosts.poses()` each frame): what matters is where the person talking is standing.
- **THE DESI** (boat, password `desi`, sha256 gate in main.js) at `BOAT = {x:40}`. Runs on real **Gotland** sun/weather (`astro.js` + Open-Meteo). The "outside" is a seabox of stacked 56 m-wide sheets — every layer must stay ≥56 m wide or its edges become visible through windows at steep angles.
- **THE STUDIO** (shared sequencer room) at `STUDIO = {z:-80}` (**not** +80 — the gym owns that), reached by playing the secret fill on the e-kit (kick·snare·hi tom·lo tom·hat·crash). It used to be its own web page; the geometry still comes from `studio/room.js`, which builds into a **Group** when handed a `parent` (and its own Scene when not, so `/studio/` still loads standalone). Built **after** the toon pass so it keeps its PBR look, and `studio.root.visible` is false unless you're in it — which is also why its global `AmbientLight` is safe: an invisible group's lights contribute nothing. Its engine (devices/audio/net/clock) boots lazily on first entry from main.js; `SA.setFx({masterGain:0})` mutes it behind you. The drum machine has **play pads** in the gutter (`act.trigger`, which also records to the nearest step when the local-only `rec` arm is on), **four patterns** and a **live step count** — patterns live on `xport` so the room switches together; **loop lengths are per-machine** (drums on `xport.steps`, synth on `dev.synth.steps` — `stepCount(id)`/`playhead(id)`, and `fireStep` wraps the same absolute step around each length, which is the whole polymeter feature); a pattern change is **queued to the next downbeat** (`xport.qpat/qat`, committed locally in `fireStep` with no version bump — same trick as the synth launcher). Never read `dev.x.grid`: it's `curGrid(id)` (patterns) and `stepCount()` (loop length), and grids are allocated `MAX_STEPS` wide so shortening the loop hides steps instead of destroying them. The **synth is one instrument with two faces**: panel kind `synth` edits a pattern, kind `launch` fires them, both over one bank of eight (`DEV_OF` maps a face to its device — `state.dev.launch` does not exist). `curGrid("synth")` is what PLAYS (`active`), `editGrid("synth")` is what you're WRITING (`sel`), which is how you rewrite pattern 5 while 2 is playing. A/B/C/D on the header is the drum machine's four patterns only. Delay and reverb are the synth's own sends (channel sends default to 0, returns stay open); the master console carries tempo, swing, filter and level — and **Clouds** (right half of the MASTER face): Mutable Instruments' granular processor across the whole master bus (`master → mi-clouds worklet → compressor`), dry until `clWet` moves. **Plaits** is a synth voice (`voice: "plaits"`): the 24-engine macro-oscillator, 6-voice polyphonic, drawn as the hardware panel (LED column + bank buttons, HARMONICS/TIMBRE/MORPH/DECAY/LPG knobs). **Knobs are drag-only**: mousedown on a panel slider latches `studioDrag` in main.js, `controls.dragLock` freezes the camera and routes mouse motion to `dragDX/DY`, value previews live (state mutated, no version bump) and commits ONE edit on mouseup; taps can't jump a knob (`hit.knob` guard). Both live in `assets/wasm/mi.wasm` (Émilie Gillet's MIT DSP; rebuild recipe in `tools/mi/`), loaded by `SA.initMI()` in bootStudio, instantiated on the audio thread in `mi-worklet.js` (standalone wasm, stubbed wasi imports, `_initialize` for C++ ctors). Params ride `applyMixer` — the one sync point — and notes go over the worklet port with absolute context times. If wasm fails, `miStatus()` reads "failed" and the room stays on the hand-rolled voices with a dry master. The kit is **16 voices** so a 4×4 pad grid maps one-to-one. `pads.js` is an MPC overlay (DOM, portrait-first, pad 1 bottom-left) with record/undo/mute/metronome, CLEAR (focused voice's lane only) vs CLR ALL (whole pattern), steps and patterns, opened by the floating `[ pads ]` button that only shows in the studio. It sizes with `dvh` + safe-area insets (mobile `vh` lies about browser chrome), shows a one-row **sequencer strip** that follows the last-struck voice (tap a cell to toggle that step), and has a local-only **METRO** click (`SA.metroClick` → master, quarter notes via `onStep`); it also binds **Web MIDI** (`requestMIDIAccess`, note-on 36–51 → pad, others wrap) and plays whether the overlay is open or not. **Long-press a pad** (520 ms) to open the sampler: pick from `SA.SAMPLE_PACKS`, trim/pitch/gain sliders (live on input, committed+broadcast on release). Assignments are shared via `dev.drums.kit` ({row: {url,start,end,semis,gain}}); every drum playback path goes through `playDrumRow` in devices.js, which picks sample-or-synthesis. The studio is **sealed**: `body.in-studio` hides the cat pill + flight strip, and city/rain/LAX sounds are gated by `inStudio` in main.js. `seedTransport` deliberately seeds NOTHING — but the studio state persists as the `studio` room flag (snapshot debounced 2.5s, lowest-uid peer is the scribe, flushed on leave/unload): an empty room restores the last session from the DB before falling back to silence. A live peer's snapshot always beats the DB copy. The PERC row plays 77 real dumbek one-shots from `assets/audio/dumbek/` via a shuffle bag — draw without replacement, and a fresh bag never opens with the sample you just heard.
- **THE CREW** (zero-g Echo Arena, no password, no gate — the lift drops you straight into the hall, team auto-assigned) at `ARENA = {y:80}`. Main hall + goal domes (rings at x=±34, 3-point bubble r=14), mid-wing tunnels, island cubes, two exits (north hatch + south airlock). Lockers/tubes/kiosks are GONE (api stubs `setTubeBarriers`/`inTube` remain for the dormant match-flow code). Flight containment is a UNION of volumes — `world.arenaClamp(pos, vel, r)` (players and disc both); grabbing checks `world.arenaNearWall`. Desktop flight is `controls._updateZeroG` (gaze WASD thrust, E grab/fling walls *and* teammates, SHIFT boost, B brake, F shield, click = punch/stun). **VR flight is `stepZeroG` in xr.js**, Echo VR's own bindings: GRIP near a surface grabs — move the hand to drag yourself, release to fling; A/X fire that wrist's thruster along where the hand points; LEFT-stick click = boost toward gaze (1.4s cd); RIGHT-stick click held = brake; right-stick X still snap-turns; rig follows head in all three axes and resets its Y when zero-g ends. XR EYE cameras ship with only their eye masks — xr.js re-enables layers 3/4 on them every frame or the boat/arena render black in a headset. Disc/goals/punch/deflect are presence `sendAct` kinds with last-event-wins authority.

At the end of buildWorld, every Lambert/Standard material is swapped for `MeshToonMaterial` with a 4-step ramp (cel shading). Materials created after buildWorld (notes) stay Lambert; the cat builds its own 4-step toon ramp in cat.js.

### Hard-won three.js rules (do not relearn these)

- **`light.layers` does NOT scope illumination.** A directional light reaches every object in the scene. Cross-room "suns" must be **SpotLights** (cones physically can't reach the other room). Point lights are contained by short `distance` instead — keep arcade/boat point-light throws shorter than the gap to the next room.
- **Building a room behind an existing wall inherits that wall's lights.** A `distance` leash is only correct against the neighbours that existed when it was tuned. The arcade's magenta neon sat 1.2 m off the south wall throwing 4.2 m, which was fine while that wall had nothing behind it — the moment the bathroom went in, it painted white tile pink through solid brick. Before adding a room, sample its volume against every light in the scene (`/tmp/metro-smoke/bathleak.js`: walk `scene.traverse`, skip lights inside the new room, and for each remaining one test `distance` plus the spot cone against a grid of interior points). It names the offenders in seconds and tells you which are worth moving — the global sun and hemisphere reach everything and are meant to; a 14-intensity point light at 1.6 m is not. (It now tests BOTH directions: lights leaking out of the new room matter as much as lights leaking in.) There are only two ways to keep a fixture home. A **distance leash** — `distance` shorter than the gap to the nearest thing on the other side — which is exact but has to be rechecked every time either end moves. Or **aim it away**: if a spot's axis tilts away from the wall by more than its own half-angle, every direction inside the cone still carries velocity away from that wall, so no part of the beam can reach it no matter how far it throws. The second is the stronger guarantee and the one to reach for; the bathroom's wall-washers sit at its door pointing inward for exactly that reason.
- Light layers (boat = layer 3, arena = layer 4) are still used for raycast/visibility bookkeeping: `camera.layers.enable(3|4)` and `raycaster.layers.enableAll()` in main.js are required. **Never use layers 1 or 2** — three.js assigns those to the left/right eye in a WebXR session, so anything on them renders to one eye only.
- **The toon pass REPLACES `o.material`** with a fresh MeshToonMaterial, so any Lambert/Standard material reference captured during buildWorld is a dead object by the time anything ticks. Read `mesh.material` per frame instead of holding the material (the hoop's fire does this). MeshBasicMaterial is untouched and safe to hold.
- **Particle pools must park dead particles somewhere real.** `bucketRoomGeometry` sorts by BOUNDING-BOX CENTRE, so a Points cloud whose spare slots sit at `-999` gets filed under `studio` (`c.z < -40`) and is invisible everywhere else. Park them at the emitter with a black vertex colour instead — on an additive blend that's the same as gone.
- **Additive glow dies in daylight.** The bartender's single additive shell reads because the arcade is dark — additive ADDS to the background, so over black his amber stays amber. Do the same in the *bedroom* and a pale colour walks a sunlit wall toward white: you get a grey smudge. Two fixes, use both: push the colour deep and saturated (a near-zero red channel shifts the background's HUE instead of just brightening it), and build the body in two coats — a wide soft aura plus a smaller, stronger core inside it. The core holds an edge in daylight; the aura is what glows once the room dims. `guide.js` is the worked example.
- **Every material-group is its own draw call.** A Mesh wearing a six-entry material array costs six calls even when only two materials are distinct — the forty window buildings cost ~240 calls this way until they were baked into one BufferGeometry with two groups (world.js, the near-blocks bake; spawn view went 660→483). Static geometry that shares materials gets merged with its transforms applied up front; per-face UV work survives the bake fine. While the boxes are in hand, push their outline corners a hair proud (+0.05) into a single additive LineSegments — neon edges for the whole city cost one call.
- **Z-fighting:** anything mounted on a wall sits ≥3 cm proud of it (notes use `0.03 + seq stagger` in notes3d.js). Two more shapes of the same bug turn up whenever a doorway gets built: a casing sized to "line the wall thickness" needs the two wall planes ACTUALLY set that far apart — the bathroom's was 30 cm deep between planes 3 cm apart, so it squirted 13 cm into the hall and swallowed the neon bar whole. And frame pieces should BUTT (head spans only between the jambs), not overlap: overlapping leaves two coplanar faces sharing an area, which speckles even when both are the same colour. `/tmp/metro-smoke/edges.js` finds both — it walks the meshes in a volume and reports BURIED (one AABB mostly inside another) and COPLANAR (parallel faces within 2 mm that also overlap in area). The rule that keeps a fitted-out room clean is **every end runs PAST what it meets**: a partition sized exactly to the room leaves its top in the ceiling's plane and its ends in the wall planes, and where two pieces lap, the lapping one is made thinner and shorter so its side faces aren't in the other's planes either. Read COPLANAR, not BURIED: BURIED is AABB-based, so it cries wolf on anything rotated (a door knob inside a swung door's bounding box) or deliberately nested (a basin's bowl disc).
- **`emissive` survives the toon pass** (it's copied onto the MeshToonMaterial), which makes it the way to lift a room's black corners when a light can't be placed. A material that raises its own floor cannot leak through a wall, because it isn't a light. The bathroom's tile carries `emissive: 0x1c2026` for exactly this — the corners nearest its door are close enough to the hall that nothing could light them without crossing the wall.
- **Planar reflections (the bathroom mirrors) — the four things that cost a session.** (1) `renderer.clippingPlanes` is GLOBAL renderer state. Setting it inside `onBeforeRender` re-clips everything drawn *after* that mesh in the same frame — the room loses its own walls. Hide the few blockers with `.visible` instead. (2) three.js's `Reflector` kills blockers by shearing the projection into an oblique near plane; that degenerates when you stand square to the mirror and returns an empty target. (3) Clipping/oblique planes discard fragments but still SUBMIT geometry — 534 draw calls at a basin. Object-level **layer culling** is what makes the pass cost the room instead of the hall: tag the room onto a layer (5 here; 1–2 are XR eyes, 3 boat, 4 arena) and `camera.layers.set()` it, remembering that lights are collected through the same camera-layer test — miss them and the reflection renders black. (4) The mirror's own FRAME sits *behind* the glass, so the virtual camera stares at its back: hide it alongside the mirror. Coplanar, co-facing mirrors can share ONE pass and one texture if the vertex shader projects `modelMatrix * position` instead of baking each mirror's model matrix into the texture matrix. Drive it from `onBeforeRender` so it runs only when a mirror is actually on screen, and time-guard it so the second mirror reuses the first's render.
- Shadow masks around the window are thick DoubleSide boxes, not thin planes.
- **A sphere cap on a sphere has no edge.** Sit a `SphereGeometry` cap on a `SphereGeometry` head and you get a swim cap, however you colour it — two concentric surfaces read as one. Two rules got the avatars' hair out of it (`avatar-builder.js`): **tip the cap back** (~0.3 rad) so its rim rides high at the front and low at the nape, because a cap's rim is otherwise at one height the whole way round and hair never is; and **break the rim with separate pieces** — five-sided tapered cylinders make cheap angular locks, and three of them across the brow at different angles turn a circular hairline into a diagonal one. Matching trap: a shell offset backwards further than (its radius − the head's) dips INSIDE the head at the front, and the intersection curve shows up as a ragged notch over one eye.

### Shader art — shaderart.js

The acoustic slabs carry animated Shadertoy-style pieces. Fragment sources live in shaderart.js (`SHADER_ART`, with per-shader adaptation notes and licenses); world.js wraps each in a prelude where `vUv * iResolution` stands in for `gl_FragCoord` (so every piece renders in its slab's true aspect — set iResolution from the slab's w:h), pins `iMouse` to zero, and drives `iTime` from the world tick. `glsl3: true` marks shaders needing ES 3.0; those get an explicit out var (GLSL3 mode has no `gl_FragColor`). GLSL ES 1.00 pitfalls that keep recurring: no `round()`/`tanh()` (polyfill), no `#define` line continuations, uninitialized globals/locals are undefined (Shadertoy hands out zeros — set them). Panel assignment is `PANEL_SHADERS` in world.js, keyed by PANEL_DEFS index.

### Notes ("the wall") — notes3d.js + world walls[]

Postable walls are entries in `walls[]`: `{id, mesh, w, h, origin, uDir, vDir, normal, voids}`. Note placement raycasts against walls **and** `blockers` (doors, furniture, acoustic slabs — all click-solid so notes land on bare wall only). `voids` are no-post rects (doorways, panels, signs); the DB `notes.wall` check constraint must list every wall id (bedroom: `back/west/east`, boat: `boat_*`). Notes are room-scoped by `refreshNoteVisibility()` in main.js. De-overlap is a deterministic spiral in notes3d.js sorted by `created_at`.

### Data layer — store.js

Dual mode: Supabase when `config.js` has keys, otherwise localStorage + BroadcastChannel ("local mode"). Everything privileged goes through **security-definer RPCs** with `set search_path = ''` (so pgcrypto is `extensions.crypt`) and IP rate limits via `private.post_log` with prefixed keys. Realtime: postgres_changes (notes, cat, scores, room_state) + presence channel.

### Avatars — avatar-builder.js + the mirror + THE PODIUM

**Everyone is made of the same primitives.** There is no .glb tier and no
upload: the wardrobe, `avatar-glb.js`, the `avatars` storage bucket's only
caller and `identity.avatar` were all removed on 2026-08-15 — the world is
procedural and the people in it are part of that. ghosts.js has two look tiers
now, `outfit` blocks and the glow-blob, and `lookKey` is the outfit alone. (The
Supabase `avatars` bucket + policies are still in `site.sql`; nothing writes to
them.)

`buildAvatarFigure(spec)` builds the figure from primitives — see its header
for why the hair is built the way it is, and the sphere-cap rule in the three.js
section. **There is ONE fit**, a tee and trousers: the jacket and the dress were
retired on 2026-08-15, because at this polygon count a "jacket" is a torso with
two dark stripes on it. Character comes from colour, hair and **shoes** —
sneaker / hi-top / chunky / platform / boot, in any colour, and the colour is
the WHOLE shoe, flat — one material, no contrast sole (both a contrasting sole
and a shaded one read as a band stuck under the foot).

Four numbers hold the body together and each one cost a round of screenshots.
`TORSO_TOP` is where the shoulder dome lands for EVERY build — solve the trunk's
length from the radius, because the radius rides `wide` and a fixed length left
the slim torso short with its neck hanging in the air. `HIP_Y` is a FLAT hem: a
capsule's lower cap tapers to a point below the waistband and hangs between the
legs like a shirt-tail. The arms' `sx * 0.24` splay is what clears the forearms
and hands off the hips — the sign matters, `-sx` buries them in the body. And
the ankle tapers to 0.056·wide so the trouser leg is narrower than the shoe;
wider and the hem hangs over it and you see nothing but a sliver of sole.

Shoes are built on the outer `group` at floor level while everything else goes
in an inner `body` group raised by the pair's **lift** — that's what makes a
platform make you taller instead of swallowing your ankle, and it keeps the
"feet at y=0" contract intact.

**The podium is the ONE way into the creator.** It stands in the arcade's far
corner, the one nearest the smoking tables, and clicking it calls `openPicker()`
— the camera flies out along the podium's own facing and the figure standing on
it IS the live preview. The framed selfie mirror that used to hang on the east
wall by the bar (`mirror.js`, `world.mirrorAnchor`) was deleted on 2026-08-15:
a 40 cm render-target panel and a full-size figure were two doors into the same
panel, and the panel only needed one. (The BATHROOM mirrors are unrelated and
still there — different code, `world.bath`.)

The podium is world.js furniture only (`world.podium` = `{ group, mount, hits,
anchor, spin, spinOf }`); main.js hangs the figure in `mount`, because avatars
are Lambert on purpose and the toon pass at the end of `buildWorld` would eat
anything standing there by then. Off the creator it turns itself slowly. **Hold
the mouse down and drag** while the creator is open to turn yourself round — the
pointer is already unlocked there (the panel needs it), so it's plain clientX
deltas, NOT the `controls.dragLock`/`dragDX` path the studio knobs use.

### Presence — presence.js

One channel (`metro-presence`) carries: `pose` (now includes `y` for zero-g), `note` (piano), `act` (curtains/closet/dimmer/pet/volca/disc/goal/chat-adjacent shared actions), `chat`, `arcade` (2P game lockstep). Local mode mirrors all of it over BroadcastChannel. Ghost rendering/smoothing is ghosts.js.

### Audio — ambience.js

Pure WebAudio, no files. Everything routes through a master gain → DynamicsCompressor (anti-pop). Envelope rule: true-zero linear attack, exponential decay, linear tail to 0, scheduled 5 ms ahead. **Sound is room-scoped in main.js**, not here: `bedroomSound()` wrapper + `inBoat`/`inArena` gates; crossing a portal must silence the room you left (`setRoomTone`, `setWater`, `setThruster`).

### Glue — main.js

Boot, raycast target list in `castAt()`, all click handling + aim tips, modals, room transitions (instant: `modalOpen` guard around `prompt()`, then fade + `safeLock()`), disc simulation, cat HUD, flight strips (planes.js → the `planes` edge function; airplanes.live now 403s the free endpoint and adsb.lol/adsb.fi/OpenSky send no CORS header, so the fn is the only way to real traffic — coordinates baked in, two upstreams, 60s cache), chat, admin mode at `/#admin`. **Render targets and XR:** any pass that binds a render target must save and restore the previous one (`const prev = renderer.getRenderTarget()` … `setRenderTarget(prev)`) — never `setRenderTarget(null)`. Inside a WebXR session three.js binds the headset's framebuffer before the animation callback, and clearing it to null sends the room to the canvas instead of the eyes (black headset). Both the mirror and the rug's multi-pass do this; `/tmp/metro-smoke/xrframebuffer.js` asserts the invariant headlessly.

VR (xr.js): WebXR — [ enter vr ] appears post-entry on XR browsers; left stick walks (world.isWalkable axis-slide), right stick snap-turns, triggers fire the normal click dispatch, and `castAt` casts from the pointing controller whenever a session is live (so aim tips follow your hand). Every physical interaction works; the arcade cabinets play IN VR (the game canvas textures a panel floating in the room, arcade.vrFrame() driven from the world loop since page rAF sleeps in-session, left stick→arrows / A→Space / trigger→Enter / grip walks away, routed in xr.js); anything else that would open a **DOM overlay** must call `vrBlocked("…")` first — DOM is invisible in a session, and opening a modal there sets `modalOpen` behind an unseeable panel and locks every further click. The radio and dimmer get physical VR paths instead (power toggle / brightness cycle). xr.js owns a WRIST HUD (`xr.note` transient, `xr.tip` aim) worn on the off hand — never floating in view — since toasts and tips are DOM; `toast()` in main.js mirrors to it automatically. The rig follows world-driven teleports (lift rides) by watching `controls.pos` change behind its back. **Raise the guard BEFORE `modalOpen = true`** — bailing out after it leaves an invisible modal wedging every click (bit both door functions once); `onSelect` self-heals a stale flag when no `.overlay.show` exists and no lift is riding. The standalone `/studio/` page has its own rig: it feeds xr.js an isWalkable adapter built from `room.clampWalk`, exposes `pos`/`yaw` off its controls, and runs on `setAnimationLoop`. The in-world studio just uses the bedroom's rig. Admin layout editor: press L in admin mode to move/rotate/resize the props registered in `world.movables` (arrows/QE/+-/PgUpDn, R resets, L again saves); layouts persist for everyone via the `layout` room flag (`set_room_flag` whitelists its keys in site.sql).

## Two chats, one repo

Working one-job-per-chat (see docs/map.md) means two sessions can be editing this
repo at once, and they overlap hard: `world.js` is in half of all commits,
`main.js` and `CHANGELOG.md` in most of the rest. **Git is already the lock** —
the second push is rejected as non-fast-forward. What it can't do is tell you the
two edits still work together, and a chat that only checked its own copy has
proven nothing about the merged tree.

`.githooks/pre-push` closes that. It refuses to push when origin has moved (with
the rebase command to run and what landed up there), then syntax-checks the whole
tree *after* the rebase. Enable it once per clone with
`git config core.hooksPath .githooks`; `git push --no-verify` bypasses it.

So the rule for a chat that gets a rejected push: **`git pull --rebase origin main`,
resolve, re-run the check, push again.** Never force-push main — the other chat's
work is up there.

## Supabase / secrets

- `supabase/*.sql` are idempotent, paste-into-SQL-Editor migrations. `supabase/EVERYTHING.local.sql` (gitignored) is the concatenation of all pending migrations **including the real Discord webhook** — regenerate it with `cat cat.sql inbox.sql arcade.sql site.sql discord.local.sql > EVERYTHING.local.sql` after editing any part. Never commit `*.local.sql`; the repo is public.
- **Secrets that outlive a chat live in `~/.config/metro/`, never in the repo and never in a session scratchpad** (that's per-chat and is deleted with it). `voice.env` holds `ELEVENLABS_API_KEY` for Trinity's voice render; `tools/voice/render.mjs` reads it itself, so just run the tool. If Metro hands you a key, write it to that file yourself (mkdir 700, file 600) rather than handing back shell commands — he's said he'd rather it pass through the chat than do it by hand. Anything else long-lived that needs a secret goes in the same place and reads it the same way.
- The anon key in `assets/js/config.js` is fine to ship; the service_role key never is. (The user has previously pasted the wrong one — check which key you're given.)
- New event types must be added to the `events` table check constraint in `site.sql` before `store.logEvent()` can use them; same for new wall ids in the notes constraint.

## Conventions

- Plain JS, no TypeScript. Comments are lowercase-casual and explain *why*, in the voice of the room ("the sea has rules").
- Large world.js edits are done with python heredoc splices against unique anchor comments (e.g. `/* --- dust --- */`) — keep those anchor comments intact.
- Commit messages: a short imperative title, then a bulleted story of what changed and why; deploys happen on every push to main, so each commit should leave the site working.
