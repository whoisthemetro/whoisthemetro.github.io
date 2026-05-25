/* ============================================================
   METRO — AUDIO ENGINE
   Web Audio synth (proper ADSR + held sustain) + drum machine.
   ============================================================ */

window.METRO_AUDIO = (function () {
  let ctx;
  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // ---------- BUS ----------
  let master, reverbBus, dryBus, distNode, distMix, delayWet, delayNode, delayFb;
  function buildBus() {
    if (master) return;
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    distNode = ctx.createWaveShaper();
    distNode.curve = makeDistCurve(0);
    distNode.oversample = "2x";
    distMix = ctx.createGain();
    distMix.gain.value = 1.0;

    dryBus = ctx.createGain();
    dryBus.gain.value = 1;

    dryBus.connect(distNode).connect(distMix).connect(master);

    reverbBus = ctx.createGain();
    reverbBus.gain.value = 0.25;
    const conv = ctx.createConvolver();
    conv.buffer = buildIR(2.2, 2.5);
    reverbBus.connect(conv).connect(master);

    delayWet = ctx.createGain();
    delayWet.gain.value = 0.22;
    delayNode = ctx.createDelay();
    delayNode.delayTime.value = 0.31;
    delayFb = ctx.createGain();
    delayFb.gain.value = 0.32;
    delayNode.connect(delayFb).connect(delayNode);
    delayNode.connect(master);
  }
  function buildIR(duration, decay) {
    const len = ctx.sampleRate * duration;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return ir;
  }
  function makeDistCurve(amount) {
    const k = amount;
    const n = 1024;
    const c = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = (3 + k * 50) * x * 20 * deg / (Math.PI + k * 50 * Math.abs(x));
    }
    return c;
  }

  // ---------- SYNTH PRESETS (with full ADSR) ----------
  // sustain is the held level as fraction of peak (0..1).
  // PLUCK and STAB intentionally have sustain=0 so they decay regardless of hold.
  const PRESETS = [
    { name: "LEAD",  wave: "sawtooth", cutoff: 2400, q: 6, attack: 0.005, decay: 0.10, sustain: 0.75, release: 0.30, detune: 8,  delay: true,  reverb: 0.18, dist: 0.10 },
    { name: "PAD",   wave: "sine",     cutoff: 1200, q: 2, attack: 0.60,  decay: 0.40, sustain: 0.90, release: 1.40, detune: 12, delay: false, reverb: 0.55, dist: 0.0  },
    { name: "PLUCK", wave: "triangle", cutoff: 3000, q: 4, attack: 0.002, decay: 0.18, sustain: 0.00, release: 0.18, detune: 4,  delay: true,  reverb: 0.22, dist: 0.0  },
    { name: "BASS",  wave: "square",   cutoff: 800,  q: 5, attack: 0.005, decay: 0.05, sustain: 0.85, release: 0.25, detune: 0,  delay: false, reverb: 0.05, dist: 0.0  },
    { name: "STAB",  wave: "square",   cutoff: 1600, q: 8, attack: 0.005, decay: 0.10, sustain: 0.00, release: 0.15, detune: 6,  delay: true,  reverb: 0.25, dist: 0.15 },
  ];

  const synthState = {
    presetIndex: 0,
    octave: 4,
    fx: { delay: true, reverb: true, distortion: false },
  };

  function currentPreset() { return PRESETS[synthState.presetIndex]; }
  function setPreset(i) { synthState.presetIndex = (i + PRESETS.length) % PRESETS.length; applyPresetFx(); }
  function nextPreset() { setPreset(synthState.presetIndex + 1); }
  function prevPreset() { setPreset(synthState.presetIndex - 1); }
  function applyPresetFx() {
    const p = currentPreset();
    if (!master) return;
    reverbBus.gain.value = synthState.fx.reverb ? p.reverb : 0;
    delayWet.gain.value = synthState.fx.delay ? 0.22 : 0;
    distNode.curve = synthState.fx.distortion ? makeDistCurve(p.dist > 0 ? p.dist : 0.25) : makeDistCurve(0);
  }
  function toggleFx(name) {
    if (!(name in synthState.fx)) return false;
    synthState.fx[name] = !synthState.fx[name];
    applyPresetFx();
    return synthState.fx[name];
  }

  function noteToMidi(n) {
    const map = { C:0, "C#":1, D:2, "D#":3, E:4, F:5, "F#":6, G:7, "G#":8, A:9, "A#":10, B:11 };
    const m = /^([A-G]#?)(-?\d+)$/.exec(n);
    if (!m) return 60;
    return map[m[1]] + (parseInt(m[2]) + 1) * 12;
  }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---------- VOICE ALLOCATION (sustain support) ----------
  // Each held note has a voice. noteOn creates one; noteOff releases it.
  const voices = new Map(); // midi → { o1, o2, env, peak, sustainLevel }

  function noteOn(midi, velocity = 100) {
    ensureCtx(); buildBus(); applyPresetFx();
    // retrigger: release any existing voice on this midi note
    if (voices.has(midi)) noteOff(midi);

    const p = currentPreset();
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);
    const v = Math.max(0, Math.min(1, velocity / 127));
    const peak = 0.75 * v;
    const sustainLevel = Math.max(peak * p.sustain, 0.00001);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = p.wave; o2.type = p.wave;
    o1.frequency.value = freq;
    o2.frequency.value = freq;
    o2.detune.value = p.detune;

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    o1.connect(mix); o2.connect(mix);

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = p.cutoff;
    filt.Q.value = p.q;
    mix.connect(filt);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    // Attack: 0 → peak
    env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), now + p.attack);
    // Decay: peak → sustain. (If sustain is 0, this becomes a natural pluck.)
    env.gain.exponentialRampToValueAtTime(sustainLevel, now + p.attack + p.decay);

    filt.connect(env);
    env.connect(dryBus);
    if (synthState.fx.reverb) env.connect(reverbBus);
    if (synthState.fx.delay)  env.connect(delayNode);

    o1.start(now); o2.start(now);

    // Safety: if note is held forever, schedule a hard stop way in the future
    // (will be replaced/canceled when noteOff is called)
    const safety = setTimeout(() => {
      if (voices.has(midi) && voices.get(midi).o1 === o1) noteOff(midi);
    }, 60_000);

    voices.set(midi, { o1, o2, env, peak, sustainLevel, safety });
  }

  function noteOff(midi) {
    const v = voices.get(midi);
    if (!v) return;
    voices.delete(midi);
    clearTimeout(v.safety);

    const p = currentPreset();
    const now = ctx.currentTime;
    // Read the current envelope value to start release smoothly without click
    const currentVal = Math.max(v.env.gain.value, 0.00001);
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(currentVal, now);
    v.env.gain.exponentialRampToValueAtTime(0.00001, now + p.release);

    const stopAt = now + p.release + 0.1;
    try { v.o1.stop(stopAt); v.o2.stop(stopAt); } catch (e) {}
  }

  // Convenience: fire-and-forget single shot (for clicks without hold semantics)
  function playSynthNote(noteOrMidi, dur = 0.5, velocity = 100) {
    const midi = typeof noteOrMidi === "number" ? noteOrMidi : noteToMidi(noteOrMidi);
    noteOn(midi, velocity);
    setTimeout(() => noteOff(midi), Math.max(50, dur * 1000));
    return midi;
  }

  // ---------- DRUMS (one-shot) ----------
  const GM_DRUM_MAP = {
    35: "kick", 36: "kick",
    38: "snare", 40: "snare",
    42: "hihat",
    46: "openhat",
    41: "tom3", 43: "tom3", 45: "tom1", 47: "tom1", 48: "tom2", 50: "tom2",
    39: "clap",
    49: "openhat", 51: "openhat", 57: "openhat",
  };

  const DRUMS = {
    kick: (v) => {
      const now = ctx.currentTime;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(160, now);
      o.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      g.gain.setValueAtTime(v, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      o.connect(g).connect(dryBus);
      o.start(now); o.stop(now + 0.6);
    },
    snare: (v) => {
      const now = ctx.currentTime;
      const o = ctx.createOscillator(); const og = ctx.createGain();
      o.type = "triangle"; o.frequency.value = 200;
      og.gain.setValueAtTime(0.6 * v, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.connect(og).connect(dryBus);
      o.start(now); o.stop(now + 0.2);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1500;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5 * v, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      ns.connect(hp).connect(ng).connect(dryBus);
      ng.connect(reverbBus);
      ns.start(now); ns.stop(now + 0.2);
    },
    hihat: (v) => {
      const now = ctx.currentTime;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4 * v, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      ns.connect(hp).connect(g).connect(dryBus);
      ns.start(now); ns.stop(now + 0.08);
    },
    openhat: (v) => {
      const now = ctx.currentTime;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3 * v, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      ns.connect(hp).connect(g).connect(dryBus);
      g.connect(reverbBus);
      ns.start(now); ns.stop(now + 0.32);
    },
    tom1: (v) => drumTom(180, v),
    tom2: (v) => drumTom(120, v),
    tom3: (v) => drumTom(85,  v),
    clap: (v) => {
      const now = ctx.currentTime;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      [0, 0.012, 0.024, 0.04].forEach(off => {
        const ns = ctx.createBufferSource(); ns.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5 * v, now + off);
        g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.08);
        ns.connect(bp).connect(g).connect(dryBus);
        g.connect(reverbBus);
        ns.start(now + off); ns.stop(now + off + 0.1);
      });
    },
  };
  function drumTom(freq, v) {
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(freq, now);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.4);
    g.gain.setValueAtTime(0.7 * v, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(g).connect(dryBus);
    g.connect(reverbBus);
    o.start(now); o.stop(now + 0.55);
  }

  function playDrum(name, velocity = 100) {
    ensureCtx(); buildBus(); applyPresetFx();
    const v = Math.max(0, Math.min(1, velocity / 127));
    const fn = DRUMS[name];
    if (fn) fn(v);
  }

  // ---------- DISPATCH ----------
  // listeners["note"] fires on noteOn; "noteOff" on release; "drum" on any drum hit
  const listeners = { drum: new Set(), note: new Set(), noteOff: new Set() };
  function onDrum(fn)    { listeners.drum.add(fn);    return () => listeners.drum.delete(fn); }
  function onNote(fn)    { listeners.note.add(fn);    return () => listeners.note.delete(fn); }
  function onNoteOff(fn) { listeners.noteOff.add(fn); return () => listeners.noteOff.delete(fn); }
  function emit(kind, payload) {
    listeners[kind]?.forEach(fn => { try { fn(payload); } catch (e) {} });
  }

  function triggerDrum(name, velocity = 100, origin = "local") {
    playDrum(name, velocity);
    emit("drum", { name, velocity, origin });
  }
  function triggerNoteOn(midi, velocity = 100, origin = "local") {
    noteOn(midi, velocity);
    emit("note", { midi, velocity, origin });
  }
  function triggerNoteOff(midi, origin = "local") {
    noteOff(midi);
    emit("noteOff", { midi, origin });
  }
  function triggerNoteShot(midiOrName, dur = 0.5, velocity = 100, origin = "local") {
    const midi = typeof midiOrName === "number" ? midiOrName : noteToMidi(midiOrName);
    triggerNoteOn(midi, velocity, origin);
    setTimeout(() => triggerNoteOff(midi, origin), Math.max(50, dur * 1000));
  }

  return {
    ensureCtx,
    synth: {
      state: synthState,
      presets: PRESETS,
      currentPreset, setPreset, nextPreset, prevPreset,
      setWave: (w) => { currentPreset().wave = w; },
      setOctave: (o) => { synthState.octave = Math.max(0, Math.min(8, o)); },
      toggleFx,
      // sustained note (use beginHold / endHold or noteOn / noteOff pair)
      noteOn:  (midi, vel = 100) => triggerNoteOn(midi, vel, "local"),
      noteOff: (midi)            => triggerNoteOff(midi, "local"),
      // one-shot — fixed duration regardless of hold (for taps)
      playNote: (n, d, v)        => triggerNoteShot(n, d, v, "local"),
    },
    drums: {
      play: (name, vel = 100) => triggerDrum(name, vel, "local"),
      names: ["kick", "snare", "hihat", "openhat", "tom1", "tom2", "tom3", "clap"],
    },
    midi: {
      drumMap: GM_DRUM_MAP,
      // (kept for backwards reference but routing happens in midi.js now)
    },
    remote: {
      drum:    (name, vel = 100)       => triggerDrum(name, vel, "remote"),
      noteOn:  (midi, vel = 100)       => triggerNoteOn(midi, vel, "remote"),
      noteOff: (midi)                  => triggerNoteOff(midi, "remote"),
      note:    (midi, dur, vel)        => triggerNoteShot(midi, dur, vel, "remote"),
    },
    onDrum, onNote, onNoteOff,
    setMasterVolume: (v) => { ensureCtx(); buildBus(); master.gain.value = v; },
  };
})();
