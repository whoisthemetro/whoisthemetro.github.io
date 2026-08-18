/* ============================================================
   THE METRO — voice, walkie-talkie style

   The mic records short self-contained chunks (600 ms — each one
   restarts the recorder so every blob has its own header and
   decodes alone), ships them base64 over the presence channel,
   and the other side chains them gap-free on the audio clock.
   Half a second of latency, zero NAT problems, and it already
   sounds like an intercom — which is the brief.

   Two ways to talk: hold the button (push-to-talk) or tap it
   to leave the mic open. In the arena every incoming voice goes
   through the squawk box: tight bandpass, a hair of grit, and a
   long metal-room tail. Never loud — the master compressor and
   a 0.55 bus make sure of it.
   ============================================================ */

import { audioGraph } from "./ambience.js";

let micStream = null;
let selfAna = null, selfSrc = null, selfBuf = null, selfLvl = 0;   // your own mic level (for the mirror)
let recorder = null;
let sendFn = null;
let myUid = null;
let mode = "off";           // off | ptt | open
let arenaFx = false;
const players = new Map();  // uid -> output chain + playhead

// the DJ broadcast is its own pipeline: a loopback input (system audio / shared
// tab) recorded full-range by ONE continuous MediaRecorder. unlike the walkie
// chunks, these are NOT self-contained — they're a single Opus stream sliced for
// transport, so the encoder never re-primes (that per-chunk re-prime was the old
// glitch). the far side reassembles them with MSE and plays them as music.
let djStream = null;        // the audio we record + ship (device or shared tab)
let djShareStream = null;   // the raw getDisplayMedia stream, kept so we can fully stop it
let djRec = null;
let djLive = false;
let onDJEnded = null;       // fires if a shared tab/screen is stopped from the browser bar
let inClubFlag = false;     // set by main.js — dj audio is club-only
let djBus = null;           // one shared gain → master (cat. E taps it for reactive light)
// broadcaster: one continuous recorder, a generation tag, and the cached init
// segment (the first blob — header + first cluster) so late arrivals bootstrap.
let djGen = 0;
let djInitB64 = null;
let djInitTimer = null;
const DJ_TIMESLICE = 400;   // ms per chunk — pace, not a re-encode boundary
// listener: one Media Source Extensions pipeline per broadcaster. chunks from a
// single continuous encode are NOT self-contained, so we feed them to a
// SourceBuffer and play through a hidden <audio> routed into the web-audio graph.
const djPipes = new Map();  // uid -> { ms, audioEl, sb, srcNode, queue, gen, ... }
// one analyser watches whatever music reaches the club — the listener's
// djBus, or the broadcaster's own stream — so the lights can dance to it
let djAna = null, djAnaSrc = null, djAnaBuf = null;

function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

async function ensureMic() {
  if (micStream) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    // a terminal analyser on our own mic so the mirror can show our glow (never
    // connected to output → no echo)
    try {
      const { ctx } = audioGraph();
      if (ctx && !selfAna) {
        selfSrc = ctx.createMediaStreamSource(micStream);
        selfAna = ctx.createAnalyser(); selfAna.fftSize = 256;
        selfBuf = new Uint8Array(selfAna.fftSize);
        selfSrc.connect(selfAna);
      }
    } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

function blobToB64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(String(r.result).split(",")[1] || "");
    r.readAsDataURL(blob);
  });
}

/* ---- feedback control ---------------------------------------------------
   Peer voice is decoded into the WEB AUDIO graph (makePlayer -> master), not
   an <audio> element. The browser's `echoCancellation` can only subtract what
   it knows it is rendering, and on phones Web Audio output is generally NOT
   in that reference signal. So the constraint is switched on and blind: your
   voice leaves their speaker, their mic hears it, and it arrives back at you.

   Two guards, no ML needed:
     GATE      don't transmit a chunk that never rose above speech level, so
               room tone and a distant speaker never go out at all.
     DUCK      in open-mic mode, don't transmit while a peer's voice is
               actually coming out of your speaker. The loop needs both ends
               live at once; keeping one end quiet means it cannot start.
   PTT is exempt from DUCK on purpose: you are holding a button down, you
   mean it, and you can hear the result and let go.                        */
