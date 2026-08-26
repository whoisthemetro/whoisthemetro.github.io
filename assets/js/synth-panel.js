/* ============================================================
   THE BEDROOM — the synth panel

   The MIDI controller under the desk used to be a switch with five
   sounds behind it. This is what it turns into when you press the
   button on its left cheek: Plaits, Émilie Gillet's macro-oscillator,
   with the parameters that actually shape it — the same twenty-four
   engines and the same five knobs the studio has — floating over the
   keybed on a panel you can reach.

   Two decisions worth writing down.

   IT IS IN THE WORLD, NOT IN THE DOM. A DOM overlay would have taken
   the pointer, which means the moment the parameters were up the
   keyboard underneath them would have stopped being playable — and
   being able to play while you turn a knob is the entire point of
   asking for it. It's also invisible in a headset (see CLAUDE.md), and
   this room has a rule about that. A canvas on a plane is clicked with
   the same crosshair and the same laser as everything else here, so
   the keys keep working the whole time it's up.

   IT HANGS OFF THE KEYBOARD, NOT OFF THE ROOM. `midiKeys` is a movable:
   the layout editor can pick the whole instrument up and put it
   somewhere else. A panel pinned to world coordinates would have been
   left behind the first time that happened.

   The drawing is deliberately the studio's — same knob sweep, same
   bank colours, same engine names — because it IS the same module, and
   two different-looking front panels for one oscillator is a lie about
   the room.
   ============================================================ */

import * as THREE from "three";
import { C, rr, label, drawKnob, knobReach, grabFrac, clamp01,
         OCTAVE_RANGE, stepOctave, drawOctave, hitOctave, octaveCentres,
         drawStepper, hitStepper, stepperCentres } from "./panel-kit.js";

/* ---------- the module, as it ships ---------- */

// hardware order: three banks of eight, and the LED's colour is the bank
export const ENGINES = [
  "VA VCF", "PHASE DIST", "6-OP FM 1", "6-OP FM 2", "6-OP FM 3", "WAVE TERRAIN", "STRING MACH", "CHIPTUNE",
  "VIRT ANALOG", "WAVESHAPER", "2-OP FM", "GRANULAR", "ADDITIVE", "WAVETABLE", "CHORD", "SPEECH",
  "SWARM", "FILT NOISE", "PARTICLE", "STRING", "MODAL", "BASS DRUM", "SNARE", "HI-HAT",
];
const BANK_COLOR = ["#ffd76a", "#7dffa8", "#ff7d6a"];

/* All five the same size and evenly spaced. Three of them used to be `big`
   (radius 46, advancing 200) and two small (36, advancing 168), which is how
   the real module is laid out and reads as a mistake on a flat panel: the
   row wasn't level, DECAY and LPG were visibly smaller than their
   neighbours, and the run didn't reach the right edge. */
const KNOBS = [
  { key: "harm",   label: "HARMONICS" },
  { key: "timbre", label: "TIMBRE" },
  { key: "morph",  label: "MORPH" },
  { key: "decay",  label: "DECAY" },
  { key: "lpg",    label: "LPG" },
];
const KNOB_R = 42;

/* ---------- the arpeggiator ----------
   Scales are the same four the studio knows plus chromatic, and they do
   double duty: a scale re-maps the KEYBED as well as the arp, so the
   fifteen keys under your hands play that scale instead of always C
   major. One setting, one meaning — picking "minor" and then finding
   the keyboard still in major would be the surprising thing. */
export const SCALES = {
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues:      [0, 3, 5, 6, 7, 10],
};
export const SCALE_NAMES = Object.keys(SCALES);
export const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// note division → how many steps in a bar of 4/4. triplets are the odd ones.
export const RATES = [
  { label: "1/4", per: 1 }, { label: "1/8", per: 2 }, { label: "1/8T", per: 3 },
  { label: "1/16", per: 4 }, { label: "1/16T", per: 6 },
];
export const MODES = ["UP", "DOWN", "UP-DN", "RANDOM", "AS PLAYED"];

