/* ============================================================
   THE METRO — sound of the place
   Pure WebAudio, no files: a low room hum, and the rising
   roar of a train when one passes. Starts only after the
   user clicks "descend" (browser autoplay rules).
   ============================================================ */

let ctx = null;
let master = null;

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
}

// The MIDI keys under the desk — two C major octaves, low to high.
// Played by visitors (and walked on by the cat). Several voices;
// click the controller body to cycle them.
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
export const PIANO_VOICES = [
  { name: "E-PIANO",   parts: [[1, "sine", 1], [2, "triangle", 0.35]], dec: 1.3, peak: 0.07 },
  { name: "MUSIC BOX", parts: [[1, "sine", 1], [3, "sine", 0.14], [5.04, "sine", 0.05]], dec: 1.9, peak: 0.06 },
  { name: "8-BIT",     parts: [[1, "square", 0.55]], dec: 0.45, peak: 0.05 },
  { name: "SYNTH",     parts: [[1, "sawtooth", 0.6], [1.006, "sawtooth", 0.45]], dec: 0.9, peak: 0.05, lp: 1900 },
  { name: "ORGAN",     parts: [[1, "sine", 0.7], [2, "sine", 0.5], [4, "sine", 0.22]], dec: 0.6, peak: 0.06 },
];

export function pianoNote(i = 0, voice = 0) {
  if (!ctx) return;
  const v = PIANO_VOICES[Math.abs(voice) % PIANO_VOICES.length];
  const t = ctx.currentTime + 0.005;   // schedule slightly ahead — no past-start clicks
  const f = 261.63 * Math.pow(2, C_MAJOR[Math.max(0, Math.min(14, i))] / 12);
  const g = ctx.createGain();
  let out = g;
  if (v.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = v.lp;
    g.connect(lp);
    out = lp;
  }
  out.connect(master);
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
  g.gain.linearRampToValueAtTime(v.peak, t + 0.01);
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

// Water lapping against a hull — the boat room's room tone.
let waterNodes = null;
export function setWater(on) {
  if (!ctx) return;
  if (!on && waterNodes) {
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
  }
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
