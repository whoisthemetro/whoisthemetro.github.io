/* ============================================================
   THE METRO — sound of the place
   Pure WebAudio, no files: a low room hum, and the rising
   roar of a train when one passes. Starts only after the
   user clicks "descend" (browser autoplay rules).
   ============================================================ */

let ctx = null;
let master = null;
let pianoBus = null;   // the keyboard's pedal chain feeds in here (chorus→delay→reverb)
let guitarBus = null;  // the guitar's pedal chain (overdrive→delay→reverb)
let drumBus = null;    // the e-kit's level handle (so a mixer can ride it)
let guitarOut = null;  // the guitar pedalboard's final output, rerouted through Clouds when ready
let catBus = null;     // every meow, purr and hiss — one owner-adjustable level
let gtrFilter = null;  // the guitar's front-of-chain lowpass, ridden by a draggable pedal
const busBase = {};    // id → the gain each bus was built at (100% on the mixer)
const fxStages = {};        // id → {dry, wet, wet0} — a stompbox toggles these to bypass
const fxDelays = {};        // id → DelayNode, for tempo-syncing the delay pedals to a song
const fxDelayDefault = {};  // id → its free-play delayTime (reverted to when no song plays)

// the cat's real voice — the only recorded audio in the whole place (everything
// else here is synthesized). decoded once when the context comes up; meow() and
// purr() fall back to their synth versions until/unless these land.
let catMeowBuf = null, catPurrBuf = null;
async function loadSample(url) {
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await new Promise((ok, no) => ctx.decodeAudioData(arr, ok, no));
  } catch (e) { return null; }
}
// one-shot a decoded buffer through the master bus with a soft envelope.
// returns { src, g } so a caller could stop it early; null if nothing to play.
function playSample(buf, { rate = 1, gain = 0.5, attack = 0.01, release = 0.08, dur = null, offset = 0, out = master } = {}) {
  if (!ctx || !buf) return null;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate;
  const g = ctx.createGain();
  src.connect(g).connect(out);
  const play = dur != null ? dur : buf.duration / rate - offset;
  const rel = Math.min(release, play * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, play - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + play);
  src.start(t, offset);
  src.stop(t + play + 0.05);
  return { src, g };
}

function noiseBuffer(seconds = 2) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // brown-ish noise: deep, rumbling
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

// a generated impulse response for the reverb convolver: a stereo burst of
// noise that decays away — long-ish tail, the bedroom as a real room.
function impulseBuffer(dur = 2.2, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

// one wet/dry stage: (1-wet) of the dry src + wet of wetOut, summed into a
// fresh gain. connect src→wetIn yourself (the caller wires the effect input)
// before calling. default 50% — every pedal here is half-wet. pass an `id` and
// the stage registers so a stompbox can bypass it (dry→unity, wet→0).
function fxWetDry(src, wetIn, wetOut, wet = 0.5, id = null) {
  const sum = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 1 - wet;
  const wg = ctx.createGain();  wg.gain.value = wet;
  src.connect(dry).connect(sum);
  src.connect(wetIn);
  wetOut.connect(wg).connect(sum);
  if (id) fxStages[id] = { dry, wet: wg, wet0: wet };
  return sum;
}

// a soft-clip transfer curve for the overdrive waveshaper — bigger k = hairier
function driveCurve(k = 10) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
  return c;
}

// The keyboard's floor pedals, in WebAudio: every piano note runs chorus →
// delay → reverb before the master bus, each mixed 50% wet. The keys get a
// level bump here too (pianoBus gain) so they sit up over the room. Always on
// — the three stompboxes on the floor by the desk (world.js) are the twin.
function buildKeyboardFx() {
  pianoBus = ctx.createGain();
  pianoBus.gain.value = 2.9;            // the keys, pushed right out front
  busBase.piano = 2.9;
  let node = pianoBus;

  // chorus: a short LFO-swept delay beating against the dry signal
  const chD = ctx.createDelay();
  chD.delayTime.value = 0.024;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.7;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.004;              // ±4 ms sweep
  lfo.connect(lfoG).connect(chD.delayTime);
  lfo.start();
  node = fxWetDry(node, chD, chD, 0.5, "kb-chorus");

  // delay: a ~quarter-note slap with feedback, repeats darkening as they fade
  const dl = ctx.createDelay();
  dl.delayTime.value = 0.34;
  fxDelays["kb-delay"] = dl; fxDelayDefault["kb-delay"] = 0.34;   // tempo-synced to songs
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = "lowpass";
  fbLp.frequency.value = 2600;
  dl.connect(fbLp).connect(fb).connect(dl);   // feedback loop
  node = fxWetDry(node, dl, dl, 0.5, "kb-delay");

  // reverb: the generated impulse through a convolver
  const rev = ctx.createConvolver();
  rev.buffer = impulseBuffer();
  node = fxWetDry(node, rev, rev, 0.5, "kb-reverb");

  node.connect(master);
}

// The guitar's floor pedals: overdrive → delay → reverb, each 50% wet. The
// overdrive is a soft-clip waveshaper driven hard then leveled back, so the
// clean string keeps half its voice; delay + reverb match the keys'. Every
// pluck — live frets and the songs' guitar track — runs this on the way to
// master. The stompboxes in front of the tele (world.js) are the twin.
function buildGuitarFx() {
  guitarBus = ctx.createGain();
  busBase.guitar = guitarBus.gain.value;   // unity — the string already has its level
  let node = guitarBus;

  // filter pedal — FIRST in line, the whole signal passes through it (not wet/dry).
  // wide open by default (20 kHz = no audible filtering); the draggable pedal in
  // world.js rides it down to 100 Hz, sweeping the brightness right off.
  gtrFilter = ctx.createBiquadFilter();
  gtrFilter.type = "lowpass";
  gtrFilter.frequency.value = 20000;
  gtrFilter.Q.value = 0.7;
  node.connect(gtrFilter);
  node = gtrFilter;

  // overdrive: push the quiet string hard into the clipper, shape, level back
  const odIn = ctx.createGain(); odIn.gain.value = 6;
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(11); shaper.oversample = "2x";
  const odTone = ctx.createBiquadFilter();
  odTone.type = "lowpass"; odTone.frequency.value = 3200;
  const odLvl = ctx.createGain(); odLvl.gain.value = 0.5;
  odIn.connect(shaper).connect(odTone).connect(odLvl);
  node = fxWetDry(node, odIn, odLvl, 0.5, "gtr-od");

  // delay: a touch longer + more feedback than the keys'
  const dl = ctx.createDelay();
  dl.delayTime.value = 0.38;
  fxDelays["gtr-delay"] = dl; fxDelayDefault["gtr-delay"] = 0.38;   // tempo-synced to songs
  const fb = ctx.createGain();
  fb.gain.value = 0.36;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = "lowpass"; fbLp.frequency.value = 2400;
  dl.connect(fbLp).connect(fb).connect(dl);
  node = fxWetDry(node, dl, dl, 0.5, "gtr-delay");

  // reverb
  const rev = ctx.createConvolver();
  rev.buffer = impulseBuffer();
  node = fxWetDry(node, rev, rev, 0.5, "gtr-reverb");
  // Clouds is wired later, after its worklet has loaded. Until then the guitar
  // remains fully playable through its own pedals.
  guitarOut = node;
  guitarOut.connect(master);
}

// click a stompbox: bypass the effect (dry passes at unity) or mix it back in.
// 50 ms ramp so the switch doesn't pop.
export function setFx(id, on) {
  const s = fxStages[id];
  if (!ctx || !s) return;
  const t = ctx.currentTime;
  s.dry.gain.linearRampToValueAtTime(on ? 1 - s.wet0 : 1, t + 0.05);
  s.wet.gain.linearRampToValueAtTime(on ? s.wet0 : 0, t + 0.05);
}

// the guitar filter pedal: pct 0..1. 1 = wide open (20 kHz, no audible cut),
// 0 = clamped down to 100 Hz. log sweep so the drag feels even across the range.
export function setGuitarFilter(pct) {
  if (!ctx || !gtrFilter) return;
  const p = Math.max(0, Math.min(1, pct));
  const f = 100 * Math.pow(20000 / 100, p);     // 100 Hz … 20 kHz, exponential
  gtrFilter.frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
}

// sync the delay pedals to a song's tempo — keys repeat on the eighth, guitar
// on the dotted-eighth. bpm = null reverts them to their free-play times.
export function setDelayTempo(bpm) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const sub = { "kb-delay": 0.5, "gtr-delay": 0.75 };   // beats per repeat
  for (const id in fxDelays) {
    const tgt = bpm ? Math.max(0.04, Math.min(1, (60 / bpm) * (sub[id] || 0.5))) : fxDelayDefault[id];
    fxDelays[id].delayTime.linearRampToValueAtTime(tgt, t + 0.12);
  }
}

