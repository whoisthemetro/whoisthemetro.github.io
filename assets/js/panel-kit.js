/* ============================================================
   THE BEDROOM — the bits every module panel is drawn with

   There are two of these panels now: PLAITS over the keyboard and RINGS
   by the guitar. They are two faces of the same idea — a Mutable module
   with its real parameters, on a canvas, hung in the room — and they
   have to LOOK like the same thing, because they are the same thing.

   Two copies of a knob is how they stop looking alike: somebody tunes
   the sweep on one and the other quietly disagrees, and now the room has
   two visual languages for one concept. One copy, and they can't drift.

   What is NOT here is layout. Where a knob sits belongs to the panel
   that owns it, and a shared layout is how you end up with a Rings panel
   shaped like a Plaits panel for no reason other than that it was easier.
   ============================================================ */

// the studio's palette, which is where both panels came from
export const C = {
  bg: "#11151b", head: "#1a212b", line: "rgba(126,200,255,0.22)",
  text: "#e8eef6", dim: "#8ea2b8", cool: "#7ec8ff", hot: "#ff9d5c",
  btn: "#1e2732", btnOn: "#2b4a63",
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));

// a rounded rect, as a path — callers fill or stroke it
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function label(g, t, x, y, size, color, align = "left",
                     font = "ui-monospace, Menlo, monospace") {
  g.fillStyle = color;
  g.font = `${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(t, x, y);
}

/* One rotary, everywhere: a 270° sweep from 7:30 round to 4:30, which is
   what a Eurorack knob does and what the studio's panels already drew. */
export function drawKnob(g, cx, cy, rad, frac, color, lbl, val) {
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
  g.beginPath();
  g.moveTo(cx + Math.cos(a) * rad * 0.35, cy + Math.sin(a) * rad * 0.35);
  g.lineTo(cx + Math.cos(a) * rad * 0.86, cy + Math.sin(a) * rad * 0.86);
  g.stroke();
  g.lineCap = "butt";
  label(g, lbl, cx, cy + rad + 24, 16, C.dim, "center");
  if (val != null) label(g, val, cx, cy - rad - 16, 16, C.cool, "center");
}

/* ---------- the octave stepper ----------
   Both module panels have one now, and they are the same control doing the
   same job: a minus, a number, a plus. It lives here so the second one
   couldn't be drawn a different size from the first — the whole reason this
   file exists. Neither panel has a FREQUENCY knob, because on both the pitch
   comes from the thing you play; this is the transpose that a fixed keybed
   or a fixed fretboard otherwise leaves you without. */
export const OCTAVE_RANGE = [-3, 2];
export const OCT_BTN = 78;

export function stepOctave(st, d) {
  st.octave = Math.max(OCTAVE_RANGE[0], Math.min(OCTAVE_RANGE[1], (st.octave | 0) + d));
  return st.octave;
}

/* A STEPPER CELL: a minus at the left edge, a plus at the right, the label
   on top and the value between them.

   Almost every setting on both panels is one of these now. They used to be
   CYCLE cells — tap anywhere and it advances — which is fine for a two-state
   toggle and wrong for everything else: going back one scale meant tapping
   forward through five, and there is no way to discover that a tap even
   does anything. Only the true toggles (ARP, HOLD) stay taps, because a
   minus and a plus on an on/off is two buttons doing one job.

   r is {x, y, w, h} — the whole cell, buttons included. */
export function drawStepper(g, r, title, valueText, opts = {}) {
  const bw = opts.btnW || OCT_BTN;
  const hot = opts.hot;
  /* The whole cell gets a body FIRST. Without it the buttons floated on the
     strip, and since a minus sits at one cell's left edge and a plus at the
     previous cell's right edge, two neighbours read as one run of four
     buttons — you couldn't tell which pair belonged to which word. */
  g.fillStyle = "#161d26";
  rr(g, r.x, r.y, r.w, r.h, 10); g.fill();
  g.strokeStyle = "rgba(126,200,255,0.10)"; g.lineWidth = 1.5;
  rr(g, r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, 9); g.stroke();

  for (const [i, glyph, off] of [[0, "\u2212", opts.loOff], [1, "+", opts.hiOff]]) {
    const bx = i === 0 ? r.x : r.x + r.w - bw;
    g.fillStyle = C.btn; rr(g, bx, r.y, bw, r.h, 10); g.fill();
    label(g, glyph, bx + bw / 2, r.y + r.h / 2 + 1, Math.min(34, r.h * 0.55),
          off ? "#3b4048" : C.text, "center");
  }
  label(g, title, r.x + r.w / 2, r.y + 17, 14, C.dim, "center");

  /* Fit the value to the gap BETWEEN the buttons. "CHROMATIC" and "AS
     PLAYED" are long enough to run under them at a fixed size, and a value
     you can't read is worse than a small one. */
  const room = r.w - bw * 2 - 12;
  let size = opts.valueSize || 21;
  g.font = `${size}px ui-monospace, Menlo, monospace`;
  while (size > 11 && g.measureText(valueText).width > room) {
    size -= 1;
    g.font = `${size}px ui-monospace, Menlo, monospace`;
  }
  label(g, valueText, r.x + r.w / 2, r.y + 43, size, hot ? C.hot : C.text, "center");
}

export function hitStepper(px, py, r, btnW) {
  const bw = btnW || OCT_BTN;
  if (py < r.y || py > r.y + r.h || px < r.x || px > r.x + r.w) return null;
  if (px <= r.x + bw) return -1;
  if (px >= r.x + r.w - bw) return 1;
  return 0;                       // the middle: a label, not a control
}

export const stepperCentres = (r, btnW) => {
  const bw = btnW || OCT_BTN;
  return { down: [r.x + bw / 2, r.y + r.h / 2], up: [r.x + r.w - bw / 2, r.y + r.h / 2] };
};

// the octave stepper is just a stepper that knows its own limits
export function drawOctave(g, r, octave, title = "OCTAVE") {
  drawStepper(g, r, title, octave > 0 ? `+${octave}` : String(octave), {
    loOff: octave <= OCTAVE_RANGE[0], hiOff: octave >= OCTAVE_RANGE[1],
    hot: !!octave, valueSize: 24,
  });
}

export function hitOctave(px, py, r) {
  const d = hitStepper(px, py, r);
  return d ? { type: "octave", d } : null;
}

export const octaveCentres = (r) => {
  const c = stepperCentres(r);
  return { octaveDown: c.down, octaveUp: c.up };
};

/* Where a grab on the knob face lands, as 0..1 around the same sweep.
   A mouse ignores this — knobs are grabbed and turned, and a tap that
   teleported a value would fire every time you clicked to look away — but
   a touch screen has no drag to offer and neither does a headset trigger,
   so on both of those this IS the gesture. */
export function grabFrac(cx, cy, px, py) {
  let a = Math.atan2(py - cy, px - cx);
  if (a < Math.PI * 0.75 && a > -Math.PI) a += Math.PI * 2;
  return clamp01((a - Math.PI * 0.75) / (Math.PI * 1.5));
}