/* key index (0..14 on the keybed) → semitone above C4, through the scale.
   The keybed is fifteen keys, so a five-note scale reaches three octaves
   and a chromatic one reaches barely more than one — which is exactly
   what those scales mean, and exactly what a hardware synth does. */
export function keyToSemi(i, scaleName = "major", root = 0) {
  const s = SCALES[scaleName] || SCALES.major;
  const n = Math.max(0, Math.min(14, i | 0));
  const oct = Math.floor(n / s.length);
  return root + oct * 12 + s[n % s.length];
}

/* ---------- state ---------- */

const KEY = "metro.plaits";
const DEFAULTS = {
  engine: 8,                 // VIRT ANALOG — the friendliest of the twenty-four
  harm: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.4,
  arp: false, hold: false, mode: 0, rate: 1, octaves: 2,
  scale: "major", root: 0, bpm: 112,
  /* Transpose, in whole octaves — NOT the same thing as `octaves`, which is
     how many the arp stacks. The keybed is fifteen keys starting at middle C
     and there is no FREQUENCY knob, because the pitch comes from the keys;
     this is what lets those fifteen keys be a bass or a lead. Labelled
     OCTAVE against the arp's ARP OCT so the two can't be confused. */
  octave: 0,
};
export { OCTAVE_RANGE, stepOctave };

