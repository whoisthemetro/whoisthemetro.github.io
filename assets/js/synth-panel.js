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
import { C, rr, label, drawKnob, grabFrac, clamp01,
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

const KNOBS = [
  { key: "harm",   label: "HARMONICS", big: true },
  { key: "timbre", label: "TIMBRE",    big: true },
  { key: "morph",  label: "MORPH",     big: true },
  { key: "decay",  label: "DECAY" },
  { key: "lpg",    label: "LPG" },
];

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
  return st;
}
export function saveState(st) {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
}

/* ---------- drawing ---------- */

/* The canvas is exactly as tall as the layout below needs — 528, not a
   round number, because a round number left a hand's width of empty panel
   under the last row and the whole thing read as a dialog with something
   missing from it. If you add a row, this moves. */
/* The canvas is exactly as tall as the layout below needs — not a round
   number, because a round number left a hand's width of empty panel under
   the last row and the whole thing read as a dialog with something missing
   from it. If you add a row, this moves. */
const W = 1024, H = 566;

/* The palette, the rounded rect, the label and the knob all live in
   panel-kit.js now: this panel and the RINGS one by the guitar are two faces
   of the same idea and have to look like it. Two copies of a knob is how
   they stop looking alike. */

/* ---------- layout, in one place so draw and hit can't disagree ----------
   Every rectangle the panel has is computed here and read by both the
   painter and the hit test. Two copies of these numbers is how a button
   ends up looking like it's somewhere it isn't. */
function layout() {
  const pad = 26;
  const headH = 56;
  const engY = headH + 20, engH = 92;
  const knobY = engY + engH + 76;
  const stripTop = knobY + 78;
  const rowH = 62, gap = 12;
  const rowAY = stripTop + 16, rowBY = rowAY + rowH + gap;
  // a third row: the transpose stepper, with the held-note chips beside it
  const rowCY = rowBY + rowH + gap;
  const octW = 300;
  const oct = { x: pad, y: rowCY, w: octW, h: rowH };
  const cell = (n, i, y, count) => {
    const w = (W - pad * 2 - gap * (count - 1)) / count;
    return { x: pad + i * (w + gap), y, w, h: rowH };
  };
  return { pad, headH, engY, engH, knobY, stripTop, rowH, gap, rowAY, rowBY, rowCY, oct, cell };
}

// the two button rows. `key` is what the hit test hands back.
const ROW_A = [
  { key: "arp", label: "ARP", toggle: true },
  { key: "hold", label: "HOLD", toggle: true },
  { key: "mode", label: "MODE" },
  { key: "rate", label: "RATE" },
];
const ROW_B = [
  { key: "scale", label: "SCALE" },
  { key: "root", label: "ROOT" },
  { key: "octaves", label: "ARP OCT" },
  { key: "bpm", label: "TEMPO" },
];

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

// the −/+ buttons inside a row cell. narrower than the octave stepper's,
// because a row cell is 234 wide and two 78s would leave no room for a word
const CELL_BTN = 58;

function drawButton(g, r, b, st, live) {
  /* Everything that isn't a true on/off is a STEPPER: minus left, plus
     right, value between. Tap-to-cycle meant going back one scale was five
     taps forward, and nothing on the face said a tap did anything at all. */
  if (!b.toggle) {
    drawStepper(g, r, b.label, valueOf(st, b.key), { btnW: CELL_BTN, valueSize: 20 });
    return;
  }
  const on = b.toggle && st[b.key];
  g.fillStyle = on ? C.btnOn : C.btn;
  rr(g, r.x, r.y, r.w, r.h, 10); g.fill();
  if (on) {
    g.strokeStyle = b.key === "arp" ? C.hot : C.cool;
    g.lineWidth = 2.5;
    rr(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 9); g.stroke();
  }
  label(g, b.label, r.x + r.w / 2, r.y + 17, 15, C.dim, "center");
  const col = on ? (b.key === "arp" ? C.hot : C.cool) : C.text;
  label(g, valueOf(st, b.key), r.x + r.w / 2, r.y + 42, 22, col, "center");
  // the arp button doubles as the playhead: a bar under it ticking along
  if (b.key === "arp" && st.arp && live && live.total > 0) {
    const w = (r.w - 20) / live.total;
    g.fillStyle = "#3a2a20";
    g.fillRect(r.x + 10, r.y + r.h - 12, r.w - 20, 5);
    g.fillStyle = C.hot;
    g.fillRect(r.x + 10 + w * live.at, r.y + r.h - 12, Math.max(4, w - 2), 5);
  }
}

