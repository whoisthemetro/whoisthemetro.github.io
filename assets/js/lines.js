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
  display: "hey {you}, i'm Trinity. this room is alive, and it remembers. leave a note on the wall and it stays, for everyone, long after you've gone. nothing in here resets. anything else, just ask me.",
  spoken: "hey, i'm Trinity. this room is alive, and it remembers. leave a note on the wall and it stays, for everyone, long after you've gone. nothing in here resets. anything else, just ask me.",
};

// what she says on crossing a threshold, once per room
export const ROOM_LINES = {
  arcade: "right, the arcade. different room, different things to tell you.",
  bedroom: "back in the bedroom, then. there's plenty in here i haven't got to yet.",
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
export const GUIDE_LINES = {
  bedroom: [
    "the drum pads are numbered for a reason. play them one through six, in order, and the room will take you somewhere you haven't been.",
    "the walls take notes. aim at any bare patch and leave one. it stays there, and everyone who comes after you reads it.",
    "look out the window. that's a real place, not a picture. press up against the glass and turn around, the city never runs out.",
    "that strip along the top is a real aeroplane. we sit ten miles off LAX, so when one crosses the window, one is genuinely up there. the flight number, the type, the altitude, all of it true.",
    "watch the sky out there long enough and a jet goes over. you can take a shot at it. through the glass. i didn't tell you that.",
    "the cat is real, in the sense that matters. it gets hungry, it gets thirsty, and it remembers. there's a mouse on the floor if you want to throw something.",
    "the telecaster is tuned and waiting. a minor pentatonic lives on it, so you genuinely cannot play a wrong note.",
    "the pedals on the floor do what pedals do. click one to switch it on, click it again to bypass. the light goes dim when it's out of the chain.",
    "the little mixer sets the balance. keys, guitar, drums. if one of them is too loud, that's where you fix it.",
    "the radio picks up real LA stations. not a loop, not a mood. whatever is actually going out over the air right now.",
    "give the lava lamp a click. and know that everyone else in here sees it come on too. that lamp belongs to the room, not to you.",
    "the blinds and the curtains both move. draw them and it's just you and the glow. open them and you've got the whole city back.",
    "the light switch dims rather than flips. somewhere between the two ends is the version of this room i like best.",
    "the computer on the desk actually boots. METRO OS. rooms, messages, music. have a poke around in it.",
    "the keys play, and you can change the sound they make. same for the guitar, if the voice it's wearing isn't the one you want.",
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
  return [INTRO.spoken, ...Object.values(ROOM_LINES), ...GUIDE_LINES.bedroom, ...GUIDE_LINES.arcade];
}
