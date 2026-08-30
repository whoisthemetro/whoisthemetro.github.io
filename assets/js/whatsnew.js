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
    date: "2026-08-30",
    items: [
      "the room opens in its chunky PS1 look now. the little switch still takes you back to the clean version whenever you want",
    ],
  },
  {
    date: "2026-08-30",
    items: [
      "Shartacus has a volume control for Metro now — it lives only in admin mode, right under her little status readout",
      "Shartacus has been turned way down by default, so she can keep talking without taking over the room",
    ],
  },
  {
    date: "2026-08-29",
    items: [
      "the little PS1 switch in the corner works on a phone now — tap it for the chunky room and Trinity's old-game voice, then tap it again to come back",
      "in PS1 mode, Trinity comes through the room like an old game guide: lo-fi speaker colour and a little digital grit, without changing the music or anyone else's voice",
      "press P for a little PS1 lens: the room gets chunky pixels, dithered colour and closer fog. press P again to go back — it only changes your own view",
      "the little mixer on the desk has Clouds now. the keys and guitar share dry/wet, reverb and density controls; drums and the room stay dry, and density rests at 50% before getting grainy either way",
    ],
  },
  {
    date: "2026-08-28",
    items: [
      "the Mac Studio in the bedroom is Metro's model now, with its little white status light facing the chair",
      "the D-Box underneath the big bedroom monitor is Metro's detailed model now — the front controls face the chair, its green button glows, and the monitor is sitting right on it",
      "layout mode can make the desk narrower now without squashing it. [ and ] (or , and .) change its width; + and - still resize the whole thing",
      "the synth’s chassis, keybed and button move together in layout mode, instead of coming apart when you grab the button",
    ],
  },
  {
    date: "2026-08-27",
    items: [
      "the Apollo Twin on the bedroom rack is the real model now — all the knobs, ports, labels and lights are there",
      "metro's own desk model is in the bedroom now, replacing the temporary one that was built out of boxes",
    ],
  },
  {
    date: "2026-08-25",
    items: [
      "the keyboard and guitar panels are built for a phone now. the knobs are more than twice the size they were and the panel fills the screen instead of sitting in a strip along the bottom",
      "and they work sideways. turn the phone and the panel rearranges itself into two columns — before, turning it pushed the top half of the panel off the screen, so the engine and every knob reading were just gone",
      "turn the phone back and it rearranges again. whichever way you're holding it, the whole panel is on screen",
    ],
  },
  {
    date: "2026-08-25",
    items: [
      "the keyboard and the guitar belong to the room now. turn a knob on either one and it's turned for everyone — pick an engine on your phone and it's the same engine on your laptop, and the same one the person standing next to you is playing. it stays that way after everybody leaves, too",
      "the arpeggiator is the one thing that stays yours. it plays notes, and everyone running their own copy of it would be the same chord four times at once",
      "the pedals start switched off. six effects nobody chose used to sit between you and the first note you played — flick on the ones you want",
      "the guitar's panel is the same size as the keyboard's now, and everything on it has room to breathe",
      "the cat is half as loud",
      "the gold record by the door has come down, and you can post notes on that stretch of wall again",
    ],
  },
  {
    date: "2026-08-25",
    items: [
      "the keyboard on the phone panel is an octave now, c to c. it used to be a flat ten keys, which landed you in the middle of the next octave and never resolved — now it's however many notes the scale has, ending where it started",
      "one tempo for the whole room. change it on the keyboard and the guitar's echo changes with it",
      "the arpeggiator and hold don't come back on when you do. everything else about your sound is still where you left it — the engine, the knobs, the scale — but you don't walk back in to a room already playing itself at you",
      "no more little words popping up every time you nudge a setting. the panel already says what it is",
      "the knobs on both panels are the same size and in a straight line, and they reach both edges instead of trailing off",
      "tapping the guitar's button while the keyboard's panel is up now actually opens the guitar's. it used to leave the old one sitting there, so the button looked broken and every knob you turned belonged to the wrong instrument",
    ],
  },
  {
    date: "2026-08-22",
    items: [
      "trinity answers every time you click her now. she'd go quiet after the first question — she was waiting on the next line to download — and that little card of text that used to appear when she couldn't talk is gone for good. she just talks.",
      "on a phone, the synth and guitar panels now sit at the bottom of the screen where your thumb is. drag the knobs with your finger instead of trying to aim at them",
      "and the phone panel brings a keyboard with it — big keys along the bottom, so you can play while the parameters are up",
      "every setting has a minus and a plus now instead of tapping to cycle forward, so you can go back one scale without going forward through five",
      "both the keyboard and the guitar have an octave shifter now, so the same keys and frets can play three octaves lower or two higher",
      "the guitar has a real module in it now. the same kind of thing as the keyboard's, but a resonator: press the button on its body and you get six models and four knobs, and every fret rings it",
      "the synth button on the keyboard can be moved where metro wants it",
      "the cat has a name. she's called shartacus, it's on her readout, and trinity introduces her properly now",
      "trinity gets out of your way properly. walk into her and she used to shudder on the spot like she couldn't decide which way to go — now she steps aside, slips round you if there's a wall behind her, and waits until you move off before going back to her spot",
      "the wall takes notes again. it had quietly run out of room — every wall in the bedroom was full, so posting anything just did nothing",
      "and it can't fill up again. the wall shows one month at a time now, with a little plate above it telling you which. new notes go on this month; the months behind it are all still there",
      "there are arrows on that plate, and a row of ticks — one per month since the room opened, tall where it was busy. tap one to go and read that month",
      "nothing was thrown away. every note anyone has ever left is still there, on the month they left it — and once a month is over it's sealed, so what's up there is exactly what was up there",
    ],
  },
  {
    date: "2026-08-19",
    items: [
      "in a headset, people can see you MOVE now. your arms follow your controllers — point at something, wave, hold a drink up — and your head turns when you look around instead of your whole body swinging with it",
      "and your body only comes round once you've really turned to look, so you can glance sideways at someone without spinning on the spot",
      "people look like people in the dark now. standing in an unlit corner used to flatten you into a cardboard cut-out — you get proper light and shadow down your body instead, and an edge that keeps you readable",
      "trinity talks at a normal volume now, everywhere — she was too loud on every screen and in the headset, not just one of them",
      "in a headset, the computer, the radio and the look-builder all open properly now. a panel appears in front of you and you point at it — no more being told to go and find a flat screen",
      "the radio has a real power button in there too, and scans both ways. you don’t have to walk the whole dial round to switch it off any more",
      "close a panel when you’re done, or just walk away from it — it lets go on its own",
      "and the art on the sound panels sits still in a headset. it used to slide around with your head and black out at certain angles",
      "there\u2019s a garden now. sit at the computer, type `music`, and it walks you out to a path with flower beds either side. every plant in them is one of metro\u2019s sound design tracks, grown in the shape of its own sound \u2014 the long ones are long pieces, the spiky ones are the busy ones. click a plant to hear it, click it again to stop",
      "the plant lights up as it plays, so you can see how far into a piece you are from the other end of the path",
      "and each one comes from its own bed, so you can walk up to a track and away from it",
      "you\u2019re on your own out there. it\u2019s a place for listening, not for running into people",
      "the room runs several times smoother on a computer, and worst of all at the desk, where it used to crawl. it was lighting every surface with forty-four lamps at once AND redrawing every piece of art on the walls from scratch, every single frame",
      "trinity always sounds like trinity now. on a phone she'd sometimes answer in a flat robot voice instead of her own — that can't happen anymore",
      "and if she can't be heard at all, she holds the words up on a card beside her instead of mouthing at you in silence",
      "the room gets its sound back on its own. take a call, lock your phone, switch apps — everything used to stay dead until you reloaded. now the next thing you touch turns it back on",
    ],
  },
  {
    date: "2026-08-18",
    items: [
      "the keyboard under the desk has a real synth in it now. press the little button on its left cheek and a panel opens over the keys — twenty four different sounds, five knobs to bend them with, and the keys keep playing the whole time it's up",
      "that panel has an arpeggiator. hold a few keys, turn HOLD on, and it runs while you go and twist things. pick a scale and the keyboard plays in it",
      "trinity stopped shadowing you everywhere. she waits in the room you're in — by the window in the bedroom, just inside the door in the arcade — and if you walk into her she steps out of your way",
      "the planes are back. the flight feed we used shut its doors, so the window goes through our own now — real jets over LAX again, with their real flight numbers",
      "the cat stays off the keyboard. it was funny once",
      "on a phone the cat and the headcount sit in the top corners whichever way you hold it, and the flight strip stops leaving a ghost of itself behind",
      "on a phone the walk stick has a slow speed in it now. you can ease up to the wall and stop instead of marching past it, and resting your thumb on the stick no longer drifts you across the room",
      "pressing the stick and holding still works too — it used to need a wiggle before you'd move at all",
      "and when you tap the floor to walk somewhere, you go AROUND the furniture in the way instead of stopping dead at it",
      "the cat's food and water are little pictures now instead of words, so nothing gets chopped in half on a phone. and on a computer they've moved to the top of the screen",
      "when a plane goes over, you can read the whole thing again. it gets its own line on a phone instead of fighting for space",
      "the room gets itself ready while you type your name, so it stops stuttering in your first few seconds inside",
      "the room is much easier on a phone now. it was quietly redrawing itself up to 120 times a second, which is why it got hot in your hand",
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
