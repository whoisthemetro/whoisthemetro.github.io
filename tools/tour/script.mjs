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
   Real coordinates, read out of the running room — see tools/tour/README.

   WHAT SHE SAYS

   Same rules as lines.js, and they matter more here because this one
   goes out where people who've never been in the room will see it: no
   em dashes (the voice reads them as a stumble), no names except the
   opening, and every claim has to be TRUE of the room as it is today.
   Check the code before you add one. That list has been wrong before.
   ============================================================ */

/* Where things actually are. Pulled from the running room rather than
   from world.js, because half of these hang off groups whose positions
   are local offsets inside other groups, and reading the numbers without
   reading which group they join is how the radio ended up on the desk. */
export const PLACES = {
  window:    [0.00, 1.55, -3.29],
  monitor:   [0.20, 1.05, -3.00],
  keybed:    [0.20, 0.64, -2.31],
  synthPanel:[0.20, 1.11, -2.45],
  edrum:    [-2.15, 0.94, -2.25],
  tele:      [1.53, 0.63, -2.62],
  lava:      [1.96, 0.83, -2.68],
  backWall:  [0.00, 1.30,  3.30],
  plate:     [0.00, 2.47,  3.25],
  ceiling:   [0.00, 2.68,  0.20],
  arcade:   [-2.25, 1.20, -0.40],
};

export const TOUR = [
  {
    id: "open",
    say: "This is Metro's bedroom. Everything in here is real, and most of it does something.",
    cam: { from: [1.1, 2.75], to: [0.7, 2.0], at: [0.0, 1.5, -3.29] },
    trinity: [1.5, 1.1], fov: 100,
    hold: 0.35,
  },
  {
    id: "city",
    say: "That's Los Angeles out the window. Not a picture of it. You can walk up to the glass and look down the street.",
    cam: { from: [0.7, 2.0], to: [0.15, -2.0], at: [0.0, 1.45, -3.29] },
    fov: 88,
    trinity: [1.4, 0.2],
    hold: 0.3,
  },
  {
    id: "planes",
    say: "And those are real aeroplanes. Live traffic into LAX, with the flight numbers they're actually flying under.",
    cam: { from: [0.15, -2.0], to: [-0.1, -2.45], at: [0.0, 1.62, -3.29] },
    fov: 78,
    trinity: [1.3, -0.9],
    hold: 0.3,
  },
  {
    id: "desk",
    say: "The computer works. There's a whole little operating system on it, and it'll tell you what's new since you last came by.",
    cam: { from: [0.95, -1.35], to: [0.5, -1.95], at: PLACES.monitor },
    fov: 70,
    trinity: [1.5, -1.8],
    hold: 0.25,
  },
  {
    id: "synth",
    say: "The keyboard has a proper synthesiser in it. Twenty four different engines, five knobs, and an arpeggiator you can leave running.",
    cam: { from: [0.5, -1.5], to: [0.3, -1.8], at: PLACES.synthPanel },
    fov: 66,
    trinity: [1.35, -1.6],
    open: "synth",
    hold: 0.3,
  },
  {
    id: "drums",
    say: "The drums are real too. Play the right fill on them and a door opens that isn't in this room.",
    cam: { from: [-0.4, -0.5], to: [-1.05, -1.05], at: PLACES.edrum },
    fov: 78,
    trinity: [-0.8, -1.1],
    hold: 0.3,
  },
  {
    id: "cat",
    say: "There's a cat. She gets hungry whether you're here or not, and she remembers being fed.",
    cam: { follow: "cat", orbit: 0.5, sweep: 0.7, radius: 1.35 },
    fov: 72,
    trinity: [1.2, 0.9],
    hold: 0.3,
  },
  {
    id: "wall",
    say: "You can leave something on the wall. Write it, pin it up, and it stays there for everyone who comes after you.",
    cam: { from: [0.3, 0.7], to: [0.1, 1.7], at: [0.0, 1.25, 3.30] },
    fov: 86,
    trinity: [1.4, 1.8],
    hold: 0.3,
  },
  {
    id: "months",
    say: "The wall keeps every month it's ever had. Slide it back and you can read what people wrote in June.",
    cam: { from: [0.1, 1.7], to: [0.05, 1.15], at: PLACES.plate },
    fov: 62,
    trinity: [1.5, 1.6],
    hold: 0.3,
  },
  {
    id: "ceiling",
    say: "At night the ceiling turns into the actual sky over Los Angeles, planets and all.",
    cam: { from: [0.2, 1.0], to: [0.2, 0.25], at: PLACES.ceiling },
    trinity: [1.5, 0.6], light: 0.05, fov: 100,
    hold: 0.3,
  },
  {
    id: "arcade",
    say: "And this is one room out of seven. Through there is the arcade. Come and find the rest.",
    cam: { from: [-0.3, -0.4], to: [-1.4, -0.4], at: PLACES.arcade },
    fov: 90,
    trinity: [-1.0, 0.5],
    hold: 0.9,
  },
];

// everything she says, for the renderer
export const tourLines = () => TOUR.map(b => b.say);
