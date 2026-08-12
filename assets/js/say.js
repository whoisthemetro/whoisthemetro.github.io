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
let speaking = false;       // is a line in the air right now
let silentUntil = 0;        // fallback clock when there's no synth
let watchdog = null;
let curUtter = null;
let endCb = null;

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
   still shows what was written. "Æon" is the reason this exists: every synth
   either spells out the ligature or says "manure" at it, and per the Æon Flux
   article it's /ˌiːɒn/ — "EE-on". Applied to the spoken string just before it
   goes to the synth, so nothing upstream has to know. */
const SAY_AS = [
  [/Æon/g, "Ee-on"],
  [/æon/gi, "ee-on"],
];
const respell = (s) => SAY_AS.reduce((t, [re, to]) => t.replace(re, to), String(s));

// roughly how long a line takes to say, for the silent fallback: ~145 wpm
function guessMs(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length || 1;
  return Math.max(1200, Math.round((words / 145) * 60000));
}

function clearWatchdog() {
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
}

function finish() {
  speaking = false;
  curUtter = null;
  clearWatchdog();
  const cb = endCb; endCb = null;
  if (cb) { try { cb(); } catch (e) {} }
}

/* say a line. returns the rough duration in ms so a caller can pace
   itself without waiting on the callback. opts.onEnd fires when the
   mouth should stop — real or fallback, always exactly once. */
export function speak(text, { rate = 1.02, pitch = 1.06, volume = 1, onEnd } = {}) {
  stopSpeaking();
  const ms = guessMs(text);
  endCb = onEnd || null;
  speaking = true;

  if (!SYNTH || !window.SpeechSynthesisUtterance) {
    silentUntil = performance.now() + ms;       // no synth: mime it, on the clock
    return ms;
  }

  try {
    if (!picked) picked = pickVoice();
    const u = new SpeechSynthesisUtterance(respell(text));
    if (picked) { u.voice = picked; u.lang = picked.lang; }
    u.rate = rate; u.pitch = pitch; u.volume = volume;
    u.onend = finish;
    u.onerror = finish;
    curUtter = u;
    SYNTH.speak(u);
    // chrome's 15 s cutoff: a pause/resume tickle keeps the queue alive
    clearWatchdog();
    watchdog = setInterval(() => {
      if (!speaking) return clearWatchdog();
      try { SYNTH.pause(); SYNTH.resume(); } catch (e) {}
    }, 9000);
    // belt and braces — if onend never fires (it happens), free the mouth
    silentUntil = performance.now() + ms + 4000;
  } catch (e) {
    silentUntil = performance.now() + ms;
  }
  return ms;
}

export function stopSpeaking() {
  if (SYNTH) { try { SYNTH.cancel(); } catch (e) {} }
  silentUntil = 0;
  if (speaking) finish();
}

/* is a line in the air? the guide's mouth reads this every frame. the
   silentUntil check covers both the no-synth fallback and the case
   where onend simply never arrives. */
export function isSpeaking() {
  if (!speaking) return false;
  if (silentUntil && performance.now() > silentUntil) { finish(); return false; }
  if (!SYNTH || !curUtter) return silentUntil > performance.now();
  return true;
}

// is there a real voice behind this, or are we miming? (for a "turn on
// your sound" hint, and so the tutorial can lean on subtitles instead)
export function voiceAvailable() {
  if (!SYNTH) return false;
  if (!picked) picked = pickVoice();
  return !!picked;
}
