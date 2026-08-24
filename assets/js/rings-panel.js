/* ============================================================
   THE BEDROOM — the Rings panel, by the guitar

   The telecaster's voice is RINGS: Émilie Gillet's resonator, running as
   wasm on the audio thread. This is the panel that opens when you press
   the button on its body, and it is the sibling of synth-panel.js in
   every way that matters — same knob, same palette, same in-the-world
   canvas rather than a DOM overlay, so the guitar stays playable with
   the parameters up. Read that file's header for why.

   WHY RINGS FOR A GUITAR

   Because it isn't a substitution. Rings is a resonator: you hit it and
   it rings. A plucked string is its native case, not a clever use of it.
   The four knobs here are the four on the hardware, and FREQUENCY is
   missing for the same reason it's missing from the Plaits panel — the
   pitch comes from the thing you're playing, which is the fretboard.

   The models are the real six, in firmware order. The last three are
   what the manual calls the bonus models, so they're marked.
   ============================================================ */

import * as THREE from "three";
import { C, rr, label, drawKnob, grabFrac, clamp01 } from "./panel-kit.js";

export const MODELS = [
  { name: "MODAL",         note: "struck bar" },
  { name: "SYMPATHETIC",   note: "strings ringing along" },
  { name: "STRING",        note: "a plucked string" },
  { name: "FM VOICE",      note: "bonus" },
  { name: "SYMP QUANT",    note: "bonus · quantized" },
  { name: "STRING+VERB",   note: "bonus · with reverb" },
];
// green for the three real models, amber for the three bonus ones — the
// same "which bank am I in" cue the Plaits panel gives
const MODEL_COLOR = (i) => (i < 3 ? "#7dffa8" : "#ffd76a");

const KNOBS = [
  { key: "structure",  label: "STRUCTURE" },
  { key: "brightness", label: "BRIGHTNESS" },
  { key: "damping",    label: "DAMPING" },
  { key: "position",   label: "POSITION" },
];

export const POLY = [1, 2, 4];

/* ---------- state ---------- */

const KEY = "metro.rings";
const DEFAULTS = {
  model: 2,                  // STRING — the one a guitar actually is
  structure: 0.35, brightness: 0.5, damping: 0.7, position: 0.25,
  polyphony: 4,
};

export function loadState() {
  let st = { ...DEFAULTS };
  try { st = { ...st, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) {}
  return st;
}
export function saveState(st) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
}

/* ---------- drawing ---------- */

// shorter than the Plaits panel because it has less on it: four knobs and
// two buttons, not five knobs and eight. A panel sized to its sibling
// rather than to its contents is a panel with a hole in it.
const W = 1024, H = 452;

function layout() {
  const pad = 26;
  const headH = 56;
  const modY = headH + 20, modH = 84;
  const knobY = modY + modH + 84;
  const stripTop = knobY + 78;
  const rowH = 62, gap = 12;
  const cell = (i, count) => {
    const w = (W - pad * 2 - gap * (count - 1)) / count;
    return { x: pad + i * (w + gap), y: stripTop + 14, w, h: rowH };
  };
  return { pad, headH, modY, modH, knobY, stripTop, rowH, cell };
}

/* One cell, not two. It had MODEL in it as well, which is the same control
   as the stepper directly above showing the same word — a second way to do a
   thing you can already see, taking up half the strip. */
const ROW = [
  { key: "polyphony", label: "POLYPHONY" },
];

const valueOf = (st, key) =>
  key === "polyphony" ? `${st.polyphony} voice${st.polyphony === 1 ? "" : "s"}`
  : MODELS[st.model % MODELS.length].name;
// how many notes can ring at once — the thing the number actually buys you
const POLY_NOTE = { 1: "one note at a time", 2: "two ring together", 4: "four ring together" };

