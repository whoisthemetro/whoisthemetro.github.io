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

function arpLayout() {
  const top = PANEL_H * HEAD;
  const stripTop = PANEL_H - STRIP_H;
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

function drawArpStrip(g) {
  const L = arpLayout();
  g.fillStyle = C.head;
  g.fillRect(0, L.stripTop, PANEL_W, STRIP_H);
  g.fillStyle = "rgba(126,200,255,0.30)";
  g.fillRect(0, L.stripTop, PANEL_W, 2);

  for (let i = 0; i < ARP_BTNS.length; i++) {
    const b = ARP_BTNS[i], r = arpBtnRect(L, i);
    g.fillStyle = C.btn;
    rr(g, r.x, r.y, r.w, r.h, 9); g.fill();
    label(g, b.label, r.x + r.w / 2, r.y + 16, 14, C.dim, "center");
    label(g, arpBtnValue(b.key), r.x + r.w / 2, r.y + 37, 24, C.text, "center");
  }

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

function mixerLayout() {
  const top = PANEL_H * HEAD;
  const chTop = top + 16, chH = 46, chGap = 12;
  const fxTop = chTop + CH_NAMES.length * (chH + chGap) + 14;
  const fxH = 40, fxGap = 10;
  return { top, chTop, chH, chGap, fxTop, fxH, fxGap, x: 132, w: PANEL_W - 132 - 96 };
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
    const bw = 74, bx = PANEL_W - bw - 18;
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
}

function hitMixer(px, py) {
  const head = hitHead("mixer", px, py);
  if (head) return head;
  const L = mixerLayout();

  for (let i = 0; i < CH_NAMES.length; i++) {
    const y = L.chTop + i * (L.chH + L.chGap);
    if (py < y || py > y + L.chH) continue;
    const bw = 74, bx = PANEL_W - bw - 18;
    if (px >= bx) return { type: "chmute", name: CH_NAMES[i] };
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
