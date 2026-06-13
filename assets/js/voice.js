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
let recorder = null;
let sendFn = null;
let myUid = null;
let mode = "off";           // off | ptt | open
let arenaFx = false;
const players = new Map();  // uid -> output chain + playhead

// the DJ broadcast runs on the same chunk pipeline, but its own stream:
// a loopback input (system audio) recorded full-range and loud, tagged
// dj:true so the far side skips the squawk box and plays it as music.
let djStream = null;        // the audio we record + ship (device or shared tab)
let djShareStream = null;   // the raw getDisplayMedia stream, kept so we can fully stop it
let djRec = null;
let djLive = false;
let onDJEnded = null;       // fires if a shared tab/screen is stopped from the browser bar
let inClubFlag = false;     // set by main.js — dj audio is club-only
let djBus = null;           // one shared gain → master (cat. E taps it for reactive light)
const djHeads = new Map();  // uid -> playhead time, per broadcaster
const djSources = new Map(); // uid -> [BufferSource,...] still queued, so a resync can kill the backlog
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
    if (parts.length && mode !== "off") {
      const blob = new Blob(parts, { type: rec.mimeType });
      if (blob.size > 200 && blob.size < 48000 && sendFn) {
        const data = await blobToB64(blob);
        try { sendFn({ uid: myUid, mime: rec.mimeType, data }); } catch (e) {}
      }
    }
    recordLoop();          // straight into the next chunk
  };
  rec.start();
  setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch (e) {} }, 600);
}

// the DJ chunk loop: same self-contained-blob trick, but full bitrate so
// the music survives the round trip. bigger size cap to match.
function djRecordLoop() {
  if (!djLive || !djStream) return;
  const mime = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(djStream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
  } catch (e) { djLive = false; return; }
  djRec = rec;
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
  rec.onstop = async () => {
    if (parts.length && djLive) {
      const blob = new Blob(parts, { type: rec.mimeType });
      if (blob.size > 200 && blob.size < 200000 && sendFn) {
        const data = await blobToB64(blob);
        try { sendFn({ uid: myUid, mime: rec.mimeType, data, dj: true }); } catch (e) {}
      }
    }
    djRecordLoop();          // straight into the next chunk
  };
  rec.start();
  setTimeout(() => { try { if (rec.state !== "inactive") rec.stop(); } catch (e) {} }, 600);
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
  return { out, dryIn, fxIn, playhead: 0 };
}

export const voice = {
  init(uid, send) { myUid = uid; sendFn = send; },
  supported: () => !!(navigator.mediaDevices && window.MediaRecorder && pickMime()),
  mode: () => mode,
  isOn: () => mode !== "off",
  setArenaFx(on) { arenaFx = !!on; },
  setInClub(on) {
    inClubFlag = !!on;
    if (!inClubFlag) {
      // left the club — stop any queued music and forget every playhead, so a
      // re-entry rejoins at the live edge instead of resuming a stale backlog
      for (const arr of djSources.values()) for (const s of arr) { try { s.stop(); } catch (e) {} }
      djSources.clear();
      djHeads.clear();
    }
  },
  djLive: () => djLive,
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
    djRecordLoop();
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
    djRecordLoop();
    return true;
  },
  stopDJ() {
    djLive = false;
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
    let audio;
    try {
      const buf = await fetch(`data:${p.mime || "audio/webm"};base64,${p.data}`).then(r => r.arrayBuffer());
      audio = await ctx.decodeAudioData(buf);
    } catch (e) { return; }
    if (p.dj) {
      // music: full-range bus. keep the listener pinned to the live edge.
      // the old code only ever pushed the playhead forward — if the broadcaster
      // ran a hair fast or a chunk hiccupped, the head outran currentTime and a
      // backlog snowballed (minutes-late audio, song changes landing way late).
      // so: if the head has drifted past now+MAX_LAG, or fallen behind now,
      // dump whatever's still queued for this dj and jump back to live.
      const bus = ensureDJBus(ctx, master);
      const now = ctx.currentTime;
      const PRE = 0.12, MAX_LAG = 0.6;
      let head = djHeads.get(p.uid) || 0;
      if (head < now || head > now + MAX_LAG) {
        const stale = djSources.get(p.uid);
        if (stale) for (const s of stale) { try { s.stop(); } catch (e) {} }
        djSources.set(p.uid, []);
        head = now + PRE;
      }
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(bus);
      src.start(head);
      const list = djSources.get(p.uid) || [];
      list.push(src);
      djSources.set(p.uid, list);
      // forget a source once it finishes so the list can't grow without bound
      src.onended = () => {
        const arr = djSources.get(p.uid);
        if (arr) { const i = arr.indexOf(src); if (i >= 0) arr.splice(i, 1); }
      };
      djHeads.set(p.uid, head + audio.duration - 0.015);
      return;
    }
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