export function draw(g, st, live = null) {
  const L = layout();
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  /* header */
  g.fillStyle = C.head;
  g.fillRect(0, 0, W, L.headH);
  g.fillStyle = C.line;
  g.fillRect(0, L.headH - 2, W, 2);
  label(g, "RINGS", L.pad, L.headH / 2, 26, C.cool);
  label(g, live && live.status === "loading" ? "loading…"
        : live && live.status === "failed" ? "wasm failed — running the plain string"
        : "resonator", L.pad + 112, L.headH / 2 + 1, 16, C.dim);
  g.fillStyle = C.btn;
  rr(g, W - L.pad - 44, 10, 44, L.headH - 20, 8); g.fill();
  label(g, "✕", W - L.pad - 22, L.headH / 2, 22, C.dim, "center");

  /* the model: a stepper either side of the name, like the hardware's
     model button walking a row of LEDs */
  const btnW = 54;
  const m = st.model % MODELS.length;
  g.fillStyle = C.btn; rr(g, L.pad, L.modY, btnW, L.modH, 10); g.fill();
  label(g, "◀", L.pad + btnW / 2, L.modY + L.modH / 2, 26, C.dim, "center");
  g.fillStyle = C.btn; rr(g, L.pad + btnW + 12, L.modY, btnW, L.modH, 10); g.fill();
  label(g, "▶", L.pad + btnW + 12 + btnW / 2, L.modY + L.modH / 2, 26, C.dim, "center");
  const tx = L.pad + btnW * 2 + 44;
  label(g, MODELS[m].name, tx, L.modY + L.modH / 2 - 12, 30, MODEL_COLOR(m));
  label(g, `${MODELS[m].note} · model ${m + 1} of 6`, tx, L.modY + L.modH / 2 + 20, 16, C.dim);
  // six pips, so you can see where you are in the row without counting
  for (let i = 0; i < MODELS.length; i++) {
    g.fillStyle = i === m ? MODEL_COLOR(i) : "#2b3745";
    g.beginPath(); g.arc(W - L.pad - 18 - (5 - i) * 22, L.modY + L.modH / 2, i === m ? 7 : 4.5, 0, Math.PI * 2);
    g.fill();
  }

  /* the four knobs, in hardware order */
  const r = 46;
  let x = L.pad + 92;
  for (const k of KNOBS) {
    drawKnob(g, x, L.knobY, r, clamp01(st[k.key]), C.cool, k.label,
             String(Math.round(st[k.key] * 100)));
    x += 232;
  }

  /* the strip */
  g.fillStyle = C.head;
  g.fillRect(0, L.stripTop, W, H - L.stripTop);
  g.fillStyle = C.line;
  g.fillRect(0, L.stripTop, W, 2);
  for (let i = 0; i < ROW.length; i++) {
    const rc = L.cell(i, ROW.length);
    g.fillStyle = C.btn;
    rr(g, rc.x, rc.y, rc.w, rc.h, 10); g.fill();
    label(g, ROW[i].label, rc.x + rc.w / 2, rc.y + 17, 15, C.dim, "center");
    label(g, valueOf(st, ROW[i].key), rc.x + rc.w / 2, rc.y + 42, 22, C.text, "center");
    if (ROW[i].key === "polyphony")
      label(g, POLY_NOTE[st.polyphony] || "", rc.x + rc.w - 18, rc.y + rc.h / 2 + 2, 15, C.dim, "right");
  }
  /* Nothing is patched into the module's input, so Rings supplies its own
     pluck — the earlier wording here said the strings fed the resonator,
     which is not what the wrapper does. */
  label(g, "play the guitar with this up — every fret plucks the resonator",
        L.pad, L.stripTop + L.rowH + 44, 15, C.dim);
}

/* ---------- hit test ---------- */

export function hit(u, v) {
  const px = u * W, py = (1 - v) * H, L = layout();
  if (py < L.headH) return px > W - L.pad - 44 ? { type: "close" } : { type: "none" };
  const btnW = 54;
  if (py >= L.modY && py <= L.modY + L.modH) {
    if (px >= L.pad && px <= L.pad + btnW) return { type: "model", d: -1 };
    if (px >= L.pad + btnW + 12 && px <= L.pad + btnW * 2 + 12) return { type: "model", d: 1 };
  }
  let x = L.pad + 92;
  for (const k of KNOBS) {
    if (Math.hypot(px - x, py - L.knobY) <= 46 + 20)
      return { type: "knob", key: k.key, frac: grabFrac(x, L.knobY, px, py) };
    x += 232;
  }
  for (let i = 0; i < ROW.length; i++) {
    const rc = L.cell(i, ROW.length);
    if (px >= rc.x && px <= rc.x + rc.w && py >= rc.y && py <= rc.y + rc.h)
      return { type: "cycle", key: ROW[i].key };
  }
  return { type: "none" };
}

export const SIZE = { w: W, h: H };

/* The centre of every control, in canvas pixels — the coordinates the
   drawing is written in. A test that has to guess where a button is isn't
   testing the button, it's testing the guess. */
export function centres() {
  const L = layout(), out = {}, btnW = 54;
  out.modelDown = [L.pad + btnW / 2, L.modY + L.modH / 2];
  out.modelUp = [L.pad + btnW + 12 + btnW / 2, L.modY + L.modH / 2];
  out.close = [W - L.pad - 22, L.headH / 2];
  let x = L.pad + 92;
  for (const k of KNOBS) { out[k.key] = [x, L.knobY]; x += 232; }
  for (let i = 0; i < ROW.length; i++) {
    const rc = L.cell(i, ROW.length);
    out[ROW[i].key] = [rc.x + rc.w / 2, rc.y + rc.h / 2];
  }
  return out;
}

export function cycle(st, key, dir = 1) {
  if (key === "model") st.model = (st.model + dir + MODELS.length) % MODELS.length;
  else if (key === "polyphony") {
    const i = POLY.indexOf(st.polyphony);
    st.polyphony = POLY[(i < 0 ? 0 : i + dir + POLY.length) % POLY.length];
  }
  return st;
}
export const knobFrac = (st, key) => clamp01(st[key]);
export function knobWrite(st, key, frac) { st[key] = clamp01(frac); return st[key]; }

/* ---------- the thing you hang by the guitar ---------- */

export function makePanel() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const PW = 0.82, PH = PW * (H / W);
  const group = new THREE.Group();

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(PW + 0.03, PH + 0.03, 0.014),
    new THREE.MeshBasicMaterial({ color: 0x080b0f }));
  shell.position.z = -0.009;
  group.add(shell);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PH),
    new THREE.MeshBasicMaterial({ map: tex }));
  screen.userData.ringsPanel = true;
  group.add(screen);
  group.visible = false;

  let dirty = true;
  return {
    group, screen, width: PW, height: PH,
    markDirty() { dirty = true; },
    render(st, liveFn) {
      if (!dirty || !group.visible) return;
      dirty = false;
      draw(g, st, typeof liveFn === "function" ? liveFn() : liveFn);
      tex.needsUpdate = true;
    },
  };
}