export function draw(ctx2d, st, live = null) {
  const g = ctx2d, L = layout();
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  /* header */
  g.fillStyle = C.head;
  g.fillRect(0, 0, W, L.headH);
  g.fillStyle = C.line;
  g.fillRect(0, L.headH - 2, W, 2);
  label(g, "PLAITS", L.pad, L.headH / 2, 26, C.cool);
  label(g, live && live.status === "loading" ? "loading…"
        : live && live.status === "failed" ? "wasm failed — running the fallback voice"
        : "macro oscillator", L.pad + 130, L.headH / 2 + 1, 16, C.dim);
  // close box, top right
  g.fillStyle = C.btn;
  rr(g, W - L.pad - 44, 10, 44, L.headH - 20, 8); g.fill();
  label(g, "✕", W - L.pad - 22, L.headH / 2, 22, C.dim, "center");

  /* the engine: a button each side of the LED column, like the panel */
  const btnW = 54, colX = L.pad + btnW + 18;
  const eng = Math.max(0, Math.min(23, st.engine | 0));
  const bank = Math.floor(eng / 8), idx = eng % 8;
  g.fillStyle = C.btn; rr(g, L.pad, L.engY, btnW, L.engH, 10); g.fill();
  label(g, "◀", L.pad + btnW / 2, L.engY + L.engH / 2, 26, C.dim, "center");
  g.fillStyle = "#161e28";
  rr(g, colX - 3, L.engY, 22, L.engH, 8); g.fill();
  for (let i = 0; i < 8; i++) {
    const on = i === idx;
    g.fillStyle = on ? BANK_COLOR[bank] : "#2b3745";
    g.beginPath(); g.arc(colX + 8, L.engY + 12 + i * ((L.engH - 24) / 7), on ? 6.5 : 4.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = C.btn; rr(g, colX + 30, L.engY, btnW, L.engH, 10); g.fill();
  label(g, "▶", colX + 30 + btnW / 2, L.engY + L.engH / 2, 26, C.dim, "center");
  label(g, ENGINES[eng], colX + 30 + btnW + 34, L.engY + L.engH / 2 - 12, 30, BANK_COLOR[bank]);
  label(g, `engine ${eng + 1} of 24 · bank ${bank + 1}`, colX + 30 + btnW + 34, L.engY + L.engH / 2 + 20, 16, C.dim);

  /* the knobs, in hardware order */
  const kr = 46, sr = 36;
  let x = L.pad + 74;
  for (const k of KNOBS) {
    const r = k.big ? kr : sr;
    drawKnob(g, x, L.knobY, r, clamp01(st[k.key]), C.cool, k.label,
             String(Math.round(st[k.key] * 100)));
    x += k.big ? 200 : 168;
  }

  /* the arpeggiator */
  g.fillStyle = C.head;
  g.fillRect(0, L.stripTop, W, H - L.stripTop);
  g.fillStyle = C.line;
  g.fillRect(0, L.stripTop, W, 2);
  for (let i = 0; i < ROW_A.length; i++) drawButton(g, L.cell(0, i, L.rowAY, ROW_A.length), ROW_A[i], st, live);
  for (let i = 0; i < ROW_B.length; i++) drawButton(g, L.cell(0, i, L.rowBY, ROW_B.length), ROW_B[i], st, live);
  drawOctave(g, L.oct, st.octave | 0);

  /* what's actually being held, so HOLD isn't a mystery */
  const y = L.rowCY + L.rowH / 2;
  if (live && live.held && live.held.length) {
    label(g, "HOLDING", L.oct.x + L.oct.w + 26, y, 15, C.dim);
    let hx = L.oct.x + L.oct.w + 122;
    for (const semi of live.held) {
      const n = ROOT_NAMES[((semi % 12) + 12) % 12] + (4 + Math.floor(semi / 12));
      g.fillStyle = "#24313f";
      rr(g, hx, y - 14, 58, 28, 6); g.fill();
      label(g, n, hx + 29, y + 1, 16, C.cool, "center");
      hx += 66;
    }
  } else {
    label(g, st.arp ? "play a key to feed the arp — HOLD keeps the chord"
                    : "the keys play whatever this panel says",
          L.oct.x + L.oct.w + 26, y, 15, C.dim);
  }
}

/* ---------- hit test ---------- */

// u,v are the raycast's texture coords. v is flipped: 0 is the BOTTOM of a
// three.js plane and the top of a canvas.
export function hit(u, v) {
  const px = u * W, py = (1 - v) * H, L = layout();
  if (py < L.headH) {
    if (px > W - L.pad - 44) return { type: "close" };
    return { type: "none" };
  }
  // engine steppers
  const btnW = 54, colX = L.pad + btnW + 18;
  if (py >= L.engY && py <= L.engY + L.engH) {
    if (px >= L.pad && px <= L.pad + btnW) return { type: "engine", d: -1 };
    if (px >= colX + 30 && px <= colX + 30 + btnW) return { type: "engine", d: 1 };
  }
  // knobs. `frac` is where on the sweep the hand landed — a mouse ignores
  // it (knobs are grabbed and turned, and a tap must not teleport a value)
  // but a touch screen has no drag to offer, so there it IS the gesture.
  const kr = 46, sr = 36;
  let x = L.pad + 74;
  for (const k of KNOBS) {
    const r = (k.big ? kr : sr) + 20;
    if (Math.hypot(px - x, py - L.knobY) <= r)
      return { type: "knob", key: k.key, frac: grabFrac(x, L.knobY, px, py) };
    x += k.big ? 200 : 168;
  }
  // the two button rows
  const rows = [[ROW_A, L.rowAY], [ROW_B, L.rowBY]];
  for (const [row, ry] of rows) {
    for (let i = 0; i < row.length; i++) {
      const b = row[i], r = L.cell(0, i, ry, row.length);
      if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      if (b.toggle) return { type: "cycle", key: b.key };
      const d = hitStepper(px, py, r, CELL_BTN);
      // the middle of a stepper is a label, so a tap there does nothing
      return d ? { type: "cycle", key: b.key, d } : { type: "none" };
    }
  }
  const oh = hitOctave(px, py, L.oct);
  if (oh) return oh;
  return { type: "none" };
}

export const SIZE = { w: W, h: H };

/* The centre of every control, in canvas pixels. Nothing in the room needs
   this — the hit test does the work — but a test that has to guess where a
   button is isn't testing the button, it's testing the guess. Ask here and
   the answer comes from the same layout() the painter used. */
export function centres() {
  const L = layout(), out = {};
  const btnW = 54, colX = L.pad + btnW + 18;
  out.engineDown = [L.pad + btnW / 2, L.engY + L.engH / 2];
  out.engineUp = [colX + 30 + btnW / 2, L.engY + L.engH / 2];
  out.close = [W - L.pad - 22, L.headH / 2];
  let x = L.pad + 74;
  for (const k of KNOBS) { out[k.key] = [x, L.knobY]; x += k.big ? 200 : 168; }
  for (const [row, ry] of [[ROW_A, L.rowAY], [ROW_B, L.rowBY]]) {
    for (let i = 0; i < row.length; i++) {
      const r = L.cell(0, i, ry, row.length);
      const c = stepperCentres(r, CELL_BTN);
      out[row[i].key] = [r.x + r.w / 2, r.y + r.h / 2];
      out[row[i].key + "Down"] = c.down;
      out[row[i].key + "Up"] = c.up;
    }
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
