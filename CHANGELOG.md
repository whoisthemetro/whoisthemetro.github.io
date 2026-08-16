# CHANGELOG

what changed in the room, newest first. every push to main goes
straight to whoisthemetro.com, so each line here shipped the day
it says it did.

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
