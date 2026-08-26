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
import { C, rr, label, drawKnob, knobReach, grabFrac, clamp01,
         OCTAVE_RANGE, OCT_BTN, stepOctave as kitStepOctave,
         drawOctave, hitOctave, octaveCentres,
         drawStepper, hitStepper, stepperCentres } from "./panel-kit.js";

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
  /* Octave shift, in whole octaves. The panel has no FREQUENCY knob because
     the pitch comes from the fretboard — but a fretboard fixed in one octave
     is a resonator you can only hear one register of, and the low models
     (MODAL, STRING) are a different instrument two octaves down. */
  octave: 0,
};
export { OCTAVE_RANGE };

export function loadState() {
  let st = { ...DEFAULTS };
  try { st = { ...st, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) {}
  return st;
}
export function saveState(st) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
}

/* ---------- drawing ---------- */

/* ---------- three shapes of the same panel ----------
   Same reasoning as the Plaits panel next door (synth-panel.js has the long
   version): a landscape canvas drawn to fit a phone puts a knob at 31 css px
   in portrait and pushes the top of the panel off the screen entirely in
   landscape. So there are three layouts and one drawing, and layout(mode) is
   the only place any of the geometry lives. */
const SHEETS = {
  wide:  { W: 1024, H: 560 },
  tall:  { W: 720,  H: 1054 },
  short: { W: 1500, H: 450 },
};
export const MODES_AVAILABLE = Object.keys(SHEETS);
export const sizeOf = (mode = "wide") => ({ w: (SHEETS[mode] || SHEETS.wide).W,
                                            h: (SHEETS[mode] || SHEETS.wide).H });

const HINT = "play the guitar with this up — every fret plucks the resonator";

function layout(mode = "wide") {
  const M = SHEETS[mode] ? mode : "wide";
  const { W, H } = SHEETS[M];
  let pad, headH, headFs, subFs, mod, knobs, stripTop, cellBtn, poly, oct, hint, pips;

  if (M === "tall") {
    /* A PHONE HELD UPRIGHT. Two knobs across instead of four, so each one
       gets a quarter of the canvas rather than an eighth. */
    pad = 24; headH = 76; headFs = 34; subFs = 19;
    mod = { x: pad, y: headH + 18, w: W - pad * 2, h: 108, btnW: 92, gap: 16,
            nameFs: 32, noteFs: 18, glyphFs: 44, capFs: 14 };
    pips = false;               // the "model 3 of 6" line already says it
    const r = 74, reach = knobReach(r), inner = W - pad * 2;
    const cy = [mod.y + mod.h + reach.up + 14];
    cy.push(cy[0] + reach.down + reach.up + 14);
    knobs = KNOBS.map((k, i) => ({ x: pad + (inner / 2) * ((i % 2) + 0.5),
                                   y: cy[Math.floor(i / 2)], r }));
    stripTop = cy[1] + reach.down + 24;
    const rowH = 78, gap = 12, top = stripTop + 18;
    cellBtn = 78;
    poly = { x: pad, y: top, w: W - pad * 2, h: rowH };
    oct = { x: pad, y: top + rowH + gap, w: W - pad * 2, h: rowH };
    hint = { x: pad, y: oct.y + rowH + 26, fs: 17 };
  } else if (M === "short") {
    /* A PHONE ON ITS SIDE. Height is the scarce thing at 844x390, so the
       model block and the knobs share the left column and the two steppers
       stack down the right. */
    pad = 22; headH = 54; headFs = 26; subFs = 16;
    const rightW = 460, colGap = 26;
    const leftW = W - pad * 2 - colGap - rightW;
    mod = { x: pad, y: headH + 12, w: leftW, h: 74, btnW: 68, gap: 12,
            nameFs: 25, noteFs: 15, glyphFs: 34, capFs: 12 };
    pips = true;
    /* Bigger than the Plaits panel's 62 because there are four knobs here
       and five there, and the right column only has two cells to the other's
       nine — this panel simply has fewer things in it, and sizing them to a
       sibling's grid left a hole under the OCTAVE row you could park a car
       in. The two steppers are near-double height for the same reason. */
    const r = 70, reach = knobReach(r);
    const cy = mod.y + mod.h + reach.up + 10;
    knobs = KNOBS.map((k, i) => ({ x: pad + (leftW / KNOBS.length) * (i + 0.5), y: cy, r }));
    stripTop = null;
    const rx = W - pad - rightW, rowH = 130, gap = 18, top = headH + 22;
    cellBtn = 84;
    poly = { x: rx, y: top, w: rightW, h: rowH };
    oct = { x: rx, y: top + rowH + gap, w: rightW, h: rowH };
    hint = { x: pad, y: cy + reach.down + 18, fs: 16 };
  } else {
    /* THE WIDE ONE — the panel over the headstock. Hand-tuned; the mode split
       exists so a phone stops forcing changes to these numbers. */
    pad = 26; headH = 56; headFs = 26; subFs = 16;
    mod = { x: pad, y: headH + 16, w: W - pad * 2, h: 92, btnW: 76, gap: 14,
            nameFs: 27, noteFs: 15, glyphFs: 38, capFs: 12 };
    pips = true;
    const r = 42, reach = knobReach(r);
    const cy = mod.y + mod.h + 64 + reach.up - 26;
    knobs = KNOBS.map((k, i) => ({ x: pad + (W - pad * 2) / KNOBS.length * (i + 0.5), y: cy, r }));
    stripTop = cy + reach.down + 36;
    const rowH = 62, gap = 12, top = stripTop + 20;
    cellBtn = 58;
    const cellW = (W - pad * 2 - gap) / 2;
    poly = { x: pad, y: top, w: cellW, h: rowH };
    oct = { x: pad + cellW + gap, y: top, w: cellW, h: rowH };
    hint = { x: pad, y: top + rowH + 36, fs: 15 };
  }
  return { mode: M, W, H, pad, headH, headFs, subFs, mod, knobs, stripTop,
           cellBtn, poly, oct, hint, pips };
}

