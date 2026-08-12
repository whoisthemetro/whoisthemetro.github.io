/* ============================================================
   THE METRO — the voice

   The guide talks out loud. This is the whole speech layer and it is
   deliberately one small door: speak() in, isSpeaking() out. Right now
   it's the browser's own speechSynthesis — free, no key, no bill, no
   network — but the room may someday want a real voice (pre-rendered
   lines, or something live). When that day comes, only the body of
   speak() changes; nothing that calls it has to know.

   Two browser truths this works around:
   - voices load ASYNC. ask for the list too early and you get [], so
     the pick is deferred until the first line and re-checked after
     "voiceschanged".
   - Chrome quietly stops the synth after ~15 seconds mid-utterance.
     the long-standing fix is a pause/resume tickle on a timer, so
     there's a watchdog running only while a line is in the air.

   Nothing here throws. A browser with no speechSynthesis (or a user
   who's muted it) still gets a correctly-timed silent "line", so the
   guide's mouth still moves and the tutorial still paces itself —
   the room degrades to subtitles, which is fine.
   ============================================================ */

const SYNTH = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;

// voices we like, best first — warm and un-robotic where the OS has one.
// mac ships Samantha/Alex; chrome adds the Google set; everything else
// falls back to whatever the first en-* voice is.
const WANTED = [
  "Google UK English Female", "Google US English",
  "Samantha", "Alex", "Karen", "Daniel", "Moira",
];

let picked = null;          // the SpeechSynthesisVoice we settled on
let speaking = false;       // a whole LINE is in the air, pauses included
let voicing = false;        // a clause is actually SOUNDING this instant
let queue = [];             // clauses still to say
let gapTimer = null;        // the silence between them
let silentUntil = 0;        // fallback clock when there's no synth
let curUtter = null;
let endCb = null;

/* Rhythm.

   The Web Speech API has no SSML — an utterance is a flat string, and most
   engines barely honour punctuation, so a whole sentence handed over at once
   comes out as one breathless run. The way to get pauses is to stop giving it
   sentences: cut the line at its punctuation, speak each clause as its own
   utterance, and put real silence between them on a timer.

   That buys expression too, because rate and pitch are per-utterance. A clause
   ending a sentence settles (slower, lower); a question lifts; the rest carry
   a little drift so she isn't a metronome. And because we know when a clause
   ENDS rather than just when the line does, her mouth can close in the gaps —
   which is what actually reads as breathing. */
const PAUSE = { ",": 210, ";": 300, ":": 300, "—": 260, "–": 260, ".": 420, "!": 420, "?": 450, "…": 560 };

function clauses(text) {
  const out = [];
  const re = /([,;:—–]|\.\.\.|…|[.!?]+)/g;
  let last = 0, m;
  const push = (body, mark) => {
    const t = body.trim();
    if (!t) {
      // punctuation with nothing before it (". . ." or a stray dash) — just
      // lengthen the pause on whatever we already queued
      if (out.length && mark) out[out.length - 1].pause += PAUSE[mark[0]] || 200;
      return;
    }
    out.push({ text: t, mark: mark || "", pause: mark ? (PAUSE[mark === "..." ? "…" : mark[0]] || 220) : 0 });
  };
  while ((m = re.exec(text))) { push(text.slice(last, m.index), m[1]); last = re.lastIndex; }
  push(text.slice(last), "");
  if (out.length) out[out.length - 1].pause = 0;      // no trailing silence
  return out.length ? out : [{ text: String(text), mark: "", pause: 0 }];
}

// how a given clause should be delivered
function voiceFor(c, i, n) {
  const ends = /[.!?]/.test(c.mark);
  const asks = c.mark.includes("?");
  return {
    // sentence endings settle; everything else keeps moving
    rate: BASE_RATE * (ends ? 0.94 : 1) * (i === 0 ? 1.0 : 0.99),
    // a question lifts, a full stop drops, the middle drifts either side of
    // centre so a long line doesn't flatten into a drone
    pitch: asks ? 1.14 : ends ? 0.98 : 1.04 + Math.sin(i * 1.7) * 0.05,
    last: i === n - 1,
  };
}
// 1.02 gabbled, 0.84 dragged. this is the settled answer.
const BASE_RATE = 0.92;

function pickVoice() {
  if (!SYNTH) return null;
  const all = SYNTH.getVoices();
  if (!all.length) return null;                 // too early — try again next line
  for (const name of WANTED) {
    const v = all.find(v => v.name === name);
    if (v) return v;
  }
  return all.find(v => /^en(-|_|$)/i.test(v.lang)) || all[0];
}

if (SYNTH) {
  // the list usually arrives a beat after boot; take it when it lands
  try { SYNTH.addEventListener("voiceschanged", () => { picked = pickVoice(); }); } catch (e) {}
}

