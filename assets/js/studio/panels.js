/* ============================================================
   THE STUDIO — the faces of the machines

   Each device wears a canvas. It gets drawn here and mapped onto a
   plane in the room, which means a click is just a raycast that hands
   back a UV, and a UV is just a cell. That indirection is the whole
   reason to do it this way: the exact same hit test works for a mouse
   today and for a controller ray in a headset later. Nothing about the
   interaction knows or cares which one it's talking to.

   Every draggable control is a "slider" with one shared shape, so that
   grabbing one can latch onto it by identity. See sliderValue().
   ============================================================ */

import { state, STEPS, MAX_STEPS, N_PATS, SYNTH_PATS, CLIP_SLOTS, arpMidi, stepCount, curGrid, editGrid, rec } from "./devices.js";
import { DRUM_ROWS, SCALES, VOICES, VOICE_LABEL, noteName } from "./audio.js";

export const PANEL_W = 1024;
export const PANEL_H = 512;

// these read much brighter than a screen palette normally would, on purpose.
// this canvas isn't a web page — it's a lit surface in a dark room, seen from
// several metres away and then crushed again by the scene's tone mapping. a
// tasteful near-black here disappears completely in the room.
const C = {
  bg:      "#0b0d10",
  panel:   "#232e3b",
  line:    "#38465a",
  off:     "#33414f",   // an unlit step still has to be visibly a step
  offBeat: "#3f5063",   // every fourth one, so the bar is countable
  dim:     "#aab6c4",
  text:    "#ffffff",
  hot:     "#ff6a4d",
  cool:    "#7ec8ff",
  mint:    "#8ffbe6",
  amber:   "#ffc069",
  head:    "#161e28",
  btn:       "#3a4757",   // an unpressed button, still clearly a button
  slot:      "#2b3644",
  slotArmed: "#3d6b62",
  faint:     "#6d7d8f",
};

// two of these are faces of the SAME instrument: "synth" edits a pattern,
// "launch" fires them. They share one bank of eight and one voice.
const ACCENT = { drums: C.hot, synth: C.cool, launch: C.mint, mixer: C.amber };
const TITLE = { drums: "DRUM MACHINE", synth: "SYNTH", launch: "PATTERNS", mixer: "MASTER" };
// sixteen voices in a column that also has to fit a play pad: the long
// names get clipped, so they get short ones here
const ROW_LABEL = {
  openhat: "OPEN", cowbell: "BELL", shaker: "SHKR",
  tomLo: "TOM L", tomMid: "TOM M", tomHi: "TOM H",
};
// the launcher's tiles are named so the eight aren't interchangeable
export const PAT_LABELS = ["ROOT", "WALK", "PUSH", "DRIFT", "CHUG", "LIFT", "HOLLOW", "RUN"];
// a panel kind is a FACE; two of them belong to the same instrument, so
// anything that wants the device (mute, state) has to go through this
const DEV_OF = { drums: "drums", synth: "synth", launch: "synth", mixer: "mixer" };