const valueOf = (st) => `${st.polyphony} voice${st.polyphony === 1 ? "" : "s"}`;

export function draw(g, st, live = null, mode = "wide") {
  const L = layout(mode), { W, H } = L;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  /* header */
  g.fillStyle = C.head;
  g.fillRect(0, 0, W, L.headH);
  g.fillStyle = C.line;
  g.fillRect(0, L.headH - 2, W, 2);
  label(g, "RINGS", L.pad, L.headH / 2, L.headFs, C.cool);
  label(g, live && live.status === "loading" ? "loading…"
        : live && live.status === "failed" ? "wasm failed — running the plain string"
        : "resonator", L.pad + L.headFs * 4.3, L.headH / 2 + 1, L.subFs, C.dim);
  const cw = Math.round(L.headH * 0.79);
  g.fillStyle = C.btn;
  rr(g, W - L.pad - cw, 10, cw, L.headH - 20, 8); g.fill();
  label(g, "✕", W - L.pad - cw / 2, L.headH / 2, Math.round(L.headH * 0.39), C.dim, "center");

  /* the model: a stepper either side of the name, like the hardware's
     model button walking a row of LEDs */
  const D = L.mod, m = st.model % MODELS.length;
  for (const [i, glyph] of [[0, "◀"], [1, "▶"]]) {
    const bx = D.x + i * (D.btnW + D.gap);
    g.fillStyle = C.btn; rr(g, bx, D.y, D.btnW, D.h, 14); g.fill();
    g.strokeStyle = C.line; g.lineWidth = 2;
    rr(g, bx + 1, D.y + 1, D.btnW - 2, D.h - 2, 13); g.stroke();
    label(g, glyph, bx + D.btnW / 2, D.y + D.h / 2 - 6, D.glyphFs, C.text, "center");
    label(g, "MODEL", bx + D.btnW / 2, D.y + D.h - D.capFs - 5, D.capFs, C.dim, "center");
  }
  const tx = D.x + D.btnW * 2 + D.gap + 40;
  label(g, MODELS[m].name, tx, D.y + D.h / 2 - D.nameFs * 0.42, D.nameFs, MODEL_COLOR(m));
  label(g, `${MODELS[m].note} · model ${m + 1} of 6`,
        tx, D.y + D.h / 2 + D.noteFs * 1.1, D.noteFs, C.dim);
  // six pips, so you can see where you are in the row without counting
  if (L.pips) {
    for (let i = 0; i < MODELS.length; i++) {
      g.fillStyle = i === m ? MODEL_COLOR(i) : "#2b3745";
      g.beginPath();
      g.arc(W - L.pad - 18 - (5 - i) * 22, D.y + D.h / 2, i === m ? 7 : 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  /* the four knobs, in hardware order */
  KNOBS.forEach((k, i) => {
    const q = L.knobs[i];
    drawKnob(g, q.x, q.y, q.r, clamp01(st[k.key]), C.cool, k.label,
             String(Math.round(st[k.key] * 100)));
  });

  /* the strip */
  if (L.stripTop != null) {
    g.fillStyle = C.head;
    g.fillRect(0, L.stripTop, W, H - L.stripTop);
    g.fillStyle = C.line;
    g.fillRect(0, L.stripTop, W, 2);
  }
  drawStepper(g, L.poly, "POLYPHONY", valueOf(st), {
    btnW: L.cellBtn,
    loOff: st.polyphony <= POLY[0],
    hiOff: st.polyphony >= POLY[POLY.length - 1],
  });
  drawOctave(g, L.oct, st.octave | 0);
  /* Nothing is patched into the module's input, so Rings supplies its own
     pluck — an earlier wording here said the strings fed the resonator,
     which is not what the wrapper does. */
  label(g, HINT, L.hint.x, L.hint.y, L.hint.fs, C.dim);
}

/* ---------- hit test ---------- */

export function hit(u, v, mode = "wide") {
  const L = layout(mode), { W, H } = L;
  const px = u * W, py = (1 - v) * H;
  if (py < L.headH)
    return px > W - L.pad - Math.round(L.headH * 0.79) ? { type: "close" } : { type: "none" };
  const D = L.mod;
  if (py >= D.y && py <= D.y + D.h) {
    if (px >= D.x && px <= D.x + D.btnW) return { type: "model", d: -1 };
    const up = D.x + D.btnW + D.gap;
    if (px >= up && px <= up + D.btnW) return { type: "model", d: 1 };
  }
  for (let i = 0; i < KNOBS.length; i++) {
    const q = L.knobs[i];
    if (Math.hypot(px - q.x, py - q.y) <= q.r + 20)
      return { type: "knob", key: KNOBS[i].key, frac: grabFrac(q.x, q.y, px, py) };
  }
  const r = L.poly;
  if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
    const d = hitStepper(px, py, r, L.cellBtn);
    return d ? { type: "cycle", key: "polyphony", d } : { type: "none" };
  }
  const oh = hitOctave(px, py, L.oct);
  if (oh) return oh;
  return { type: "none" };
}

export const SIZE = sizeOf("wide");

/* The centre of every control, in canvas pixels — the coordinates the
   drawing is written in. A test that has to guess where a button is isn't
   testing the button, it's testing the guess. */
export function centres(mode = "wide") {
  const L = layout(mode), out = {}, D = L.mod;
  out.modelDown = [D.x + D.btnW / 2, D.y + D.h / 2];
  out.modelUp = [D.x + D.btnW + D.gap + D.btnW / 2, D.y + D.h / 2];
  out.close = [L.W - L.pad - Math.round(L.headH * 0.79) / 2, L.headH / 2];
  KNOBS.forEach((k, i) => { out[k.key] = [L.knobs[i].x, L.knobs[i].y]; });
  const c = stepperCentres(L.poly, L.cellBtn);
  out.polyphony = [L.poly.x + L.poly.w / 2, L.poly.y + L.poly.h / 2];
  out.polyphonyDown = c.down;
  out.polyphonyUp = c.up;
  Object.assign(out, octaveCentres(L.oct));
  return out;
}

export const stepOctave = kitStepOctave;
export function cycle(st, key, dir = 1) {
  if (key === "model") st.model = (st.model + dir + MODELS.length) % MODELS.length;
  else if (key === "polyphony") {
    const i = Math.max(0, POLY.indexOf(st.polyphony));
    st.polyphony = POLY[Math.max(0, Math.min(POLY.length - 1, i + dir))];
  }
  return st;
}
export const knobFrac = (st, key) => clamp01(st[key]);
export function knobWrite(st, key, frac) { st[key] = clamp01(frac); return st[key]; }

/* ---------- the thing you hang by the guitar ---------- */

export function makePanel() {
  // the one in the room is always the wide layout — a phone's shapes are the
  // screen-locked sheet's business, not the guitar's
  const { w: W, h: H } = sizeOf("wide");
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
