# CHANGELOG

what changed in the room, newest first. every push to main goes
straight to whoisthemetro.com, so each line here shipped the day
it says it did.

## THE GARDEN — a listening path for the sound design

`music` at the desk computer stopped being a stub. It's a door now: it walks
you out to a gravel path with a raised soil bed either side, and every track in
the catalog grows out of one of those beds as a row of reeds whose heights ARE
that track's waveform. Click a plant to play it, click it again to stop.

Why a room and not a jukebox: a list of tracks is a scrollbar, and it gets
worse the more music you make. A path gets longer. The beds size themselves off
the catalog, so planting the fortieth track is a metre and a half more path and
no UI decision. And the venue keeps its own job — hosting a night, with
`set_dj` and the booth and the big screen — instead of being repurposed into a
worse browser. The catalog is plain data, so the decks can pull from it later.

- **`assets/js/garden/room.js`** — the beds. 256 peak buckets per track come
  down to 64 reeds, merged into ONE BufferGeometry per plant (every
  material-group is a draw call; 64 reeds have to arrive as one buffer). The
  row is also the playhead: reeds behind the position go warm, ahead stay dim,
  rewritten a slice at a time when the head crosses a reed — 64 writes a track,
  not per frame. So you can read how far into a piece someone is from the other
  end of the path. The whole room is 42 draw calls.
- **`assets/js/garden/player.js`** — streaming, NOT `decodeAudioData`. A
  ten-minute track decoded to an AudioBuffer is 230 MB of float32 and makes no
  sound until the whole file has downloaded; an `<audio>` element range-requests
  and starts in about a second. One element reused for the whole garden (a
  MediaElementAudioSource is welded to its element for life). Each track is
  panned at its own plant, so walking the path is the crossfade — which meant
  pointing the AudioListener at the camera every frame, since nothing else in
  this world has ever used positional audio.
- **`tools/garden/encode.mjs`** — masters in, web audio out: two-pass EBU R128
  to −16 LUFS (`linear=true`, a gain change not a compressor), AAC 128k with
  `+faststart`, 256 peak buckets, catalog entry. `--demo` plants eight
  placeholder pieces of deliberately different shapes so the room could be
  built and walked before a real track existed.
- The audio is **gitignored and lives on Cloudflare R2** (10 GB free, zero
  egress). Not in the repo: git keeps every version of every file forever, and
  audio is the thing you re-master — removing it later means rewriting history
  and force-pushing `main`, which this repo forbids. Not Supabase Storage
  either: 5 GB/month egress is about 600 plays of a 10 MB track, total.
  `tools/garden/README.md` has the bucket + CORS setup.
- The garden is **gated shut until `GARDEN_BASE` is set** (localhost always
  open). A deploy landing before the bucket is wired up would otherwise put
  visitors on a path of plants that all fail to play. The `whatsnew.js` line
  goes in with that switch-on, not with this commit — until then there is
  nothing for a visitor to notice.

Five things the room taught us, all now in CLAUDE.md's three.js section:

- **The toon pass does not carry `vertexColors`.** It rebuilds every
  Lambert/Standard material from a fixed field list, and `vertexColors` isn't
  in it — so a base-to-tip gradient baked into a Lambert's colour attribute
  silently becomes a flat colour. The reeds are MeshBasic, which the pass skips.
- **A sky dome must write depth.** The bedroom and arcade are scope `home` and
  are never culled by anything, so they are always in the scene. A dome with
  `depthWrite: false` doesn't occlude, and the house rendered straight through
  the sky and sat on the garden's horizon 160 m away as a black silhouette.
- **`sizeAttenuation` on a Points cloud that can approach the camera.**
  World-sized points blow up: a firefly drifting past the camera filled a third
  of the screen with a cream square. Stars and motes want a fixed pixel size.
- **A new position-based room needs its cull test FIRST.** `bucketRoomGeometry`
  and `roomScopeOfPos` both classify by `z > 40 → gym`; the garden at z=160 was
  filed under the gym until its own `z > 120` test went in ahead of it.
- **Frequency-domain analyser bytes are a dB scale.** Taking their "RMS" for a
  level meter pegs at 1.0 on anything louder than a whisper, so the plant sat
  at full brightness and never breathed. `getByteTimeDomainData`, centred at
  128, is the actual amplitude.
## 2026-08-19 — 40 MB of models nothing was loading

Housekeeping, asked for directly. Worth being clear about what it does and
does not do: **the site was never fetching these, so this is not a speed
win.** It is a tidier tree and a smaller clone.

- `assets/models/` held 36 GLBs, 42 MB. The live world loads exactly **seven**
  — the four scanned arcade cabinets and the three smoking-corner props
  (world.js:5421-5427, the only two `GLTFLoader` call sites in the codebase).
- The other 29 (40 MB) were referenced only by **`assets/js/babylon-bedroom.js`**,
  the paused Babylon.js migration of the bedroom. **Nothing imports that file
  and no HTML loads it** — Babylon itself isn't even on the page. It is why
  every one of these looked "used" to a grep.
- Verified by watching the network rather than by reading code: on a full
  load the browser requests those seven GLBs, all 200, and asks for nothing
  else. Deleting files the page never requests cannot change what it draws.
- Removed with `git rm`, so every one of them is still in history and can come
  back with `git checkout <commit> -- <path>` if a model is ever wanted again.
- `babylon-bedroom.js` itself is LEFT IN PLACE — it is a paused migration, not
  a 3D asset, and that call isn't this job's to make. Flagged instead: 281 KB,
  dead, and now pointing at 29 files that no longer exist.

## 2026-08-19 — the wall art stops repainting the screen

Same day, same complaint: still choppy on a desktop. The lights were the
biggest single cost but they were not the only one.

- **Measure the thing you are actually running.** At dpr 1 the spawn view
  costs 3.0 ms. At dpr 2 — which is what any Retina Mac runs — it cost
  **19.4 ms, about 51 fps.** That is 6.5x for 4x the pixels, which is the
  signature of fragment cost, and it is invisible unless you measure at the
  pixel ratio the user actually has.
- **The acoustic slabs were being evaluated per SCREEN PIXEL.** Fourteen
  hand-written Shadertoy pieces, worn as materials on the slabs, so each one
  ran over every pixel it covered, every frame, forever. **47% of a frame at
  spawn.** The worst spot in the room was the desk: **61 ms, 16 fps**, because
  from there the gallery wall fills the view.
- None of that bought any visible detail. A slab is half a metre wide.
- **So each piece now paints its own small texture and the slab wears that**
  (`shaderbake.js`) — the same trick the KuKo rug already used. Cost stops
  scaling with resolution or with how close you stand, and becomes fixed.
  512 px tall on desktop, 256 on touch; at 288 the big east panel was
  visibly soft up close, and 512 was the point where an A/B at 1:1 pixels
  stopped showing a difference.
- Three limits keep it honest: it steps at **20 Hz** (generative art at 20 fps
  looks exactly as alive as at 120), at most **2 panels redraw per frame**
  round-robin so fourteen can never spike one frame, and **a panel you can't
  see doesn't redraw at all**. Every panel is painted once at build time so
  none is ever blank.
- **Get the radius right or you make it worse.** The first cut used 9 m, then
  18 m — and at 18 m the ARCADE got *slower* (4.26 -> 5.67 ms), because it was
  faithfully repainting bedroom panels from 12 m away through a doorway. The
  bedroom is ~8.5 m corner to corner, so 9 m keeps every panel live from
  anywhere inside it and dead from anywhere outside.
- The render target is tagged `SRGBColorSpace` so the trip through a texture
  encodes and decodes back to the same pixels. Verified against the live
  shader at 1:1 — the colours match.
- **Result at dpr 2:** spawn **24.2 -> 8.2 ms**, desk **61.3 -> 8.0 ms**,
  gallery **23.1 -> 8.5**, doorway **13.5 -> 6.6**, arcade **5.0 -> 4.5**.
  Every position in the room now sits inside the 120 fps budget. 0 shader
  recompiles, no page errors, and 9 of 15 panels repainting at any moment —
  the other 6 being exactly the ones behind you.

## 2026-08-19 — one bank of lights, refilled every frame

Desktop was asked to run smoother. It measured as light-bound, not
geometry-bound, and by a margin nothing else came close to.

- **The room was never CPU-bound.** A CPU profile of the live loop came back
  71.6% idle, and every non-idle entry in the top twenty was inside three.js's
  own renderer — not one function from world.js or main.js. Frame intervals
  sat on vsync at a flat 16.7 ms. By every measurement available from
  JavaScript the room was fine, which is why this went unfound for so long:
  the CPU submits the frame and walks away while the GPU falls behind.
- **GPU timer queries (`EXT_disjoint_timer_query_webgl2`) told the real
  story.** At a Retina pixel ratio, on an M1 Max, one frame took **46 ms —
  about 22 fps**. With every point and spot light hidden it was 2.25 ms. The
  bedroom+arcade carry **44 lights**, every lit fragment loops over all of
  them, and that was **95% of all GPU time**.
- Beware `gl.finish()` as a fence here: an earlier pass timed with it reported
  dpr 2 (6.9 Mpx) as costing the same as dpr 1 (1.7 Mpx), and a *fewer*-lights
  case as slower. It is not a real sync on this ANGLE/Metal backend. Timer
  queries are, and shader recompiles will still creep inside the timed window
  unless every material is re-rendered to completion first.
- **The fix could not be "switch lights off when they leave the view",**
  because changing the light COUNT recompiles every shader in the scene.
  Turning your head would stutter.
- **So the count never changes.** `lightpool.js` holds one fixed bank of slots
  (12 point + 12 spot on desktop, 8 + 6 on touch). Every frame the lights that
  actually matter are copied INTO those slots — position, colour, distance,
  decay, cone — and a slot nobody wants fades to zero and waits. Originals
  stay in the scene graph but are never drawn, so whatever animates their
  intensity or drags them around still works untouched.
- **Half of it is exact, not approximate.** A light with a finite `distance`
  physically cannot touch a fragment outside its own sphere, so any light
  whose sphere misses the view frustum is contributing nothing and dropping it
  changes no pixel. Only when more lights survive that test than there are
  slots does the pool start choosing.
- **Scoring saturates if you let it.** The first version ranked lights by
  `intensity x reach / d^2` with `d` clamped at 0.25 — so any light you were
  STANDING INSIDE divided by ~0 and scored off the scale. The arcade's twelve
  wide ceiling lamps took every spot slot, the podium's own spot went out, and
  the figure standing on it went flat grey. Ranking on apparent size with a
  floor under the divisor (`max(reach * 0.35, d)`) makes being inside a lamp
  worth about 3x instead of 16x, and the feature lights keep their slots.
- Slots are sticky: a light that keeps its slot never moves, and one that
  loses it dims out over 0.18 s rather than vanishing.
- **Result, same tree, same view, one session:** dpr 2 **46.0 ms -> 8.8 ms**
  (~5x, 22 fps -> 60 fps+), dpr 1 **9.6 ms -> 2.8 ms**. Verified **0 shader
  recompiles** across a full spin-and-walk of the whole space (87 programs
  before, 87 after), p99 frame 21.8 ms, 1 frame over 25 ms in 1196.
