const fs = require("fs");
(async () => {
  const bytes = fs.readFileSync(process.argv[2] || "mi.wasm");
  const stub = () => 0;
  const inst = await WebAssembly.instantiate(bytes, {
    wasi_snapshot_preview1: new Proxy({}, { get: () => stub }),
    env: new Proxy({}, { get: () => stub }),
  });
  const e = inst.instance.exports;
  if (e._initialize) e._initialize();
  e.mi_init(); e.cl_init();
  const F32 = () => new Float32Array(e.memory.buffer);

  // --- plaits: a note through several engines must make noise ---
  const rms = (engine) => {
    e.pl_set(0.5, 0.5, 0.5, 0.7, 0.5, engine);
    e.pl_note_on(0, 48, 1.0);
    let sum = 0, n = 0;
    for (let b = 0; b < 40; b++) {
      const ptr = e.pl_render(128) >> 2;
      const m = F32();
      for (let i = 0; i < 128; i++) { sum += m[ptr + i] * m[ptr + i]; n++; }
    }
    e.pl_note_off(0);
    for (let b = 0; b < 40; b++) e.pl_render(128);   // let the tail die
    return Math.sqrt(sum / n);
  };
  const engines = { va_vcf: 0, six_op: 2, chiptune: 7, virtual_analog: 8, fm: 10, wavetable: 13, speech: 15, swarm: 16, modal: 20, bass_drum: 21 };
  for (const [name, idx] of Object.entries(engines)) {
    const r = rms(idx);
    console.log(`plaits ${name.padEnd(15)} rms=${r.toFixed(4)} ${r > 0.005 ? "OK" : "SILENT"}`);
    if (r <= 0.005) process.exit(1);
  }

  // --- clouds: dry passes through, wet mangles ---
  const inL = e.cl_ptr(0) >> 2, inR = e.cl_ptr(1) >> 2, outL = e.cl_ptr(2) >> 2;
  const feed = (blocks, wet) => {
    e.cl_set(0.2, 0.5, 0, 0.6, 0.5, wet, 0.5, 0, 0.3, 0, 0);
    let sum = 0, n = 0, t = 0;
    for (let b = 0; b < blocks; b++) {
      const m = F32();
      for (let i = 0; i < 128; i++) { const s = Math.sin(t++ * 0.05) * 0.5; m[inL + i] = s; m[inR + i] = s; }
      e.cl_process(128);
      const m2 = F32();
      for (let i = 0; i < 128; i++) { sum += m2[outL + i] * m2[outL + i]; n++; }
    }
    return Math.sqrt(sum / n);
  };
  const dry = feed(60, 0.0);
  const wet = feed(60, 1.0);
  console.log(`clouds dry rms=${dry.toFixed(4)} wet rms=${wet.toFixed(4)}`);
  if (dry < 0.1) { console.error("FAIL: dry signal lost"); process.exit(1); }
  if (wet < 0.01) { console.error("FAIL: granular path silent"); process.exit(1); }
  console.log("PASS — plaits speaks in 10 engines, clouds passes dry and grains wet");
})().catch((e) => { console.error(e); process.exit(1); });
