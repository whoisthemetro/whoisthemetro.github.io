# Babylon cat Tamagotchi — port the needs/care system into the bedroom

**Date:** 2026-06-27
**File:** `assets/js/babylon-bedroom.js`, `babylon/index.html`
**Branch:** `babylon-migration`

## Goal

The Babylon bedroom cat currently only wanders + pops hearts on click. Port the
three.js room's cat **needs/care** system so it "works like before": the cat gets
hungry / thirsty / needs the litter on shared timers, self-acts on its bowls (drawing
them down), and the visitor refills them. In-world bowls + a small HUD, per the user.

## Why it matters

It's the soul of the room's cat — the existing wander rig is just a body. The data
model + persistence already exist and are battle-tested in `store.js`; we reuse them
verbatim so behavior matches the live site exactly (and stays in sync per-browser).

## Approach — reuse `store.js`, don't reinvent

- `import { store } from "./store.js"` and use `store.getCatState / catCare / decayCat /
  onCatState`. **Do NOT call `store.init()`** → `mode` stays `"local"`, so it uses the
  `metro.catstate` localStorage path + BroadcastChannel, exactly like the room's notes
  (which are also local-first for now). Same key as the live site → shares the cat in
  one browser. If the room later goes online for notes, the cat upgrades to the shared
  Supabase cat for free.
- `decayCat(s)` is pure; it derives `food/water/litter/pets/hungry/thirsty/bathroom/
  fed/hydrated`. No passive decay — the cat draws bowls down by acting on its timers.

## Pieces

1. **State + wiring** (near `catState`, ~L1173)
   - `let catRaw = null, catNeeds = store.decayCat(null);`
   - `applyCatNeeds(s)`: store raw, `catNeeds = decayCat(s)`, `updateCatHUD()`, `updateBowls()`.
   - boot (after `loadCat`): `applyCatNeeds(await store.getCatState())`, then
     `store.onCatState(applyCatNeeds)` + `setInterval(()=>catRaw&&applyCatNeeds(catRaw), 60000)`
     to re-check the timers.

2. **In-world care station** — REUSE the existing CAT CORNER meshes (L1115), do NOT
   build new ones (the scene already had `foodBowl`/`waterBowl` via `bowl()`, a `litter`
   box with `sand`, and a treat jar):
   - `bowl()` gains a `kind` arg → tags dish+fill `_careBowl`, captures the fill cyl
     (`_botY`/`_h` to anchor it as it drains), and registers `careBowls[kind]`.
   - Litter: tag the tray + `sand` meshes `_careBowl="litter"`, add a few soiled clump
     spheres (hidden until dirty), register `careBowls.litter = {pivot: litter, fill: sand, clumps}`.
   - Treat jar tagged `_careBowl="treat"` → click it (or T) to treat.
   - `updateBowls()` drains the food/water fill cylinders (scale.y + anchored y) by level,
     darkens the sand `diffuseColor` (white→dirty) and toggles clumps by `litter`.
   - NOT editables (kept the originals' fixed corner placement).

3. **Care actions** — `handleCare(kind)` mirrors `main.js` thresholds:
   - food (refill if <0.6), water (<0.7), clean (litter>0.15), treat (≤ per-6h cap via
     `catCare("treat")`'s own guard). `flashHint` for feedback. `await store.catCare(...)`
     → `applyCatNeeds(res)` (also arrives via `onCatState`, idempotent).

4. **Click + key wiring**
   - pointer handler (~L2034): pick `_careBowl` first → `handleCare`. Cat pick →
     `store.catCare("pet")` + `popHearts()` + "purrr — petted N times".
   - keydown `KeyT`: `handleCare("treat")` → cat lured toward a point near the player.

5. **Self-acting cat** — in `updateCat`:
   - throttled need-check (~2s) when idle: if `hungry && food>0.05` → chore `eat`
     (walk to food bowl); else `thirsty && water>0.05` → `drink`; else `bathroom` →
     litter. Target = live bowl world pos offset ~0.4 toward room center.
   - on arrival with a chore: `store.catCare("eat"|"drink"|"bathroom")` → `applyCatNeeds`,
     short dwell. Empty bowl is gated out (matches old `eat`/`drink` failing on empty);
     HUD shows the "bowl empty!" warning, `fed/hydrated` drain — "the room let it down".

6. **HUD** — `#cat-hud` div in `babylon/index.html` (CSS like `#badge`), `updateCatHUD()`
   writes `fed % · hydrated % [· litter %] [· bowl empty!]` with crit/low coloring.

## Verification

- `for f in assets/js/*.js; do node --check "$f"; done` clean.
- `python3 -m http.server 8123` → http://localhost:8123/babylon/ ; enter the room.
- Puppeteer/manual: poke `window.METRO_BJS` — drive timers via localStorage `metro.catstate`
  (set `hungry_at` in the past) and confirm the cat walks to the food bowl, the kibble
  drops, and the HUD updates. Refill by clicking the bowl. Pet the cat → hearts + count.
- Headless gotchas: camera Y is force-locked to 1.62 each frame (frame bowls from eye
  height or temporarily defeat the lock); generic GLB mesh names collide (we build bowls
  procedurally so no `getMeshByName` clash).

## Open questions

- Treat lure: reuse a temporary cat spot vs a dedicated lure target (going with a lure target).
- Whether to also animate the cat "eating" (head dip) — nice-to-have, skipped for v1.