const GATE_ON = 0.055;      // mic RMS that counts as somebody speaking
const GATE_OFF = 0.030;     // ...and where it lets go (hysteresis, no chatter)
const DUCK_AT = 0.045;      // a peer this loud is audibly in the room with you
let chunkPeak = 0, gateOpen = false, duckedChunk = false, suppressed = 0;

function rmsOf(ana, buf) {
  ana.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / buf.length);
}
// is anyone else's voice leaving the speaker right this moment?
function remoteLoud() {
  let peak = 0;
  for (const pl of players.values()) {
    try { peak = Math.max(peak, rmsOf(pl.ana, pl.buf)); } catch (e) {}
  }
  return peak;
}

function recordLoop() {
  if (mode === "off" || !micStream) return;
  const mime = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(micStream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
  } catch (e) { mode = "off"; return; }
  recorder = rec;
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    // fail OPEN: if the analyser never got built we cannot measure anything,
    // and a gate that can't measure must not be the reason nobody can talk
    const canMeasure = !!selfAna;
    const speech = !canMeasure || chunkPeak > (gateOpen ? GATE_OFF : GATE_ON);
    gateOpen = speech;
    const feedback = mode === "open" && duckedChunk;   // see "feedback control"
    if (parts.length && mode !== "off" && speech && !feedback) {
      const blob = new Blob(parts, { type: rec.mimeType });
      if (blob.size > 200 && blob.size < 48000 && sendFn) {
        const data = await blobToB64(blob);
        try { sendFn({ uid: myUid, mime: rec.mimeType, data }); } catch (e) {}
      }
    } else if (feedback) { suppressed++; }
    recordLoop();          // straight into the next chunk
  };
  rec.start();
  // watch the mic and the room across this chunk, not just at its edges
  chunkPeak = 0; duckedChunk = false;
  const watch = setInterval(() => {
    try {
      if (selfAna) chunkPeak = Math.max(chunkPeak, rmsOf(selfAna, selfBuf));
      if (remoteLoud() > DUCK_AT) duckedChunk = true;
    } catch (e) {}
  }, 50);
  setTimeout(() => {
    clearInterval(watch);
    try { if (rec.state !== "inactive") rec.stop(); } catch (e) {}
  }, 600);
}

// go live: ONE recorder, started with a timeslice so it emits a chunk every
// DJ_TIMESLICE ms WITHOUT stopping. the first chunk carries the WebM init
// segment (header + tracks); the rest are bare media clusters. we cache the
// init and re-broadcast it on a timer so anyone who walks in mid-set can
// bootstrap their decoder.
function startDJBroadcast() {
  if (!djLive || !djStream) return;
  const mime = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(djStream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
  } catch (e) { djLive = false; return; }
  djRec = rec;
  djGen = Date.now();         // a fresh generation so listeners drop any old set
  djInitB64 = null;
  rec.ondataavailable = async (e) => {
    if (!djLive || !e.data || !e.data.size || !sendFn) return;
    if (e.data.size > 220000) return;            // safety: stay under the broadcast cap
    const data = await blobToB64(e.data);
    const isInit = djInitB64 === null;
    if (isInit) djInitB64 = data;
    try { sendFn({ uid: myUid, mime: rec.mimeType, dj: true, cont: true, gen: djGen, init: isInit, data }); } catch (e2) {}
  };
  try { rec.start(DJ_TIMESLICE); } catch (e) { djLive = false; djRec = null; return; }
  // re-send the init segment ~once a second so late joiners can start decoding
  djInitTimer = setInterval(() => {
    if (djLive && djInitB64 && sendFn) {
      try { sendFn({ uid: myUid, mime: rec.mimeType, dj: true, cont: true, gen: djGen, init: true, data: djInitB64 }); } catch (e) {}
    }
  }, 1200);
}