// header takes the top 12%, everything else lives below it
const HEAD = 0.12;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function label(g, text, x, y, size, color, align = "left") {
  g.fillStyle = color;
  g.font = `800 ${size}px Archivo, Helvetica, Arial, sans-serif`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(text, x, y);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ============================================================
   sliders

   One shape for every draggable control on every machine:
     { type:"slider", dev, ch?, key, value }
   The (dev, ch, key) triple names the control; `value` is only the
   reading at the moment you touched it. Because the name is separable
   from the reading, main.js can hold onto the name for the length of a
   drag and keep asking for new readings — which is what stops your hand
   drifting a few pixels up from silently grabbing the fader above.
   ============================================================ */

// lo/hi, and whether it should travel by ear rather than by number
const RANGE = {
  "mixer.gain":      { lo: 0,   hi: 1 },
  "mixer.cutoff":    { lo: 240, hi: 18000, log: true },
  "mixer.delaySend": { lo: 0,   hi: 0.6 },
  "mixer.reverb":    { lo: 0,   hi: 1 },
  "mixer.master":    { lo: 0,   hi: 1 },
  "mixer.bpm":       { lo: 60,  hi: 180 },
  "mixer.swing":     { lo: 0,   hi: 0.55 },
  "synth.cutoff":    { lo: 180, hi: 12000, log: true },
  "synth.res":       { lo: 0.5, hi: 18 },
  "synth.gate":      { lo: 0.1, hi: 1.6 },
  "synth.delay":     { lo: 0,   hi: 0.6 },
  "synth.reverb":    { lo: 0,   hi: 0.6 },
  // plaits: the panel knobs are all normalized, like the hardware's CVs
  "synth.pHarm":     { lo: 0,   hi: 1 },
  "synth.pTimbre":   { lo: 0,   hi: 1 },
  "synth.pMorph":    { lo: 0,   hi: 1 },
  "synth.pDecay":    { lo: 0,   hi: 1 },
  "synth.pLpg":      { lo: 0,   hi: 1 },
  // clouds: hardware ranges — pitch is the one bipolar knob
  "mixer.clPos":     { lo: 0,   hi: 1 },
  "mixer.clSize":    { lo: 0,   hi: 1 },
  "mixer.clPitch":   { lo: -24, hi: 24 },
  "mixer.clDens":    { lo: 0,   hi: 1 },
  "mixer.clTex":     { lo: 0,   hi: 1 },
  "mixer.clWet":     { lo: 0,   hi: 1 },
  "mixer.clSpread":  { lo: 0,   hi: 1 },
  "mixer.clFb":      { lo: 0,   hi: 1 },
  "mixer.clVerb":    { lo: 0,   hi: 1 },
};

const rangeOf = (h) => RANGE[`${h.dev}.${h.key}`];

// a filter swept linearly in hertz spends its top half doing nothing audible,
// so cutoffs travel logarithmically. everything else is honest and linear.
function toFrac(h, v) {
  const r = rangeOf(h);
  if (!r) return 0;
  return clamp01(r.log ? Math.log(v / r.lo) / Math.log(r.hi / r.lo) : (v - r.lo) / (r.hi - r.lo));
}
function fromFrac(h, f) {
  const r = rangeOf(h);
  if (!r) return 0;
  f = clamp01(f);
  return r.log ? r.lo * Math.pow(r.hi / r.lo, f) : r.lo + (r.hi - r.lo) * f;
}

// current reading of a named control, straight off the shared state
function readValue(h) {
  // the master console shows two transport values; everything else is a device
  if (h.key === "bpm" || h.key === "swing") return state.xport[h.key];
  const d = state.dev[h.dev];
  if (!d) return 0;
  return h.ch ? d.ch[h.ch][h.key] : d[h.key];
}

function drawBar(g, x, y, w, h, frac, color) {
  g.fillStyle = C.slot;
  rr(g, x, y, w, h, h / 2); g.fill();
  g.fillStyle = color;
  rr(g, x, y, Math.max(h, w * clamp01(frac)), h, h / 2); g.fill();
  // the handle, so it reads as draggable rather than as a progress bar
  g.fillStyle = C.text;
  g.beginPath();
  g.arc(x + Math.max(h / 2, w * clamp01(frac)), y + h / 2, h * 0.42, 0, Math.PI * 2);
  g.fill();
}

/* ---------- header, shared by every device ---------- */

function drawHead(g, kind, extra = "") {
  const h = PANEL_H * HEAD;
  g.fillStyle = C.head;
  g.fillRect(0, 0, PANEL_W, h);
  g.fillStyle = ACCENT[kind];
  g.fillRect(0, h - 3, PANEL_W, 3);
  label(g, TITLE[kind], 22, h / 2, 26, C.text);

  const dev = state.dev[DEV_OF[kind]];
  // mute lives top-right on every machine, same place every time
  const mw = 108, mh = h * 0.56, mx = PANEL_W - mw - 18, my = (h - mh) / 2;
  g.fillStyle = dev.mute ? C.hot : C.btn;
  rr(g, mx, my, mw, mh, 8); g.fill();
  label(g, dev.mute ? "MUTED" : "MUTE", mx + mw / 2, h / 2, 20, dev.mute ? "#0b0d10" : C.dim, "center");

  if (extra) label(g, extra, PANEL_W - mw - 44, h / 2, 20, C.dim, "right");
  if (kind === "drums" || kind === "synth") drawXportBits(g, kind, h);
  return h;
}

/* ---------- pattern · loop length · record ----------
   these live on the transport, not the device: switching pattern or changing
   the bar length moves the whole room at once, which is the same promise the
   shared clock makes. drawn on the two grid machines because that's where
   you're looking when you want them. */
const PAT_NAMES = ["A", "B", "C", "D"];
// A/B/C/D belongs to the DRUM MACHINE — those are its four patterns. The
// synth's patterns are the eight tiles on the launcher, so it only gets the
// loop length, and the row closes up where the buttons would have been.
function xportLayout(h, showPats) {
  const bh = Math.round(h * 0.56), by = Math.round((h - bh) / 2);
  const pw = 34, gap = 5, nudge = 32, numW = 46;
  const patX = 296;                                   // clear of the title
  const labelX = patX + (showPats ? N_PATS * (pw + gap) : 0) + 52;
  const stepX = labelX + 12;                          // then − n +
  const recX = stepX + nudge + 4 + numW + 4 + nudge + 22;
  return { bh, by, pw, gap, patX, labelX, stepX, nudge, numW, recX, recW: 66 };
}

function drawXportBits(g, kind, h) {
  const showPats = kind === "drums";
  const L = xportLayout(h, showPats);
  const cur = (state.xport && state.xport.pat) || 0;
  if (showPats) for (let i = 0; i < N_PATS; i++) {
    const x = L.patX + i * (L.pw + L.gap);
    g.fillStyle = i === cur ? ACCENT[kind] : C.btn;
    rr(g, x, L.by, L.pw, L.bh, 7); g.fill();
    label(g, PAT_NAMES[i], x + L.pw / 2, h / 2, 20, i === cur ? "#0b0d10" : C.dim, "center");
  }
  // − n + : each grid machine shows and edits ITS OWN loop length
  const n = stepCount(kind);
  g.fillStyle = C.btn;
  rr(g, L.stepX, L.by, L.nudge, L.bh, 7); g.fill();
  label(g, "−", L.stepX + L.nudge / 2, h / 2, 24, C.dim, "center");
  g.fillStyle = C.slot;
  rr(g, L.stepX + L.nudge + 4, L.by, L.numW, L.bh, 7); g.fill();
  label(g, String(n), L.stepX + L.nudge + 4 + L.numW / 2, h / 2, 21, C.text, "center");
  g.fillStyle = C.btn;
  rr(g, L.stepX + L.nudge + 4 + L.numW + 4, L.by, L.nudge, L.bh, 7); g.fill();
  label(g, "+", L.stepX + L.nudge + 4 + L.numW + 4 + L.nudge / 2, h / 2, 24, C.dim, "center");
  label(g, "STEPS", L.labelX, h / 2, 15, C.faint, "right");

  if (kind === "drums") {
    const armed = rec.on();
    g.fillStyle = armed ? C.hot : C.btn;
    rr(g, L.recX, L.by, L.recW, L.bh, 7); g.fill();
    label(g, "REC", L.recX + L.recW / 2, h / 2, 19, armed ? "#0b0d10" : C.dim, "center");
  }
}

function hitXportBits(kind, px, py, h) {
  if (kind !== "drums" && kind !== "synth") return null;
  const showPats = kind === "drums";
  const L = xportLayout(h, showPats);
  if (py < L.by || py > L.by + L.bh) return null;
  if (showPats) for (let i = 0; i < N_PATS; i++) {
    const x = L.patX + i * (L.pw + L.gap);
    if (px >= x && px <= x + L.pw) return { type: "pattern", i };
  }
  if (px >= L.stepX && px <= L.stepX + L.nudge) return { type: "steps", d: -1, id: kind };
  const plusX = L.stepX + L.nudge + 4 + L.numW + 4;
  if (px >= plusX && px <= plusX + L.nudge) return { type: "steps", d: 1, id: kind };
  if (kind === "drums" && px >= L.recX && px <= L.recX + L.recW) return { type: "rec" };
  return null;
}

function hitHead(kind, px, py) {
  const h = PANEL_H * HEAD;
  if (py > h) return null;
  const mw = 108, mh = h * 0.56, mx = PANEL_W - mw - 18, my = (h - mh) / 2;
  if (px >= mx && px <= mx + mw && py >= my && py <= my + mh) return { type: "mute", id: DEV_OF[kind] };
  const xb = hitXportBits(kind, px, py, h);
  if (xb) return xb;
  return { type: "none" };
}

/* ---------- a step grid (drums and sequencer share it) ---------- */

const GUT = 132;   // label gutter down the left of every grid

function gridBox(kind) {
  const top = PANEL_H * HEAD;
  if (kind === "synth") {
    const L = arpLayout();
    return { x: GUT, y: L.gy, w: PANEL_W - GUT - 18, h: L.gh };
  }
  const y = top + 14;
  return { x: GUT, y, w: PANEL_W - GUT - 18, h: PANEL_H - y - 16 };
}

// a tappable pad in the gutter, left of each drum's name: hit it and the
// drum sounds now, wherever the loop happens to be.
const PAD = { x: 8, w: 40 };

function drawGrid(g, kind, rows, rowLabels, playStep) {
  const B = gridBox(kind);
  const steps = stepCount(kind);
  const cw = B.w / steps, chh = B.h / rows;
  const grid = editGrid(kind);
  const accent = ACCENT[kind];
  const pads = kind === "drums";

  for (let r = 0; r < rows; r++) {
    if (pads) {
      const ph = Math.min(chh - 10, 42), py = B.y + chh * (r + 0.5) - ph / 2;
      g.fillStyle = C.btn;
      rr(g, PAD.x, py, PAD.w, ph, 8); g.fill();
      g.strokeStyle = accent; g.lineWidth = 2;
      rr(g, PAD.x + 1, py + 1, PAD.w - 2, ph - 2, 7); g.stroke();
      // a dot so it reads as something to strike rather than a colour swatch
      g.fillStyle = accent;
      g.beginPath(); g.arc(PAD.x + PAD.w / 2, py + ph / 2, Math.min(7, ph * 0.2), 0, Math.PI * 2); g.fill();
    }
    label(g, rowLabels[r], GUT - 8, B.y + chh * (r + 0.5), kind === "synth" ? 15 : 16, C.dim, "right");
    for (let s = 0; s < steps; s++) {
      const x = B.x + s * cw + 3, y = B.y + r * chh + 3;
      const w = cw - 6, h = chh - 6;
      const on = grid[r][s];
      // every fourth step sits a shade brighter so you can find the beat
      g.fillStyle = on ? accent : (s % 4 === 0 ? C.offBeat : C.off);
      rr(g, x, y, w, h, 5); g.fill();
      if (on) {
        // a lit step gets a bright inner edge — at four metres the difference
        // between "on" and "off" has to survive being three pixels tall
        g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
        rr(g, x + 1, y + 1, w - 2, h - 2, 4); g.stroke();
      }
    }
  }

  // the playhead — a column wash rather than a line, so it reads at a distance
  if (playStep >= 0 && playStep < steps) {
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.fillRect(B.x + playStep * cw, B.y - 8, cw, B.h + 8);
    g.fillStyle = accent;
    g.fillRect(B.x + playStep * cw + 3, B.y - 8, cw - 6, 4);
  }
}

function hitGrid(kind, rows, px, py) {
  const head = hitHead(kind, px, py);
  if (head) return head;
  const B = gridBox(kind);
  const steps = stepCount(kind);
  const r = Math.floor((py - B.y) / (B.h / rows));
  // the play pads live in the gutter, left of the grid
  if (kind === "drums" && px >= PAD.x && px <= PAD.x + PAD.w && r >= 0 && r < rows) {
    return { type: "pad", id: kind, row: r };
  }
  if (px < B.x) return { type: "none" };
  const s = Math.floor((px - B.x) / (B.w / steps));
  if (s < 0 || s >= steps || r < 0 || r >= rows) return { type: "none" };
  return { type: "step", id: kind, row: r, step: s };
}

/* ---------- the sequencer's control strip ---------- */

// four things you cycle and three you sweep. deliberately the shortlist: this
// is a machine you reach past someone else to touch mid-loop, not a plugin.
const ARP_BTNS = [
  { key: "voice", label: "VOICE" },
  { key: "scale", label: "SCALE" },
  { key: "root",  label: "KEY" },
  { key: "oct",   label: "OCT" },
];
const ARP_SLIDERS = [
  { key: "cutoff", label: "CUTOFF" },
  { key: "res",    label: "RESO" },
  { key: "gate",   label: "LENGTH" },
  { key: "delay",  label: "DELAY" },
  { key: "reverb", label: "REVERB" },
];

const STRIP_H = 158;
const PLAITS_STRIP_H = 236;   // the hardware panel needs a taller band

const isPlaits = () => state.dev.synth.voice === "plaits";
const stripH = () => (isPlaits() ? PLAITS_STRIP_H : STRIP_H);

function arpLayout() {
  const top = PANEL_H * HEAD;
  const stripTop = PANEL_H - stripH();
  const gy = top + 12;
  const gh = stripTop - gy - 10;
  const pad = 16, gap = 10;
  const btnY = stripTop + 6, btnH = 54;
  const slY = btnY + btnH + 12, slH = 62;
  const btnW = (PANEL_W - pad * 2 - gap * 3) / ARP_BTNS.length;
  const slW = (PANEL_W - pad * 2 - gap * 2) / ARP_SLIDERS.length;
  return { top, stripTop, gy, gh, pad, gap, btnY, btnH, slY, slH, btnW, slW };
}

const arpBtnRect = (L, i) => ({ x: L.pad + i * (L.btnW + L.gap), y: L.btnY, w: L.btnW, h: L.btnH });
// the bar is inset from its cell so the labels have somewhere to live
const arpSlRect = (L, i) => ({ x: L.pad + i * (L.slW + L.gap), y: L.slY, w: L.slW, h: L.slH });
const arpBarRect = (L, i) => {
  const r = arpSlRect(L, i);
  return { x: r.x + 14, y: r.y + 30, w: r.w - 28, h: 22 };
};

function arpBtnValue(key) {
  const a = state.dev.synth;
  if (key === "voice") return VOICE_LABEL[a.voice] || a.voice.toUpperCase();
  if (key === "scale") return a.scale.toUpperCase();
  if (key === "root")  return noteName(a.root).replace(/-?\d+$/, "");
  if (key === "oct")   return (a.oct > 0 ? "+" : "") + a.oct;
  return "";
}

function fmtSlider(key, v) {
  if (key === "cutoff") return v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "";
  if (key === "res")    return v.toFixed(1);
  if (key === "gate")   return Math.round(v * 100) + "%";
  return "";
}

/* ---------- plaits: the hardware panel, laid on its side ----------
   The real module is 12HP of portrait Eurorack: FREQUENCY and HARMONICS
   up top, TIMBRE and MORPH below, a column of eight LEDs down the
   centre with a model button on each side, and the hidden DECAY/LPG
   pair behind a button-hold. Our strip is landscape, so the column
   stays a column and everything else files past it in hardware order.
   FREQUENCY's job (base pitch) already belongs to KEY/OCT + the grid. */

const PLAITS_ENGINES = [
  // bank 1 — firmware 1.2's additions (yellow on the hardware)
  "VA VCF", "PHASE DIST", "6-OP FM 1", "6-OP FM 2", "6-OP FM 3", "WAVE TERRAIN", "STRING MACH", "CHIPTUNE",
  // bank 2 — the classic green bank
  "VIRT ANALOG", "WAVESHAPER", "2-OP FM", "GRANULAR", "ADDITIVE", "WAVETABLE", "CHORD", "SPEECH",
  // bank 3 — noisy and percussive (red)
  "SWARM", "FILT NOISE", "PARTICLE", "STRING", "MODAL", "BASS DRUM", "SNARE", "HI-HAT",
];
const BANK_COLOR = ["#ffd76a", "#7dffa8", "#ff7d6a"];

// the four big panel knobs and the hidden pair, in hardware order
const PLAITS_KNOBS = [
  { key: "pHarm",   label: "HARMONICS", big: true },
  { key: "pTimbre", label: "TIMBRE",    big: true },
  { key: "pMorph",  label: "MORPH",     big: true },
  { key: "pDecay",  label: "DECAY" },
  { key: "pLpg",    label: "LPG" },
];
const PLAITS_SLIDERS = [
  { key: "gate",   label: "LENGTH" },
  { key: "delay",  label: "DELAY" },
  { key: "reverb", label: "REVERB" },
];

// one rotary, everywhere: 270° sweep from 7:30 round to 4:30
function drawKnob(g, cx, cy, rad, frac, color, lbl, val) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  g.fillStyle = "#151b23";
  g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.line; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, rad + 7, a0, a1); g.stroke();
  g.strokeStyle = color; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, rad + 7, a0, a0 + (a1 - a0) * clamp01(frac)); g.stroke();
  const a = a0 + (a1 - a0) * clamp01(frac);
  g.strokeStyle = C.text; g.lineWidth = 4; g.lineCap = "round";
  g.beginPath(); g.moveTo(cx + Math.cos(a) * rad * 0.35, cy + Math.sin(a) * rad * 0.35);
  g.lineTo(cx + Math.cos(a) * rad * 0.86, cy + Math.sin(a) * rad * 0.86); g.stroke();
  g.lineCap = "butt";
  label(g, lbl, cx, cy + rad + 22, 14, C.dim, "center");
  if (val != null) label(g, val, cx, cy - rad - 14, 14, C.cool, "center");
}

