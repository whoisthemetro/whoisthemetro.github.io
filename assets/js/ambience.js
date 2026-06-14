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
let gtrFilter = null;  // the guitar's front-of-chain lowpass, ridden by a draggable pedal
const busBase = {};    // id → the gain each bus was built at (100% on the mixer)
const fxStages = {};        // id → {dry, wet, wet0} — a stompbox toggles these to bypass
const fxDelays = {};        // id → DelayNode, for tempo-syncing the delay pedals to a song
const fxDelayDefault = {};  // id → its free-play delayTime (reverted to when no song plays)

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

  node.connect(master);
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

  // room tone: deep filtered rumble + faint electrical hum
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 90;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  src.connect(lp).connect(g).connect(master);
  src.start();

  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 120;
  const humLp = ctx.createBiquadFilter();
  humLp.type = "lowpass";
  humLp.frequency.value = 300;
  const humG = ctx.createGain();
  humG.gain.value = 0.006;
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
let roomToneGains = null;
export function setRoomTone(on) {
  if (!ctx || !roomToneGains) return;
  const t = ctx.currentTime;
  roomToneGains[0].gain.linearRampToValueAtTime(on ? 0.05 : 0.0001, t + 1.2);
  roomToneGains[1].gain.linearRampToValueAtTime(on ? 0.006 : 0.0001, t + 1.2);
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
  { name: "E-PIANO",   parts: [[1, "sine", 1], [2, "triangle", 0.35]], dec: 1.3, peak: 0.07 },
  { name: "MUSIC BOX", parts: [[1, "sine", 1], [3, "sine", 0.14], [5.04, "sine", 0.05]], dec: 1.9, peak: 0.06 },
  { name: "8-BIT",     parts: [[1, "square", 0.55]], dec: 0.45, peak: 0.05 },
  { name: "SYNTH",     parts: [[1, "sawtooth", 0.6], [1.006, "sawtooth", 0.45]], dec: 0.9, peak: 0.05, lp: 1900 },
  { name: "ORGAN",     parts: [[1, "sine", 0.7], [2, "sine", 0.5], [4, "sine", 0.22]], dec: 0.6, peak: 0.06 },
];

// the audio clock, for anything that wants to schedule against it
export function audioNow() { return ctx ? ctx.currentTime : 0; }

// the graph endpoints, for modules that build their own chains (voice)
export function audioGraph() { return { ctx, master }; }

// i is a white-key index (0..14 → C_MAJOR) for free-play, or a raw
// chromatic semitone (0..24 from C4) when chromatic=true — the songs use
// the latter so they can reach accidentals the keybed can't free-play.
export function pianoNote(i = 0, voice = 0, vel = 1, when = null, chromatic = false) {
  if (!ctx) return;
  const v = PIANO_VOICES[Math.abs(voice) % PIANO_VOICES.length];
  // schedule slightly ahead — no past-start clicks
  const t = Math.max(ctx.currentTime + 0.005, when || 0);
  const semi = chromatic ? Math.max(0, Math.min(24, i)) : C_MAJOR[Math.max(0, Math.min(14, i))];
  const f = 261.63 * Math.pow(2, semi / 12);
  const g = ctx.createGain();
  let out = g;
  if (v.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = v.lp;
    g.connect(lp);
    out = lp;
  }
  // the keyboard runs through its floor pedals (chorus→delay→reverb) on the
  // way to the bus; falls back to master if the chain hasn't been built yet
  out.connect(pianoBus || master);
  for (const [mult, type, amt] of v.parts) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    const og = ctx.createGain();
    og.gain.value = amt;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + v.dec + 0.08);
  }
  // pop-free envelope: true-zero linear attack, exponential decay,
  // then a short linear tail back to actual zero before the stop
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(v.peak * Math.max(0.01, vel), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + v.dec);
  g.gain.linearRampToValueAtTime(0, t + v.dec + 0.05);
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
export function meow(excited = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f0 = 340 + Math.random() * 280;
  const dur = (excited ? 0.3 : 0.45) + Math.random() * 0.45;
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
  osc.connect(bp).connect(g).connect(master);
  const rise = 0.2 + Math.random() * 0.3;
  osc.frequency.setValueAtTime(f0 * (0.65 + Math.random() * 0.2), t);
  osc.frequency.linearRampToValueAtTime(f0 * (1.1 + Math.random() * 0.35), t + dur * rise);
  osc.frequency.linearRampToValueAtTime(f0 * (0.55 + Math.random() * 0.2), t + dur);
  bp.frequency.setValueAtTime(850 + Math.random() * 600, t);
  bp.frequency.linearRampToValueAtTime(450 + Math.random() * 300, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.025, t + 0.05);
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
  src.connect(bp).connect(g).connect(master);
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
  src.connect(lp).connect(g).connect(master);
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
];
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
// live play: a fret on the A-minor-pentatonic neck, in the chosen timbre
export function guitarPluck(n = 0, voice = 0, when = null) {
  pluckString(PENTA_AM[Math.max(0, Math.min(PENTA_AM.length - 1, n | 0))], when, 0.17, gvoice(voice));
}
// song play: a chromatic note, `semi` semitones from C4 (negative = lower),
// so the guitar can track a song's real key instead of the pentatonic frets.
export function guitarNote(semi = 0, vel = 1, when = null, voice = 0) {
  pluckString(261.63 * Math.pow(2, semi / 12), when, 0.17 * Math.max(0.05, vel), gvoice(voice));
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
let arcadeZone = null;
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
      const delay = 700 + Math.random() * 2400;
      setTimeout(burst, delay);
      if (!arcadeZone || arcadeZone.level < 0.04) return;
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
          g.gain.linearRampToValueAtTime(0.045, t0 + dt + 0.008);
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
        g.gain.linearRampToValueAtTime(0.035, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0008, t + step * 0.9);
        g.gain.linearRampToValueAtTime(0, t + step * 0.95);
        o.start(t); o.stop(t + step);
      }
    };
    burst();
  }
  arcadeZone.level = level;
  arcadeZone.out.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.35);
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
