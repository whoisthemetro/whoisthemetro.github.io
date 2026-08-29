/* ============================================================
   THE METRO — the voice

   The guide talks out loud. This is the whole speech layer and it is
   deliberately one small door: speak() in, isSpeaking() out.

   She has ONE voice: the takes in assets/audio/trinity/, rendered once by
   tools/voice/render.mjs. Every line she owns is in there, so a line that
   arrives with a clip id NEVER reaches the browser synth — if the recording
   can't be played she mimes it in silence instead. That rule is the point
   of this file, not a detail of it: the fallback used to fire on phones
   (see playing-a-take below) and people met two different Trinitys in one
   conversation. Silence is a smaller lie than a stranger's voice.

   The speechSynthesis machinery below is still here and still works, but
   only for a caller that hands over a line with no clip — today, nobody.

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

/* The room's audio graph, handed in rather than imported: this file is the
   one small door for speech and shouldn't reach into ambience.js on its own
   (the standalone studio page loads it without a room). Set it and her
   recordings ride the same master compressor as the rest of the room. */
let graph = null;
export function useAudioGraph(fn) { graph = fn; }
// A display mode can colour Trinity without colouring the whole room. Her
// rendered takes are the only sources that ever pass through this little chain.
let trinityLoFi = false;
let tone = null;
export function setTrinityLoFi(on) { trinityLoFi = !!on; applyTone(); }

// voices we like, best first — warm and un-robotic where the OS has one.
// mac ships Samantha/Alex; chrome adds the Google set; everything else
// falls back to whatever the first en-* voice is.
/* Pick the best voice the DEVICE happens to have, rather than naming one and
   hoping. This matters more than any parameter: the same code sounds fine on
   a machine with modern voices installed and robotic on one without, and we
   don't get to ship the voice — the visitor's OS owns it.

   Scored, best wins. "Premium"/"Enhanced" are Apple's downloadable
   high-quality versions and are a different class from the compact ones that
   ship by default; "Natural"/"Neural" are the Microsoft and Google
   equivalents. The named list at the bottom is the modern Apple set. Samantha
   and Alex are deliberately LAST-resort — they're the 2010-era compact voices
   and they're what a stock Mac falls back to. */
// who the caller would LIKE to sound like, best first. the api exposes no
// gender and no quality flag, so a name list is the only lever there is —
// and it belongs with the character, not in here. set by preferVoices().
let prefer = [];
export function preferVoices(names) { prefer = names || []; picked = null; }

function scoreVoice(v) {
  const n = v.name;
  let s = 0;
  if (/premium|enhanced/i.test(n)) s += 100;    // apple's downloadable good ones
  if (/natural|neural/i.test(n)) s += 90;       // microsoft / google equivalents
  if (/^Google /.test(n)) s += 70;              // chrome's network voices
  if (/^Microsoft /.test(n)) s += 40;
  // earlier in the caller's list is worth more, and any hit beats a stranger
  const i = prefer.findIndex(g => new RegExp(`\\b${g}\\b`, "i").test(n));
  if (i >= 0) s += 80 - i * 4;
  if (!v.localService) s += 20;                 // network voices are the better ones
  if (/^en-(GB|US)/i.test(v.lang)) s += 10;
  // the novelty voices are real entries in this list and must never win
  if (/bells|boing|bubbles|cellos|organ|trinoids|whisper|wobble|zarvox|bad news|good news|jester|superstar|bahh|albert|fred|ralph|junior|grandma|grandpa|rocko|deranged|hysterical|bells/i.test(n)) s -= 300;
  return s;
}

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
/* SPLIT AT SENTENCES ONLY.

   The first version cut at commas too, and that was the mistake: an engine
   already knows what a comma does INSIDE an utterance, and it shapes the
   whole phrase around it. Cutting there threw that away and replaced it with
   a dead 210 ms hole, so every list came out as a stack of separate little
   statements. Commas, colons and dashes now stay in the text where the voice
   can do its own job with them; we only take the gap between sentences,
   where a real speaker breathes anyway. */
const PAUSE = { ".": 260, "!": 260, "?": 300, "…": 420 };