// where a click on the knob face lands, as 0..1 around the same sweep
function knobFrac(cx, cy, px, py) {
  let a = Math.atan2(py - cy, px - cx);
  if (a < Math.PI * 0.75 && a > -Math.PI) a += Math.PI * 2;
  return clamp01((a - Math.PI * 0.75) / (Math.PI * 1.5));
}

function plaitsLayout() {
  const L = arpLayout();
  const rowY = L.btnY + L.btnH + 16;              // the knob band
  const ledX = L.pad + 26;                        // ◀ [LEDs] ▶ cluster
  const knobR = 34, smallR = 26;
  const knobY = rowY + 46;
  const slY = rowY + 112, slH = 56;               // the sends row below
  return { ...L, rowY, ledX, knobR, smallR, knobY, slY, slH };
}

function drawPlaitsStrip(g) {
  const L = plaitsLayout();
  const d = state.dev.synth;
  const eng = Math.max(0, Math.min(23, d.pEngine || 0));
  const bank = Math.floor(eng / 8), idx = eng % 8;

  // model selector: a button each side of the LED column, like the panel
  const btnW = 40, btnH = 84, colX = L.ledX + btnW + 14;
  const topY = L.rowY + 2;
  g.fillStyle = C.btn; rr(g, L.ledX, topY, btnW, btnH, 8); g.fill();
  label(g, "◀", L.ledX + btnW / 2, topY + btnH / 2, 22, C.dim, "center");
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i === idx ? BANK_COLOR[bank] : "#26303c";
    g.beginPath(); g.arc(colX + 6, topY + 6 + i * 10.4, 4.4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = C.btn; rr(g, colX + 22, topY, btnW, btnH, 8); g.fill();
  label(g, "▶", colX + 22 + btnW / 2, topY + btnH / 2, 22, C.dim, "center");
  label(g, PLAITS_ENGINES[eng], L.ledX + (btnW * 2 + 36 + 12) / 2, topY + btnH + 18, 15, BANK_COLOR[bank], "center");

  // the knobs, filing past the column in hardware order
  let x = colX + 22 + btnW + 64;
  for (const k of PLAITS_KNOBS) {
    const r = k.big ? L.knobR : L.smallR;
    const h = { dev: "synth", key: k.key };
    drawKnob(g, x, L.knobY, r, toFrac(h, readValue(h)), C.cool, k.label,
             Math.round(readValue(h) * 100) + "");
    x += k.big ? 128 : 100;
  }

  // gate length and the two sends keep their slider shape below
  const slW = (PANEL_W - L.pad * 2 - L.gap * 2) / PLAITS_SLIDERS.length;
  for (let i = 0; i < PLAITS_SLIDERS.length; i++) {
    const sl = PLAITS_SLIDERS[i];
    const rx = L.pad + i * (slW + L.gap);
    const h = { dev: "synth", key: sl.key };
    label(g, sl.label, rx + 14, L.slY + 12, 14, C.dim);
    drawBar(g, rx + 14, L.slY + 24, slW - 28, 20, toFrac(h, readValue(h)), C.cool);
  }
}

function hitPlaitsStrip(px, py) {
  const L = plaitsLayout();
  if (py < L.stripTop) return null;
  for (let i = 0; i < ARP_BTNS.length; i++) {
    const r = arpBtnRect(L, i);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      return { type: "cycle", dev: "synth", key: ARP_BTNS[i].key };
    }
  }
  const btnW = 40, btnH = 84, colX = L.ledX + btnW + 14, topY = L.rowY + 2;
  if (py >= topY && py <= topY + btnH) {
    if (px >= L.ledX && px <= L.ledX + btnW) return { type: "pengine", d: -1 };
    if (px >= colX + 22 && px <= colX + 22 + btnW) return { type: "pengine", d: 1 };
  }
  let x = colX + 22 + btnW + 64;
  for (const k of PLAITS_KNOBS) {
    const r = (k.big ? L.knobR : L.smallR) + 14;
    if (Math.hypot(px - x, py - L.knobY) <= r) {
      const h = { dev: "synth", key: k.key };
      return { type: "slider", ...h, value: fromFrac(h, knobFrac(x, L.knobY, px, py)) };
    }
    x += k.big ? 128 : 100;
  }
  if (py >= L.slY) {
    const slW = (PANEL_W - L.pad * 2 - L.gap * 2) / PLAITS_SLIDERS.length;
    const i = Math.floor((px - L.pad) / (slW + L.gap));
    if (i >= 0 && i < PLAITS_SLIDERS.length) {
      const rx = L.pad + i * (slW + L.gap);
      const h = { dev: "synth", key: PLAITS_SLIDERS[i].key };
      return { type: "slider", ...h, value: fromFrac(h, (px - rx - 14) / (slW - 28)) };
    }
  }
  return { type: "none" };
}

