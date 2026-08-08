/* ============================================================
   THE STUDIO — the sound

   No files. Every drum and every note is built out of oscillators and
   noise at the moment it's needed, the same way the bedroom does it.

   The one rule that matters here: nothing plays "now". Everything is
   scheduled at an explicit AudioContext time handed down from the
   transport. "Now" is where jitter comes from — a step that fires when
   JavaScript happens to get around to it is a step that swings when the
   tab is busy. The scheduler always runs ahead of the music.

   Envelopes follow the house style: attack from true zero (linear —
   exponentialRamp can't leave 0), exponential decay because that's what
   ears expect, and a short linear tail into silence so nothing clicks.
   ============================================================ */

let ctx = null;
let master = null;      // everything lands here
let comp = null;        // one compressor so a busy pattern can't clip
let noiseBuf = null;

// per-device channels, so the mixer has something to hold on to
const channels = new Map();  // id -> { input, gain, filter, dry, dSend, rSend }

let delay = null, delayFb = null, delayMix = null;
let reverb = null, reverbMix = null;

/* ---------- noise ---------- */

function buildNoise() {
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function noise() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

/* ---------- a room to put the sound in ---------- */

// a convolver needs an impulse response and we have no files, so we make
// one: noise that decays. crude, but a plate is basically noise that decays.
function buildIR(seconds = 2.2, decay = 3.0) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // a touch of early sparseness reads as "room" rather than "hiss"
      const spark = i < len * 0.02 && Math.random() < 0.3 ? 2.5 : 1;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * spark;
    }
  }
  return buf;
}

/* ---------- boot ---------- */

// must be called from a real user gesture or the browser keeps us muted
export function initAudio() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  noiseBuf = buildNoise();

  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 22;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master = ctx.createGain();
  master.gain.value = 0.85;

  master.connect(comp);
  comp.connect(ctx.destination);

  // ---- shared send effects. anyone can twist these and everyone hears it ----
  delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.375;          // a dotted eighth at 120, retuned by the transport
  delayFb = ctx.createGain();
  delayFb.gain.value = 0.34;
  delayMix = ctx.createGain();
  delayMix.gain.value = 1;
  delay.connect(delayFb);
  delayFb.connect(delay);                  // the loop that makes it a delay
  delay.connect(delayMix);
  delayMix.connect(master);

  reverb = ctx.createConvolver();
  reverb.buffer = buildIR();
  reverbMix = ctx.createGain();
  reverbMix.gain.value = 1;
  reverb.connect(reverbMix);
  reverbMix.connect(master);

  return ctx;
}

export const audioCtx = () => ctx;
export const audioTime = () => (ctx ? ctx.currentTime : 0);

/* ---------- channels ---------- */

// every device gets its own strip: a filter, a fader, and two sends.
export function channel(id) {
  if (!ctx) return null;
  let ch = channels.get(id);
  if (ch) return ch;

  const input = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 20000;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0.85;

  const dSend = ctx.createGain(); dSend.gain.value = 0;
  const rSend = ctx.createGain(); rSend.gain.value = 0.08;

  input.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  gain.connect(dSend); dSend.connect(delay);
  gain.connect(rSend); rSend.connect(reverb);

  ch = { input, filter, gain, dSend, rSend };
  channels.set(id, ch);
  return ch;
}

export function setChannel(id, { gain, mute, cutoff, delaySend, reverbSend } = {}) {
  const ch = channel(id);
  if (!ch) return;
  const t = ctx.currentTime;
  // short ramps, never steps — a jumped gain is an audible tick
  if (gain != null || mute != null) {
    const g = mute ? 0 : (gain != null ? gain : ch.gain.gain.value);
    ch.gain.gain.setTargetAtTime(g, t, 0.015);
  }
  if (cutoff != null) ch.filter.frequency.setTargetAtTime(cutoff, t, 0.02);
  if (delaySend != null) ch.dSend.gain.setTargetAtTime(delaySend, t, 0.02);
  if (reverbSend != null) ch.rSend.gain.setTargetAtTime(reverbSend, t, 0.02);
}

export function setFx({ delayTime, feedback, reverbAmount, masterGain } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (delayTime != null) delay.delayTime.setTargetAtTime(delayTime, t, 0.05);
  if (feedback != null) delayFb.gain.setTargetAtTime(Math.min(feedback, 0.85), t, 0.05);
  if (reverbAmount != null) reverbMix.gain.setTargetAtTime(reverbAmount, t, 0.05);
  if (masterGain != null) master.gain.setTargetAtTime(masterGain, t, 0.05);
}