export function loadState() {
  let st = { ...DEFAULTS };
  try { st = { ...st, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) {}
  if (!SCALES[st.scale]) st.scale = DEFAULTS.scale;
  st.arp = false; st.hold = false;      // never restored — see saveState
  return st;
}
export function saveState(st) {
  /* ARP and HOLD are not saved. They are performance state, not a preset:
     coming back tomorrow to find an arpeggiator already running and a chord
     already latched is a room playing itself at you. Everything else — the
     engine, the knobs, the scale, the transpose — is a sound you chose and
     should still be there. */
  const { arp, hold, ...preset } = st;
  try { localStorage.setItem(KEY, JSON.stringify(preset)); } catch (e) {}
}

/* ---------- drawing ---------- */

/* The canvas the panel IN THE ROOM is drawn at. Each canvas is exactly as
   tall as its layout needs — never a round number, because a round number
   leaves a hand's width of empty panel under the last row and the whole
   thing reads as a dialog with something missing from it. The phone's two
   shapes live in SHEETS below; this pair is what makePanel hangs on the wall
   and what SIZE reports. */
const W = 1024, H = 560;

/* The palette, the rounded rect, the label and the knob all live in
   panel-kit.js now: this panel and the RINGS one by the guitar are two faces
   of the same idea and have to look like it. Two copies of a knob is how
   they stop looking alike. */

/* ---------- layout, in one place so draw and hit can't disagree ----------
   Every rectangle the panel has is computed here and read by both the
   painter and the hit test. Two copies of these numbers is how a button
   ends up looking like it's somewhere it isn't. */
/* ---------- three shapes of the same panel ----------

   A 1024x560 landscape canvas is right on a wall and wrong on a phone. Drawn
   to fit a 390 px screen it puts a knob at 31 css px — a control you aim at
   rather than turn — and it uses 37% of the screen to do it. Turn the phone
   and it's worse: the sheet became 672 px tall in a 390 px viewport, so the
   header, the engine block and every knob readout sat at a NEGATIVE y. That
   was the "squished" landscape; nothing was squished, two thirds of the panel
   was simply off the top of the screen.

   So the panel has three layouts and one drawing:

     wide   1024x560   the panel in the room, and any wide screen
     tall    720x1178  a phone held upright: knobs in a 3+2 grid, steppers
                       two to a row, so each control gets a share of the
                       WIDTH instead of a fifth of it
     short  1500x430   a phone on its side: two columns side by side, because
                       the screen is 844x390 and height is the scarce thing

   The trick that makes this cheap is that a control's size on screen is
   (its canvas size / the canvas WIDTH) x the css width. Making the canvas
   NARROWER makes everything on it bigger, and making it wider lets a knob
   grow without costing height. `tall` is 720 wide for the first reason and
   `short` is 1500 wide for the second: the same 62-radius knob is 69 css px
   on a landscape phone and would be 45 on the wide layout.

   layout(mode) is the single source for all of it — draw, hit and centres
   only ever read what it returns, so a mode can't be drawn somewhere its
   hit test isn't. */
const SHEETS = {
  wide:  { W: 1024, H: 560 },
  tall:  { W: 720,  H: 1190 },
  short: { W: 1500, H: 430 },
};
export const MODES_AVAILABLE = Object.keys(SHEETS);
export const sizeOf = (mode = "wide") => ({ w: SHEETS[mode] ? SHEETS[mode].W : SHEETS.wide.W,
                                            h: SHEETS[mode] ? SHEETS[mode].H : SHEETS.wide.H });

// the eight stepper cells, in the order each mode wants them
const CELL_SPECS = {
  arp:     { label: "ARP", toggle: true },
  hold:    { label: "HOLD", toggle: true },
  mode:    { label: "MODE" },
  rate:    { label: "RATE" },
  scale:   { label: "SCALE" },
  root:    { label: "ROOT" },
  octaves: { label: "ARP OCT" },
  bpm:     { label: "TEMPO" },
};
const CELL_ORDER = ["arp", "hold", "mode", "rate", "scale", "root", "octaves", "bpm"];

function layout(mode = "wide") {
  const M = SHEETS[mode] ? mode : "wide";
  const { W, H } = SHEETS[M];
  const grid = (x0, w, n, i, gap) => {
    const cw = (w - gap * (n - 1)) / n;
    return { x: x0 + i * (cw + gap), w: cw };
  };
  const cells = {};
  let pad, headH, headFs, subFs, eng, knobs, stripTop, cellBtn, oct, hint, chips;

  if (M === "tall") {
    /* A PHONE HELD UPRIGHT. Everything gets a bigger share of the width
       because there are fewer things across it: three knobs where the wide
       layout has five, two stepper cells where it has four. */
    pad = 24; headH = 76; headFs = 34; subFs = 19;
    const ebw = 76;
    eng = { x: pad, y: headH + 18, w: W - pad * 2, h: 104, btnW: ebw,
            colX: pad + ebw + 18, textX: pad + ebw + 18 + 30 + ebw + 26,
            nameFs: 32, subFs: 18, ledR: 8 };
    const r = 64, reach = knobReach(r), engBottom = eng.y + eng.h;
    // 3 across, then 2 centred under them — which is also how the hardware
    // groups them: the three macro controls, then the two envelope ones
    const rowCy = [engBottom + reach.up + 12];
    rowCy.push(rowCy[0] + reach.down + reach.up + 12);
    const inner = W - pad * 2;
    knobs = KNOBS.map((k, i) => (i < 3
      ? { x: pad + (inner / 3) * (i + 0.5), y: rowCy[0], r }
      : { x: pad + inner * ((i - 3 + 1) / 3), y: rowCy[1], r }));
    stripTop = rowCy[1] + reach.down + 24;
    const rowH = 74, gap = 10, top = stripTop + 16;
    cellBtn = 74;
    CELL_ORDER.forEach((key, i) => {
      const g0 = grid(pad, W - pad * 2, 2, i % 2, gap);
      cells[key] = { x: g0.x, y: top + Math.floor(i / 2) * (rowH + gap), w: g0.w, h: rowH };
    });
    oct = { x: pad, y: top + 4 * (rowH + gap), w: W - pad * 2, h: rowH };
    hint = { x: pad, y: oct.y + rowH + 22, w: W - pad * 2, fs: 17 };
    chips = false;              // no room beside the octave; the hint line says it
  } else if (M === "short") {
    /* A PHONE ON ITS SIDE. 844x390 — height is what runs out, so the panel
       becomes two columns and nothing stacks that doesn't have to. The canvas
       is deliberately WIDE (1500) so a 62-radius knob costs only 8% of the
       height while still landing at 69 css px. */
    pad = 22; headH = 54; headFs = 26; subFs = 16;
    const colGap = 26, rightW = 518;
    const leftW = W - pad * 2 - colGap - rightW;
    // 56, not 40: at this canvas width 40 lands as a 22 css px button, which
    // is under a thumb even when you aim for it
    const ebw = 56;
    eng = { x: pad, y: headH + 12, w: leftW, h: 66, btnW: ebw,
            colX: pad + ebw + 14, textX: pad + ebw + 14 + 30 + ebw + 22,
            nameFs: 25, subFs: 15, ledR: 6 };
    const r = 62, reach = knobReach(r);
    const cy = eng.y + eng.h + reach.up + 10;
    knobs = KNOBS.map((k, i) => ({ x: pad + (leftW / KNOBS.length) * (i + 0.5), y: cy, r }));
    stripTop = null;            // no full-width strip: the columns are the layout
    const rx = W - pad - rightW, rowH = 64, gap = 7, top = headH + 12;
    cellBtn = 62;
    CELL_ORDER.forEach((key, i) => {
      const g0 = grid(rx, rightW, 2, i % 2, gap);
      cells[key] = { x: g0.x, y: top + Math.floor(i / 2) * (rowH + gap), w: g0.w, h: rowH };
    });
    oct = { x: rx, y: top + 4 * (rowH + gap), w: rightW, h: rowH };
    hint = { x: pad, y: cy + reach.down + 26, w: leftW, fs: 16 };
    chips = false;
  } else {
    /* THE WIDE ONE — the panel in the room. These numbers are hand-tuned and
       every one of them cost a round of screenshots; the mode split exists so
       that a phone stops forcing changes to them. */
    pad = 26; headH = 56; headFs = 26; subFs = 16;
    const ebw = 46;
    eng = { x: pad, y: headH + 14, w: W - pad * 2, h: 76, btnW: ebw,
            colX: pad + ebw + 16, textX: pad + ebw + 16 + 30 + ebw + 30,
            nameFs: 27, subFs: 15, ledR: 6.5 };
    const r = 42, reach = knobReach(r);
    const cy = eng.y + eng.h + 76;
    knobs = KNOBS.map((k, i) => ({ x: pad + (W - pad * 2) / KNOBS.length * (i + 0.5), y: cy, r }));
    stripTop = cy + reach.down + 26;
    const rowH = 62, gap = 12, top = stripTop + 16;
    cellBtn = 58;
    CELL_ORDER.forEach((key, i) => {
      const g0 = grid(pad, W - pad * 2, 4, i % 4, gap);
      cells[key] = { x: g0.x, y: top + Math.floor(i / 4) * (rowH + gap), w: g0.w, h: rowH };
    });
    oct = { x: pad, y: top + 2 * (rowH + gap), w: 300, h: rowH };
    hint = { x: oct.x + oct.w + 26, y: oct.y + rowH / 2, w: W - oct.x - oct.w - 52, fs: 15 };
    chips = true;               // the held notes fit beside the octave stepper
  }
  return { mode: M, W, H, pad, headH, headFs, subFs, eng, knobs, stripTop,
           cells, cellBtn, oct, hint, chips };
}

function valueOf(st, key) {
  switch (key) {
    case "arp": return st.arp ? "ON" : "OFF";
    case "hold": return st.hold ? "ON" : "OFF";
    case "mode": return MODES[st.mode % MODES.length];
    case "rate": return RATES[st.rate % RATES.length].label;
    case "scale": return st.scale.toUpperCase();
    case "root": return ROOT_NAMES[((st.root % 12) + 12) % 12];
    case "octaves": return String(st.octaves);
    case "bpm": return String(Math.round(st.bpm));
    default: return "";
  }
}

function drawButton(g, r, key, st, live, cellBtn) {
  const b = CELL_SPECS[key];
  /* Everything that isn't a true on/off is a STEPPER: minus left, plus
     right, value between. Tap-to-cycle meant going back one scale was five
     taps forward, and nothing on the face said a tap did anything at all. */
  if (!b.toggle) {
    drawStepper(g, r, b.label, valueOf(st, key), { btnW: cellBtn });
    return;
  }
  const on = st[key];
  g.fillStyle = on ? C.btnOn : C.btn;
  rr(g, r.x, r.y, r.w, r.h, 10); g.fill();
  if (on) {
    g.strokeStyle = key === "arp" ? C.hot : C.cool;
    g.lineWidth = 2.5;
    rr(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 9); g.stroke();
  }
  // sized off the cell, so one drawing reads right in all three layouts
  const tf = Math.max(12, Math.round(r.h * 0.24));
  label(g, b.label, r.x + r.w / 2, r.y + tf * 1.2, tf, C.dim, "center");
  const col = on ? (key === "arp" ? C.hot : C.cool) : C.text;
  label(g, valueOf(st, key), r.x + r.w / 2, r.y + r.h * 0.68,
        Math.max(16, Math.round(r.h * 0.35)), col, "center");
  // the arp button doubles as the playhead: a bar under it ticking along
  if (key === "arp" && st.arp && live && live.total > 0) {
    const w = (r.w - 20) / live.total;
    g.fillStyle = "#3a2a20";
    g.fillRect(r.x + 10, r.y + r.h - 12, r.w - 20, 5);
    g.fillStyle = C.hot;
    g.fillRect(r.x + 10 + w * live.at, r.y + r.h - 12, Math.max(4, w - 2), 5);
  }
}

export function draw(ctx2d, st, live = null, mode = "wide") {
  const g = ctx2d, L = layout(mode), { W, H } = L;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  /* header */
  g.fillStyle = C.head;
  g.fillRect(0, 0, W, L.headH);
  g.fillStyle = C.line;
  g.fillRect(0, L.headH - 2, W, 2);
  label(g, "PLAITS", L.pad, L.headH / 2, L.headFs, C.cool);
  label(g, live && live.status === "loading" ? "loading…"
        : live && live.status === "failed" ? "wasm failed — running the fallback voice"
        : "macro oscillator", L.pad + L.headFs * 5, L.headH / 2 + 1, L.subFs, C.dim);
  // close box, top right — scaled with the header, so a phone's is thumb-sized
  const cw = Math.round(L.headH * 0.79), ch = L.headH - 20;
  g.fillStyle = C.btn;
  rr(g, W - L.pad - cw, 10, cw, ch, 8); g.fill();
  label(g, "✕", W - L.pad - cw / 2, L.headH / 2, Math.round(L.headH * 0.39), C.dim, "center");

  /* the engine: a button each side of the LED column, like the panel */
  const E = L.eng, eng = Math.max(0, Math.min(23, st.engine | 0));
  const bank = Math.floor(eng / 8), idx = eng % 8;
  g.fillStyle = C.btn; rr(g, E.x, E.y, E.btnW, E.h, 10); g.fill();
  label(g, "◀", E.x + E.btnW / 2, E.y + E.h / 2, Math.round(E.h * 0.32), C.dim, "center");
  g.fillStyle = "#161e28";
  rr(g, E.colX - 3, E.y, 22, E.h, 8); g.fill();
  for (let i = 0; i < 8; i++) {
    const on = i === idx;
    g.fillStyle = on ? BANK_COLOR[bank] : "#2b3745";
    g.beginPath();
    g.arc(E.colX + 8, E.y + 12 + i * ((E.h - 24) / 7), on ? E.ledR : E.ledR * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  const upX = E.colX + 30;
  g.fillStyle = C.btn; rr(g, upX, E.y, E.btnW, E.h, 10); g.fill();
  label(g, "▶", upX + E.btnW / 2, E.y + E.h / 2, Math.round(E.h * 0.32), C.dim, "center");
  label(g, ENGINES[eng], E.textX, E.y + E.h / 2 - E.nameFs * 0.4, E.nameFs, BANK_COLOR[bank]);
  label(g, `engine ${eng + 1} of 24 · bank ${bank + 1}`,
        E.textX, E.y + E.h / 2 + E.subFs * 1.15, E.subFs, C.dim);

  /* the knobs, in hardware order */
  KNOBS.forEach((k, i) => {
    const q = L.knobs[i];
    drawKnob(g, q.x, q.y, q.r, clamp01(st[k.key]), C.cool, k.label,
             String(Math.round(st[k.key] * 100)));
  });

  /* the arpeggiator */
  if (L.stripTop != null) {
    g.fillStyle = C.head;
    g.fillRect(0, L.stripTop, W, H - L.stripTop);
    g.fillStyle = C.line;
    g.fillRect(0, L.stripTop, W, 2);
  }
  for (const key of CELL_ORDER) drawButton(g, L.cells[key], key, st, live, L.cellBtn);
  drawOctave(g, L.oct, st.octave | 0);

  /* what's actually being held, so HOLD isn't a mystery */
  const held = live && live.held && live.held.length ? live.held : null;
  if (held && L.chips) {
    label(g, "HOLDING", L.hint.x, L.hint.y, L.hint.fs, C.dim);
    let hx = L.hint.x + 96;
    for (const semi of held) {
      const n = ROOT_NAMES[((semi % 12) + 12) % 12] + (4 + Math.floor(semi / 12));
      g.fillStyle = "#24313f";
      rr(g, hx, L.hint.y - 14, 58, 28, 6); g.fill();
      label(g, n, hx + 29, L.hint.y + 1, 16, C.cool, "center");
      hx += 66;
    }
  } else {
    const words = held
      ? `holding ${held.map(s => ROOT_NAMES[((s % 12) + 12) % 12]).join(" ")}`
      : st.arp ? "play a key to feed the arp — HOLD keeps the chord"
               : "the keys play whatever this panel says";
    label(g, words, L.hint.x, L.hint.y, L.hint.fs, C.dim);
  }
}

/* ---------- hit test ---------- */

// u,v are the raycast's texture coords. v is flipped: 0 is the BOTTOM of a
// three.js plane and the top of a canvas.
export function hit(u, v, mode = "wide") {
  const L = layout(mode), { W, H } = L;
  const px = u * W, py = (1 - v) * H;
  if (py < L.headH) {
    const cw = Math.round(L.headH * 0.79);
    if (px > W - L.pad - cw) return { type: "close" };
    return { type: "none" };
  }
  // engine steppers
  const E = L.eng;
  if (py >= E.y && py <= E.y + E.h) {
    if (px >= E.x && px <= E.x + E.btnW) return { type: "engine", d: -1 };
    if (px >= E.colX + 30 && px <= E.colX + 30 + E.btnW) return { type: "engine", d: 1 };
  }
  // knobs. `frac` is where on the sweep the hand landed — a mouse ignores
  // it (knobs are grabbed and turned, and a tap must not teleport a value)
  // but a touch screen has no drag to offer, so there it IS the gesture.
  for (let i = 0; i < KNOBS.length; i++) {
    const q = L.knobs[i];
    if (Math.hypot(px - q.x, py - q.y) <= q.r + 20)
      return { type: "knob", key: KNOBS[i].key, frac: grabFrac(q.x, q.y, px, py) };
  }
  for (const key of CELL_ORDER) {
    const r = L.cells[key];
    if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
    if (CELL_SPECS[key].toggle) return { type: "cycle", key };
    const d = hitStepper(px, py, r, L.cellBtn);
    // the middle of a stepper is a label, so a tap there does nothing
    return d ? { type: "cycle", key, d } : { type: "none" };
  }
  const oh = hitOctave(px, py, L.oct);
  if (oh) return oh;
  return { type: "none" };
}

export const SIZE = sizeOf("wide");

/* The centre of every control, in canvas pixels. Nothing in the room needs
   this — the hit test does the work — but a test that has to guess where a
   button is isn't testing the button, it's testing the guess. Ask here and
   the answer comes from the same layout() the painter used. */
export function centres(mode = "wide") {
  const L = layout(mode), out = {};
  out.engineDown = [L.eng.x + L.eng.btnW / 2, L.eng.y + L.eng.h / 2];
  out.engineUp = [L.eng.colX + 30 + L.eng.btnW / 2, L.eng.y + L.eng.h / 2];
  out.close = [L.W - L.pad - Math.round(L.headH * 0.79) / 2, L.headH / 2];
  KNOBS.forEach((k, i) => { out[k.key] = [L.knobs[i].x, L.knobs[i].y]; });
  for (const key of CELL_ORDER) {
    const r = L.cells[key];
    out[key] = [r.x + r.w / 2, r.y + r.h / 2];
    // a TOGGLE has no minus and no plus — the whole cell is the button. it
    // used to publish `arpUp`/`arpDown` anyway, coordinates for two controls
    // that have never been drawn, which is a map with roads on it that aren't
    // there. anything reading them got a plain toggle back and no direction.
    if (CELL_SPECS[key].toggle) continue;
    const c = stepperCentres(r, L.cellBtn);
    out[key + "Down"] = c.down;
    out[key + "Up"] = c.up;
  }
  Object.assign(out, octaveCentres(L.oct));
  return out;
}

/* what a tap on a cycling button does. Held apart from the drawing so the
   room can call it without owning a copy of the lists. */
export function cycle(st, key, dir = 1) {
  switch (key) {
    case "arp": st.arp = !st.arp; break;
    case "hold": st.hold = !st.hold; break;
    case "mode": st.mode = (st.mode + dir + MODES.length) % MODES.length; break;
    case "rate": st.rate = (st.rate + dir + RATES.length) % RATES.length; break;
    case "scale": {
      const i = SCALE_NAMES.indexOf(st.scale);
      st.scale = SCALE_NAMES[(i + dir + SCALE_NAMES.length) % SCALE_NAMES.length];
      break;
    }
    case "root": st.root = (st.root + dir + 12) % 12; break;
    // these two were forward-only, which is exactly the thing the steppers
    // were added to fix — a minus that silently went up isn't a minus
    case "octaves": st.octaves = Math.max(1, Math.min(3, st.octaves + dir)); break;
    case "bpm": st.bpm = Math.max(40, Math.min(200, Math.round(st.bpm) + dir * 2)); break;
  }
  return st;
}

// knobs are 0..1 except TEMPO, which is beats per minute
export const KNOB_RANGE = { bpm: [40, 200] };
export function knobRead(st, key) { return st[key]; }
export function knobWrite(st, key, frac) {
  const r = KNOB_RANGE[key];
  st[key] = r ? Math.round(r[0] + clamp01(frac) * (r[1] - r[0])) : clamp01(frac);
  return st[key];
}
export function knobFrac(st, key) {
  const r = KNOB_RANGE[key];
  return r ? (st[key] - r[0]) / (r[1] - r[0]) : clamp01(st[key]);
}

/* ---------- the thing you actually hang in the room ---------- */

export function makePanel() {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const PW = 0.88, PH = PW * (H / W);
  const group = new THREE.Group();

  // the shell: a dark slab a hair behind the screen, so the panel reads as
  // an object in the room instead of a decal floating in the air
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(PW + 0.03, PH + 0.03, 0.014),
    new THREE.MeshBasicMaterial({ color: 0x080b0f }));
  shell.position.z = -0.009;
  group.add(shell);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PH),
    new THREE.MeshBasicMaterial({ map: tex }));
  screen.userData.synthPanel = true;
  group.add(screen);

  group.visible = false;

  let dirty = true;
  return {
    group, screen, width: PW, height: PH,
    markDirty() { dirty = true; },
    /* Repainted from the world tick, and only when something moved — a
       canvas upload every frame for a panel nobody is looking at is the
       kind of cost that doesn't show up until it's everywhere.
       `liveFn` is a FUNCTION, not a value, so the caller doesn't rebuild
       the arp sequence sixty times a second to hand it to a paint that
       isn't going to happen. */
    render(st, liveFn) {
      if (!dirty || !group.visible) return;
      dirty = false;
      draw(g, st, typeof liveFn === "function" ? liveFn() : liveFn);
      tex.needsUpdate = true;
    },
  };
}