function clauses(raw) {
  const text = String(raw ?? "");   // never throw on a bad line; say nothing instead
  const out = [];
  const re = /(\.\.\.|…|[.!?]+)/g;
  let last = 0, m;
  const push = (body, mark) => {
    const t = body.trim();
    if (!t) {
      // punctuation with nothing before it (". . ." or a stray dash) — just
      // lengthen the pause on whatever we already queued
      if (out.length && mark) out[out.length - 1].pause += PAUSE[mark[0]] || 200;
      return;
    }
    // keep the terminator ON the text: "one." reads differently to "one",
    // and the engine needs it to fall at the end of a sentence
    out.push({ text: t + (mark && !/[.!?]$/.test(t) ? (mark === "..." ? "…" : mark) : ""),
               mark: mark || "", pause: mark ? (PAUSE[mark === "..." ? "…" : mark[0]] || 240) : 0 });
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
// full speed. the slowness was never mostly the rate — it was the holes
// punched in at every comma, and those are gone now.
const BASE_RATE = 1.0;

function pickVoice() {
  if (!SYNTH) return null;
  const all = SYNTH.getVoices();
  if (!all.length) return null;                 // too early — try again next line
  const en = all.filter(v => /^en(-|_|$)/i.test(v.lang));
  if (!en.length) return all[0];
  return en.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

// which voice did we land on, and how good is the pick — so a page (or a
// smoke test) can tell whether this device has anything decent installed
export function voiceInfo() {
  if (!picked) picked = pickVoice();
  return picked ? { name: picked.name, lang: picked.lang, local: picked.localService, score: scoreVoice(picked) } : null;
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
/* ---- the rendered take, if there is one -------------------------------
   Her script is fixed, so the good version of this is an mp3 rendered once
   (tools/voice/render.mjs) rather than whatever synth the visitor's device
   happens to own. The manifest lists what got made; anything missing from
   it falls through to the browser voice below, so a half-rendered set still
   works and the room never waits on a 404 to find that out. */
let clipSet = null;                       // ids we know exist
let audio = null;                         // the element currently playing
const CLIP_DIR = "assets/audio/trinity/";

let clipsPromise = null;
export function loadClips() {
  if (clipsPromise) return clipsPromise;
  clipsPromise = (async () => {
    try {
      const res = await fetch(CLIP_DIR + "manifest.json", { cache: "force-cache" });
      if (!res.ok) { clipSet = new Set(); return false; }
      const m = await res.json();
      clipSet = new Set(m.clips || []);
      return clipSet.size > 0;
    } catch (e) { clipSet = new Set(); return false; }   // settled and empty: the synth, deliberately
  })();
  return clipsPromise;
}
export const clipsReady = () => !!(clipSet && clipSet.size);

/* How loud is she RIGHT NOW, 0..1.

   Once she's playing real recordings this stops being a guess. The clip goes
   through the room's own audio graph (so it rides the master compressor like
   everything else does) by way of an analyser, and the level off that drives
   her mouth and her glow. The difference is that she now pulses on her actual
   syllables instead of on a sine wave pretending to be speech — you can see
   her land on a stressed word.

   The browser synth gives us nothing to measure, so that path keeps the
   old oscillator and level() reports -1 to say "no idea, fake it". */
let analyser = null, levelBuf = null, level = 0;
export function voiceLevel() {
  if (!analyser) return -1;
  analyser.getByteTimeDomainData(levelBuf);
  let peak = 0;
  for (let i = 0; i < levelBuf.length; i += 4) {
    const v = Math.abs(levelBuf[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  // speech peaks well below 1; lift it into a usable range and smooth the
  // fall so she doesn't strobe between syllables
  const want = Math.min(1, peak * 3.2);
  level += (want - level) * (want > level ? 0.55 : 0.14);
  return level;
}

/* ---- playing a take --------------------------------------------------
   WEB AUDIO FIRST, and that ordering is the whole mobile fix.

   This used to be an <audio> element, which is fine on a desktop and a trap
   on a phone. iOS only lets an element START inside a user gesture, and by
   the time we've waited on the manifest or a fetch the gesture is long gone
   — play() rejects. The old code read that as "the file let us down" and
   said the line on the browser synth instead, which is exactly why tapping
   her on a phone sometimes got a robot instead of her.

   A decoded buffer has no such rule: once the room's context is running
   (the [enter] tap did that) a BufferSource plays whenever we ask it to,
   from a promise, from a timer, from anywhere. The element stays behind it
   as a second try for a browser with no context up yet. Neither of them is
   allowed to reach the synth — see speak(). */
const bufs = new Map();       // id -> decoded AudioBuffer, least-recent first
const BUF_CAP = 8;            // decoded PCM is heavy; don't hoard all 43 of them
const bytes = new Map();      // id -> Promise<ArrayBuffer>, so two taps share one fetch
let srcNode = null;           // the BufferSource currently sounding
let why = "";                 // why the last line didn't sound, for diag()
let mimed = false;            // the CURRENT line is being mimed — nobody can hear her

const clipUrl = (id) => CLIP_DIR + id + ".mp3";

function fetchClip(id) {
  if (!bytes.has(id)) {
    bytes.set(id, fetch(clipUrl(id), { cache: "force-cache" })
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("http " + r.status))))
      .catch(e => { bytes.delete(id); throw e; }));   // a failed fetch must not cache
  }
  return bytes.get(id);
}

async function decodeClip(id, ctx) {
  const hit = bufs.get(id);
  if (hit) { bufs.delete(id); bufs.set(id, hit); return hit; }   // touch: keep it warm
  const raw = await fetchClip(id);
  // slice(0): decodeAudioData DETACHES the buffer it's handed, so the cached
  // bytes have to be copied or a second decode of the same clip gets nothing
  const buf = await new Promise((res, rej) => {
    const r = ctx.decodeAudioData(raw.slice(0), res, rej);
    if (r && r.then) r.then(res, rej);       // safari's promise form
  });
  bufs.set(id, buf);
  while (bufs.size > BUF_CAP) bufs.delete(bufs.keys().next().value);
  return buf;
}

/* EVERY TAKE, UP FRONT. This is the difference between a guide who answers
   and one who doesn't.

   Playing from buffers made each line a fresh network request at the moment
   you clicked her — fine on a desk, useless on a phone. Measured on a slow
   connection: nineteen clicks out of twenty made no sound at all, because
   each new click superseded the previous line while its mp3 was still coming
   down, so nothing ever finished arriving. Click her twice and she goes mute
   for the rest of the visit. That is not a fallback problem, it's a latency
   problem, and the fix is to stop being on the network when she's asked.

   All of her takes together are about 2 MB — smaller than one of the room's
   models. So they all come down once, in the background, a few at a time so
   they don't fight the rest of the room for the pipe, and after that a click
   is a decode from memory and she answers immediately. */
export function preloadAll(concurrency = 3) {
  if (!clipSet || !clipSet.size) return Promise.resolve(0);
  const queue = [...clipSet].filter(id => !bytes.has(id));
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try { await fetchClip(id); done++; } catch (e) { /* it'll be retried when asked for */ }
    }
  };
  return Promise.all(Array.from({ length: concurrency }, worker)).then(() => done);
}

/* Warm particular clips before anyone asks for them — the hello, which is the
   one people hear before preloadAll has finished. */
export function preloadClips(ids) {
  // the catch is not decoration: a warm-up nobody awaited still counts as an
  // unhandled rejection if the network is out, and that prints a scary error
  // for a fetch whose whole point was to be optional
  for (const id of ids || []) { if (id) { try { fetchClip(id).catch(() => {}); } catch (e) {} } }
}

/* Wake the context up before playing into it.

   `suspended` is not the only way an AudioContext stops. iOS has a THIRD
   state, `interrupted` — a phone call, another app taking audio, the screen
   locking — and a context sitting in it accepts everything you play and
   makes no sound at all, with no error to catch. Checking only for
   `suspended` (which is what this did) means that state never recovers, so
   she plays one line, gets interrupted, and is mute from then on with the
   code convinced it worked. Anything that isn't `running` gets a resume. */
async function wake(ctx) {
  if (!ctx || ctx.state === "running") return true;
  try { await ctx.resume(); } catch (e) {}
  return ctx.state === "running";
}

/* The chain behind the current line, kept in a variable ON PURPOSE.

   A WebAudio node with no live reference to it is a node the browser is
   allowed to collect, and a collected node in the middle of a chain is
   silence you can't debug. Keeping the whole thing here also means we can
   take it back down: without this, every line left its analyser wired into
   the master bus forever, so a long visit slowly built a stack of dead nodes
   summing into the room's output. */
let chain = null;

function dropChain() {
  if (!chain) return;
  for (const n of chain) { try { n.disconnect(); } catch (e) {} }
  chain = null;
  tone = null;
}

// one gentle telephone/speaker chain. The filters stay wired even in the
// normal room so a PS1 toggle can change a line that is already in progress;
// their neutral values + a null curve are transparent outside the mode.
const CRUSH_CURVE = (() => {
  const a = new Float32Array(2048);
  for (let i = 0; i < a.length; i++) {
    const x = i / (a.length - 1) * 2 - 1;
    a[i] = Math.round(x * 24) / 24;  // light 6-bit-ish amplitude stair-step
  }
  return a;
})();
function makeTone(ctx) {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.Q.value = 0.65;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.Q.value = 0.65;
  const crush = ctx.createWaveShaper();
  crush.oversample = "none";
  tone = { hp, lp, crush };
  applyTone();
  return tone;
}
function applyTone() {
  if (!tone) return;
  const now = tone.hp.context.currentTime;
  tone.hp.frequency.setTargetAtTime(trinityLoFi ? 310 : 10, now, 0.012);
  tone.lp.frequency.setTargetAtTime(trinityLoFi ? 3600 : 20000, now, 0.012);
  tone.crush.curve = trinityLoFi ? CRUSH_CURVE : null;
}
function connectTone(input, ctx, an, master) {
  const t = makeTone(ctx);
  input.connect(t.hp); t.hp.connect(t.lp); t.lp.connect(t.crush);
  t.crush.connect(an); an.connect(master);
  return [t.hp, t.lp, t.crush];
}

function meter(ctx) {
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.4;
  levelBuf = new Uint8Array(analyser.fftSize);
  return analyser;
}

// returns true once it's actually SOUNDING; throws or returns false and the
// caller tries the next way in
async function playBuffered(id, volume, seq, onDone) {
  const { ctx, master } = graph ? graph() : {};
  if (!ctx || !master) return false;
  await wake(ctx);
  const buf = await decodeClip(id, ctx);
  if (seq !== speakSeq) return true;        // a newer line owns her; drop this one quietly
  // the decode took time, and the context can have gone away underneath it
  if (!(await wake(ctx))) { why = "context " + ctx.state; return false; }
  dropChain();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = volume;
  const an = meter(ctx);
  src.connect(g);
  const toneNodes = connectTone(g, ctx, an, master);
  chain = [src, g, ...toneNodes, an];       // held so nothing here can be collected
  srcNode = src;
  voicing = true;                           // NOW she's making a noise
  src.onended = () => { if (src !== srcNode) return; srcNode = null; onDone(true); };
  src.start();
  why = "";
  return true;
}

// the old way, kept for a browser whose audio context isn't up yet
function playElement(id, volume, onDone) {
  const a = new Audio(clipUrl(id));
  a.volume = volume;
  a.crossOrigin = "anonymous";
  audio = a;
  try {
    const { ctx, master } = graph ? graph() : {};
    if (ctx && master) {
      wake(ctx);
      /* Routing an element into the graph is a ONE-WAY DOOR on iOS: from the
         moment createMediaElementSource() touches it, that element's audio
         goes nowhere except through these nodes. So the nodes have to be
         held — a collected MediaElementSourceNode is an element that plays
         to nobody, forever, with everything still reporting success. */
      dropChain();
      const msrc = ctx.createMediaElementSource(a);
      const an = meter(ctx);
      const toneNodes = connectTone(msrc, ctx, an, master);
      chain = [msrc, ...toneNodes, an];
    }
  } catch (e) { analyser = null; }
  const done = (ok) => {
    if (a !== audio) return;
    audio = null;
    onDone(ok);
  };
  a.onended = () => done(true);
  a.onerror = () => done(false);
  a.play().then(() => { if (a === audio) voicing = true; }).catch(() => done(false));
}

/* Buffer, then buffer again, then the element. The retry is there because
   the failure this is guarding against is usually a phone's network blinking
   rather than a clip that doesn't exist, and a second ask 300 ms later
   almost always lands. */
function playClip(id, volume, seq, onDone) {
  const viaElement = () => { if (seq === speakSeq) playElement(id, volume, onDone); };
  const tryBuf = (retry) =>
    playBuffered(id, volume, seq, onDone)
      .then(ok => { if (!ok) viaElement(); })
      .catch(() => {
        if (retry) setTimeout(() => { if (seq === speakSeq) tryBuf(false); }, 300);
        else viaElement();
      });
  tryBuf(true);
}

/* Mime a line: no sound, but the mouth opens and closes on the rhythm the
   voice would have had and the card holds the words for as long as it would
   have taken to say them. This is what she does when a recording can't be
   played — see speak(). */
function mimeLine(text, seq) {
  mimed = true;               // so the room can put her words on the card instead
  const parts = clauses(text);
  let total = 0;
  const plan = parts.map((c, i) => {
    const v = voiceFor(c, i, parts.length);
    total += guessMs(c.text) / v.rate + c.pause;
    return { ...c, rate: v.rate };
  });
  silentUntil = performance.now() + total;
  let at = 0;
  const live = () => speaking && seq === speakSeq;
  for (const c of plan) {
    const dur = guessMs(c.text) / c.rate;
    setTimeout(() => { if (live()) voicing = true; }, at);
    setTimeout(() => { if (live()) voicing = false; }, at + dur);
    at += dur + c.pause;
  }
  // isSpeaking() would retire it off silentUntil anyway, but only if somebody
  // asks — this makes onEnd fire for a caller that just waits
  setTimeout(() => { if (live()) finish(); }, total + 30);
  return total;
}

/* Say a line. `clip` is the id from lines.js — when we have that take
   rendered it plays, and the whole clause machinery below is skipped,
   because a real recording already has its own pauses in it. */
let speakSeq = 0;
export function speak(text, opts = {}) {
  const { volume = 1, onEnd, clip } = opts;
  stopSpeaking();
  endCb = onEnd || null;
  speaking = true;
  mimed = false;
  const seq = ++speakSeq;

  /* The manifest hasn't landed yet. WAIT for it instead of falling through to
     the browser's synth, because that fallback is exactly how she changed
     voice mid-conversation: click her in the first second and you got the
     robot, click her later and you got the recording, and it sounded like two
     different people. loadClips() always settles (an empty set on failure), so
     this resolves either way and the synth stays a real fallback rather than a
     race. */
  if (clip && clipSet === null) {
    silentUntil = performance.now() + 8000;    // mid-line, just not audible yet
    loadClips().then(() => {
      if (seq !== speakSeq) return;            // a newer line already replaced this one
      speaking = false;                        // so the re-entry doesn't fire onEnd early
      speak(text, opts);
    });
    return guessMs(text);
  }

  /* HER VOICE OR NOTHING.

     Every line she has is rendered (lines.js is the list, tools/voice/ makes
     the mp3s), so the browser synth has no business finishing her sentences.
     It used to: a clip that wouldn't play fell through to speechSynthesis,
     and on a phone that happened often enough that people met two different
     Trinitys in one conversation. So the rule is now absolute — once a line
     comes with a clip id, the synth is off the table. If the recording can't
     be played she MIMES it: right rhythm, right duration, subtitles intact,
     and no stranger doing her voice. */
  if (clip) {
    if (!clipSet.has(clip)) {
      // a line was edited without re-rendering. say nothing rather than say
      // it in the wrong voice; `node tools/voice/render.mjs` fixes it.
      why = "no take for " + clip;
      console.warn("[say] no rendered take for", clip, "—", String(text).slice(0, 48));
      return mimeLine(text, seq);
    }
    // NOT voicing yet — that's "she is making a noise this instant", and until
    // the clip actually starts she isn't. Setting it here is what made her
    // mouth flap in silence while a take was still loading.
    silentUntil = performance.now() + 120000;   // the clip's own end event drives it
    playClip(clip, volume, seq, (ok) => {
      if (seq !== speakSeq) return;             // superseded mid-clip; the new line owns her now
      if (!ok && speaking) {
        why = why || "clip would not play";
        console.warn("[say] could not play", clip, "—", why, "— miming instead");
        voicing = false;
        return void mimeLine(text, seq);
      }
      finish();
    });
    return guessMs(text);
  }

  const parts = clauses(text);
  let total = 0;
  const plan = parts.map((c, i) => {
    const v = voiceFor(c, i, parts.length);
    total += guessMs(c.text) / v.rate + c.pause;
    return { ...c, rate: v.rate, pitch: v.pitch, volume };
  });

  // no synth — mime it instead, same as a line whose recording won't play
  if (!SYNTH || !window.SpeechSynthesisUtterance) return mimeLine(text, seq);

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
  if (srcNode) { const n = srcNode; srcNode = null; try { n.onended = null; n.stop(); } catch (e) {} }
  dropChain();
  if (audio) { const a = audio; audio = null; try { a.pause(); a.src = ""; } catch (e) {} }
  analyser = null; level = 0;
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

/* Is THIS line one nobody can hear? The room reads this to put her words on
   the card — a mimed line with no card is indistinguishable from her being
   broken, which is exactly how it was reported. Silence is only an
   acceptable failure if you can still read her. */
export const wasMimed = () => mimed;

/* Everything a phone won't tell us from here. METRO_DEBUG.say.diag() */
export function voiceDiag() {
  const { ctx } = graph ? graph() : {};
  return {
    clips: clipSet ? clipSet.size : null,
    ctx: ctx ? ctx.state : "none",
    speaking, voicing, mimed, why,
    cached: bufs.size, fetched: bytes.size,
    playing: srcNode ? "buffer" : audio ? "element" : "nothing",
    loFi: trinityLoFi,
    tone: tone ? { highpass: Math.round(tone.hp.frequency.value),
                   lowpass: Math.round(tone.lp.frequency.value), crushed: !!tone.crush.curve } : null,
  };
}

// is there a real voice behind this, or are we miming? (for a "turn on
// your sound" hint, and so the tutorial can lean on subtitles instead)
export function voiceAvailable() {
  if (!SYNTH) return false;
  if (!picked) picked = pickVoice();
  return !!picked;
}
