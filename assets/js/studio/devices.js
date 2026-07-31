/* ============================================================
   THE STUDIO — the machines, and the clock that drives them

   The whole sync design lives in this file, and it comes down to one
   decision: **we never send notes over the network.**

   Sending notes cannot work. A hi-hat that has to cross the Atlantic
   before it can be heard is 80ms late, and 80ms late is audibly, badly
   late. Instead every browser holds the same *pattern* and the same
   *clock*, and each one plays that pattern locally. The network only
   carries edits — "row 3 step 7 is on now" — which can take as long as
   they like to arrive, because they're describing a machine, not a
   sound. Two people on opposite coasts hear the same bar at the same
   instant, and the only thing latency costs is how quickly you see
   someone else's edit appear.

   Absolute step numbering is what makes that work. Step 0 was at the
   transport epoch and steps have marched on ever since, so "step
   1,048,576" means the same moment in every browser in the room.
   Nobody is following anybody. There is no host to lose.
   ============================================================ */

import { clock } from "./clock.js";
import * as A from "./audio.js";

export const STEPS = 16;                 // one bar of 16ths
export const CLIP_SLOTS = 8;

const LOOKAHEAD_MS = 220;                // how far ahead we schedule audio
const TICK_MS = 25;                      // how often we wake up to do it

/* ---------- the shared state ---------- */

// every device carries a version and an author. that pair is the entire
// conflict resolution story: higher version wins, and if two people bump to
// the same version in the same instant, the higher uid wins so that every
// browser breaks the tie the same way and nobody ends up out of step.
function grid(rows, steps = STEPS) {
  return Array.from({ length: rows }, () => new Array(steps).fill(0));
}

export const state = {
  xport: { epoch: 0, bpm: 112, playing: true, swing: 0.12, v: 0, by: "" },
  dev: {
    drums: { v: 0, by: "", grid: grid(A.DRUM_ROWS.length), mute: false },
    arp:   { v: 0, by: "", grid: grid(8), root: 45, scale: "minor", wave: "sawtooth",
             cutoff: 1800, gate: 0.6, mute: false },
    clips: { v: 0, by: "", active: -1, queued: -1, atStep: -1,
             slots: Array.from({ length: CLIP_SLOTS }, () => null), mute: false },
    mixer: { v: 0, by: "",
             ch: { drums: { gain: 0.9, mute: false }, arp: { gain: 0.7, mute: false }, clips: { gain: 0.75, mute: false } },
             cutoff: 20000, delaySend: 0.15, reverb: 0.5, feedback: 0.34, master: 0.85 },
  },
};

let myUid = "";
let onChange = () => {};      // the UI redraws off this
let push = () => {};          // net.js hands us the sender

export function bindDevices({ uid, onLocalEdit, onStateChange }) {
  myUid = uid;
  push = onLocalEdit || (() => {});
  onChange = onStateChange || (() => {});
}

/* ---------- clips ---------- */

// eight starter loops, so the room is already playing when you walk in and
// nobody has to stare at an empty grid wondering what this thing does.
// each is 16 steps of scale degree, or null for a rest.
const _ = null;
const STARTER_CLIPS = [
  { name: "ROOT",   notes: [0,_,_,_, 0,_,_,_, 0,_,_,_, 0,_,_,_] },
  { name: "WALK",   notes: [0,_,2,_, 4,_,2,_, 3,_,1,_, 0,_,_,_] },
  { name: "PUSH",   notes: [0,0,_,0, _,0,_,_, 3,_,3,_, 2,_,_,_] },
  { name: "DRIFT",  notes: [7,_,_,5, _,_,4,_, _,2,_,_, 0,_,_,_] },
  { name: "CHUG",   notes: [0,_,0,0, _,0,0,_, 0,_,0,0, _,0,_,0] },
  { name: "LIFT",   notes: [0,_,4,_, 7,_,4,_, 9,_,7,_, 4,_,2,_] },
  { name: "HOLLOW", notes: [_,_,0,_, _,_,_,_, _,_,5,_, _,_,_,_] },
  { name: "RUN",    notes: [0,2,3,5, 7,5,3,2, 0,2,3,5, 7,9,10,7] },
];

/* ---------- a beat to start on ---------- */

// only used when we're the first one here — otherwise the room's transport
// arrives over the wire and we adopt it wholesale.
export function seedTransport() {
  const now = clock.now();
  state.xport.epoch = now - (now % 2000);   // a tidy number, purely for sanity when debugging
  state.xport.playing = true;
  state.xport.v = 1;
  state.xport.by = myUid;

  // and a starting groove, so the door opens onto music
  const d = state.dev.drums.grid;
  const R = (n) => A.DRUM_ROWS.indexOf(n);
  [0, 8].forEach(i => d[R("kick")][i] = 1);
  [4, 12].forEach(i => d[R("snare")][i] = 1);
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(i => d[R("hat")][i] = 1);
  state.dev.drums.v = 1; state.dev.drums.by = myUid;

  state.dev.clips.slots = STARTER_CLIPS.map(c => ({ ...c }));
  state.dev.clips.active = 0;
  state.dev.clips.v = 1; state.dev.clips.by = myUid;
}

