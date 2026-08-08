# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

whoisthemetro.com — "THE METRO", a persistent 3D hangout world built with vanilla ES modules + three.js 0.160 (via importmap CDN, `three/addons/` for loaders/postprocessing). No bundler, no framework, no build step, no test framework. All geometry and textures are procedural (canvas textures); the only binary assets are `assets/img/` and the self-hosted DOOM bundle `assets/games/doom.jsdos` (CDN bundles are CORS-blocked).

Note: README.md describes an older "metro station" concept — the world is now a bedroom home-studio + three secret rooms (see Architecture).

## Commands

```sh
# run locally (any static server)
python3 -m http.server 8123
# RULE: always start the server and give the user the address — http://localhost:8123/ —
# any time there's something to look at (a change to test, a screenshot, a "go check it").

# syntax-check after edits (the only "lint")
for f in assets/js/*.js; do node --check "$f"; done

# deploy = push to main (GitHub Pages, CNAME whoisthemetro.com)
git push origin main
# verify deploy landed:
curl -s https://whoisthemetro.com/assets/js/world.js | grep -q "<some new string>"
```

Smoke tests are ad-hoc puppeteer-core scripts in `/tmp/metro-smoke/` (system Chrome, `headless: "new"`, flags `--no-sandbox --mute-audio --use-gl=angle`). Pattern: force local mode by defining `METRO_CONFIG` empty via `evaluateOnNewDocument`, click `#enter-btn`, drive the camera through `window.METRO_DEBUG` (`{renderer, camera, world, controls, THREE, cat, notesWall}`), screenshot, and **read the screenshots** — most regressions here are visual. A second "tab" can be simulated by posting on `BroadcastChannel("metro-presence")`.

## Architecture

### Rooms and world layout (assets/js/world.js, ~2800 lines)

`buildWorld(renderer)` builds everything and returns a large API object consumed by main.js. Five spaces in one scene, separated by distance:

- **Bedroom + arcade** around the origin. Walkable floorplan is a union of overlapping rects (`WALK_RECTS`) checked by `isWalkable(x,z)`; collision is axis-slide in controls.js. Real wall openings are `ShapeGeometry` with holes.
- **THE DESI** (boat, password `desi`, sha256 gate in main.js) at `BOAT = {x:40}`. Runs on real **Gotland** sun/weather (`astro.js` + Open-Meteo). The "outside" is a seabox of stacked 56 m-wide sheets — every layer must stay ≥56 m wide or its edges become visible through windows at steep angles.
- **THE STUDIO** (shared sequencer room) at `STUDIO = {z:-80}` (**not** +80 — the gym owns that), reached by playing the secret fill on the e-kit (kick·snare·hi tom·lo tom·hat·crash). It used to be its own web page; the geometry still comes from `studio/room.js`, which builds into a **Group** when handed a `parent` (and its own Scene when not, so `/studio/` still loads standalone). Built **after** the toon pass so it keeps its PBR look, and `studio.root.visible` is false unless you're in it — which is also why its global `AmbientLight` is safe: an invisible group's lights contribute nothing. Its engine (devices/audio/net/clock) boots lazily on first entry from main.js; `SA.setFx({masterGain:0})` mutes it behind you. The drum machine has **play pads** in the gutter (`act.trigger`, which also records to the nearest step when the local-only `rec` arm is on), **four patterns** and a **live step count** — both live on `xport` so the room switches together. Never read `dev.x.grid`: it's `curGrid(id)` (patterns) and `stepCount()` (loop length), and grids are allocated `MAX_STEPS` wide so shortening the loop hides steps instead of destroying them. The PERC row plays 77 real dumbek one-shots from `assets/audio/dumbek/` via a shuffle bag — draw without replacement, and a fresh bag never opens with the sample you just heard.
- **THE CREW** (zero-g Echo Arena, no password — team chooser overlay on entry) at `ARENA = {y:80}`. Full Echo layout: main hall + goal domes (rings at x=±34, 3-point bubble r=14), mid-wing tunnels, island cubes, per-team locker rooms (x=±54.5) with ready kiosks, 3 launch tubes per side with catapult handles. Flight containment is a UNION of volumes — `world.arenaClamp(pos, vel, r)` (players and disc both); grabbing checks `world.arenaNearWall`. Zero-g flight is `controls._updateZeroG` (gaze WASD thrust, E grab/fling walls *and* teammates, SHIFT boost, B brake, F shield, click = punch/stun, click on catapult handles = launch). Disc/goals/punch/deflect/match-start are presence `sendAct` kinds with last-event-wins authority.