export function startAmbience() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }

  master = ctx.createGain();
  master.gain.value = 0.9;
  // gentle compressor on the bus: stacked piano notes / sfx can't clip
  // and pop the output anymore
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master.connect(comp).connect(ctx.destination);
  catBus = ctx.createGain();
  catBus.gain.value = catVolume;
  catBus.connect(master);

  // pull in the cat's real meow + purr (non-blocking — the synth covers for
  // them until they decode, and forever if the fetch fails)
  loadSample("assets/audio/cat-meow.mp3").then(b => { catMeowBuf = b; });
  loadSample("assets/audio/cat-purr.mp3").then(b => { catPurrBuf = b; });

  // room tone: deep filtered rumble + faint electrical hum (the "AC" bed —
  // kept faint so it sits under the room, not over it)
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 90;
  const g = ctx.createGain();
  g.gain.value = ROOM_RUMBLE;
  src.connect(lp).connect(g).connect(master);
  src.start();

  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 120;
  const humLp = ctx.createBiquadFilter();
  humLp.type = "lowpass";
  humLp.frequency.value = 300;
  const humG = ctx.createGain();
  humG.gain.value = ROOM_HUM;
  hum.connect(humLp).connect(humG).connect(master);
  hum.start();
  roomToneGains = [g, humG];

  // the instrument chains — built once. keys + guitar each get their pedals;
  // the drums get a level bus so the kit (and a future mixer) can ride it.
  buildKeyboardFx();
  buildGuitarFx();
  drumBus = ctx.createGain();
  drumBus.gain.value = 1.3;             // the e-kit, turned up a notch
  busBase.drum = 1.3;
  drumBus.connect(master);
}

// the desk mixer rides the three instrument buses. pct is 0..150 — a percentage
// of each bus's natural built level (100 = unchanged), ramped so it never pops.
export function setBusLevel(id, pct) {
  if (!ctx) return;
  const bus = { piano: pianoBus, guitar: guitarBus, drum: drumBus }[id];
  if (!bus) return;
  const base = busBase[id] ?? 1;
  bus.gain.setTargetAtTime(base * Math.max(0, pct) / 100, ctx.currentTime, 0.03);
}

// The bedroom's hum and rumble — silenced while you're aboard the boat.
// kept deliberately faint (the AC shouldn't be the loudest thing in the room).
const ROOM_RUMBLE = 0.026, ROOM_HUM = 0.004;
let roomToneGains = null;
export function setRoomTone(on) {
  if (!ctx || !roomToneGains) return;
  const t = ctx.currentTime;
  roomToneGains[0].gain.linearRampToValueAtTime(on ? ROOM_RUMBLE : 0.0001, t + 1.2);
  roomToneGains[1].gain.linearRampToValueAtTime(on ? ROOM_HUM : 0.0001, t + 1.2);
}

// the vacuum motor — brown-ish noise through a lowpass for the air rush,
// a resonant bandpass for the motor whine, and a slow tremolo so it
// breathes like a real machine leaning into the carpet. built once, lazy.
let vacNodes = null;
function buildVacuum() {
  if (vacNodes || !ctx) return;
  // out is the pure on/off envelope — nothing else touches it, so it can
  // actually reach silence. the tremolo rides an inner `motor` gain instead.
  const out = ctx.createGain(); out.gain.value = 0.0001;   // silent until on
  out.connect(master);
  const motor = ctx.createGain(); motor.gain.value = 0.5;  // level + tremolo here
  motor.connect(out);
  // air rush
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 720; lp.Q.value = 0.6;
  const rush = ctx.createGain(); rush.gain.value = 0.5;
  src.connect(lp).connect(rush).connect(motor);
  // motor whine — the same noise pushed through a tight bandpass
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 240; bp.Q.value = 7;
  const whine = ctx.createGain(); whine.gain.value = 0.6;
  src.connect(bp).connect(whine).connect(motor);
  // a low motor body
  const osc = ctx.createOscillator();
  osc.type = "sawtooth"; osc.frequency.value = 116;
  const oscLp = ctx.createBiquadFilter();
  oscLp.type = "lowpass"; oscLp.frequency.value = 200;
  const oscG = ctx.createGain(); oscG.gain.value = 0.05;
  osc.connect(oscLp).connect(oscG).connect(motor);
  // slow tremolo — rides the inner motor gain, NOT the envelope
  const trem = ctx.createOscillator();
  trem.type = "sine"; trem.frequency.value = 7.5;
  const tremG = ctx.createGain(); tremG.gain.value = 0.12;
  trem.connect(tremG).connect(motor.gain);
  src.start(); osc.start(); trem.start();
  vacNodes = { out };
}
export function startVacuum() {
  if (!ctx) return;
  buildVacuum();
  const t = ctx.currentTime;
  vacNodes.out.gain.cancelScheduledValues(t);
  vacNodes.out.gain.setValueAtTime(Math.max(0.0001, vacNodes.out.gain.value), t);
  vacNodes.out.gain.linearRampToValueAtTime(1, t + 0.18);   // spin-up
}
export function stopVacuum() {
  if (!ctx || !vacNodes) return;
  const t = ctx.currentTime;
  vacNodes.out.gain.cancelScheduledValues(t);
  vacNodes.out.gain.setValueAtTime(Math.max(0.0001, vacNodes.out.gain.value), t);
  vacNodes.out.gain.linearRampToValueAtTime(0.0001, t + 0.35);  // spin-down
}

// the club's idle ambience — a soft, soothing bed under the empty room that
// ducks the moment a set starts. theme-aware: gentle RAIN for the city,
// muffled WATER for the aquarium, an airy PAD for deep space. all kept quiet
// and relaxing — no drone fighting the room. each bed has an inner swell gain
// (LFO-modulated) so it breathes, and an outer select gain for the crossfade
// (so a silenced bed can't leak through its LFO).
let clubBeds = null, clubBedName = "rain", clubToneOn = false;
function ensureClubBeds() {
  if (clubBeds || !ctx) return;
  const bedMaster = ctx.createGain(); bedMaster.gain.value = 0.0001; bedMaster.connect(master);
  const sel = () => { const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(bedMaster); return g; };

  // RAIN — two layers of filtered noise (patter + body), a slow breathing swell
  const rainSel = sel();
  const rainSwell = ctx.createGain(); rainSwell.gain.value = 0.85; rainSwell.connect(rainSel);
  const rn = ctx.createBufferSource(); rn.buffer = noiseBuffer(5); rn.loop = true;
  const rbp = ctx.createBiquadFilter(); rbp.type = "bandpass"; rbp.frequency.value = 1600; rbp.Q.value = 0.5;
  rn.connect(rbp).connect(rainSwell); rn.start();
  const rn2 = ctx.createBufferSource(); rn2.buffer = noiseBuffer(5); rn2.loop = true;
  const rlp = ctx.createBiquadFilter(); rlp.type = "lowpass"; rlp.frequency.value = 720;
  const rlpG = ctx.createGain(); rlpG.gain.value = 0.55; rn2.connect(rlp).connect(rlpG).connect(rainSwell); rn2.start();
  const rlfo = ctx.createOscillator(); rlfo.frequency.value = 0.08;
  const rlfoG = ctx.createGain(); rlfoG.gain.value = 0.2; rlfo.connect(rlfoG).connect(rainSwell.gain); rlfo.start();

  // WATER — muffled low noise with a slow gurgle on the filter cutoff
  const waterSel = sel();
  const wn = ctx.createBufferSource(); wn.buffer = noiseBuffer(5); wn.loop = true;
  const wlp = ctx.createBiquadFilter(); wlp.type = "lowpass"; wlp.frequency.value = 360; wlp.Q.value = 0.4;
  wn.connect(wlp).connect(waterSel); wn.start();
  const wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.12;
  const wlfoG = ctx.createGain(); wlfoG.gain.value = 150; wlfo.connect(wlfoG).connect(wlp.frequency); wlfo.start();

  // PAD — a soft airy low chord with a slow tremolo (soothing, not a rumble)
  const padSel = sel();
  const padSwell = ctx.createGain(); padSwell.gain.value = 0.7; padSwell.connect(padSel);
  const plp = ctx.createBiquadFilter(); plp.type = "lowpass"; plp.frequency.value = 620; plp.connect(padSwell);
  [110, 164.81, 220.5].forEach((f) => { const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.3; o.connect(og).connect(plp); o.start(); });
  const ptr = ctx.createOscillator(); ptr.frequency.value = 0.09;
  const ptrG = ctx.createGain(); ptrG.gain.value = 0.22; ptr.connect(ptrG).connect(padSwell.gain); ptr.start();

  clubBeds = { bedMaster, rain: rainSel, water: waterSel, space: padSel };
}
// pick which soothing bed plays (by venue theme)
export function setClubBed(name) {
  ensureClubBeds();
  if (!ctx || !clubBeds) return;
  clubBedName = clubBeds[name] ? name : "rain";
  const t = ctx.currentTime;
  for (const k of ["rain", "water", "space"])
    clubBeds[k].gain.linearRampToValueAtTime(k === clubBedName ? 0.85 : 0.0001, t + 1.4);
}
// idle bed audible (empty room) or ducked away (a set is live / you left)
export function setClubTone(on) {
  on = !!on;
  ensureClubBeds();
  if (!ctx || !clubBeds) return;
  if (on === clubToneOn) return;      // called on an interval — don't restart the ramp every tick
  clubToneOn = on;
  clubBeds.bedMaster.gain.linearRampToValueAtTime(on ? 0.05 : 0.0001, ctx.currentTime + 1.2);
}

// The MIDI keys under the desk — two C major octaves, low to high.
// Played by visitors (and walked on by the cat). Several voices;
// click the controller body to cycle them. Free-play is locked to these
// 15 white keys (no wrong notes); the self-playing songs unlock the full
// chromatic 24-semitone span by passing chromatic=true (see pianoNote).
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];

