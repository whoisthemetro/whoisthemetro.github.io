/* ============================================================
   THE BEDROOM — the module panels, as a sheet of glass

   PLAITS and RINGS both hang in the room on a canvas, which is right on
   a desktop and in a headset: you aim the crosshair or the laser, and
   the instrument underneath stays playable. On a phone it is the wrong
   shape entirely. A knob is 17 css pixels across at arm's length, it
   moves when you turn your head, and setting it means landing a tap on
   an exact point of a ring — which is the complaint that produced this
   file.

   So on touch the SAME panel is also drawn onto a canvas locked to the
   bottom of the screen. Not a second UI: the same `draw()`, the same
   `hit()`, the same layout in the same canvas pixels. One drawing, two
   surfaces. A second implementation would be two things to keep in step
   and they would stop being in step the first week.

   THE ONE THING THAT IS DIFFERENT is how a knob moves. In the room a
   tap sets it by where you land on the sweep, because a crosshair has
   no drag. Here a knob LATCHES and then follows your finger anywhere on
   the screen — a real drag, the way the desktop one works, which is the
   thing that was actually being asked for. Once it is latched the whole
   sheet is the drag surface, so your thumb leaving the knob doesn't
   drop the value.

   AND IT BRINGS THE INSTRUMENT WITH IT. The panel covers the desk, so
   the keyboard it belongs to is behind it and out of reach — a set of
   parameters for something you can no longer play. So the sheet draws
   its own keybed underneath: big keys, at the bottom of the screen where
   a thumb already is, feeding exactly the same synthPress() the wooden
   one in the room feeds.

   The in-world panel is HIDDEN while the sheet is up. An earlier version
   left it there on the theory that other people in the room should see
   what you're working on — which was simply wrong: panel visibility is
   never broadcast, so nobody has ever seen anyone else's. It was just the
   same panel drawn twice.
   ============================================================ */

const SHEET_ID = "panel-sheet";

/* How far a finger travels for the whole 270° sweep, in CSS pixels. 180 is
   about a thumb's reach on a phone held one-handed: short enough to get
   from 0 to 100 without re-gripping, long enough that you can still land a
   value in the middle. The in-world drag uses 320 because a mouse has a
   whole desk. */
const SWEEP_PX = 180;

/* How many keys the keybed shows: ONE OCTAVE of whatever scale the panel is
   in, C to C. It used to be a flat ten, which is a number with no musical
   meaning — in major it ran C D E F G A B C D E, so the row ended in the
   middle of the second octave and the two ends didn't rhyme. An octave is
   the shape a keyboard has, and it's what makes the OCTAVE stepper above
   read as a control rather than a mystery.

   The panel owns the count (`keys.count()` — the scale's degrees plus the
   upper tonic) so this file never learns what a scale is. Clamped because a
   phone can only spend so many pixels: chromatic is thirteen keys at ~30 css
   px, which is still a fingertip, and nothing here asks for more. */
const keyCount = (o) => Math.max(2, Math.min(15, o?.keys?.count?.() ?? 8));