function drawArpStrip(g) {
  const L = arpLayout();
  g.fillStyle = C.head;
  g.fillRect(0, L.stripTop, PANEL_W, stripH());
  g.fillStyle = "rgba(126,200,255,0.30)";
  g.fillRect(0, L.stripTop, PANEL_W, 2);

  for (let i = 0; i < ARP_BTNS.length; i++) {
    const b = ARP_BTNS[i], r = arpBtnRect(L, i);
    g.fillStyle = C.btn;
    rr(g, r.x, r.y, r.w, r.h, 9); g.fill();
    label(g, b.label, r.x + r.w / 2, r.y + 16, 14, C.dim, "center");
    label(g, arpBtnValue(b.key), r.x + r.w / 2, r.y + 37, 24, C.text, "center");
  }

  if (isPlaits()) { drawPlaitsStrip(g); return; }

  for (let i = 0; i < ARP_SLIDERS.length; i++) {
    const s = ARP_SLIDERS[i];
    const r = arpSlRect(L, i), bar = arpBarRect(L, i);
    const h = { dev: "synth", key: s.key };
    const v = readValue(h);
    label(g, s.label, r.x + 14, r.y + 14, 14, C.dim);
    label(g, fmtSlider(s.key, v), r.x + r.w - 14, r.y + 14, 15, C.cool, "right");
    drawBar(g, bar.x, bar.y, bar.w, bar.h, toFrac(h, v), C.cool);
  }
}

