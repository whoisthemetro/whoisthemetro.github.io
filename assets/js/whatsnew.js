/* ============================================================
   THE METRO — what's new, for the people in the room

   CHANGELOG.md is the builder's log: long, technical, and full of the
   reasons a thing was done that way. This is the other half — what a
   VISITOR would want to know. What changed, what to go and look at,
   in plain words, newest first.

   It is a translation, not a copy. One line per thing, no jargon, no
   file names, and no explanation of how it works. If a line doesn't
   make someone want to go and try something, it doesn't belong here.

   ---- KEEP THIS UP TO DATE ----
   Every job that changes something a visitor could NOTICE adds a line
   here, in the same commit. If the change is invisible from inside the
   room — a refactor, a draw-call win, a test — it belongs in
   CHANGELOG.md only and must NOT be listed here. Padding this with
   things nobody can see is how it stops being worth reading.

   `date` is YYYY-MM-DD in LA. Newest block first. The terminal turns
   the recent ones into "today" and "yesterday" on its own.
   ============================================================ */

export const WHATS_NEW = [
  {
    date: "2026-08-18",
    items: [
      "on a phone the walk stick has a slow speed in it now. you can ease up to the wall and stop instead of marching past it, and resting your thumb on the stick no longer drifts you across the room",
      "pressing the stick and holding still works too — it used to need a wiggle before you'd move at all",
      "and when you tap the floor to walk somewhere, you go AROUND the furniture in the way instead of stopping dead at it",
      "trinity has a new voice, and it's her voice everywhere now instead of changing on you halfway through",
      "she gives you a proper tour of the bedroom too, and she tells you where things actually are. the radio on the right hand end of the desk, the drum pads in the far corner, that sort of thing",
    ],
  },
  {
    date: "2026-08-17",
    items: [
      "trinity gives you the room in a sensible order now, starting with the walls and leaving the arcade until last. and if you already found the radio yourself, she won't walk you to it",
      "she also stopped changing voice halfway through a sentence, and stopped talking over herself when you tap her twice",
      "on a phone held upright you can finally SEE. the view was pinched down to a slot; now you can take in a whole wall at once",
      "and you can just tap the floor to walk there. it turns you to face the spot on the way, so you don't have to aim the camera first",
      "you can see people again. someone standing away from the window used to be a black shape with floating eyes — now they're a whole person wherever they stand",
      "the mic stopped echoing. if someone else's voice is coming out of your speaker, yours holds off for a moment instead of sending it back to them",
      "hold the mic button to talk. a quick tap used to leave it wide open, which is how the echo started — double-tap now if you really do want it left on",
      "and it only sends when you're actually saying something, so the room doesn't hear your fan or your dog",
    ],
  },
  {
    date: "2026-08-16",
    items: [
      "the planes are back. the flight feed we used shut its doors, so the window goes through our own now — real jets over LAX again, with their real flight numbers",
      "the cat stays off the keyboard. it was funny once",
      "on a phone the cat and the headcount sit in the top corners whichever way you hold it, and the flight strip stops leaving a ghost of itself behind",
      "the bedroom stays in the bedroom now — walk through to the arcade and the rain, the radio, the city outside and the cat all stop at the wall",
      "trinity works out which room she met you in. say hello in the arcade and she'll talk arcade, not bedroom",
    ],
  },
  {
    date: "2026-08-15",
    items: [
      "there's a bathroom off the arcade, and it's the strangest room in here. the mirrors really reflect, the toilets really flush, and it echoes like tile should",
      "you can write on the bathroom walls. pick a colour and drag. what you draw stays for everyone, and right-click lifts a stroke back off",
      "there's music in the bathroom, out of a ceiling speaker, with a dj talking between the songs",
      "the avatar creator moved onto a podium in the arcade corner. you at full size, and you can grab and spin yourself round",
      "everybody's made of the same blocks now. new hair that isn't a swim cap, and five pairs of shoes — a platform genuinely makes you taller",
    ],
  },
  {
    date: "2026-08-14",
    items: [
      "los angeles goes tron after dark. neon down every building, the streets lit like a circuit board, light trails behind the traffic",
      "the sign up on the hill says METROWORLD, and at night it's neon",
      "the city out the window has a real street plan now — a boulevard running from under you straight at downtown, and a freeway crossing on stilts",
      "the moon stopped being a black ball floating over the city in the daytime. it's a proper crescent, and it's the right way round",
    ],
  },
  {
    date: "2026-08-13",
    items: [
      "trinity is a bat. she hovers, her wings beat, and she glows in time with her own voice",
      "she talks out loud now — a real recorded voice, not a robot one",
      "she follows you into the arcade instead of waiting by the window",
    ],
  },
  {
    date: "2026-08-12",
    items: [
      "there's a guide in the bedroom. she's called trinity, she knows your name, and she'll tell you one thing about the room at a time",
      "you can't walk through the pool tables or the bar any more",
      "the bong, the ashtray and the joint in the smoking corner are real scanned objects now",
    ],
  },
  {
    date: "2026-08-11",
    items: [
      "sink five in a row on the arcade hoop and you catch fire, nba jam style. the ball trails embers and the backboard burns",
      "the little court's lines are drawn properly — the arc no longer runs through the free-throw circle",
    ],
  },
];

/* newest first, and never trust the order it was typed in */
export function whatsNew() {
  return [...WHATS_NEW].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* "today" / "yesterday" / "sat 15 aug" — a date is a worse answer than a
   day when the thing you're asking is "what changed since I was last here" */
export function dayLabel(iso, now = new Date()) {
  const la = (d) => new Date(d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const today = la(now);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((midnight - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return then.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toLowerCase();
}
