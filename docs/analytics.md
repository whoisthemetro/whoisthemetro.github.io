# Analytics (PostHog)

Client-side product analytics for THE METRO. It's an **exploration/interaction**
world, so we measure *spaces and interactions* — what people do, where they
linger, and what makes them stay vs. leave — not a conversion funnel.

It's **env-gated**: with no key in `config.js` it's a complete no-op (clean local
dev). There's no backend and no build step — the key lives in `config.js` like the
Supabase anon key, and deploy is just `git push` (GitHub Pages).

## Turn it on (one-time)

1. In your PostHog account, create a **new Project** for this site (separate data).
2. Copy its **Project API key** (starts with `phc_…` — safe to publish).
3. In `assets/js/config.js` set:
   - `POSTHOG_KEY: "phc_…"`
   - `POSTHOG_HOST` to your project's region — US `https://us.i.posthog.com`
     or EU `https://eu.i.posthog.com` (must match, or events 401).
4. Commit + `git push origin main` (GitHub Pages redeploys; no rebuild).
5. Verify in PostHog → **Activity** (live event feed). In the browser console you
   can also run `METRO_DEBUG.analytics()` to see the recent events buffer.

**Session Replay** (recommended): enable "Record user sessions" in the PostHog
project settings and set **sampling** there (e.g. 20–50%). We already pass
`maskAllInputs: true` so typed text (chat, notes, names) is masked. Note: replay
records the DOM/overlays (HUD, chat, picker) — the **WebGL 3D view itself is not
recorded** by default (canvas recording is heavy and left off for smoothness), so
replay is most useful for UI/timing, not watching people move in 3D.

## Events

All are aggregated/throttled by the callers — never per-frame or per-note.

| Event | When | Props |
|---|---|---|
| `$pageview` | auto, on landing | (PostHog default) |
| `world_loaded` | first rendered frame | `loadSeconds`, `device` (mobile/desktop) |
| `world_load_failed` | an uncaught boot error before load | `reason`, `device` |
| `session_engaged` | first real interaction (2nd room OR any item) | `device` |
| `room_entered` | entering a space | `room` |
| `room_exited` | leaving a space | `room`, `dwellSeconds` |
| `elevator_used` | riding the lift | `from`, `to` |
| `item_interacted` | using an interactive | `item`, `room` |
| `note_left` | posting a note | `room`, `kind` |
| `instrument_played` | **on stop** (2.5 s idle) | `instrument`, `notes`, `seconds` |
| `arcade_game_opened` | launching a cabinet | `game` |
| `arcade_game_ended` | closing the cabinet | `game`, `seconds` |

- **Rooms**: `bedroom`, `arcade`, `desi` (boat), `crew` (zero-g arena), `venue` (club).
  Tracked centrally from the player's position + room flags, so walking, portals,
  and the elevator all register.
- **Items** currently sending `item_interacted`: `mirror`, `bartender`, `cat`,
  `dimmer`. Instruments report via `instrument_played` instead. Easy to extend —
  call `aItem("name")` in any click branch in `main.js`.

## Analyses to set up in PostHog

- **Engagement / bounce**: funnel `$pageview` → `world_loaded` → `session_engaged`.
  Cross-reference `loadSeconds` vs. drop-off (slow mobile load is the #1 silent bounce).
- **Room popularity & paths**: breakdown of `room_entered` by `room`; PostHog
  **Paths** on `room_entered` for the routes through the world.
- **Dwell time**: average `dwellSeconds` per `room` (what holds attention).
- **Interaction mix**: counts of `item_interacted` / `instrument_played` /
  `arcade_game_*` by their props — what's fun vs. ignored.
- **Arcade**: `arcade_game_opened` → `arcade_game_ended` completion + avg `seconds`.
- **Drop-off**: last `room_entered`/event before sessions end = where people leave.

## Not yet instrumented (easy follow-ups)

- `note_read`, more `item_interacted` coverage (radios, mixer, blinds, lava lamp,
  smoking corner, computer, pool/darts), and a `score` / `high_score` on
  `arcade_game_ended` (wire via the arcade `setScoreHook`).
- Optional: a reverse proxy under the site's own domain so ad-blockers drop fewer
  events (3D/gamer audiences block more).

## Implementation

- `assets/js/analytics.js` — the env-gated wrapper: `initAnalytics()` loads PostHog
  only when a key is set; `track(event, props)` is always safe and also keeps a
  small in-memory ring (`METRO_DEBUG.analytics()`).
- `assets/js/main.js` — `initAnalytics()` at boot; the `a*` helpers
  (`aSetRoom`/`aRoomNow`/`aItem`/`aInstrument`/`aEngage`/`aWorldReady`) and the
  event calls at each site.