// map a chromatic semitone (0..24) back to the nearest physical white key,
// so a song's accidental still lights up a real key on the 3D keybed.
export function semitoneToKey(s) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < C_MAJOR.length; i++) {
    const d = Math.abs(C_MAJOR[i] - s);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
export const PIANO_VOICES = [
  // The physical keybed is Plaits-only. Its panel holds the remembered sound.
  { name: "PLAITS", mi: true },
];
export const PLAITS_VOICE = PIANO_VOICES.findIndex(v => v.mi);

/* ---------- PLAITS, in the bedroom ----------

   The studio has its own AudioContext and its own copy of this; the room
   cannot borrow that one, because a node belongs to the context that made
   it and the two graphs never meet. What IS shared is the hard part: the
   worklet (studio/mi-worklet.js) and the wasm. Both are context-agnostic,
   an AudioWorklet registry is per-context, so adding the same module to a
   second context is just a second registration of the same code.

   Plaits loads on room entry so the first key uses the remembered panel state.
   There is intentionally no oscillator fallback for the physical keybed. */
let miMode = "off";
let plaitsNode = null;
let plaitsLevel = null;         // its own trim: wasm output is hotter than our oscillators
// The same Clouds controls sit on two independent instrument inserts: one
// after Plaits and one after the guitar pedalboard. Separate processors keep
// each instrument's tail to itself while every mixer control stays shared.
let cloudsNode = null;
let guitarCloudsNode = null;
let cloudsMode = "off";
let cloudsParams = {
  pos: 0, size: 0.5, pitch: 0, dens: 0.5, tex: 0.5,
  wet: 0, spread: 0.5, fb: 0, verb: 0, freeze: false, mode: 0,
};
export const plaitsStatus = () => miMode;
export const plaitsReady = () => miMode === "on";
export const cloudsStatus = () => cloudsMode;

export async function initPlaits() {
  if (miMode !== "off") return miMode === "on";
  if (!ctx || !ctx.audioWorklet) { miMode = "failed"; return false; }
  miMode = "loading";
  try {
    const [bytes] = await Promise.all([
      fetch("/assets/wasm/mi.wasm").then(r => r.arrayBuffer()),
      ctx.audioWorklet.addModule("/assets/js/studio/mi-worklet.js"),
    ]);
    const module = await WebAssembly.compile(bytes);
    plaitsNode = new AudioWorkletNode(ctx, "mi-plaits", {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { module },
    });
    plaitsLevel = ctx.createGain();
    plaitsLevel.gain.value = 0.22;
    plaitsNode.connect(plaitsLevel);
    // The existing Clouds processor is the actual Mutable Instruments DSP.
    // It has one shared control set, but two inserts: Plaits still returns to
    // its own keyboard bus and the guitar keeps its own pedalboard + level.
    // Drums, room tone and every other room source remain outside both.
    try {
      const makeClouds = () => new AudioWorkletNode(ctx, "mi-clouds", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { module },
      });
      const plaitsClouds = makeClouds();
      const guitarClouds = makeClouds();
      plaitsLevel.connect(plaitsClouds).connect(pianoBus || master);
      // buildGuitarFx has already given the live guitar a direct master route;
      // transplant its FINAL output only, so overdrive/delay/reverb and the
      // guitar fader all stay exactly where they were.
      if (guitarOut) {
        guitarOut.disconnect();
        guitarOut.connect(guitarClouds).connect(master);
      }
      cloudsNode = plaitsClouds;
      guitarCloudsNode = guitarClouds;
      cloudsMode = "on";
      setClouds(cloudsParams);
    } catch (e) {
      // A Clouds failure must not silence the physical keybed.
      cloudsMode = "failed";
      plaitsLevel.connect(pianoBus || master);
    }
    miMode = "on";
    setPlaits(plaitsParams);      // whatever the panel already had on it
    return true;
  } catch (e) {
    miMode = "failed";
    return false;
  }
}

// the panel's knobs live here so the node can be handed them the moment it
// exists — turning a knob before the wasm lands must not be a lost edit
let plaitsParams = { harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.4, engine: 8 };
export function setPlaits(p = {}) {
  plaitsParams = { ...plaitsParams, ...p };
  if (plaitsNode) plaitsNode.port.postMessage({ t: "set", ...plaitsParams });
}
// Density is centred: .5 is the ungrained resting point, either direction
// pulls Clouds into grain territory in its own characteristic way.
export function setCloudsDensity(amount = 0.5) {
  const dens = Math.max(0, Math.min(1, +amount || 0));
  cloudsParams = { ...cloudsParams, dens };
  setClouds(cloudsParams);
}
// Keep Clouds focused on its first Blend mode: Dry/Wet decides how much of
// the processed signal reaches the synth; Reverb sets the wash inside it.
export function setCloudsWet(amount = 0) {
  const wet = Math.max(0, Math.min(1, +amount || 0));
  cloudsParams = { ...cloudsParams, wet };
  setClouds(cloudsParams);
}
export function setCloudsReverb(amount = 0) {
  const reverb = Math.max(0, Math.min(1, +amount || 0));
  cloudsParams = { ...cloudsParams, verb: reverb };
  setClouds(cloudsParams);
}
function setClouds(p = {}) {
  cloudsParams = { ...cloudsParams, ...p };
  if (cloudsNode) cloudsNode.port.postMessage({ t: "set", ...cloudsParams });
  if (guitarCloudsNode) guitarCloudsNode.port.postMessage({ t: "set", ...cloudsParams });
}
export function plaitsNote(midi, dur = 1.6, level = 0.6, when = null) {
  if (!plaitsNode || !ctx) return false;
  plaitsNode.port.postMessage({ t: "note", midi, at: Math.max(ctx.currentTime + 0.005, when || 0), dur, level });
  return true;
}

/* ---------- RINGS, as the telecaster's voice ----------

   Same shape as initPlaits above and for the same reasons: the worklet and
   the wasm are shared with the studio, the node belongs to THIS context, and
   it's lazy because most visits never pick up the guitar.

   The one real difference is that Rings never stops. Plaits renders a note
   and frees its slot; Rings is a resonator sitting in the room, and a
   resonator that stops being rendered stops ringing. Its worklet always
   returns audio, so the node stays connected and quietly outputs silence
   between plucks. That's an instrument, not a leak. */
let riMode = "off";
let ringsNode = null, ringsLevel = null;
export const ringsStatus = () => riMode;
export const ringsReady = () => riMode === "on";

export async function initRings() {
  if (riMode !== "off") return riMode === "on";
  if (!ctx || !ctx.audioWorklet) { riMode = "failed"; return false; }
  riMode = "loading";
  try {
    const [bytes] = await Promise.all([
      fetch("/assets/wasm/mi.wasm").then(r => r.arrayBuffer()),
      ctx.audioWorklet.addModule("/assets/js/studio/mi-worklet.js"),
    ]);
    const module = await WebAssembly.compile(bytes);
    ringsNode = new AudioWorkletNode(ctx, "mi-rings", {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { module },
    });
    ringsLevel = ctx.createGain();
    ringsLevel.gain.value = 0.5;
    // into the guitar's own pedal chain, so it lands where the hand-rolled
    // string lands: overdrive, delay, reverb, and the same bus level
    ringsNode.connect(ringsLevel).connect(guitarBus || master);
    riMode = "on";
    setRings(ringsParams);
    return true;
  } catch (e) {
    riMode = "failed";
    return false;
  }
}

// the panel's knobs live here so the node can be handed them the moment it
// exists — turning one before the wasm lands must not be a lost edit
let ringsParams = { structure: 0.35, brightness: 0.5, damping: 0.7, position: 0.25, model: 2, polyphony: 4 };
/* The octave shift is handled HERE rather than in the wasm, because it is
   arithmetic on a note number and the module has no opinion about it — ri_set
   takes the four patch values, a model and a polyphony, and adding a seventh
   argument to a DSP wrapper to add twelve to an integer would be the wrong
   place for it. Kept out of ringsParams for the same reason: everything in
   there is posted to the audio thread, and this never needs to go. */
let ringsOctave = 0;
export function setRings(p = {}) {
  if (typeof p.octave === "number") ringsOctave = p.octave;
  const { octave, ...patch } = p;
  ringsParams = { ...ringsParams, ...patch };
  if (ringsNode) ringsNode.port.postMessage({ t: "set", ...ringsParams });
}
export function ringsNote(midi, level = 0.7, when = null) {
  if (!ringsNode || !ctx) return false;
  ringsNode.port.postMessage({ t: "note", midi, level, at: Math.max(ctx.currentTime + 0.005, when || 0) });
  return true;
}

// the audio clock, for anything that wants to schedule against it
export function audioNow() { return ctx ? ctx.currentTime : 0; }

// the graph endpoints, for modules that build their own chains (voice)
export function audioGraph() { return { ctx, master }; }

/* Nudge the context back to life.

   A browser is allowed to stop an AudioContext without telling anyone, and
   iOS has a state the others don't: `interrupted` — a phone call, another
   app taking the audio session, the screen locking. Nothing in here noticed,
   so the room simply went quiet for the rest of the visit and every play()
   after that reported success into a dead graph. resume() only works off a
   user gesture, which is why main.js hangs this on the next tap: whatever
   you touch next brings the sound back. Cheap, silent when nothing's wrong,
   and it covers the whole room rather than just whoever asked. */
