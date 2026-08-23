/* ============================================================
   THE METRO — the tour, as a script

   A minute of vertical video for social: Trinity leads you round the
   bedroom and says what things are. This file is the CONTENT — what she
   says and where the camera goes — and record.mjs is the machinery that
   turns it into an mp4.

   HOW A BEAT WORKS

   Each entry is one sentence of narration and one camera move. The move
   runs for exactly as long as the sentence takes to say (measured off
   the rendered mp3, not guessed from the character count — guessing
   drifts about a second over a minute), plus `hold` seconds of silence
   after it so a shot can breathe before the next one starts.

   Camera positions are `[x, z]` on the floor and the camera looks at
   `at: [x, y, z]`, because aiming at a THING is what you actually mean
   and solving the yaw by hand is how a shot ends up pointing at a wall.
   Real coordinates, read out of the running room — see the README.

   Beats can also: open on a particular `month` of the wall, `monthSweep`
   through several, `timeSweep` the clock across the shot, switch the
   `vacuum` on, put a `peer` in the room, open the in-world `pc` window,
   `track` something that moves, and set their own `fov` and `light`.

   WHAT SHE SAYS

   Same rules as lines.js, and they matter more here because this one
   goes out where people who've never been in the room will see it: no
   em dashes (the voice reads them as a stumble), and every claim has to
   be TRUE of the room as it is today. Check the code before you add
   one. Three claims in the first draft of this script needed checking
   and one of them — the cat's name — turned out not to exist in the
   room at all until it was put there.
   ============================================================ */

/* Where things actually are. Pulled from the running room rather than
   from world.js, because half of these hang off groups whose positions
   are local offsets inside other groups, and reading the numbers without
   reading which group they join is how the radio ended up on the desk. */
export const PLACES = {
  window:    [0.00, 1.40, -3.29],
  monitor:   [0.20, 1.05, -3.00],
  keybed:    [0.20, 0.64, -2.31],
  synthPanel:[0.20, 1.11, -2.45],
  backWall:  [0.00, 1.25,  3.30],
  plate:     [0.00, 2.47,  3.25],
  arcade:   [-2.25, 1.20, -0.40],
};

// the wall's months, oldest first. June is the full one — 53 notes — and
// it is what the wall should be showing when she talks about the wall.
const JUNE = "2026-06", JULY = "2026-07", AUG = "2026-08";

export const TOUR = [
  {
    id: "open",
    say: "This is Metro's bedroom. It's alive and there's a lot to interact with.",
    // wide, drifting in from the door end with the night city in the glass
    cam: { from: [1.15, 2.8], to: [0.7, 1.95], at: PLACES.window },
    trinity: [1.5, 1.1], fov: 100,
    month: JUNE,                 // set now so the wall is already full behind us
    hold: 0.3,
  },
  {
    id: "wall",
    say: "Leave a note or picture on the wall and it stays there permanently.",
    // turn to the back wall with June on it: 53 notes, floor to ceiling
    cam: { from: [0.55, 0.8], to: [0.2, 1.85], at: PLACES.backWall },
    trinity: [1.45, 1.7], fov: 86,
    hold: 0.3,
  },
  {
    id: "slider",
    say: "Use the slider to view notes posted from an earlier time.",
    /* Framed to hold the plate AND the wall under it, because the point
       isn't the control, it's that the notes CHANGE when you move it. */
    cam: { from: [0.15, 1.85], to: [0.1, 1.35], at: [0.0, 1.95, 3.30] },
    monthSweep: [JUNE, JULY, AUG, JUNE],
    trinity: [1.5, 1.5], fov: 76,
    hold: 0.35,
  },
  {
    id: "cat",
    say: "There's a cat named Shartacus. Keep her food and water bowls full and her litter clean, or she'll get mad.",
    /* She gets a mark. The camera holds still on the clear middle of the
       floor and she is put on it — orbiting her wherever she'd wandered to
       had the camera inside a wall twice. It also has to stand within 2.3 m,
       because that is the range at which the vacuum in the NEXT beat
       frightens her, and a gag that doesn't fire is just a pause. */
    cam: { from: [1.05, 2.15], to: [0.7, 1.6], track: "cat" },
    catAt: [0.25, 0.55],
    trinity: [1.9, 1.9], fov: 62, light: 0.42,
    hold: 0.3,
  },
  {
    id: "vacuum",
    say: "She hates the vacuum.",
    /* The camera stops moving and PANS to follow her instead — which is
       what you'd do with a real camera and a cat leaving a room. She only
       spooks within 2.3 m, so the beat before this one has to be the close
       orbit; that's why these two are next to each other and not merged. */
    cam: { from: [0.7, 1.6], to: [0.7, 1.6], track: "cat" },
    vacuum: true,
    trinity: [1.9, 1.9], fov: 78, light: 0.42,
    hold: 1.4,                   // the line is two seconds; the bolt needs room
  },
  {
    id: "window",
    say: "Out the window is the city, and when a plane goes over, its real flight number comes up.",
    /* Stood back at the desk. Pressed against the glass the gathered blind
       stack and the pale near-towers fill the frame and read as slats —
       that was the "blinds are broken" bug, and it was the camera. */
    cam: { from: [0.25, -0.2], to: [0.2, -1.15], at: PLACES.window },
    vacuumOff: true,
    trinity: [1.5, -0.4], fov: 82,
    hold: 0.3,
  },
  {
    id: "daynight",
    say: "The room runs on LA time. Watch what the city does after dark.",
    // midday rolling over into night, inside the one shot
    cam: { from: [0.2, -1.15], to: [0.15, -1.5], at: PLACES.window },
    timeSweep: ["2026-08-22T20:00:00Z", "2026-08-23T04:40:00Z"],
    trinity: [1.5, -0.6], fov: 84, light: 0.18,
    hold: 0.4,
  },
  {
    id: "os",
    say: "Click the monitor and you'll see Metro OS and use the command line to see other features.",
    // the in-world window, which hangs where you're standing when it opens
    cam: { from: [0.6, -1.2], to: [0.45, -1.35], at: "pcwin" },
    pc: true,
    trinity: [1.6, -0.9], fov: 74,
    hold: 0.3,
  },
  {
    id: "synth",
    say: "The keyboard uses a famous Eurorack module for its sound engine. Use the computer to send Metro a DM if you know what it is.",
    cam: { from: [0.5, -1.5], to: [0.3, -1.8], at: PLACES.synthPanel },
    open: "synth",
    trinity: [2.0, -0.2], fov: 66,
    hold: 0.3,
  },
  {
    id: "multiplayer",
    say: "This is a multiplayer room where other people can come in and join the experience. There's a chat and voice feature and also an arcade where you can play solo or head to head. Come and check it out.",
    /* Somebody else is standing in the room for this one, built through the
       same code path a real visitor goes through — name label and all. A
       line about other people turning up, over an empty room, is the one
       shot in this video that would read as a lie. The move ends walking at
       the arcade doorway with the arcade lit beyond it. */
    cam: { from: [1.35, 2.35], to: [-0.85, -0.25], at: [-0.55, 1.05, 0.95], atTo: PLACES.arcade, atHold: 0.45 },
    peer: { uid: "tour-guest", name: "kali", color: "#ff9d5c", x: -0.55, z: 0.95, yaw: 0.94 },
    trinity: [1.1, 0.2], fov: 92,
    hold: 1.0,
  },
];

// everything she says, for the renderer
export const tourLines = () => TOUR.map(b => b.say);
