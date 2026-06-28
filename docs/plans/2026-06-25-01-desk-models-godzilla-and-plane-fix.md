# Desk model upgrades, a 3D exterior (Godzilla + city + jet), and the plane/flight fix

**Date:** 2026-06-25 · **Branch base:** `babylon-migration` · **Scene:** `babylon/index.html` + `assets/js/babylon-bedroom.js`

## Goal

Swap a set of desk props for new (user-supplied Sketchfab) GLBs, add two new desk props
(Mac Studio, clock), build a **real 3D exterior** beyond the window (low-poly city + Godzilla
+ a flying Boeing 737), and fix the "no planes / no flight strip" bug so the window comes
alive again.

## Why it matters

The desk is the hero shot of the bedroom. Right now Mac Studio is a plain silver box, the
keyboard/mouse/mug are stand-in CC0 models, and the world outside the glass is a flat painted
canvas. The user wants the desk to read as *their actual setup* and the window to be an event
— a city with Godzilla stomping through it and jets on the LAX approach. And the plane/flight
feature, which already exists, currently shows nothing.

## Assets (user is downloading these from Sketchfab → `assets/models/`)

Drop-in filenames the code will expect:

| Sketchfab model | File to place | Replaces / status |
|---|---|---|
| Apple Mac Studio | `macstudio.glb` | replaces `box("mac")` primitive |
| Ultrawide monitor w/ desk mount | `ultrawide2.glb` | replaces `ultrawide.glb` |
| Alarm clock | `clock.glb` | **new** |
| Blender mug | `mug3.glb` | replaces `mug2.glb` |
| Apple Magic Keyboard | `kbmagic.glb` | replaces `kbapple.glb` |
| A4Tech Bloody V7 mouse | `mouse2.glb` | replaces `mouse.glb` |
| Boeing 737 | `plane.glb` | **new** (3D, ext. scene) |
| Godzilla | `godzilla.glb` | **new** (3D, ext. scene) |
| Low-poly city buildings | `city.glb` | **new** (3D, ext. scene) |

> **Licensing gate (do before ship):** most of these are Sketchfab CC-BY (some may be
> CC-BY-NC or paid). The site is public (whoisthemetro.com). For each model confirm the
> license permits use on a public, non-commercial personal site, and capture author + license
> + URL for the on-screen credits line (`#credits` in `babylon/index.html`). Do not ship a
> model whose license forbids it — substitute or drop it and flag the user.

## How it fits the existing architecture

- **GLB pipeline already exists.** `importGLB(file)` loads from `/assets/models/`, computes
  `_naturalMax` for uniform fit-scaling, and registers shadow casters. `loadDeskProps()` has a
  `place(file, key, target, x, z, ry, hide=[], rx, tint)` helper that parents to `desk`, rests
  the model on the desk top (y 0.74), hides the named primitives it replaces, and stores the
  result in `deskProps[key]`. The simple swaps reuse this verbatim.
- **The monitor is special.** `loadMonitors()` maps the live DAW/slideshow `monScreen`
  DynamicTexture onto the GLB's panel by measuring its bounding box. Swapping the ultrawide
  means re-tuning that screen-fit math, not just the filename.
- **The exterior is 2D today.** `drawSky()` paints sky + sun + moon + skyline + the jet onto
  `skyTex`, drawn on the window glass plane; the render loop repaints it as the jet animates.
  A 3D exterior is a new subsystem — see Phase 5 and Open Questions.
- **Plane feed.** `planes.js` `startPlanes(onFlyover, onLiveChange)` polls `airplanes.live` and
  calls `triggerPlane(dir)` + `showFlightStrip(info)`. Ambient fallback (`nextPlaneAt`) is
  declared in `babylon-bedroom.js` but **not consumed** — likely the whole bug.

## Phases

### Phase 1 — simple desk-prop swaps (low risk)
In `loadDeskProps()`, repoint and re-tune the three existing `place(...)` calls:
- `kbapple.glb` → `kbmagic.glb`; drop the aluminium `tint` (Magic Keyboard already white);
  re-tune `target`/`ry`/`rx` to sit flat in the typing area.
- `mouse.glb` → `mouse2.glb`; re-tune scale + the `-Math.PI/2` lay-flat rotation for the new mesh.
- `mug2.glb` → `mug3.glb`; re-tune scale; keep front-left position; verify the `["mug","coffee"]` hides still apply.
Verify each rests on the desk and is sized sanely; arrange-mode (drag/rotate/scale) still works.