export function wakeAudio() {
  if (!ctx || ctx.state === "running") return;
  try { ctx.resume().catch(() => {}); } catch (e) {}
}

// i is a white-key index (0..14 → C_MAJOR) for free-play, or a raw
// chromatic semitone (0..24 from C4) when chromatic=true — the songs use
// the latter so they can reach accidentals the keybed can't free-play.
export function pianoNote(i = 0, _voice = PLAITS_VOICE, vel = 1, when = null, chromatic = false, gate = 0) {
  if (!ctx) return;
  // schedule slightly ahead — no past-start clicks
  const t = Math.max(ctx.currentTime + 0.005, when || 0);
  /* -36..60 rather than 0..24. The songs never leave two octaves, but a
     scale-mapped keybed with the arp stacking octaves on top does —
     pentatonic reaches the third octave on its own, and a root of B plus
     three arp octaves puts the top note five above middle C. */
  const semi = chromatic ? Math.max(-36, Math.min(60, i)) : C_MAJOR[Math.max(0, Math.min(14, i))];
  // Plaits takes every keyboard note. A very early key may start its load,
  // but it never substitutes a different oscillator sound.
  if (plaitsNote(60 + semi, gate || 1.4, 0.55 * Math.max(0.05, vel), t)) return;
  if (miMode === "off") initPlaits();
}

// Generic 8-bit blip for the arcade cabinet.
export function beep(freq, dur = 0.1, type = "square", gain = 0.04, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  const g = ctx.createGain();
  o.connect(g).connect(master);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}

// A meow, synthesized from scratch with randomized pitch, contour,
// vibrato and length — no two meows in the room's history are identical.
/* How loud she is, as one number. Halved on 2026-08-25 — she's the most
   frequent sound in the room by a distance (she meows when you pet her, when
   she's hungry, when she wants the litter changed) and at full level she was
   the loudest thing in it too. Every path out of this function goes through
   it, sample and synthesised alike, so turning her down is one edit and not
   six scattered gains that drift apart. */
const MEOW_LEVEL = 0.5;
let catVolume = 1;
// 0..1, shared by all of Shartacus's own sounds. This is intentionally a
// local owner preference: nobody else's cat gets quieter because Metro is
// adjusting the room on this browser.
export function setCatVolume(amount = 1) {
  catVolume = Math.max(0, Math.min(1, Number(amount) || 0));
  if (!ctx || !catBus) return;
  catBus.gain.setTargetAtTime(catVolume, ctx.currentTime, 0.025);
}

export function meow(mood = false) {
  if (!ctx) return;
  // mood: false/undefined = everyday meow, true/"excited" = happy trill,
  // "angry" = the agitated yowl (the bunny-kick)
  const excited = mood === true || mood === "excited";
  const angry = mood === "angry";
  // real recorded meow when it's decoded — the single clip gets reshaped into
  // distinct "voices" (rate = pitch + length together) so it's never the same twice
  if (catMeowBuf) {
    let prof;
    if (angry) {
      // low, loud, clipped — a pissed-off yowl
      prof = { rate: 0.64 + Math.random() * 0.08, gain: 0.62 * MEOW_LEVEL, attack: 0.003, release: 0.05 };
    } else if (excited) {
      prof = { rate: 1.12 + Math.random() * 0.14, gain: (0.46 + Math.random() * 0.1) * MEOW_LEVEL,
               attack: 0.006, release: 0.06 };
    } else {
      // everyday: pick one of a few shapes at random so back-to-back meows differ
      const shapes = [
        { rate: 0.85, dur: null },    // low, drawn-out
        { rate: 0.95, dur: null },    // soft
        { rate: 1.0,  dur: null },    // plain
        { rate: 1.08, dur: null },    // mid-bright
        { rate: 1.2,  dur: 0.42 },    // short chirp
      ];
      const s = shapes[Math.floor(Math.random() * shapes.length)];
      prof = { rate: s.rate * (0.96 + Math.random() * 0.08), dur: s.dur,
               gain: (0.4 + Math.random() * 0.1) * MEOW_LEVEL, attack: 0.008, release: 0.07 };
    }
    playSample(catMeowBuf, { ...prof, out: catBus || master });
    // excited trills double up; an angry yowl sometimes barks a second time
    if (excited && Math.random() < 0.7) setTimeout(() => meow(false), 200 + Math.random() * 220);
    else if (angry && Math.random() < 0.5) setTimeout(() => meow("angry"), 150 + Math.random() * 130);
    return;
  }
  const t = ctx.currentTime;
  const f0 = (angry ? 210 : 340) + Math.random() * (angry ? 120 : 280);
  const dur = (excited ? 0.3 : angry ? 0.32 : 0.45) + Math.random() * 0.45;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const vib = ctx.createOscillator();
  vib.frequency.value = 4 + Math.random() * 4.5;
  const vibG = ctx.createGain();
  vibG.gain.value = 7 + Math.random() * 16;
  vib.connect(vibG).connect(osc.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.8 + Math.random() * 1.4;
  const g = ctx.createGain();
  osc.connect(bp).connect(g).connect(catBus || master);
  const rise = 0.2 + Math.random() * 0.3;
  osc.frequency.setValueAtTime(f0 * (0.65 + Math.random() * 0.2), t);
  osc.frequency.linearRampToValueAtTime(f0 * (1.1 + Math.random() * 0.35), t + dur * rise);
  osc.frequency.linearRampToValueAtTime(f0 * (0.55 + Math.random() * 0.2), t + dur);
  bp.frequency.setValueAtTime(850 + Math.random() * 600, t);
  bp.frequency.linearRampToValueAtTime(450 + Math.random() * 300, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime((0.05 + Math.random() * 0.025) * MEOW_LEVEL, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t); vib.start(t);
  osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  if (excited && Math.random() < 0.7) setTimeout(() => meow(false), 240 + Math.random() * 260);
}

// Displeasure.
export function hiss() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.8);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  src.connect(bp).connect(g).connect(catBus || master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.start(t); src.stop(t + 0.55);
}

// the squelch of tuning between stations — a short bright noise wash so
// scanning the radio (radio.js) feels like sweeping a real FM dial.
export function radioStatic() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.4);
  const hp = ctx.createBiquadFilter();   // FM hiss lives up top, no rumble
  hp.type = "highpass";
  hp.frequency.value = 1600;
  const g = ctx.createGain();
  src.connect(hp).connect(g).connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.012);   // snap on
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);   // quick fade as the station locks
  src.start(t); src.stop(t + 0.24);
}

// Kibble hitting a bowl, water filling, sand being shuffled.
export function careSound(kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kind === "kibble") {
    for (let i = 0; i < 16; i++) {
      const tt = t + 0.04 + i * (0.035 + Math.random() * 0.04);
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 1400 + Math.random() * 1800;
      const g = ctx.createGain();
      o.connect(g).connect(master);
      g.gain.setValueAtTime(0.012 + Math.random() * 0.01, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.04);
      o.start(tt); o.stop(tt + 0.05);
    }
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.4);
    const f = ctx.createBiquadFilter();
    f.type = kind === "water" ? "lowpass" : "bandpass";
    f.frequency.value = kind === "water" ? 800 : 1100;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === "water" ? 0.05 : 0.035, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    if (kind === "water") f.frequency.linearRampToValueAtTime(1400, t + 1.1);
    src.start(t); src.stop(t + 1.3);
  }
}

// Purring: low rumble, amplitude fluttering at ~24 Hz.
export function purr(seconds = 1.8) {
  if (!ctx) return;
  // real recorded purr when it's decoded — start a little way past the clip's
  // ramp-up and run for `seconds` (the clip is long enough to never run out)
  if (catPurrBuf) {
    // jitter the start point, speed (pitch of the rumble) and level so no two
    // purrs sit at quite the same depth
    const offset = 0.6 + Math.random() * 1.2;
    const rate = 0.9 + Math.random() * 0.18;
    const dur = Math.min(seconds, (catPurrBuf.duration - offset - 0.1) / rate);
    playSample(catPurrBuf, { rate, gain: 0.5 + Math.random() * 0.12, attack: 0.14, release: 0.3, dur, offset, out: catBus || master });
    return;
  }
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(seconds + 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 140;
  const g = ctx.createGain();
  const flutter = ctx.createOscillator();
  flutter.frequency.value = 24;
  const flutterGain = ctx.createGain();
  flutterGain.gain.value = 0.05;
  flutter.connect(flutterGain).connect(g.gain);
  src.connect(lp).connect(g).connect(catBus || master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.start(t); flutter.start(t);
  src.stop(t + seconds + 0.1); flutter.stop(t + seconds + 0.1);
}

// Rain against the window — starts/stops with the real weather.
let rainNodes = null;
export function setRain(level) {   // 0 off, 1 light, 2 heavy
  if (!ctx) return;
  if (!level && rainNodes) {
    rainNodes.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 2);
    const old = rainNodes;
    rainNodes = null;
    setTimeout(() => { try { old.src.stop(); } catch (e) {} }, 2500);
    return;
  }
  if (level && !rainNodes) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(hp).connect(g).connect(master);
    src.start();
    rainNodes = { src, g };
  }
  if (level && rainNodes) {
    rainNodes.g.gain.linearRampToValueAtTime(level === 2 ? 0.035 : 0.015, ctx.currentTime + 2);
  }
}

