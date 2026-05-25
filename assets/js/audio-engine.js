/* ============================================================
   METRO — AUDIO ENGINE
   Web Audio synth + drum machine.
   Presets, FX chain (delay/reverb/distortion), MIDI-friendly trigger API.
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

    // distortion is patched between dry signal and master
    distNode = ctx.createWaveShaper();
    distNode.curve = makeDistCurve(0);    // off by default
    distNode.oversample = "2x";
    distMix = ctx.createGain();
    distMix.gain.value = 1.0;

    dryBus = ctx.createGain();
    dryBus.gain.value = 1;

    // dry → dist → distMix → master
    dryBus.connect(distNode).connect(distMix).connect(master);

    // reverb send
    reverbBus = ctx.createGain();
    reverbBus.gain.value = 0.25;
    const conv = ctx.createConvolver();
    conv.buffer = buildIR(2.2, 2.5);
    reverbBus.connect(conv).connect(master);

    // delay send (shared)
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
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return ir;
  }
  function makeDistCurve(amount) {
    const k = amount; // 0..1
    const n = 1024;
    const c = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = (3 + k * 50) * x * 20 * deg / (Math.PI + k * 50 * Math.abs(x));
    }
    return c;
  }

  // ---------- SYNTH ----------
  // A preset bundles waveform + envelope + filter + mod settings.
  const PRESETS = [
    { name: "LEAD",  wave: "sawtooth", cutoff: 2400, q: 6,  attack: 0.005, release: 0.30, detune: 8,  delay: true,  reverb: 0.18, dist: 0.10 },
    { name: "PAD",   wave: "sine",     cutoff: 1200, q: 2,  attack: 0.60,  release: 1.40, detune: 12, delay: false, reverb: 0.55, dist: 0.0  },
    { name: "PLUCK", wave: "triangle", cutoff: 3000, q: 4,  attack: 0.002, release: 0.18, detune: 4,  delay: true,  reverb: 0.22, dist: 0.0  },
    { name: "BASS",  wave: "square",   cutoff: 800,  q: 5,  attack: 0.005, release: 0.25, detune: 0,  delay: false, reverb: 0.05, dist: 0.0  },
    { name: "STAB",  wave: "square",   cutoff: 1600, q: 8,  attack: 0.005, release: 0.12, detune: 6,  delay: true,  reverb: 0.25, dist: 0.15 },
  ];

  const synthState = {
    presetIndex: 0,
    octave: 4,
    fx: { delay: true, reverb: true, distortion: false }, // user overrides
  };

  function currentPreset() { return PRESETS[synthState.presetIndex]; }

  function setPreset(i) {
    synthState.presetIndex = (i + PRESETS.length) % PRESETS.length;
    applyPresetFx();
  }
  function nextPreset() { setPreset(synthState.presetIndex + 1); }
  function prevPreset() { setPreset(synthState.presetIndex - 1); }

  function applyPresetFx() {
    // user toggles override preset defaults: preset just provides defaults,
    // but FX toggles let you turn on/off independently.
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

  function playSynthNote(note, dur = 0.5, velocity = 100) {
    ensureCtx(); buildBus(); applyPresetFx();
    const midi = typeof note === "number" ? note : noteToMidi(note);
    const freq = midiToFreq(midi);
    const now = ctx.currentTime;
    const p = currentPreset();
    const v = Math.max(0, Math.min(1, velocity / 127));

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
    env.gain.exponentialRampToValueAtTime(0.75 * v, now + p.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + p.attack + p.release);
    filt.connect(env);

    env.connect(dryBus);
    if (synthState.fx.reverb) env.connect(reverbBus);
    if (synthState.fx.delay) env.connect(delayNode);

    o1.start(now); o2.start(now);
    const stopAt = now + p.attack + p.release + 0.2;
    o1.stop(stopAt); o2.stop(stopAt);
  }

  // ---------- DRUMS ----------
  // GM drum map → our internal names (subset)
  const GM_DRUM_MAP = {
    35: "kick", 36: "kick",           // Acoustic Bass / Bass Drum 1
    38: "snare", 40: "snare",         // Snare 1 / 2
    42: "hihat",                       // Closed Hi-hat
    46: "openhat",                     // Open Hi-hat
    41: "tom3", 43: "tom3", 45: "tom1", 47: "tom1", 48: "tom2", 50: "tom2",
    39: "clap",                        // Hand Clap
    49: "openhat", 51: "openhat",     // Crash 1 / Ride 1 (mapped to crash sound)
    57: "openhat",
  };

  const DRUMS = {
    kick: (v) => {
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(160, now);
      o.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      g.gain.setValueAtTime(v, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      o.connect(g).connect(dryBus);
      o.start(now); o.stop(now + 0.6);
    },
    snare: (v) => {
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const og = ctx.createGain();
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

  // ---------- DISPATCH (visual hooks for local + remote + MIDI events) ----------
  // The studio scene subscribes here; multiplayer + MIDI dispatch through these.
  // origin: "local" | "remote" | "midi"
  const listeners = { drum: new Set(), note: new Set() };
  function onDrum(fn) { listeners.drum.add(fn); return () => listeners.drum.delete(fn); }
  function onNote(fn) { listeners.note.add(fn); return () => listeners.note.delete(fn); }
  function emit(kind, payload) {
    listeners[kind]?.forEach(fn => { try { fn(payload); } catch (e) {} });
  }

  // Public trigger fns route through dispatch so all UI animation paths fire.
  function triggerDrum(name, velocity = 100, origin = "local") {
    playDrum(name, velocity);
    emit("drum", { name, velocity, origin });
  }
  function triggerNote(midiOrName, dur = 0.5, velocity = 100, origin = "local") {
    playSynthNote(midiOrName, dur, velocity);
    const midi = typeof midiOrName === "number" ? midiOrName : noteToMidi(midiOrName);
    emit("note", { midi, velocity, dur, origin });
  }

  return {
    ensureCtx,
    // Synth state + control
    synth: {
      state: synthState,
      presets: PRESETS,
      currentPreset, setPreset, nextPreset, prevPreset,
      setWave: (w) => { currentPreset().wave = w; }, // tweak current preset
      setOctave: (o) => { synthState.octave = Math.max(0, Math.min(8, o)); },
      toggleFx,
      playNote: (n, d, v) => triggerNote(n, d, v, "local"),
    },
    // Drums
    drums: {
      play: (name, vel = 100) => triggerDrum(name, vel, "local"),
      names: ["kick", "snare", "hihat", "openhat", "tom1", "tom2", "tom3", "clap"],
    },
    // MIDI helpers
    midi: {
      drumMap: GM_DRUM_MAP,
      noteOn: (note, velocity = 100) => {
        // route based on GM channel-10 convention: if mapped to drum, play drum
        if (GM_DRUM_MAP[note]) triggerDrum(GM_DRUM_MAP[note], velocity, "midi");
        else triggerNote(note, 0.5, velocity, "midi");
      },
    },
    // Remote (multiplayer) playback — same path as local but tagged "remote" for UI
    remote: {
      drum: (name, vel = 100) => triggerDrum(name, vel, "remote"),
      note: (midi, dur = 0.5, vel = 100) => triggerNote(midi, dur, vel, "remote"),
    },
    // Subscribe to dispatch events (for UI flashes)
    onDrum, onNote,
    setMasterVolume: (v) => { ensureCtx(); buildBus(); master.gain.value = v; },
  };
})();