export function createPanelSheet() {
  let host = null, canvas = null, ctx = null;
  let keysCv = null, keysCtx = null;
  let open = null;          // the panel spec while one is up
  let drag = null;          // { key, start, x0, y0, moved }
  let keyDown = -1;         // which key a finger is on, for the lit state

  function build() {
    host = document.createElement("div");
    host.id = SHEET_ID;
    canvas = document.createElement("canvas");
    host.appendChild(canvas);
    keysCv = document.createElement("canvas");
    keysCv.className = "sheet-keys";
    host.appendChild(keysCv);
    document.body.appendChild(host);
    ctx = canvas.getContext("2d");
    keysCtx = keysCv.getContext("2d");

    keysCv.addEventListener("pointerdown", onKeyDown);
    keysCv.addEventListener("pointermove", onKeyMove);
    keysCv.addEventListener("pointerup", onKeyUp);
    keysCv.addEventListener("pointercancel", onKeyUp);

    // pointer events, not touch events: one code path for a finger and for
    // a stylus, and it still works if somebody opens this on a tablet
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    // the sheet is a control surface, not the room: a drag across it must
    // not also walk you, and a long press must not offer to copy an image
    for (const ev of ["touchstart", "touchmove", "touchend", "contextmenu"])
      host.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }

  // where a pointer landed, in the panel's OWN canvas pixels
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
      px: ((e.clientX - r.left) / r.width) * open.size.w,
      py: ((e.clientY - r.top) / r.height) * open.size.h,
    };
  }
  // hit() speaks u,v like a raycast does, with v flipped
  const hitAt = (px, py) => open.mod.hit(px / open.size.w, 1 - py / open.size.h, ...(open.hitArgs || []));

  /* Capture the pointer so a drag that leaves the element keeps arriving —
     but NEVER let it throw. setPointerCapture rejects an id it doesn't
     consider active, and because it ran first, the exception took the whole
     handler down with it: the key never sounded and the knob never latched.
     A capture is an optimisation; the note is the point. */
  const capture = (el, id) => { try { el.setPointerCapture?.(id); } catch (e) {} };

  function onDown(e) {
    if (!open) return;
    capture(canvas, e.pointerId);
    const { px, py } = toCanvas(e);
    const h = hitAt(px, py);
    if (h && h.type === "knob") {
      drag = { key: h.key, start: open.mod.knobFrac(open.state(), h.key),
               x0: e.clientX, y0: e.clientY, moved: false };
    } else {
      drag = { tap: h, x0: e.clientX, y0: e.clientY, moved: false };
    }
  }

  function onMove(e) {
    if (!open || !drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    if (drag.key == null || !drag.moved) return;
    // right or up turns it clockwise, same sense as the desktop drag
    open.mod.knobWrite(open.state(), drag.key, drag.start + (dx - dy) / SWEEP_PX);
    open.apply();
    paint();
  }

  function onUp(e) {
    if (!open || !drag) return;
    const d = drag;
    drag = null;
    if (d.key != null) {
      if (d.moved) open.save();       // a real turn is one saved edit
      return;
    }
    // a tap that never became a drag works the button it started on
    if (!d.moved && d.tap) open.tap(d.tap);
    paint();
  }

  /* ---------- the keybed ---------- */

  const KW = 1024, KH = 260;      // its own canvas, drawn in its own pixels
  const keyIndexAt = (clientX) => {
    const n = keyCount(open);
    const r = keysCv.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * n);
    return Math.max(0, Math.min(n - 1, i));
  };

  function paintKeys() {
    if (!open || !open.keys) return;
    const n = keyCount(open), g = keysCtx, kw = KW / n;
    g.clearRect(0, 0, KW, KH);
    for (let i = 0; i < n; i++) {
      const x = i * kw, lit = i === keyDown;
      g.fillStyle = lit ? "#ffb347" : "#f2f2ef";
      g.fillRect(x + 2, 0, kw - 4, KH);
      // a shadow down the right edge, so a row of white blocks reads as keys
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(x + kw - 8, 0, 6, KH);
      const name = open.keys.label ? open.keys.label(i) : "";
      if (name) {
        g.fillStyle = lit ? "#6b3b00" : "#8d8d86";
        g.font = "34px ui-monospace, Menlo, monospace";
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
        g.fillText(name, x + kw / 2, KH - 22);
      }
    }
  }

  function onKeyDown(e) {
    if (!open || !open.keys) return;
    capture(keysCv, e.pointerId);
    keyDown = keyIndexAt(e.clientX);
    open.keys.press(keyDown);
    paintKeys();
  }
  function onKeyMove(e) {
    if (!open || !open.keys || keyDown < 0) return;
    // sliding along the keys plays them, the way a thumb across a keyboard does
    const i = keyIndexAt(e.clientX);
    if (i !== keyDown) { keyDown = i; open.keys.press(i); paintKeys(); }
  }
  function onKeyUp() {
    if (keyDown < 0) return;
    keyDown = -1;
    paintKeys();
  }

  function paint() {
    if (!open) return;
    open.mod.draw(ctx, open.state(), open.live ? open.live() : null);
    paintKeys();
  }

  return {
    /* spec: { mod, size, state(), apply(), save(), tap(hit), live?, hitArgs? }
       mod is the panel MODULE — draw/hit/knobFrac/knobWrite — so this file
       never learns what a Rings model or a Plaits engine is. */
    show(spec) {
      if (!host) build();
      open = spec;
      canvas.width = spec.size.w;
      canvas.height = spec.size.h;
      host.style.setProperty("--sheet-aspect", `${spec.size.w} / ${spec.size.h}`);
      keysCv.width = KW; keysCv.height = KH;
      host.classList.toggle("has-keys", !!spec.keys);
      host.classList.add("show");
      keyDown = -1;
      paint();
    },
    hide() {
      open = null; drag = null; keyDown = -1;
      host && host.classList.remove("show");
    },
    isOpen: () => !!open,
    // what the keybed is actually drawing, for the harness
    keyCount: () => (open ? keyCount(open) : 0),
    // the room changed something (an arp step, the wasm finishing) — repaint
    refresh: paint,
  };
}
