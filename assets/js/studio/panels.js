/* ============================================================
   THE STUDIO — the faces of the machines

   Each device wears a canvas. It gets drawn here and mapped onto a
   plane in the room, which means a click is just a raycast that hands
   back a UV, and a UV is just a cell. That indirection is the whole
   reason to do it this way: the exact same hit test works for a mouse
   today and for a controller ray in a headset later. Nothing about the
   interaction knows or cares which one it's talking to.
   ============================================================ */

import { state, STEPS, CLIP_SLOTS } from "./devices.js";
import { DRUM_ROWS, SCALES, WAVES } from "./audio.js";

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

const ACCENT = { drums: C.hot, arp: C.cool, clips: C.mint, mixer: C.amber };
const TITLE = { drums: "DRUM MACHINE", arp: "SEQUENCER", clips: "CLIP LAUNCHER", mixer: "MIXER + FX" };

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

/* ---------- header, shared by every device ---------- */

function drawHead(g, kind, extra = "") {
  const h = PANEL_H * HEAD;
  g.fillStyle = C.head;
  g.fillRect(0, 0, PANEL_W, h);
  g.fillStyle = ACCENT[kind];
  g.fillRect(0, h - 3, PANEL_W, 3);
  label(g, TITLE[kind], 22, h / 2, 30, C.text);

  const dev = state.dev[kind];
  // mute lives top-right on every machine, same place every time
  const mw = 108, mh = h * 0.56, mx = PANEL_W - mw - 18, my = (h - mh) / 2;
  g.fillStyle = dev.mute ? C.hot : C.btn;
  rr(g, mx, my, mw, mh, 8); g.fill();
  label(g, dev.mute ? "MUTED" : "MUTE", mx + mw / 2, h / 2, 20, dev.mute ? "#0b0d10" : C.dim, "center");

  if (extra) label(g, extra, PANEL_W - mw - 44, h / 2, 20, C.dim, "right");
  return h;
}

function hitHead(kind, px, py) {
  const h = PANEL_H * HEAD;
  if (py > h) return null;
  const mw = 108, mh = h * 0.56, mx = PANEL_W - mw - 18, my = (h - mh) / 2;
  if (px >= mx && px <= mx + mw && py >= my && py <= my + mh) return { type: "mute", id: kind };
  return { type: "none" };
}

/* ---------- a step grid (drums and sequencer share it) ---------- */

