/* ============================================================
   METRO — AUDIO ENGINE v2

   Real-studio architecture:
   - Mixer with 3 input channels (DRUMS, SYNTH, MUSIC) each with
     3-band EQ, volume, mute, solo, aux 1 (delay), aux 2 (reverb)
   - Master fader
   - FX units: delay, reverb, drum-bus parallel compressor
   - Synth: ADSR + 4-pole ladder LPF (resonant), 5 presets
   - Drums: 3 swappable kits (DEFAULT, 808, ACOUSTIC), each 8 voices
   - Music: HTMLAudioElement routes through mixer
   - Low-latency mode (latencyHint: interactive)
   ============================================================ */

window.METRO_AUDIO = (function () {
  let ctx;
  function ensureCtx() {
    if (!ctx) {
      // Request the smallest possible buffer. Numeric latencyHint asks the
      // browser to TARGET this many seconds (5ms). It will fall back to the
      // smallest the OS+driver actually supports — typically ~5–15ms on
      // wired audio in Chrome, much higher on Bluetooth.
      const Ctor = window.AudioContext || window.webkitAudioContext;
      try {
        ctx = new Ctor({ latencyHint: 0.005 });
      } catch (e) {
        ctx = new Ctor({ latencyHint: "interactive" });
      }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  // ============================================================
  // BUSES, FX, AND CHANNELS
  // ============================================================
  let master, mainBus;
  let delayUnit, reverbUnit, compUnit;
  let distortion; // synth-side wave shaper (pre-channel)
  const channels = {}; // name → channel object

  function buildBus() {
    if (master) return;
    ensureCtx();

    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    mainBus = ctx.createGain();
    mainBus.gain.value = 1.0;
    mainBus.connect(master);

    // Synth-side distortion (waveshaper)
    distortion = ctx.createWaveShaper();
    distortion.curve = makeDistCurve(0);
    distortion.oversample = "2x";

    // FX units
    delayUnit  = createDelayUnit();
    reverbUnit = createReverbUnit();
    compUnit   = createCompUnit();

    delayUnit.output.connect(mainBus);
    reverbUnit.output.connect(mainBus);
    compUnit.output.connect(mainBus);

    // Mixer channels
    channels.drums = createChannel("drums");
    channels.synth = createChannel("synth");
    channels.music = createChannel("music");

    // Drum bus also sends a parallel copy to the compressor for "smack"
    channels.drums.gainNode.connect(compUnit.input);

    // Route the HTMLAudioElement playback through the MUSIC channel.
    if (window.METRO_PLAYER && window.METRO_PLAYER.audio && !channels.music._routedFromPlayer) {
      try {
        const src = ctx.createMediaElementSource(window.METRO_PLAYER.audio);
        src.connect(channels.music.input);
        channels.music._routedFromPlayer = true;
      } catch (e) {
        // already routed elsewhere; fall through
      }
    }
  }

  function createChannel(name) {
    const input = ctx.createGain();
    const eqL = ctx.createBiquadFilter(); eqL.type = "lowshelf";  eqL.frequency.value = 250;  eqL.gain.value = 0;
    const eqM = ctx.createBiquadFilter(); eqM.type = "peaking";   eqM.frequency.value = 1200; eqM.Q.value = 1.0; eqM.gain.value = 0;
    const eqH = ctx.createBiquadFilter(); eqH.type = "highshelf"; eqH.frequency.value = 5000; eqH.gain.value = 0;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.8;
    const aux1 = ctx.createGain(); aux1.gain.value = 0;
    const aux2 = ctx.createGain(); aux2.gain.value = 0;

    input.connect(eqL).connect(eqM).connect(eqH).connect(gainNode);
    gainNode.connect(mainBus);                 // dry to main
    gainNode.connect(aux1).connect(delayUnit.input);
    gainNode.connect(aux2).connect(reverbUnit.input);

    return {
      name, input, eqL, eqM, eqH, gainNode, aux1, aux2,
      _volume: 0.8, _muted: false, _solo: false,
    };
  }

  function anySoloed() { return Object.values(channels).some(c => c._solo); }
  function recomputeGains() {
    const solo = anySoloed();
    Object.values(channels).forEach(c => {
      let v = c._volume;
      if (c._muted) v = 0;
      else if (solo && !c._solo) v = 0;
      c.gainNode.gain.setTargetAtTime(v, ctx.currentTime, 0.005);
    });
  }

  function chanSet(name, key, value) {
    const c = channels[name];
    if (!c) return;
    if (key === "volume")  { c._volume = clamp(value, 0, 1.5); recomputeGains(); }
    else if (key === "mute")   { c._muted = !!value; recomputeGains(); }
    else if (key === "solo")   { c._solo  = !!value; recomputeGains(); }
    else if (key === "eqLow")  c.eqL.gain.value  = clamp(value, -15, 15);
    else if (key === "eqMid")  c.eqM.gain.value  = clamp(value, -15, 15);
    else if (key === "eqHigh") c.eqH.gain.value  = clamp(value, -15, 15);
    else if (key === "aux1")   c.aux1.gain.value = clamp(value, 0, 1);
    else if (key === "aux2")   c.aux2.gain.value = clamp(value, 0, 1);
  }
  function chanGet(name, key) {
    const c = channels[name];
    if (!c) return 0;
    if (key === "volume")  return c._volume;
    if (key === "mute")    return c._muted;
    if (key === "solo")    return c._solo;
    if (key === "eqLow")   return c.eqL.gain.value;
    if (key === "eqMid")   return c.eqM.gain.value;
    if (key === "eqHigh")  return c.eqH.gain.value;
    if (key === "aux1")    return c.aux1.gain.value;
    if (key === "aux2")    return c.aux2.gain.value;
    return 0;
  }

  // ---------- DELAY UNIT ----------
  function createDelayUnit() {
    const input = ctx.createGain();
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.31;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 1.0;   // 100% wet (mix happens via channel AUX sends)
    const output = ctx.createGain();

    input.connect(delay).connect(fb).connect(delay);
    delay.connect(wet).connect(output);

    return {
      input, output,
      _time: 0.31, _fb: 0.32, _wet: 1.0,
      setTime(s) { this._time = clamp(s, 0.01, 1.5); delay.delayTime.setTargetAtTime(this._time, ctx.currentTime, 0.01); },
      setFeedback(v) { this._fb = clamp(v, 0, 0.9); fb.gain.setTargetAtTime(this._fb, ctx.currentTime, 0.01); },
      setWet(v) { this._wet = clamp(v, 0, 1); wet.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.01); },
      params() { return { time: this._time, feedback: this._fb, wet: this._wet }; },
    };
  }

  // ---------- REVERB UNIT ----------
  function createReverbUnit() {
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = buildIR(2.5, 2.0);
    const wet = ctx.createGain(); wet.gain.value = 1.0;   // 100% wet
    const output = ctx.createGain();

    input.connect(conv).connect(wet).connect(output);

    return {
      input, output,
      _decay: 2.5, _wet: 1.0,
      setDecay(s) { this._decay = clamp(s, 0.4, 6.0); conv.buffer = buildIR(this._decay, 2.0); },
      setWet(v) { this._wet = clamp(v, 0, 1); wet.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.01); },
      params() { return { decay: this._decay, wet: this._wet }; },
    };
  }
  function buildIR(duration, decay) {
    const len = Math.max(1, ctx.sampleRate * duration);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return ir;
  }

  // ---------- DRUM-BUS PARALLEL COMPRESSOR ----------
  function createCompUnit() {
    const input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.knee.value = 6;
    const wet = ctx.createGain(); wet.gain.value = 0.0; // parallel: 0 = no smack, 1 = all smack
    const output = ctx.createGain();

    input.connect(comp).connect(wet).connect(output);

    return {
      input, output,
      _threshold: -28, _ratio: 8, _wet: 0.0,
      setThreshold(db) { this._threshold = clamp(db, -60, 0); comp.threshold.setTargetAtTime(this._threshold, ctx.currentTime, 0.01); },
      setRatio(r) { this._ratio = clamp(r, 1, 20); comp.ratio.setTargetAtTime(this._ratio, ctx.currentTime, 0.01); },
      setWet(v) { this._wet = clamp(v, 0, 1); wet.gain.setTargetAtTime(this._wet, ctx.currentTime, 0.005); },
      params() { return { threshold: this._threshold, ratio: this._ratio, wet: this._wet }; },
    };
  }

  // ---------- DISTORTION CURVE ----------
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

  // ============================================================
  // LADDER FILTER (4-pole cascade)
  // ============================================================
  function createLadderFilter() {
    const stages = [];
    for (let i = 0; i < 4; i++) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1000;
      f.Q.value = 0.5;
      stages.push(f);
    }
    for (let i = 0; i < 3; i++) stages[i].connect(stages[i + 1]);
    return {
      input: stages[0],
      output: stages[3],
      setCutoff(hz) {
        const now = ctx.currentTime;
        const target = clamp(hz, 60, 18000);
        stages.forEach(s => s.frequency.setTargetAtTime(target, now, 0.005));
      },
      setResonance(amt) {
        // amt: 0..1 → Q from 0.5 to ~14 on the first stage (others stay tame)
        stages[0].Q.value = 0.5 + clamp(amt, 0, 1) * 13.5;
      },
    };
  }

  // ============================================================
  // SYNTH PRESETS
  // ============================================================
  // Now include resonance (ladder) and shorter attacks for lower perceived latency.
  const PRESETS = [
    { name: "LEAD",  wave: "sawtooth", cutoff: 2400, res: 0.45, attack: 0.0008, decay: 0.10, sustain: 0.78, release: 0.30, detune: 8,  reverbSend: 0.18, delaySend: 0.30 },
    { name: "PAD",   wave: "sine",     cutoff: 1200, res: 0.15, attack: 0.50,   decay: 0.40, sustain: 0.90, release: 1.40, detune: 12, reverbSend: 0.55, delaySend: 0.10 },
    { name: "PLUCK", wave: "triangle", cutoff: 3000, res: 0.30, attack: 0.0005, decay: 0.18, sustain: 0.00, release: 0.18, detune: 4,  reverbSend: 0.22, delaySend: 0.30 },
    { name: "BASS",  wave: "square",   cutoff: 700,  res: 0.60, attack: 0.0008, decay: 0.05, sustain: 0.85, release: 0.20, detune: 0,  reverbSend: 0.05, delaySend: 0.00 },
    { name: "STAB",  wave: "square",   cutoff: 1600, res: 0.55, attack: 0.0005, decay: 0.10, sustain: 0.00, release: 0.15, detune: 6,  reverbSend: 0.30, delaySend: 0.35 },
  ];

  // Live synth state — preset values get LOADED into here, then knobs
  // tweak these directly. noteOn reads from synthState (NOT the preset
  // template) so changes are live.
  const synthState = {
    presetIndex: 0,
    octave: 4,
    distortion: false,
    pitchBend: 0,       // -1..+1 (semitones-ish: ±2 semitones)
    // Sound-shaping params (overridable via knobs)
    wave: "sawtooth",
    cutoff: 2400,
    resonance: 0.45,
    attack: 0.005,
    decay: 0.10,
    sustain: 0.75,
    release: 0.30,
    detune: 8,
    reverbSend: 0.18,
    delaySend: 0.30,
  };

  function currentPreset() { return PRESETS[synthState.presetIndex]; }
  function loadPresetInto(idx) {
    const p = PRESETS[idx];
    synthState.wave       = p.wave;
    synthState.cutoff     = p.cutoff;
    synthState.resonance  = p.res;
    synthState.attack     = p.attack;
    synthState.decay      = p.decay;
    synthState.sustain    = p.sustain;
    synthState.release    = p.release;
    synthState.detune     = p.detune;
    synthState.reverbSend = p.reverbSend;
    synthState.delaySend  = p.delaySend;
  }
  // Initialize live state from preset 0
  loadPresetInto(0);

  function setPreset(i) {
    synthState.presetIndex = (i + PRESETS.length) % PRESETS.length;
    loadPresetInto(synthState.presetIndex);
    applyPresetSends();
  }
  function nextPreset() { setPreset(synthState.presetIndex + 1); }
  function prevPreset() { setPreset(synthState.presetIndex - 1); }

  // When changing preset, update default aux-send levels for the synth channel.
  // The user can still ride them on the mixer to taste.
  function applyPresetSends() {
    if (!channels.synth) return;
    channels.synth.aux1.gain.setTargetAtTime(synthState.delaySend,  ctx.currentTime, 0.05);
    channels.synth.aux2.gain.setTargetAtTime(synthState.reverbSend, ctx.currentTime, 0.05);
  }
  function toggleDistortion() {
    synthState.distortion = !synthState.distortion;
    distortion.curve = makeDistCurve(synthState.distortion ? 0.25 : 0);
    return synthState.distortion;
  }

  function noteToMidi(n) {
    const map = { C:0, "C#":1, D:2, "D#":3, E:4, F:5, "F#":6, G:7, "G#":8, A:9, "A#":10, B:11 };
    const m = /^([A-G]#?)(-?\d+)$/.exec(n);
    if (!m) return 60;
    return map[m[1]] + (parseInt(m[2]) + 1) * 12;
  }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---------- VOICES ----------
  const voices = new Map(); // midi → { o1, o2, ladder, env, peak, sustainLevel, safety }

  function noteOn(midi, velocity = 100) {
    ensureCtx(); buildBus();
    if (voices.has(midi)) noteOff(midi);
    const s = synthState;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);
    const v = clamp(velocity / 127, 0, 1);
    const peak = 0.75 * v;
    const sustainLevel = Math.max(peak * s.sustain, 0.00001);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = s.wave; o2.type = s.wave;
    o1.frequency.value = freq;
    o2.frequency.value = freq;
    // pitch bend ±200 cents (2 semitones at full deflection)
    const bendCents = s.pitchBend * 200;
    o1.detune.value = bendCents;
    o2.detune.value = s.detune + bendCents;

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    o1.connect(mix); o2.connect(mix);

    const ladder = createLadderFilter();
    ladder.setCutoff(s.cutoff);
    ladder.setResonance(s.resonance);
    mix.connect(ladder.input);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), now + s.attack);
    env.gain.exponentialRampToValueAtTime(sustainLevel, now + s.attack + s.decay);
    ladder.output.connect(env);

    env.connect(distortion).connect(channels.synth.input);

    o1.start(now); o2.start(now);

    const safety = setTimeout(() => {
      if (voices.has(midi) && voices.get(midi).o1 === o1) noteOff(midi);
    }, 60_000);

    voices.set(midi, { o1, o2, ladder, env, peak, sustainLevel, safety });
  }

  function noteOff(midi) {
    const v = voices.get(midi);
    if (!v) return;
    voices.delete(midi);
    clearTimeout(v.safety);
    const now = ctx.currentTime;
    const currentVal = Math.max(v.env.gain.value, 0.00001);
    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(currentVal, now);
    v.env.gain.exponentialRampToValueAtTime(0.00001, now + synthState.release);
    const stopAt = now + synthState.release + 0.1;
    try { v.o1.stop(stopAt); v.o2.stop(stopAt); } catch (e) {}
  }

  // Live pitch-bend / cutoff modulation for currently held voices
  function setLivePitchBend(bend) {
    synthState.pitchBend = clamp(bend, -1, 1);
    const now = ctx ? ctx.currentTime : 0;
    const cents = synthState.pitchBend * 200;
    voices.forEach(v => {
      try {
        v.o1.detune.setTargetAtTime(cents, now, 0.01);
        v.o2.detune.setTargetAtTime(synthState.detune + cents, now, 0.01);
      } catch (e) {}
    });
  }
  function setLiveCutoff(hz) {
    synthState.cutoff = clamp(hz, 60, 18000);
    const now = ctx ? ctx.currentTime : 0;
    voices.forEach(v => {
      try { v.ladder.setCutoff(synthState.cutoff); } catch (e) {}
    });
  }
  function setLiveResonance(res) {
    synthState.resonance = clamp(res, 0, 1);
    voices.forEach(v => {
      try { v.ladder.setResonance(synthState.resonance); } catch (e) {}
    });
  }

  function playSynthNote(noteOrMidi, dur = 0.5, velocity = 100) {
    const midi = typeof noteOrMidi === "number" ? noteOrMidi : noteToMidi(noteOrMidi);
    noteOn(midi, velocity);
    setTimeout(() => noteOff(midi), Math.max(50, dur * 1000));
    return midi;
  }

  // ============================================================
  // DRUM KITS
  // ============================================================
  // GM drum map → our internal names (subset)
  const GM_DRUM_MAP = {
    35: "kick", 36: "kick",
    38: "snare", 40: "snare",
    42: "hihat",
    46: "openhat",
    41: "tom3", 43: "tom3", 45: "tom1", 47: "tom1", 48: "tom2", 50: "tom2",
    39: "clap",
    49: "openhat", 51: "openhat", 57: "openhat",
  };

  function drumOut() { return channels.drums.input; }

  // ---------- PER-DRUM PARAMETERS (Simmons SDS-style) ----------
  const DRUM_NAMES = ["kick", "snare", "hihat", "openhat", "tom1", "tom2", "tom3", "clap"];
  const drumParams = {};
  DRUM_NAMES.forEach(n => { drumParams[n] = { gain: 1.0, tune: 0, decay: 1.0 }; });

  // unpack into multipliers; resilient to undefined.
  function pp(p) {
    return {
      g: (p && p.gain  != null) ? p.gain  : 1,
      t: Math.pow(2, ((p && p.tune  != null) ? p.tune  : 0) / 12),
      d: (p && p.decay != null) ? Math.max(0.3, p.decay) : 1,
    };
  }

  // ---------- KIT 1: DEFAULT ----------
  const KIT_DEFAULT = {
    kick: (v, p) => {
      const k = pp(p), now = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(160 * k.t, now);
      o.frequency.exponentialRampToValueAtTime(45 * k.t, now + 0.12 * k.d);
      g.gain.setValueAtTime(v * k.g, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 * k.d);
      o.connect(g).connect(drumOut());
      o.start(now); o.stop(now + 0.6 * k.d);
    },
    snare: (v, p) => {
      const k = pp(p), now = ctx.currentTime;
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "triangle"; o.frequency.value = 200 * k.t;
      og.gain.setValueAtTime(0.6 * v * k.g, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.15 * k.d);
      o.connect(og).connect(drumOut());
      o.start(now); o.stop(now + 0.2 * k.d);
      noiseBurst(0.5 * v * k.g, 0.18 * k.d, 1500 * k.t, "highpass");
    },
    hihat:   (v, p) => { const k = pp(p); noiseBurst(0.4  * v * k.g, 0.06 * k.d, 6500 * k.t, "highpass"); },
    openhat: (v, p) => { const k = pp(p); noiseBurst(0.32 * v * k.g, 0.32 * k.d, 5500 * k.t, "highpass"); },
    tom1:    (v, p) => drumTom(180, v, p),
    tom2:    (v, p) => drumTom(120, v, p),
    tom3:    (v, p) => drumTom(85,  v, p),
    clap:    (v, p) => clapSound(v, p),
  };

  // ---------- KIT 2: 808 ----------
  const KIT_808 = {
    kick: (v, p) => {
      const k = pp(p), now = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(110 * k.t, now);
      o.frequency.exponentialRampToValueAtTime(30 * k.t, now + 0.25 * k.d);
      g.gain.setValueAtTime(v * 1.05 * k.g, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.85 * k.d);
      o.connect(g).connect(drumOut());
      o.start(now); o.stop(now + 0.9 * k.d);
    },
    snare: (v, p) => {
      const k = pp(p), now = ctx.currentTime;
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "triangle"; o.frequency.value = 240 * k.t;
      og.gain.setValueAtTime(0.5 * v * k.g, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.10 * k.d);
      o.connect(og).connect(drumOut());
      o.start(now); o.stop(now + 0.15 * k.d);
      noiseBurst(0.6 * v * k.g, 0.12 * k.d, 2200 * k.t, "highpass");
    },
    hihat:   (v, p) => { const k = pp(p); noiseBurst(0.5  * v * k.g, 0.04 * k.d, 8500 * k.t, "highpass"); },
    openhat: (v, p) => { const k = pp(p); noiseBurst(0.40 * v * k.g, 0.40 * k.d, 7000 * k.t, "highpass"); },
    tom1:    (v, p) => sub808Tom(160, v, p),
    tom2:    (v, p) => sub808Tom(110, v, p),
    tom3:    (v, p) => sub808Tom(70,  v, p),
    clap:    (v, p) => clapSound(v, p, true),
  };

  // ---------- KIT 3: ACOUSTIC ----------
  const KIT_ACOUSTIC = {
    kick: (v, p) => {
      const k = pp(p), now = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120 * k.t, now);
      o.frequency.exponentialRampToValueAtTime(55 * k.t, now + 0.18 * k.d);
      g.gain.setValueAtTime(v * 0.9 * k.g, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.7 * k.d);
      o.connect(g).connect(drumOut());
      const click = ctx.createOscillator(), cg = ctx.createGain();
      click.type = "square"; click.frequency.value = 1200 * k.t;
      cg.gain.setValueAtTime(0.18 * v * k.g, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
      click.connect(cg).connect(drumOut());
      o.start(now); o.stop(now + 0.75 * k.d);
      click.start(now); click.stop(now + 0.02);
    },
    snare: (v, p) => {
      const k = pp(p), now = ctx.currentTime;
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = "triangle"; o.frequency.value = 175 * k.t;
      og.gain.setValueAtTime(0.55 * v * k.g, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.22 * k.d);
      o.connect(og).connect(drumOut());
      o.start(now); o.stop(now + 0.28 * k.d);
      noiseBurst(0.55 * v * k.g, 0.30 * k.d, 1200 * k.t, "bandpass");
    },
    hihat:   (v, p) => { const k = pp(p); noiseBurst(0.35 * v * k.g, 0.08 * k.d, 5500 * k.t, "highpass"); },
    openhat: (v, p) => { const k = pp(p); noiseBurst(0.30 * v * k.g, 0.45 * k.d, 4500 * k.t, "highpass"); },
    tom1:    (v, p) => acousticTom(220, v, p),
    tom2:    (v, p) => acousticTom(150, v, p),
    tom3:    (v, p) => acousticTom(95,  v, p),
    clap:    (v, p) => clapSound(v, p),
  };

  // ---------- Drum helpers ----------
  function noiseBurst(amp, dur, freq, type = "highpass") {
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq;
    if (type === "bandpass") filt.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    ns.connect(filt).connect(g).connect(drumOut());
    ns.start(now); ns.stop(now + dur + 0.01);
  }
  function drumTom(freq, v, p) {
    const k = pp(p), now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(freq * k.t, now);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4 * k.t, now + 0.4 * k.d);
    g.gain.setValueAtTime(0.7 * v * k.g, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 * k.d);
    o.connect(g).connect(drumOut());
    o.start(now); o.stop(now + 0.55 * k.d);
  }
  function sub808Tom(freq, v, p) {
    const k = pp(p), now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * k.t, now);
    o.frequency.exponentialRampToValueAtTime(freq * 0.35 * k.t, now + 0.55 * k.d);
    g.gain.setValueAtTime(0.75 * v * k.g, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.7 * k.d);
    o.connect(g).connect(drumOut());
    o.start(now); o.stop(now + 0.75 * k.d);
  }
  function acousticTom(freq, v, p) {
    const k = pp(p), now = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq * k.t, now);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55 * k.t, now + 0.6 * k.d);
    g.gain.setValueAtTime(0.6 * v * k.g, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.7 * k.d);
    o.connect(g).connect(drumOut());
    o.start(now); o.stop(now + 0.75 * k.d);
  }
  function clapSound(v, p, snappy = false) {
    const k = pp(p), now = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const offsets = snappy ? [0, 0.008, 0.020, 0.030] : [0, 0.012, 0.024, 0.040];
    offsets.forEach(off => {
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = 1500 * k.t; bp.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5 * v * k.g, now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + 0.08 * k.d);
      ns.connect(bp).connect(g).connect(drumOut());
      ns.start(now + off); ns.stop(now + off + 0.1 * k.d);
    });
  }

  // ---------- DRUM KIT SWITCHING ----------
  const DRUM_KITS = [
    { name: "DEFAULT",  kit: KIT_DEFAULT  },
    { name: "808",      kit: KIT_808      },
    { name: "ACOUSTIC", kit: KIT_ACOUSTIC },
  ];
  const drumState = { kitIndex: 0 };
  function currentKit() { return DRUM_KITS[drumState.kitIndex].kit; }
  function currentKitName() { return DRUM_KITS[drumState.kitIndex].name; }
  function setKit(i) { drumState.kitIndex = (i + DRUM_KITS.length) % DRUM_KITS.length; }
  function nextKit() { setKit(drumState.kitIndex + 1); }
  function prevKit() { setKit(drumState.kitIndex - 1); }

  function playDrum(name, velocity = 100) {
    ensureCtx(); buildBus();
    const v = clamp(velocity / 127, 0, 1);
    const p = drumParams[name];
    const fn = currentKit()[name];
    if (fn) fn(v, p);
  }

  // ============================================================
  // DISPATCH (visual hooks)
  // ============================================================
  const listeners = { drum: new Set(), note: new Set(), noteOff: new Set() };
  function onDrum(fn)    { listeners.drum.add(fn);    return () => listeners.drum.delete(fn); }
  function onNote(fn)    { listeners.note.add(fn);    return () => listeners.note.delete(fn); }
  function onNoteOff(fn) { listeners.noteOff.add(fn); return () => listeners.noteOff.delete(fn); }
  function emit(kind, payload) { listeners[kind]?.forEach(fn => { try { fn(payload); } catch (e) {} }); }

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

  // ============================================================
  // PUBLIC API
  // ============================================================
  return {
    ensureCtx,
    // Eagerly bring up the bus + mixer + media-element routing so muting the
    // MUSIC channel actually silences playback (the HTMLAudioElement is
    // captured by createMediaElementSource here).
    init: () => { ensureCtx(); buildBus(); },
    // SYNTH
    synth: {
      state: synthState,
      presets: PRESETS,
      currentPreset, setPreset, nextPreset, prevPreset,
      setWave: (w) => { synthState.wave = w; },
      setOctave: (o) => { synthState.octave = clamp(o, 0, 8); },
      toggleDistortion,
      // Live param control (Prophet-style knobs adjust these in real time)
      getParam: (key) => synthState[key],
      setParam: (key, value) => {
        if (key === "cutoff")     return setLiveCutoff(value);
        if (key === "resonance")  return setLiveResonance(value);
        if (key === "pitchBend")  return setLivePitchBend(value);
        if (key in synthState)    synthState[key] = value;
        if (key === "delaySend" || key === "reverbSend") applyPresetSends();
      },
      noteOn:  (midi, vel = 100) => triggerNoteOn(midi, vel, "local"),
      noteOff: (midi)            => triggerNoteOff(midi, "local"),
      playNote: (n, d, v)        => triggerNoteShot(n, d, v, "local"),
    },
    // DRUMS
    drums: {
      play: (name, vel = 100) => triggerDrum(name, vel, "local"),
      names: DRUM_NAMES,
      state: drumState,
      kits: DRUM_KITS.map(k => k.name),
      currentKitName, setKit, nextKit, prevKit,
      // SDS-style per-drum brain controls
      getParam: (name, key) => (drumParams[name] && drumParams[name][key] != null) ? drumParams[name][key] : (key === "gain" || key === "decay" ? 1 : 0),
      setParam: (name, key, value) => {
        if (!drumParams[name]) return;
        drumParams[name][key] = value;
      },
      params:   () => JSON.parse(JSON.stringify(drumParams)),
    },
    // MIXER
    mixer: {
      channels: ["drums", "synth", "music"],
      set: (name, key, value) => { ensureCtx(); buildBus(); chanSet(name, key, value); },
      get: chanGet,
      masterVolume: (v) => { ensureCtx(); buildBus(); master.gain.setTargetAtTime(clamp(v, 0, 1.5), ctx.currentTime, 0.01); return v; },
      getMaster: () => master ? master.gain.value : 0.85,
      anySoloed,
    },
    // FX (units)
    fx: {
      delay: {
        set: (k, v) => { ensureCtx(); buildBus(); if (k === "time") delayUnit.setTime(v); else if (k === "feedback") delayUnit.setFeedback(v); else if (k === "wet") delayUnit.setWet(v); },
        params: () => delayUnit ? delayUnit.params() : { time: 0.31, feedback: 0.32, wet: 0.6 },
      },
      reverb: {
        set: (k, v) => { ensureCtx(); buildBus(); if (k === "decay") reverbUnit.setDecay(v); else if (k === "wet") reverbUnit.setWet(v); },
        params: () => reverbUnit ? reverbUnit.params() : { decay: 2.5, wet: 0.55 },
      },
      comp: {
        set: (k, v) => { ensureCtx(); buildBus(); if (k === "threshold") compUnit.setThreshold(v); else if (k === "ratio") compUnit.setRatio(v); else if (k === "wet") compUnit.setWet(v); },
        params: () => compUnit ? compUnit.params() : { threshold: -28, ratio: 8, wet: 0 },
      },
    },
    // MIDI (route helper for midi.js)
    midi: {
      drumMap: GM_DRUM_MAP,
    },
    // MULTIPLAYER (partner events come through here)
    remote: {
      drum:    (name, vel = 100) => triggerDrum(name, vel, "remote"),
      noteOn:  (midi, vel = 100) => triggerNoteOn(midi, vel, "remote"),
      noteOff: (midi)            => triggerNoteOff(midi, "remote"),
      note:    (midi, dur, vel)  => triggerNoteShot(midi, dur, vel, "remote"),
    },
    // SUBSCRIBE (visual flashes)
    onDrum, onNote, onNoteOff,
    // Output latency in ms (Web Audio buffer + hardware). 0 if context not ready.
    outputLatencyMs: () => {
      if (!ctx) return 0;
      const out  = ctx.outputLatency || 0;
      const base = ctx.baseLatency || 0;
      return Math.round((out + base) * 1000);
    },
  };
})();