// The volca-style sampler on the boat's kitchen table.
// 0 KIK 1 SNR 2 HAT 3 OHH 4 CLP 5 TOM 6 RIM 7 COW
export function drumHit(i = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.003;
  const noise = (dur, filterType, freq, q, peak) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    src.start(t); src.stop(t + dur + 0.05);
  };
  const tone = (f0, f1, dur, type, peak) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    o.connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o.start(t); o.stop(t + dur + 0.05);
  };
  switch (i % 8) {
    case 0: tone(140, 38, 0.32, "sine", 0.16); break;                        // kick
    case 1: tone(220, 140, 0.12, "triangle", 0.07); noise(0.16, "highpass", 1600, 0.7, 0.08); break;  // snare
    case 2: noise(0.05, "highpass", 7500, 1, 0.06); break;                   // closed hat
    case 3: noise(0.32, "highpass", 6800, 1, 0.05); break;                   // open hat
    case 4: { for (const d of [0, 0.012, 0.026]) {                           // clap
      const tt = t + d;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.12);
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 1.2;
      const g = ctx.createGain(); src.connect(f).connect(g).connect(master);
      g.gain.setValueAtTime(0.06, tt); g.gain.exponentialRampToValueAtTime(0.0008, tt + 0.09);
      src.start(tt); src.stop(tt + 0.12);
    } break; }
    case 5: tone(190, 75, 0.26, "sine", 0.11); break;                        // tom
    case 6: noise(0.04, "bandpass", 3400, 4, 0.07); break;                   // rim
    case 7: tone(835, 835, 0.22, "square", 0.035); tone(587, 587, 0.22, "square", 0.035); break; // cowbell
  }
}

// THE CREW arena: thrusters, boosts, the disc, the horn.
let thrustNodes = null;
export function setThruster(on) {
  if (!ctx) return;
  if (!on && thrustNodes) {
    thrustNodes.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    const old = thrustNodes;
    thrustNodes = null;
    setTimeout(() => { try { old.src.stop(); } catch (e) {} }, 400);
    return;
  }
  if (on && !thrustNodes) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 320; bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(bp).connect(g).connect(master);
    src.start();
    g.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 0.15);
    thrustNodes = { src, g };
  }
}
export function boostSound() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(1);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(200, t);
  bp.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
  const g = ctx.createGain();
  src.connect(bp).connect(g).connect(master);
  g.gain.setValueAtTime(0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
  src.start(t); src.stop(t + 0.6);
}
export function discSound(kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  if (kind === "throw") {
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.25);
  } else {
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.1);
  }
  const g = ctx.createGain();
  o.connect(g).connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
  o.start(t); o.stop(t + 0.3);
}
export function goalHorn() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [f, d] of [[392, 0], [392, 0.18], [523, 0.36]]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1200;
    const g = ctx.createGain();
    o.connect(lp).connect(g).connect(master);
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.06, t + d + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d + 0.5);
    o.start(t + d); o.stop(t + d + 0.55);
  }
}

// NBA JAM rules: five in a row and the rock catches. "catch" is the moment
// it lights — a burner igniting, sub thump under a rising noise whoosh.
// "make" is every bucket after that: a flare that climbs with the run, so
// the tenth in a row sounds hotter than the fifth.
export function fireSound(kind = "catch", heat = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const h = Math.max(0, Math.min(1, heat));
  if (kind === "catch") {
    // the whoosh: bandpass noise sweeping up, the way gas takes light
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.1);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.012, t + 0.75);
    g.gain.linearRampToValueAtTime(0, t + 0.95);
    src.start(t); src.stop(t + 1.0);
    // and the thump underneath it
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const og = ctx.createGain();
    o.connect(og).connect(master);
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.11, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    og.gain.linearRampToValueAtTime(0, t + 0.6);
    o.start(t); o.stop(t + 0.62);
    return;
  }
  // a flare off the net — brighter and shorter the hotter the run is
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.5);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(700 + h * 900, t);
  bp.frequency.exponentialRampToValueAtTime(2200 + h * 2600, t + 0.22);
  const g = ctx.createGain();
  src.connect(bp).connect(g).connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05 + h * 0.05, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.004, t + 0.3);
  g.gain.linearRampToValueAtTime(0, t + 0.38);
  src.start(t); src.stop(t + 0.4);
}

// The kettle on THE DESI: a real little boil + whistle.
export function kettleBoil() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(4);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(1400, t + 2.6);
  const g = ctx.createGain();
  src.connect(lp).connect(g).connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.035, t + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
  src.start(t); src.stop(t + 3.5);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(1850, t + 2.4);
  o.frequency.linearRampToValueAtTime(2050, t + 3.2);
  const og = ctx.createGain();
  o.connect(og).connect(master);
  og.gain.setValueAtTime(0, t + 2.4);
  og.gain.linearRampToValueAtTime(0.022, t + 2.6);
  og.gain.linearRampToValueAtTime(0, t + 3.3);
  o.start(t + 2.4); o.stop(t + 3.35);
}

// Water lapping against a hull — plus the boat's voice: hull creaks
// every so often, and gulls when the Swedish sun is up.
let waterNodes = null;
let boatFxTimer = null;
function creak() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(85 + Math.random() * 40, t);
  o.frequency.linearRampToValueAtTime(55 + Math.random() * 20, t + 0.7);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 240;
  const g = ctx.createGain();
  o.connect(lp).connect(g).connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.012, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.8);
  g.gain.linearRampToValueAtTime(0, t + 0.85);
  o.start(t); o.stop(t + 0.9);
}
function gull() {
  if (!ctx) return;
  const cries = 1 + Math.floor(Math.random() * 3);
  for (let c = 0; c < cries; c++) {
    const t = ctx.currentTime + c * (0.28 + Math.random() * 0.15);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f0 = 1150 + Math.random() * 250;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.07);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 0.26);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 2;
    const g = ctx.createGain();
    o.connect(bp).connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.26);
    g.gain.linearRampToValueAtTime(0, t + 0.3);
    o.start(t); o.stop(t + 0.32);
  }
}
function scheduleBoatFx() {
  boatFxTimer = setTimeout(() => {
    if (!waterNodes) return;
    Math.random() < 0.55 ? creak() : gull();
    scheduleBoatFx();
  }, 7000 + Math.random() * 16000);
}
export function setWater(on) {
  if (!ctx) return;
  if (!on && waterNodes) {
    clearTimeout(boatFxTimer);
    waterNodes.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
    const old = waterNodes;
    waterNodes = null;
    setTimeout(() => { try { old.src.stop(); old.lfo.stop(); } catch (e) {} }, 2000);
    return;
  }
  if (on && !waterNodes) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.012;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(lp).connect(g).connect(master);
    src.start(); lfo.start();
    g.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 2);
    waterNodes = { src, g, lfo };
    scheduleBoatFx();
  }
}

/* ---------------- the e-kit ---------------- */
// pad 0 kick · 1 snare · 2 closed hat · 3 tom hi · 4 tom lo · 5 crash.
// `when` schedules against the audio clock (songs); `vel` scales the hit
// so a self-playing groove can sit under the piano instead of slapping.
export function edrumHit(pad = 0, when = null, vel = 1) {
  if (!ctx) return;
  const t = Math.max(ctx.currentTime + 0.005, when || 0);
  const A = Math.max(0.05, vel);
  const out = drumBus || master;       // the kit's level bus (turned up + mixer-ready)
  const thump = (f0, f1, dur, peak) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = ctx.createGain();
    o.connect(g).connect(out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    o.start(t); o.stop(t + dur + 0.06);
  };
  const hiss = (hp, dur, peak, type = "highpass") => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = hp;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    src.start(t); src.stop(t + dur + 0.1);
  };
  // the beater click that makes a hit feel like a HIT
  const click = (f, peak = 0.08) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 1.4;
    const g = ctx.createGain();
    src.connect(bp).connect(g).connect(out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.04);
    src.start(t); src.stop(t + 0.06);
  };
  // metallic shimmer: a stack of inharmonic squares behind a highpass. the
  // fundamentals all sit below the cutoff, so only their ringing high harmonics
  // pass — that's what makes a cymbal SING instead of just hiss "pshhh".
  const metal = (dur, peak, hp) => {
    const mix = ctx.createGain(); mix.gain.value = 0.16;
    const f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp; f.Q.value = 0.4;
    const g = ctx.createGain();
    mix.connect(f).connect(g).connect(out);
    for (const fr of [523, 681, 837, 1047, 1392, 1875]) {  // inharmonic ratios
      const o = ctx.createOscillator();
      o.type = "square"; o.frequency.value = fr;
      o.connect(mix); o.start(t); o.stop(t + dur + 0.06);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
  };
  if (pad === 0) { thump(150, 40, 0.32, 0.46 * A); click(2400, 0.15 * A); }    // kick — fatter low end + harder beater
  else if (pad === 1) { thump(215, 150, 0.13, 0.22 * A); hiss(1900, 0.18, 0.26 * A, "bandpass"); hiss(6000, 0.12, 0.07 * A); click(3600, 0.10 * A); }  // snare — more crack + body
  else if (pad === 2) { metal(0.06, 0.21 * A, 8200); hiss(9000, 0.05, 0.22 * A); click(9000, 0.07 * A); }  // closed hat — crisp + ringing, +50%
  else if (pad === 3) { thump(185, 115, 0.26, 0.24 * A); click(2800, 0.06 * A); }  // tom hi
  else if (pad === 4) { thump(145, 85, 0.32, 0.24 * A); click(2400, 0.06 * A); }   // tom lo
  else { metal(1.1, 0.20 * A, 5200); hiss(8500, 0.85, 0.28 * A); hiss(4800, 0.5, 0.16 * A); click(6500, 0.06 * A); }  // crash — bright shimmer + splash, +50%
}