/* ---------- envelope helper ---------- */

function env(node, at, peak, attack, decay, hold = 0) {
  const g = node.gain;
  g.cancelScheduledValues(at);
  g.setValueAtTime(0, at);
  g.linearRampToValueAtTime(peak, at + attack);           // from true zero
  const start = at + attack + hold;
  g.exponentialRampToValueAtTime(Math.max(peak * 0.0008, 1e-5), start + decay);
  g.linearRampToValueAtTime(0, start + decay + 0.012);     // land on silence
}

/* ---------- drums ---------- */

/* ---------- the percussion row: real dumbek, never the same twice ----------
   77 one-shots recorded off a dumbek. They load in the background the first
   time the studio wakes up, and play from a SHUFFLE BAG rather than plain
   random: draw without replacement until the bag is empty, then reshuffle —
   and never let a reshuffle hand you the sample you just heard. Plain
   Math.random() repeats far more often than people expect. */
const PERC_N = 77;
const percBufs = [];
let percLoading = false, percBag = [], percLastIdx = -1;

export function loadPerc() {
  if (percLoading || !ctx) return;
  percLoading = true;
  // callback form: Safari never implemented the promise flavour properly
  const decode = (arr) => new Promise((ok, no) => ctx.decodeAudioData(arr, ok, no));
  const url = (i) => `/assets/audio/dumbek/dumbek-${String(i + 1).padStart(2, "0")}.wav`;
  let next = 0;
  const worker = async () => {
    while (next < PERC_N) {
      const i = next++;
      try { percBufs[i] = await decode(await fetch(url(i)).then(r => r.arrayBuffer())); }
      catch (e) { /* a sample that won't fetch just isn't in the bag */ }
    }
  };
  // six in flight — they're ~35KB each and we want the first hits playable fast
  for (let k = 0; k < 6; k++) worker();
}
export const percReady = () => percBufs.filter(Boolean).length;
export const percLast = () => percLastIdx;   // which one you just heard (debug/tests)

function nextPerc() {
  const loaded = percBufs.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
  if (!loaded.length) return null;
  if (!percBag.length) {
    percBag = loaded.slice();
    for (let i = percBag.length - 1; i > 0; i--) {          // Fisher-Yates
      const j = (Math.random() * (i + 1)) | 0;
      [percBag[i], percBag[j]] = [percBag[j], percBag[i]];
    }
    // a fresh bag must not open with the hit we just played
    if (percBag.length > 1 && percBag[percBag.length - 1] === percLastIdx) {
      [percBag[0], percBag[percBag.length - 1]] = [percBag[percBag.length - 1], percBag[0]];
    }
  }
  percLastIdx = percBag.pop();
  return percBufs[percLastIdx];
}

export const DRUM_ROWS = ["kick", "snare", "perc", "hat", "openhat", "tomLo", "tomHi", "rim"];

