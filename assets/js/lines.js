/* ============================================================
   THE METRO — everything Trinity says

   One source of truth, because there are now two readers: the room, and
   the offline renderer in tools/voice/ that turns each line into an mp3.
   If these ever drifted apart the room would ask for audio that was never
   made, so they don't get to live in two files.

   A line has a SPOKEN form and a DISPLAY form, and they're allowed to
   differ. That matters exactly once: the introduction says your name, and
   a pre-rendered take can't know it. So the card greets you by name and
   the voice doesn't — better than mixing a synthesised name into a real
   recording, which sounds precisely as bad as it reads.

   clipId() is the filename. It hashes the SPOKEN text, so editing a line
   changes its id, the renderer notices one file is missing, and only that
   one gets re-made. Nothing needs a version number.
   ============================================================ */

// fnv-1a, 32-bit. tiny, stable, and identical in node and the browser —
// which is the whole requirement. not a security hash and doesn't need to be.
export function clipId(text) {
  let h = 0x811c9dc5;
  const s = String(text).trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* The introduction. {you} is substituted on the CARD only — see the note
   above about why the voice doesn't say it. Keep this SHORT: an early
   draft ran 25 seconds, which is a long time to stand still being talked
   at before you're allowed to touch anything. */
export const INTRO = {
  bedroom: {
    display: "hey {you}, i'm Trinity. this room is alive, and it remembers. leave a note on the wall and it stays, for everyone, long after you've gone. nothing in here resets. anything else, just ask me.",
    spoken: "hey, i'm Trinity. this room is alive, and it remembers. leave a note on the wall and it stays, for everyone, long after you've gone. nothing in here resets. anything else, just ask me.",
  },
  // she introduces herself ONCE, wherever she happens to be standing when you
  // finally turn round. the old single intro was bedroom-flavoured — it
  // offered you the notes wall — so meeting her in the arcade opened with a
  // description of a room you weren't in. same idea, arcade proof: the thing
  // that persists here is your name on a machine.
  arcade: {
    display: "hey {you}, i'm Trinity. this place is alive, and it remembers. put your name up on one of these machines and it stays there, for everyone, long after you've gone. nothing in here resets. anything else, just ask me.",
    spoken: "hey, i'm Trinity. this place is alive, and it remembers. put your name up on one of these machines and it stays there, for everyone, long after you've gone. nothing in here resets. anything else, just ask me.",
  },
};


/* ---------------------------------------------------------------------------
   THE TOUR — what she says the FIRST time, in order.

   The pool below is what she draws on afterwards. This is the walkthrough,
   and it exists because a first visitor used to be told about the lava lamp
   and then pointed at the arcade before touching anything in the room they
   were standing in. The arcade is a door OUT of the bedroom, so it is last.

   Each step names WHERE the thing is, because "there is a radio" is useless
   in a room you have never stood in. The positions were read out of the
   running world, not guessed:
     the desk + window   z -3.0 to -3.3, straight ahead of the spawn
     the LA radio        x  2.27  the right-hand end of that desk
     the keys            x  0.2   on the desk
     the telecaster      x  1.59  stood beside it
     the drum pads       x -2.15  the far corner, other side
     the arcade doorway  x -2.25  the left-hand wall

   `need` is the thing you have to actually DO. main.js reports it, and she
   skips a step you already did and acknowledges it instead. Nothing is
   gated: clicking always moves her on, because being held at a tutorial is
   worse than missing part of one. ------------------------------------- */
export const TOUR = [
  { id: "note", need: "note",
    line: "start with the walls. aim at any bare patch and click, and you can leave a note or a picture on it. it stays there for everyone, long after you have gone. that is the whole point of this place.",
    ack:  "there it is. that one outlasts both of us." },
  { id: "radio", need: "radio",
    line: "on the desk under the window, right hand end, there is a little radio. switch it on. it picks up real los angeles stations, whatever is actually going out over the air this minute. click it again to shut it up.",
    ack:  "that is a real signal. somebody is talking into a microphone across town right now." },
  { id: "instruments", need: "instrument",
    line: "the keys are on the desk, the telecaster is stood beside it, and the drum pads are over in the far corner. all three of them really play. the guitar is tuned to a minor pentatonic, so you genuinely cannot land on a wrong note.",
    ack:  "there you go. the pedals on the floor change what the guitar sounds like, if you want to get into it." },
  { id: "computer", need: "pc",
    line: "the computer on the desk boots for real. click the screen and type help. type new and it will tell you everything that has changed in here since you last came by.",
    ack:  "it is a proper little terminal. try new if you have not yet." },
  { id: "window", need: "window",
    line: "now go and look out the window. that is a place, not a picture. put your face against the glass and turn, and you will not find the end of the city.",
    ack:  "no edges. i told you." },
  { id: "planes", need: null,
    line: "and that strip along the top is a real aeroplane. we sit ten miles off LAX, so when one crosses the window, one is genuinely up there. the flight number, the aircraft, the altitude, all of it true.",
    ack:  null },
  { id: "light", need: null,
    line: "the blinds and the curtains both draw, and the switch on the wall dims instead of flipping. somewhere between the two ends is the version of this room i like best.",
    ack:  null },
  { id: "cat", need: null,
    line: "the cat is real in the way that counts. it gets hungry, it gets thirsty, and it remembers you. there is a mouse on the floor if you fancy throwing something.",
    ack:  null },
  { id: "arcade", need: null,
    line: "right. that is the room. now, the opening in the wall over there goes through to an arcade, and it is a proper one. i will come with you.",
    ack:  null },
];

// what she says on crossing a threshold, once per room
export const ROOM_LINES = {
  arcade: "right, the arcade. different room, different things to tell you.",
  // NOT "back in the bedroom" — you may never have been. these fire on any
  // crossing, including the first, in whichever order you happen to walk it.
  bedroom: "the bedroom. there's plenty in here i haven't shown you yet.",
};

/* She talks about the room she's STANDING IN. Following you into the arcade
   and then explaining the lava lamp would be worse than saying nothing.

   NOBODY'S NAME IN HERE. She says it once, in the introduction, and never
   again — a guide who keeps working your name into the conversation sounds
   like someone selling you a car.

   NO EM DASHES. They read badly on the card, and they were doing work that
   commas and full stops do better.

   Every line below was checked against the code rather than against a
   summary, after a first draft confidently sent people to the arcade
   through the door with the red neon — which is MIX & MASTER, and leaves
   the site entirely. Go and read the thing before you describe it. */
/* ---------------------------------------------------------------------------
   ORDER MATTERS, and the bedroom list below is now IN the order she says it.

   She used to draw at random, which meant a first visitor could be told about
   the lava lamp and then pointed at the arcade before they had touched one
   thing in the room they were standing in. The arcade is a door OUT of the
   bedroom and it belongs at the end. So: walls first (that is the whole point
   of the place), then the radio, the instruments, the computer, the window and
   the planes, then the light, then the cat, and only then the way through.

   main.js walks this top to bottom for a first visit, SKIPPING anything you
   have already done for yourself, and falls back to the shuffle bag once it
   reaches the end.

   PENDING: a richer set of these with real directions in them ("on the desk
   under the window, right hand end") is written and ready, but every line here
   is a pre-rendered mp3 keyed to a hash of its own text, and the ElevenLabs
   account is on a free plan which refuses this voice over the API. New wording
   would fall back to the browser synth and she would change voice mid-tour,
   which is the exact fault this pass exists to remove. Restore the plan, run
   `node tools/voice/render.mjs`, and the wording can improve in one edit. */
export const GUIDE_LINES = {
  bedroom: [
    "the walls take notes. aim at any bare patch and leave one. it stays there, and everyone who comes after you reads it.",
    "the radio picks up real LA stations. not a loop, not a mood. whatever is actually going out over the air right now.",
    "the telecaster is tuned and waiting. a minor pentatonic lives on it, so you genuinely cannot play a wrong note.",
    "the drum pads are numbered for a reason. play them one through six, in order, and the room will take you somewhere you haven't been.",
    "the pedals on the floor do what pedals do. click one to switch it on, click it again to bypass. the light goes dim when it's out of the chain.",
    "the keys play, and you can change the sound they make. same for the guitar, if the voice it's wearing isn't the one you want.",
    "the little mixer sets the balance. keys, guitar, drums. if one of them is too loud, that's where you fix it.",
    "the computer on the desk actually boots. type help and it'll tell you what it does. type new and it'll tell you what changed since you were last here.",
    "look out the window. that's a real place, not a picture. press up against the glass and turn around, the city never runs out.",
    "that strip along the top is a real aeroplane. we sit ten miles off LAX, so when one crosses the window, one is genuinely up there. the flight number, the type, the altitude, all of it true.",
    "watch the sky out there long enough and a jet goes over. you can take a shot at it. through the glass. i didn't tell you that.",
    "the blinds and the curtains both move. draw them and it's just you and the glow. open them and you've got the whole city back.",
    "the light switch dims rather than flips. somewhere between the two ends is the version of this room i like best.",
    "give the lava lamp a click. and know that everyone else in here sees it come on too. that lamp belongs to the room, not to you.",
    "the cat is real, in the sense that matters. it gets hungry, it gets thirsty, and it remembers. there's a mouse on the floor if you want to throw something.",
    "the open doorway goes through to the arcade. i'll come with you.",
    "careful with the door under the red neon. that one isn't a room. it walks you out of here to mix and master, so finish up first.",
  ],
  arcade: [
    "four cabinets, and all four of them really play. no emulator, no rom. someone sat down and wrote them.",
    "the marquee up there keeps the high scores. real ones, from real people who stood where you're standing.",
    "there's a barkeep at the counter. he'll fix you something and he'll be rude about it. don't take it personally, he's like that with everyone.",
    "the pool tables rack properly and the balls obey. you can play someone else on them, if there's someone else about.",
    "there's a hoop down here. sink a few in a row and something catches fire. you'll know it when it happens.",
    "the mirror on the wall is how you change your look. worth doing before anyone else turns up.",
    "the lift is the way out to everywhere else. call it, step in, pick a floor. one of them wants a password, and i'm not going to give it to you.",
    "the doorway back to the bedroom is right where you came in. i'll follow you through it.",
  ],
};

// every distinct thing she can say, for the renderer to walk
export function allSpoken() {
  return [INTRO.bedroom.spoken, INTRO.arcade.spoken, ...Object.values(ROOM_LINES),
          ...TOUR.map(t => t.line), ...TOUR.map(t => t.ack).filter(Boolean),
          ...GUIDE_LINES.bedroom, ...GUIDE_LINES.arcade];
}