### Phase 2 — Mac Studio + clock (new props)
- Replace `box("mac", …)` (line ~472) — either hide it via the `place()` `hide` list or remove
  the box — and `place("macstudio.glb", "mac", …)` at desk-local `(0.66, -0.18)`.
- **Dependency:** `loadMonitors()` rests the portable `tablet.glb` on the Mac at hardcoded
  `y 0.835`. After the real Mac Studio loads, recompute that rest height from the Mac's
  bounding box so the tablet still sits on top.
- `place("clock.glb", "clock", …)` — pick a home (recommend desk back-left, or a shelf);
  small `target` (~0.12). New entry, no primitive to hide.

### Phase 3 — ultrawide monitor swap (fiddly: live screen)
- In `loadMonitors()`, `ultrawide.glb` → `ultrawide2.glb`. Re-measure the panel bounding box
  and re-fit `monScreen` (the DynamicTexture slideshow/DAW plane) onto the new panel: redo
  `sw/sh/cx/cy/panelBot/top` and `_panelZ`. This model has its own desk mount — may change the
  desk footprint and the screen tilt; re-tune position/rotation. Keep `applyScreenDepth()`.

### Phase 4 — fix planes / flight strip (the bug)
- Confirm root cause: instrument `planes.js` `poll()` — is `airplanes.live` returning data, or
  throwing (CORS / 403 / rate-limit / endpoint moved)? The CLAUDE.md notes OpenSky/adsb.lol are
  not CORS-open; airplanes.live may have changed.
- Implement the **ambient fallback** that's currently missing: in the render loop, when
  `!livePlanes`, count down `nextPlaneAt` by `dt`; on hit, `triggerPlane(rand dir)` + a
  synthetic `showFlightStrip` (plausible flight no./type/alt/label), then reset `nextPlaneAt`.
  This guarantees planes even with the API down.
- If the API is salvageable, fix the fetch; otherwise lean on ambient and/or a proxy.
- Verify: a jet crosses the glass within ~1–2 min of entering; the flight strip slides in.

### Phase 5 — 3D exterior: city + Godzilla + jet (the big one)
Decision-dependent (see Open Questions). Assuming the **real-3D-exterior** route:
- Build an exterior group positioned beyond the window plane (`ZF`), outside collision, lit so
  it reads through the glass. Decide how it coexists with the painted `drawSky` skyline (likely
  keep `drawSky` for sky/sun/moon gradient + atmosphere, drop or push back its 2D towers).
- `city.glb`: lay out / scale the low-poly city across the view; add ground/haze so edges
  aren't visible at steep angles (cf. the boat "seabox ≥56 m" rule).
- `godzilla.glb`: place among the buildings at scale; optional slow idle/stomp animation.
- `plane.glb`: a 3D jet flying the approach path across the window, driven by the same
  `triggerPlane`/flight timing from Phase 4 (retire or layer over the 2D `drawJet`).
- Mind three.js→Babylon lighting rules from CLAUDE.md (directional lights aren't scoped;
  contain with spot/point + distance) so the exterior doesn't leak light into the room.

### Phase 6 — credits, attribution, verify
- Update `#credits` in `babylon/index.html` with author + license for every new model.
- `for f in assets/js/*.js; do node --check "$f"; done` (the project's only lint).
- `python3 -m http.server 8123` and visually verify: desk props seated/oriented; arrange mode
  intact; monitor screen still live; planes + flight strip appear; exterior reads through glass
  with no visible edges or light leak. Read screenshots — regressions here are visual.

## Verification

No build/test framework. "Passing" = `node --check` clean on all JS, the local server renders
the bedroom, and a screenshot pass over the smoke checklist above looks right. Per project
convention, a review agent reviews the diff before shipping; ship = PR/merge into
`babylon-migration` (not a fresh feature branch off main — this is migration work).

## Open questions / decisions

1. **Exterior approach (blocks Phase 5).** Real 3D exterior beyond the glass (recommended,
   matches intent, heavier) vs. keep the 2D painted approach (GLBs don't fit it). Confirm 3D.
2. **Godzilla scene tone** — static menace, slow idle, or animated stomp? Any destruction/FX?
3. **Keep the 2D `drawJet`** as a far-distance fallback, or fully replace with the 3D
   `plane.glb`? (3D plane needs Phase 4's timing regardless.)
4. **Clock home + behavior** — desk vs shelf; does it show real local time on its face?
5. **Any model whose license fails the gate** — substitute, or drop and tell the user?