export function drum(name, at, vel = 1, out = null) {
  if (!ctx) return;
  const dest = (out || channel("drums")).input;
  const v = Math.max(0.05, Math.min(vel, 1.4));

  if (name === "kick") {
    const o = ctx.createOscillator(); o.type = "sine";
    const g = ctx.createGain();
    o.frequency.setValueAtTime(148, at);
    o.frequency.exponentialRampToValueAtTime(44, at + 0.11);   // the drop is the kick
    env(g, at, 1.0 * v, 0.002, 0.32);
    // a click of noise up top so it reads on laptop speakers with no low end
    const nk = noise(); const nf = ctx.createBiquadFilter(); const ng = ctx.createGain();
    nf.type = "bandpass"; nf.frequency.value = 1800; nf.Q.value = 1;
    env(ng, at, 0.10 * v, 0.001, 0.022);
    nk.connect(nf); nf.connect(ng); ng.connect(dest);
    nk.start(at); nk.stop(at + 0.06);
    o.connect(g); g.connect(dest); o.start(at); o.stop(at + 0.4);

  } else if (name === "snare") {
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = "highpass"; f.frequency.value = 1400;
    env(g, at, 0.55 * v, 0.001, 0.17);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(at); n.stop(at + 0.25);
    // the body — without it a snare is just a hiss
    const o = ctx.createOscillator(); o.type = "triangle"; const og = ctx.createGain();
    o.frequency.setValueAtTime(196, at);
    o.frequency.exponentialRampToValueAtTime(150, at + 0.09);
    env(og, at, 0.34 * v, 0.001, 0.10);
    o.connect(og); og.connect(dest); o.start(at); o.stop(at + 0.2);

  } else if (name === "perc") {
    // a real dumbek hit, drawn from the shuffle bag
    const buf = nextPerc();
    if (buf) {
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain();
      // a little hit-to-hit dynamics so a run of them breathes
      g.gain.value = v * (0.78 + Math.random() * 0.22);
      src.connect(g); g.connect(dest);
      src.start(at);
      return;
    }
    // still warming up: fall back to the old synthesised clap for this hit
    loadPerc();
    [0, 0.009, 0.019].forEach((off, i) => {
      const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 1150; f.Q.value = 1.1;
      env(g, at + off, (0.34 - i * 0.06) * v, 0.001, 0.035);
      n.connect(f); f.connect(g); g.connect(dest);
      n.start(at + off); n.stop(at + off + 0.07);
    });
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 1050; f.Q.value = 0.8;
    env(g, at + 0.028, 0.26 * v, 0.001, 0.14);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(at + 0.028); n.stop(at + 0.22);

  } else if (name === "hat" || name === "openhat") {
    const open = name === "openhat";
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = "highpass"; f.frequency.value = 7800;
    env(g, at, (open ? 0.22 : 0.26) * v, 0.001, open ? 0.30 : 0.045);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(at); n.stop(at + (open ? 0.42 : 0.09));

  } else if (name === "tomLo" || name === "tomHi") {
    const hi = name === "tomHi";
    const o = ctx.createOscillator(); o.type = "sine"; const g = ctx.createGain();
    const f0 = hi ? 260 : 160;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.62, at + 0.16);
    env(g, at, 0.5 * v, 0.002, 0.26);
    o.connect(g); g.connect(dest); o.start(at); o.stop(at + 0.4);

  } else if (name === "rim") {
    const n = noise(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 2400; f.Q.value = 6;
    env(g, at, 0.42 * v, 0.0005, 0.03);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(at); n.stop(at + 0.06);
  }
}

/* ---------- pitched voices ---------- */

export const VOICES = ["saw", "square", "pluck", "pad", "bell", "bass", "organ", "fm"];
export const VOICE_LABEL = {
  saw: "SAW", square: "SQUARE", pluck: "PLUCK", pad: "PAD",
  bell: "BELL", bass: "BASS", organ: "ORGAN", fm: "FM",
};
// a pad stacks three oscillators and an organ stacks four, so without a trim
// per voice, switching timbre mid-jam doubles the level and ducks the drums
// through the compressor. this keeps them roughly matched by ear.
const TRIM = { saw: 1, square: 0.9, pluck: 1.1, pad: 0.62, bell: 0.85, bass: 1.1, organ: 0.6, fm: 0.9 };

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (midi) => NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);

function osc(type, hz, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  o.detune.value = detune;
  return o;
}

// a lowpass that opens on the attack and shuts on the decay. this one curve is
// most of what separates "a synth" from "a beep".
function sweep(f, at, span, cutoff, res, open, close) {
  f.type = "lowpass";
  f.Q.value = Math.max(0.0001, res);
  f.frequency.setValueAtTime(Math.min(cutoff * open, 16000), at);
  f.frequency.exponentialRampToValueAtTime(Math.max(cutoff, 80), at + Math.max(Math.min(span * close, 0.6), 0.01));
}

