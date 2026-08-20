# THE MAP — one job, one chat

This file exists so a **fresh chat can find its 200 lines without reading
14,000.** `world.js` (9.2k lines) and `main.js` (4.8k) hold 43% of the
codebase between them, and almost every job touches a slice of one or both.
Grepping for that slice from cold costs real context; this is the index that
skips it.

## How a job chat runs

1. `CLAUDE.md` loads on its own — that's the brief, and it's deliberately
   short (~90 lines) so every chat can afford it. **Don't grow it with things
   only one job needs.** That's what this file is for, and this file is only
   opened by the jobs that need it.
2. Find your row below. Open **those files only**.
3. Do the job. Run the server, take screenshots, read them.
4. **Before the chat ends, write down anything hard-won.** A rule the room
   taught you goes in CLAUDE.md's three.js section; what changed and why goes
   in CHANGELOG.md. This is the whole reason a fresh chat is safe here — the
   next one starts from the written record, not from a transcript nobody has.

Rule of thumb: if a job needs more than about three rows of this table, it's
two jobs.

## Rooms — these live inside `world.js`'s `buildWorld()`

`buildWorld()` is one long function; the rooms are regions of it, marked by
`/* --- ... --- */` anchor comments. Those anchors are also the splice points
for python-heredoc edits, so **leave them intact.**