/* ---------- editing ---------- */

// every local change goes through here: bump the version, stamp your name,
// tell the network, redraw. one door in and out.
function edit(id, fn) {
  const d = id === "xport" ? state.xport : state.dev[id];
  fn(d);
  d.v = (d.v || 0) + 1;
  d.by = myUid;
  push(id, d);
  onChange(id);
}

export const act = {
  toggleStep(id, row, step) {
    edit(id, d => { d.grid[row][step] = d.grid[row][step] ? 0 : 1; });
  },
  setParam(id, key, value) {
    edit(id, d => { d[key] = value; });
  },
  setChannel(name, key, value) {
    edit("mixer", d => { d.ch[name][key] = value; });
  },
  toggleMute(id) {
    edit(id, d => { d.mute = !d.mute; });
  },
  setBpm(bpm) {
    bpm = Math.max(60, Math.min(180, Math.round(bpm)));
    const now = clock.now();
    const x = state.xport;
    // re-anchor the epoch so the downbeat doesn't move. change the tempo
    // naively and everyone lurches to a different part of the bar — this
    // keeps the phase we're currently at and stretches from here on.
    const oldStep = 60000 / x.bpm / 4;
    const phase = (now - x.epoch) / oldStep;
    const newStep = 60000 / bpm / 4;
    edit("xport", d => { d.bpm = bpm; d.epoch = now - phase * newStep; });
    resetSchedule();
  },
  togglePlay() {
    edit("xport", d => { d.playing = !d.playing; });
    resetSchedule();
  },
  setSwing(v) {
    edit("xport", d => { d.swing = Math.max(0, Math.min(0.55, v)); });
  },
  // launching is the one thing that has to happen *on a boundary*. we name
  // the exact absolute step it lands on, so everyone commits to the same bar
  // no matter when the message reaches them.
  launchClip(idx) {
    const x = state.xport;
    const stepMs = 60000 / x.bpm / 4;
    const cur = Math.floor((clock.now() - x.epoch) / stepMs);
    const nextBar = (Math.floor(cur / STEPS) + 1) * STEPS;
    edit("clips", d => { d.queued = idx; d.atStep = nextBar; });
  },
  setClipNote(slot, step, degree) {
    edit("clips", d => {
      if (!d.slots[slot]) d.slots[slot] = { name: "SLOT " + (slot + 1), notes: new Array(STEPS).fill(null) };
      d.slots[slot].notes[step] = degree;
    });
  },
};

/* ---------- merging what other people did ---------- */

export function mergeRemote(id, incoming) {
  const local = id === "xport" ? state.xport : state.dev[id];
  if (!local || !incoming) return false;
  const lv = local.v || 0, rv = incoming.v || 0;
  // strictly newer wins; a tie is broken by uid so every browser in the room
  // resolves it identically. without that tiebreak two simultaneous edits can
  // settle differently in different browsers and the room quietly splits.
  if (rv < lv) return false;
  if (rv === lv && String(incoming.by || "") <= String(local.by || "")) return false;

  Object.assign(local, incoming);
  if (id === "xport") resetSchedule();
  onChange(id);
  return true;
}

export function snapshot() {
  return JSON.parse(JSON.stringify({ xport: state.xport, dev: state.dev }));
}

export function adoptSnapshot(snap) {
  if (!snap || !snap.xport) return;
  // taking the room's transport wholesale is the point of asking for it
  Object.assign(state.xport, snap.xport);
  for (const id of Object.keys(state.dev)) {
    if (snap.dev && snap.dev[id]) Object.assign(state.dev[id], snap.dev[id]);
  }
  resetSchedule();
  onChange("*");
}

/* ---------- the scheduler ---------- */

let nextStep = null;      // the next absolute step we haven't scheduled yet
let timer = null;
let stepWatchers = new Set();

export function onStep(fn) { stepWatchers.add(fn); return () => stepWatchers.delete(fn); }

function resetSchedule() { nextStep = null; }

function stepTimeMs(abs) {
  const x = state.xport;
  const stepMs = 60000 / x.bpm / 4;
  let t = x.epoch + abs * stepMs;
  // swing: hold the offbeat 16ths back a little. purely a timing offset, so
  // it costs nothing and it's the difference between a machine and a groove.
  if (abs % 2 === 1) t += x.swing * stepMs * 0.66;
  return t;
}