// one note, scheduled. `dur` is in seconds and includes the release.
export function note(midi, at, dur = 0.3, opts = {}) {
  if (!ctx) return;
  const { voice = "saw", cutoff = 1800, res = 6, level = 0.2, out = null } = opts;
  const dest = (out || channel("arp")).input;
  const hz = midiToHz(midi);

  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const parts = [];    // { node, gain? } — these feed the filter
  const aux = [];      // modulators: started and stopped, but not heard directly

  let atk = Math.min(0.012, dur * 0.2);
  let dec = Math.max(dur - atk, 0.05);
  let tail = 0.15;

  if (voice === "saw") {
    parts.push({ node: osc("sawtooth", hz, -8) }, { node: osc("sawtooth", hz, 8) });
    sweep(f, at, dur, cutoff, res, 2.4, 0.6);

  } else if (voice === "square") {
    parts.push({ node: osc("square", hz, -6) }, { node: osc("square", hz, 6) });
    sweep(f, at, dur, cutoff * 0.9, res, 2.0, 0.5);

  } else if (voice === "pluck") {
    // the filter slams shut faster than the amp does. that mismatch is what
    // reads as "plucked" rather than "faded out".
    parts.push({ node: osc("sawtooth", hz, -4) }, { node: osc("sawtooth", hz, 4) });
    sweep(f, at, dur, cutoff, Math.max(res, 9), 5.0, 0.14);
    atk = 0.002;
    dec = Math.min(dur, 0.36);

  } else if (voice === "pad") {
    parts.push({ node: osc("sawtooth", hz, -14) }, { node: osc("sawtooth", hz, 14) },
               { node: osc("sawtooth", hz / 2), gain: 0.7 });
    sweep(f, at, dur, cutoff * 0.8, Math.min(res, 4), 1.5, 1.0);
    atk = Math.max(dur * 0.4, 0.09);   // slow in — a pad that starts instantly is a stab
    dec = Math.max(dur, 0.55);
    tail = 0.5;

  } else if (voice === "bell" || voice === "fm") {
    // FM. the modulator's depth decays, so the tone starts bright and clangy
    // and settles toward a sine — which is what a struck thing does.
    const bell = voice === "bell";
    const carrier = osc("sine", hz);
    const mod = osc("sine", hz * (bell ? 3.53 : 2));   // inharmonic ratio = metallic
    const depth = ctx.createGain();
    const index = hz * (bell ? 5 : 2.2);
    depth.gain.setValueAtTime(index, at);
    depth.gain.exponentialRampToValueAtTime(Math.max(index * 0.02, 1), at + Math.min(dur * 1.2, 1.1));
    mod.connect(depth);
    depth.connect(carrier.frequency);
    aux.push(mod);
    parts.push({ node: carrier });
    f.type = "lowpass";
    f.frequency.value = 15000;          // FM makes its own brightness; stay out of the way
    f.Q.value = 0.4;
    if (bell) { atk = 0.003; dec = Math.max(dur * 1.7, 0.7); tail = 0.4; }

  } else if (voice === "bass") {
    parts.push({ node: osc("sawtooth", hz, -5) }, { node: osc("sawtooth", hz, 5) },
               { node: osc("sine", hz / 2), gain: 0.95 });
    sweep(f, at, dur, Math.min(cutoff, 1500), Math.max(res, 7), 3.0, 0.3);
    atk = 0.004;

  } else if (voice === "organ") {
    // drawbars: fundamental, octave, twelfth, double octave. no filter movement
    // and no detune — an organ is steady, and the steadiness is the character.
    [[1, 1], [2, 0.5], [3, 0.3], [4, 0.18]].forEach(([mul, amp]) =>
      parts.push({ node: osc("sine", hz * mul), gain: amp }));
    f.type = "lowpass";
    f.frequency.value = Math.min(cutoff * 3, 14000);
    f.Q.value = 0.5;
    atk = 0.008;
    tail = 0.08;
  }

  env(g, at, level * (TRIM[voice] || 1), atk, dec);
  const stopAt = at + atk + dec + tail + 0.1;

  for (const p of parts) {
    if (p.gain != null) {
      const pg = ctx.createGain();
      pg.gain.value = p.gain;
      p.node.connect(pg);
      pg.connect(f);
    } else {
      p.node.connect(f);
    }
    p.node.start(at);
    p.node.stop(stopAt);
  }
  for (const a of aux) { a.start(at); a.stop(stopAt); }

  f.connect(g);
  g.connect(dest);
}

/* ---------- scales ---------- */

// scale-locked, so nothing anyone punches in can be wrong — the whole point
// of handing strangers a sequencer and walking away.
export const SCALES = {
  minor:      [0, 2, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
};

// degree 0 is the root; degrees past the end of the scale wrap up an octave
export function degreeToMidi(degree, root = 45, scale = "minor") {
  const s = SCALES[scale] || SCALES.minor;
  const oct = Math.floor(degree / s.length);
  const idx = ((degree % s.length) + s.length) % s.length;
  return root + oct * 12 + s[idx];
}