| Job | world.js | also |
| --- | --- | --- |
| Outside the window — LA, sky, mountains, traffic, Hollywood sign | `makeOutside()` @717, rings/street/buildings through ~1360 | — |
| The bedroom shell, doors, closet, acoustic slabs | 1533–2530 | — |
| The window, room light, astro ceiling | 2527–2920 | `astro.js` |
| Instruments — e-kit, telecaster, pedalboard, filter treadle | 2957–3375 | `main.js` 1933–2143, `ambience.js` |
| The desk rig — mixer, monitors, rack, lava lamp, radio | 5288–5760 | `main.js` 1933–2010, `radio.js` |
| The MIDI keyboard, its PLAITS voice + the panel over it | the `midiKeys` block @6637 (chassis, keybed, button, panel mount) | `synth-panel.js` (all of the UI, the scales, the layout), `ambience.js` (`initPlaits`/`plaitsNote`/`setPlaits`, `PIANO_VOICES`), `main.js` (`synthPress`, `arpTick`, `applySynthHit`, the knob drag) |
| The cat's corner, dimmer, mix & master neon | 5812–5998 | `cat.js` |
| **THE ARCADE** — the hall itself, lighting, floorplan | shell @3784, lights @3860, floor plan @4807, bar @4850 | — |
| The arcade elevator | @4296 | `main.js` (room transitions) |
| The arcade bathroom — three bays back through its south wall | `BATH`/`BPX1,2` + door cut @4309, room + fittings @4461 | — |
| …its mirrors (shared planar reflection + the body you see in them) | `REFL`/`drawReflection` @4899, `bathSelf` @5066 | `main.js` (`setMirrorSelf`, `world.bath.pose`) |
| …the graffiti on its walls | `tags.addSurface` calls through the bathroom block | `graffiti.js`, `main.js` (tag mode, `scrubWall`), `supabase/site.sql` (flag whitelist) |
| …its ceiling speaker + the radio DJ between songs | `bath.distance` | `ambience.js` (`startBathMusic`/`setBathMusic`/`loadDJ`), `djlines.js`, `tools/voice/render-dj.mjs`, `assets/audio/{muzak,dj}/` |
| …(the muzak loop itself) | `bath.distance` | `ambience.js` (`loadBathMusic`/`startBathMusic`/`setBathMusic`), `assets/audio/muzak/` |
| …its toilets + the tiled-room reverb | `bathHits` on the toilet builder | `ambience.js` (`bathroomSend`/`loadFarts`/`fart`), `voice.js` (`setSpeakerBath`), `assets/audio/farts/` |
| The smoking corner + its scanned props | @3906, `swapProp` @4740 | `assets/models/{bong,ashtray,joint}.glb` |
| The marquee / high scores | @4069 | `main.js` (`refreshScores`), `store.js`, `supabase/arcade.sql` |
| The arcade cabinets (GLB swap) | `cabinet()` @4517, `swapCabinetModel` @4665 | `arcade.js` |
| The basketball court + the fire | `hoops` IIFE @4753 | `basketball.js`, `main.js` 1094 |
| The pool tables | `buildPool` @4473 | `pool.js`, `main.js` 1017 |
| **THE DESI** (boat) | 5998–6670 | `astro.js`, `main.js` 2204 |
| **THE CREW** (zero-g arena) | 6672–7090 | `xr.js` (`stepZeroG`), `main.js` 3169–3450 |
| **THE CLUB / VENUE** | 7569–7900 | `main.js` 2723–3160, `screen.js`, `stream.js` |
| **THE GYM** (full court) | 8571–8970 | `gymball.js`, `main.js` 3455–3820 |
| **THE STUDIO** | 9002 (mount point only) | `studio/*.js`, `docs/studio.md`, `main.js` 2210–2570 |
| **THE GARDEN** — the listening path (Metro's sound design) | mount point only, just before `WALK_RECTS` | `garden/room.js` (the beds), `garden/player.js` (streaming audio), `garden-catalog.js` (generated), `tools/garden/` (encode + R2), `main.js` (the garden block + `music` in `TERM_COMMANDS`) |
| Room culling, walkability, collision | `bucketRoomGeometry` @7101, `WALK_RECTS` @8939, `NO_WALK` @1451, `isWalkable` @8964 | `controls.js` (`_slide`), `xr.js` |
| Ambient life — dust, arcade air, carpet grime, vacuum | 7138–7400 | — |
| The cel-shading pass | 8972 | read the material trap in CLAUDE.md first |

## Mechanics — these have their own file, so the job is that file

| Job | Files |
| --- | --- |
| Arcade games (defender, pac, tron, pong) | `arcade.js` |
| Pool / 8-ball rules | `pool.js` |
| Arcade basketball | `basketball.js` |
| Gym basketball | `gymball.js` |
| VR — anything | `xr.js` (+ the room's own file) |
| A headset visitor's BODY as peers see it (arms, head) | `xr.js` (`vrPose`, `trackBody`), `avatar-builder.js` (`arms`/`headPivot`/`bones`), `ghosts.js` (`driveJoints`), `presence.js` (`VR_KEYS`) |
| VR — a panel/overlay that must work in a headset | `vrui.js` (in-world windows), `main.js` `openVRRadio`/`openVRPC`/`openVRPicker`. DOM is invisible in a session: give it a window here rather than another `vrBlocked` |
| Shader art on the walls / its cost | `shaderbake.js`, `shaderart.js`, world.js `makeToy` + `PANEL_SHADERS` @2657 |
| Lighting cost / the light slots | `lightpool.js`, `main.js` ~181 (pool creation + `applyLightCull`), ~5486 (the per-frame refill) |
| Movement, collision, look, aim-lock | `controls.js` |
| Sound | `ambience.js` |
| The sequencer room | `assets/js/studio/*`, `docs/studio.md`, `tools/mi/` for the wasm |
| Shader art on the slabs | `shaderart.js` (+ `PANEL_SHADERS` in world.js) |
| The cat | `cat.js` |
| The bartender | `bartender.js` |
| The guide (bedroom tutor) | `guide.js`, `say.js` (the voice), `lines.js` (everything she says), `main.js` ~475 (placement) |
| …re-rendering her voice | `tools/voice/render.mjs` — just run it, it finds its key in `~/.config/metro/voice.env` |
| Notes on the wall | `notes3d.js`, `store.js` |
| METRO OS (the desk computer) + the visitor changelog | `whatsnew.js` (the copy), `main.js` `TERM_COMMANDS`, `#pc` in index.html |
| Getting a track into the garden (encode, loudness, waveform, R2) | `tools/garden/encode.mjs`, `tools/garden/README.md` |
| Avatars / other people | `avatar-builder.js` (the figure + hair), `ghosts.js`, `picker.js` (the chooser), `main.js` ~670–860 (podium figure, drag-to-spin, `openPicker`) |
| **THE PODIUM** — the avatar creator in the arcade's far corner | `POD` block just before the MARQUEE anchor | `main.js` ~700–930 |
| Presence + netcode | `presence.js` |
| Voice chat | `voice.js` |
| Data, DB, RPCs, rate limits | `store.js`, `supabase/*.sql` |
| Flight strips | `planes.js` |
| Screen share / streams | `screen.js`, `stream.js` |

## The bedroom and the arcade are ONE space

Every other room in this world is far away and culls itself. These two share
a doorway, so an arcade job can break the bedroom and vice versa. That isn't
a thing to fix — being able to see the arcade through the door is the point
— but it IS a short, finite list, and it's the whole reason a fresh chat on
one of them should read this:

1. **`isWalkable`.** The passage rect deliberately OVERLAPS both room rects
   (world.js, `WALK_RECTS`) so there's no dead strip at the threshold. Shrink
   either room's rect and you can get wedged in the doorway.
2. **`world.arcadeDoor`** is the threshold waypoint the guide steers for.
   Move the opening and she walks into brick until her stuck-timer blinks her.
3. **Light throw.** Arcade point lights must not reach the bedroom — keep
   their `distance` shorter than the gap (see the three.js rules in
   CLAUDE.md). Brightening an arcade lamp can light a bedroom wall.
4. **Cull scope.** Both rooms are the SAME scope (`home`); neither culls the
   other, and LA is visible from both. Nothing you add to one disappears in
   the other.
5. **The toon pass** runs over everything at the end of `buildWorld()`, both
   rooms included.
6. **Trinity** has a POST in each room (`GUIDE_POSTS` in main.js) and crosses
   the doorway to it when you do — she does not follow you around inside a
   room. Move arcade furniture and you may have moved it on top of her; the
   arcade post was chosen by sweeping the floor for clear air around every
   clickable (`/tmp/metro-smoke/guidespot.js`). She keeps a separate arcade
   line pool in `lines.js` too — new arcade features probably want a line.
7. **The bartender** lives in the arcade but is ticked whenever you're not in
   boat/arena/club/gym — so he's running while you're in the bedroom.
8. **`inArcade()`** (`arcadeZoneLevel >= 0.5`) gates the bedroom's instrument
   sounds so they don't carry through the wall, and picks Trinity's pool.
9. **`castAt`** is ONE shared raycast target list in main.js. Adding an
   arcade clickable edits the same line the bedroom's clickables live on.
10. **Draw calls** are one budget, and the window city is visible from the
    arcade doorway.

## What a job chat still has to know

Some things bite regardless of which job you're on, and they're already
written down — don't relearn them:

- The **three.js rules** in CLAUDE.md (light layers, the toon pass replacing
  materials, particle pools and cull buckets, z-fighting, render targets in
  XR). Every one of these cost a session to find.
- **Deploying** is `git push origin main`; verify with `curl | grep`. Never
  re-run the Pages workflow.
- **Syntax check** after every edit: `for f in assets/js/*.js; do node --check "$f"; done`
- **Smoke tests** live in `/tmp/metro-smoke/` and are disposable. Most
  regressions here are visual — take the screenshot and actually look at it.
