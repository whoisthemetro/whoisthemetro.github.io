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
| The cat's corner, dimmer, mix & master neon | 5812–5998 | `cat.js` |
| **THE ARCADE** — the hall itself, lighting, floorplan, elevator | 3460–3970, 4344 | — |
| The smoking corner + its scanned props | 3578–3740, `swapProp` @4271 | `assets/models/{bong,ashtray,joint}.glb` |
| The marquee / high scores | 3741 | `main.js` (`refreshScores`), `store.js`, `supabase/arcade.sql` |
| The arcade cabinets (GLB swap) | `swapCabinetModel` @4196 | `arcade.js` |
| The basketball court + the fire | `hoops` IIFE @4753 | `basketball.js`, `main.js` 1094 |
| The pool tables | `buildPool` @4473 | `pool.js`, `main.js` 1017 |
| **THE DESI** (boat) | 5998–6670 | `astro.js`, `main.js` 2204 |
| **THE CREW** (zero-g arena) | 6672–7090 | `xr.js` (`stepZeroG`), `main.js` 3169–3450 |
| **THE CLUB / VENUE** | 7569–7900 | `main.js` 2723–3160, `screen.js`, `stream.js` |
| **THE GYM** (full court) | 8571–8970 | `gymball.js`, `main.js` 3455–3820 |
| **THE STUDIO** | 9002 (mount point only) | `studio/*.js`, `docs/studio.md`, `main.js` 2210–2570 |
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
| Movement, collision, look, aim-lock | `controls.js` |
| Sound | `ambience.js` |
| The sequencer room | `assets/js/studio/*`, `docs/studio.md`, `tools/mi/` for the wasm |
| Shader art on the slabs | `shaderart.js` (+ `PANEL_SHADERS` in world.js) |
| The cat | `cat.js` |
| The bartender | `bartender.js` |
| Notes on the wall | `notes3d.js`, `store.js` |
| Avatars / other people | `avatar-glb.js`, `ghosts.js`, `avatar-builder.js` |
| Presence + netcode | `presence.js` |
| Voice chat | `voice.js` |
| Data, DB, RPCs, rate limits | `store.js`, `supabase/*.sql` |
| Flight strips | `planes.js` |
| Screen share / streams | `screen.js`, `stream.js` |

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