function hitArpStrip(px, py) {
  if (isPlaits()) return hitPlaitsStrip(px, py);
  const L = arpLayout();
  if (py < L.stripTop) return null;
  for (let i = 0; i < ARP_BTNS.length; i++) {
    const r = arpBtnRect(L, i);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      return { type: "cycle", dev: "synth", key: ARP_BTNS[i].key };
    }
  }
  for (let i = 0; i < ARP_SLIDERS.length; i++) {
    const r = arpSlRect(L, i);
    if (px < r.x || px > r.x + r.w) continue;
    const bar = arpBarRect(L, i);
    const h = { dev: "synth", key: ARP_SLIDERS[i].key };
    return { type: "slider", ...h, value: fromFrac(h, (px - bar.x) / bar.w) };
  }
  return { type: "none" };
}

/* ---------- clip launcher ---------- */

function drawClips(g, playStep) {
  const top = drawHead(g, "launch", "launches on the next bar");
  const d = state.dev.synth;
  const cols = 4, rows = CLIP_SLOTS / cols;
  const px = 18, py = top + 14;
  const pw = (PANEL_W - px * 2) / cols, ph = (PANEL_H - py - 16) / rows;

  const steps = stepCount("synth");
  for (let i = 0; i < SYNTH_PATS; i++) {
    const cx = px + (i % cols) * pw + 6, cy = py + Math.floor(i / cols) * ph + 6;
    const w = pw - 12, h = ph - 12;
    const pat = d.pats[i];
    const filled = pat.some(row => row.some(v => v));
    const active = d.active === i, queued = d.queued === i;

    g.fillStyle = active ? C.mint : (queued ? C.slotArmed : C.slot);
    rr(g, cx, cy, w, h, 10); g.fill();
    if (queued) {
      // a dashed ring while it waits its turn — it's armed, not playing
      g.strokeStyle = C.mint; g.lineWidth = 3; g.setLineDash([9, 7]);
      rr(g, cx + 2, cy + 2, w - 4, h - 4, 9); g.stroke(); g.setLineDash([]);
    }
    // the one you're editing gets a solid ring, so the two faces agree
    if (d.sel === i && !active) {
      g.strokeStyle = C.cool; g.lineWidth = 3;
      rr(g, cx + 2, cy + 2, w - 4, h - 4, 9); g.stroke();
    }
    const ink = active ? "#08120f" : C.text;
    label(g, PAT_LABELS[i] || `P${i + 1}`, cx + w / 2, cy + h * 0.36, 26, filled ? ink : C.faint, "center");

    // a piano-roll thumbnail straight off the pattern's own grid
    {
      const sw = (w - 32) / steps;
      const rows = pat.length;
      for (let st = 0; st < steps; st++) {
        for (let r = 0; r < rows; r++) {
          if (!pat[r][st]) continue;
          const deg = (rows - 1) - r;
          const bh = 4 + deg * 2.2;
          g.fillStyle = active ? "rgba(8,18,15,0.65)" : "rgba(143,251,230,0.85)";
          g.fillRect(cx + 16 + st * sw, cy + h - 16 - bh, Math.max(2, sw - 2), bh);
        }
      }
      if (active && playStep >= 0 && playStep < steps) {
        g.fillStyle = "rgba(8,18,15,0.9)";
        g.fillRect(cx + 16 + playStep * sw, cy + h - 20, Math.max(2, sw - 2), 3);
      }
    }
  }
}