function drawGrid(g, kind, rows, rowLabels, playStep) {
  const top = drawHead(g, kind, kind === "arp"
    ? `${state.dev.arp.scale.toUpperCase()}  ·  ${state.dev.arp.wave.slice(0, 3).toUpperCase()}`
    : "");
  const gut = 132;                              // label gutter on the left
  const gx = gut, gy = top + 14;
  const gw = PANEL_W - gut - 18, gh = PANEL_H - gy - 16;
  const cw = gw / STEPS, chh = gh / rows;
  const grid = state.dev[kind].grid;
  const accent = ACCENT[kind];

  for (let r = 0; r < rows; r++) {
    label(g, rowLabels[r], gut - 14, gy + chh * (r + 0.5), 17, C.dim, "right");
    for (let s = 0; s < STEPS; s++) {
      const x = gx + s * cw + 3, y = gy + r * chh + 3;
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
  if (playStep >= 0) {
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.fillRect(gx + playStep * cw, gy - 8, cw, gh + 8);
    g.fillStyle = accent;
    g.fillRect(gx + playStep * cw + 3, gy - 8, cw - 6, 4);
  }
}

function hitGrid(kind, rows, px, py) {
  const head = hitHead(kind, px, py);
  if (head) return head;
  const top = PANEL_H * HEAD;
  const gut = 132, gy = top + 14;
  const gw = PANEL_W - gut - 18, gh = PANEL_H - gy - 16;
  if (px < gut) return { type: "none" };
  const s = Math.floor((px - gut) / (gw / STEPS));
  const r = Math.floor((py - gy) / (gh / rows));
  if (s < 0 || s >= STEPS || r < 0 || r >= rows) return { type: "none" };
  return { type: "step", id: kind, row: r, step: s };
}

/* ---------- clip launcher ---------- */

function drawClips(g, playStep) {
  const top = drawHead(g, "clips", "launches on the next bar");
  const d = state.dev.clips;
  const cols = 4, rows = CLIP_SLOTS / cols;
  const px = 18, py = top + 14;
  const pw = (PANEL_W - px * 2) / cols, ph = (PANEL_H - py - 16) / rows;

  for (let i = 0; i < CLIP_SLOTS; i++) {
    const cx = px + (i % cols) * pw + 6, cy = py + Math.floor(i / cols) * ph + 6;
    const w = pw - 12, h = ph - 12;
    const slot = d.slots[i];
    const active = d.active === i, queued = d.queued === i;

    g.fillStyle = active ? C.mint : (queued ? C.slotArmed : C.slot);
    rr(g, cx, cy, w, h, 10); g.fill();
    if (queued) {
      // a dashed ring while it waits its turn — it's armed, not playing
      g.strokeStyle = C.mint; g.lineWidth = 3; g.setLineDash([9, 7]);
      rr(g, cx + 2, cy + 2, w - 4, h - 4, 9); g.stroke(); g.setLineDash([]);
    }
    const ink = active ? "#08120f" : C.text;
    label(g, slot ? slot.name : "EMPTY", cx + w / 2, cy + h * 0.36, 26, slot ? ink : C.faint, "center");

    // a little piano-roll thumbnail so the pads aren't interchangeable
    if (slot) {
      const sw = (w - 32) / STEPS;
      for (let s = 0; s < STEPS; s++) {
        if (slot.notes[s] == null) continue;
        const bh = 4 + Math.min(slot.notes[s], 9) * 2.2;
        g.fillStyle = active ? "rgba(8,18,15,0.65)" : "rgba(143,251,230,0.85)";
        g.fillRect(cx + 16 + s * sw, cy + h - 16 - bh, sw - 2, bh);
      }
      if (active && playStep >= 0) {
        g.fillStyle = "rgba(8,18,15,0.9)";
        g.fillRect(cx + 16 + playStep * sw, cy + h - 20, sw - 2, 3);
      }
    }
  }
}

function hitClips(px, py) {
  const head = hitHead("clips", px, py);
  if (head) return head;
  const top = PANEL_H * HEAD;
  const cols = 4, rows = CLIP_SLOTS / cols;
  const ox = 18, oy = top + 14;
  const pw = (PANEL_W - ox * 2) / cols, ph = (PANEL_H - oy - 16) / rows;
  const c = Math.floor((px - ox) / pw), r = Math.floor((py - oy) / ph);
  if (c < 0 || c >= cols || r < 0 || r >= rows) return { type: "none" };
  return { type: "clip", index: r * cols + c };
}

/* ---------- mixer ---------- */

// [key, label, min, max] — the four that are worth reaching for mid-jam
const FX = [
  ["cutoff",    "FILTER",  240,  18000],
  ["delaySend", "DELAY",   0,    0.6],
  ["reverb",    "REVERB",  0,    1],
  ["master",    "MASTER",  0,    1],
];
const CH_NAMES = ["drums", "arp", "clips"];
const CH_LABEL = { drums: "DRUMS", arp: "SEQ", clips: "CLIPS" };

function mixerLayout() {
  const top = PANEL_H * HEAD;
  const chTop = top + 16, chH = 46, chGap = 12;
  const fxTop = chTop + CH_NAMES.length * (chH + chGap) + 14;
  const fxH = 40, fxGap = 10;
  return { top, chTop, chH, chGap, fxTop, fxH, fxGap, x: 132, w: PANEL_W - 132 - 96 };
}

function drawBar(g, x, y, w, h, frac, color) {
  g.fillStyle = C.slot;
  rr(g, x, y, w, h, h / 2); g.fill();
  g.fillStyle = color;
  rr(g, x, y, Math.max(h, w * frac), h, h / 2); g.fill();
  // the handle, so it reads as draggable rather than as a progress bar
  g.fillStyle = C.text;
  g.beginPath();
  g.arc(x + Math.max(h / 2, w * frac), y + h / 2, h * 0.42, 0, Math.PI * 2);
  g.fill();
}

function drawMixer(g) {
  drawHead(g, "mixer");
  const L = mixerLayout();
  const m = state.dev.mixer;

  for (let i = 0; i < CH_NAMES.length; i++) {
    const name = CH_NAMES[i];
    const y = L.chTop + i * (L.chH + L.chGap);
    label(g, CH_LABEL[name], L.x - 16, y + L.chH / 2, 20, C.dim, "right");
    drawBar(g, L.x, y + 10, L.w, L.chH - 20, m.ch[name].gain, ACCENT[name]);
    const bw = 74, bx = PANEL_W - bw - 18;
    g.fillStyle = m.ch[name].mute ? C.hot : C.btn;
    rr(g, bx, y + 6, bw, L.chH - 12, 7); g.fill();
    label(g, "M", bx + bw / 2, y + L.chH / 2, 20, m.ch[name].mute ? "#0b0d10" : C.dim, "center");
  }

  for (let i = 0; i < FX.length; i++) {
    const [key, name, lo, hi] = FX[i];
    const y = L.fxTop + i * (L.fxH + L.fxGap);
    label(g, name, L.x - 16, y + L.fxH / 2, 18, C.dim, "right");
    // the filter sweeps by ear, not by hertz — log scale or the top half is dead
    const frac = key === "cutoff"
      ? Math.log(m[key] / lo) / Math.log(hi / lo)
      : (m[key] - lo) / (hi - lo);
    drawBar(g, L.x, y + 9, L.w, L.fxH - 18, Math.max(0, Math.min(1, frac)), C.amber);
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
    const f = Math.max(0, Math.min(1, (px - L.x) / L.w));
    return { type: "chgain", name: CH_NAMES[i], value: f };
  }
  for (let i = 0; i < FX.length; i++) {
    const [key, , lo, hi] = FX[i];
    const y = L.fxTop + i * (L.fxH + L.fxGap);
    if (py < y || py > y + L.fxH) continue;
    const f = Math.max(0, Math.min(1, (px - L.x) / L.w));
    const value = key === "cutoff" ? lo * Math.pow(hi / lo, f) : lo + (hi - lo) * f;
    return { type: "fx", key, value };
  }
  return { type: "none" };
}

/* ---------- public ---------- */

export function drawPanel(kind, g, playStep) {
  g.fillStyle = C.panel;
  g.fillRect(0, 0, PANEL_W, PANEL_H);
  if (kind === "drums") drawGrid(g, "drums", DRUM_ROWS.length, DRUM_ROWS.map(n => n.toUpperCase()), playStep);
  else if (kind === "arp") {
    const s = SCALES[state.dev.arp.scale] || SCALES.minor;
    // top row is the highest degree, so the grid reads like a piano roll
    const names = Array.from({ length: 8 }, (_, i) => "·" + (8 - i));
    drawGrid(g, "arp", 8, names, playStep);
    void s;
  }
  else if (kind === "clips") drawClips(g, playStep);
  else if (kind === "mixer") drawMixer(g);
}

// uv comes straight off the raycast; v is flipped because textures start
// at the bottom and canvases start at the top.
export function hitPanel(kind, u, v) {
  const px = u * PANEL_W, py = (1 - v) * PANEL_H;
  if (kind === "drums") return hitGrid("drums", DRUM_ROWS.length, px, py);
  if (kind === "arp")   return hitGrid("arp", 8, px, py);
  if (kind === "clips") return hitClips(px, py);
  if (kind === "mixer") return hitMixer(px, py);
  return { type: "none" };
}

export const CYCLE = { SCALES: Object.keys(SCALES), WAVES };
