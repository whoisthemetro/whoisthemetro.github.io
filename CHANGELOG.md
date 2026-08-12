# CHANGELOG

what changed in the room, newest first. every push to main goes
straight to whoisthemetro.com, so each line here shipped the day
it says it did.

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
line you just heard. Bedroom: the cat, the tele, the pedals, the treadle, the
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