/* ---------------- the telecaster: karplus-strong plucks ---------------- */
// A minor pentatonic, low A up two octaves — pick a fret, get a note
const PENTA_AM = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440];
// the guitar's voices — one Karplus-Strong string, four sets of knobs. `damp`
// is how fast the string sheds its top end (sustain + brightness), `lp` the
// cab's darkness, `dur` how long it can ring, `body` an optional boxy
// resonance, `soft` how many times the pick attack is rounded off. Same idea
// as PIANO_VOICES — switch them on the tele's blade selector.
export const GUITAR_VOICES = [
  // the bright twang we started with — the reference tele sound
  { name: "TELE",      damp: 0.996, lp: 4400, dur: 1.7, peak: 0.17 },
  // a flat-top steel: more sustain, brighter top, a boxy low + softer pick
  { name: "ACOUSTIC",  damp: 0.997, lp: 5400, dur: 1.95, peak: 0.15, body: { f: 196, q: 1.1, gain: 7 }, soft: 1 },
  // nylon classical: rounder, darker, a gentle thumb attack
  { name: "NYLON",     damp: 0.994, lp: 3000, dur: 1.5, peak: 0.16, body: { f: 230, q: 1.4, gain: 5 }, soft: 3 },
  // palm-muted chug: choked decay, dark, short — a percussive thunk
  { name: "PALM MUTE", damp: 0.945, lp: 2500, dur: 0.5, peak: 0.2 },
  /* RINGS is not a plucked delay line like the four above it — it's Émilie
     Gillet's resonator running as wasm on the audio thread, and it only
     exists once initRings() has fetched it. The numbers here are what you
     hear until then, and what you hear forever if the fetch fails: the TELE,
     so a guitar set to RINGS is never a silent guitar. */
  { name: "RINGS",     damp: 0.996, lp: 4400, dur: 1.7, peak: 0.17, mi: true },
];
export const RINGS_VOICE = GUITAR_VOICES.findIndex(v => v.mi);
// pick a voice descriptor safely from any index (matches PIANO_VOICES' guard)
function gvoice(voice) { return GUITAR_VOICES[Math.abs(voice | 0) % GUITAR_VOICES.length]; }
// the string itself: pluck a frequency at audio time `when`, peak `peak`,
// shaped by a GUITAR_VOICES entry `v`.
function pluckString(f, when = null, peak = 0.17, v = GUITAR_VOICES[0]) {
  if (!ctx) return;
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr / f));
  const dur = v.dur || 1.7;
  const damp = v.damp || 0.996;
  const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
  const d = buf.getChannelData(0);
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
  // a softer pick = pre-smooth the noise burst so the attack is rounded, not
  // spiky (acoustic/nylon); a hard tele/mute pick leaves the burst alone
  for (let s = 0; s < (v.soft || 0); s++) {
    let prev = line[N - 1];
    for (let i = 0; i < N; i++) { const cur = line[i]; line[i] = 0.5 * (prev + cur); prev = cur; }
  }
  let idx = 0;
  for (let i = 0; i < d.length; i++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % N];
    d[i] = cur;
    line[idx] = damp * 0.5 * (cur + nxt);   // the string loses its top end
    idx = (idx + 1) % N;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = v.lp || 4400;
  const g = ctx.createGain();
  g.gain.value = Math.max(0.01, peak);
  // an optional body resonance (the boxy thump of a flat-top) in series
  let head = lp;
  if (v.body) {
    const peakF = ctx.createBiquadFilter();
    peakF.type = "peaking";
    peakF.frequency.value = v.body.f; peakF.Q.value = v.body.q; peakF.gain.value = v.body.gain;
    lp.connect(peakF); head = peakF;
  }
  // the string runs the tele's pedalboard (overdrive→delay→reverb) to master
  src.connect(lp);
  head.connect(g).connect(guitarBus || master);
  src.start(Math.max(ctx.currentTime + 0.005, when || 0));
}
/* Rings gets first refusal on any pluck, exactly the way Plaits does on the
   keyboard: if the wasm is up it takes the note, and if it isn't we start
   fetching it and let the delay-line string cover this one. So the first
   note after switching sounds like the fallback and every one after it is
   the real module. Rings wants MIDI; the guitar thinks in frequencies. */
function ringsFromHz(hz, vel, when) {
  const v = gvoice(RINGS_VOICE);
  if (!v.mi) return false;
  const midi = 69 + 12 * Math.log2(Math.max(1, hz) / 440) + ringsOctave * 12;
  if (ringsNote(midi, 0.55 * Math.max(0.05, vel), when)) return true;
  if (riMode === "off") initRings();
  return false;
}
// live play: a fret on the A-minor-pentatonic neck, in the chosen timbre
export function guitarPluck(n = 0, voice = 0, when = null) {
  const hz = PENTA_AM[Math.max(0, Math.min(PENTA_AM.length - 1, n | 0))];
  if (gvoice(voice).mi && ringsFromHz(hz, 1, when)) return;
  pluckString(hz, when, 0.17, gvoice(voice));
}
// song play: a chromatic note, `semi` semitones from C4 (negative = lower),
// so the guitar can track a song's real key instead of the pentatonic frets.
export function guitarNote(semi = 0, vel = 1, when = null, voice = 0) {
  const hz = 261.63 * Math.pow(2, semi / 12);
  if (gvoice(voice).mi && ringsFromHz(hz, vel, when)) return;
  pluckString(hz, when, 0.17 * Math.max(0.05, vel), gvoice(voice));
}

/* ---------------- arena combat: swings, clangs, stuns ---------------- */
export function punchSound(hit = false) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.3);
  const f = ctx.createBiquadFilter();
  f.type = hit ? "bandpass" : "highpass";
  f.frequency.value = hit ? 700 : 1800;
  if (hit) f.Q.value = 1.2;
  const g = ctx.createGain();
  src.connect(f).connect(g).connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(hit ? 0.12 : 0.05, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t + (hit ? 0.16 : 0.1));
  g.gain.linearRampToValueAtTime(0, t + (hit ? 0.2 : 0.13));
  src.start(t); src.stop(t + 0.25);
}

export function smokeSound(kind = "bong") {
  // the smoking corner: water doing its job, or paper on the draw
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  if (kind === "bong") {
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer(1.7);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 850;
    const bg = ctx.createGain();
    bed.connect(lp).connect(bg).connect(master);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.028, t + 0.15);
    bg.gain.exponentialRampToValueAtTime(0.0008, t + 1.45);
    bg.gain.linearRampToValueAtTime(0, t + 1.55);
    bed.start(t); bed.stop(t + 1.7);
    for (let i = 0; i < 14; i++) {
      const bt = t + 0.08 + i * 0.09 + Math.random() * 0.05;
      const o = ctx.createOscillator();
      o.type = "sine";
      const f0 = 180 + Math.random() * 260;
      o.frequency.setValueAtTime(f0, bt);
      o.frequency.exponentialRampToValueAtTime(f0 * 2.3, bt + 0.07);
      const g = ctx.createGain();
      o.connect(g).connect(master);
      g.gain.setValueAtTime(0, bt);
      g.gain.linearRampToValueAtTime(0.032, bt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, bt + 0.085);
      g.gain.linearRampToValueAtTime(0, bt + 0.1);
      o.start(bt); o.stop(bt + 0.12);
    }
  } else {
    // the joint: a dry crackle, barely there
    for (let i = 0; i < 5; i++) {
      const bt = t + i * 0.12 + Math.random() * 0.06;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.1);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 2400;
      const g = ctx.createGain();
      src.connect(hp).connect(g).connect(master);
      g.gain.setValueAtTime(0, bt);
      g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.015, bt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, bt + 0.07);
      g.gain.linearRampToValueAtTime(0, bt + 0.09);
      src.start(bt); src.stop(bt + 0.12);
    }
  }
}

export function shotSound() {
  // the plane hunt: a sharp crack in the room, a touch of low thump
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.4);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 900;
  const g = ctx.createGain();
  src.connect(hp).connect(g).connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.18);
  g.gain.linearRampToValueAtTime(0, t + 0.22);
  src.start(t); src.stop(t + 0.3);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
  const g2 = ctx.createGain();
  o.connect(g2).connect(master);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.09, t + 0.006);
  g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
  g2.gain.linearRampToValueAtTime(0, t + 0.24);
  o.start(t); o.stop(t + 0.3);
}

export function shieldClang() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  for (const [f0, amt] of [[1244, 0.07], [1865, 0.045], [2710, 0.03]]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f0;
    const g = ctx.createGain();
    o.connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amt, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    o.start(t); o.stop(t + 0.65);
  }
}

export function stunBuzz() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.005;
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.55);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 900;
  const g = ctx.createGain();
  o.connect(lp).connect(g).connect(master);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.6);
  g.gain.linearRampToValueAtTime(0, t + 0.65);
  o.start(t); o.stop(t + 0.7);
}