At the end of buildWorld, every Lambert/Standard material is swapped for `MeshToonMaterial` with a 4-step ramp (cel shading). Materials created after buildWorld (notes) stay Lambert; the cat builds its own 4-step toon ramp in cat.js.

### Hard-won three.js rules (do not relearn these)

- **`light.layers` does NOT scope illumination.** A directional light reaches every object in the scene. Cross-room "suns" must be **SpotLights** (cones physically can't reach the other room). Point lights are contained by short `distance` instead — keep arcade/boat point-light throws shorter than the gap to the next room.
- Light layers (boat = layer 3, arena = layer 4) are still used for raycast/visibility bookkeeping: `camera.layers.enable(3|4)` and `raycaster.layers.enableAll()` in main.js are required. **Never use layers 1 or 2** — three.js assigns those to the left/right eye in a WebXR session, so anything on them renders to one eye only.
- **Z-fighting:** anything mounted on a wall sits ≥3 cm proud of it (notes use `0.03 + seq stagger` in notes3d.js).
- Shadow masks around the window are thick DoubleSide boxes, not thin planes.

### Shader art — shaderart.js

The acoustic slabs carry animated Shadertoy-style pieces. Fragment sources live in shaderart.js (`SHADER_ART`, with per-shader adaptation notes and licenses); world.js wraps each in a prelude where `vUv * iResolution` stands in for `gl_FragCoord` (so every piece renders in its slab's true aspect — set iResolution from the slab's w:h), pins `iMouse` to zero, and drives `iTime` from the world tick. `glsl3: true` marks shaders needing ES 3.0; those get an explicit out var (GLSL3 mode has no `gl_FragColor`). GLSL ES 1.00 pitfalls that keep recurring: no `round()`/`tanh()` (polyfill), no `#define` line continuations, uninitialized globals/locals are undefined (Shadertoy hands out zeros — set them). Panel assignment is `PANEL_SHADERS` in world.js, keyed by PANEL_DEFS index.

### Notes ("the wall") — notes3d.js + world walls[]

Postable walls are entries in `walls[]`: `{id, mesh, w, h, origin, uDir, vDir, normal, voids}`. Note placement raycasts against walls **and** `blockers` (doors, furniture, acoustic slabs — all click-solid so notes land on bare wall only). `voids` are no-post rects (doorways, panels, signs); the DB `notes.wall` check constraint must list every wall id (bedroom: `back/west/east`, boat: `boat_*`). Notes are room-scoped by `refreshNoteVisibility()` in main.js. De-overlap is a deterministic spiral in notes3d.js sorted by `created_at`.

### Data layer — store.js

Dual mode: Supabase when `config.js` has keys, otherwise localStorage + BroadcastChannel ("local mode"). Everything privileged goes through **security-definer RPCs** with `set search_path = ''` (so pgcrypto is `extensions.crypt`) and IP rate limits via `private.post_log` with prefixed keys. Realtime: postgres_changes (notes, cat, scores, room_state) + presence channel.

### Presence — presence.js

One channel (`metro-presence`) carries: `pose` (now includes `y` for zero-g), `note` (piano), `act` (curtains/closet/dimmer/pet/volca/disc/goal/chat-adjacent shared actions), `chat`, `arcade` (2P game lockstep). Local mode mirrors all of it over BroadcastChannel. Ghost rendering/smoothing is ghosts.js.

### Audio — ambience.js

Pure WebAudio, no files. Everything routes through a master gain → DynamicsCompressor (anti-pop). Envelope rule: true-zero linear attack, exponential decay, linear tail to 0, scheduled 5 ms ahead. **Sound is room-scoped in main.js**, not here: `bedroomSound()` wrapper + `inBoat`/`inArena` gates; crossing a portal must silence the room you left (`setRoomTone`, `setWater`, `setThruster`).

### Glue — main.js

Boot, raycast target list in `castAt()`, all click handling + aim tips, modals, room transitions (instant: `modalOpen` guard around `prompt()`, then fade + `safeLock()`), disc simulation, cat HUD, flight strips (planes.js → airplanes.live; OpenSky/adsb.lol are NOT CORS-open), chat, admin mode at `/#admin`. **Render targets and XR:** any pass that binds a render target must save and restore the previous one (`const prev = renderer.getRenderTarget()` … `setRenderTarget(prev)`) — never `setRenderTarget(null)`. Inside a WebXR session three.js binds the headset's framebuffer before the animation callback, and clearing it to null sends the room to the canvas instead of the eyes (black headset). Both the mirror and the rug's multi-pass do this; `/tmp/metro-smoke/xrframebuffer.js` asserts the invariant headlessly.

VR (xr.js): WebXR — [ enter vr ] appears post-entry on XR browsers; left stick walks (world.isWalkable axis-slide), right stick snap-turns, triggers fire the normal click dispatch, and `castAt` casts from the pointing controller whenever a session is live (so aim tips follow your hand). Every physical interaction works; anything that would open a **DOM overlay** must call `vrBlocked("…")` first — DOM is invisible in a session, and opening a modal there sets `modalOpen` behind an unseeable panel and locks every further click. The radio and dimmer get physical VR paths instead (power toggle / brightness cycle). xr.js owns a WRIST HUD (`xr.note` transient, `xr.tip` aim) worn on the off hand — never floating in view — since toasts and tips are DOM; `toast()` in main.js mirrors to it automatically. The rig follows world-driven teleports (lift rides) by watching `controls.pos` change behind its back. **Raise the guard BEFORE `modalOpen = true`** — bailing out after it leaves an invisible modal wedging every click (bit both door functions once); `onSelect` self-heals a stale flag when no `.overlay.show` exists and no lift is riding. The standalone `/studio/` page has its own rig: it feeds xr.js an isWalkable adapter built from `room.clampWalk`, exposes `pos`/`yaw` off its controls, and runs on `setAnimationLoop`. The in-world studio just uses the bedroom's rig. Admin layout editor: press L in admin mode to move/rotate/resize the props registered in `world.movables` (arrows/QE/+-/PgUpDn, R resets, L again saves); layouts persist for everyone via the `layout` room flag (`set_room_flag` whitelists its keys in site.sql).

## Supabase / secrets

- `supabase/*.sql` are idempotent, paste-into-SQL-Editor migrations. `supabase/EVERYTHING.local.sql` (gitignored) is the concatenation of all pending migrations **including the real Discord webhook** — regenerate it with `cat cat.sql inbox.sql arcade.sql site.sql discord.local.sql > EVERYTHING.local.sql` after editing any part. Never commit `*.local.sql`; the repo is public.
- The anon key in `assets/js/config.js` is fine to ship; the service_role key never is. (The user has previously pasted the wrong one — check which key you're given.)
- New event types must be added to the `events` table check constraint in `site.sql` before `store.logEvent()` can use them; same for new wall ids in the notes constraint.

## Conventions

- Plain JS, no TypeScript. Comments are lowercase-casual and explain *why*, in the voice of the room ("the sea has rules").
- Large world.js edits are done with python heredoc splices against unique anchor comments (e.g. `/* --- dust --- */`) — keep those anchor comments intact.
- Commit messages: a short imperative title, then a bulleted story of what changed and why; deploys happen on every push to main, so each commit should leave the site working.