function hitClips(px, py) {
  const head = hitHead("launch", px, py);
  if (head) return head;
  const top = PANEL_H * HEAD;
  const cols = 4, rows = CLIP_SLOTS / cols;
  const ox = 18, oy = top + 14;
  const pw = (PANEL_W - ox * 2) / cols, ph = (PANEL_H - oy - 16) / rows;
  const c = Math.floor((px - ox) / pw), r = Math.floor((py - oy) / ph);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return { type: "none" };
  return { type: "clip", index: r * cols + c };   // handled as launch-or-open in main.js
}

/* ---------- mixer ---------- */

// tempo and feel live here now; delay and reverb went to the synth, which is
// the only thing that was ever sending to them
const FX_ROWS = [
  { key: "bpm",    label: "TEMPO",  xport: true },
  { key: "swing",  label: "SWING",  xport: true },
  { key: "cutoff", label: "FILTER" },
  { key: "master", label: "MASTER" },
];
const CH_NAMES = ["drums", "synth"];
const CH_LABEL = { drums: "DRUMS", synth: "SYNTH" };

// the strips squeeze left so clouds can live on the right half — the way a
// granular processor bolts onto the end of a mixer in a real rack
function mixerLayout() {
  const top = PANEL_H * HEAD;
  const chTop = top + 16, chH = 46, chGap = 12;
  const fxTop = chTop + CH_NAMES.length * (chH + chGap) + 14;
  const fxH = 40, fxGap = 10;
  return { top, chTop, chH, chGap, fxTop, fxH, fxGap, x: 110, w: 258 };
}

