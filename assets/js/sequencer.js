/* ============================================================
   METRO — 16-STEP DRUM SEQUENCER
   8 drum rows × 16 steps. Click cells to toggle. Hits go through
   METRO_AUDIO.drums.play() so they sync to the mixer, claim system,
   and multiplayer.
   ============================================================ */

window.METRO_SEQ = (function () {
  const STEPS = 16;
  const DRUMS = ["kick", "snare", "hihat", "openhat", "tom1", "tom2", "tom3", "clap"];

  const pattern = {};
  DRUMS.forEach(n => { pattern[n] = new Array(STEPS).fill(false); });

  let bpm = 120;
  let step = -1;        // -1 = not playing yet
  let playing = false;
  let timer = null;
  let nextStepTime = 0; // performance.now() target for next step
  const listeners = new Set();

  function stepDurationMs() { return 60000 / bpm / 4; } // 16th notes

  // Drift-resistant scheduler: schedules the next step against a moving
  // target time, recovering from any jitter in the previous setTimeout.
  function tick() {
    const A = window.METRO_AUDIO;
    if (!A) return;
    const MP = window.METRO_MP;
    const drumsLocked = MP && MP.isConnected() && !MP.claimAvailable("drums");

    if (!drumsLocked) {
      for (const n of DRUMS) {
        if (pattern[n][step]) A.drums.play(n);
      }
    }
    notify({ step });

    if (!playing) return;
    step = (step + 1) % STEPS;
    nextStepTime += stepDurationMs();
    const wait = Math.max(0, nextStepTime - performance.now());
    timer = setTimeout(tick, wait);
  }

  function play() {
    if (playing) return;
    playing = true;
    step = 0;
    nextStepTime = performance.now();
    tick();
    notify({ playing: true });
  }
  function stop() {
    playing = false;
    if (timer) { clearTimeout(timer); timer = null; }
    step = -1;
    notify({ playing: false, step: -1 });
  }
  function toggleStep(drum, idx) {
    if (!pattern[drum] || idx < 0 || idx >= STEPS) return;
    pattern[drum][idx] = !pattern[drum][idx];
    notify({ pattern: copy() });
  }
  function clearPattern() {
    DRUMS.forEach(n => pattern[n].fill(false));
    notify({ pattern: copy() });
  }
  function randomize(density = 0.22) {
    // Slightly different per-drum probabilities for a more musical default.
    const prob = { kick: 0.32, snare: 0.18, hihat: 0.55, openhat: 0.08,
                   tom1: 0.10, tom2: 0.10, tom3: 0.06, clap: 0.10 };
    DRUMS.forEach(n => {
      const p = prob[n] != null ? prob[n] : density;
      for (let i = 0; i < STEPS; i++) pattern[n][i] = Math.random() < p;
    });
    notify({ pattern: copy() });
  }
  function setBpm(b) {
    bpm = Math.max(40, Math.min(220, Math.round(b)));
    notify({ bpm });
  }
  function copy() { return JSON.parse(JSON.stringify(pattern)); }
  function notify(payload) {
    listeners.forEach(fn => { try { fn(payload); } catch (e) {} });
  }

  return {
    STEPS, DRUMS,
    play, stop, toggleStep, clearPattern, randomize, setBpm,
    isPlaying: () => playing,
    getStep:   () => step,
    getBpm:    () => bpm,
    getPattern: copy,
    onChange:  (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