- Every other room fits entirely inside the slots (crew 8, desi 3, gym 6,
  venue/studio 5), so the pool is provably a no-op outside home.
- Side effect worth having: home now presents at most 12 point + 12 spot to
  the shader — **72 vec4 of light uniforms on desktop, 40 on touch, against
  the 217 that used to be the worst case** and the 256-vec4 Adreno cap that
  caused the see-through-walls bug on cheap Androids. That headroom is now
  enormous.

## 2026-08-19 — she goes quiet, the room notices

Follow-up the same day: with the synth locked out, she played one line and
then went silent for the rest of the visit on a phone. Three separate faults,
and the first one is the one that was actually killing her.

- **An AudioContext can stop without telling anyone, and iOS has a state the
  others don't: `interrupted`** — a phone call, another app taking the audio
  session, the screen locking. Nothing in the room ever checked. `resume()`
  is only allowed from a user gesture, so a context that stopped stayed
  stopped for the whole visit, accepting everything played into it and making
  no sound, reporting success the entire time. `wakeAudio()` (ambience.js) is
  now hung off any pointerdown/touchend: whatever you touch next brings the
  room back. say.js's own `wake()` checks for anything that isn't `running`
  rather than only `suspended`, and re-checks after the decode, since the
  context can go away underneath an await.
- **WebAudio nodes nobody holds a reference to can be collected**, and a
  collected node mid-chain is silence with no error. The source/gain/analyser
  chain is now kept in a variable and torn down explicitly — which also fixes
  a leak the first pass introduced, where every line left its analyser wired
  into the master bus forever. The element path matters more here than the
  buffer path: `createMediaElementSource()` is a one-way door on iOS, so a
  collected node there is an element that plays to nobody, permanently.
- **A mimed line with no card is indistinguishable from a broken guide.**
  `fx.silent()` asked a per-DEVICE question ("did any clips load?"), so a
  phone that loaded her takes fine but failed to play ONE got no card — she
  stood there moving her mouth in silence. It's asked per LINE now
  (`wasMimed()`), and her words appear for exactly the lines that didn't
  sound. Silence is only an acceptable failure if you can still read her.
- `METRO_DEBUG.say.diag()` reports clip count, context state, what's playing
  and why the last line didn't, and a line that fails to play now says so in
  the console instead of vanishing.
- `tools/voice/voicelock.mjs` grew the two cases: an interrupted context is
  woken rather than ignored, and a mimed line asks for the card.

## 2026-08-19 — her voice or nothing

- **The browser synth can no longer speak for Trinity.** Every line she has
  is rendered in her own voice (Lily), but a recording that failed to play
  fell through to `speechSynthesis` — so on a phone you could meet two
  different Trinitys in one conversation. Now a line that arrives with a clip
  id never reaches the synth at all: if the take can't be played she MIMES it
  instead, right rhythm, right duration, subtitles intact. Silence is a
  smaller lie than a stranger's voice.
- **Why it fired on phones and not desktops.** Her clips played through an
  `<audio>` element, and iOS only lets an element START inside a user
  gesture. By the time we'd awaited the manifest or a fetch, the tap that
  triggered the line was long gone, `play()` rejected, and the old code read
  that as "the file let us down". Clips now decode to buffers and play
  through the room's own graph — a `BufferSource` has no gesture rule once
  the context is running, which the [enter] tap already guaranteed.
- Buffered playback pays a bonus: the analyser sits on a real source, so her
  mouth and glow ride the actual syllables on every path, not just some.
- Decoded buffers are LRU-capped at 8 (decoded PCM is heavy and there are 43
  clips); the fetched bytes are shared, so two taps on the same line are one
  request. Both INTRO takes are warmed once the manifest lands, so the hello
  doesn't wait on the network on a cold cache.
- One retry 300 ms after a failed fetch, then the element as a second try,
  then mime. The retry is there because the real failure is a phone's network
  blinking, not a missing file.
- A line edited without re-rendering now warns in the console and mimes,
  rather than quietly getting said in the wrong voice.
- Her subtitle card now shows whenever the takes didn't load, instead of
  asking whether the device owns a synth — that question stopped mattering.
- Tests: `node tools/voice/voicelock.mjs` (no deps, stubbed browser) covers
  the four paths and is in the repo, and
  `/tmp/metro-smoke/trinityvoice.js` taps her in a phone-shaped headless
  Chrome with clip fetches broken and asserts `speechSynthesis.speak` is
  never called.

## 2026-08-18 — Trinity keeps a post instead of keeping up

She used to follow. Past two metres she'd abandon her spot and come after you,
and wherever she stopped became the new spot. That solved something real — a
guide bolted to one tile of the bedroom is no use the moment you walk into the
arcade — and created something worse: she was on your heels everywhere, which
means she was in the way everywhere. Between you and the wall you were reading.
Between you and the cabinet you were playing.

The fix keeps the half that mattered. **She has a post per room**
(`GUIDE_POSTS` in main.js), the room tells her which one when you cross over
(`guide.relocate`), and she walks there and stands there. Inside a room she
never moves toward you at all. You go to her, which is how it works with a
person standing where you can see them.

Three rules in the tick, in priority order, because each outranks the one
under it:

1. **Personal space.** Come inside 1.15 m and she gives ground — straight away
   from you at 1.9 m/s, faster than you close, through the same axis-slide as
   everything else so she backs along a wall instead of into it. This is what
   "in the way" actually meant, and it's now the only motion of hers you can
   cause. She wanders back afterwards because the post never moved.
2. **Travel.** She's not on her post, so she goes to it — the post, not you.
   Same doorway steering as before (`fx.waypoint`), because aiming at a spot
   on the far side of a wall only ever finds wall.
3. **Attend / amble.** Unchanged.

`_blinkNear(player)` became **`_blinkTo(post)`**, and the important part is
what it no longer does: it used to overwrite `home` with wherever she landed,
which is exactly how she ended up living wherever she happened to give up.
The post is the thing she is trying to REACH; nothing about failing to reach
it should redefine it.

**The room switch is hysteretic** on the same `arcadeZoneLevel` ramp the sound
uses — over 0.62 is the arcade, under 0.38 the bedroom, and in between she
keeps whichever she had. A bare `>= 0.5` would have her pacing back and forth
through the doorway while you stood in it.

**Where the arcade post is, and how it was picked.** The first spot chosen by
eye put her floating directly over the smoking table, close enough that her
click box shadowed the ashtray. So it was picked by sweep instead
(`/tmp/metro-smoke/guidespot.js`): every walkable tile fully inside the arcade,
excluding the walking lane in from the bedroom, needing eight-of-eight
walkable neighbours at 0.7 m and the largest clear radius to any blocker or
clickable in the room. `(-6.25, 0.75)` won with 2.03 m of clear air, three
metres in from the opening and a metre off its centreline — you see her on the
way in without her standing in the way of it.

## 2026-08-18 — the phone gets a slow walk, and taps go round the furniture

**A linear stick has no slow walk in it.** The room is 3.1 m/s wide open and
the move stick handed that straight through, so every deflection past a nudge
was a march — there was no way to ease up to the notes wall and stop, and no
way to line yourself up on the podium. Worse, there was no deadzone: a thumb
resting on the pad without asking for anything still crept you across the
room. The stick now cuts a deadzone (0.14), rescales what's left back to a
full 0..1 — miss that step and the deadzone quietly steals your top speed —
and bends the response `^1.6`. Half a throw is now 0.77 m/s, an amble; the
rim is still the full 3.1. Shaping is applied to the MAGNITUDE and never the
components, because bending x and y separately swings the heading off your
thumb — a diagonal press would no longer walk you diagonally.

**Press-and-hold was a dead stick.** The deflection was only ever read in
`pointermove`, so a thumb that landed off-centre and held still — which is
exactly what you do when you just want to walk forward — sent no event and
you stood there pushing nothing. Down and move now share one reader.

**Two things had to stay raw.** The nub is drawn from the thumb, not the
curve: a nub that lagged your finger inside the deadzone would feel like the
stick was sticking. And the gym's boost fires on `joy.mag`, the raw throw,
because it means "shoved to the rim" — reading the shaped value would have
silently moved that threshold to 0.95 without anyone touching the number.

**Tap-to-walk stopped dead at the first thing in the way.** Point past the
armchair and you got 0.45 s of walking into it, then nothing — which reads as
the tap having failed, not as the room having furniture. Two fixes. The stall
detector was asking "did `x + z` change", which is wrong twice: sliding along
a 45° wall moves you a metre and reads as frozen, and any sidestep reads as
progress. It now tracks the closest we have ever been, the only thing that
means arriving. And when we genuinely stall, we probe 1.6 m out to each side,
take the opening that lands nearer the spot, crab that way for 0.7 s, then aim
at the target again and see if the corner is behind us.

**Measured, not guessed.** 240 genuinely blocked routes in the bedroom and
arcade, then re-validated on a different sample (other grid offsets, 2.5 / 5 /
7 m trips) so the tuning wasn't just fitted to the set it was tuned against:
**73/69/72% → 86/82/77%**. Split by difficulty, routes solvable by a single
sidestep now complete 82% of the time; routes that genuinely need a path
around a wall sit at 32% and always will — this is a local sidestep, not a
planner, and it is not pretending otherwise.

The probe distance was the whole ball game and 0.9 m was not enough to see
past the furniture: 0.9 → 68%, 1.3 → 76%, **1.6 → 80%**, 1.9 → 74%. A longer
detour (1.0 s) and a bigger budget bought zero extra arrivals and 1.1 s more
wandering, so both stayed where they were.

**Giving up has a budget now, and it's the walk itself.** A flat cap is the
wrong shape — an eternity for a spot two metres away, mean to one across the
arcade — so it's `2 × distance / speed + 1.5 s`. That also catches the failure
no stall timer can see: grinding along a wall at a shallow angle, gaining two
centimetres a step, technically progressing, going nowhere. Worst-case trips
went 12.0 s → 3.1/4.7/6.0 s by distance, and a tap that can't be reached now
costs about a second before it hands you back the wheel. A second, non-refilling
detour budget backs it up, because the per-stall budget is refilled by progress
and a route that gains two centimetres between every obstacle can refill it
forever.

## 2026-08-18 — the readouts become icons, and move up

**The words were being sliced in half.** On a portrait phone the cat pill was
clipped to 34vw and the flight strip to 30vw, so "fed 100% · hydrated 100%"
became "fed 100% · hydrated…" and half a flight number went with it. Measured
on a 390px screen: the cat pill ended at 138px and the strip began at 137. They
were overlapping.

Both readouts are icons and numbers now. A bowl, a droplet, a litter tray when
it needs one, a person for the headcount. Nobody needs the word "hydrated" next
to a picture of water, and an empty bowl pulses red instead of announcing
itself in a sentence too long to finish reading.

**And in portrait the flight strip gets its own row.** Three things do not fit
across 390px, and clipping the least-fitting one was the wrong answer. It drops
below the pills, full width, and the aircraft type code comes back because
there is finally room for it. Landscape has the width for three lanes and keeps
them.

