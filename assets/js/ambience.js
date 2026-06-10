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

export function trainSound(seconds = 6.5) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(seconds + 1);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const g = ctx.createGain();
  src.connect(lp).connect(g).connect(master);

  // swell in, roar, fade out — filter opens as it gets close
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34, t + seconds * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  lp.frequency.setValueAtTime(120, t);
  lp.frequency.linearRampToValueAtTime(700, t + seconds * 0.45);
  lp.frequency.linearRampToValueAtTime(110, t + seconds);

  src.start(t);
  src.stop(t + seconds + 0.2);
}
