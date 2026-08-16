/* djlines.js — the voice on the bathroom's ceiling speaker.

   Mall radio between the songs. He is not a character you can talk to and he
   has no idea you're in there; he's a station ident that happens to be
   playing over a toilet, which is the joke.

   Same deal as Trinity (lines.js / tools/voice/render.mjs): the script is
   FIXED, so it's rendered to mp3 once by `tools/voice/render-dj.mjs` and the
   room plays files. One voice for everybody, no key in the client, no
   per-visit bill. A clip is named for a hash of its own text, so editing a
   line orphans one file and mints one new name.

   Keep them SHORT. This plays at a tenth of a flush through a 3.6 kHz
   lowpass; a long sentence turns to mush before it gets anywhere. */

import { clipId } from "./lines.js";

export const DJ_LINES = [
  "You just heard I Need a Burrito, by Fart God. The hottest jam of the summer!",
  "That was Fart God with I Need a Burrito. Six weeks at number one, folks. Six weeks!",
  "I Need a Burrito, by Fart God, coming at you live from the METRO food court.",
  "That's Fart God — I Need a Burrito. If that one doesn't move you, check your pulse!",
  "You're listening to METRO Radio. That was I Need a Burrito, by Fart God.",
  "Fart God, everybody! I Need a Burrito. What a summer. What a time to be alive!",
];

export const djClips = () => DJ_LINES.map((t) => ({ id: clipId(t), text: t }));