// ---- listener side: one MSE pipeline per broadcaster ----
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// append the next queued chunk when the SourceBuffer is free
function pumpPipe(pipe) {
  if (!pipe.ready || !pipe.sb || pipe.sb.updating || !pipe.queue.length) return;
  const data = pipe.queue.shift();
  try { pipe.sb.appendBuffer(data); }
  catch (e) {
    if (e && e.name === "QuotaExceededError") {
      // ran out of room — drop the oldest buffered second, retry this chunk next tick
      try {
        const b = pipe.audioEl.buffered;
        if (b.length) pipe.sb.remove(b.start(0), Math.max(b.start(0) + 0.1, pipe.audioEl.currentTime - 1));
      } catch (e2) {}
      pipe.queue.unshift(data);
    }
    // any other append error: the stream desynced — rebuild on the next init
    else resetPipe(pipe.uid);
  }
}

// keep playback pinned to the live edge and free buffered audio behind it
function chasePipe(pipe) {
  const el = pipe.audioEl;
  let b;
  try { b = el.buffered; } catch (e) { return; }
  if (!b.length) return;
  const end = b.end(b.length - 1);
  if (end - el.currentTime > 0.9 || el.currentTime < b.start(0)) {
    try { el.currentTime = Math.max(b.start(0), end - 0.25); } catch (e) {}
  }
  if (el.paused) el.play().catch(() => {});
  if (pipe.sb && !pipe.sb.updating) {
    const cut = el.currentTime - 1.5;
    if (cut > b.start(0) + 0.5) { try { pipe.sb.remove(b.start(0), cut); } catch (e) {} }
  }
}

function ensureDJPipe(ctx, master, uid, mime) {
  if (!window.MediaSource || !mime || !MediaSource.isTypeSupported(mime)) return null;
  const ms = new MediaSource();
  const audioEl = new Audio();
  audioEl.src = URL.createObjectURL(ms);
  audioEl.preload = "auto";
  const pipe = { uid, ms, audioEl, sb: null, mime, queue: [], ready: false, srcNode: null, gen: null };
  ms.addEventListener("sourceopen", () => {
    if (djPipes.get(uid) !== pipe) return;          // superseded while opening
    try {
      const sb = ms.addSourceBuffer(mime);
      sb.mode = "sequence";                          // ignore internal timecodes, lay clusters end-to-end
      sb.addEventListener("updateend", () => { pumpPipe(pipe); chasePipe(pipe); });
      sb.addEventListener("error", () => resetPipe(uid));
      pipe.sb = sb;
      pipe.ready = true;
      pumpPipe(pipe);
    } catch (e) { resetPipe(uid); }
  }, { once: true });
  // route the element into the web-audio graph: this pulls its output OFF the
  // speakers and onto the dj bus (→ master + reactive-light analyser)
  try {
    pipe.srcNode = ctx.createMediaElementSource(audioEl);
    pipe.srcNode.connect(ensureDJBus(ctx, master));
  } catch (e) {}
  audioEl.play().catch(() => {});
  djPipes.set(uid, pipe);
  return pipe;
}

function resetPipe(uid) {
  const pipe = djPipes.get(uid);
  if (!pipe) return;
  djPipes.delete(uid);
  try { pipe.audioEl.pause(); } catch (e) {}
  try { if (pipe.srcNode) pipe.srcNode.disconnect(); } catch (e) {}
  try { if (pipe.ms.readyState === "open") pipe.ms.endOfStream(); } catch (e) {}
  try { URL.revokeObjectURL(pipe.audioEl.src); } catch (e) {}
  try { pipe.audioEl.removeAttribute("src"); pipe.audioEl.load(); } catch (e) {}
}

function ensureDJBus(ctx, master) {
  if (djBus) return djBus;
  djBus = ctx.createGain();
  djBus.gain.value = 0.95;               // full and loud — it's the set, not a voice
  djBus.connect(master);
  djBus.connect(ensureAnalyser(ctx));    // a silent tap for the reactive lights
  return djBus;
}