/* ---------------- the arcade, as a place you can hear ----------------
   A bed of cabinet hum plus randomized attract-mode chiptune, behind
   one gain that main.js drives from the player's position: full inside
   the arcade, leaking through the closet doorway, gone on the boat. */
// overall loudness of the arcade bed (fan + hum + attract chiptune). the room
// was a touch shouty at full tilt, so the whole zone rides at this fraction —
// scales the in-room volume AND the bedroom bleed together. tune to taste.
const ARCADE_LEVEL = 0.5;
let arcadeZone = null;
/* What the room is actually making a noise with, for the smoke harness —
   reading the gain nodes themselves rather than trusting the code that set
   them. Room scoping is the one thing here you cannot check by looking at a
   screenshot. */
export function audioDebug() {
  return {
    roomTone: roomToneGains ? +roomToneGains[0].gain.value.toFixed(5) : null,
    rain: rainNodes ? +rainNodes.g.gain.value.toFixed(5) : null,
    arcade: arcadeZone ? +arcadeZone.out.gain.value.toFixed(3) : null,
    // every delay line's repeat time — the room's tempo, as heard
    delays: Object.fromEntries(Object.keys(fxDelays).map(
      id => [id, +fxDelays[id].delayTime.value.toFixed(4)])),
    clouds: { plaits: !!cloudsNode, guitar: !!guitarCloudsNode,
              mode: cloudsMode, wet: cloudsParams.wet, reverb: cloudsParams.verb },
  };
}

export function setArcadeZone(level) {
  if (!ctx) return;
  if (!arcadeZone) {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    // cabinet fans + old transformers
    const fan = ctx.createBufferSource();
    fan.buffer = noiseBuffer(4);
    fan.loop = true;
    const fanLp = ctx.createBiquadFilter();
    fanLp.type = "lowpass"; fanLp.frequency.value = 260;
    const fanG = ctx.createGain(); fanG.gain.value = 0.05;
    fan.connect(fanLp).connect(fanG).connect(out);
    fan.start();
    const hum = ctx.createOscillator();
    hum.type = "sine"; hum.frequency.value = 119;
    const humG = ctx.createGain(); humG.gain.value = 0.012;
    hum.connect(humG).connect(out);
    hum.start();
    arcadeZone = { out, level: 0 };
    // attract modes chirping away on their own clocks
    const PENTA = [330, 392, 440, 523, 587, 659, 784, 880];
    const burst = () => {
      // sparse: long, random gaps so the chiptune is an occasional far-off
      // chirp, not a constant nagging loop
      const delay = 4000 + Math.random() * 9000;   // 4–13 s between attract sounds
      setTimeout(burst, delay);
      if (!arcadeZone || arcadeZone.level < 0.04) return;
      if (Math.random() < 0.35) return;            // and sometimes the cabinets just sit quiet
      const t0 = ctx.currentTime + 0.02;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.4 - 0.7;
      pan.connect(out);
      if (Math.random() < 0.14) {           // a coin drops somewhere
        for (const [f, dt] of [[988, 0], [1319, 0.09]]) {
          const o = ctx.createOscillator();
          o.type = "sine"; o.frequency.value = f;
          const g = ctx.createGain();
          o.connect(g).connect(pan);
          g.gain.setValueAtTime(0, t0 + dt);
          g.gain.linearRampToValueAtTime(0.018, t0 + dt + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0008, t0 + dt + 0.5);
          g.gain.linearRampToValueAtTime(0, t0 + dt + 0.55);
          o.start(t0 + dt); o.stop(t0 + dt + 0.6);
        }
        return;
      }
      // a snip of attract-mode melody
      const n = 3 + (Math.random() * 4 | 0);
      const step = 0.07 + Math.random() * 0.09;
      const type = Math.random() < 0.5 ? "square" : "triangle";
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = PENTA[Math.random() * PENTA.length | 0];
        const g = ctx.createGain();
        o.connect(g).connect(pan);
        const t = t0 + i * step;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.014, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0008, t + step * 0.9);
        g.gain.linearRampToValueAtTime(0, t + step * 0.95);
        o.start(t); o.stop(t + step);
      }
    };
    burst();
  }
  arcadeZone.level = level;
  arcadeZone.out.gain.linearRampToValueAtTime(level * ARCADE_LEVEL, ctx.currentTime + 0.35);
}

// The city outside, heard through the walls: a far-off siren or a
// car with too much subwoofer rolling past.
export function citySound(type = "siren") {
  if (!ctx) return;
  const t = ctx.currentTime;

  if (type === "plane") {
    // a jet on the LAX approach, heard through the glass
    const dur = 13;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.linearRampToValueAtTime(520, t + dur * 0.45);   // doppler-ish
    lp.frequency.linearRampToValueAtTime(140, t + dur);
    src.start(t);
    src.stop(t + dur + 0.2);
    return;
  }

  if (type === "boom") {
    // a jet coming down over the city, heard through the glass:
    // a muffled whump and a long low roll
    const dur = 2.6;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    src.start(t); src.stop(t + dur + 0.2);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 1.4);
    const g2 = ctx.createGain();
    o.connect(g2).connect(master);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.1, t + 0.03);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 1.6);
    g2.gain.linearRampToValueAtTime(0, t + 1.7);
    o.start(t); o.stop(t + 1.8);
    return;
  }

  if (type === "zilla") {
    // something enormous, miles out, heard twice through the glass:
    // the roar, then the deep rumble of the fire underneath it
    for (const det of [0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(95 + det, t);
      osc.frequency.linearRampToValueAtTime(120 + det, t + 0.7);
      osc.frequency.exponentialRampToValueAtTime(48, t + 3.4);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 260; lp.Q.value = 4;
      const g = ctx.createGain();
      osc.connect(lp).connect(g).connect(master);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
      osc.start(t); osc.stop(t + 4);
    }
    const dur = 7;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 90;
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(master);
    g.gain.setValueAtTime(0.0001, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.11, t + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t + 2.2); src.stop(t + dur + 0.2);
    return;
  }

  if (type === "siren") {
    const dur = 7;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    osc.connect(lp).connect(g).connect(master);
    // two-tone wail, drifting away
    for (let i = 0; i < dur; i += 1.4) {
      osc.frequency.setValueAtTime(620, t + i);
      osc.frequency.linearRampToValueAtTime(470, t + i + 1.4);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.016, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  } else {
    const dur = 4.5;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 70;
    const g = ctx.createGain();
    src.connect(lp).connect(g).connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t);
    src.stop(t + dur + 0.2);
  }
}

/* ===================================================================
   THE BATHROOM — a convolution reverb, and the toilets' sample pack
   =================================================================== */

/* The impulse response is SYNTHESIZED, not shipped. Everything else in this
   file makes its own sound and an IR is just a buffer; a tiled room is an easy
   one to describe. Two parts, and both matter:
     - early reflections, a handful of discrete slaps in the first 50 ms. These
       are what make it read as a small ROOM rather than a plate — the ear gets
       the wall distances from them. Offset per channel so it has width.
     - a diffuse tail under an exponential decay, kept BRIGHT. Tile reflects
       high frequencies instead of eating them, and that hard ringy quality is
       the entire character of a public bathroom. */
function buildBathIR() {
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.15);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * Math.exp(-t * 2.6);
    }
    let amp = 0.85;
    for (const tap of (ch ? [0.009, 0.018, 0.027, 0.039, 0.052] : [0.007, 0.015, 0.029, 0.036, 0.050])) {
      const i = Math.floor(tap * sr);
      if (i < len) d[i] += amp * (ch ? -1 : 1);
      amp *= 0.72;
    }
  }
  return buf;
}

let bathIn = null;
/* the send BUS: connect a gain into this and that gain is your wet amount.
   Built on first use — most visits to this world never open the door. */
export function bathroomSend() {
  if (bathIn || !ctx) return bathIn;
  const conv = ctx.createConvolver();
  conv.buffer = buildBathIR();
  const tone = ctx.createBiquadFilter();      // trim the very top: bright, not hissy
  tone.type = "highshelf"; tone.frequency.value = 6200; tone.gain.value = -5;
  const ret = ctx.createGain(); ret.gain.value = 0.85;
  bathIn = ctx.createGain();
  bathIn.connect(conv).connect(tone).connect(ret).connect(master);
  return bathIn;
}

/* --- the toilets' pack. 27 one-shots, loaded the first time somebody opens
   that door and never on the way in. --- */
const FART_N = 27;
let fartBufs = null, fartLoading = null;
export function loadFarts() {
  if (fartBufs) return Promise.resolve(fartBufs.length > 0);
  if (fartLoading) return fartLoading;
  if (!ctx) return Promise.resolve(false);
  const urls = Array.from({ length: FART_N }, (_, i) =>
    `assets/audio/farts/fart-${String(i + 1).padStart(2, "0")}.mp3`);
  fartLoading = Promise.all(urls.map(loadSample)).then((bufs) => {
    fartBufs = bufs.filter(Boolean);
    return fartBufs.length > 0;
  });
  return fartLoading;
}
export function fartsReady() { return !!(fartBufs && fartBufs.length); }

/* A SHUFFLE BAG, the same rule the studio's dumbek row runs on: draw without
   replacement so all 27 play before any repeats, and a fresh bag never opens
   with the one you just heard — otherwise the seam between bags is the one
   place a repeat can still happen, and that's exactly where you'd notice it. */
