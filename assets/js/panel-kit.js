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

// r is {x, y, w, h} — the whole stepper, buttons included
export function drawOctave(g, r, octave, title = "OCTAVE") {
  const lo = octave <= OCTAVE_RANGE[0], hi = octave >= OCTAVE_RANGE[1];
  for (const [i, glyph, off] of [[0, "\u2212", lo], [1, "+", hi]]) {
    const bx = i === 0 ? r.x : r.x + r.w - OCT_BTN;
    g.fillStyle = C.btn; rr(g, bx, r.y, OCT_BTN, r.h, 10); g.fill();
    label(g, glyph, bx + OCT_BTN / 2, r.y + r.h / 2, 34, off ? "#3b4048" : C.text, "center");
  }
  label(g, title, r.x + r.w / 2, r.y + 17, 15, C.dim, "center");
  label(g, octave > 0 ? `+${octave}` : String(octave),
        r.x + r.w / 2, r.y + 44, 24, octave ? C.hot : C.text, "center");
}

export function hitOctave(px, py, r) {
  if (py < r.y || py > r.y + r.h) return null;
  if (px >= r.x && px <= r.x + OCT_BTN) return { type: "octave", d: -1 };
  if (px >= r.x + r.w - OCT_BTN && px <= r.x + r.w) return { type: "octave", d: 1 };
  return null;
}

export const octaveCentres = (r) => ({
  octaveDown: [r.x + OCT_BTN / 2, r.y + r.h / 2],
  octaveUp: [r.x + r.w - OCT_BTN / 2, r.y + r.h / 2],
});

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