function fireStep(abs, at) {
  const x = state.xport;
  const stepMs = 60000 / x.bpm / 4;
  const pos = ((abs % STEPS) + STEPS) % STEPS;
  const mx = state.dev.mixer;

  // ---- clips commit on their named step, wherever we are ----
  const clips = state.dev.clips;
  if (clips.queued >= 0 && clips.atStep >= 0 && abs >= clips.atStep) {
    clips.active = clips.queued;
    clips.queued = -1;
    clips.atStep = -1;
    onChange("clips");
  }

  // ---- drums ----
  const dr = state.dev.drums;
  if (!dr.mute && !mx.ch.drums.mute) {
    for (let r = 0; r < A.DRUM_ROWS.length; r++) {
      if (dr.grid[r][pos]) A.drum(A.DRUM_ROWS[r], at, 1, A.channel("drums"));
    }
  }

  // ---- melodic sequencer ----
  const ar = state.dev.arp;
  if (!ar.mute && !mx.ch.arp.mute) {
    const dur = Math.max(0.05, (stepMs / 1000) * (ar.gate * 3));
    for (let r = 0; r < ar.grid.length; r++) {
      if (!ar.grid[r][pos]) continue;
      // the grid is drawn with low notes at the bottom, so flip the row index
      const degree = (ar.grid.length - 1) - r;
      A.note(A.degreeToMidi(degree, ar.root, ar.scale), at, dur, {
        wave: ar.wave, cutoff: ar.cutoff, level: 0.18, out: A.channel("arp"),
      });
    }
  }

  // ---- the launched clip ----
  if (!clips.mute && !mx.ch.clips.mute && clips.active >= 0) {
    const slot = clips.slots[clips.active];
    const deg = slot && slot.notes ? slot.notes[pos] : null;
    if (deg != null) {
      A.note(A.degreeToMidi(deg, ar.root - 12, ar.scale), at, (stepMs / 1000) * 0.9, {
        wave: "square", cutoff: 900, res: 9, level: 0.20, sub: true, detune: 4,
        out: A.channel("clips"),
      });
    }
  }

  stepWatchers.forEach(fn => { try { fn(pos, abs, at); } catch (e) {} });
}

function tick() {
  const ctx = A.audioCtx();
  if (!ctx) return;
  const x = state.xport;
  if (!x.playing || !x.epoch) { nextStep = null; return; }

  const nowShared = clock.now();
  const stepMs = 60000 / x.bpm / 4;
  const cur = Math.floor((nowShared - x.epoch) / stepMs);

  // (re)joining the grid: never schedule a step that's already gone by, and
  // never try to "catch up" by firing a burst of missed ones — a tab that was
  // backgrounded for a minute should walk back in on the beat, not machine-gun
  // sixty seconds of hi-hats.
  if (nextStep === null || nextStep <= cur) nextStep = cur + 1;

  const horizon = nowShared + LOOKAHEAD_MS;
  let guard = 0;
  while (guard++ < 256) {
    const t = stepTimeMs(nextStep);
    if (t > horizon) break;
    // shared-clock ms -> this browser's audio clock. the two run independently
    // (the audio clock is the sound card's), so we re-derive the mapping every
    // tick rather than trusting an offset we worked out once.
    const at = ctx.currentTime + (t - nowShared) / 1000;
    fireStep(nextStep, Math.max(at, ctx.currentTime + 0.005));
    nextStep++;
  }
}

export function startScheduler() {
  clearInterval(timer);
  timer = setInterval(tick, TICK_MS);
}

// where the playhead is right now, for drawing it
export function playhead() {
  const x = state.xport;
  if (!x.playing || !x.epoch) return -1;
  const stepMs = 60000 / x.bpm / 4;
  return Math.floor((clock.now() - x.epoch) / stepMs) % STEPS;
}

/* ---------- push mixer state into the audio graph ---------- */

// called whenever the mixer changes (locally or remotely) — the audio graph
// is not part of the shared state, it's a projection of it.
export function applyMixer() {
  const m = state.dev.mixer;
  if (!A.audioCtx()) return;
  for (const name of ["drums", "arp", "clips"]) {
    const c = m.ch[name];
    A.setChannel(name, {
      gain: c.gain, mute: c.mute, cutoff: m.cutoff,
      delaySend: m.delaySend, reverbSend: m.reverb * 0.35,
    });
  }
  // tie the delay to the tempo so it always lands on a dotted eighth
  const beat = 60 / state.xport.bpm;
  A.setFx({ delayTime: beat * 0.75, feedback: m.feedback, reverbAmount: m.reverb, masterGain: m.master });
}