// a terminal analyser (output unconnected) so reading it never colors the
// sound. fed by the dj bus (listener) or the loopback stream (broadcaster).
function ensureAnalyser(ctx) {
  if (djAna) return djAna;
  djAna = ctx.createAnalyser();
  djAna.fftSize = 256;
  djAna.smoothingTimeConstant = 0.55;    // smooth enough to breathe, not strobe
  djAnaBuf = new Uint8Array(djAna.frequencyBinCount);
  return djAna;
}

// tap our own outgoing stream into the analyser so the room reacts to the set
// we're playing — we never receive our own chunks back over the wire
function tapForLights() {
  try {
    const { ctx } = audioGraph();
    if (ctx && djStream) { djAnaSrc = ctx.createMediaStreamSource(djStream); djAnaSrc.connect(ensureAnalyser(ctx)); }
  } catch (e) {}
}

function gritCurve() {
  const c = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 127.5) - 1;
    c[i] = Math.tanh(x * 1.8);
  }
  return c;
}

function makePlayer(ctx, master) {
  const out = ctx.createGain();
  out.gain.value = 0.55;                 // present, never loud
  out.connect(master);
  const dryIn = ctx.createGain();
  dryIn.connect(out);
  // the squawk box: bandpass → soft clip → dry tap + arena tail
  const fxIn = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.9;
  const shaper = ctx.createWaveShaper();
  shaper.curve = gritCurve();
  fxIn.connect(bp).connect(shaper);
  const fxDry = ctx.createGain();
  fxDry.gain.value = 0.75;
  shaper.connect(fxDry).connect(out);
  const d1 = ctx.createDelay(1); d1.delayTime.value = 0.19;
  const d2 = ctx.createDelay(1); d2.delayTime.value = 0.31;
  const fb = ctx.createGain(); fb.gain.value = 0.42;
  const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 2200;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  shaper.connect(d1); d1.connect(d2); d2.connect(damp).connect(fb).connect(d1);
  d1.connect(wet); d2.connect(wet); wet.connect(out);
  // a silent analyser tap on this voice so each speaker's blob can glow + flap
  // its mouth to their own live level (an envelope follower, read per frame)
  const ana = ctx.createAnalyser();
  ana.fftSize = 256;
  out.connect(ana);
  /* a send into the bathroom's convolver, per SPEAKER. It has to be per
     speaker and not one flag on the bus: what matters is where the person
     talking is standing, not where you are. Someone shouting from the stalls
     should sound like it while the room outside stays dry. Built lazily —
     ambience only makes that reverb when something asks for it. */
  const bath = ctx.createGain();
  bath.gain.value = 0;
  out.connect(bath);
  return { out, dryIn, fxIn, bath, bathOn: false,
           playhead: 0, ana, buf: new Uint8Array(ana.fftSize), level: 0 };
}

