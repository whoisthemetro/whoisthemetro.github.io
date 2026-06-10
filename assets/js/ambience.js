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
