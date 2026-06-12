# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

whoisthemetro.com — "THE METRO", a persistent 3D hangout world built with vanilla ES modules + three.js 0.160 (via importmap CDN, `three/addons/` for loaders/postprocessing). No bundler, no framework, no build step, no test framework. All geometry and textures are procedural (canvas textures); the only binary assets are `assets/img/` and the self-hosted DOOM bundle `assets/games/doom.jsdos` (CDN bundles are CORS-blocked).

Note: README.md describes an older "metro station" concept — the world is now a bedroom home-studio + three secret rooms (see Architecture).

## Commands

```sh
# run locally (any static server)
python3 -m http.server 8123

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

`buildWorld(renderer)` builds everything and returns a large API object consumed by main.js. Four spaces in one scene, separated by distance:

- **Bedroom + arcade** around the origin. Walkable floorplan is a union of overlapping rects (`WALK_RECTS`) checked by `isWalkable(x,z)`; collision is axis-slide in controls.js. Real wall openings are `ShapeGeometry` with holes.
- **THE DESI** (boat, password `desi`, sha256 gate in main.js) at `BOAT = {x:40}`. Runs on real **Gotland** sun/weather (`astro.js` + Open-Meteo). The "outside" is a seabox of stacked 56 m-wide sheets — every layer must stay ≥56 m wide or its edges become visible through windows at steep angles.
- **THE CREW** (zero-g Echo-VR-style arena, password `thecrew`) at `ARENA = {y:80}`. Zero-g flight is `controls._updateZeroG` (gaze-aligned WASD thrust, SHIFT boost, B brake, wall bounce); the disc and goals are networked via presence `sendAct` kinds `disc`/`goal` with last-event-wins authority.

At the end of buildWorld, every Lambert/Standard material is swapped for `MeshToonMaterial` with a 4-step ramp (cel shading). Materials created after buildWorld (notes, cat) stay Lambert.

### Hard-won three.js rules (do not relearn these)

- **`light.layers` does NOT scope illumination.** A directional light reaches every object in the scene. Cross-room "suns" must be **SpotLights** (cones physically can't reach the other room). Point lights are contained by short `distance` instead — keep arcade/boat point-light throws shorter than the gap to the next room.
- Light layers (boat = layer 1, arena = layer 2) are still used for raycast/visibility bookkeeping: `camera.layers.enable(1|2)` and `raycaster.layers.enableAll()` in main.js are required.
- **Z-fighting:** anything mounted on a wall sits ≥3 cm proud of it (notes use `0.03 + seq stagger` in notes3d.js).
- Shadow masks around the window are thick DoubleSide boxes, not thin planes.

### Notes ("the wall") — notes3d.js + world walls[]

Postable walls are entries in `walls[]`: `{id, mesh, w, h, origin, uDir, vDir, normal, voids}`. Note placement raycasts against walls **and** `blockers` (doors, furniture, acoustic slabs — all click-solid so notes land on bare wall only). `voids` are no-post rects (doorways, panels, signs); the DB `notes.wall` check constraint must list every wall id (bedroom: `back/west/east`, boat: `boat_*`). Notes are room-scoped by `refreshNoteVisibility()` in main.js. De-overlap is a deterministic spiral in notes3d.js sorted by `created_at`.

### Data layer — store.js

Dual mode: Supabase when `config.js` has keys, otherwise localStorage + BroadcastChannel ("local mode"). Everything privileged goes through **security-definer RPCs** with `set search_path = ''` (so pgcrypto is `extensions.crypt`) and IP rate limits via `private.post_log` with prefixed keys. Realtime: postgres_changes (notes, cat, scores, room_state) + presence channel.

### Presence — presence.js

One channel (`metro-presence`) carries: `pose` (now includes `y` for zero-g), `note` (piano), `act` (curtains/closet/dimmer/pet/volca/disc/goal/chat-adjacent shared actions), `chat`, `arcade` (2P game lockstep). Local mode mirrors all of it over BroadcastChannel. Ghost rendering/smoothing is ghosts.js.

### Audio — ambience.js

Pure WebAudio, no files. Everything routes through a master gain → DynamicsCompressor (anti-pop). Envelope rule: true-zero linear attack, exponential decay, linear tail to 0, scheduled 5 ms ahead. **Sound is room-scoped in main.js**, not here: `bedroomSound()` wrapper + `inBoat`/`inArena` gates; crossing a portal must silence the room you left (`setRoomTone`, `setWater`, `setThruster`).

### Glue — main.js

Boot, raycast target list in `castAt()`, all click handling + aim tips, modals, room transitions (instant: `modalOpen` guard around `prompt()`, then fade + `safeLock()`), disc simulation, cat HUD, flight strips (planes.js → airplanes.live; OpenSky/adsb.lol are NOT CORS-open), chat, admin mode at `/#admin`.

## Supabase / secrets

- `supabase/*.sql` are idempotent, paste-into-SQL-Editor migrations. `supabase/EVERYTHING.local.sql` (gitignored) is the concatenation of all pending migrations **including the real Discord webhook** — regenerate it with `cat cat.sql inbox.sql arcade.sql site.sql discord.local.sql > EVERYTHING.local.sql` after editing any part. Never commit `*.local.sql`; the repo is public.
- The anon key in `assets/js/config.js` is fine to ship; the service_role key never is. (The user has previously pasted the wrong one — check which key you're given.)
- New event types must be added to the `events` table check constraint in `site.sql` before `store.logEvent()` can use them; same for new wall ids in the notes constraint.

## Conventions

- Plain JS, no TypeScript. Comments are lowercase-casual and explain *why*, in the voice of the room ("the sea has rules").
- Large world.js edits are done with python heredoc splices against unique anchor comments (e.g. `/* --- dust --- */`) — keep those anchor comments intact.
- Commit messages: a short imperative title, then a bulleted story of what changed and why; deploys happen on every push to main, so each commit should leave the site working.