let fartBag = [], fartLast = -1;
function nextFart() {
  if (!fartBufs || !fartBufs.length) return -1;
  if (!fartBag.length) {
    fartBag = fartBufs.map((_, i) => i);
    for (let i = fartBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fartBag[i], fartBag[j]] = [fartBag[j], fartBag[i]];
    }
    // the bag is drawn from the END, so the last element is the next one out
    if (fartBag.length > 1 && fartBag[fartBag.length - 1] === fartLast) {
      [fartBag[0], fartBag[fartBag.length - 1]] = [fartBag[fartBag.length - 1], fartBag[0]];
    }
  }
  fartLast = fartBag.pop();
  return fartLast;
}

/* No attack ramp on purpose — the transient IS the joke, and playSample's
   fade would round it off. `wet` is how much goes to the tiled room. */
/* ONE knob for how loud the toilets are, the same way MUZ_CEILING is the one
   knob for the speaker. `gain` at the call sites is now RELATIVE — 1 means
   "you're standing next to it", less means you're further off or it's
   somebody else's — and this is the level that scales the lot. It lived at
   0.85 spread across three call sites, which is exactly how a level drifts
   apart: one gets tuned, the others don't. */
const FART_LEVEL = 0.20;

export function fart({ wet = 0, gain = 1, rate = 1, index = null } = {}) {
  if (!ctx || !fartBufs || !fartBufs.length) return -1;
  const i = index != null && fartBufs[index] ? index : nextFart();
  if (i < 0) return -1;
  const src = ctx.createBufferSource();
  src.buffer = fartBufs[i];
  src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain * FART_LEVEL;
  src.connect(g).connect(master);
  if (wet > 0) {
    const w = ctx.createGain(); w.gain.value = wet;
    g.connect(w).connect(bathroomSend());
  }
  src.start(ctx.currentTime);
  return i;
}

/* --- the bathroom's ceiling speaker -----------------------------------
   One song on a loop, through a chain that is mostly SUBTRACTIVE. A mall
   speaker isn't a small hi-fi, it's a 4-inch driver in a ceiling tile: no
   bass, no top, a honk in the middle, and just enough grit to sound like a
   cheap amplifier. Building that is a highpass, a peak, a lowpass and a soft
   clip — nothing here adds anything.

   It goes through the SAME convolver the toilets do, because it's in the same
   tiled room and would sound wrong dry next to them.

   Two things are driven from main.js per frame: `level`, which is distance,
   and `muffle`, which is a lowpass that closes as you leave. Sound doesn't
   just get quieter through a wall, it gets DULLER — losing the top as you
   walk out is most of what makes it read as coming from in there. */
let muzSrc = null, muzGain = null, muzMuffle = null, muzBuf = null, muzLoading = null;
let speakerIn = null, muzBed = null;      // the speaker itself, and the music into it
const MUZ_URL = "assets/audio/muzak/bathroom-loop.mp3";
/* 0.032, down from 0.085 — about 8 dB quieter. It is BACKGROUND: the test is
   that you notice the room has music, not that you notice the music. Anything
   you can follow the tune of in here is too loud. */
const MUZ_CEILING = 0.032;

export function loadBathMusic() {
  if (muzBuf) return Promise.resolve(true);
  if (muzLoading) return muzLoading;
  if (!ctx) return Promise.resolve(false);
  muzLoading = loadSample(MUZ_URL).then((b) => { muzBuf = b; return !!b; });
  return muzLoading;
}

export function startBathMusic() {
  if (muzSrc || !ctx || !muzBuf) return false;
  const src = ctx.createBufferSource();
  src.buffer = muzBuf; src.loop = true;

  const hp = ctx.createBiquadFilter();                    // no bass out of a ceiling tile
  hp.type = "highpass"; hp.frequency.value = 360; hp.Q.value = 0.7;
  const honk = ctx.createBiquadFilter();                  // the boxy midrange
  honk.type = "peaking"; honk.frequency.value = 1650; honk.Q.value = 1.1; honk.gain.value = 5;
  const lp = ctx.createBiquadFilter();                    // and no top either
  lp.type = "lowpass"; lp.frequency.value = 3600; lp.Q.value = 0.6;
  const grit = ctx.createWaveShaper();                    // a tired little amp
  const c = new Float32Array(256);
  for (let i = 0; i < 256; i++) c[i] = Math.tanh(((i / 127.5) - 1) * 1.6);
  grit.curve = c;

  muzMuffle = ctx.createBiquadFilter();                   // the wall, driven per frame
  muzMuffle.type = "lowpass"; muzMuffle.frequency.value = 3600; muzMuffle.Q.value = 0.4;
  muzGain = ctx.createGain(); muzGain.gain.value = 0;     // fades up from silence

  /* Everything the speaker plays goes in HERE, not just the music — the DJ
     has to come out of the same driver or the joke doesn't land. The music
     gets its own gain on the way in so he can duck it while he talks. */
  speakerIn = ctx.createGain();
  muzBed = ctx.createGain(); muzBed.gain.value = 1;
  src.connect(muzBed).connect(speakerIn);
  speakerIn.connect(hp).connect(honk).connect(lp).connect(grit).connect(muzMuffle).connect(muzGain);
  muzGain.connect(master);
  const wet = ctx.createGain(); wet.gain.value = 0.85;    // same tiled room as everything else
  muzGain.connect(wet).connect(bathroomSend());
  src.start(ctx.currentTime + 0.02);
  muzSrc = src;
  muzNextTalk = ctx.currentTime + muzBuf.duration;   // he speaks at the wrap
  return true;
}

/* --- the voice between the songs ------------------------------------
   Rendered once by tools/voice/render-dj.mjs, same as Trinity's lines. No
   manifest on disk means nobody has rendered him yet, and he simply stays
   quiet — the room is not broken by a missing gag. */
const DJ_DIR = "assets/audio/dj/";
let djIds = null, djLoading = null;
const djBufs = new Map();
let djBag = [], djLast = -1, muzNextTalk = 0, djTalking = false;

export function loadDJ() {
  if (djIds) return Promise.resolve(djIds.length > 0);
  if (djLoading) return djLoading;
  djLoading = fetch(DJ_DIR + "manifest.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => { djIds = (m && m.clips) || []; return djIds.length > 0; })
    .catch(() => { djIds = []; return false; });
  return djLoading;
}
export function djReady() { return !!(djIds && djIds.length); }

// same shuffle bag as the toilets: all of them before any repeat, and a new
// bag never opens with the one you just heard
function nextDJ() {
  if (!djIds || !djIds.length) return null;
  if (!djBag.length) {
    djBag = djIds.map((_, i) => i);
    for (let i = djBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [djBag[i], djBag[j]] = [djBag[j], djBag[i]];
    }
    if (djBag.length > 1 && djBag[djBag.length - 1] === djLast) {
      [djBag[0], djBag[djBag.length - 1]] = [djBag[djBag.length - 1], djBag[0]];
    }
  }
  djLast = djBag.pop();
  return djIds[djLast];
}

async function playDJ() {
  if (djTalking || !ctx || !speakerIn || !djReady()) return;
  const id = nextDJ(); if (!id) return;
  let buf = djBufs.get(id);
  if (!buf) {
    buf = await loadSample(DJ_DIR + id + ".mp3");
    if (!buf) return;
    djBufs.set(id, buf);
  }
  djTalking = true;
  const t = ctx.currentTime + 0.05;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain();
  /* He rides 2.4x the bed rather than 3.2x. Everything on this speaker came
     down together, but a voice has to clear the music it's talking over — at
     the old ratio he'd now be shouting over a whisper. This lands him about
     where the music used to sit, which is right for an announcement. */
  g.gain.value = 2.4;
  src.connect(g).connect(speakerIn);
  // duck the music under him and bring it back — radio does this, and it's
  // the difference between a voice and a voice fighting a song
  muzBed.gain.setTargetAtTime(0.35, t, 0.15);
  muzBed.gain.setTargetAtTime(1, t + buf.duration, 0.4);
  src.start(t);
  src.onended = () => { djTalking = false; };
}
export function djTalkNow() { return playDJ(); }

/* level 0..1 (distance) and open 0..1 (how much of the top survives the wall).
   Ramped, not set: a gain that steps per frame ticks audibly. */
export function setBathMusic(level, open = 1) {
  if (!ctx || !muzGain) return;
  const t = ctx.currentTime;
  /* He talks when the song wraps. Checked here because this is already
     called every frame, and gated on level so an empty bathroom doesn't
     broadcast to nobody — the loop runs whether you're there or not. */
  if (muzNextTalk && t >= muzNextTalk) {
    muzNextTalk = t + (muzBuf ? muzBuf.duration : 90);
    if (level > 0.15) playDJ();
  }
  muzGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * MUZ_CEILING, t, 0.25);
  const f = 700 + Math.max(0, Math.min(1, open)) * 2900;
  muzMuffle.frequency.setTargetAtTime(f, t, 0.25);
}
export function bathMusicOn() { return !!muzSrc; }
// what the speaker is actually doing right now — the smoke test reads this to
// prove the falloff is real rather than trusting that the maths looked right
export function bathMusicState() {
  return muzGain
    ? { gain: +muzGain.gain.value.toFixed(4), cutoff: Math.round(muzMuffle.frequency.value),
        bed: muzBed ? +muzBed.gain.value.toFixed(3) : -1, talking: djTalking }
    : null;
}