/* Words the synth gets wrong, respelled for the voice ONLY — the subtitle
   still shows what was written. Applied to the spoken string just before it
   reaches the synth, so nothing upstream has to know.

   The initialisms are the ones that actually bite: left alone, every engine
   reads LAX as "lacks" and OS as "oss", and she says both. Spaced-out
   letters make engines spell rather than pronounce. (This table was born
   holding "Æon" → "Ee-on"; the name changed to Trinity, which needs no
   help, but the mechanism keeps earning its place.) */
const SAY_AS = [
  [/\bLAX\b/g, "L A X"],
  [/\bMETRO OS\b/g, "Metro O S"],
  [/\bOS\b/g, "O S"],
  [/Æon/g, "Ee-on"],
];
const respell = (s) => SAY_AS.reduce((t, [re, to]) => t.replace(re, to), String(s));

/* Roughly how long a clause takes, for the silent fallback and the safety
   backstop. 170 wpm is measured, not folklore: a 38-word line at rate 0.84
   took 14.5 s in Chrome, which is ~157 wpm delivered, so ~187 at rate 1.0.
   170 sits just under that — the estimate wants to run a little LONG, since
   it only ever has to outlast the real voice, never cut it off. */
function guessMs(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length || 1;
  return Math.max(700, Math.round((words / 170) * 60000));
}

function clearGap() {
  if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
}

function finish() {
  speaking = false;
  voicing = false;
  curUtter = null;
  queue = [];
  clearGap();
  const cb = endCb; endCb = null;
  if (cb) { try { cb(); } catch (e) {} }
}

// say the next clause, then hold the silence its punctuation asks for
function nextClause() {
  clearGap();
  if (!queue.length) return finish();
  const c = queue.shift();
  const u = new SpeechSynthesisUtterance(respell(c.text));
  if (picked) { u.voice = picked; u.lang = picked.lang; }
  u.rate = c.rate; u.pitch = c.pitch; u.volume = c.volume;
  const done = () => {
    if (u !== curUtter) return;        // a cancel already moved us on
    voicing = false;
    gapTimer = setTimeout(nextClause, c.pause);
  };
  u.onend = done;
  u.onerror = done;
  curUtter = u;
  voicing = true;
  try { SYNTH.speak(u); } catch (e) { done(); }
}

/* say a line. returns the rough duration in ms so a caller can pace
   itself without waiting on the callback. opts.onEnd fires when the
   mouth should stop — real or fallback, always exactly once. */
export function speak(text, { volume = 1, onEnd } = {}) {
  stopSpeaking();
  endCb = onEnd || null;
  speaking = true;

  const parts = clauses(text);
  let total = 0;
  const plan = parts.map((c, i) => {
    const v = voiceFor(c, i, parts.length);
    total += guessMs(c.text) / v.rate + c.pause;
    return { ...c, rate: v.rate, pitch: v.pitch, volume };
  });

  if (!SYNTH || !window.SpeechSynthesisUtterance) {
    // no synth — still mime it WITH the rhythm, so the mouth opens and closes
    // in the same shape the voice would have had. subtitles keep the timing.
    silentUntil = performance.now() + total;
    let at = 0;
    for (const c of plan) {
      const dur = guessMs(c.text) / c.rate;
      setTimeout(() => { if (speaking) voicing = true; }, at);
      setTimeout(() => { if (speaking) voicing = false; }, at + dur);
      at += dur + c.pause;
    }
    return total;
  }

  try {
    if (!picked) picked = pickVoice();
    queue = plan;
    nextClause();
    // belt and braces — if an onend never arrives (it happens), free her
    silentUntil = performance.now() + total + 5000;
  } catch (e) {
    silentUntil = performance.now() + total;
  }
  return total;
}

export function stopSpeaking() {
  queue = [];
  clearGap();
  curUtter = null;                 // so a late onend can't restart the chain
  if (SYNTH) { try { SYNTH.cancel(); } catch (e) {} }
  silentUntil = 0;
  if (speaking) finish();
}

/* Is she making a NOISE this instant — as opposed to being mid-line but
   between clauses? The mouth reads this rather than isSpeaking(), so it
   closes on every comma. That gap is most of what makes her look like she's
   speaking rather than buzzing. */
export function isVoicing() {
  return isSpeaking() && voicing;
}

/* is a line in the air? the guide's mouth reads this every frame. the
   silentUntil check covers both the no-synth fallback and the case
   where onend simply never arrives. */
export function isSpeaking() {
  if (!speaking) return false;
  if (silentUntil && performance.now() > silentUntil) { finish(); return false; }
  if (!SYNTH || !window.SpeechSynthesisUtterance) return silentUntil > performance.now();
  return true;
}

// is there a real voice behind this, or are we miming? (for a "turn on
// your sound" hint, and so the tutorial can lean on subtitles instead)
export function voiceAvailable() {
  if (!SYNTH) return false;
  if (!picked) picked = pickVoice();
  return !!picked;
}
