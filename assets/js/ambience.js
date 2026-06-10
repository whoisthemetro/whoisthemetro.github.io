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
  master.connect(ctx.destination);

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

// The cat stepping on the MIDI keys — soft pentatonic plinks.
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
export function plink(i = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 220 * Math.pow(2, PENTA[i % PENTA.length] / 12);
  const g = ctx.createGain();
  osc.connect(g).connect(master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  osc.start(t);
  osc.stop(t + 0.75);
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

// The city outside, heard through the walls: a far-off siren or a
// car with too much subwoofer rolling past.
export function citySound(type = "siren") {
  if (!ctx) return;
  const t = ctx.currentTime;

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