/* ---------- clouds, across the whole mix ----------
   The hardware groups its panel as: the three big knobs (POSITION, SIZE,
   PITCH), the texture pair (DENSITY, TEXTURE), one BLEND knob that a
   button cycles through four meanings, and FREEZE. We keep the grouping
   and give each blend meaning its own small slider — four labelled
   sliders beat one knob you have to interrogate. */
const CLOUDS_KNOBS = [
  { key: "clPos",  label: "POSITION", big: true },
  { key: "clSize", label: "SIZE",     big: true },
  { key: "clPitch", label: "PITCH",   big: true, bipolar: true },
  { key: "clDens", label: "DENSITY" },
  { key: "clTex",  label: "TEXTURE" },
];
const CLOUDS_BLEND = [
  { key: "clWet",    label: "DRY/WET" },
  { key: "clSpread", label: "SPREAD" },
  { key: "clFb",     label: "FEEDBK" },
  { key: "clVerb",   label: "REVERB" },
];
const CLOUDS_MODES = ["GRANULAR", "STRETCH", "LOOP DELAY", "SPECTRAL"];

function drawClouds(g) {
  const m = state.dev.mixer;
  const x0 = 476, w = PANEL_W - x0 - 18;
  g.strokeStyle = C.line; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0 - 18, PANEL_H * HEAD + 10); g.lineTo(x0 - 18, PANEL_H - 14); g.stroke();
  label(g, "CLOUDS", x0, PANEL_H * HEAD + 26, 20, C.amber);
  label(g, "granular · the whole mix", x0 + 108, PANEL_H * HEAD + 26, 13, C.faint);

  // knob row 1: the three big ones
  const y1 = PANEL_H * HEAD + 96;
  let x = x0 + 44;
  for (const k of CLOUDS_KNOBS.slice(0, 3)) {
    const h = { dev: "mixer", key: k.key };
    const v = readValue(h);
    drawKnob(g, x, y1, 30, toFrac(h, v), C.amber, k.label,
             k.bipolar ? (v > 0 ? "+" : "") + Math.round(v) : Math.round(v * 100) + "");
    x += 118;
  }
  // knob row 2: density + texture, then freeze and the mode
  const y2 = y1 + 118;
  x = x0 + 44;
  for (const k of CLOUDS_KNOBS.slice(3)) {
    const h = { dev: "mixer", key: k.key };
    drawKnob(g, x, y2, 24, toFrac(h, readValue(h)), C.amber, k.label,
             Math.round(readValue(h) * 100) + "");
    x += 108;
  }
  const bx = x - 26, bw = 130, bh = 40;
  g.fillStyle = m.clFreeze ? C.cool : C.btn;
  rr(g, bx, y2 - 44, bw, bh, 8); g.fill();
  label(g, m.clFreeze ? "FROZEN" : "FREEZE", bx + bw / 2, y2 - 44 + bh / 2, 17, m.clFreeze ? "#0b0d10" : C.dim, "center");
  g.fillStyle = C.btn;
  rr(g, bx, y2 + 6, bw, bh, 8); g.fill();
  label(g, CLOUDS_MODES[m.clMode & 3], bx + bw / 2, y2 + 6 + bh / 2, 15, C.amber, "center");

  // the blend row: four small sliders where the hardware has one knob
  const by = PANEL_H - 74;
  const bsW = (w - 12 * 3) / 4;
  for (let i = 0; i < CLOUDS_BLEND.length; i++) {
    const rx = x0 + i * (bsW + 12);
    const h = { dev: "mixer", key: CLOUDS_BLEND[i].key };
    label(g, CLOUDS_BLEND[i].label, rx + 2, by, 13, C.dim);
    drawBar(g, rx, by + 12, bsW, 20, toFrac(h, readValue(h)), C.amber);
  }
}

function hitClouds(px, py) {
  const m = state.dev.mixer;
  const x0 = 476, w = PANEL_W - x0 - 18;
  if (px < x0 - 10) return null;
  const y1 = PANEL_H * HEAD + 96;
  let x = x0 + 44;
  for (const k of CLOUDS_KNOBS.slice(0, 3)) {
    if (Math.hypot(px - x, py - y1) <= 44) {
      const h = { dev: "mixer", key: k.key };
      return { type: "slider", ...h, value: fromFrac(h, knobFrac(x, y1, px, py)) };
    }
    x += 118;
  }
  const y2 = y1 + 118;
  x = x0 + 44;
  for (const k of CLOUDS_KNOBS.slice(3)) {
    if (Math.hypot(px - x, py - y2) <= 38) {
      const h = { dev: "mixer", key: k.key };
      return { type: "slider", ...h, value: fromFrac(h, knobFrac(x, y2, px, py)) };
    }
    x += 108;
  }
  const bx = x - 26, bw = 130, bh = 40;
  if (px >= bx && px <= bx + bw) {
    if (py >= y2 - 44 && py <= y2 - 44 + bh) return { type: "clfreeze" };
    if (py >= y2 + 6 && py <= y2 + 6 + bh) return { type: "clmode" };
  }
  const by = PANEL_H - 74;
  if (py >= by && py <= by + 40) {
    const bsW = (w - 12 * 3) / 4;
    const i = Math.floor((px - x0) / (bsW + 12));
    if (i >= 0 && i < 4) {
      const rx = x0 + i * (bsW + 12);
      const h = { dev: "mixer", key: CLOUDS_BLEND[i].key };
      return { type: "slider", ...h, value: fromFrac(h, (px - rx) / bsW) };
    }
  }
  return { type: "none" };
}

