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

export const MAX_STEPS = 32;             // grids are allocated this wide…
export const STEPS = 16;                 // …and this many are live by default
export const N_PATS = 4;                 // the drum machine's A B C D
export const SYNTH_PATS = 8;             // the synth's eight launchable patterns
export const CLIP_SLOTS = 8;             // (kept: the launcher's tile count)

// how long the loop actually is right now. everything — drawing, hit
// testing, the scheduler's wrap — asks this rather than assuming 16, which
// is what makes an odd meter like 7 work everywhere at once.
export const stepCount = () => {
  const n = state.xport && state.xport.steps;
  return Math.max(1, Math.min(MAX_STEPS, n || STEPS));
};
// The grid a device is PLAYING. The drum machine follows the transport's
// A/B/C/D; the synth follows whichever of its patterns was last launched,
// which is why launching and editing can point at different things.
export const curGrid = (id) => {
  const d = state.dev[id];
  if (id === "synth") return d.pats[Math.max(0, Math.min(SYNTH_PATS - 1, d.active || 0))];
  const i = Math.max(0, Math.min(N_PATS - 1, (state.xport && state.xport.pat) || 0));
  return d.pats[i];
};
// The grid a device is SHOWING. Same thing for the drums; for the synth it's
// the pattern you've opened on the editor, so you can rewrite pattern 5 while
// pattern 2 is playing.
export const editGrid = (id) => {
  const d = state.dev[id];
  if (id === "synth") return d.pats[Math.max(0, Math.min(SYNTH_PATS - 1, d.sel || 0))];
  return curGrid(id);
};

const LOOKAHEAD_MS = 220;                // how far ahead we schedule audio
const TICK_MS = 25;                      // how often we wake up to do it

/* ---------- the shared state ---------- */

// every device carries a version and an author. that pair is the entire
// conflict resolution story: higher version wins, and if two people bump to
// the same version in the same instant, the higher uid wins so that every
// browser breaks the tie the same way and nobody ends up out of step.
function grid(rows, steps = MAX_STEPS) {
  return Array.from({ length: rows }, () => new Array(steps).fill(0));
}
// four patterns per device, each allocated full width so shortening the loop
// hides steps rather than destroying them — lengthen it again and your old
// tail is still there
function pats(rows, count = N_PATS) {
  return Array.from({ length: count }, () => grid(rows));
}