**Both pills sit at the top on desktop too**, where the eye is, rather than
along the bottom edge where browser chrome creeps up.

## 2026-08-18 — the room warms up before you walk in

Metro's idea, and the right one: the first few seconds inside were stuttery,
so load everything up front like a game does.

**What the stutter actually was.** three.js compiles a material's shader the
first time it is rendered and uploads a texture the first time it is sampled.
Measured: 25 shader programs and 219 textures were arriving one hitch at a time
while you walked. None of that work is avoidable, but WHERE it is paid is a
choice.

`world.warmup()` now pays for it against the login screen — `compileAsync` over
the whole scene, then every texture uploaded in chunks on timers so the live
shader title keeps running. A thin bar under the enter button says what it is
doing. `[enter]` waits for it, and a press made too early is remembered and
opens the door the moment it is ready, so nobody has to press twice.

Measured after: **25 programs compiled during play, now 4** — and those four
are the background models, which each warm themselves before joining.

**What it deliberately does NOT wait for.** The first build blocked on the GLB
models too, and on a throttled phone that was eighteen seconds of somebody
watching a progress bar, which is worse than the stutter it replaced. They are
~2MB of cosmetic upgrades over procedural stand-ins that already look right, so
they stream in behind the door now. Same throttled test: **0.8 seconds.**

## 2026-08-18 — the phone stops cooking

Reported as "my phone gets really hot on the website". Heat is sustained load,
not a stutter, so the question was what runs continuously rather than what
runs slowly. Measured before touching anything.

**The loop was never capped.** `setAnimationLoop` runs at display refresh, so a
120Hz iPhone was drawing the entire room 120 times a second. Nothing throttled
it. On touch it now renders at half refresh (30 on a 60Hz phone, 60 on a
ProMotion one) and never in a headset, where a dropped frame is a lurch rather
than a hiccup.

**The rug was costing three renders a frame.** The KuKo floor ping-pongs two
512×512 half-float targets, and it ran every frame whether you were standing on
it, in the arcade, or facing the other way. At 120Hz that is 63 million
fragment invocations a second for a decorative rug. It is now gated by distance
and steps at its own rate, 12Hz on touch and 30 on desktop. Nobody counts a
cellular automaton's generations; they look at a rug.

**Shadows off on touch, pixel ratio 1.5 → 1.25.** Two shadow passes for a
stripe of sun on the carpet is a desktop luxury.

Net on an emulated phone: renders per second went 90 → 50 near the rug and
**90 → 30 anywhere else**, one pass per frame instead of three. Desktop is
deliberately untouched: full shadows, full resolution, uncapped.

Two things found while in there. The rug's own shader never got its clock —
`matA` and `matB` were advanced every frame while `floorUniforms` sat at iTime
0 forever, so two expensive passes fed a surface frozen at creation. Fixed. And
the rug renders BLACK in every headless screenshot, which is not a bug: this
ANGLE context reports `OES_texture_half_float_linear` false, and sampling a
half-float texture with linear filtering it cannot do returns black. Real
devices have that extension. Written into CLAUDE.md so the next session doesn't
chase it.

## 2026-08-18 — the radio is on the rack, not the desk

Metro caught it: she was telling people the radio was on the right-hand end of
the desk. It is on top of the 12U rack, which is a separate thing on casters
standing beside the desk. Same pass had the telecaster "stood beside" the desk
when it is on the FLOOR between the desk and that rack.

How the crib went wrong is the useful part. `laRadio.group.position.set(0.15,
0.68, -0.1)` followed by `rack.add(laRadio.group)` is a LOCAL offset inside the
rack, not a world position. Reading the numbers without reading which group
they were added to turned a rack into a desk. The note in lines.js now says so
in those words, because "be careful" is not a check.

Two lines re-rendered, 507 characters, because a clip is named for a hash of
its own text. Nothing else was touched and nothing else was paid for.

## 2026-08-18 — Trinity gets a new voice, and the tour she was written for

**The blocker was never credits.** The account had 9,000 characters sitting
unused. Her voice was Janet, a `professional` voice from ElevenLabs' library,
and library voices need a paid plan for API access. Credits and voice tier are
separate rules; we were passing one and failing the other, which is why "I have
plenty of credits" and "402 payment required" were both true at once.

Worth recording: her clips were rendered on 13 and 16 August, and that free
billing period began on the 13th. So the plan did not lapse. The rule tightened
underneath us, some time in the two days before the 18th.

**She is Lily now**, a premade voice, which carries no such restriction. Her
WHOLE script re-rendered, not just the new lines: 43 clips, 5,456 characters,
inside the free allowance with 4,511 to spare. Re-rendering everything was the
point. Leaving 29 old clips in the previous voice would have made her sound
like two people, which is the exact fault the last pass removed.

The voice id lives in `tools/voice/render.mjs` rather than an env var on
purpose. A hidden override is how a later session renders half her lines in
somebody else's voice.

**And the tour she was written for is finally in.** Nine ordered steps that say
WHERE things are, with the positions read out of the running world rather than
guessed: the radio at the right-hand end of the desk under the window, the
telecaster stood beside the keys, the drum pads in the far corner, the arcade
doorway last. She skips a step you already did for yourself and acknowledges it
instead, so doing the thing is more interesting than being told about it.

## 2026-08-17 — Trinity shows you the room, in order

**She was changing voice mid-conversation.** Not random: every line has a
pre-rendered mp3, and `speak()` fell through to the browser's own synth
whenever the clip manifest hadn't landed yet. `loadClips()` was fire-and-forget
at boot, so clicking her in the first second got the robot and clicking her
later got the recording, and it sounded like two different people. `speak()`
now WAITS for the manifest when a clip was asked for. The load always settles
(an empty set on failure), so the synth stays a genuine fallback instead of a
race, and a line superseded mid-clip no longer restarts itself in the wrong
voice.

**A burst of taps used to start a line per tap**, each one killing the last
before a word got out, so she stuttered and tore through the script. One line
per 420 ms now; the extra taps do nothing rather than stack.

**And she walks the room in order.** She drew at random before, which meant a
first visitor could be told about the lava lamp and then pointed at the arcade
before touching a single thing in the room they were standing in. The arcade is
a door OUT of the bedroom and it belongs at the end. The order is now: the walls
(the whole point of the place), the radio, the instruments, the computer, the
window and the real LAX traffic, the light, the cat, and only then the way
through. Position is remembered per browser.

She also skips what you already found. Post a note or switch the radio on and
she won't walk you to it. The room reports ten different actions and she reads
them, which is the difference between a script and someone looking at the room.

