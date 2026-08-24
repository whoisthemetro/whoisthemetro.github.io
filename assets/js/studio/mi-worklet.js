/* ============================================================
   THE STUDIO — mutable instruments, on the audio thread

   Two processors wrapping Émilie Gillet's DSP (MIT, see
   assets/wasm/LICENSE-mutable-instruments), compiled to wasm:

   - "mi-plaits": the 24-engine macro-oscillator as a 6-voice synth.
     No inputs; notes arrive over the port with an absolute context
     time, and fire inside process() when their moment comes — the
     same nothing-plays-"now" rule as the rest of the studio.
   - "mi-clouds": the granular processor, sitting across the whole
     master bus. Parameters arrive over the port; audio just flows.
   - "mi-rings": the resonator, as the bedroom telecaster's voice. Same
     note-with-a-timestamp rule as Plaits. Unlike Plaits it has no
     voices to allocate — it is ONE instrument with its own internal
     polyphony, so a note is a strum rather than a slot.

   The wasm module is compiled on the main thread and handed over in
   processorOptions; instantiation here is synchronous and cheap.
   ============================================================ */

function makeExports(module) {
  const stub = () => 0;
  const imports = {
    wasi_snapshot_preview1: new Proxy({}, { get: () => stub }),
    env: new Proxy({}, { get: () => stub }),
  };
  const inst = new WebAssembly.Instance(module, imports);
  if (inst.exports._initialize) inst.exports._initialize();
  return inst.exports;
}

class PlaitsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.e = makeExports(options.processorOptions.module);
    this.e.mi_init();
    // plaits renders at a fixed 48k; if the context runs elsewhere, playing
    // its samples back shifts every pitch by the same interval — so we bend
    // the note the other way and the two errors cancel exactly.
    this.noteComp = 12 * Math.log2(48000 / sampleRate);
    this.slot = 0;
    this.queue = [];      // notes waiting for their moment, sorted by time
    this.offs = [];       // scheduled gate-offs
    this.port.onmessage = (ev) => {
      const m = ev.data;
      if (m.t === "set") {
        this.e.pl_set(m.harmonics, m.timbre, m.morph, m.decay, m.lpg, m.engine | 0);
      } else if (m.t === "note") {
        this.queue.push(m);
        this.queue.sort((a, b) => a.at - b.at);
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    const horizon = currentTime + out.length / sampleRate;
    while (this.queue.length && this.queue[0].at <= horizon) {
      const n = this.queue.shift();
      const s = this.slot = (this.slot + 1) % 6;
      this.e.pl_note_on(s, n.midi + this.noteComp, n.level);
      this.offs.push({ at: n.at + n.dur, slot: s });
    }
    for (let i = this.offs.length - 1; i >= 0; i--) {
      if (this.offs[i].at <= currentTime) {
        this.e.pl_note_off(this.offs[i].slot);
        this.offs.splice(i, 1);
      }
    }
    const ptr = this.e.pl_render(out.length) >> 2;
    const mem = new Float32Array(this.e.memory.buffer);
    for (let i = 0; i < out.length; i++) out[i] = mem[ptr + i];
    return true;
  }
}

class CloudsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.e = makeExports(options.processorOptions.module);
    this.e.cl_init();
    this.inL = this.e.cl_ptr(0) >> 2;
    this.inR = this.e.cl_ptr(1) >> 2;
    this.outL = this.e.cl_ptr(2) >> 2;
    this.outR = this.e.cl_ptr(3) >> 2;
    this.port.onmessage = (ev) => {
      const m = ev.data;
      if (m.t === "set") {
        this.e.cl_set(m.pos, m.size, m.pitch, m.dens, m.tex,
                      m.wet, m.spread, m.fb, m.verb, m.freeze ? 1 : 0, m.mode | 0);
      }
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const L = inp && inp[0], R = (inp && inp[1]) || L;
    const n = out[0].length;
    const mem = new Float32Array(this.e.memory.buffer);
    if (L) {
      for (let i = 0; i < n; i++) { mem[this.inL + i] = L[i]; mem[this.inR + i] = R[i]; }
    } else {
      for (let i = 0; i < n; i++) { mem[this.inL + i] = 0; mem[this.inR + i] = 0; }
    }
    this.e.cl_process(n);
    const mem2 = new Float32Array(this.e.memory.buffer);
    const oL = out[0], oR = out[1] || out[0];
    for (let i = 0; i < n; i++) { oL[i] = mem2[this.outL + i]; oR[i] = mem2[this.outR + i]; }
    return true;
  }
}

/* Rings. One instrument, not a pool: `ri_note_on` re-pitches it and asks for
   a strum, and the module's own polyphony decides which of its strings takes
   the note. So there is nothing to allocate and nothing to free — but the
   TAIL matters, because a resonator that stops being rendered stops ringing.
   This processor always returns true and always renders, which is right: it
   is an instrument sitting in a room, not a note that ends. */
class RingsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.e = makeExports(options.processorOptions.module);
    this.e.ri_init();
    // rings renders at a fixed 48k, same as plaits — bend the note the other
    // way so playback at another rate lands on the pitch that was asked for
    this.noteComp = 12 * Math.log2(48000 / sampleRate);
    this.queue = [];
    this.port.onmessage = (ev) => {
      const m = ev.data;
      if (m.t === "set") {
        this.e.ri_set(m.structure, m.brightness, m.damping, m.position,
                      m.model | 0, m.polyphony | 0);
      } else if (m.t === "note") {
        this.queue.push(m);
        this.queue.sort((a, b) => a.at - b.at);
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    const horizon = currentTime + out.length / sampleRate;
    while (this.queue.length && this.queue[0].at <= horizon) {
      const n = this.queue.shift();
      this.e.ri_note_on(n.midi + this.noteComp, n.level);
    }
    const ptr = this.e.ri_render(out.length) >> 2;
    const mem = new Float32Array(this.e.memory.buffer);
    for (let i = 0; i < out.length; i++) out[i] = mem[ptr + i];
    return true;
  }
}

registerProcessor("mi-plaits", PlaitsProcessor);
registerProcessor("mi-rings", RingsProcessor);
registerProcessor("mi-clouds", CloudsProcessor);