export const state = {
  xport: { epoch: 0, bpm: 112, playing: true, swing: 0.12, steps: STEPS, pat: 0, v: 0, by: "" },
  dev: {
    drums: { v: 0, by: "", pats: pats(A.DRUM_ROWS.length), mute: false },
    // one instrument with eight patterns: the launcher picks which plays,
    // the editor writes whichever you've opened. delay and reverb are ITS
    // sends now — they were on the master, where they belonged to nothing.
    synth: { v: 0, by: "", pats: pats(8, SYNTH_PATS), sel: 0, active: 0, queued: -1, atStep: -1,
             root: 45, oct: 0, scale: "minor", voice: "saw",
             cutoff: 1800, res: 6, gate: 0.6, delay: 0, reverb: 0, mute: false },
    mixer: { v: 0, by: "",
             ch: { drums: { gain: 0.9, mute: false }, synth: { gain: 0.75, mute: false } },
             cutoff: 20000, master: 0.85 },
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

// what note a sequencer row actually plays, given the current key and octave.
// the panel draws its row labels from this too, so the grid can never disagree
// with what you hear.
export function arpMidi(degree) {
  const a = state.dev.synth;
  return A.degreeToMidi(degree, a.root + (a.oct || 0) * 12, a.scale);
}

/* ---------- a beat to start on ---------- */

// only used when we're the first one here — otherwise the room's transport
// arrives over the wire and we adopt it wholesale.
export function seedTransport() {
  const now = clock.now();
  state.xport.epoch = now - (now % 2000);   // a tidy number, purely for sanity when debugging
  state.xport.playing = true;
  state.xport.v = 1;
  state.xport.by = myUid;

  // no starting groove and no starter loops: the room opens on silence and
  // the first thing anyone hears is something they played.
  state.dev.drums.v = 1; state.dev.drums.by = myUid;
  state.dev.synth.active = 0;
  state.dev.synth.sel = 0;
  state.dev.synth.v = 1; state.dev.synth.by = myUid;
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

// record arm is deliberately LOCAL: it's about what your hands are doing,
// not what the room is doing, so it never goes over the wire.
let recArmed = false;
export const rec = {
  on: () => recArmed,
  toggle() { recArmed = !recArmed; onChange("drums"); return recArmed; },
};

// Undo is local and shallow on purpose: it remembers the drum grids only,
// which is what hands actually ruin. Anything the room does over the wire
// lands on top of it — this is a "take that back" button, not a timeline.
const undoStack = [];
function pushUndo() {
  undoStack.push(JSON.stringify(state.dev.drums.pats));
  if (undoStack.length > 40) undoStack.shift();
}

export const act = {
  pushUndo,
  undo() {
    const prev = undoStack.pop();
    if (!prev) return false;
    edit("drums", d => { d.pats = JSON.parse(prev); });
    return true;
  },
  canUndo: () => undoStack.length > 0,
  // wipe the pattern you're looking at, and only that one
  clearDrums() {
    pushUndo();
    edit("drums", () => {
      const g = curGrid("drums");
      for (const row of g) row.fill(0);
    });
  },
  toggleStep(id, row, step) {
    edit(id, () => { const g = editGrid(id); g[row][step] = g[row][step] ? 0 : 1; });
  },
  // the loop length. shortening never erases: the columns past the end are
  // just not played or drawn until you lengthen it again.
  setSteps(n) {
    const v = Math.max(1, Math.min(MAX_STEPS, Math.round(n)));
    edit("xport", d => { d.steps = v; });
    resetSchedule();
  },
  setPattern(i) {
    const v = Math.max(0, Math.min(N_PATS - 1, Math.round(i)));
    edit("xport", d => { d.pat = v; });
    onChange("*");
  },
  // a pad struck by hand. always audible immediately; if the player has
  // record armed it also lands on the nearest step, quantised, so you can
  // tap a pattern in rather than drawing it.
  trigger(id, row, { record = recArmed, vel = 1 } = {}) {
    if (id === "drums") A.drum(A.DRUM_ROWS[row], A.audioTime() + 0.001, vel, A.channel("drums"));
    else if (id === "synth") {
      const degree = (editGrid("synth").length - 1) - row;
      const d = state.dev.synth;
      A.note(arpMidi(degree), A.audioTime() + 0.001, 0.18,
        { voice: d.voice, cutoff: d.cutoff, res: d.res, level: 0.18, out: A.channel("synth") });
    }
    if (!record) return;
    // quantise to the nearest step, not the one just gone — a hit a hair
    // early belongs to the beat you were aiming at
    const x = state.xport;
    const stepMs = 60000 / x.bpm / 4;
    const n = stepCount();
    const at = Math.round((clock.now() - x.epoch) / stepMs);
    const pos = ((at % n) + n) % n;
    if (id === "drums" && !editGrid(id)[row][pos]) pushUndo();
    edit(id, () => { editGrid(id)[row][pos] = 1; });
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
  launchPattern(idx) {
    const x = state.xport;
    const stepMs = 60000 / x.bpm / 4;
    const cur = Math.floor((clock.now() - x.epoch) / stepMs);
    const n = stepCount();
    const nextBar = (Math.floor(cur / n) + 1) * n;
    edit("synth", d => { d.queued = idx; d.atStep = nextBar; d.sel = idx; });
  },
  // open a pattern on the editor without disturbing what's playing
  selectPattern(idx) {
    edit("synth", d => { d.sel = Math.max(0, Math.min(SYNTH_PATS - 1, idx)); });
    onChange("synth");
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
  const n = stepCount();
  const pos = ((abs % n) + n) % n;
  const mx = state.dev.mixer;

  // ---- a queued pattern commits on its named step, wherever we are ----
  const sy = state.dev.synth;
  if (sy.queued >= 0 && sy.atStep >= 0 && abs >= sy.atStep) {
    sy.active = sy.queued;
    sy.queued = -1;
    sy.atStep = -1;
    onChange("synth");
  }

  // ---- drums ----
  const dr = state.dev.drums;
  if (!dr.mute && !mx.ch.drums.mute) {
    const dg = curGrid("drums");
    for (let r = 0; r < A.DRUM_ROWS.length; r++) {
      if (dg[r][pos]) A.drum(A.DRUM_ROWS[r], at, 1, A.channel("drums"));
    }
  }

  // ---- melodic sequencer ----
  const ar = state.dev.synth;
  if (!ar.mute && !mx.ch.synth.mute) {
    const dur = Math.max(0.05, (stepMs / 1000) * (ar.gate * 3));
    const ag = curGrid("synth");
    for (let r = 0; r < ag.length; r++) {
      if (!ag[r][pos]) continue;
      // the grid is drawn with low notes at the bottom, so flip the row index
      const degree = (ag.length - 1) - r;
      A.note(arpMidi(degree), at, dur, {
        voice: ar.voice, cutoff: ar.cutoff, res: ar.res, level: 0.18, out: A.channel("synth"),
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
  return Math.floor((clock.now() - x.epoch) / stepMs) % stepCount();
}

/* ---------- push mixer state into the audio graph ---------- */

// called whenever the mixer changes (locally or remotely) — the audio graph
// is not part of the shared state, it's a projection of it.
export function applyMixer() {
  const m = state.dev.mixer;
  if (!A.audioCtx()) return;
  const sy = state.dev.synth;
  for (const name of ["drums", "synth"]) {
    const c = m.ch[name];
    A.setChannel(name, {
      gain: c.gain, mute: c.mute, cutoff: m.cutoff,
      // only the synth goes to the effects, and only as far as ITS knobs say
      delaySend: name === "synth" ? sy.delay : 0,
      reverbSend: name === "synth" ? sy.reverb : 0,
    });
  }
  // tie the delay to the tempo so it always lands on a dotted eighth. the
  // returns stay wide open — the per-channel sends are the volume control,
  // which is what lets the effects be off until somebody turns them on.
  const beat = 60 / state.xport.bpm;
  A.setFx({ delayTime: beat * 0.75, feedback: 0.34, reverbAmount: 1, masterGain: m.master });
}