**Not done: the wording.** A richer set with real directions in it ("on the desk
under the window, right hand end") is written and ready to go, but each line is
an mp3 keyed to a hash of its own text, and the ElevenLabs account is on a free
plan that refuses this voice over the API (402, paid_plan_required). New wording
would fall back to the synth and she would change voice mid-tour, which is the
exact fault this pass removes. Restore the plan, run
`node tools/voice/render.mjs`, and the wording improves in one edit.

## 2026-08-17 — you can see the room, and you can point at the floor

Reported as "people have a hard time moving around, especially in portrait."
The controls turned out to be the second problem.

**The field of view was 37 degrees.** A three.js FOV is VERTICAL, so on a tall
narrow phone the horizontal view collapses: 72° vertical at a 0.46 aspect is
37° across, against 104° on a desktop. You could not see a door, a wall, or the
floor in front of your feet — and no control scheme fixes not being able to see
the room. The camera now solves its vertical FOV from a target horizontal one
(clamped 72–100, because pure Hor+ wants 140° vertical down there). Wide screens
land on the old 72 and are untouched; portrait opens to ~58° across with far
more floor under you. Recomputed on resize, so turning the phone works.

**Tap the floor and you walk there.** A stick is a thing you have to learn;
pointing at the ground isn't. A tap that doesn't land on anything with a job
becomes a destination: the ray meets the ground plane, `isWalkable` decides
whether that spot is real, and you drive there — TURNING as you go. The turn is
most of the value, because the hard part on a phone was never the walking, it
was aiming the camera first. A ring lands where you tapped so it's clear it
registered. Any joystick, key or look-drag takes control straight back, and
walking into something gives up after half a second instead of grinding.

Touch only (a desk has WASD), and the rooms that own their movement — zero-g,
the gym's court — are left alone. Verified on an emulated iPhone: tap ahead
walked 2.22 m and stopped on arrival, a tap to the left turned 28° toward it, a
tap at the ceiling did nothing, and the joystick cancelled it instantly.

## 2026-08-17 — other people stop being silhouettes

Reported as an Android bug ("she could only see my eyes, not my body") and it
turned out not to be Android at all. It reproduced first try in headless
Chrome.

**Why.** A figure is ~27 `MeshLambertMaterial` parts, and in this world all room
light comes from the window. Stand anywhere the window doesn't reach and every
one of those parts renders pure black. The face and the shirt logo are
`MeshBasicMaterial`, so they light themselves and keep showing — a black
silhouette with a pair of floating eyes, which is precisely what she described.

**Fix.** Each avatar colour now carries an `emissive` floor of itself. It costs
nothing against the light budget (it isn't a light), can't leak through a wall,
and survives the toon pass, which is the same trick the bathroom tile uses on
its corners.

It took two parts. A share of the colour alone (30%) still left dark clothing
dark, because a share of near-black is near-black and the default fit is nearly
black — so the torso and legs stayed a silhouette while the skin came back. A
small absolute lift on top is what makes a black tee read as a shape. The share
is what keeps it that person's colours instead of a uniform grey.

Checked in three lightings: the dim bedroom, the bedroom with the blinds open,
and the arcade under neon. Reads in all three, washed out in none.

## 2026-08-17 — the mic stops feeding back

**Why it echoed.** Peer voice is decoded into the WEB AUDIO graph, not an
`<audio>` element. The browser's `echoCancellation` constraint was switched on
the whole time, but it can only subtract what it knows it is rendering, and on
phones Web Audio output is generally not in that reference signal. So the
canceller was on and blind: your voice left their speaker, their mic heard it,
and it came back to you.

**Two guards in voice.js, neither needing ML.** A GATE that refuses to transmit
a chunk which never rose above speech level, so room tone and a distant talker
never go out at all. And a DUCK: in open-mic mode, nothing transmits while a
peer's voice is actually leaving your speaker. A feedback loop needs both ends
live at once, so keeping one end quiet means it cannot start. Push-to-talk is
exempt from the duck on purpose — you are holding a button, you mean it, and
you can hear the result and let go. The gate fails OPEN if the analyser never
built: a gate that cannot measure must not be the reason nobody can talk.

**The UI was half the bug.** A quick TAP on the mic button locked it open,
which on a phone is the easiest gesture to perform by accident. Hold-to-talk is
the default now; leaving it open takes a deliberate double-tap and says out loud
that it wants headphones. If the duck swallows five chunks in a row, the room
says so once rather than just going quiet on you.

Verified headlessly with a fake capture device: 4 chunks suppressed while a
peer was audible, 1 sent, and transmission resumed once they went quiet.

## 2026-08-16 — the planes come back through our own door

**The flight strips had stopped, and it wasn't our bug.** airplanes.live now
answers 403 with "contact us at… include a link to your project" — the free
endpoint is gone. Both obvious replacements, adsb.lol and adsb.fi, serve the
data happily and send NO `access-control-allow-origin`, so a browser on
whoisthemetro.com cannot read either one directly. That's the whole reason
CLAUDE.md said they weren't options.

So there's a `planes` edge function now: one hop, server-side, that returns
the airplanes.live shape whatever it actually talked to — so `planes.js` kept
the parser it already had. It is deliberately NOT a general proxy: the
coordinates are baked in, so the only sky this URL can ever return is the one
over the bedroom window. Two upstreams tried in order, because the thing that
just happened is a free feed disappearing without warning, and a 60-second
shared cache so a crowded room costs the upstream what one person does. Every
upstream down returns an empty list rather than an error, and the world flies
its own ambient jets exactly as it always did.

**The strip left a ghost of itself on phones.** It hid by sliding up on
`transform` alone, which moves the text without un-rendering it — and on a
phone that left a sliver of the last callsign stuck near the top of the
screen. It fades and goes `visibility: hidden` now, and the content is emptied
once it's off screen. Two independent reasons for it to be gone.

**The HUD was portrait-only.** The mobile layout keyed on
`orientation: portrait`, so turning the phone sideways dropped everything back
to the desktop arrangement and the cat readout fell to the bottom-left, under a
thumb. It keys on `pointer: coarse` and a width now — a phone is a phone
whichever way you hold it. Three lanes across the top: cat hard left, headcount
hard right (it used to be bottom-right, in the joystick's way), flight strip
centred between them where it can't collide with either.

**And the cat is off the keyboard.** Walking the keybed was 18% of everything
it chose to do, which is charming roughly twice. The behaviour is gone rather
than suppressed — the pick, the state, and the pacing that went with it.

## 2026-08-16 — the computer tells you what's new

**Type `new` at the desk computer and it tells you what's changed, by day.**
"today", "yesterday", then dates, three days at a time with `new all` for the
lot. `changelog`, `whatsnew` and `updates` all reach it, because those are what
people actually type, and the boot banner says it's there.

The copy lives in `assets/js/whatsnew.js` and it is a TRANSLATION of this file,
not a copy of it. This log is the builder's: long, technical, full of the
reasons a thing was done a particular way. That one is a visitor's: one plain
line per thing, no jargon, no file names, nothing about how it works. The rule
that keeps it worth reading is written at the top of it and in CLAUDE.md — a
change nobody could notice from inside the room does NOT get a line. Padding it
with invisible work is how it turns into noise.

Trinity points at it now, and the terminal points back at her.

## 2026-08-16 — the bedroom stays in the bedroom

**Walk into the arcade and the bedroom goes quiet.** The instruments were
already gated, but four other things weren't and nobody had noticed: LA coming
in through the window (traffic, horns, the jet going over), the rain, the room
tone, and the LA radio, which faded with distance but was still playing from
the doorway. Every other room turns those off on the way in — the club and the
gym both do — but the arcade isn't a transition, you just walk through a
doorway, so nothing ever fired.

There are two scopes now, and the difference is load-bearing. `bedroomSound`
means the origin CLUSTER, bedroom and arcade together, and the bartender and
the basketball hoop keep it because they live in the arcade and must be heard
there. `bedroomOnly` is the bedroom itself. The cat moved to the second one:
its voice used to carry through the doorway on purpose, and doesn't any more.

The two continuous beds get a boundary watcher rather than a transition, with
hysteresis on purpose — in at 0.6, out at 0.4 — because `setRain` tears its
nodes down and a single threshold would thrash them while you stood in the
opening. It re-asserts on the way home too: the lift comes back into the
ARCADE and every room's exit turns bedroom tone back on as it goes, so
returning from the venue would otherwise start the bedroom humming while you
stood at the cabinets, with no crossing left to fire. `ambience.audioDebug()`
reads the gain nodes, because room scoping is the one thing here you cannot
check in a screenshot.

**The cat stopped pacing the keybed on a loop** — and it was the collision fix
from the day before that caused it. The desk rect runs z −3.3 to −2.38 and the
cat's keybed perch sits at −2.45, inside it. The rule let the cat IN (a rect
holding its destination stays open) and then refused every step OUT, because
each one still landed inside. So it wedged, gave up, sat, picked the keys
again, forever. It looked like it was stuck on the pedalboard because that's
the edge it was pressing against. The rule that was missing: standing inside a
rect means every direction is out. These stop the cat entering furniture; they
must never stop it leaving.

**The MIDI keyboard is a movable prop.** It's two meshes with two jobs — the
chassis is the piano-voice selector, the strip is what you play — so
registering the strip alone picked up the keys and left the keyboard behind.
They're one group now via `attach()`, which re-parents without moving
anything. The cat's perch is derived from the keybed's live world position
rather than written down beside it, so pulling the keyboard out doesn't leave
the cat pacing thin air where it used to be.

**Trinity introduces herself wherever she's standing.** Her one introduction
was bedroom-flavoured — it offered you the notes wall — so meeting her in the
arcade opened with a description of a room you weren't in. There's an arcade
introduction now that makes the same point (the place is alive, it remembers,
what you leave outlasts you) with the high scores instead of the notes. She
still only introduces herself once: walk back to the bedroom afterwards and
she carries straight on. The bedroom crossing line stopped saying "back in the
bedroom" for the same reason — these fire on any crossing, including the
first, in whatever order you happen to walk it.

**And her voice key stopped evaporating.** It had been living in the session
scratchpad, which belongs to one chat and is deleted with it — so the key
vanished and no parallel chat knew one existed. It's in `~/.config/metro/`
now, outside the repo (this one is public) and outside any session;
`tools/voice/render.mjs` reads it itself, so any chat just runs the tool.

## 2026-08-15 — a radio DJ between the songs

**Mall radio needs a voice, so there's one.** Six lines, rendered once to mp3
by `tools/voice/render-dj.mjs` the same way Trinity's script is — one voice for
everybody, no key in the client, no per-visit bill, and a clip named for a hash
of its own text so editing a line orphans one file and mints one new name. He's
a separate script from her on purpose: different voice, different settings
(style up and stability down, because he IS a performance where she deliberately
isn't), different folder. Her pipeline is not a thing to risk for a gag on a
ceiling speaker.

He comes out of the SAME driver as the music — the same highpass, honk, lowpass
and soft clip, the same tiled-room convolver, the same distance and the same
wall-muffle — because a voice that didn't share the speaker wouldn't be coming
out of the speaker. The music ducks to 0.35 under him and comes back after,
which is what radio does and the difference between a voice and a voice
fighting a song.

He speaks when the loop wraps, and only if somebody is close enough to hear it:
the loop runs whether the room is occupied or not, and broadcasting to an empty
bathroom is just a wasted decode. Lines are drawn from the same shuffle bag the
toilets use.

**He's rendered.** Six clips, 184 KB the lot, 22 kHz mono at 40k — everything he
says goes through a 3.6 kHz lowpass at the far end, so shipping 44.1 kHz stereo
would be paying to send detail the room throws away.

The key that renders him now finds ITSELF, from `~/.config/metro/voice.env` —
outside the repo (this one is public, so a key inside it is one `git add -A`
from being published) and outside any one session, which is where the last one
died. `render-dj.mjs` reads the same store `render.mjs` does: one key, one
place, every tool and every chat. If it's ever missing there's no manifest, and
with no manifest he simply stays quiet — the room is not broken by a missing
gag.

## 2026-08-15 — there's music in the bathroom now

**A song on a loop out of a ceiling speaker.** The chain that makes it sound
like one is almost entirely SUBTRACTIVE — a mall speaker isn't a small hi-fi,
it's a 4-inch driver in a ceiling tile. Highpass at 360 so there's no bass, a
+5 dB peak at 1.65k for the boxy honk, a lowpass at 3.6k so there's no top, and
a soft clip for the tired little amp behind it. Nothing in there adds anything.
It runs through the same convolver the toilets do, because it's in the same
tiled room and would sound wrong dry next to them.

**It's quiet on purpose.** The ceiling is 0.032 — about −30 dBFS, a thirtieth of
a flush. It started at 0.085 and that was still too present: the test isn't
whether you can hear it, it's whether you notice the room has music rather than
noticing the music. Anything you can follow the tune of in there is too loud.
The DJ came down with it but not as far (2.4× the bed rather than 3.2×) — a
voice still has to clear what it's talking over, and at the old ratio he'd have
been shouting over a whisper.

**And it's positioned.** Level falls on real distance to the room, and a second
filter closes as you leave: sound through a wall doesn't just get quieter, it
gets DULLER, and losing the top is most of what makes it read as coming from in
there. Measured walking out — full and open at 3.6 kHz inside, 0.068 and 2.6 kHz
at the door, 0.023 and 705 Hz a few paces down the hall, gone by the far side of
the arcade. It loads and starts only once you're within about 7 m, so a visit
that never opens that door never fetches it.

## 2026-08-15 — you can write on the bathroom walls

**Click a wall or a stall panel and the pointer unlocks; from there it's a
drag.** Drawing with a locked crosshair would mean steering your whole head to
make a letter. Seven colours, strokes go out live over presence, and the wall
persists the way the blinds and the lava lamp do — as a room flag.

Walls and stall panels only. The mirrors, the floor and the ceiling are simply
never registered as surfaces, so a ray that lands on one isn't a place you can
write and there's no special case anywhere. The mirrors needed one extra thing:
they're click-SOLID now, like doors and furniture, because a ray aimed at glass
otherwise passes straight through and lands on the tiled wall behind it — you'd
have been writing on a surface you couldn't see.

**Two bugs the test caught that looked fine on screen.** Surfaces were keyed by
mesh uuid, and three.js mints a fresh uuid every build — so a reload loaded
yesterday's writing into surfaces that no longer existed and painted nothing at
all, while still reporting the right stroke count. They have stable names now.
And u/v come from the LOCAL hit point rather than `hit.uv`: a BoxGeometry gives
every face its own 0..1 with the orientation varying per face, so trusting it
would flip and rotate a tag depending on which side of a stall door you wrote
on.

**Right-click lifts one stroke off the wall.** Undo is strictly last-first,
which is no help when the tag you regret is an old one and you'd rather keep
everything you've drawn since — so right-clicking picks the nearest of YOUR
strokes under the pointer and takes just that one. Nearest segment wins and the
later stroke breaks ties, so where they overlap you get the one you can
actually see. Other people's are never candidates.

**Undo and erase.** Undo steps back your last stroke (⌘Z / Ctrl-Z too); erase
takes everything you've written in the room. Both only ever touch YOUR
strokes — other people's writing isn't yours to bin — which meant every stroke
now carries a short id and a short author. The id is what goes over the wire:
"the last one" is meaningless to a peer whose list is in a different order.
Because your uid lives in localStorage and every stroke carries it, undo keeps
walking back through work from earlier sessions too, and stops when nothing on
the wall is yours. Erase arms on the first press and fires on the second rather
than opening a confirm dialog, because a modal on top of an unlocked pointer mid-drawing is
worse than the mistake it prevents. Strokes saved before this shipped have no
author, so nobody owns them and nobody can rub them out — `scrubWall()` still
takes the lot.

Each surface gets its own transparent overlay carrying its own canvas, built
lazily on the first stroke that lands — a bathroom nobody has written in costs
nothing. Strokes quantize u/v to a byte, which is what keeps a whole wall of
them small enough to sit in a flag. 400 of them, oldest scrubbing off first,
and `METRO_DEBUG.scrubWall()` wipes it: it's a public wall on a public site and
the cap is a bound, not moderation.

## 2026-08-15 — the selfie mirror comes off the wall

The framed panel by the bar rendered a live "you" into a 40 cm off-screen view
and opened the outfit picker when you clicked it. The podium does the same job
at full size, in a corner built for it, with a figure you can turn round by
hand — so the mirror was a second door into a room that only needed one, plus
an extra render pass every frame you were anywhere near the arcade. Gone:
`mirror.js`, `world.mirrorAnchor`, its click target and aim tip, and the
`where` argument on `openPicker`, which now only ever means the podium.

(The bathroom's mirrors are a different thing and stay — those reflect the room
you're standing in.)

## 2026-08-15 — the toilets work, and the room sounds like tile

**And they're a lot quieter.** They were playing at −1.4 dBFS — essentially
peaking, which is why a flush startled you rather than amused you. −14 dBFS
now, a 12.6 dB cut, still 16 dB clear of the music bed because a flush should
be an event and the music shouldn't. The level is ONE constant in ambience.js
now (`FART_LEVEL`) with the call sites passing a relative 0..1 for how far off
you are and whose it is — it had been 0.85 written out across three call sites,
which is exactly how a level drifts apart: one gets tuned and the others don't.

**27 one-shots, and you'll hear all of them before you hear one twice.** The
toilets are click targets now — a fat invisible volume around each, because a
bowl is a stack of small cylinders and clicking one of those at walking pace is
a game of darts. The pack is drawn from a shuffle bag: all 27 play before any
repeat, and a fresh bag never opens with the one you just heard, since the seam
between bags is the one place a repeat could still land and exactly where you'd
notice it. Half a megabyte, so it loads on the first click rather than on the
way in — most visits never open that door. Everyone in the room hears it; a
joke only you can hear isn't one.

**The room has a reverb, and it's synthesized like everything else here.** A
tiled room is an easy impulse response to describe: a handful of discrete slaps
in the first 50 ms, which is where the ear gets the wall distances from, then a
diffuse tail kept deliberately BRIGHT — tile reflects high frequencies instead
of eating them, and that hard ringy quality is the whole character of a public
bathroom. It's a send bus built on first use, and it's shared: the farts go
through it, and so does anyone talking.

**Voice reverb follows the SPEAKER, not you.** It's a send on each speaker's own
chain rather than one flag on the bus, driven per frame from where everyone is
actually standing. Someone talking from the stalls sounds like it while the hall
outside stays dry, and you hear the difference through the open door.

**And the lighting went neon.** Magenta and cyan overhead on the arcade's own two
colours, violet and ice washing the back wall, a cove line along both long walls
and a hard line under every basin. Lights make pools;
lit EDGES are what sell a room like this, and those are MeshBasic strips that
cost no light and can't leak anywhere. Two things had to move with it: the pale
grey ceiling was the one surface still reading as a hospital and went dark
violet, and the porcelain had to carry itself — the vanity bars point away from
their own wall (they have to, to stay out of the hall), so the basins under them
went black until their emissive came up.

## 2026-08-15 — one fit, five pairs of shoes

**The jacket and the dress are gone, and so are shorts and skirts.** At this
polygon count a "jacket" is a torso with two dark stripes down it — it was
never going to read as a jacket, and pretending otherwise just spent options on
something nobody could see. There's one fit now: a tee and trousers, each its
own colour.

**What replaces them is shoes**, which are the one thing on a figure this size
you actually read from across a room. Five pairs — **sneaker, hi-top, chunky,
platform, boot** — in any of ten colours, and the colour you pick is the WHOLE
shoe, flat: sole, upper, toe cap, collar, one material. Two earlier passes gave
the sole its own colour and then its own shade, and both read as a band stuck
under the foot. The shape comes from the geometry, not from a second colour.

A platform genuinely makes you taller: the shoes are built at floor level and
the whole rest of the person rides in a group lifted by whatever the pair adds
underfoot, so the sole raises you instead of swallowing your ankle.

Two things had to change for any of it to be visible. The trouser leg was
**wider than the shoe**, so the hem hung over it and all you saw of a red hi-top
was a sliver of sole on the floor — the ankle tapers hard now. And every collar
and shaft has to be wider than the shin it sleeves, or it renders inside the leg
and shows nothing at all.

**The slim build's neck was floating.** A capsule's height is length + 2·radius
and the radius rides the build, so a fixed length put the slim torso's top 3 cm
lower than the average one — with the neck still pinned where it always was. The
trunk's length is solved from the radius now, so the shoulders land on the same
line for every build. While that was open the torso lost its rounded bottom too:
a capsule's lower cap tapers to a point below the waistband and hung out between
the legs like a shirt-tail. It's a trunk with a dome on top now — flat hem, and
the waistband caps it.

## 2026-08-15 — no more .glb, and a body that hangs together

**The whole bring-your-own-avatar path is gone.** The wardrobe overlay, its
CSS, `avatar-glb.js`, `store.uploadAvatar`, the `avatar` field on presence,
`identity.avatar`, the GLB tier in ghosts.js and the stanchion that had just
been built beside the podium — all out. Everything in this world is made of
primitives and the people in it are part of that; a scanned mesh standing in
the arcade was always going to look like a visitor from another renderer.
ghosts.js has two look tiers now, blocks and the glow-blob. (The Supabase
`avatars` bucket is still in `site.sql` with nothing writing to it.)

**The torso was too tall and the arms were tucked into the hips.** A capsule's
top cap IS its shoulders, and the old one ran up to 1.35 — under the chin, no
neck showing — so the arms hung off a dome with no shoulder line in it. The
torso now stops at 1.19, which is where the neck starts and where the arms
hang from. The arms themselves were tilted INWARD by a sign error (`-sx` swings
a hand into the hip; `sx` swings it out) and now splay 0.22 rad, which is what
it takes for the forearm and hand to clear the widest part of the body and the
belt under it. Shoulder joints stay buried in the torso cap, because an arm
that starts clear of the body reads as detached.

## 2026-08-15 — the bathroom mirrors actually reflect

**Both mirrors, one render pass.** They hang on the same wall facing the same
way, so the mirrored camera and the texture it produces are identical — the
two only differ in which part of it they sample. Sharing works because the
vertex shader projects world position rather than baking each mirror's own
model matrix into the texture matrix, the way three.js's Reflector does.

It's deliberately cheap. The target is 320x180 and reads as soft glass, which
is right for a cel-shaded room with no fine detail to lose. The virtual
camera's far plane is 12 m — the mirror faces into a sealed 4.2 m room, so
there is nothing beyond the back wall it could ever show. And the pass is
driven from `onBeforeRender`, so it runs only when a mirror is on screen: walk
out and it costs nothing, with no position test to keep in sync. A time guard
caps it at 30 Hz and makes the second mirror reuse what the first rendered.
**Frame time is unchanged with both mirrors in view** — 60 fps, same as the
empty room.

**And you're in it.** The point of a mirror is to see yourself, and first
person has no body in the scene — the reflection was showing an empty room you
happened to be standing in. There's a second copy of your figure now (the
podium keeps its own, and one node can't stand in two places) that rides the
camera: your position, your facing, your current look, rebuilt whenever you
change it. It's tagged onto the reflection layer ONLY, never layer 0, so the
main camera physically cannot render it — there's no way to walk into the back
of your own head, and it costs nothing anywhere else because the only camera
that draws that layer is the one that runs when a mirror is on screen.

**Which meant the mirrors needed their own light.** The wall-washers point away
from the entry wall, so the strip where you actually stand was the dimmest part
of the room and the figure came back a black silhouette against the lit room
behind it. That wall couldn't carry a light before — it's 24 cm off the hall
and a leash short enough to stay home wouldn't reach the floor — but AIMED
works where leashed doesn't: a vanity bar over each mirror, tilted away from
the hall by more than its own half-angle. It lights you, and it lights the
basins, which had been the dimmest corner of the room since the day it was
built. (Its emitter sits below its own housing, incidentally — level with it
and the spot lights the fixture at point-blank range and blows a white hole in
the middle of it.)

**Getting there cost four wrong answers**, all now written into CLAUDE.md.
Reflector's oblique near plane blanks the target when you stand square to a
mirror, which at a row of basins is most of the time. `renderer.clippingPlanes`
fixes that from every angle but is global renderer state — set inside
`onBeforeRender` it re-clips everything drawn after the mirror, and the room
loses its own walls. Clipping also discards fragments while still submitting
geometry: 534 draw calls standing at a basin, because the whole hall was still
going through the pass. Object-level layer culling is what actually makes it
cheap, and it renders black until you remember that lights are collected
through the same camera-layer test as meshes. And the last one: the mirror's
own frame sits *behind* the glass, so the virtual camera was staring at the
back of a steel slab — a black band straight across the reflection.

## 2026-08-15 — a podium in the corner, and you can turn yourself round

**The creator has somewhere to stand.** The mirror shows you a picture of
yourself, 40 cm wide, in a frame. The podium is you at full size, standing in
the room — in the corner nearest the smoking tables, the one stretch of that
hall nobody had a use for. It sits on the 45° out of the corner and faces the
room, so there's no angle you can come at it from where you're looking at its
back: a curved backdrop with neon down both open edges, a two-step plinth with
a lit rim, YOUR LOOK overhead, and a spotlight straight down on it.

It shows the look everyone else sees and turns itself slowly, because a figure
that never moves reads as furniture. Click it and the creator opens on it.

**You can drag it round.** Hold the mouse down anywhere on the view while the
creator is open and the figure turns — 300 px of hand is half a turn, so the
back of your head is one flick away. It's plain clientX deltas rather than the
`dragLock`/`movementX` path the studio's knobs use: the pointer is already
unlocked in the creator because the panel needs it.

**Two walls, 70 cm away.** The backdrop is an arc, and the thing that hit the
walls wasn't its back but its ENDS — at ±1.05 rad they swing out nearly to the
podium's sides, and the first version put both of them through solid brick.
The light is a spot pointing almost straight down: from 3.3 m, every direction
inside a 22° cone lands on the plinth, and the nearest thing on the far side
of either wall is 2 m out horizontally. Aimed away beats leashed.

## 2026-08-15 — the block avatars get a body, and hair that isn't a swim cap

**The hair was the complaint; the diagnosis was geometry.** Every style was a
smooth `SphereGeometry` cap sat on a smooth `SphereGeometry` head. Two
concentric spheres have no edge between them, so it read as a swim cap — and
"long" was an open-ended cylinder, which is to say a tube. Colour and polygon
count were never going to fix that. Three things did:

- **The crown is tipped back.** A sphere cap's rim sits at one height the
  whole way round and real hair doesn't: high at the forehead, low at the
  nape. Rotating the cap back ~0.3 rad buys both at once, which also retired
  the separate nape patch that was making everyone look hooded.
- **The hairline is locks, not the rim.** Five-sided tapers laid across the
  brow at different angles, with a part off to one side, so the edge you read
  is a diagonal. Same primitive builds the mohawk's crest, the locs, the long
  curtains and the loose strands at a bun.
- **No shell dips inside the skull.** Offset a cap back further than (its
  radius − the head's) and its front cuts through the face; that's where the
  ragged notch over one eye came from.

Eight styles now — **none, buzz, short, mohawk, long, locs, bun, afro** — and
they read as eight different silhouettes from across the room, which is the
only test that matters. Beards were the same cone-off-the-chin problem and got
the same treatment: a jaw mass with an edge along the cheek, a moustache above
the mouth block, and a taper hanging off it for "long".

**The figure had no arms.** It was a torso, two legs and a head — a bowling
pin. It now has arms that hang (sleeved for a jacket, bare forearms for a tee,
bare for a dress), hands, shoes with soles, a neck, ears, and a waist band
that stops a dark top and dark trousers reading as one lump. The jacket lost
its black chest slab — a panel that size reads as a door and fought the chest
logo for the same space — and got lapels, a zip and a collar instead. Slim and
broad builds also stand a hair shorter and taller, so a room full of peers
stops looking like one person cloned.

Palettes grew: four more tops/bottoms, and hair in platinum, cyber-teal and
hot pink. A mohawk's shaved sides are drawn as **skin with stubble on it**, not
dark hair — a hair-coloured cap under a crest just puts the swim cap back on.

## 2026-08-14 — the arcade gets a bathroom

**A door in the south wall that isn't the lift.** The arcade's south wall had
one long empty run left on it, between the elevator out west and the bar to
the east. A 1.15 m doorway is cut into it now, lined with a real tiled reveal
and outlined in green neon with a RESTROOMS sign over it, the same language
the lift speaks. In a hall that dark, a lit doorway carries a long way.

Behind it is a proper mall washroom, built off a floor plan: **8.4 × 4.2 m**,
three bays. Stalls along the back of each — three west, three east, teal doors
hung ajar at varied angles so the row reads as depth instead of a flat wall.
The accessible stall fills the middle bay behind the entry vestibule, wider
and deeper, toilet pushed to one side for the transfer space, two grab bars.
Four basins under a long mirror along the entry wall of each. Ceiling at 2.7
against the hall's 4.3; the drop is what makes it read as somewhere else the
moment you step through.

**The two side bays are mirrors of each other**, which the plan they came from
isn't — it puts urinals on one side only. The trouble is that the sole
partition face those could mount on is the same face you walk through to get
into that bay, so the run stood square in the gap and the right-hand half of
the room was sealed off. There was no other stretch of partition to use. Two
identical bays is worth more than the plan's split, so the urinals came out
and the west bay's basin run is mirrored across the door.

**The entry is at −10.5 and the room is built around it.** That's the one
stretch of this wall that isn't behind something — a few metres west and the
door opens into the middle of the basketball court, which looks wrong from
the hall. Holding it there pushes the room's east end out behind the bar, so
two of the hall's fixtures had to change: the hoop lamp's throw came in (the
new ceiling is 1.27 m from it), and **the bar lamp came down** — from 2.15 to
1.80, with four short-throw bulbs instead of two long ones. A 0.8 m throw is
what fits in the 0.85 m between those bulbs and the tile behind the wall, and
from 2.15 a throw that short couldn't even reach the counter. Dropping the
lamp is what buys it, and a low lamp over a counter is what the fixture was
always modelled on. The bottles now carry their own colour as emissive, since
there's a lit strip behind every one of them — backlit glass, no light needed,
nothing to leak.

**Three things were intersecting that shouldn't have been**, all found by the
edge probe rather than by eye: the rear grab bar ran straight through the
accessible cistern; the back-bar cabinet's rear face sat exactly in the arcade
wall's plane; and every bottle's base sat exactly on its shelf's top face. The
last two had been there since the bar was built.

**The room found two lighting bugs that were always there, just harmless.**
The arcade's magenta neon sat 1.2 m off that south wall throwing 4.2 m, and
the bar's pendants threw 3.7 m from 0.85 m off it. Nothing was behind the
wall, so nothing noticed — until something was, and the new white tile came
out pink at one end and tan at the other, straight through solid brick.
`distance` is the only leash a point light has, and both had been tuned
against a neighbour that no longer existed. The magenta is pulled north and
reined in; the pendants are down to a 1.7 m pool, which is what a shaded
billiard-style lamp should have thrown all along — the old radius was a bare
bulb's. Both still do their job in the hall. The hoop lamp grazes the
bathroom's far corner at 3% and stays.

**Clean edges.** The doorway casing was built 30 cm deep to line a wall
thickness that was actually 3 cm, so it jutted into the hall and buried the
green neon bar inside itself — the strobing you could see from across the
arcade. The two wall planes are now genuinely 22 cm apart with the casing
fitted between them, the frame pieces butt instead of overlapping, and the
neon sits clear in front of all of it. Nothing in the doorway shares a plane
with anything else any more.

**And the room is lit like a room.** Downlights alone gave a bright floor
under black walls, which through the door read as a void with a lit sliver of
ceiling hanging in it. Two wall-washers now sit at the door pointing inward —
aimed away from the hall, so they're contained by geometry rather than by a
distance number — and the tile carries a faint emissive so the corners
nearest the door, which nothing can light without shining through the wall,
still read as tile instead of a hole.

## 2026-08-14 — the moon stops being two balls

**There was a black ball hanging over the city in daylight.** The moon was
drawn as a pale disc with a second, dark navy disc painted beside it to
carve the crescent — a trick that only disappears against a night sky. In
daylight the shadow stopped hiding and read as exactly what it was: a black
circle floating next to a white one, out over the rooftops.

The crescent is now CUT out of the disc rather than painted over, on a
scratch canvas so the erase can't take a bite out of the jet or the bat
signal already sitting on that layer. The real sky shows through at any
hour. A daytime moon is also faded to a pale ghost with no halo, which is
what one actually looks like.

Two more bugs fell out while it was open. The shadow offset was INVERTED —
it shrank as the moon filled, so a full moon put the shadow dead centre and
blacked the moon out completely, while a new moon shone brightest. And
`fraction` alone can't say which limb is lit, so waxing and waning crescents
were drawn identically; `getMoonIllumination` returns `phase` now and the
crescent points the right way.

## 2026-08-14 — METROWORLD on the hill, and a cat that respects the drums

**The sign on the ridge says METROWORLD now, in neon.** By day the tubes
are off — pale glass letters on a dark board, each with its own lean. At
night the sign is LIT: magenta, a wide painted halo under a near-white
tube core, deliberately belonging to neither of the grid's two currents.

**The cat stopped walking through the kick drum.** Two bugs, not one: the
cat had no collision at all (it lerps straight at its targets), and its
window-watching floor spot was SIX CENTIMETRES from the kick — its bed was
inside the instrument, so no collision system alone could have fixed it.
The spot moved out from between the e-kit and the desk, the world now
hands the cat a list of furniture rects (e-kit, desk, tele-and-amp
corner), and every step the cat takes axis-slides around them — the same
trick the player and the guide use. The one exception is load-bearing: a
rect containing the cat's own destination stays passable, because the
keybed and the chair are perches ON furniture, and a cat that can't reach
its perch just wedges at the edge. If it does wedge somewhere new, it
gives the walk up after a second and sits down to reconsider, which is
frankly what a real cat would do.

## 2026-08-14 — the city puts the grid on at night

**The city got a plan before it got the lights.** The buildings, the
painted streets and the traffic used to be three separate guesses — boxes
scattered at random angles, a tiling ground texture whose roads matched
nothing, lanes at offsets related to neither — and that disagreement is
what read as amateur. There's ONE street grid now (`CITY` in world.js):
avenues and streets on a proper pitch, axis-aligned buildings filling the
blocks between them in three habits (a full-block slab, a split pair with
an alley, a podium wearing a slimmer tower), heights climbing with
distance so the geometry stairs up toward the painted downtown. A
boulevard twice the width of everything else runs from under the window
dead straight at those towers — the vanishing point is the composition.
An elevated freeway threads the far street on stilts, faster traffic and
all. The ground texture stopped tiling and became one 2048px canvas
painted FROM the plan, so a road in the paint is a road between real
buildings, and every car lane is derived from a road in the same plan.

**After dark, Los Angeles goes tron.** Teal night palette, neon edge lines
on every near building, two-current windows (cyan majority, amber minority),
painted-bloom crowns on the downtown ring, and the street plan repainted as
a circuit board: avenues become lit traces (one axis amber, one cyan),
intersections become nodes, stub traces wander into the blocks. Cars drag
light trails up the road. Daytime is untouched — the window is still real
LA, with real weather and real planes landing in it, so nothing Trinity
says about it stops being true. The city only dresses up when the sun goes.

No postprocessing anywhere. Every glow is painted into the canvas textures
(wide soft pass under a thin hot core), the edges are one additive
LineSegments, the trails are one InstancedMesh whose gradient fades to
black — which under additive blending IS transparent, so it needs no
texture and no alpha.

**And the window got cheaper, not dearer.** The forty near buildings were
forty Meshes wearing six-group material arrays — ~240 draw calls for
geometry that never moves. They're baked into ONE mesh now (walls + roofs,
two calls), undersides dropped from the bake entirely. And the star twinkle
used to repaint mountains, haze, city and ground every 900 ms all night —
four big canvases redone for a change only the sky contains; the sky keeps
its own clock now. Same spawn view: 660 draw calls before, 483 after,
night included.

`world.skyPreview(altDeg)` is new: paints the outside for any sun altitude
so the smoke harness can photograph day and night without waiting for
either. It replaces the sky cache rather than painting once, because the
beacon blink redraws from that cache twice a second and stomped the first
version before the screenshot fired.

## 2026-08-13 — she glows on her own syllables

**The card is gone from the normal path.** Once she had a real recorded
voice, printing the same words beside her head was reading a subtitle to
someone who can already hear it, and it ate the room you're trying to look
at. It survives only for the case it was actually for: a device with no
rendered clips AND no browser synth, where she'd otherwise mime at you in
silence. Checked live, so nothing is stranded.

**She reacts to the sound instead of to a flag.** Playing an mp3 means the
amplitude can be MEASURED rather than guessed: the clip runs through the
room's own audio graph by way of an analyser, and the level off that drives
her mouth, her glow and her name. She lands on stressed words. A flat
"brighter while talking" reads as a light switch; riding the envelope reads
as a voice. The browser synth gives nothing to measure and reports -1, and
that path keeps the old oscillator, so the fallback still looks alive.

**Smaller ears.** They were doing too much.

## 2026-08-13 — a real voice

**Trinity stopped synthesising and started playing recordings.** Her script
is fixed, so there was never a reason to generate it live: `tools/voice/`
renders every line to mp3 once, and the room plays files. That buys one
voice for everybody instead of whatever the visitor's device happens to own
(this mac's best was Samantha, from 2010), no key in the client, no
per-visit cost, and nothing to go wrong at runtime. The browser synth is
still there underneath and takes over for anything not in the manifest, so
a half-rendered set still works.

Everything she says moved to `assets/js/lines.js`, because the renderer and
the room both have to read the same list — if those drifted, the room would
ask for audio that was never made.

A clip is named for a hash of its own text, so editing one line orphans one
file and mints one new name. Re-running only pays for what changed, and the
tool lists the orphans rather than guessing.

**The card and the voice are allowed to disagree, exactly once.** The
introduction greets you by name and a pre-rendered take can't know it, so
you're greeted in writing and not out loud. Splicing a synthesised name
into a real recording sounds precisely as bad as it reads.

ElevenLabs returns 44.1kHz stereo, which is a music format for something
that is one woman talking: 3.4 MB for the set. Mono at 24kHz/48kbps is
indistinguishable for speech and lands at 1.3 MB. That transcode lives in
the tool, not in a command someone has to remember.

## 2026-08-13 — she's a bat

**Trinity isn't shaped like a person any more.** She was the same glow-blob
a visitor is, which made her read as another guest rather than as something
the room provided. She's a small hovering bat now: big ears, wings that beat
(faster while she's talking), and the 8-bit face on a dark screen.

Three shapes were built and compared in the room's own light — a floating
head trailing a wisp, a turning solid with shards in orbit, and the bat —
because that comparison can't be done on paper. The losers stay buildable
behind `?form=person|head|shard`.

**The lighting taught us the same lesson twice.** Additive glow cannot hold
a SHAPE against a sunlit wall: the face vanished into the core (bright on
bright), and the first pair of ears simply weren't there. Anything that has
to read as a silhouette is now a DARK plate on normal blending — the one
thing in this room allowed to subtract — with the glow inside it. That's why
she has a visor rather than a face, and why her ears are flat rounded
triangles with a lit inner ear rather than cones.

**The halo went in the bin.** It sliced straight through the new ears, and
the ears already say she isn't a visitor, which was the only job it had.

## 2026-08-12 — somebody to ask

**There's a guide in the bedroom now, and her name is Trinity.** The room hides
almost everything it can do — a fill on the e-kit that opens the studio, a
computer that boots, a window you can shoot planes through — and none of it
announces itself. She stands a couple of metres in front of where you land,
facing you, and tells you one thing at a time when you click her. She opens
by saying what the room IS: that it's alive, that it remembers, that a note
left on the wall outlasts you. Then she gets out of the way. She calls
you by the name you typed on the way in.

She's the bartender's pattern with a different temperament: glow body, 8-bit
face, blink and mouth-flap, a halo so she reads as something the room
provided rather than someone who wandered in. Her voice is `say.js` — the
browser's own synth, free, no key, no network — behind a single door, so
swapping in real audio later is one function body. Every line she speaks also
toasts, so she works with the sound off and in a headset, where `toast()`
mirrors to the wrist HUD by itself. Initialisms get a respelling
table on the way to the synth — LAX reads as "lacks" otherwise, and OS as
"oss" — while the subtitle keeps what was written.

**She follows you.** Past two metres she gives up her post and comes after
you, and where she stops becomes the new post. Getting into the arcade took
an actual fix: the opening is 1.5 m of a 4.6 m wall, so a body walking
straight at you from the far side just meets brick — she wedged there for a
second and a half before her stuck-timer bailed her out, which read as a bug.
`world.arcadeDoor` is new, and she steers for the threshold first, aiming
slightly past it so she doesn't stall in the doorway recomputing. She walks
it now, both ways. The blink survives only for what walking can't solve —
wedged behind furniture, or you took the lift and she's forty metres off —
and she flares half a second on arrival so it reads as arriving, not as a
jump cut.

**She speaks in clauses, not sentences.** The Web Speech API has no SSML
and most engines barely honour punctuation, so a whole line handed over at
once comes out as one breathless run. Every line is now cut at its
punctuation and each clause spoken as its own utterance, with real silence
between them: comma 210ms, full stop 420, question 450. Rate settled at
0.92, after 1.02 gabbled and 0.84 dragged. Because rate and pitch are per-utterance, a sentence ending settles
and a question lifts. And because we know when a clause ends rather than
only when a line does, her mouth shuts in the gaps, which is the part that
actually reads as breathing.

**Her words float in the room** on a card beside her head, parented to her
group so it faces you without any billboard maths — and so it exists in VR,
where a DOM toast is invisible.

**Her words stopped being printed twice.** They were on the card AND along
the bottom of the screen; the bottom one is gone. Nothing she says toasts
now. On a portrait phone the card is off too, so there she is voice only,
which is the trade a small screen buys.

**A portrait phone gets less furniture.** Cat readout to the top-left, the
LAX strip to the top-right and compact (the aircraft type code drops, it's
the widest field and the least load-bearing).

**She only talks about the room she's standing in.** Two pools, picked by
`inArcade()`, drawn from a shuffle bag so a fresh bag never opens with the
line you just heard. Bedroom: the cat, the tele, the pedals, the
mixer, the LA radio, the lava lamp (and that it's the room's, not yours), the
blinds, the curtains, the dimmer, METRO OS, the notes wall, the drum-pad
numerals, the real LAX traffic on the flight strip, and the jets you can
shoot through the glass. Arcade: the four hand-written cabinets, the marquee,
the barkeep, the pool tables, the hoop's fire, the mirror, the lift.

Every line was checked against the code rather than against a summary, after
the first draft confidently sent people to the arcade through the door with
the red neon — which is MIX & MASTER, and leaves the site entirely.

## 2026-08-12 — the furniture becomes furniture

**You can't walk through the pool tables or the bar any more.** The
floorplan was a union of rects you're allowed to stand in, with no way to
say "not here" — so slate and a bar counter were suggestions. There's a
NO_WALK list now, pushed by whatever builds the piece (so a table that
moves takes its collision with it), and subtracted from the walkable
floor. Both tables are solid to the rail, and the bar is solid from the
counter's face back to the wall — you lean on it, the bartender keeps
their side. Walking on foot and in VR both got an escape hatch first: if
the spot you're standing in is illegal, every axis fails and you'd be
welded in place, so anything goes until you're back on legal floor.

**Real props in the smoking corner.** The bong, the ashtray and the joint
were procedural stand-ins; they're scanned models now, swapped in over
the stand-ins the same way the cabinets are — async, size-matched, and if
one never arrives the stand-in stays. A cabinet is sized by its height,
but an ashtray isn't (it's wide and flat) and a joint isn't (it's long
and thin), so the axis you match on is part of the ask. The stand-in
leaves the raycast list when it leaves the scene, or you'd be tapping a
ghost you can't see.

The downlights over those two tables dropped from 1.95 m to 1.5 m. The
scanned props load after the toon pass so they keep their PBR materials,
and a metre and a half of falloff left them essentially black. The throw
is unchanged, so it still can't reach past the bedroom wall — the light
just moved closer to what it's for.

**METRO came off the basketball court.** It was the only thing on that
floor a real court wouldn't have.

## 2026-08-11 — five in a row and the rock catches

**NBA Jam's rule, kept exactly.** Five makes in a row on the arcade court
and you're on fire — and from there every bucket feeds it, so the tenth
in a row looks nothing like the fifth. The ring runs white-hot and
flickers, the lamp over it turns orange and throbs, there's a scorch of
light on the floor underneath, the ball glows in your hands and trails
embers through the air, and the streak board catches flames along its
bottom edge. Each make throws a bigger burst out of the net than the one
before it. One miss and the whole thing goes out at once, which is the
only way a fire streak should ever end.

The embers are one Points cloud with per-vertex colour, born hot orange
and cooling to dark red as they rise, so a flat sprite reads as flame.
They die under the ceiling instead of sailing through it, and nothing
spawns within 1.15 m of your eye — a sprite that close fills the whole
screen, so the rock in your hands says it's burning by glowing instead.
60 fps standing in the fire.

Two traps found on the way, both now written into CLAUDE.md: the toon
pass REPLACES `o.material`, so a material reference held from build time
is a dead object (the rim now reads `mesh.material` each frame); and a
particle pool parking its spare slots at `-999` gets bucketed into the
studio's cull group by bounding-box centre and never renders again.

**The DEFENDER leaderboard is wiped.** All four boards start empty, so
the marquee reads BE THE FIRST on every machine.

## 2026-08-11 — the little court gets its lines right

**The floor was drawn wrong.** The key, the free-throw circle and the
3-point arc were each placed as a fraction of the texture, which put the
arc straight through the free-throw circle — a thing that cannot happen
on a real floor. They're laid out in METRES now, all off one scale
factor, in the proportions a real half court uses: the arc 6.75 m from
the ring, the free-throw line 4.225 m past it, a 1.80 m circle, a 4.90 m
lane, corner lines 0.90 m in from the sideline. 6.75 m doesn't fit in a
4.8×3.9 m room, so everything shrinks together — and lands clear of
everything else, because on a real court it does. The circle is dashed
where it crosses the lane, there's a restricted-area arc under the ring,
and the canvas is sized to the court's own aspect so a circle drawn on it
is a circle on the floor and not an ellipse.

**The red square was around the rim.** On a real backboard the square's
lower edge is level with the ring and the box stands ABOVE it — that's
what you bank off. It was drawn as a box around the ring instead. Now
it's placed from the rim height in world metres (measured: bottom edge
2.90 m, rim 2.90 m), so the geometry can't drift if the board ever moves.

**The shot is THE GYM's shot now.** Two rooms in one world shouldn't ask
your hands to learn two different things, so the arcade hoop got the
whole system: auto-aim at the ring, the camera easing onto the backboard
while you wind up, the arc solved for wherever you're standing so a
makeable shot always exists, a power bar that PING-PONGS 0↔1 instead of
filling once, and the active-reload marker with a green snap band —
release inside it and the power locks to perfect for a guaranteed swish.
Verified from four spots on the floor: releasing on the marker went in
every time, and a deliberately late release missed.

**A streak board on the wall under the rim.** How many you've hit without
missing, and whose run it is. It wakes on the make, flashes, and heats up
as the run goes — white, then HEATING UP at 3, ON FIRE at 5,
UNCONSCIOUS at 7 — with a pip per make, the record in the corner, and a
wash of that colour bleeding onto the wall behind it. A miss puts
STREAK OVER on it and sends it back to sleep. It goes over presence, so
someone else on the court watches your number climb with their own name
nowhere near it.

## 2026-08-11 — the arcade puts names on the wall

**The high scores moved to the marquee.** They used to be a small dark
panel on the north wall, listing DEFENDER and nothing else — the one
game that was actually wired to report. The neon "METRO'S ARCADE" sign
is gone and this hangs where it was, high on the back wall above the
row: a real marquee with bulbs chasing round the frame, a scanned CRT
face, and the top five for one machine at a time. It cycles DEFENDER →
PAC-MAN → TRON → PONG every six seconds; the game's name slides out and
the next one slides in, the rows clatter down one after another like a
departure board, the frame and the wash of light on the wall behind it
turn that machine's colour, and the leader's row catches a slow gold
sweep. A machine nobody's played yet blinks BE THE FIRST.

**All four cabinets report now.** `saveHi` had `gameId === "defender"`
hard-coded, so PAC-MAN, TRON and PONG kept a high score in the page and
threw it away on reload. They all submit, and the `scores` table learned
the name `pac` (it still only allowed `doom`, from the cabinet that used
to stand there). Put a score up and the board flashes white as your row
lands.

It repaints a megapixel, so it only does that while someone is standing
in the arcade, at 30 Hz. The room still holds 60 fps in front of it.

## 2026-08-11 — the city gets on with its life

**Outside is a place now, and it has no edges.** The view through the
bedroom window used to be one painting on one plane — walk to the side
of the glass, look along the wall, and you found where Los Angeles
stopped. The horizon is CYLINDERS centred on the room now (sky at
112 m, mountains at 103, a drifting haze band at 96, the painted city
at 88), and a cylinder has no left edge and no right edge. There is
nowhere to stand and no angle to look where the world runs out.

In front of the rings there's real geometry: a street three storeys
down lit with sodium pools, forty buildings from 34 to 82 m out with
lit windows, and traffic — proper little cars with bodywork, a dark
greenhouse, four tyres, white headlights and red tail lights — running
ten avenues. The HOLLYWOOD sign sits up on the slope, each board
leaning its own way.

**Every room stops leaking into every other one.** Lights were already
culled per room; geometry is too now, so Desi's sea and the venue's
shell can't drift into the corner of the bedroom window.

**PAC-MAN plays like the arcade.** The character has a real position
instead of "tile + progress", so it CUTS CORNERS — slides diagonally
onto the new lane the moment you ask, instead of snapping back to a
tile centre or sailing past and turning late. And the middle row is
finally a tunnel: it was open on the west edge and walled on the east,
so the wrap could never happen.

**Neon in the arcade air.** Motes and embers drifting through the dark
hall, coloured from the room's own palette.

## 2026-08-09 / 08-10 — the headset, and real machines

**THE CREW becomes a place to fly.** No more locker rooms, launch
tubes, catapults or ready kiosks — the lift drops you straight into
the hall, floating, team assigned quietly. The hall keeps its goal
domes, tunnels, islands and disc.

**VR flight, with Echo VR's own bindings.** GRIP grabs anything within
reach — move your hand to drag yourself, release to fling. A/X fire
that wrist's thruster along where the hand points. Left stick click
boosts, right stick click brakes. The disc lives in your grip and the
throw reads the PEAK of your swing, so a lob leaves a lob and a sling
leaves a sling. Flight runs the real game's numbers (5 m/s
self-propelled, 4.7 holding the disc), with team-assisted regrabs
uncapped the way Echo has it.

**The arcade cabinets are real machines** — scanned TRON, PAC-MAN,
PONG and DEFENDER, and they play IN VR: the game floats on a panel in
the room and the controllers become the cabinet. Push-to-talk moved to
B and Y.

**The room got its frame rate back.** One visible transmissive
material was making three.js render the entire scene twice per frame.
Models went on a diet too — 13.4 MB of raw scans down to 1.26 MB.

**Real avatars.** Drop a .glb on the mirror (or paste a link) and it's
you, for everyone. The model is parsed before it's worn, its facing is
worked out from the skeleton, and a head baked at an angle gets
straightened so your gaze lands where you're actually looking.

**Standing still no longer makes you invisible.** Idle poses were
deduplicated forever, so anyone who wasn't moving couldn't be seen by
anyone who arrived later.

## 2026-08-06 / 08-08 — THE STUDIO comes home, and Mutable moves in

**The sequencer room joins the world.** It used to be its own web
page; now it's a room you reach by playing the secret fill on the
e-kit (or via `/studio`). Everyone in it shares one clock and one set
of patterns.

**Mutable Instruments, for real.** Émilie Gillet's own DSP (MIT),
compiled to WebAssembly and run on the audio thread: PLAITS is the
synth voice — all 24 engines, drawn as the hardware panel — and CLOUDS
sits across the whole master bus. Knobs are grabbed and turned like
hardware; the camera holds still while you do it.

**The drum machine grows hands.** Sixteen voices, an MPC overlay with
real pads, Web MIDI so a controller plays it, per-pad samplers with
trim/pitch/gain, 77 real dumbek one-shots, per-machine loop lengths
(polymeter), and patterns that switch on the downbeat. The room
remembers the last session anyone left.

**VR, phase one.** The whole bedroom in a headset: every physical
control, the lift, and a wrist HUD instead of floating toasts.

**The gallery dreams.** Fifteen shader pieces on the acoustic slabs, a
cellular-automaton throw rug, METRO OS becomes a terminal, and the
door sign runs a live shader masked to hand-drawn letters.

## 2026-06-29 / 07-05 — side doors

- `/wip` — the bedroom rebuilt in Babylon.js, a playable snapshot of a
  paused experiment (the live site stays on three.js)
- `/bfam` — a landing page for BFAM — Disoriented
- the bedroom door opens onto the mix & master site

## 2026-06-12 / 06-19 — the venue, the gym, and who you are

**THE GYM** — a full-court cyberpunk basketball room behind the JOIN
sign: real jump, stamina dash, one shared ball, auto-aimed shooting
where the skill is a power meter with an active-reload marker, a
warm-up before tip-off, and twin-thumbstick controls on mobile.

**THE VENUE grows a big screen** — a real watch-party wall: share a
tab or a stream and everyone sees it in sync, over WebRTC with an SFU
and TURN credentials minted by an edge function.

**You get a face.** An outfit picker with build, hair, fit and skin
tone, seen by everyone; 8-bit faces that glow and flap to your live
mic; a mirror in the arcade to check yourself.

**The cat gets a life** — belly rubs, a real voice, and it fetches the
mouse if you throw it. Plus a second pool table, per-room light
culling so phones stop seeing through walls, and PostHog analytics
(off entirely without a key).

## 2026-06-11 — the arena becomes ECHO ARENA

**The full layout, from the real top-down.** The arena is twice the
size and shaped like the game it loves: a long hall of orange and
blue zones around MID, goal domes at each end with backboards and
faint 3-point bubbles, floating island cubes to bank off, mid-wing
tunnels in the side walls, and beyond each dome — three numbered
launch tubes feeding back to a team locker room. You pick ORANGE or
BLUE on the way in, spawn in your locker, and fly the tubes out to
practice. Ready up at your kiosk and ten seconds later the disc goes
live at MID. Grab the yellow catapult handles in a tube and PUNCH
the open space in front of you to launch. Grab a teammate with E and
pull straight through them — the slingshot. Score from outside the
bubble and it pays three. Players and disc both fly the same union
of volumes, so everything banks off everything.

**The blinds work now.** Click them and they gather to the left so
the city shows clean. Shared, like the curtains — everyone sees them
move.

## 2026-06-11 — the room learns some new tricks

**THE CREW learns the real rules.** Grab any wall with E and fling
yourself off it — pure momentum, the way Echo wants it. Every click
in the arena is a swing now: land one on a head in reach and they're
stunned for 2.5 seconds, thrusters dead, disc tumbling loose. Hold F
for a shield; a blocked punch rings off it and the stun bounces back.
Each goal grew a three-point line 18 m out in its own color — release
from behind it for 3, inside for 2. Roles stay emergent: the goalie
is whoever loves their goal enough to body-block for it.

**skincrawler.** A fourth song for the piano — the Crawling request,
done the legal way: an original piece in its mood, the keybed's one
true half step itching over a falling A-minor progression.

**Voices in the room.** Walkie-talkie voice over the presence
channel — on a phone, hold the mic button to talk or tap it to leave
it open; on a keyboard, hold V. In the arena every voice arrives
over an intercom: tight bandpass, a hair of grit, a long metal-room
tail. Never loud.

**The room grows things for regulars.** Time spent here, pets the
cat enjoyed, piano notes, arcade games, portal trips — they add up,
quietly, and the room furnishes itself around you: a snake plant,
a yarn ball, a gold record, a spinning disco ball, a tiny trophy.
What you earn stays.

**The arcade is a place you can hear now.** Cabinet fans, transformer
hum, attract-mode chiptune taking turns across the stereo field, the
occasional coin. Full inside, leaking through the closet doorway,
muffled when the doors close, gone on the boat.

**A lava lamp on the rack, and it works.** Five wax blobs on their
own slow clocks. Click it to switch it off. Why would you, though.

**Chat you can actually read.** Bigger, wider, and it floats above
the game overlays — you can be deep in a DOOM run or drifting in the
arena and still see who said what. Empty box exits on esc, enter, or
a click anywhere else.

**METRO OS.** The desk computer became the front door: rooms
(THE DESI still wants the word; ECHO just opens), messages to metro,
and a music player where the piano plays itself — three original
pieces in that early-2000s rock-ballad mood, mixed at 4%, background
not concert. The bathroom door is locked scenery now and politely
points at the desk.

**The Echo poster stops asking for a password.** Step through.

**The corner slab steps aside.** The acoustic panel by desi's door
was sitting on top of three real notes from real visitors. It moved
to the bare pier between the doors; the notes breathe again.

**Arcade doorway cleaned up.** The corridor shell used to poke 15 cm
into the bedroom like a bunker mouth, and its five pieces shared end
planes that z-fought in moiré blobs. Slim trim now, every face
staggered, nothing flickers. Also: CTRL descends in zero-g.

**Sometimes, godzilla.** Every once in a long while, something tall
crosses the skyline behind downtown, stops, charges blue along its
back, and torches a city block. The towers keep their dignity in
front of it. You'll hear it through the glass twice.

## 2026-06-11 — earlier that day

- THE DESI overhaul: real window holes in the hull, a layered living
  sea, true sound isolation between rooms
- THE CREW arrives: a zero-g Echo-style arena behind the poster,
  networked disc and goals
- Sweden aboard THE DESI — real Gotland sun, moon and weather
- cel shading across the whole world; real 7 cm acoustic slabs
- dark means dark: light layers, sealed corridor, persistent lights
- walls-only notes, unbreakable horizon, bloom, boat dust
- CLAUDE.md so future sessions don't relearn the hard lessons

## 2026-06-10 — the pivot

whoisthemetro.com stopped being a music site and became THE METRO:
a living 3D room that remembers. The bedroom home studio (the real
one — D-Box, Apollo, Kali monitors, the chair pushed aside), notes
that visitors pin to the walls and that stay, a cat with a real
metabolism, real LA weather and LAX flyovers out the window, a
C-major keybed anyone can play, METRO'S ARCADE behind the closet
with real DOOM, and Supabase underneath so none of it forgets.

## before

The old music site lived here from 2025-08 to 2026-05. It's archived
on the `archive/music-studio` branch, heavy media and all.
