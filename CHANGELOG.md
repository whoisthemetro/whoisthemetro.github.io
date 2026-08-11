# CHANGELOG

what changed in the room, newest first. every push to main goes
straight to whoisthemetro.com, so each line here shipped the day
it says it did.

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