export const voice = {
  init(uid, send) { myUid = uid; sendFn = send; },
  supported: () => !!(navigator.mediaDevices && window.MediaRecorder && pickMime()),
  mode: () => mode,
  isOn: () => mode !== "off",
  // how many chunks the anti-feedback duck has swallowed. main.js watches this
  // to tell you your speaker is looping back into your mic.
  suppressedCount: () => suppressed,
  setArenaFx(on) { arenaFx = !!on; },
  /* main.js knows where everyone is standing; it tells us, per uid, per frame.
     `send` is the node ambience hands back for its tiled-room convolver — we
     take it as an argument so voice.js never has to import the audio room. */
  setSpeakerBath(uid, wet, send) {
    const pl = players.get(uid);
    if (!pl || !send) return;
    if (!pl.bathOn) { try { pl.bath.connect(send); pl.bathOn = true; } catch (e) { return; } }
    const g = pl.bath.gain;
    if (Math.abs(g.value - wet) > 0.01) g.setTargetAtTime(wet, ctx ? ctx.currentTime : 0, 0.12);
  },
  setInClub(on) {
    inClubFlag = !!on;
    if (!inClubFlag) {
      // left the club — tear down every music pipeline so a re-entry rebuilds
      // from a fresh init segment at the live edge, not a stale backlog
      for (const uid of [...djPipes.keys()]) resetPipe(uid);
    }
  },
  djLive: () => djLive,
  // smoke-test only: per-broadcaster pipeline health (buffered seconds, playhead)
  _pipes: () => [...djPipes.values()].map(p => {
    let buffered = -1;
    try { const b = p.audioEl.buffered; buffered = b.length ? (b.end(b.length - 1) - b.start(0)) : 0; } catch (e) {}
    return { gen: p.gen, ready: p.ready, queued: p.queue.length, buffered, t: p.audioEl.currentTime, paused: p.audioEl.paused };
  }),
  // YOUR own mic level (0..1), envelope-followed — for the mirror, since you
  // never hear yourself. only "hot" while actually talking (mode !== off), so
  // the glow tracks what others would actually hear.
  selfLevel() {
    if (mode === "off" || !selfAna) { selfLvl += (0 - selfLvl) * 0.12; return selfLvl; }
    selfAna.getByteTimeDomainData(selfBuf);
    let sum = 0;
    for (let i = 0; i < selfBuf.length; i++) { const v = (selfBuf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / selfBuf.length);
    const target = Math.min(1, rms * 3.4);
    const k = target > selfLvl ? 0.5 : 0.12;
    selfLvl += (target - selfLvl) * k;
    return selfLvl;
  },
  // live voice level (0..1) for one speaker, smoothed as an envelope follower —
  // ghosts.js reads this each frame to glow + open the mouth of their blob.
  // 0 when they're not talking (no chunks playing → signal decays to silence).
  level(uid) {
    const pl = players.get(uid);
    if (!pl || !pl.ana) return 0;
    pl.ana.getByteTimeDomainData(pl.buf);
    let sum = 0;
    for (let i = 0; i < pl.buf.length; i++) { const v = (pl.buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / pl.buf.length);
    const target = Math.min(1, rms * 3.4);          // speech sits low — scale it up
    const k = target > pl.level ? 0.5 : 0.12;        // snappy attack, gentle release
    pl.level += (target - pl.level) * k;
    return pl.level;
  },
  // main.js wants to know if a shared tab/screen was killed from the browser bar
  setOnDJEnded(fn) { onDJEnded = fn; },
  canShare: () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),

  // the audio inputs a dj can pick from — labels only show once we hold a
  // grant, so take a throwaway one first if they're hidden, then release it.
  async listInputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    let devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    let ins = devs.filter(d => d.kind === "audioinput");
    if (ins.some(d => !d.label)) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(t => t.stop());
        devs = await navigator.mediaDevices.enumerateDevices();
        ins = devs.filter(d => d.kind === "audioinput");
      } catch (e) {}
    }
    return ins.map(d => ({ deviceId: d.deviceId, label: d.label || "audio input" }));
  },

  // go live off a chosen input — every processor OFF so the music is clean
  async startDJ(deviceId) {
    if (!this.supported()) return false;
    try {
      djStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          channelCount: 2,
        },
      });
    } catch (e) { return false; }
    djLive = true;
    tapForLights();
    startDJBroadcast();
    return true;
  },

  // the easy path: share a Chrome tab (with "share tab audio") or the whole
  // screen with system audio — no loopback driver to install. we keep only
  // the sound; the captured picture is thrown away immediately.
  async startDJShare() {
    if (!this.canShare()) return false;
    let disp;
    try {
      disp = await navigator.mediaDevices.getDisplayMedia({
        video: true,   // chrome won't show the picker for audio alone
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) { return false; }     // they hit cancel
    const aud = disp.getAudioTracks();
    if (!aud.length) { disp.getTracks().forEach(t => t.stop()); return "no-audio"; }
    disp.getVideoTracks().forEach(t => t.stop());     // we only ever wanted the sound
    djShareStream = disp;
    djStream = new MediaStream(aud);
    // if they click the browser's "Stop sharing" pill, end the set cleanly
    aud[0].addEventListener("ended", () => { this.stopDJ(); if (onDJEnded) try { onDJEnded(); } catch (e) {} });
    djLive = true;
    tapForLights();
    startDJBroadcast();
    return true;
  },
  stopDJ() {
    djLive = false;
    if (djInitTimer) { clearInterval(djInitTimer); djInitTimer = null; }
    djInitB64 = null;
    try { if (djRec && djRec.state !== "inactive") djRec.stop(); } catch (e) {}
    djRec = null;
    try { if (djAnaSrc) djAnaSrc.disconnect(); } catch (e) {}
    djAnaSrc = null;
    if (djStream) { djStream.getTracks().forEach(t => t.stop()); djStream = null; }
    if (djShareStream) { djShareStream.getTracks().forEach(t => t.stop()); djShareStream = null; }
  },

  // 0..1 energy from the bass/low-mids of whatever's on the decks. lifted,
  // because recorded music sits low in the byte spectrum.
  djLevel() {
    if (!djAna) return 0;
    djAna.getByteFrequencyData(djAnaBuf);
    let sum = 0; const n = Math.min(djAnaBuf.length, 40);
    for (let i = 0; i < n; i++) sum += djAnaBuf[i];
    return Math.min(1, (sum / n / 255) * 1.8);
  },

  async startTalk(open = false) {
    if (!this.supported()) return false;
    if (!(await ensureMic())) return false;
    const was = mode;
    mode = open ? "open" : "ptt";
    if (was === "off") recordLoop();
    return true;
  },
  leaveOpen() { if (mode !== "off") mode = "open"; },
  stopTalk() {
    mode = "off";
    try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch (e) {}
    recorder = null;
  },

  // an incoming chunk from someone else, chained onto their playhead
  async handleChunk(p) {
    if (!p || !p.data || p.uid === myUid) return;
    if (p.dj && !inClubFlag) return;       // the set only plays inside the club
    if (!p.dj && inClubFlag) return;       // and the venue is sealed: no walkie-talkie crosses the door, only the set + chat
    const { ctx, master } = audioGraph();
    if (!ctx) return;
    if (p.dj) {
      // music: a continuous Opus stream sliced for transport. feed each slice to
      // this broadcaster's MSE pipeline; the chase logic keeps us at the live edge.
      if (!p.cont) return;                 // legacy self-contained chunks no longer supported
      let pipe = djPipes.get(p.uid);
      if (pipe && pipe.gen !== p.gen) { resetPipe(p.uid); pipe = null; }   // DJ restarted → rebuild
      if (!pipe) {
        if (!p.init) return;               // wait for an init segment to bootstrap the decoder
        pipe = ensureDJPipe(ctx, master, p.uid, p.mime);
        if (!pipe) return;                 // MSE can't decode this here (e.g. Safari + webm)
        pipe.gen = p.gen;
      } else if (p.init) {
        return;                            // already bootstrapped — ignore the re-broadcast init
      }
      let bytes;
      try { bytes = b64ToBytes(p.data); } catch (e) { return; }
      pipe.queue.push(bytes);
      if (pipe.queue.length > 40) pipe.queue.splice(0, pipe.queue.length - 40);  // cap a runaway backlog
      pumpPipe(pipe);
      return;
    }
    let audio;
    try {
      const buf = await fetch(`data:${p.mime || "audio/webm"};base64,${p.data}`).then(r => r.arrayBuffer());
      audio = await ctx.decodeAudioData(buf);
    } catch (e) { return; }
    let pl = players.get(p.uid);
    if (!pl) { pl = makePlayer(ctx, master); players.set(p.uid, pl); }
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.connect(arenaFx ? pl.fxIn : pl.dryIn);
    const t = Math.max(ctx.currentTime + 0.08, pl.playhead);
    src.start(t);
    pl.playhead = t + audio.duration - 0.015;   // tiny overlap hides the seams
  },
};