function drawMixer(g) {
  drawHead(g, "mixer");
  const L = mixerLayout();

  for (let i = 0; i < CH_NAMES.length; i++) {
    const name = CH_NAMES[i];
    const y = L.chTop + i * (L.chH + L.chGap);
    const h = { dev: "mixer", ch: name, key: "gain" };
    label(g, CH_LABEL[name], L.x - 16, y + L.chH / 2, 20, C.dim, "right");
    drawBar(g, L.x, y + 10, L.w, L.chH - 20, toFrac(h, readValue(h)), ACCENT[name]);
    const bw = 74, bx = L.x + L.w + 10;
    const muted = state.dev.mixer.ch[name].mute;
    g.fillStyle = muted ? C.hot : C.btn;
    rr(g, bx, y + 6, bw, L.chH - 12, 7); g.fill();
    label(g, "M", bx + bw / 2, y + L.chH / 2, 20, muted ? "#0b0d10" : C.dim, "center");
  }

  for (let i = 0; i < FX_ROWS.length; i++) {
    const y = L.fxTop + i * (L.fxH + L.fxGap);
    const h = { dev: "mixer", key: FX_ROWS[i].key };
    label(g, FX_ROWS[i].label, L.x - 16, y + L.fxH / 2, 18, C.dim, "right");
    drawBar(g, L.x, y + 9, L.w, L.fxH - 18, toFrac(h, readValue(h)), C.amber);
  }
  drawClouds(g);
}

function hitMixer(px, py) {
  const head = hitHead("mixer", px, py);
  if (head) return head;
  const cl = hitClouds(px, py);
  if (cl && cl.type !== "none") return cl;
  const L = mixerLayout();

  for (let i = 0; i < CH_NAMES.length; i++) {
    const y = L.chTop + i * (L.chH + L.chGap);
    if (py < y || py > y + L.chH) continue;
    const bw = 74, bx = L.x + L.w + 10;
    if (px >= bx && px <= bx + bw) return { type: "chmute", name: CH_NAMES[i] };
    const h = { dev: "mixer", ch: CH_NAMES[i], key: "gain" };
    return { type: "slider", ...h, value: fromFrac(h, (px - L.x) / L.w) };
  }
  for (let i = 0; i < FX_ROWS.length; i++) {
    const y = L.fxTop + i * (L.fxH + L.fxGap);
    if (py < y || py > y + L.fxH) continue;
    const h = { dev: "mixer", key: FX_ROWS[i].key };
    return { type: "slider", ...h, value: fromFrac(h, (px - L.x) / L.w) };
  }
  return { type: "none" };
}

/* ---------- public ---------- */

export function drawPanel(kind, g, playStep) {
  g.fillStyle = C.panel;
  g.fillRect(0, 0, PANEL_W, PANEL_H);
  if (kind === "drums") {
    drawHead(g, "drums");
    drawGrid(g, "drums", DRUM_ROWS.length, DRUM_ROWS.map(n => ROW_LABEL[n] || n.toUpperCase()), playStep);
  } else if (kind === "synth") {
    const a = state.dev.synth;
    drawHead(g, "synth", `${PAT_LABELS[a.sel] || ""} · ${VOICE_LABEL[a.voice] || ""}`);
    // rows are labelled with the note they will actually play, so the grid can
    // never disagree with what comes out of it when you change key or scale
    const names = Array.from({ length: 8 }, (_, i) => noteName(arpMidi(7 - i)));
    drawGrid(g, "synth", 8, names, playStep);
    drawArpStrip(g);
  } else if (kind === "launch") drawClips(g, playStep);
  else if (kind === "mixer") drawMixer(g);
}

// uv comes straight off the raycast; v is flipped because textures start
// at the bottom and canvases start at the top.
export function hitPanel(kind, u, v) {
  const px = u * PANEL_W, py = (1 - v) * PANEL_H;
  if (kind === "drums") return hitGrid("drums", DRUM_ROWS.length, px, py);
  if (kind === "synth")  return hitArpStrip(px, py) || hitGrid("synth", 8, px, py);
  if (kind === "launch") return hitClips(px, py);
  if (kind === "mixer") return hitMixer(px, py);
  return { type: "none" };
}

// Re-read a *named* slider at a new horizontal position, ignoring the vertical
// entirely. This is what makes a drag stick: once you've grabbed a fader, only
// how far across you are matters, so sliding your hand up onto the next row
// can't quietly hand you a different control. Returns null if the control
// doesn't live on this panel.
export function sliderValue(kind, h, u) {
  if (!h || h.type !== "slider") return null;
  const px = u * PANEL_W;
  if (kind === "mixer" && h.dev === "mixer") {
    const L = mixerLayout();
    return fromFrac(h, (px - L.x) / L.w);
  }
  if (kind === "synth" && h.dev === "synth") {
    const i = ARP_SLIDERS.findIndex(s => s.key === h.key);
    if (i < 0) return null;
    const bar = arpBarRect(arpLayout(), i);
    return fromFrac(h, (px - bar.x) / bar.w);
  }
  return null;
}

export const CYCLE = { SCALES: Object.keys(SCALES), VOICES };
